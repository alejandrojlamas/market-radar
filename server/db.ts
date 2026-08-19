import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  DataProvider,
  DataSourceKind,
  DecisionJournalEntry,
  JournalDecision,
  OhlcvBar,
  PortfolioPosition,
  PortfolioSummary,
  ProviderStatus,
  SignalAction,
  SignalRun,
} from './domain'
import { readEnvironment } from './env'

let database: DatabaseSync | null = null

function dbPath() {
  const configured = readEnvironment('MARKET_RADAR_DB_PATH', 'MERCADORADAR_DB_PATH')
  if (configured) return path.resolve(configured)

  const currentPath = path.resolve('./data/market-radar.sqlite')
  const legacyPath = path.resolve('./data/mercadoradar.sqlite')
  migrateLegacyDatabaseFiles(legacyPath, currentPath)
  return currentPath
}

function ensureDatabaseDir(filePath: string) {
  const directory = path.dirname(filePath)
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
}

export function migrateLegacyDatabaseFiles(legacyPath: string, currentPath: string) {
  if (existsSync(currentPath) || !existsSync(legacyPath)) return false
  ensureDatabaseDir(currentPath)

  const suffixes = ['', '-wal', '-shm'].filter((suffix) => existsSync(`${legacyPath}${suffix}`))
  const temporaryPaths = suffixes.map((suffix) => `${currentPath}${suffix}.migrating`)

  try {
    suffixes.forEach((suffix, index) => copyFileSync(`${legacyPath}${suffix}`, temporaryPaths[index]))
    suffixes
      .filter(Boolean)
      .forEach((suffix) => renameSync(`${currentPath}${suffix}.migrating`, `${currentPath}${suffix}`))
    renameSync(`${currentPath}.migrating`, currentPath)
    return true
  } catch (error) {
    for (const temporaryPath of temporaryPaths) rmSync(temporaryPath, { force: true })
    throw error
  }
}

export function getDb() {
  if (database) return database
  database = createDatabase(dbPath())
  return database
}

