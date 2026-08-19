import assert from 'node:assert/strict'
import test from 'node:test'
import { EQUITY_CATALOG } from '../server/catalog'
import type { MarketHistory, OhlcvBar } from '../server/domain'
import { buildSignalFromHistory, importPortfolioCsv } from '../server/signals'

function risingBars(days = 260): OhlcvBar[] {
  const bars: OhlcvBar[] = []
  const start = new Date('2025-01-02T00:00:00Z')
  let close = 100
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    close *= 1.0025
    bars.push({
      date: date.toISOString().slice(0, 10),
      open: close * 0.995,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1000000 + index * 1000,
    })
  }
  return bars
}

test('buildSignalFromHistory returns an actionable signal for decision-grade data', () => {
  const profile = EQUITY_CATALOG.find((item) => item.symbol === 'AAPL')
  assert.ok(profile)
  const history: MarketHistory = {
    symbol: 'AAPL',
    provider: 'polygon',
    sourceKind: 'paid',
    bars: risingBars(),
    decisionGrade: true,
    freshness: 'fresh',
    fetchedAt: new Date().toISOString(),
  }
  const signal = buildSignalFromHistory(profile, history)
  assert.notEqual(signal.action, 'No Signal')
  assert.equal(signal.decisionGrade, true)
  assert.equal(signal.dataProvider, 'polygon')
  assert.ok(signal.evidence.length >= 4)
  assert.ok(signal.backtest.sampleSize > 0)
})

test('buildSignalFromHistory blocks Buy/Hold/Sell for fallback data', () => {
  const profile = EQUITY_CATALOG.find((item) => item.symbol === 'AAPL')
  assert.ok(profile)
  const history: MarketHistory = {
    symbol: 'AAPL',
    provider: 'demo',
    sourceKind: 'fallback',
    bars: risingBars(),
    decisionGrade: false,
    freshness: 'fresh',
    fetchedAt: new Date().toISOString(),
    warning: 'demo data',
  }
  const signal = buildSignalFromHistory(profile, history)
  assert.equal(signal.action, 'No Signal')
  assert.equal(signal.decisionGrade, false)
  assert.match(signal.reasonUnavailable ?? '', /demo/)
})

test('importPortfolioCsv parses supported US and BMV symbols', () => {
  const positions = importPortfolioCsv('symbol,qty,avgPrice\nAAPL,4,280\nAMXB,100,16.5')
  assert.equal(positions.length, 2)
  assert.equal(positions[0].symbol, 'AAPL')
  assert.equal(positions[1].market, 'BMV')
  assert.equal(positions[1].currency, 'MXN')
})
