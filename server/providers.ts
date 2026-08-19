import { EQUITY_CATALOG, type AssetCurrency, type AssetMarket, type EquityProfile } from './catalog'
import { readBars, upsertBars, writeProviderStatus } from './db'
import type { AssetProfile, DataProvider, DataSourceKind, MarketHistory, OhlcvBar } from './domain'
import { configuredValue } from './settings'

const USER_AGENT =
  process.env.MERCADORADAR_USER_AGENT ??
  'MercadoRadar/1.0 personal-research contact=local'

function round(value: number, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0
}

function marketFor(profile: EquityProfile): AssetMarket {
  return profile.market ?? (profile.exchange === 'BMV' ? 'BMV' : 'US')
}

function currencyFor(profile: EquityProfile): AssetCurrency {
  return profile.currency ?? (marketFor(profile) === 'BMV' ? 'MXN' : 'USD')
}

export function normalizeAsset(profile: EquityProfile): AssetProfile {
  return {
    ...profile,
    market: marketFor(profile),
    currency: currencyFor(profile),
  }
}

export function assets() {
  return EQUITY_CATALOG.map(normalizeAsset)
}

function providerSymbol(profile: EquityProfile, provider: Exclude<DataProvider, 'demo' | 'yahoo-chart'> | 'yahoo') {
  const mapped = profile.providerSymbols?.[provider]
  if (mapped) return mapped
  if (provider === 'stooq') return marketFor(profile) === 'US' ? `${profile.symbol.toLowerCase()}.us` : `${profile.symbol.toLowerCase()}.mx`
  return profile.symbol
}

function sourceKind(provider: DataProvider): DataSourceKind {
  if (provider === 'polygon' || provider === 'twelvedata') return 'paid'
  if (provider === 'alphavantage' || provider === 'stooq') return 'free'
  return 'fallback'
}

