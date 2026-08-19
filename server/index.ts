import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EQUITY_CATALOG, FALLBACK_NEWS, type EquityProfile } from './catalog'
import { getDb, readProviderStatuses } from './db'
import { readEnvironment } from './env'
import {
  buildAllowedOrigins,
  corsOptions,
  mutationGuard,
  rejectUnknownOrigins,
  requireLoopbackHost,
} from './httpSecurity'
import { assets } from './providers'
import { API_SETTING_KEYS, apiSettingsStatus, clearApiSetting, saveApiSettings, type ApiSettingKey } from './settings'
import {
  createDecision,
  decisions,
  getSignal,
  importPortfolioCsv,
  listSignals,
  portfolioSummary,
  refreshSignals,
  saveImportedPortfolio,
} from './signals'

type Candle = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type Quote = {
  symbol: string
  name: string
  price: number
  open: number
  high: number
  low: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  marketTime: string
  source: 'yahoo-chart' | 'demo'
  delayed: boolean
}

type ScreenerRow = EquityProfile &
  Quote & {
    rsi: number
    sma20: number
    sma50: number
    macd: number
    performance1M: number
    performance3M: number
    performance52W: number
    score: number
    signal: 'High priority' | 'Watch' | 'Neutral' | 'High risk'
  }

const PORT = Number(readEnvironment('MARKET_RADAR_PORT', 'MERCADORADAR_PORT') ?? process.env.PORT ?? 8787)
const HOST = requireLoopbackHost(readEnvironment('MARKET_RADAR_HOST', 'MERCADORADAR_HOST'))
const LIVE_DATA = readEnvironment('MARKET_RADAR_LIVE', 'MERCADORADAR_LIVE') !== 'false'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 MarketRadar/1.0'

const app = express()
const allowedOrigins = buildAllowedOrigins(
  readEnvironment('MARKET_RADAR_ALLOWED_ORIGINS', 'MERCADORADAR_ALLOWED_ORIGINS'),
  PORT,
)
app.use(rejectUnknownOrigins(allowedOrigins))
app.use(cors(corsOptions(allowedOrigins)))
app.use(mutationGuard(allowedOrigins))
app.use(express.json({ limit: '1mb' }))

function round(value: number, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hashSymbol(symbol: string) {
  return symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
}

function seededWave(symbol: string, index: number) {
  const seed = hashSymbol(symbol)
  return (
    Math.sin((index + seed) * 0.19) * 0.012 +
    Math.cos((index + seed) * 0.047) * 0.008 +
    Math.sin((index + seed) * 0.73) * 0.006
  )
}

function previousWeekday(date: Date) {
  const next = new Date(date)
  do {
    next.setDate(next.getDate() - 1)
  } while (next.getDay() === 0 || next.getDay() === 6)
  return next
}

function generatedHistory(profile: EquityProfile, days = 260): Candle[] {
  const history: Candle[] = []
  let close = profile.seedPrice * (0.82 + (hashSymbol(profile.symbol) % 28) / 100)
  const cursor = previousWeekday(new Date())
  const trendBias =
    (profile.analystScore - 62) / 10000 + (profile.socialScore - 55) / 14000

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor)
    for (let skip = 0; skip < i; skip += 1) {
      d.setDate(d.getDate() - 1)
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
    }
    const wave = seededWave(profile.symbol, days - i)
    const dailyMove = wave + trendBias
    const open = close * (1 + seededWave(profile.symbol, days - i + 7) * 0.35)
    close = Math.max(1, close * (1 + dailyMove))
    const high = Math.max(open, close) * (1 + Math.abs(wave) * 0.9 + 0.004)
    const low = Math.min(open, close) * (1 - Math.abs(wave) * 0.9 - 0.004)
    const volumeBase =
      profile.kind === 'etf'
        ? 52000000
        : Math.max(1200000, profile.marketCap / 90000 / Math.max(profile.seedPrice, 1))
    const volume = Math.round(volumeBase * (1 + Math.abs(wave) * 16))
    history.push({
      date: d.toISOString().slice(0, 10),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    })
  }

  return history.sort((a, b) => a.date.localeCompare(b.date))
}

function calcSma(values: number[], period: number) {
  const slice = values.slice(-period)
  if (!slice.length) return 0
  return slice.reduce((sum, value) => sum + value, 0) / slice.length
}

function calcEma(values: number[], period: number) {
  if (!values.length) return 0
  const k = 2 / (period + 1)
  return values.reduce((ema, value, index) => (index === 0 ? value : value * k + ema * (1 - k)), values[0])
}

