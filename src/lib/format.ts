export function usd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
}

export function compact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function percent(value: number, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export function number(value: number, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value)
}

export function timeAgo(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.round(diff / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
}

export function sourceLabel(source: string) {
  if (source === 'polygon') return 'Polygon'
  if (source === 'twelvedata') return 'Twelve Data'
  if (source === 'alphavantage') return 'Alpha Vantage'
  if (source === 'stooq') return 'Stooq'
  if (source === 'yahoo-chart') return 'Yahoo Chart'
  if (source === 'nasdaq-rss') return 'Nasdaq RSS'
  return 'Local demo'
}