async function fetchJson(url: string, timeoutMs = 9000) {
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

async function fetchText(url: string, timeoutMs = 9000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
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

function recordProviderSuccess(provider: DataProvider, market: AssetMarket) {
  writeProviderStatus({
    provider,
    market,
    ok: true,
    sourceKind: sourceKind(provider),
    lastSuccessAt: new Date().toISOString(),
    lastErrorAt: null,
    lastError: null,
  })
}

function recordProviderFailure(provider: DataProvider, market: AssetMarket, error: unknown) {
  writeProviderStatus({
    provider,
    market,
    ok: false,
    sourceKind: sourceKind(provider),
    lastSuccessAt: null,
    lastErrorAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
  })
}

function sortBars(bars: OhlcvBar[]) {
  return bars
    .filter((bar) => bar.close > 0 && bar.high >= bar.low)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function assessFreshness(bars: OhlcvBar[]) {
  if (bars.length < 120) return 'insufficient' as const
  const last = bars.at(-1)
  if (!last) return 'insufficient' as const
  const ageMs = Date.now() - new Date(`${last.date}T21:00:00Z`).getTime()
  const ageDays = ageMs / 86400000
  return ageDays <= 5 ? ('fresh' as const) : ('stale' as const)
}

function isDecisionGrade(provider: DataProvider, bars: OhlcvBar[]) {
  return provider !== 'demo' && provider !== 'yahoo-chart' && assessFreshness(bars) === 'fresh'
}

function makeHistory(symbol: string, provider: DataProvider, bars: OhlcvBar[], warning?: string): MarketHistory {
  const sorted = sortBars(bars)
  const freshness = assessFreshness(sorted)
  return {
    symbol,
    provider,
    sourceKind: sourceKind(provider),
    bars: sorted,
    freshness,
    decisionGrade: isDecisionGrade(provider, sorted),
    fetchedAt: new Date().toISOString(),
    warning,
  }
}

async function fetchPolygonHistory(profile: EquityProfile) {
  const apiKey = configuredValue('POLYGON_API_KEY')
  if (!apiKey) throw new Error('POLYGON_API_KEY no configurada')
  const symbol = providerSymbol(profile, 'polygon')
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 3)
  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${start.toISOString().slice(0, 10)}/${end
      .toISOString()
      .slice(0, 10)}`,
  )
  url.searchParams.set('adjusted', 'true')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('limit', '5000')
  url.searchParams.set('apiKey', apiKey)
  const payload = (await fetchJson(url.toString())) as {
    results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>
  }
  const bars = (payload.results ?? []).map((item) => ({
    date: new Date(item.t).toISOString().slice(0, 10),
    open: round(item.o),
    high: round(item.h),
    low: round(item.l),
    close: round(item.c),
    volume: Math.round(item.v ?? 0),
  }))
  if (!bars.length) throw new Error('Polygon sin barras')
  return bars
}

async function fetchTwelveDataHistory(profile: EquityProfile) {
  const apiKey = configuredValue('TWELVEDATA_API_KEY')
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY no configurada')
  const url = new URL('https://api.twelvedata.com/time_series')
  url.searchParams.set('symbol', providerSymbol(profile, 'twelvedata'))
  url.searchParams.set('interval', '1day')
  url.searchParams.set('outputsize', '750')
  url.searchParams.set('apikey', apiKey)
  if (marketFor(profile) === 'BMV') url.searchParams.set('exchange', 'BMV')
  const payload = (await fetchJson(url.toString())) as {
    status?: string
    message?: string
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>
  }
  if (payload.status === 'error') throw new Error(payload.message ?? 'Twelve Data error')
  const bars = (payload.values ?? []).map((item) => ({
    date: item.datetime.slice(0, 10),
    open: round(Number(item.open)),
    high: round(Number(item.high)),
    low: round(Number(item.low)),
    close: round(Number(item.close)),
    volume: Math.round(Number(item.volume ?? 0)),
  }))
  if (!bars.length) throw new Error('Twelve Data sin barras')
  return bars
}

async function fetchAlphaVantageHistory(profile: EquityProfile) {
  const apiKey = configuredValue('ALPHAVANTAGE_API_KEY')
  if (!apiKey) throw new Error('ALPHAVANTAGE_API_KEY no configurada')
  const url = new URL('https://www.alphavantage.co/query')
  url.searchParams.set('function', 'TIME_SERIES_DAILY')
  url.searchParams.set('symbol', providerSymbol(profile, 'alphavantage'))
  url.searchParams.set('outputsize', 'full')
  url.searchParams.set('apikey', apiKey)
  const payload = (await fetchJson(url.toString())) as Record<string, unknown>
  if (payload['Error Message'] || payload.Note || payload.Information) {
    throw new Error(String(payload['Error Message'] ?? payload.Note ?? payload.Information))
  }
  const series = payload['Time Series (Daily)'] as Record<
    string,
    { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string }
  >
  const bars = Object.entries(series ?? {}).map(([date, item]) => ({
    date,
    open: round(Number(item['1. open'])),
    high: round(Number(item['2. high'])),
    low: round(Number(item['3. low'])),
    close: round(Number(item['4. close'])),
    volume: Math.round(Number(item['5. volume'] ?? 0)),
  }))
  if (!bars.length) throw new Error('Alpha Vantage sin barras')
  return bars
}

function parseCsvRows(csv: string) {
  const lines = csv.trim().split(/\r?\n/)
  const header = lines.shift()?.toLowerCase().split(',') ?? []
  const dateIndex = header.indexOf('date')
  const openIndex = header.indexOf('open')
  const highIndex = header.indexOf('high')
  const lowIndex = header.indexOf('low')
  const closeIndex = header.indexOf('close')
  const volumeIndex = header.indexOf('volume')
  if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) return []
  return lines.map((line) => {
    const parts = line.split(',')
    return {
      date: parts[dateIndex],
      open: round(Number(parts[openIndex])),
      high: round(Number(parts[highIndex])),
      low: round(Number(parts[lowIndex])),
      close: round(Number(parts[closeIndex])),
      volume: Math.round(Number(parts[volumeIndex] ?? 0)),
    }
  })
}

async function fetchStooqHistory(profile: EquityProfile) {
  const symbol = providerSymbol(profile, 'stooq')
  const url = new URL('https://stooq.com/q/d/l/')
  url.searchParams.set('s', symbol)
  url.searchParams.set('i', 'd')
  const csv = await fetchText(url.toString())
  const bars = parseCsvRows(csv)
  if (!bars.length) throw new Error('Stooq sin barras')
  return bars
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
    }>
  }
}

async function fetchYahooHistory(profile: EquityProfile) {
  const symbol = profile.providerSymbols?.yahoo ?? profile.symbol
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=2y&interval=1d&includePrePost=false&events=div%2Csplit`
  const payload = (await fetchJson(url)) as YahooChartPayload
  const result = payload.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const bars = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    open: round(Number(quote?.open?.[index] ?? quote?.close?.[index] ?? 0)),
    high: round(Number(quote?.high?.[index] ?? quote?.close?.[index] ?? 0)),
    low: round(Number(quote?.low?.[index] ?? quote?.close?.[index] ?? 0)),
    close: round(Number(quote?.close?.[index] ?? 0)),
    volume: Math.round(Number(quote?.volume?.[index] ?? 0)),
  }))
  if (!bars.length) throw new Error('Yahoo sin barras')
  return bars
}

