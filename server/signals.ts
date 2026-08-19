import { randomUUID } from 'node:crypto'
import { EQUITY_CATALOG, type EquityProfile } from './catalog'
import {
  readDecisions,
  readPortfolioPositions,
  readSignal,
  readSignals,
  replacePortfolioPositions,
  saveDecision,
  summarizePortfolio,
  upsertSignal,
} from './db'
import { getMarketHistory, latestCachedPrices, normalizeAsset } from './providers'
import { configuredValue } from './settings'
import type {
  BacktestSummary,
  DecisionJournalEntry,
  JournalDecision,
  MarketHistory,
  OhlcvBar,
  PortfolioPosition,
  PortfolioSummary,
  SignalAction,
  SignalEvidence,
  SignalNarrative,
  SignalRisk,
  SignalRun,
} from './domain'

const MODEL_VERSION = 'aggressive-rules-ml-v1.0.0'
const SIGNAL_TTL_MS = 60 * 60 * 1000

function round(value: number, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function calcSma(values: number[], period: number) {
  const slice = values.slice(-period)
  return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0
}

function calcRsi(values: number[], period = 14) {
  const slice = values.slice(-period - 1)
  if (slice.length < 2) return 50
  let gain = 0
  let loss = 0
  for (let index = 1; index < slice.length; index += 1) {
    const change = slice[index] - slice[index - 1]
    if (change >= 0) gain += change
    else loss += Math.abs(change)
  }
  if (loss === 0) return 100
  const rs = gain / period / (loss / period)
  return 100 - 100 / (1 + rs)
}

function performance(values: number[], days: number) {
  if (values.length < 2) return 0
  const last = values.at(-1) ?? 0
  const start = values.at(Math.max(0, values.length - 1 - days)) ?? last
  return start ? ((last - start) / start) * 100 : 0
}

function volatility(values: number[], days = 63) {
  const slice = values.slice(-days - 1)
  if (slice.length < 3) return 0
  const returns = slice.slice(1).map((value, index) => (slice[index] ? (value - slice[index]) / slice[index] : 0))
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
  return Math.sqrt(variance) * Math.sqrt(252) * 100
}

function latestQuote(history: OhlcvBar[]) {
  const last = history.at(-1)
  const previous = history.at(-2)
  return {
    price: last?.close ?? 0,
    previousClose: previous?.close ?? last?.open ?? 0,
    changePercent: previous?.close ? ((last!.close - previous.close) / previous.close) * 100 : 0,
    volume: last?.volume ?? 0,
    marketTime: last?.date ?? new Date().toISOString().slice(0, 10),
  }
}

function actionFromScore(score: number, decisionGrade: boolean): SignalAction {
  if (!decisionGrade) return 'No Signal'
  if (score >= 64) return 'Buy'
  if (score <= 36) return 'Sell'
  return 'Hold'
}

function tone(contribution: number): SignalEvidence['tone'] {
  if (contribution > 1) return 'positive'
  if (contribution < -1) return 'negative'
  return 'neutral'
}

function ruleContribution(label: string, value: string, contribution: number): SignalEvidence {
  return {
    label,
    value,
    contribution: round(contribution, 1),
    tone: tone(contribution),
  }
}

function mlScoreFromFeatures(features: {
  performance1M: number
  performance3M: number
  performance52W: number
  drawdown52W: number
  volatility63D: number
  trend: number
  rsi: number
}) {
  const z =
    features.performance1M * 0.055 +
    features.performance3M * 0.028 +
    features.performance52W * 0.01 +
    features.trend * 0.32 -
    Math.abs(features.drawdown52W) * 0.018 -
    features.volatility63D * 0.012 -
    Math.max(0, features.rsi - 78) * 0.04
  return clamp(100 / (1 + Math.exp(-z / 2.5)), 1, 99)
}

function scoreWindow(profile: EquityProfile, bars: OhlcvBar[]) {
  const closes = bars.map((bar) => bar.close)
  const price = closes.at(-1) ?? 0
  const sma20 = calcSma(closes, 20)
  const sma50 = calcSma(closes, 50)
  const sma200 = calcSma(closes, 200)
  const rsi = calcRsi(closes)
  const performance1M = performance(closes, 21)
  const performance3M = performance(closes, 63)
  const performance52W = performance(closes, 252)
  const high52W = Math.max(...closes.slice(-252), price)
  const drawdown52W = high52W ? ((price - high52W) / high52W) * 100 : 0
  const volatility63D = volatility(closes, 63)
  const trend = (price > sma20 ? 1 : -1) + (price > sma50 ? 1 : -1) + (price > sma200 ? 1 : -1)
  const evidence = [
    ruleContribution('Momentum 1M', `${round(performance1M, 1)}%`, clamp(performance1M * 1.1, -15, 20)),
    ruleContribution('Momentum 3M', `${round(performance3M, 1)}%`, clamp(performance3M * 0.42, -12, 20)),
    ruleContribution('Tendencia SMA50/200', price > sma50 && price > sma200 ? 'arriba' : 'mixta/debil', trend * 4),
    ruleContribution('RSI', `${round(rsi, 1)}`, rsi >= 45 && rsi <= 72 ? 8 : rsi > 82 ? -10 : rsi < 35 ? -4 : 2),
    ruleContribution('Drawdown 52W', `${round(drawdown52W, 1)}%`, drawdown52W > -10 ? 8 : drawdown52W < -25 ? -12 : -2),
    ruleContribution('Beta agresiva', `${round(profile.beta, 2)}`, profile.beta > 2.2 ? -5 : profile.beta > 1.6 ? -2 : 2),
    ruleContribution('Fundamentales', profile.pe ? `P/E ${round(profile.pe, 1)}` : 'sin P/E', profile.pe && profile.pe < 45 ? 5 : profile.pe && profile.pe > 90 ? -8 : 0),
    ruleContribution('ROE/deuda', `ROE ${profile.roe ? round(profile.roe * 100, 1) : 0}%`, (profile.roe && profile.roe > 0.15 ? 5 : profile.roe && profile.roe < 0 ? -8 : 0) + (profile.debtEquity !== null && profile.debtEquity < 1 ? 3 : 0)),
  ]
  const ruleScore = clamp(50 + evidence.reduce((sum, item) => sum + item.contribution, 0), 1, 99)
  const mlScore = mlScoreFromFeatures({
    performance1M,
    performance3M,
    performance52W,
    drawdown52W,
    volatility63D,
    trend,
    rsi,
  })
  const combinedScore = clamp(ruleScore * 0.7 + mlScore * 0.3, 1, 99)
  return {
    price,
    sma20,
    sma50,
    sma200,
    rsi,
    performance1M,
    performance3M,
    performance52W,
    drawdown52W,
    volatility63D,
    ruleScore,
    mlScore,
    combinedScore,
    evidence,
  }
}

function backtest(profile: EquityProfile, bars: OhlcvBar[]): BacktestSummary {
  const benchmark = performance(bars.map((bar) => bar.close), 252)
  let sampleSize = 0
  let hits = 0
  let forwardReturnSum = 0
  for (let index = 210; index < bars.length - 21; index += 21) {
    const window = bars.slice(0, index)
    const score = scoreWindow(profile, window).combinedScore
    const entry = bars[index].close
    const exit = bars[index + 21].close
    const forwardReturn = entry ? ((exit - entry) / entry) * 100 : 0
    if (score >= 60) {
      sampleSize += 1
      forwardReturnSum += forwardReturn
      if (forwardReturn > 2) hits += 1
    }
  }
  return {
    sampleSize,
    hitRate: sampleSize ? round((hits / sampleSize) * 100, 1) : 0,
    averageForwardReturn: sampleSize ? round(forwardReturnSum / sampleSize, 2) : 0,
    benchmarkReturn: round(benchmark, 2),
  }
}

function risks(profile: EquityProfile, score: ReturnType<typeof scoreWindow>, positions: PortfolioPosition[]): SignalRisk[] {
  const currentPosition = positions.find((position) => position.symbol === profile.symbol)
  const items: SignalRisk[] = [
    {
      label: 'Volatilidad 63D',
      value: `${round(score.volatility63D, 1)}% anualizada`,
      severity: score.volatility63D > 45 ? 'high' : score.volatility63D > 28 ? 'medium' : 'low',
    },
    {
      label: 'Drawdown',
      value: `${round(score.drawdown52W, 1)}% vs max 52W`,
      severity: score.drawdown52W < -30 ? 'high' : score.drawdown52W < -15 ? 'medium' : 'low',
    },
    {
      label: 'Beta',
      value: `${round(profile.beta, 2)}`,
      severity: profile.beta > 1.8 ? 'high' : profile.beta > 1.2 ? 'medium' : 'low',
    },
  ]
  if (currentPosition) {
    items.push({
      label: 'Exposicion existente',
      value: `${round(currentPosition.qty, 2)} acciones en cartera`,
      severity: 'medium',
    })
  }
  return items
}

function unavailableSignal(profile: EquityProfile, history: MarketHistory, reason: string): SignalRun {
  const asset = normalizeAsset(profile)
  const quote = latestQuote(history.bars)
  return {
    symbol: profile.symbol,
    action: 'No Signal',
    score: 0,
    confidence: 0,
    ruleScore: 0,
    mlScore: 0,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    dataProvider: history.provider,
    sourceKind: history.sourceKind,
    dataFreshness: history.freshness,
    decisionGrade: false,
    reasonUnavailable: reason,
    asset: {
      name: asset.name,
      market: asset.market,
      exchange: asset.exchange,
      currency: asset.currency,
      sector: asset.sector,
      industry: asset.industry,
    },
    quote: {
      ...quote,
      price: round(quote.price),
      previousClose: round(quote.previousClose),
      changePercent: round(quote.changePercent),
    },
    metrics: {
      rsi: 0,
      sma20: 0,
      sma50: 0,
      sma200: 0,
      performance1M: 0,
      performance3M: 0,
      performance52W: 0,
      drawdown52W: 0,
      volatility63D: 0,
    },
    evidence: [],
    risks: [{ label: 'Calidad de datos', value: reason, severity: 'high' }],
    backtest: { sampleSize: 0, hitRate: 0, averageForwardReturn: 0, benchmarkReturn: 0 },
  }
}

export function buildSignalFromHistory(profile: EquityProfile, history: MarketHistory, positions: PortfolioPosition[] = []): SignalRun {
  if (!history.decisionGrade) {
    return unavailableSignal(
      profile,
      history,
      history.warning ?? `Datos ${history.sourceKind}/${history.provider} no cumplen calidad para decision real.`,
    )
  }
  const asset = normalizeAsset(profile)
  const scored = scoreWindow(profile, history.bars)
  const quote = latestQuote(history.bars)
  const tested = backtest(profile, history.bars)
  const confidence =
    history.decisionGrade && tested.sampleSize >= 8
      ? clamp(52 + tested.hitRate * 0.28 + Math.min(12, tested.sampleSize), 1, 95)
      : 35
  const action = actionFromScore(scored.combinedScore, history.decisionGrade)
  return {
    symbol: profile.symbol,
    action,
    score: round(scored.combinedScore, 0),
    confidence: round(confidence, 0),
    ruleScore: round(scored.ruleScore, 0),
    mlScore: round(scored.mlScore, 0),
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    dataProvider: history.provider,
    sourceKind: history.sourceKind,
    dataFreshness: history.freshness,
    decisionGrade: history.decisionGrade,
    asset: {
      name: asset.name,
      market: asset.market,
      exchange: asset.exchange,
      currency: asset.currency,
      sector: asset.sector,
      industry: asset.industry,
    },
    quote: {
      price: round(quote.price),
      previousClose: round(quote.previousClose),
      changePercent: round(quote.changePercent),
      volume: quote.volume,
      marketTime: quote.marketTime,
    },
    metrics: {
      rsi: round(scored.rsi, 1),
      sma20: round(scored.sma20),
      sma50: round(scored.sma50),
      sma200: round(scored.sma200),
      performance1M: round(scored.performance1M, 2),
      performance3M: round(scored.performance3M, 2),
      performance52W: round(scored.performance52W, 2),
      drawdown52W: round(scored.drawdown52W, 2),
      volatility63D: round(scored.volatility63D, 2),
    },
    evidence: scored.evidence,
    risks: risks(profile, scored, positions),
    backtest: tested,
  }
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

export async function refreshSignals() {
  const positions = readPortfolioPositions()
  const signals = await mapLimit(EQUITY_CATALOG, 4, async (profile) => {
    const history = await getMarketHistory(profile, { useCache: false })
    const signal = buildSignalFromHistory(profile, history, positions)
    upsertSignal(signal)
    return signal
  })
  return signals
}

function stale(signal: SignalRun) {
  return Date.now() - new Date(signal.generatedAt).getTime() > SIGNAL_TTL_MS
}

export async function listSignals() {
  const existing = readSignals()
  if (!existing.length || existing.some(stale)) return refreshSignals()
  return existing
}

function localNarrative(signal: SignalRun): SignalNarrative {
  return {
    provider: 'local',
    generatedAt: new Date().toISOString(),
    summary:
      signal.action === 'No Signal'
        ? `No hay señal accionable para ${signal.symbol} porque la calidad de datos no es suficiente.`
        : `${signal.symbol} queda en ${signal.action} con score ${signal.score}/100 y confianza ${signal.confidence}/100.`,
    bullCase: signal.evidence.filter((item) => item.tone === 'positive').slice(0, 3).map((item) => `${item.label}: ${item.value}`),
    bearCase: signal.evidence.filter((item) => item.tone === 'negative').slice(0, 3).map((item) => `${item.label}: ${item.value}`),
    watchItems: signal.risks.map((item) => `${item.label}: ${item.value}`),
  }
}

async function deepSeekNarrative(signal: SignalRun): Promise<SignalNarrative> {
  const apiKey = configuredValue('DEEPSEEK_API_KEY')
  if (!apiKey) return localNarrative(signal)
  const body = {
    model: configuredValue('DEEPSEEK_MODEL'),
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Eres analista financiero para una herramienta personal. Devuelve solo JSON valido con summary, bullCase, bearCase y watchItems. No digas que el usuario debe comprar o vender sin mencionar riesgos.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          symbol: signal.symbol,
          action: signal.action,
          score: signal.score,
          confidence: signal.confidence,
          metrics: signal.metrics,
          evidence: signal.evidence,
          risks: signal.risks,
          backtest: signal.backtest,
        }),
      },
    ],
  }
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`)
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content) as Partial<Omit<SignalNarrative, 'provider' | 'generatedAt'>>
  return {
    provider: 'deepseek-v4-pro',
    generatedAt: new Date().toISOString(),
    summary: String(parsed.summary ?? localNarrative(signal).summary),
    bullCase: Array.isArray(parsed.bullCase) ? parsed.bullCase.map(String).slice(0, 4) : [],
    bearCase: Array.isArray(parsed.bearCase) ? parsed.bearCase.map(String).slice(0, 4) : [],
    watchItems: Array.isArray(parsed.watchItems) ? parsed.watchItems.map(String).slice(0, 5) : [],
  }
}

export async function getSignal(symbol: string, includeNarrative = false) {
  const normalized = symbol.toUpperCase()
  let signal = readSignal(normalized)
  if (!signal || stale(signal)) {
    await refreshSignals()
    signal = readSignal(normalized)
  }
  if (!signal) return null
  if (includeNarrative && !signal.narrative) {
    try {
      signal = {
        ...signal,
        narrative: await deepSeekNarrative(signal),
      }
    } catch {
      signal = {
        ...signal,
        narrative: localNarrative(signal),
      }
    }
    upsertSignal(signal)
  }
  return signal
}

export function portfolioSummary(): PortfolioSummary {
  return summarizePortfolio(latestCachedPrices())
}

export function importPortfolioCsv(csv: string) {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const header = lines.shift()?.toLowerCase().split(',').map((item) => item.trim()) ?? []
  const symbolIndex = header.indexOf('symbol')
  const qtyIndex = header.indexOf('qty')
  const avgIndex = header.indexOf('avgprice') >= 0 ? header.indexOf('avgprice') : header.indexOf('avg_price')
  if (symbolIndex < 0 || qtyIndex < 0 || avgIndex < 0) {
    throw new Error('CSV requerido: symbol,qty,avgPrice')
  }
  const profiles = new Map(EQUITY_CATALOG.map((profile) => [profile.symbol, normalizeAsset(profile)]))
  const updatedAt = new Date().toISOString()
  const positions = lines.map((line) => {
    const parts = line.split(',').map((item) => item.trim())
    const symbol = parts[symbolIndex].toUpperCase()
    const profile = profiles.get(symbol)
    if (!profile) throw new Error(`Activo no soportado: ${symbol}`)
    const qty = Number(parts[qtyIndex])
    const avgPrice = Number(parts[avgIndex])
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(avgPrice) || avgPrice <= 0) {
      throw new Error(`Posicion invalida: ${symbol}`)
    }
    return {
      symbol,
      qty,
      avgPrice,
      currency: profile.currency,
      market: profile.market,
      updatedAt,
    }
  })
  return positions
}

export function saveImportedPortfolio(positions: PortfolioPosition[]) {
  replacePortfolioPositions(positions)
  return portfolioSummary()
}

export function decisions(symbol?: string) {
  return readDecisions(symbol)
}

export function createDecision(input: {
  symbol: string
  userDecision: JournalDecision
  note?: string
  thesis?: string
  invalidation?: string
  reviewDate?: string
}) {
  const signal = readSignal(input.symbol.toUpperCase())
  if (!signal) throw new Error(`No hay señal para ${input.symbol}`)
  const entry: DecisionJournalEntry = {
    id: randomUUID(),
    symbol: signal.symbol,
    signalAction: signal.action,
    userDecision: input.userDecision,
    note: input.note ?? '',
    thesis: input.thesis ?? '',
    invalidation: input.invalidation ?? '',
    reviewDate: input.reviewDate ?? '',
    signalRunAt: signal.generatedAt,
    signalVersion: signal.modelVersion,
    createdAt: new Date().toISOString(),
    snapshot: signal,
  }
  saveDecision(entry)
  return entry
}
