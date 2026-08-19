import type { AlertRule, ApiSettingKey, PaperState } from '../types'

export type TabId = 'mercado' | 'screener' | 'noticias' | 'decisiones' | 'apis' | 'portafolio' | 'paper'
export type ChartMode = 'linea' | 'velas' | 'barras'
export type OrderSide = 'buy' | 'sell'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro'

export const APP_COPY = {
  brand: 'MercadoRadar',
  tagline: 'Radar financiero personal',
  loading: 'Sincronizando datos, señales y cartera...',
  searchPlaceholder: 'Buscar ticker, sector o empresa',
}

export const TAB_DEFINITIONS: Array<{ id: TabId; label: string }> = [
  { id: 'mercado', label: 'Mercado' },
  { id: 'screener', label: 'Screener' },
  { id: 'noticias', label: 'Noticias' },
  { id: 'decisiones', label: 'Decisiones' },
  { id: 'apis', label: 'APIs' },
  { id: 'portafolio', label: 'Portafolio' },
  { id: 'paper', label: 'Paper' },
]

export const CHART_MODE_OPTIONS: Array<{ id: ChartMode; label: string }> = [
  { id: 'linea', label: 'linea' },
  { id: 'velas', label: 'velas' },
  { id: 'barras', label: 'barras' },
]

export const ORDER_SIDE_OPTIONS: Array<{ id: OrderSide; label: string }> = [
  { id: 'buy', label: 'Comprar' },
  { id: 'sell', label: 'Vender' },
]

export const API_FIELDS: Array<{ key: ApiSettingKey; label: string; helper: string; secret: boolean }> = [
  {
    key: 'POLYGON_API_KEY',
    label: 'Polygon.io',
    helper: 'US acciones/ETFs pago',
    secret: true,
  },
  {
    key: 'TWELVEDATA_API_KEY',
    label: 'Twelve Data',
    helper: 'BMV pago',
    secret: true,
  },
  {
    key: 'ALPHAVANTAGE_API_KEY',
    label: 'Alpha Vantage',
    helper: 'Proveedor gratis/premium',
    secret: true,
  },
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API',
    helper: 'Analisis narrativo',
    secret: true,
  },
  {
    key: 'DEEPSEEK_MODEL',
    label: 'Modelo DeepSeek',
    helper: `Default: ${DEFAULT_DEEPSEEK_MODEL}`,
    secret: false,
  },
]

export const STORAGE_KEYS = {
  watchlist: 'mercadoradar.watchlist',
  alerts: 'mercadoradar.alerts',
  paper: 'mercadoradar.paper',
}

export const DEFAULT_ACTIVE_TAB: TabId = 'mercado'
export const DEFAULT_SYMBOL = 'AAPL'
export const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL']
export const INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM']
export const ALL_FILTER_LABEL = 'Todos'
export const SIGNAL_FILTERS = [ALL_FILTER_LABEL, 'Alta prioridad', 'Vigilar', 'Neutral', 'Riesgo alto']
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