function hashSymbol(symbol: string) {
  return symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function generatedHistory(profile: EquityProfile, days = 520) {
  const bars: OhlcvBar[] = []
  let close = profile.seedPrice * (0.88 + (hashSymbol(profile.symbol) % 19) / 100)
  const cursor = new Date()
  while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor.setDate(cursor.getDate() - 1)
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(cursor)
    for (let skip = 0; skip < index; skip += 1) {
      date.setDate(date.getDate() - 1)
      while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() - 1)
    }
    const wave =
      Math.sin((days - index + hashSymbol(profile.symbol)) * 0.13) * 0.012 +
      Math.cos((days - index) * 0.041) * 0.007
    const open = close * (1 + wave * 0.3)
    close = Math.max(1, close * (1 + wave + (profile.analystScore - 60) / 12000))
    bars.push({
      date: date.toISOString().slice(0, 10),
      open: round(open),
      high: round(Math.max(open, close) * 1.011),
      low: round(Math.min(open, close) * 0.989),
      close: round(close),
      volume: Math.round(Math.max(1000000, profile.marketCap / Math.max(profile.seedPrice, 1) / 150000)),
    })
  }
  return bars
}

function providerOrder(profile: EquityProfile): DataProvider[] {
  if (marketFor(profile) === 'BMV') {
    return ['twelvedata', 'alphavantage', 'stooq', 'yahoo-chart', 'demo']
  }
  return ['polygon', 'alphavantage', 'stooq', 'yahoo-chart', 'demo']
}

async function fetchProviderHistory(profile: EquityProfile, provider: DataProvider) {
  if (provider === 'polygon') return fetchPolygonHistory(profile)
  if (provider === 'twelvedata') return fetchTwelveDataHistory(profile)
  if (provider === 'alphavantage') return fetchAlphaVantageHistory(profile)
  if (provider === 'stooq') return fetchStooqHistory(profile)
  if (provider === 'yahoo-chart') return fetchYahooHistory(profile)
  return generatedHistory(profile)
}

export async function getMarketHistory(profile: EquityProfile, options: { useCache?: boolean } = {}) {
  const normalized = normalizeAsset(profile)
  const cachedProviders = providerOrder(profile).filter((provider) => provider !== 'demo')
  if (options.useCache !== false) {
    for (const provider of cachedProviders) {
      const cached = readBars(profile.symbol, provider, 520)
      if (cached.length >= 120 && assessFreshness(cached) !== 'stale') {
        return makeHistory(profile.symbol, provider, cached)
      }
    }
  }

  const errors: string[] = []
  for (const provider of providerOrder(profile)) {
    try {
      const bars = sortBars(await fetchProviderHistory(profile, provider))
      if (provider !== 'demo') upsertBars(profile.symbol, provider, bars)
      recordProviderSuccess(provider, normalized.market)
      return makeHistory(
        profile.symbol,
        provider,
        bars,
        provider === 'yahoo-chart' || provider === 'demo'
          ? 'Fuente fallback; no debe usarse como unica base de Buy/Hold/Sell.'
          : undefined,
      )
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
      recordProviderFailure(provider, normalized.market, error)
    }
  }

  return makeHistory(profile.symbol, 'demo', generatedHistory(profile), errors.join(' | '))
}

export function latestCachedPrices() {
  const prices = new Map<string, number>()
  for (const asset of assets()) {
    for (const provider of providerOrder(asset)) {
      const bars = readBars(asset.symbol, provider, 1)
      const last = bars.at(-1)
      if (last) {
        prices.set(asset.symbol, last.close)
        break
      }
    }
  }
  return prices
}
