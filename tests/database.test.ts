import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDatabase } from '../server/db'

test('createDatabase creates and migrates an empty local database', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mercadoradar-db-'))
  const databasePath = path.join(directory, 'nested', 'mercadoradar.sqlite')
  const database = createDatabase(databasePath)

  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String((row as Record<string, unknown>).name))

    assert.deepEqual(tables, [
      'app_settings',
      'decisions',
      'market_bars',
      'portfolio_positions',
      'provider_status',
      'signals',
    ])
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
