import assert from 'node:assert/strict'
import test from 'node:test'
import { readMigratedStorage } from '../src/lib/storage'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

test('legacy localStorage state moves to the Market Radar namespace without data loss', () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  storage.setItem('mercadoradar.watchlist', JSON.stringify(['AAPL', 'NVDA']))

  const result = readMigratedStorage('market-radar.watchlist', ['mercadoradar.watchlist'], ['MSFT'])

  assert.deepEqual(result, ['AAPL', 'NVDA'])
  assert.equal(storage.getItem('market-radar.watchlist'), JSON.stringify(['AAPL', 'NVDA']))
  assert.equal(storage.getItem('mercadoradar.watchlist'), null)
})