function calcRsi(values: number[], period = 14) {
  const slice = values.slice(-period - 1)
  if (slice.length < 2) return 50
  let gain = 0
  let loss = 0
  for (let i = 1; i < slice.length; i += 1) {
    const change = slice[i] - slice[i - 1]
    if (change >= 0) gain += change
    else loss += Math.abs(change)
  }
  if (loss === 0) return 100
  const rs = gain / period / (loss / period)
  return 100 - 100 / (1 + rs)
}

function calcPerformance(history: Candle[], days: number) {
  if (history.length < 2) return 0
  const last = history.at(-1)?.close ?? 0
  const start = history.at(Math.max(0, history.length - 1 - days))?.close ?? last
  return start ? ((last - start) / start) * 100 : 0
}

function buildFallbackQuote(profile: EquityProfile, history = generatedHistory(profile)) {
  const last = history.at(-1) ?? generatedHistory(profile, 2).at(-1)!
  const previous = history.at(-2)?.close ?? last.open
  return {
    symbol: profile.symbol,
    name: profile.name,
    price: round(last.close),
    open: round(last.open),
    high: round(last.high),
    low: round(last.low),
    previousClose: round(previous),
    change: round(last.close - previous),
    changePercent: round(previous ? ((last.close - previous) / previous) * 100 : 0),
    volume: last.volume,
    marketTime: last.date,
    source: 'demo' as const,
    delayed: true,
  }
}

