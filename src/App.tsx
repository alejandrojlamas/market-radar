import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChartColumn,
  ChartLine,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileUp,
  KeyRound,
  LineChart,
  Newspaper,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  Wallet,
  Wifi,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import {
  ALERT_PREVIEW_LIMIT,
  ALL_FILTER_LABEL,
  API_FIELDS,
  APP_COPY,
  CHART_MODE_OPTIONS,
  CHART_RANGES,
  DECISION_JOURNAL_LIMIT,
  DEFAULT_ACTIVE_TAB,
  DEFAULT_CHART_RANGE,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_ORDER_QTY,
  DEFAULT_ORDER_SIDE,
  DEFAULT_PORTFOLIO_CSV,
  DEFAULT_PRICE_MAX,
  DEFAULT_RSI_MAX,
  DEFAULT_SYMBOL,
  DEFAULT_WATCHLIST,
  INDEX_SYMBOLS,
  JOURNAL_PREVIEW_LIMIT,
  LEGACY_STORAGE_KEYS,
  MOVERS_PREVIEW_LIMIT,
  NEWS_PREVIEW_LIMIT,
  ORDER_SIDE_OPTIONS,
  PRODUCT_REFRESH_INTERVAL_MS,
  SEARCH_RESULT_LIMIT,
  SIGNAL_FILTERS,
  STORAGE_KEYS,
  TAB_DEFINITIONS,
  TOP_SIGNALS_LIMIT,
  createDefaultAlerts,
  createDefaultApiForm,
  createDefaultPaperState,
  historyIntervalForRange,
  type ChartMode,
  type OrderSide,
  type TabId,
} from './config/appConfig'
import { compact, number, percent, sourceLabel, timeAgo, usd } from './lib/format'
import { readMigratedStorage, writeStorage } from './lib/storage'
import {
  fetchDataHealth,
  clearApiSetting,
  fetchDecisions,
  fetchHistory,
  fetchNews,
  fetchPortfolio,
  fetchApiSettings,
  fetchSignal,
  fetchSignals,
  fetchSnapshot,
  importPortfolio,
  refreshSignals,
  saveApiSettings,
  saveDecision,
} from './services/api'
import type {
  AlertRule,
  ApiSettingKey,
  ApiSettingStatus,
  Candle,
  DecisionJournalEntry,
  JournalDecision,
  NewsItem,
  PaperState,
  PortfolioSummary,
  ProviderStatus,
  ScreenerRow,
  SignalEvidence,
  SignalRisk,
  SignalRun,
  Snapshot,
} from './types'

const tabIcons: Record<TabId, typeof Activity> = {
  market: Activity,
  screener: SlidersHorizontal,
  news: Newspaper,
  decisions: ClipboardList,
  apis: KeyRound,
  portfolio: Wallet,
  paper: CircleDollarSign,
}

