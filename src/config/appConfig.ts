import type { AlertRule, ApiSettingKey, PaperState } from '../types'

export type TabId = 'market' | 'screener' | 'news' | 'decisions' | 'apis' | 'portfolio' | 'paper'
export type ChartMode = 'line' | 'candles' | 'bars'
export type OrderSide = 'buy' | 'sell'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro'

export const APP_COPY = {
  brand: 'Market Radar',
  tagline: 'Personal applied-AI market lab',
  loading: 'Syncing market data, signals, and portfolio...',
  searchPlaceholder: 'Search ticker, sector, or company',
}

export const TAB_DEFINITIONS: Array<{ id: TabId; label: string }> = [
  { id: 'market', label: 'Market' },
  { id: 'screener', label: 'Screener' },
  { id: 'news', label: 'News' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'apis', label: 'APIs' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'paper', label: 'Paper' },
]

export const CHART_MODE_OPTIONS: Array<{ id: ChartMode; label: string }> = [
  { id: 'line', label: 'line' },
  { id: 'candles', label: 'candles' },
  { id: 'bars', label: 'bars' },
]

export const ORDER_SIDE_OPTIONS: Array<{ id: OrderSide; label: string }> = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
]

export const API_FIELDS: Array<{ key: ApiSettingKey; label: string; helper: string; secret: boolean }> = [
  {
    key: 'POLYGON_API_KEY',
    label: 'Polygon.io',
    helper: 'Paid US stocks and ETFs',
    secret: true,
  },
  {
    key: 'TWELVEDATA_API_KEY',
    label: 'Twelve Data',
    helper: 'Paid BMV market data',
    secret: true,
  },
  {
    key: 'ALPHAVANTAGE_API_KEY',
    label: 'Alpha Vantage',
    helper: 'Free and premium data provider',
    secret: true,
  },
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API',
    helper: 'AI narrative analysis',
    secret: true,
  },
  {
    key: 'DEEPSEEK_MODEL',
    label: 'DeepSeek model',
    helper: `Default: ${DEFAULT_DEEPSEEK_MODEL}`,
    secret: false,
  },
]

export const STORAGE_KEYS = {
  watchlist: 'market-radar.watchlist',
  alerts: 'market-radar.alerts',
  paper: 'market-radar.paper',
}

export const LEGACY_STORAGE_KEYS = {
  watchlist: ['mercadoradar.watchlist'],
  alerts: ['mercadoradar.alerts'],
  paper: ['mercadoradar.paper'],
}

export const DEFAULT_ACTIVE_TAB: TabId = 'market'
export const DEFAULT_SYMBOL = 'AAPL'
export const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL']
export const INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM']
export const ALL_FILTER_LABEL = 'All'
export const SIGNAL_FILTERS = [ALL_FILTER_LABEL, 'High priority', 'Watch', 'Neutral', 'High risk']
export const CHART_RANGES = ['5d', '1mo', '3mo', '1y']
export const DEFAULT_CHART_RANGE = CHART_RANGES.at(-1) ?? '1y'
export const INTRADAY_CHART_RANGE = '5d'
export const INTRADAY_HISTORY_INTERVAL = '30m'
export const DAILY_HISTORY_INTERVAL = '1d'
export const SEARCH_RESULT_LIMIT = 6
export const ALERT_PREVIEW_LIMIT = 5
export const NEWS_PREVIEW_LIMIT = 5
export const MOVERS_PREVIEW_LIMIT = 5
export const TOP_SIGNALS_LIMIT = 8
export const JOURNAL_PREVIEW_LIMIT = 8
export const DECISION_JOURNAL_LIMIT = 100
export const PRODUCT_REFRESH_INTERVAL_MS = 120000
export const DEFAULT_PORTFOLIO_CSV = 'symbol,qty,avgPrice\nAAPL,10,280\nAMXB,100,16.5'
export const DEFAULT_PRICE_MAX = 700
export const DEFAULT_RSI_MAX = 76
export const DEFAULT_ORDER_QTY = '5'
export const DEFAULT_ORDER_SIDE: OrderSide = 'buy'

export function historyIntervalForRange(range: string) {
  return range === INTRADAY_CHART_RANGE ? INTRADAY_HISTORY_INTERVAL : DAILY_HISTORY_INTERVAL
}

export function createDefaultApiForm(): Record<ApiSettingKey, string> {
  return {
    POLYGON_API_KEY: '',
    TWELVEDATA_API_KEY: '',
    ALPHAVANTAGE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_MODEL: DEFAULT_DEEPSEEK_MODEL,
  }
}

export function createDefaultPaperState(): PaperState {
  return {
    cash: 100000,
    positions: [
      { symbol: 'MSFT', qty: 8, avgPrice: 402 },
      { symbol: 'NVDA', qty: 12, avgPrice: 142 },
    ],
    trades: [],
  }
}

export function createDefaultAlerts(): AlertRule[] {
  const createdAt = new Date().toISOString()
  return [
    {
      id: 'aapl-above',
      symbol: 'AAPL',
      side: 'above',
      price: 315,
      active: true,
      createdAt,
    },
    {
      id: 'tsla-below',
      symbol: 'TSLA',
      side: 'below',
      price: 220,
      active: true,
      createdAt,
    },
  ]
}