async function fetchJson(url: string, timeoutMs = 6500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': USER_AGENT,
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchText(url: string, timeoutMs = 6500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml,text/xml,text/plain,*/*',
        'user-agent': USER_AGENT,
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
      meta?: Record<string, unknown>
    }>
  }
}

function parseYahooHistory(payload: unknown): { history: Candle[]; meta: Record<string, unknown> } {
  const result = (payload as YahooChartPayload).chart?.result?.[0]
  if (!result) throw new Error('Yahoo chart payload without result')
  const timestamps: number[] = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const history = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[index] ?? quote.close?.[index] ?? 0),
      high: Number(quote.high?.[index] ?? quote.close?.[index] ?? 0),
      low: Number(quote.low?.[index] ?? quote.close?.[index] ?? 0),
      close: Number(quote.close?.[index] ?? 0),
      volume: Number(quote.volume?.[index] ?? 0),
    }))
    .filter((item) => item.close > 0)
    .map((item) => ({
      ...item,
      open: round(item.open),
      high: round(item.high),
      low: round(item.low),
      close: round(item.close),
    }))

  if (!history.length) throw new Error('Yahoo chart history is empty')
  return { history, meta: result.meta ?? {} }
}

async function getHistory(profile: EquityProfile, range = '1y', interval = '1d') {
  if (LIVE_DATA) {
    try {
      const safeRange = encodeURIComponent(range)
      const safeInterval = encodeURIComponent(interval)
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        profile.symbol,
      )}?range=${safeRange}&interval=${safeInterval}&includePrePost=false&events=div%2Csplit`
      const payload = await fetchJson(url)
      const parsed = parseYahooHistory(payload)
      return { ...parsed, source: 'yahoo-chart' as const }
    } catch {
      const history = generatedHistory(profile)
      return { history, meta: {}, source: 'demo' as const }
    }
  }

  const history = generatedHistory(profile)
  return { history, meta: {}, source: 'demo' as const }
}

async function getQuote(profile: EquityProfile): Promise<Quote> {
  const { history, meta, source } = await getHistory(profile, '1mo', '1d')
  if (source === 'demo') return buildFallbackQuote(profile, history)
  const last = history.at(-1) ?? generatedHistory(profile, 1)[0]
  const previousClose = Number(meta.chartPreviousClose ?? history.at(-2)?.close ?? last.open)
  const price = Number(meta.regularMarketPrice ?? last.close)
  const high = Number(meta.regularMarketDayHigh ?? last.high)
  const low = Number(meta.regularMarketDayLow ?? last.low)
  const open = Number(meta.regularMarketOpen ?? last.open)
  return {
    symbol: profile.symbol,
    name: String(meta.longName ?? profile.name),
    price: round(price),
    open: round(open),
    high: round(high),
    low: round(low),
    previousClose: round(previousClose),
    change: round(price - previousClose),
    changePercent: round(previousClose ? ((price - previousClose) / previousClose) * 100 : 0),
    volume: Number(meta.regularMarketVolume ?? last.volume),
    marketTime: meta.regularMarketTime
      ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
      : last.date,
    source: 'yahoo-chart',
    delayed: true,
  }
}

function scoreRow(profile: EquityProfile, quote: Quote, history: Candle[]): ScreenerRow {
  const closes = history.map((item) => item.close)
  const rsi = calcRsi(closes)
  const sma20 = calcSma(closes, 20)
  const sma50 = calcSma(closes, 50)
  const macd = calcEma(closes, 12) - calcEma(closes, 26)
  const performance1M = calcPerformance(history, 21)
  const performance3M = calcPerformance(history, 63)
  const performance52W = calcPerformance(history, 252)
  const technical =
    (quote.price > sma20 ? 10 : -4) +
    (quote.price > sma50 ? 10 : -5) +
    (rsi >= 45 && rsi <= 68 ? 10 : rsi > 78 ? -8 : 0) +
    clamp(performance1M, -12, 18)
  const fundamentals =
    (profile.pe && profile.pe > 0 && profile.pe < 35 ? 10 : profile.pe && profile.pe > 70 ? -8 : 2) +
    (profile.roe && profile.roe > 0.18 ? 10 : profile.roe && profile.roe < 0 ? -8 : 2) +
    (profile.debtEquity !== null && profile.debtEquity < 0.8 ? 6 : 0)
  const sentiment = (profile.analystScore - 50) * 0.32 + (profile.socialScore - 50) * 0.18
  const riskPenalty = profile.beta > 1.7 ? 8 : profile.beta > 1.3 ? 4 : 0
  const score = round(clamp(50 + technical + fundamentals + sentiment - riskPenalty, 1, 99), 0)
  const signal =
    score >= 74
      ? 'High priority'
      : score >= 62
        ? 'Watch'
        : score <= 42
          ? 'High risk'
          : 'Neutral'

  return {
    ...profile,
    ...quote,
    rsi: round(rsi, 1),
    sma20: round(sma20),
    sma50: round(sma50),
    macd: round(macd, 2),
    performance1M: round(performance1M, 2),
    performance3M: round(performance3M, 2),
    performance52W: round(performance52W, 2),
    score,
    signal,
  }
}

async function buildRow(profile: EquityProfile): Promise<ScreenerRow> {
  const [quote, historyResult] = await Promise.all([getQuote(profile), getHistory(profile)])
  return scoreRow(profile, quote, historyResult.history)
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function marketStatus() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})
  const weekday = parts.weekday
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  const minutes = hour * 60 + minute
  const open = !['Sat', 'Sun'].includes(weekday) && minutes >= 570 && minutes < 960
  return {
    open,
    label: open ? 'Market open' : 'Market closed',
    timezone: 'America/New_York',
  }
}

function stripTags(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function readTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? stripTags(match[1]) : ''
}

function parseRss(xml: string, symbol?: string) {
  const items = [...xml.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/gi)]
  return items.slice(0, 18).map((match, index) => ({
    id: `${symbol ?? 'markets'}-${index}-${readTag(match[1], 'pubDate')}`,
    title: readTag(match[1], 'title'),
    source: 'Nasdaq',
    symbol: symbol ?? inferSymbol(readTag(match[1], 'title')),
    summary: readTag(match[1], 'description'),
    url: readTag(match[1], 'link'),
    category: symbol ? 'Ticker' : 'Markets',
    publishedAt: readTag(match[1], 'pubDate'),
  }))
}

function inferSymbol(title: string) {
  const known = EQUITY_CATALOG.find((profile) => title.toUpperCase().includes(profile.symbol))
  return known?.symbol ?? 'MARKET'
}

async function getNews(symbol?: string) {
  if (LIVE_DATA) {
    try {
      const url = symbol
        ? `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(symbol)}`
        : 'https://www.nasdaq.com/feed/rssoutbound?category=Markets'
      const xml = await fetchText(url)
      const parsed = parseRss(xml, symbol)
      if (parsed.length) return { items: parsed, source: 'nasdaq-rss' }
    } catch {
      // Fall through to local news seeds.
    }
  }

  const items = FALLBACK_NEWS.map((item, index) => ({
    ...item,
    id: `demo-${index}`,
    publishedAt: new Date(Date.now() - index * 32 * 60 * 1000).toISOString(),
  })).filter((item) => !symbol || item.symbol === symbol)

  return {
    items: items.length ? items : FALLBACK_NEWS.map((item, index) => ({
      ...item,
      id: `demo-any-${index}`,
      publishedAt: new Date(Date.now() - index * 28 * 60 * 1000).toISOString(),
    })),
    source: 'demo',
  }
}

function breadth(rows: ScreenerRow[]) {
  const advancers = rows.filter((row) => row.changePercent >= 0).length
  const decliners = rows.length - advancers
  const buckets = [-10, -5, -3, 0, 3, 5, 10].map((limit) => ({
    limit,
    count: rows.filter((row) =>
      limit < 0
        ? row.changePercent <= limit && row.changePercent > limit - 4
        : row.changePercent >= limit && row.changePercent < limit + 3,
    ).length,
  }))
  return { advancers, decliners, buckets }
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, name: 'Market Radar', liveData: LIVE_DATA, status: marketStatus() })
})

app.get('/api/snapshot', async (_request, response) => {
  const rows = await mapLimit(EQUITY_CATALOG, 4, buildRow)
  const news = await getNews()
  const sortedIdeas = [...rows]
    .filter((row) => row.kind === 'stock')
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  response.json({
    generatedAt: new Date().toISOString(),
    marketStatus: marketStatus(),
    rows,
    ideas: sortedIdeas,
    news: news.items,
    newsSource: news.source,
    breadth: breadth(rows),
  })
})

app.get('/api/history/:symbol', async (request, response) => {
  const symbol = request.params.symbol.toUpperCase()
  const profile = EQUITY_CATALOG.find((item) => item.symbol === symbol)
  if (!profile) {
    response.status(404).json({ error: `${symbol} was not found` })
    return
  }
  const range = String(request.query.range ?? '1y')
  const interval = String(request.query.interval ?? '1d')
  const result = await getHistory(profile, range, interval)
  response.json({
    symbol,
    source: result.source,
    history: result.history,
  })
})

app.get('/api/news', async (request, response) => {
  const symbol = typeof request.query.symbol === 'string' ? request.query.symbol.toUpperCase() : undefined
  const news = await getNews(symbol)
  response.json(news)
})

app.get('/api/assets', (_request, response) => {
  response.json({ items: assets() })
})

app.get('/api/data-health', (_request, response) => {
  response.json({
    generatedAt: new Date().toISOString(),
    providers: readProviderStatuses(),
  })
})

app.get('/api/settings/apis', (_request, response) => {
  response.json(apiSettingsStatus())
})

app.post('/api/settings/apis', (request, response) => {
  const body = request.body as Partial<Record<ApiSettingKey, string>>
  response.json(saveApiSettings(body))
})

app.delete('/api/settings/apis/:key', (request, response) => {
  const key = request.params.key as ApiSettingKey
  if (!API_SETTING_KEYS.includes(key)) {
    response.status(400).json({ error: 'Unsupported setting' })
    return
  }
  response.json(clearApiSetting(key))
})

app.get('/api/signals', async (_request, response) => {
  try {
    response.json({ generatedAt: new Date().toISOString(), items: await listSignals() })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Signals could not be loaded' })
  }
})

app.get('/api/signals/:symbol', async (request, response) => {
  try {
    const includeNarrative = request.query.narrative === 'true'
    const signal = await getSignal(request.params.symbol, includeNarrative)
    if (!signal) {
      response.status(404).json({ error: `${request.params.symbol} was not found` })
      return
    }
    response.json(signal)
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'The signal could not be loaded' })
  }
})

app.post('/api/signals/refresh', async (_request, response) => {
  try {
    response.json({ generatedAt: new Date().toISOString(), items: await refreshSignals() })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Signals could not be refreshed' })
  }
})

app.get('/api/portfolio', (_request, response) => {
  response.json(portfolioSummary())
})

app.post('/api/portfolio/import', (request, response) => {
  try {
    const csv = typeof request.body?.csv === 'string' ? request.body.csv : ''
    const positions = importPortfolioCsv(csv)
    response.json(saveImportedPortfolio(positions))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV' })
  }
})

app.get('/api/decisions', (request, response) => {
  const symbol = typeof request.query.symbol === 'string' ? request.query.symbol.toUpperCase() : undefined
  response.json({ items: decisions(symbol) })
})

app.post('/api/decisions', (request, response) => {
  try {
    const body = request.body as {
      symbol?: string
      userDecision?: 'accepted' | 'rejected' | 'watch'
      note?: string
      thesis?: string
      invalidation?: string
      reviewDate?: string
    }
    if (!body.symbol || !body.userDecision) {
      response.status(400).json({ error: 'symbol and userDecision are required' })
      return
    }
    response.json(createDecision({
      symbol: body.symbol,
      userDecision: body.userDecision,
      note: body.note,
      thesis: body.thesis,
      invalidation: body.invalidation,
      reviewDate: body.reviewDate,
    }))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'The decision could not be saved' })
  }
})

const dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'))
  })
}

getDb()
app.listen(PORT, HOST, () => {
  console.log(`Market Radar is ready at http://${HOST}:${PORT}`)
})