const chartModeIcons: Record<ChartMode, typeof ChartLine> = {
  line: ChartLine,
  candles: LineChart,
  bars: ChartColumn,
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Candle[]>([])
  const [symbolNews, setSymbolNews] = useState<NewsItem[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL)
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_ACTIVE_TAB)
  const [chartMode, setChartMode] = useState<ChartMode>('line')
  const [range, setRange] = useState(DEFAULT_CHART_RANGE)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState(ALL_FILTER_LABEL)
  const [signal, setSignal] = useState(ALL_FILTER_LABEL)
  const [priceMax, setPriceMax] = useState(DEFAULT_PRICE_MAX)
  const [rsiMax, setRsiMax] = useState(DEFAULT_RSI_MAX)
  const [watchlist, setWatchlist] = useState(() =>
    readMigratedStorage<string[]>(STORAGE_KEYS.watchlist, LEGACY_STORAGE_KEYS.watchlist, DEFAULT_WATCHLIST),
  )
  const [alerts, setAlerts] = useState(() =>
    readMigratedStorage<AlertRule[]>(STORAGE_KEYS.alerts, LEGACY_STORAGE_KEYS.alerts, createDefaultAlerts()),
  )
  const [paper, setPaper] = useState(() =>
    readMigratedStorage<PaperState>(STORAGE_KEYS.paper, LEGACY_STORAGE_KEYS.paper, createDefaultPaperState()),
  )
  const [signals, setSignals] = useState<SignalRun[]>([])
  const [selectedSignal, setSelectedSignal] = useState<SignalRun | null>(null)
  const [dataHealth, setDataHealth] = useState<ProviderStatus[]>([])
  const [decisionJournal, setDecisionJournal] = useState<DecisionJournalEntry[]>([])
  const [realPortfolio, setRealPortfolio] = useState<PortfolioSummary | null>(null)
  const [apiSettings, setApiSettings] = useState<ApiSettingStatus[]>([])
  const [apiForm, setApiForm] = useState<Record<ApiSettingKey, string>>(createDefaultApiForm)
  const [csvText, setCsvText] = useState(DEFAULT_PORTFOLIO_CSV)
  const [decisionNote, setDecisionNote] = useState('')
  const [decisionThesis, setDecisionThesis] = useState('')
  const [decisionInvalidation, setDecisionInvalidation] = useState('')
  const [decisionReviewDate, setDecisionReviewDate] = useState('')
  const [productBusy, setProductBusy] = useState(false)
  const [orderQty, setOrderQty] = useState(DEFAULT_ORDER_QTY)
  const [orderSide, setOrderSide] = useState<OrderSide>(DEFAULT_ORDER_SIDE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const rows = useMemo(() => snapshot?.rows ?? [], [snapshot])
  const selected = rows.find((row) => row.symbol === selectedSymbol) ?? rows[0]
  const sectors = useMemo(() => [ALL_FILTER_LABEL, ...Array.from(new Set(rows.map((row) => row.sector)))], [rows])
  const watchRows = useMemo(
    () => watchlist.map((symbol) => rows.find((row) => row.symbol === symbol)).filter(Boolean) as ScreenerRow[],
    [rows, watchlist],
  )

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => row.kind === 'stock')
      .filter((row) => (sector === ALL_FILTER_LABEL ? true : row.sector === sector))
      .filter((row) => (signal === ALL_FILTER_LABEL ? true : row.signal === signal))
      .filter((row) => row.price <= priceMax)
      .filter((row) => row.rsi <= rsiMax)
      .filter((row) => {
        const value = query.trim().toUpperCase()
        if (!value) return true
        return row.symbol.includes(value) || row.name.toUpperCase().includes(value)
      })
      .sort((a, b) => b.score - a.score)
  }, [priceMax, query, rows, rsiMax, sector, signal])

  const searchMatches = useMemo(() => {
    const value = query.trim().toUpperCase()
    if (!value) return rows.slice(0, SEARCH_RESULT_LIMIT)
    return rows
      .filter((row) => row.symbol.includes(value) || row.name.toUpperCase().includes(value))
      .slice(0, SEARCH_RESULT_LIMIT)
  }, [query, rows])

  const alertRows = useMemo(() => {
    return alerts.map((alert) => {
      const row = rows.find((item) => item.symbol === alert.symbol)
      const triggered = Boolean(
        row && alert.active && (alert.side === 'above' ? row.price >= alert.price : row.price <= alert.price),
      )
      return { ...alert, row, triggered }
    })
  }, [alerts, rows])

  const portfolio = useMemo(() => {
    const positions = paper.positions.map((position) => {
      const row = rows.find((item) => item.symbol === position.symbol)
      const price = row?.price ?? position.avgPrice
      const marketValue = price * position.qty
      const cost = position.avgPrice * position.qty
      return { ...position, row, price, marketValue, pnl: marketValue - cost, pnlPercent: cost ? ((marketValue - cost) / cost) * 100 : 0 }
    })
    const marketValue = positions.reduce((sum, position) => sum + position.marketValue, 0)
    const equity = paper.cash + marketValue
    return { positions, marketValue, equity }
  }, [paper.cash, paper.positions, rows])

  async function loadSnapshot() {
    try {
      setError('')
      const data = await fetchSnapshot()
      setSnapshot(data)
      if (!data.rows.find((row) => row.symbol === selectedSymbol)) {
        setSelectedSymbol(data.rows[0]?.symbol ?? DEFAULT_SYMBOL)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The market could not be loaded')
    } finally {
      setLoading(false)
    }
  }

  async function loadProductState(symbol = selectedSymbol, narrative = false) {
    try {
      const [signalList, health, portfolio, journal, signal, settings] = await Promise.all([
        fetchSignals(),
        fetchDataHealth(),
        fetchPortfolio(),
        fetchDecisions(),
        fetchSignal(symbol, narrative),
        fetchApiSettings(),
      ])
      setSignals(signalList.items)
      setDataHealth(health.providers)
      setRealPortfolio(portfolio)
      setDecisionJournal(journal.items)
      setSelectedSignal(signal)
      setApiSettings(settings.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Decision Desk could not be loaded')
    }
  }

  async function forceRefreshSignals() {
    setProductBusy(true)
    try {
      const refreshed = await refreshSignals()
      setSignals(refreshed.items)
      await loadProductState(selectedSymbol, true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signals could not be refreshed')
    } finally {
      setProductBusy(false)
    }
  }

  useEffect(() => {
    let disposed = false
    const run = () => {
      fetchSnapshot()
        .then((data) => {
          if (disposed) return
          setError('')
          setSnapshot(data)
          setSelectedSymbol((current) => (data.rows.find((row) => row.symbol === current) ? current : data.rows[0]?.symbol ?? DEFAULT_SYMBOL))
        })
        .catch((reason: unknown) => {
          if (disposed) return
          setError(reason instanceof Error ? reason.message : 'The market could not be loaded')
        })
        .finally(() => {
          if (!disposed) setLoading(false)
        })

      Promise.all([fetchSignals(), fetchDataHealth(), fetchPortfolio(), fetchDecisions(), fetchApiSettings()])
        .then(([signalList, health, portfolio, journal, settings]) => {
          if (disposed) return
          setSignals(signalList.items)
          setDataHealth(health.providers)
          setRealPortfolio(portfolio)
          setDecisionJournal(journal.items)
          setApiSettings(settings.items)
        })
        .catch((reason: unknown) => {
          if (disposed) return
          setError(reason instanceof Error ? reason.message : 'Decision Desk could not be loaded')
        })
    }
    run()
    const timer = window.setInterval(run, PRODUCT_REFRESH_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    async function loadSymbol() {
      try {
        const [{ history: nextHistory }, news] = await Promise.all([
          fetchHistory(selectedSymbol, range, historyIntervalForRange(range)),
          fetchNews(selectedSymbol),
        ])
        setHistory(nextHistory)
        setSymbolNews(news.items)
      } catch {
        setHistory([])
        setSymbolNews([])
      }
    }
    void loadSymbol()
  }, [range, selectedSymbol])

  useEffect(() => {
    let disposed = false
    async function loadDecisionContext() {
      try {
        const [signal, journal] = await Promise.all([fetchSignal(selectedSymbol, activeTab === 'decisions'), fetchDecisions(selectedSymbol)])
        if (disposed) return
        setSelectedSignal(signal)
        setDecisionJournal((current) => {
          const other = current.filter((entry) => entry.symbol !== selectedSymbol)
          return [...journal.items, ...other].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, DECISION_JOURNAL_LIMIT)
        })
      } catch {
        if (!disposed) setSelectedSignal(signals.find((item) => item.symbol === selectedSymbol) ?? null)
      }
    }
    void loadDecisionContext()
    return () => {
      disposed = true
    }
  }, [activeTab, selectedSymbol, signals])

  useEffect(() => writeStorage(STORAGE_KEYS.watchlist, watchlist), [watchlist])
  useEffect(() => writeStorage(STORAGE_KEYS.alerts, alerts), [alerts])
  useEffect(() => writeStorage(STORAGE_KEYS.paper, paper), [paper])

  function selectSymbol(symbol: string) {
    setSelectedSymbol(symbol)
    setQuery('')
  }

  function toggleWatch(symbol: string) {
    setWatchlist((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol],
    )
  }

  function addAlert() {
    if (!selected) return
    const side = selected.changePercent >= 0 ? 'below' : 'above'
    const target = side === 'below' ? selected.price * 0.97 : selected.price * 1.03
    setAlerts((current) => [
      {
        id: `${selected.symbol}-${Date.now()}`,
        symbol: selected.symbol,
        side,
        price: Number(target.toFixed(2)),
        active: true,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])
  }

  function submitTrade() {
    if (!selected) return
    const qty = Math.max(0, Number(orderQty))
    if (!Number.isFinite(qty) || qty <= 0) return
    const price = selected.price
    setPaper((current) => {
      const cost = qty * price
      const positions = [...current.positions]
      const existing = positions.find((position) => position.symbol === selected.symbol)

      if (orderSide === 'buy') {
        if (cost > current.cash) return current
        if (existing) {
          const totalQty = existing.qty + qty
          existing.avgPrice = (existing.avgPrice * existing.qty + cost) / totalQty
          existing.qty = totalQty
        } else {
          positions.push({ symbol: selected.symbol, qty, avgPrice: price })
        }
        return {
          cash: current.cash - cost,
          positions,
          trades: [{ id: `${Date.now()}`, symbol: selected.symbol, side: 'buy', qty, price, createdAt: new Date().toISOString() }, ...current.trades],
        }
      }

      if (!existing || existing.qty < qty) return current
      existing.qty -= qty
      const nextPositions = positions.filter((position) => position.qty > 0.0001)
      return {
        cash: current.cash + cost,
        positions: nextPositions,
        trades: [{ id: `${Date.now()}`, symbol: selected.symbol, side: 'sell', qty, price, createdAt: new Date().toISOString() }, ...current.trades],
      }
    })
  }

  async function submitDecision(userDecision: JournalDecision) {
    if (!selectedSignal) return
    setProductBusy(true)
    try {
      const saved = await saveDecision({
        symbol: selectedSignal.symbol,
        userDecision,
        note: decisionNote,
        thesis: decisionThesis,
        invalidation: decisionInvalidation,
        reviewDate: decisionReviewDate,
      })
      setDecisionJournal((current) => [saved, ...current].slice(0, DECISION_JOURNAL_LIMIT))
      setDecisionNote('')
      setDecisionThesis('')
      setDecisionInvalidation('')
      setDecisionReviewDate('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The decision could not be saved')
    } finally {
      setProductBusy(false)
    }
  }

  async function submitPortfolioImport() {
    setProductBusy(true)
    try {
      const nextPortfolio = await importPortfolio(csvText)
      setRealPortfolio(nextPortfolio)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The portfolio could not be imported')
    } finally {
      setProductBusy(false)
    }
  }

  async function submitApiSettings() {
    setProductBusy(true)
    try {
      const next = await saveApiSettings(apiForm)
      setApiSettings(next.items)
      const nextForm = createDefaultApiForm()
      nextForm.DEEPSEEK_MODEL = apiForm.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
      setApiForm(nextForm)
      await loadProductState(selectedSymbol, false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The settings could not be saved')
    } finally {
      setProductBusy(false)
    }
  }

  async function deleteApiSetting(key: ApiSettingKey) {
    setProductBusy(true)
    try {
      const next = await clearApiSetting(key)
      setApiSettings(next.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The setting could not be deleted')
    } finally {
      setProductBusy(false)
    }
  }

  if (loading && !snapshot) {
    return (
      <main className="app loading-state">
        <div className="loader-panel">
          <div className="brand-mark">MR</div>
          <h1>{APP_COPY.brand}</h1>
          <p>{APP_COPY.loading}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setActiveTab(DEFAULT_ACTIVE_TAB)}>
          <span className="brand-mark">MR</span>
          <span>
            <strong>{APP_COPY.brand}</strong>
            <small>{APP_COPY.tagline}</small>
          </span>
        </button>

        <div className="market-pill" data-open={snapshot?.marketStatus.open ? 'true' : 'false'}>
          <Wifi size={16} />
          <span>{snapshot?.marketStatus.label ?? 'Market'}</span>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={APP_COPY.searchPlaceholder}
            aria-label="Search stocks"
          />
          {query.trim() ? (
            <div className="search-results">
              {searchMatches.map((row) => (
                <button key={row.symbol} type="button" onClick={() => selectSymbol(row.symbol)}>
                  <span>{row.symbol}</span>
                  <small>{row.name}</small>
                  <strong>{usd(row.price)}</strong>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="icon-button" type="button" onClick={() => void loadSnapshot()} aria-label="Refresh">
          <RefreshCw size={18} />
        </button>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TAB_DEFINITIONS.map((tab) => {
          const Icon = tabIcons[tab.id]
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {error ? (
        <div className="error-banner">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="workspace">
        <aside className="left-rail">
          <Panel title="Watchlist" action={`${watchRows.length} assets`}>
            <div className="index-strip">
              {rows
                .filter((row) => INDEX_SYMBOLS.includes(row.symbol))
                .map((row) => (
                  <button key={row.symbol} type="button" onClick={() => selectSymbol(row.symbol)}>
                    <span>{row.symbol}</span>
                    <strong>{usd(row.price)}</strong>
                    <Change value={row.changePercent} />
                  </button>
                ))}
            </div>
            <div className="watch-list">
              {watchRows.map((row) => (
                <button
                  className={selectedSymbol === row.symbol ? 'watch-row selected' : 'watch-row'}
                  key={row.symbol}
                  type="button"
                  onClick={() => selectSymbol(row.symbol)}
                >
                  <Avatar symbol={row.symbol} />
                  <span className="watch-name">
                    <strong>{row.symbol}</strong>
                    <small>{row.name}</small>
                  </span>
                  <Sparkline row={row} />
                  <span className="watch-price">
                    <strong>{usd(row.price)}</strong>
                    <Change value={row.changePercent} />
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Alerts" action={`${alertRows.filter((alert) => alert.triggered).length} active`}>
            <div className="alert-list">
              {alertRows.slice(0, ALERT_PREVIEW_LIMIT).map((alert) => (
                <div className={alert.triggered ? 'alert-row triggered' : 'alert-row'} key={alert.id}>
                  <Bell size={16} />
                  <span>
                    <strong>{alert.symbol}</strong>
                    <small>
                      {alert.side === 'above' ? 'Above' : 'Below'} {usd(alert.price)}
                    </small>
                  </span>
                  <button
                    className="ghost-icon"
                    type="button"
                    onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}
                    aria-label={`Delete ${alert.symbol} alert`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        <section className="main-stage">
          {activeTab === 'market' ? (
            <MarketView
              rows={rows}
              selected={selected}
              history={history}
              chartMode={chartMode}
              range={range}
              setRange={setRange}
              setChartMode={setChartMode}
              toggleWatch={toggleWatch}
              watchlist={watchlist}
              addAlert={addAlert}
              ideas={snapshot?.ideas ?? []}
              news={snapshot?.news ?? []}
              breadth={snapshot?.breadth}
              selectSymbol={selectSymbol}
            />
          ) : null}

          {activeTab === 'screener' ? (
            <ScreenerView
              rows={filteredRows}
              sectors={sectors}
              sector={sector}
              signal={signal}
              priceMax={priceMax}
              rsiMax={rsiMax}
              setSector={setSector}
              setSignal={setSignal}
              setPriceMax={setPriceMax}
              setRsiMax={setRsiMax}
              selectSymbol={selectSymbol}
              toggleWatch={toggleWatch}
              watchlist={watchlist}
            />
          ) : null}

          {activeTab === 'news' ? (
            <NewsView marketNews={snapshot?.news ?? []} symbolNews={symbolNews} selected={selected} />
          ) : null}

          {activeTab === 'decisions' ? (
            <DecisionDeskView
              signal={selectedSignal}
              signals={signals}
              dataHealth={dataHealth}
              journal={decisionJournal}
              portfolio={realPortfolio}
              selectedSymbol={selectedSymbol}
              selectSymbol={selectSymbol}
              refreshSignals={forceRefreshSignals}
              productBusy={productBusy}
              note={decisionNote}
              thesis={decisionThesis}
              invalidation={decisionInvalidation}
              reviewDate={decisionReviewDate}
              setNote={setDecisionNote}
              setThesis={setDecisionThesis}
              setInvalidation={setDecisionInvalidation}
              setReviewDate={setDecisionReviewDate}
              submitDecision={submitDecision}
            />
          ) : null}

          {activeTab === 'apis' ? (
            <ApiSettingsView
              settings={apiSettings}
              form={apiForm}
              setForm={setApiForm}
              saveSettings={submitApiSettings}
              clearSetting={deleteApiSetting}
              productBusy={productBusy}
            />
          ) : null}

          {activeTab === 'portfolio' ? (
            <PortfolioView
              portfolio={portfolio}
              cash={paper.cash}
              selectSymbol={selectSymbol}
              realPortfolio={realPortfolio}
              csvText={csvText}
              setCsvText={setCsvText}
              importPortfolio={submitPortfolioImport}
              productBusy={productBusy}
            />
          ) : null}

          {activeTab === 'paper' ? (
            <PaperTradingView
              selected={selected}
              orderQty={orderQty}
              orderSide={orderSide}
              setOrderQty={setOrderQty}
              setOrderSide={setOrderSide}
              submitTrade={submitTrade}
              paper={paper}
              portfolio={portfolio}
              resetPaper={() => setPaper(createDefaultPaperState())}
            />
          ) : null}
        </section>

        <aside className="right-rail">
          <Panel title="Educational idea" action={selected?.signal ?? 'Radar'}>
            {selected ? <IdeaCard row={selected} /> : null}
          </Panel>
          <Panel title="Decision signal" action={selectedSignal?.action ?? 'No Signal'}>
            <SignalMini signal={selectedSignal} />
          </Panel>
          <Panel title="News" action={sourceLabel(snapshot?.newsSource ?? 'demo')}>
            <NewsList items={[...symbolNews, ...(snapshot?.news ?? [])].slice(0, NEWS_PREVIEW_LIMIT)} compactMode />
          </Panel>
          <Panel title="Paper trading" action={usd(portfolio.equity)}>
            <div className="paper-mini">
              <Metric label="Cash" value={usd(paper.cash)} />
              <Metric label="Invested" value={usd(portfolio.marketValue)} />
              <Metric label="Positions" value={`${portfolio.positions.length}`} />
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  )
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {action ? <span>{action}</span> : null}
      </div>
      {children}
    </section>
  )
}

function MarketView({
  rows,
  selected,
  history,
  chartMode,
  range,
  setRange,
  setChartMode,
  toggleWatch,
  watchlist,
  addAlert,
  ideas,
  news,
  breadth,
  selectSymbol,
}: {
  rows: ScreenerRow[]
  selected?: ScreenerRow
  history: Candle[]
  chartMode: ChartMode
  range: string
  setRange: (range: string) => void
  setChartMode: (mode: ChartMode) => void
  toggleWatch: (symbol: string) => void
  watchlist: string[]
  addAlert: () => void
  ideas: ScreenerRow[]
  news: NewsItem[]
  breadth?: Snapshot['breadth']
  selectSymbol: (symbol: string) => void
}) {
  if (!selected) return null
  const movers = [...rows]
    .filter((row) => row.kind === 'stock')
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, MOVERS_PREVIEW_LIMIT)
  return (
    <div className="market-view">
      <section className="hero-panel">
        <div className="symbol-header">
          <Avatar symbol={selected.symbol} large />
          <div>
            <span className="section-label">Stocks, ETFs, and market indexes</span>
            <h1>{selected.symbol}</h1>
            <p>{selected.name}</p>
          </div>
          <div className="quote-stack">
            <strong>{usd(selected.price)}</strong>
            <Change value={selected.changePercent} />
          </div>
        </div>

        <div className="toolbar-row">
          <div className="segmented">
            {CHART_MODE_OPTIONS.map((mode) => {
              const Icon = chartModeIcons[mode.id]
              return (
                <button key={mode.id} type="button" className={chartMode === mode.id ? 'active' : ''} onClick={() => setChartMode(mode.id)}>
                  <Icon size={16} />
                  {mode.label}
                </button>
              )
            })}
          </div>
          <div className="segmented compact-segment">
            {CHART_RANGES.map((item) => (
              <button key={item} type="button" className={range === item ? 'active' : ''} onClick={() => setRange(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <MarketChart history={history} mode={chartMode} />

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => toggleWatch(selected.symbol)}>
            <Star size={17} />
            {watchlist.includes(selected.symbol) ? 'In watchlist' : 'Add to watchlist'}
          </button>
          <button type="button" className="secondary-button" onClick={addAlert}>
            <Bell size={17} />
            Create alert
          </button>
        </div>
      </section>

      <div className="metric-grid">
        <Metric label="RSI" value={`${number(selected.rsi, 1)}`} tone={selected.rsi > 70 ? 'bad' : selected.rsi > 45 ? 'good' : 'neutral'} />
        <Metric label="SMA 20" value={usd(selected.sma20)} />
        <Metric label="Volume" value={compact(selected.volume)} />
        <Metric label="Score" value={`${selected.score}/100`} tone={selected.score >= 70 ? 'good' : 'neutral'} />
      </div>

      <div className="split-grid">
        <Panel title="AI research ideas" action="educational">
          <div className="idea-grid">
            {ideas.map((row) => (
              <button key={row.symbol} className="idea-button" type="button" onClick={() => selectSymbol(row.symbol)}>
                <span>
                  <strong>{row.symbol}</strong>
                  <small>{row.signal}</small>
                </span>
                <b>{row.score}</b>
                <Change value={row.performance1M} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Market movers" action="today">
          <div className="mover-list">
            {movers.map((row) => (
              <button key={row.symbol} type="button" onClick={() => selectSymbol(row.symbol)}>
                <span>{row.symbol}</span>
                <small>{row.industry}</small>
                <Change value={row.changePercent} />
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Advancers/Decliners" action={`${breadth?.advancers ?? 0}/${breadth?.decliners ?? 0}`}>
        <BreadthChart breadth={breadth} />
      </Panel>

      <Panel title="Latest news" action="Nasdaq / Radar">
        <NewsList items={news.slice(0, 4)} />
      </Panel>
    </div>
  )
}

function MarketChart({ history, mode }: { history: Candle[]; mode: ChartMode }) {
  if (!history.length) {
    return <div className="chart-empty">No price history available</div>
  }
  const data = history.slice(-90)
  if (mode === 'candles') return <CandlestickChart data={data} />
  if (mode === 'bars') {
    return (
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ left: 10, right: 8, top: 12, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="date" minTickGap={32} tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(5)} />
            <YAxis domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} width={62} tickFormatter={(value) => number(Number(value), 0)} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="close" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }
  return <LineSvgChart data={data} />
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <small>{label}</small>
      <strong>{usd(Number(payload[0].value))}</strong>
    </div>
  )
}

function CandlestickChart({ data }: { data: Candle[] }) {
  const width = 720
  const height = 280
  const padding = 26
  const min = Math.min(...data.map((item) => item.low))
  const max = Math.max(...data.map((item) => item.high))
  const span = max - min || 1
  const xStep = (width - padding * 2) / Math.max(1, data.length - 1)
  const y = (value: number) => height - padding - ((value - min) / span) * (height - padding * 2)

  return (
    <div className="chart-shell candle-shell">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Candlestick chart">
        <g className="grid-lines">
          {[0, 1, 2, 3].map((line) => {
            const lineY = padding + line * ((height - padding * 2) / 3)
            return <line key={line} x1={padding} x2={width - padding} y1={lineY} y2={lineY} />
          })}
        </g>
        {data.map((item, index) => {
          const x = padding + index * xStep
          const up = item.close >= item.open
          const bodyY = y(Math.max(item.open, item.close))
          const bodyHeight = Math.max(2, Math.abs(y(item.open) - y(item.close)))
          return (
            <g key={item.date} className={up ? 'candle up' : 'candle down'}>
              <line x1={x} x2={x} y1={y(item.high)} y2={y(item.low)} />
              <rect x={x - 3.2} y={bodyY} width={6.4} height={bodyHeight} rx={1.5} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LineSvgChart({ data }: { data: Candle[] }) {
  const width = 720
  const height = 280
  const paddingX = 44
  const paddingY = 28
  const min = Math.min(...data.map((item) => item.low))
  const max = Math.max(...data.map((item) => item.high))
  const span = max - min || 1
  const xStep = (width - paddingX * 2) / Math.max(1, data.length - 1)
  const y = (value: number) => height - paddingY - ((value - min) / span) * (height - paddingY * 2)
  const points = data.map((item, index) => `${paddingX + index * xStep},${y(item.close)}`).join(' ')
  const areaPoints = `${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`
  const labels = [max, min + span * 0.66, min + span * 0.33, min]

  return (
    <div className="chart-shell line-shell">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
        <defs>
          <linearGradient id="customLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="grid-lines">
          {labels.map((label) => (
            <line key={label} x1={paddingX} x2={width - paddingX} y1={y(label)} y2={y(label)} />
          ))}
        </g>
        <polygon className="line-area" points={areaPoints} />
        <polyline className="line-path" points={points} />
        {labels.map((label) => (
          <text key={label} x={4} y={y(label) + 4}>
            {number(label, 0)}
          </text>
        ))}
        <text x={paddingX} y={height - 5}>
          {data[0]?.date.slice(5)}
        </text>
        <text x={width - paddingX - 38} y={height - 5}>
          {data.at(-1)?.date.slice(5)}
        </text>
      </svg>
    </div>
  )
}

function ScreenerView({
  rows,
  sectors,
  sector,
  signal,
  priceMax,
  rsiMax,
  setSector,
  setSignal,
  setPriceMax,
  setRsiMax,
  selectSymbol,
  toggleWatch,
  watchlist,
}: {
  rows: ScreenerRow[]
  sectors: string[]
  sector: string
  signal: string
  priceMax: number
  rsiMax: number
  setSector: (value: string) => void
  setSignal: (value: string) => void
  setPriceMax: (value: number) => void
  setRsiMax: (value: number) => void
  selectSymbol: (symbol: string) => void
  toggleWatch: (symbol: string) => void
  watchlist: string[]
}) {
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Stock screener</span>
          <h1>Find stocks worth researching</h1>
          <p>Technical, fundamental, and descriptive filters for independent research.</p>
        </div>
        <div className="risk-note">Not financial advice</div>
      </div>

      <section className="filter-panel">
        <label>
          Sector
          <select value={sector} onChange={(event) => setSector(event.target.value)}>
            {sectors.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Signal
          <select value={signal} onChange={(event) => setSignal(event.target.value)}>
            {SIGNAL_FILTERS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Max price {usd(priceMax)}
          <input type="range" min="10" max="800" step="10" value={priceMax} onChange={(event) => setPriceMax(Number(event.target.value))} />
        </label>
        <label>
          RSI max. {rsiMax}
          <input type="range" min="35" max="95" step="1" value={rsiMax} onChange={(event) => setRsiMax(Number(event.target.value))} />
        </label>
      </section>

      <div className="screener-table" role="table" aria-label="Stock screener">
        <div className="table-row table-head" role="row">
          <span>Asset</span>
          <span>Price</span>
          <span>RSI</span>
          <span>P/E</span>
          <span>Volume</span>
          <span>Score</span>
          <span></span>
        </div>
        {rows.map((row) => (
          <div className="table-row" key={row.symbol} role="row">
            <button type="button" className="asset-cell" onClick={() => selectSymbol(row.symbol)}>
              <Avatar symbol={row.symbol} />
              <span>
                <strong>{row.symbol}</strong>
                <small>{row.name}</small>
              </span>
            </button>
            <span>
              <strong>{usd(row.price)}</strong>
              <Change value={row.changePercent} />
            </span>
            <span>{number(row.rsi, 1)}</span>
            <span>{row.pe ? number(row.pe, 1) : 'N/A'}</span>
            <span>{compact(row.volume)}</span>
            <span>
              <b className={`score-pill ${row.score >= 70 ? 'strong' : ''}`}>{row.score}</b>
              <small>{row.signal}</small>
            </span>
            <button className="icon-button table-action" type="button" onClick={() => toggleWatch(row.symbol)} aria-label={`Watchlist ${row.symbol}`}>
              <Star size={16} fill={watchlist.includes(row.symbol) ? 'currentColor' : 'none'} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function NewsView({ marketNews, symbolNews, selected }: { marketNews: NewsItem[]; symbolNews: NewsItem[]; selected?: ScreenerRow }) {
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Finance News</span>
          <h1>News and market moves</h1>
          <p>Market feed and headlines linked to the selected ticker.</p>
        </div>
      </div>
      <div className="split-grid">
        <Panel title={`${selected?.symbol ?? 'Ticker'} news`} action="selected">
          <NewsList items={symbolNews} />
        </Panel>
        <Panel title="Broad market" action="latest">
          <NewsList items={marketNews} />
        </Panel>
      </div>
    </div>
  )
}

function ApiSettingsView({
  settings,
  form,
  setForm,
  saveSettings,
  clearSetting,
  productBusy,
}: {
  settings: ApiSettingStatus[]
  form: Record<ApiSettingKey, string>
  setForm: (value: Record<ApiSettingKey, string>) => void
  saveSettings: () => Promise<void>
  clearSetting: (key: ApiSettingKey) => Promise<void>
  productBusy: boolean
}) {
  const settingsByKey = new Map(settings.map((setting) => [setting.key, setting]))
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Provider settings</span>
          <h1>Market data and DeepSeek providers</h1>
          <p>Prefer environment variables. Local storage is available for development and never returns secrets to the browser.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void saveSettings()} disabled={productBusy}>
          <Save size={17} />
          Save
        </button>
      </div>

      <section className="api-settings-grid">
        {API_FIELDS.map((field) => {
          const status = settingsByKey.get(field.key)
          const lockedByEnv = status?.source === 'env'
          return (
            <div className="api-setting-card" key={field.key}>
              <div className="api-setting-head">
                <span>
                  <strong>{field.label}</strong>
                  <small>{field.helper}</small>
                </span>
                <b className={`setting-source ${status?.source ?? 'missing'}`}>{status?.source ?? 'missing'}</b>
              </div>
              <label>
                {field.key}
                <input
                  type={field.secret ? 'password' : 'text'}
                  value={field.secret ? form[field.key] : form[field.key] || status?.displayValue || ''}
                  placeholder={status?.configured ? status.displayValue || 'configured' : 'Not configured'}
                  disabled={lockedByEnv}
                  onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                />
              </label>
              <div className="api-setting-foot">
                <small>{status?.updatedAt ? `Updated ${timeAgo(status.updatedAt)}` : lockedByEnv ? 'Set by environment variable' : 'Not saved'}</small>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={productBusy || lockedByEnv}
                  onClick={() => void clearSetting(field.key)}
                >
                  <Trash2 size={15} />
                  Delete local value
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <Panel title="Security rules" action="local">
        <div className="settings-notes">
          <p>Environment variables take precedence and are the recommended option.</p>
          <p>Saving in the app stores keys unencrypted in local SQLite, which must never be committed.</p>
          <p>After saving, refresh signals to test the new provider.</p>
        </div>
      </Panel>
    </div>
  )
}

function DecisionDeskView({
  signal,
  signals,
  dataHealth,
  journal,
  portfolio,
  selectedSymbol,
  selectSymbol,
  refreshSignals,
  productBusy,
  note,
  thesis,
  invalidation,
  reviewDate,
  setNote,
  setThesis,
  setInvalidation,
  setReviewDate,
  submitDecision,
}: {
  signal: SignalRun | null
  signals: SignalRun[]
  dataHealth: ProviderStatus[]
  journal: DecisionJournalEntry[]
  portfolio: PortfolioSummary | null
  selectedSymbol: string
  selectSymbol: (symbol: string) => void
  refreshSignals: () => Promise<void>
  productBusy: boolean
  note: string
  thesis: string
  invalidation: string
  reviewDate: string
  setNote: (value: string) => void
  setThesis: (value: string) => void
  setInvalidation: (value: string) => void
  setReviewDate: (value: string) => void
  submitDecision: (decision: JournalDecision) => Promise<void>
}) {
  const selectedJournal = journal.filter((entry) => entry.symbol === selectedSymbol)
  const topSignals = signals.filter((item) => item.decisionGrade).slice(0, TOP_SIGNALS_LIMIT)
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Decision Desk</span>
          <h1>Buy / Hold / Sell auditable</h1>
          <p>Hourly signals for a weeks-to-months horizon, with data lineage, model evidence, risks, and a journal.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshSignals()} disabled={productBusy}>
          <RefreshCw size={17} />
          {productBusy ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <section className="decision-hero">
        {signal ? (
          <>
            <div className="decision-main">
              <Avatar symbol={signal.symbol} large />
              <div>
                <span className="section-label">{signal.asset.market} / {signal.asset.currency}</span>
                <h1>{signal.symbol}</h1>
                <p>{signal.asset.name}</p>
              </div>
              <DecisionBadge action={signal.action} />
            </div>
            <div className="metric-grid">
              <Metric label="Combined score" value={signal.decisionGrade ? `${signal.score}/100` : 'No signal'} tone={signal.action === 'Buy' ? 'good' : signal.action === 'Sell' ? 'bad' : 'neutral'} />
              <Metric label="Confidence" value={`${signal.confidence}/100`} />
              <Metric label="Rules / ML" value={`${signal.ruleScore}/${signal.mlScore}`} />
              <Metric label="Source" value={`${signal.dataProvider} · ${signal.sourceKind}`} />
            </div>
            {!signal.decisionGrade ? (
              <div className="data-warning">
                <ShieldAlert size={18} />
                <span>{signal.reasonUnavailable ?? 'Insufficient data for a decision-grade signal.'}</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="empty-copy">Loading signal for {selectedSymbol}...</p>
        )}
      </section>

      {signal ? (
        <div className="split-grid">
          <Panel title="Evidence" action={signal.modelVersion}>
            <EvidenceList evidence={signal.evidence} />
          </Panel>
          <Panel title="Visible risks" action="aggressive profile">
            <RiskList risks={signal.risks} />
          </Panel>
        </div>
      ) : null}

      {signal?.narrative ? (
        <Panel title="DeepSeek Pro / Analysis" action={signal.narrative.provider}>
          <NarrativePanel narrative={signal.narrative} />
        </Panel>
      ) : (
        <Panel title="Narrative analysis" action="DeepSeek Pro">
          <p className="empty-copy">Open this tab on a ticker to generate or load its cached narrative analysis.</p>
        </Panel>
      )}

      <div className="split-grid">
        <Panel title="Decision journal" action={selectedSymbol}>
          <div className="journal-form">
            <label>
              Thesis
              <textarea value={thesis} onChange={(event) => setThesis(event.target.value)} placeholder="Why this decision makes sense" />
            </label>
            <label>
              Invalidation
              <textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} placeholder="What evidence would change this decision" />
            </label>
            <label>
              Note
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Personal context, position size, and open questions" />
            </label>
            <label>
              Review date
              <input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
            </label>
            <div className="decision-actions">
              <button className="primary-button" type="button" disabled={!signal || productBusy} onClick={() => void submitDecision('accepted')}>
                <CheckCircle2 size={17} />
                Accept
              </button>
              <button className="secondary-button" type="button" disabled={!signal || productBusy} onClick={() => void submitDecision('watch')}>
                <Bell size={17} />
                Watch
              </button>
              <button className="secondary-button danger-button" type="button" disabled={!signal || productBusy} onClick={() => void submitDecision('rejected')}>
                <Trash2 size={17} />
                Reject
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="History" action={`${selectedJournal.length} entries`}>
          <JournalList items={selectedJournal} />
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Top signals" action="decision-grade">
          <div className="signal-list">
            {topSignals.length ? (
              topSignals.map((item) => (
                <button key={item.symbol} type="button" onClick={() => selectSymbol(item.symbol)}>
                  <span>
                    <strong>{item.symbol}</strong>
                    <small>{item.asset.market} · {item.asset.sector}</small>
                  </span>
                  <DecisionBadge action={item.action} compact />
                  <b>{item.score}</b>
                </button>
              ))
            ) : (
              <p className="empty-copy">No auditable signals are available yet.</p>
            )}
          </div>
        </Panel>
        <Panel title="Data health" action={`${dataHealth.filter((item) => item.ok).length}/${dataHealth.length}`}>
          <DataHealthList providers={dataHealth} />
        </Panel>
      </div>

      <Panel title="Imported portfolio" action={portfolioValueLabel(portfolio)}>
        <RealPortfolioSummary portfolio={portfolio} />
      </Panel>
    </div>
  )
}

function PortfolioView({
  portfolio,
  cash,
  selectSymbol,
  realPortfolio,
  csvText,
  setCsvText,
  importPortfolio,
  productBusy,
}: {
  portfolio: {
    positions: Array<{ symbol: string; qty: number; avgPrice: number; price: number; marketValue: number; pnl: number; pnlPercent: number; row?: ScreenerRow }>
    marketValue: number
    equity: number
  }
  cash: number
  selectSymbol: (symbol: string) => void
  realPortfolio: PortfolioSummary | null
  csvText: string
  setCsvText: (value: string) => void
  importPortfolio: () => Promise<void>
  productBusy: boolean
}) {
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Portfolio tracker</span>
          <h1>Portfolio workspace</h1>
          <p>Positions, cash, and P&amp;L marked against the best available quotes.</p>
        </div>
      </div>
      <Panel title="Imported portfolio" action={portfolioValueLabel(realPortfolio)}>
        <div className="portfolio-import">
          <label>
            CSV: symbol,qty,avgPrice
            <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          </label>
          <button className="primary-button" type="button" disabled={productBusy} onClick={() => void importPortfolio()}>
            <FileUp size={17} />
            Import portfolio
          </button>
        </div>
        <RealPortfolioSummary portfolio={realPortfolio} />
      </Panel>
      <div className="metric-grid">
        <Metric label="Equity" value={usd(portfolio.equity)} tone="good" />
        <Metric label="Cash" value={usd(cash)} />
        <Metric label="Invested" value={usd(portfolio.marketValue)} />
        <Metric label="Positions" value={`${portfolio.positions.length}`} />
      </div>
      <div className="position-list">
        {portfolio.positions.map((position) => (
          <button key={position.symbol} type="button" onClick={() => selectSymbol(position.symbol)}>
            <Avatar symbol={position.symbol} />
            <span>
              <strong>{position.symbol}</strong>
              <small>
                {number(position.qty, 2)} shares @ {usd(position.avgPrice)}
              </small>
            </span>
            <span>
              <strong>{usd(position.marketValue)}</strong>
              <Change value={position.pnlPercent} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PaperTradingView({
  selected,
  orderQty,
  orderSide,
  setOrderQty,
  setOrderSide,
  submitTrade,
  paper,
  portfolio,
  resetPaper,
}: {
  selected?: ScreenerRow
  orderQty: string
  orderSide: OrderSide
  setOrderQty: (value: string) => void
  setOrderSide: (value: OrderSide) => void
  submitTrade: () => void
  paper: PaperState
  portfolio: {
    positions: Array<{ symbol: string; qty: number; avgPrice: number; price: number; marketValue: number; pnl: number; pnlPercent: number }>
    marketValue: number
    equity: number
  }
  resetPaper: () => void
}) {
  return (
    <div className="feature-view">
      <div className="view-heading">
        <div>
          <span className="section-label">Paper trading</span>
          <h1>Market simulator</h1>
          <p>Practice unlimited buys and sells without using real money.</p>
        </div>
        <button className="secondary-button" type="button" onClick={resetPaper}>
          Reset
        </button>
      </div>

      <div className="trade-ticket">
        <div>
          <span>Order</span>
          <strong>
            {selected?.symbol ?? DEFAULT_SYMBOL} @ {selected ? usd(selected.price) : '--'}
          </strong>
        </div>
        <div className="segmented">
          {ORDER_SIDE_OPTIONS.map((side) => (
            <button key={side.id} type="button" className={orderSide === side.id ? 'active' : ''} onClick={() => setOrderSide(side.id)}>
              {side.label}
            </button>
          ))}
        </div>
        <label>
          Quantity
          <input value={orderQty} onChange={(event) => setOrderQty(event.target.value)} inputMode="decimal" />
        </label>
        <button className="primary-button" type="button" onClick={submitTrade}>
          Execute paper trade
        </button>
      </div>

      <div className="metric-grid">
        <Metric label="Cash" value={usd(paper.cash)} />
        <Metric label="Equity" value={usd(portfolio.equity)} tone="good" />
        <Metric label="Invested" value={usd(portfolio.marketValue)} />
        <Metric label="Trades" value={`${paper.trades.length}`} />
      </div>

      <Panel title="Trade history" action="local">
        <div className="trade-list">
          {paper.trades.slice(0, JOURNAL_PREVIEW_LIMIT).map((trade) => (
            <div key={trade.id}>
              <span className={trade.side === 'buy' ? 'buy-dot' : 'sell-dot'}>{trade.side === 'buy' ? 'BUY' : 'SELL'}</span>
              <strong>{trade.symbol}</strong>
              <span>
                {number(trade.qty, 2)} @ {usd(trade.price)}
              </span>
              <small>{timeAgo(trade.createdAt)}</small>
            </div>
          ))}
          {!paper.trades.length ? <p className="empty-copy">No trades yet.</p> : null}
        </div>
      </Panel>
    </div>
  )
}

function DecisionBadge({ action, compact = false }: { action: SignalRun['action']; compact?: boolean }) {
  return <span className={`decision-badge ${action.toLowerCase().replace(' ', '-')} ${compact ? 'compact' : ''}`}>{action}</span>
}

function SignalMini({ signal }: { signal: SignalRun | null }) {
  if (!signal) return <p className="empty-copy">No signal loaded.</p>
  return (
    <div className="signal-mini">
      <div className="idea-top">
        <Avatar symbol={signal.symbol} />
        <span>
          <strong>{signal.symbol}</strong>
          <small>{signal.dataProvider} · {signal.sourceKind}</small>
        </span>
        <DecisionBadge action={signal.action} compact />
      </div>
      <p>{signal.decisionGrade ? `Score ${signal.score}/100 with ${signal.confidence}/100 confidence.` : signal.reasonUnavailable}</p>
      <div className="scenario-bars signal-bars">
        <span style={{ width: `${Math.max(12, signal.ruleScore)}%` }}>Rules</span>
        <span style={{ width: `${Math.max(12, signal.mlScore)}%` }}>ML</span>
        <span style={{ width: `${Math.max(12, signal.confidence)}%` }}>Confidence</span>
      </div>
    </div>
  )
}

function EvidenceList({ evidence }: { evidence: SignalEvidence[] }) {
  if (!evidence.length) return <p className="empty-copy">No evidence available.</p>
  return (
    <div className="evidence-list">
      {evidence.map((item) => (
        <div key={item.label} className={`evidence-row ${item.tone}`}>
          <span>
            <strong>{item.label}</strong>
            <small>{item.value}</small>
          </span>
          <b>{item.contribution > 0 ? '+' : ''}{number(item.contribution, 1)}</b>
        </div>
      ))}
    </div>
  )
}

function RiskList({ risks }: { risks: SignalRisk[] }) {
  if (!risks.length) return <p className="empty-copy">No calculated risks.</p>
  return (
    <div className="risk-list">
      {risks.map((risk) => (
        <div key={risk.label} className={`risk-row ${risk.severity}`}>
          <ShieldAlert size={16} />
          <span>
            <strong>{risk.label}</strong>
            <small>{risk.value}</small>
          </span>
        </div>
      ))}
    </div>
  )
}

function NarrativePanel({ narrative }: { narrative: NonNullable<SignalRun['narrative']> }) {
  return (
    <div className="narrative-panel">
      <p>{narrative.summary}</p>
      <div className="split-grid">
        <div>
          <h3>Bull case</h3>
          <ul>
            {narrative.bullCase.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Bear case</h3>
          <ul>
            {narrative.bearCase.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <h3>Watch</h3>
        <ul>
          {narrative.watchItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function JournalList({ items }: { items: DecisionJournalEntry[] }) {
  if (!items.length) return <p className="empty-copy">No saved decisions for this ticker.</p>
  return (
    <div className="journal-list">
      {items.slice(0, JOURNAL_PREVIEW_LIMIT).map((item) => (
        <div key={item.id}>
          <span className={`journal-status ${item.userDecision}`}>{decisionLabel(item.userDecision)}</span>
          <strong>{item.signalAction}</strong>
          <small>{timeAgo(item.createdAt)}</small>
          <p>{item.thesis || item.note || 'No note.'}</p>
        </div>
      ))}
    </div>
  )
}

function decisionLabel(decision: JournalDecision) {
  if (decision === 'accepted') return 'Accepted'
  if (decision === 'rejected') return 'Rejected'
  return 'Watching'
}

function DataHealthList({ providers }: { providers: ProviderStatus[] }) {
  if (!providers.length) return <p className="empty-copy">No provider readings yet.</p>
  return (
    <div className="data-health-list">
      {providers.map((provider) => (
        <div key={`${provider.provider}-${provider.market}`} className={provider.ok ? 'provider-ok' : 'provider-fail'}>
          <Database size={16} />
          <span>
            <strong>{provider.provider}</strong>
            <small>{provider.market} · {provider.sourceKind}</small>
          </span>
          <b>{provider.ok ? 'OK' : 'Failed'}</b>
        </div>
      ))}
    </div>
  )
}

function moneyByCurrency(value: number, currency: 'USD' | 'MXN') {
  return currency === 'USD' ? usd(value) : `${number(value, 0)} MXN`
}

function portfolioValueLabel(portfolio: PortfolioSummary | null) {
  if (!portfolio || !portfolio.positions.length) return 'not imported'
  if (portfolio.currencyTotals.length === 1) {
    const total = portfolio.currencyTotals[0]
    return moneyByCurrency(total.marketValue, total.currency)
  }
  return `${portfolio.currencyTotals.length} currencies`
}

function RealPortfolioSummary({ portfolio }: { portfolio: PortfolioSummary | null }) {
  if (!portfolio || !portfolio.positions.length) return <p className="empty-copy">Import a portfolio to review concentration risk and P&amp;L.</p>
  return (
    <>
      <div className="currency-total-list">
        {portfolio.currencyTotals.map((total) => (
          <span key={total.currency}>
            <strong>{moneyByCurrency(total.marketValue, total.currency)}</strong>
            <small>{total.currency} · P&L {moneyByCurrency(total.pnl, total.currency)}</small>
          </span>
        ))}
      </div>
      <div className="real-portfolio-list">
        {portfolio.positions.map((position) => (
          <div key={position.symbol}>
            <span>
              <strong>{position.symbol}</strong>
              <small>{position.market} · {number(position.qty, 2)} @ {moneyByCurrency(position.avgPrice, position.currency)}</small>
            </span>
            <span>
              <strong>{moneyByCurrency(position.marketValue, position.currency)}</strong>
              <Change value={position.pnlPercent} />
            </span>
            <b>{number(position.weight, 1)}%</b>
          </div>
        ))}
      </div>
    </>
  )
}

function NewsList({ items, compactMode = false }: { items: NewsItem[]; compactMode?: boolean }) {
  if (!items.length) return <p className="empty-copy">No news available.</p>
  return (
    <div className={compactMode ? 'news-list compact-news' : 'news-list'}>
      {items.map((item) => (
        <a href={item.url} target="_blank" rel="noreferrer" key={item.id || item.url}>
          <span className="news-meta">
            <b>{item.category}</b>
            <small>{timeAgo(item.publishedAt)}</small>
          </span>
          <strong>{item.title}</strong>
          {!compactMode ? <p>{item.summary}</p> : null}
          <span className="ticker-chip">{item.symbol}</span>
        </a>
      ))}
    </div>
  )
}

function IdeaCard({ row }: { row: ScreenerRow }) {
  return (
    <div className="idea-card">
      <div className="idea-top">
        <Avatar symbol={row.symbol} />
        <span>
          <strong>{row.symbol}</strong>
          <small>{row.name}</small>
        </span>
        <b>{row.signal}</b>
      </div>
      <p>
        The educational model scores {row.symbol} at {row.score}/100 using {percent(row.performance1M)} momentum, an RSI of{' '}
        {number(row.rsi, 1)}, and relative analyst consensus.
      </p>
      <div className="scenario-bars">
        <span style={{ width: `${Math.min(92, row.score)}%` }}>Base case</span>
        <span style={{ width: `${Math.max(18, row.socialScore)}%` }}>Social</span>
        <span style={{ width: `${Math.max(20, row.analystScore)}%` }}>Analysts</span>
      </div>
      <small className="disclaimer">Educational tool. It does not account for your personal financial situation.</small>
    </div>
  )
}

function BreadthChart({ breadth }: { breadth?: Snapshot['breadth'] }) {
  const buckets = breadth?.buckets ?? []
  if (!buckets.length) return <p className="empty-copy">No market breadth data available.</p>
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)
  return (
    <div className="breadth-chart">
      {buckets.map((bucket) => (
        <span key={bucket.limit}>
          <i style={{ height: `${Math.max(12, (bucket.count / max) * 100)}%` }} className={bucket.limit < 0 ? 'down-bar' : 'up-bar'} />
          <small>{bucket.limit > 0 ? `+${bucket.limit}%` : `${bucket.limit}%`}</small>
        </span>
      ))}
      <div className="breadth-total">
        <b>Decliners: {breadth?.decliners ?? 0}</b>
        <b>Advancers: {breadth?.advancers ?? 0}</b>
      </div>
    </div>
  )
}

function Sparkline({ row }: { row: ScreenerRow }) {
  const up = row.changePercent >= 0
  const points = Array.from({ length: 18 }, (_, index) => {
    const x = index * 6
    const y = 18 - Math.sin(index * 0.85 + row.symbol.length) * 5 - (up ? index * 0.35 : -index * 0.25)
    return `${x},${Math.max(4, Math.min(30, y))}`
  }).join(' ')
  return (
    <svg className={up ? 'spark up' : 'spark down'} viewBox="0 0 102 34" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Avatar({ symbol, large = false }: { symbol: string; large?: boolean }) {
  return <span className={large ? 'avatar large' : 'avatar'}>{symbol.slice(0, 1)}</span>
}

function Change({ value }: { value: number }) {
  const up = value >= 0
  return (
    <small className={up ? 'change up' : 'change down'}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {percent(value)}
    </small>
  )
}

export default App
