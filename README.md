# Market Radar

Market Radar is a local-first applied-AI lab for explainable market research, portfolio context, and decision journaling. It demonstrates an end-to-end data product: resilient ingestion, reproducible signal scoring, optional DeepSeek narratives, local persistence, and a responsive React workspace.

> Signals, scores, and AI narratives are educational research outputs. They are not financial advice or investment recommendations.

## Product preview

| Desktop | Mobile |
| --- | --- |
| ![Market Radar desktop dashboard](output/playwright/desktop-final.png) | ![Market Radar mobile dashboard](output/playwright/mobile-final.png) |

The screenshots contain only public or synthetic market data. They do not include accounts, real positions, credentials, or personal identifiers.

## What it explores

- Combines a watchlist, alerts, news, price history, and technical/fundamental screening.
- Produces explainable signals with evidence, confidence, visible risks, and provider lineage.
- Falls back to free or deterministic demo data when a provider is unavailable, and blocks decision-grade output when quality is insufficient.
- Imports a portfolio from CSV, maintains an auditable decision journal, and supports browser-based paper trading.
- Compares US and BMV data providers without coupling the interface to a single vendor.
- Generates optional structured narratives with DeepSeek while retaining a deterministic local fallback.

## Architecture

```text
React 19 + TypeScript + Vite
        │ same-origin API
        ▼
Express 5 ── providers (Polygon, Twelve Data, Alpha Vantage,
    │         Stooq, Yahoo, and deterministic demo fallback)
    ▼
Local SQLite (cache, signals, portfolio, decisions, and settings)
```

Paper trading, alerts, and watchlist state live in `localStorage`. The server creates and migrates the local database at `data/market-radar.sqlite`; runtime data is excluded from Git.

## Quick start

Requirements: Node.js 24 and npm.

```bash
git clone https://github.com/alejandrojlamas/market-radar.git
cd market-radar
npm ci
npm run dev
```

Open `http://127.0.0.1:5174`. Vite proxies `/api` to the local API at `127.0.0.1:8787`.

To run the production build locally:

```bash
npm run build
MARKET_RADAR_PORT=8797 npm run serve
```

The application is then available at `http://127.0.0.1:8797`.

## Demo and live data

No API key is required to explore the product: Stooq, Yahoo, and the deterministic demo generator provide fallbacks. External sources may enforce rate limits, become unavailable, or return delayed data. Market Radar displays provenance and refuses to present a decision-grade signal when the quality gate is not met.

For authenticated providers, set credentials in the process environment. Environment variables take precedence over values saved through the local interface:

```bash
export POLYGON_API_KEY='<YOUR_API_KEY>'
export TWELVEDATA_API_KEY='<YOUR_API_KEY>'
export ALPHAVANTAGE_API_KEY='<YOUR_API_KEY>'
export DEEPSEEK_API_KEY='<YOUR_API_KEY>'
export DEEPSEEK_MODEL='deepseek-v4-pro'
npm run serve
```

Additional settings:

| Variable | Purpose | Default |
| --- | --- | --- |
| `MARKET_RADAR_DB_PATH` | Local SQLite path | `./data/market-radar.sqlite` |
| `MARKET_RADAR_LIVE` | Set to `false` to force demo data in the main dashboard | `true` |
| `MARKET_RADAR_PORT` | API and production server port | `8787` |
| `MARKET_RADAR_HOST` | Listen interface (`127.0.0.1` or `::1`) | `127.0.0.1` |
| `MARKET_RADAR_ALLOWED_ORIGINS` | Comma-separated exact web origins | API and Vite loopback origins |
| `MARKET_RADAR_USER_AGENT` | Outbound market-data user agent | Project-specific local identifier |

The settings screen can save keys in SQLite for local development. Those values are not returned to the browser, but they remain unencrypted on disk. Prefer environment variables for serious use and never commit `data/`.

## Safe upgrade from MercadoRadar

The rebrand preserves local state:

- On first start, `data/mercadoradar.sqlite` and any WAL/SHM companions are copied to `data/market-radar.sqlite` when the new database does not yet exist. The legacy files remain as a backup.
- Existing `mercadoradar.*` browser keys are moved to the `market-radar.*` namespace after valid JSON is read.
- New `MARKET_RADAR_*` environment variables take precedence; the previous `MERCADORADAR_*` names remain accepted as a compatibility fallback.
- New clients send `x-market-radar-request: same-origin`; the API temporarily accepts the legacy mutation header for existing clients.

## Security and remote access

The API and Vite bind to loopback by default. CORS uses an exact origin allowlist, unknown `Origin` values are rejected, and mutations require a non-simple same-origin header to reduce CSRF risk.

For remote access, keep `MARKET_RADAR_HOST=127.0.0.1` and place the application behind a TLS-enabled, authenticated proxy. Configure its public origin explicitly:

```bash
MARKET_RADAR_ALLOWED_ORIGINS='https://radar.example.internal' \
MARKET_RADAR_PORT=8797 \
npm run serve
```

The proxy must authenticate every request and forward to `http://127.0.0.1:8797`. A VPN or private network reduces exposure but does not replace authentication. The server rejects non-loopback interfaces, so do not expose the port directly to the Internet. See [SECURITY.md](SECURITY.md) for the operating model and reporting channel.

## Quality gates

```bash
npm run lint
npm test
npm run build
```

The suite covers the signal engine, portfolio import, SQLite bootstrap and legacy migration, localStorage migration, and Origin/CORS/CSRF controls. GitHub Actions runs these checks on every push and pull request.

## Project structure

```text
src/                 React interface, configuration, and API client
server/              Express API, providers, signals, and persistence
tests/               unit, migration, and HTTP security tests
output/playwright/   privacy-safe product reference screenshots
scripts/             portable local launchers for macOS
```

## Known limitations

- This is not an order-execution platform and does not connect to brokerage accounts.
- Free providers may be incomplete, delayed, unavailable, or rate-limited.
- Scoring and backtesting are exploratory; they do not model fees, slippage, taxes, or a user's circumstances.
- SQLite and `localStorage` suit single-user research, not a multi-user deployment.
- The application has no built-in authentication; any remote publication requires an authenticated proxy.
