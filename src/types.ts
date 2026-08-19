export type AssetKind = 'stock' | 'etf'
export type AssetMarket = 'US' | 'BMV'
export type AssetCurrency = 'USD' | 'MXN'
export type DataProvider = 'polygon' | 'twelvedata' | 'alphavantage' | 'stooq' | 'yahoo-chart' | 'demo'
export type DataSourceKind = 'paid' | 'free' | 'fallback'
export type SignalAction = 'Buy' | 'Hold' | 'Sell' | 'No Signal'
export type JournalDecision = 'accepted' | 'rejected' | 'watch'
export type ApiSettingKey =
  | 'POLYGON_API_KEY'
  | 'TWELVEDATA_API_KEY'
  | 'ALPHAVANTAGE_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'DEEPSEEK_MODEL'

export type MarketStatus = {
  open: boolean
  label: string
  timezone: string
}

export type Candle = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type ScreenerRow = {
  symbol: string
  name: string
  kind: AssetKind
  exchange: string
  market?: AssetMarket
  currency?: AssetCurrency
  sector: string
  industry: string
  index: string
  marketCap: number
  pe: number | null
  eps: number | null
  debtEquity: number | null
  pb: number | null
  roe: number | null
  dividendYield: number
  targetPrice: number | null
  analystScore: number
  socialScore: number
  beta: number
  seedPrice: number
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

export type AssetProfile = {
  symbol: string
  name: string
  kind: AssetKind
  exchange: string
  market: AssetMarket
  currency: AssetCurrency
  sector: string
  industry: string
  index: string
}

export type NewsItem = {
  id: string
  title: string
  source: string
  symbol: string
  summary: string
  url: string
  category: string
  publishedAt: string
}

export type Breadth = {
  advancers: number
  decliners: number
  buckets: Array<{ limit: number; count: number }>
}

export type Snapshot = {
  generatedAt: string
  marketStatus: MarketStatus
  rows: ScreenerRow[]
  ideas: ScreenerRow[]
  news: NewsItem[]
  newsSource: string
  breadth: Breadth
}

export type AlertRule = {
  id: string
  symbol: string
  side: 'above' | 'below'
  price: number
  active: boolean
  createdAt: string
}

export type PaperPosition = {
  symbol: string
  qty: number
  avgPrice: number
}

export type PaperTrade = {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  createdAt: string
}

export type PaperState = {
  cash: number
  positions: PaperPosition[]
  trades: PaperTrade[]
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
  dataFreshness: 'fresh' | 'stale' | 'insufficient'
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

export type PortfolioPositionReal = {
  symbol: string
  qty: number
  avgPrice: number
  currency: AssetCurrency
  market: AssetMarket
  updatedAt: string
  price: number | null
  marketValue: number
  pnl: number
  pnlPercent: number
  weight: number
}

export type PortfolioSummary = {
  positions: PortfolioPositionReal[]
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

export type ApiSettingStatus = {
  key: ApiSettingKey
  configured: boolean
  source: 'env' | 'app' | 'default' | 'missing'
  updatedAt: string | null
  displayValue: string
}
