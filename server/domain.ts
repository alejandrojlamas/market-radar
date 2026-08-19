import type { AssetCurrency, AssetMarket, EquityProfile } from './catalog'

export type DataProvider = 'polygon' | 'twelvedata' | 'alphavantage' | 'stooq' | 'yahoo-chart' | 'demo'
export type DataSourceKind = 'paid' | 'free' | 'fallback'
export type SignalAction = 'Buy' | 'Hold' | 'Sell' | 'No Signal'
export type JournalDecision = 'accepted' | 'rejected' | 'watch'

export type AssetProfile = EquityProfile & {
  market: AssetMarket
  currency: AssetCurrency
}

export type OhlcvBar = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketHistory = {
  symbol: string
  provider: DataProvider
  sourceKind: DataSourceKind
  bars: OhlcvBar[]
  decisionGrade: boolean
  freshness: 'fresh' | 'stale' | 'insufficient'
  fetchedAt: string
  warning?: string
}

export type ProviderStatus = {
  provider: DataProvider
  market: AssetMarket | 'ALL'
  ok: boolean
  sourceKind: DataSourceKind
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}

export type SignalEvidence = {
  label: string
  value: string
  contribution: number
  tone: 'positive' | 'neutral' | 'negative'
}

export type SignalRisk = {
  label: string
  value: string
  severity: 'low' | 'medium' | 'high'
}

export type BacktestSummary = {
  sampleSize: number
  hitRate: number
  averageForwardReturn: number
  benchmarkReturn: number
}

export type SignalNarrative = {
  provider: 'deepseek-v4-pro' | 'local'
  generatedAt: string
  summary: string
  bullCase: string[]
  bearCase: string[]
  watchItems: string[]
}

export type SignalRun = {
  symbol: string
  action: SignalAction
  score: number
  confidence: number
  ruleScore: number
  mlScore: number
  modelVersion: string
  generatedAt: string
  dataProvider: DataProvider
  sourceKind: DataSourceKind
  dataFreshness: MarketHistory['freshness']
  decisionGrade: boolean
  reasonUnavailable?: string
  asset: {
    name: string
    market: AssetMarket
    exchange: string
    currency: AssetCurrency
    sector: string
    industry: string
  }
  quote: {
    price: number
    previousClose: number
    changePercent: number
    volume: number
    marketTime: string
  }
  metrics: {
    rsi: number
    sma20: number
    sma50: number
    sma200: number
    performance1M: number
    performance3M: number
    performance52W: number
    drawdown52W: number
    volatility63D: number
  }
  evidence: SignalEvidence[]
  risks: SignalRisk[]
  backtest: BacktestSummary
  narrative?: SignalNarrative
}

export type PortfolioPosition = {
  symbol: string
  qty: number
  avgPrice: number
  currency: AssetCurrency
  market: AssetMarket
  updatedAt: string
}

export type PortfolioSummary = {
  positions: Array<
    PortfolioPosition & {
      price: number | null
      marketValue: number
      pnl: number
      pnlPercent: number
      weight: number
    }
  >
  currencyTotals: Array<{
    currency: AssetCurrency
    marketValue: number
    cost: number
    pnl: number
  }>
  equity: number
  cash: number
  updatedAt: string
}

export type DecisionJournalEntry = {
  id: string
  symbol: string
  signalAction: SignalAction
  userDecision: JournalDecision
  note: string
  thesis: string
  invalidation: string
  reviewDate: string
  signalRunAt: string
  signalVersion: string
  createdAt: string
  snapshot: SignalRun | null
}