export function createDatabase(filePath: string) {
  ensureDatabaseDir(filePath)
  const nextDatabase = new DatabaseSync(filePath)
  try {
    nextDatabase.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    migrate(nextDatabase)
    return nextDatabase
  } catch (error) {
    nextDatabase.close()
    throw error
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_bars (
      symbol TEXT NOT NULL,
      provider TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (symbol, provider, date)
    );

    CREATE TABLE IF NOT EXISTS provider_status (
      provider TEXT NOT NULL,
      market TEXT NOT NULL,
      ok INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      last_success_at TEXT,
      last_error_at TEXT,
      last_error TEXT,
      PRIMARY KEY (provider, market)
    );

    CREATE TABLE IF NOT EXISTS signals (
      symbol TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      score REAL NOT NULL,
      confidence REAL NOT NULL,
      rule_score REAL NOT NULL,
      ml_score REAL NOT NULL,
      model_version TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      data_provider TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      data_freshness TEXT NOT NULL,
      decision_grade INTEGER NOT NULL,
      reason_unavailable TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_positions (
      symbol TEXT PRIMARY KEY,
      qty REAL NOT NULL,
      avg_price REAL NOT NULL,
      currency TEXT NOT NULL,
      market TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      signal_action TEXT NOT NULL,
      user_decision TEXT NOT NULL,
      note TEXT NOT NULL,
      thesis TEXT NOT NULL,
      invalidation TEXT NOT NULL,
      review_date TEXT NOT NULL,
      signal_run_at TEXT NOT NULL,
      signal_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      snapshot_json TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      secret INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_market_bars_symbol_provider_date
      ON market_bars(symbol, provider, date);
    CREATE INDEX IF NOT EXISTS idx_decisions_symbol_created
      ON decisions(symbol, created_at);
  `)
}

export function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
  return row ? String((row as Record<string, unknown>).value) : null
}

export function writeSetting(key: string, value: string, secret = true) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, secret, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        secret = excluded.secret,
        updated_at = excluded.updated_at`,
    )
    .run(key, value, secret ? 1 : 0, new Date().toISOString())
}

export function deleteSetting(key: string) {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}

export function listSettings() {
  return getDb()
    .prepare('SELECT key, secret, updated_at FROM app_settings ORDER BY key')
    .all()
    .map((row) => {
      const item = row as Record<string, unknown>
      return {
        key: String(item.key),
        secret: Boolean(item.secret),
        updatedAt: String(item.updated_at),
      }
    })
}

export function upsertBars(symbol: string, provider: DataProvider, bars: OhlcvBar[]) {
  if (!bars.length) return
  const db = getDb()
  const now = new Date().toISOString()
  const statement = db.prepare(`
    INSERT INTO market_bars (symbol, provider, date, open, high, low, close, volume, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, provider, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      created_at = excluded.created_at
  `)
  db.exec('BEGIN')
  try {
    for (const bar of bars) {
      statement.run(symbol, provider, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, now)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function readBars(symbol: string, provider?: DataProvider, limit = 520): OhlcvBar[] {
  const db = getDb()
  const rows = provider
    ? db
        .prepare(
          `SELECT date, open, high, low, close, volume
           FROM market_bars WHERE symbol = ? AND provider = ?
           ORDER BY date DESC LIMIT ?`,
        )
        .all(symbol, provider, limit)
    : db
        .prepare(
          `SELECT date, open, high, low, close, volume
           FROM market_bars WHERE symbol = ?
           ORDER BY date DESC LIMIT ?`,
        )
        .all(symbol, limit)
  return rows
    .map((row) => row as Record<string, number | string>)
    .map((row) => ({
      date: String(row.date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .reverse()
}

export function writeProviderStatus(status: ProviderStatus) {
  getDb()
    .prepare(
      `INSERT INTO provider_status
       (provider, market, ok, source_kind, last_success_at, last_error_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, market) DO UPDATE SET
        ok = excluded.ok,
        source_kind = excluded.source_kind,
        last_success_at = COALESCE(excluded.last_success_at, provider_status.last_success_at),
        last_error_at = COALESCE(excluded.last_error_at, provider_status.last_error_at),
        last_error = excluded.last_error`,
    )
    .run(
      status.provider,
      status.market,
      status.ok ? 1 : 0,
      status.sourceKind,
      status.lastSuccessAt,
      status.lastErrorAt,
      status.lastError,
    )
}

export function readProviderStatuses(): ProviderStatus[] {
  return getDb()
    .prepare(
      `SELECT provider, market, ok, source_kind, last_success_at, last_error_at, last_error
       FROM provider_status ORDER BY provider, market`,
    )
    .all()
    .map((row) => {
      const item = row as Record<string, unknown>
      return {
        provider: item.provider as DataProvider,
        market: item.market as ProviderStatus['market'],
        ok: Boolean(item.ok),
        sourceKind: item.source_kind as DataSourceKind,
        lastSuccessAt: item.last_success_at ? String(item.last_success_at) : null,
        lastErrorAt: item.last_error_at ? String(item.last_error_at) : null,
        lastError: item.last_error ? String(item.last_error) : null,
      }
    })
}

export function upsertSignal(signal: SignalRun) {
  getDb()
    .prepare(
      `INSERT INTO signals
       (symbol, action, score, confidence, rule_score, ml_score, model_version, generated_at,
        data_provider, source_kind, data_freshness, decision_grade, reason_unavailable, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
        action = excluded.action,
        score = excluded.score,
        confidence = excluded.confidence,
        rule_score = excluded.rule_score,
        ml_score = excluded.ml_score,
        model_version = excluded.model_version,
        generated_at = excluded.generated_at,
        data_provider = excluded.data_provider,
        source_kind = excluded.source_kind,
        data_freshness = excluded.data_freshness,
        decision_grade = excluded.decision_grade,
        reason_unavailable = excluded.reason_unavailable,
        payload_json = excluded.payload_json`,
    )
    .run(
      signal.symbol,
      signal.action,
      signal.score,
      signal.confidence,
      signal.ruleScore,
      signal.mlScore,
      signal.modelVersion,
      signal.generatedAt,
      signal.dataProvider,
      signal.sourceKind,
      signal.dataFreshness,
      signal.decisionGrade ? 1 : 0,
      signal.reasonUnavailable ?? null,
      JSON.stringify(signal),
    )
}

export function readSignals(): SignalRun[] {
  return getDb()
    .prepare('SELECT payload_json FROM signals ORDER BY score DESC, symbol ASC')
    .all()
    .map((row) => JSON.parse(String((row as Record<string, unknown>).payload_json)) as SignalRun)
}

export function readSignal(symbol: string): SignalRun | null {
  const row = getDb().prepare('SELECT payload_json FROM signals WHERE symbol = ?').get(symbol)
  return row ? (JSON.parse(String((row as Record<string, unknown>).payload_json)) as SignalRun) : null
}

export function replacePortfolioPositions(positions: PortfolioPosition[]) {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM portfolio_positions').run()
    const statement = db.prepare(
      `INSERT INTO portfolio_positions (symbol, qty, avg_price, currency, market, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const position of positions) {
      statement.run(
        position.symbol,
        position.qty,
        position.avgPrice,
        position.currency,
        position.market,
        position.updatedAt,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function readPortfolioPositions(): PortfolioPosition[] {
  return getDb()
    .prepare('SELECT symbol, qty, avg_price, currency, market, updated_at FROM portfolio_positions ORDER BY symbol')
    .all()
    .map((row) => {
      const item = row as Record<string, unknown>
      return {
        symbol: String(item.symbol),
        qty: Number(item.qty),
        avgPrice: Number(item.avg_price),
        currency: item.currency as PortfolioPosition['currency'],
        market: item.market as PortfolioPosition['market'],
        updatedAt: String(item.updated_at),
      }
    })
}

export function saveDecision(entry: DecisionJournalEntry) {
  getDb()
    .prepare(
      `INSERT INTO decisions
       (id, symbol, signal_action, user_decision, note, thesis, invalidation, review_date,
        signal_run_at, signal_version, created_at, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.id,
      entry.symbol,
      entry.signalAction,
      entry.userDecision,
      entry.note,
      entry.thesis,
      entry.invalidation,
      entry.reviewDate,
      entry.signalRunAt,
      entry.signalVersion,
      entry.createdAt,
      entry.snapshot ? JSON.stringify(entry.snapshot) : null,
    )
}

export function readDecisions(symbol?: string): DecisionJournalEntry[] {
  const rows = symbol
    ? getDb()
        .prepare(
          `SELECT * FROM decisions WHERE symbol = ?
           ORDER BY created_at DESC LIMIT 100`,
        )
        .all(symbol)
    : getDb().prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100').all()
  return rows.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      symbol: String(item.symbol),
      signalAction: item.signal_action as SignalAction,
      userDecision: item.user_decision as JournalDecision,
      note: String(item.note),
      thesis: String(item.thesis),
      invalidation: String(item.invalidation),
      reviewDate: String(item.review_date),
      signalRunAt: String(item.signal_run_at),
      signalVersion: String(item.signal_version),
      createdAt: String(item.created_at),
      snapshot: item.snapshot_json ? (JSON.parse(String(item.snapshot_json)) as SignalRun) : null,
    }
  })
}

export function summarizePortfolio(latestPrices: Map<string, number>): PortfolioSummary {
  const positions = readPortfolioPositions()
  const expanded = positions.map((position) => {
    const price = latestPrices.get(position.symbol) ?? null
    const marketValue = price ? price * position.qty : 0
    const cost = position.avgPrice * position.qty
    const pnl = marketValue - cost
    return {
      ...position,
      price,
      marketValue,
      pnl,
      pnlPercent: cost ? (pnl / cost) * 100 : 0,
      weight: 0,
    }
  })
  const currencyTotals = Array.from(
    expanded.reduce(
      (acc, position) => {
        const current = acc.get(position.currency) ?? { currency: position.currency, marketValue: 0, cost: 0, pnl: 0 }
        current.marketValue += position.marketValue
        current.cost += position.avgPrice * position.qty
        current.pnl += position.pnl
        acc.set(position.currency, current)
        return acc
      },
      new Map<PortfolioPosition['currency'], { currency: PortfolioPosition['currency']; marketValue: number; cost: number; pnl: number }>(),
    ).values(),
  )
  const equity = currencyTotals.length === 1 ? currencyTotals[0].marketValue : 0
  return {
    positions: expanded.map((position) => ({
      ...position,
      weight: (currencyTotals.find((total) => total.currency === position.currency)?.marketValue ?? 0)
        ? (position.marketValue / (currencyTotals.find((total) => total.currency === position.currency)?.marketValue ?? 1)) * 100
        : 0,
    })),
    currencyTotals,
    equity,
    cash: 0,
    updatedAt: new Date().toISOString(),
  }
}
