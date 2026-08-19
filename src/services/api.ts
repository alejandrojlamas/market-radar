import type {
  AssetProfile,
  ApiSettingKey,
  ApiSettingStatus,
  Candle,
  DecisionJournalEntry,
  JournalDecision,
  NewsItem,
  PortfolioSummary,
  ProviderStatus,
  SignalRun,
  Snapshot,
} from '../types'

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(init?.headers)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('x-mercadoradar-request', 'same-origin')
  }
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`Error ${response.status} cargando ${url}`)
  }
  return response.json() as Promise<T>
}

export function fetchSnapshot() {
  return readJson<Snapshot>('/api/snapshot')
}

export async function fetchHistory(symbol: string, range = '1y', interval = '1d') {
  const payload = await readJson<{ symbol: string; source: string; history: Candle[] }>(
    `/api/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
  )
  return payload
}

export async function fetchNews(symbol?: string) {
  const suffix = symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''
  const payload = await readJson<{ source: string; items: NewsItem[] }>(`/api/news${suffix}`)
  return payload
}

export function fetchAssets() {
  return readJson<{ items: AssetProfile[] }>('/api/assets')
}

export function fetchDataHealth() {
  return readJson<{ generatedAt: string; providers: ProviderStatus[] }>('/api/data-health')
}

export function fetchApiSettings() {
  return readJson<{ items: ApiSettingStatus[] }>('/api/settings/apis')
}

export function saveApiSettings(values: Partial<Record<ApiSettingKey, string>>) {
  return readJson<{ items: ApiSettingStatus[] }>('/api/settings/apis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  })
}

export function clearApiSetting(key: ApiSettingKey) {
  return readJson<{ items: ApiSettingStatus[] }>(`/api/settings/apis/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}

export function fetchSignals() {
  return readJson<{ generatedAt: string; items: SignalRun[] }>('/api/signals')
}

export function refreshSignals() {
  return readJson<{ generatedAt: string; items: SignalRun[] }>('/api/signals/refresh', {
    method: 'POST',
  })
}

export function fetchSignal(symbol: string, narrative = false) {
  const query = narrative ? '?narrative=true' : ''
  return readJson<SignalRun>(`/api/signals/${encodeURIComponent(symbol)}${query}`)
}

export function fetchPortfolio() {
  return readJson<PortfolioSummary>('/api/portfolio')
}

export function importPortfolio(csv: string) {
  return readJson<PortfolioSummary>('/api/portfolio/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv }),
  })
}

export function fetchDecisions(symbol?: string) {
  const suffix = symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''
  return readJson<{ items: DecisionJournalEntry[] }>(`/api/decisions${suffix}`)
}

export function saveDecision(input: {
  symbol: string
  userDecision: JournalDecision
  note: string
  thesis: string
  invalidation: string
  reviewDate: string
}) {
  return readJson<DecisionJournalEntry>('/api/decisions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}
