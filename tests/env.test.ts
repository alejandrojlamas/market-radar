import assert from 'node:assert/strict'
import test from 'node:test'
import { readEnvironment } from '../server/env'

test('new Market Radar environment variables take precedence with legacy fallback', () => {
  const currentName = 'MARKET_RADAR_TEST_VALUE'
  const legacyName = 'MERCADORADAR_TEST_VALUE'
  const previousCurrent = process.env[currentName]
  const previousLegacy = process.env[legacyName]

  try {
    delete process.env[currentName]
    process.env[legacyName] = 'legacy'
    assert.equal(readEnvironment(currentName, legacyName), 'legacy')

    process.env[currentName] = 'current'
    assert.equal(readEnvironment(currentName, legacyName), 'current')
  } finally {
    if (previousCurrent === undefined) delete process.env[currentName]
    else process.env[currentName] = previousCurrent
    if (previousLegacy === undefined) delete process.env[legacyName]
    else process.env[legacyName] = previousLegacy
  }
})
