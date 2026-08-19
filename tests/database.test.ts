import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDatabase, migrateLegacyDatabaseFiles } from '../server/db'

test('createDatabase creates and migrates an empty local database', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'market-radar-db-'))
  const databasePath = path.join(directory, 'nested', 'market-radar.sqlite')
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

test('legacy MercadoRadar database files migrate without losing data', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'market-radar-migration-'))
  const legacyPath = path.join(directory, 'data', 'mercadoradar.sqlite')
  const currentPath = path.join(directory, 'data', 'market-radar.sqlite')
  const legacyDatabase = createDatabase(legacyPath)
  legacyDatabase
    .prepare('INSERT INTO app_settings (key, value, secret, updated_at) VALUES (?, ?, ?, ?)')
    .run('DEEPSEEK_MODEL', 'legacy-model', 0, new Date().toISOString())
  legacyDatabase.close()

  try {
    assert.equal(migrateLegacyDatabaseFiles(legacyPath, currentPath), true)
    assert.equal(existsSync(legacyPath), true)
    assert.equal(existsSync(currentPath), true)
    assert.equal(migrateLegacyDatabaseFiles(legacyPath, currentPath), false)

    const currentDatabase = createDatabase(currentPath)
    const row = currentDatabase.prepare('SELECT value FROM app_settings WHERE key = ?').get('DEEPSEEK_MODEL') as {
      value: string
    }
    assert.equal(row.value, 'legacy-model')
    currentDatabase.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
