# TradeLens AI — Simple Trading Journal & Analytics Dashboard

A lightweight, responsive web trading journal that replaces an Excel spreadsheet journal.
Everything lives in **your browser's IndexedDB** — no accounts, no server, no database required,
free hosting on any static platform.

## Quick start

```bash
cd tradelens-ai
npm install
npm run dev        # http://localhost:5173
```

Production build (the output in `dist/` is what you deploy):

```bash
npm run build      # typecheck + vite build → dist/
```

Tests:

```bash
npm test           # vitest — pure engine, import, backup and persistence suites
```

## The five sections

| Section | What it does |
| --- | --- |
| **Dashboard** | 8 summary cards (total trades, net P/L, win rate, profit factor, avg win/loss, best/worst) plus cumulative P&L curve, monthly performance, win/loss distribution, per-instrument performance and rule-based psychology insights. |
| **Trade Journal** | Spreadsheet-style grid: every cell is editable, Enter commits & moves down, Tab moves right, arrow keys navigate, and rows pasted from Excel import directly. A simple form alternative (`+ Add Trade (form)`) is included. Filtering by date range, instrument, direction, win/loss/breakeven, psychology tag, free-text search, sorting and pagination. |
| **Analytics** | Full core-metrics table (20+ metrics with formulas printed at the bottom) plus five breakdowns — instrument, month, weekday, buy-vs-sell, psychology tag — each row one click away from the matching journal view. |
| **Import / Export** | Excel/CSV import with auto column mapping, per-row validation with row numbers, duplicate detection with three handling modes, CSV/XLSX/JSON export, template downloads, JSON backup/restore, clear-all-data. |
| **Settings** | Account currency, date format, dark/light theme, default instrument, per-instrument contract specs (the auto-calculation rules), sample-data loader/remover, storage & privacy documentation. |

## Getting data in

1. **Spreadsheet entry** — type into the journal grid directly, or paste rows copied from Excel (tabs-separated columns: Date, Instrument, Direction, Entry, Exit, Lots, Result).
2. **Import** — pick an existing `.xlsx/.xls/.csv` journal on Import / Export. Column names are auto-detected (aliases: Date/Trade Date, Pair/Symbol, Side/Direction, Entry, Exit, Lots/Volume, Result/P&L, Emotion/Psychology, Notes/Comments) and you can remap manually before importing. Every rejected row is shown with its source row number and the exact reason — nothing is silently dropped.
3. **CSV / XLSX template** — download, fill, import.
4. **Sample data** — load deterministic example trades from Settings; they are flagged `sample` and removable in one click.

## Result values: manual vs calculated

- Type a **manual result** in a trade's Result cell (or the form) — it is used exactly as entered.
- Press the **Σ badge** (or choose *auto-calculate* in the form) — the result is computed as
  `(exit − entry) × lots × contractSize` (sign follows direction) in the instrument's **quote currency**.
- Trades without a result count as trade rows but are **excluded from monetary metrics** and labeled unresolved — never silently treated as 0.
- A trade in a currency different from the account currency (e.g. a JPY-quoted pair under a USD account) is flagged in a yellow banner and **excluded from monetary totals**, because summing mixed currencies is meaningless. Nothing is deleted.

Accuracy rules: profit factor shows **∞** when gross loss is 0 (and "—" for empty periods);
drawdown is explicitly **trade-level** (peak-to-trough of the chronological realized stack, not intratrade);
psychology analysis is **rule-based** with sample sizes and warnings for small samples, and never claims causation.

## Backups

Data lives in IndexedDB on this device only — clearing browser site data erases it. Download a **JSON backup** from Import / Export (or the sidebar backup reminder). Restores validate the file, migrate older schemas, and ask whether to **replace** everything or **merge** (backup wins on id collisions).

## Deployment (free static hosting)

`npm run build` produces a self-contained static bundle (`dist/`). Any of these work:

| Platform | Setup |
| --- | --- |
| **Vercel** | Import the repo — `vercel.json` rewrites all routes to `index.html`. |
| **Netlify** | Import the repo — `netlify.toml` builds and adds the SPA redirect. |
| **GitHub Pages** | Push to GitHub and enable the included workflow (`.github/workflows/deploy-pages.yml`); the build publishes `dist/` with a 404 catch-all for deep links. |

## Project layout

```
tradelens-ai/
├── index.html
├── netlify.toml / vercel.json / public/_redirects / public/404.html
├── .github/workflows/deploy-pages.yml     # optional GitHub Pages deploy
└── src/
    ├── main.tsx / App.tsx                 # router + sidebar layout (5 sections)
    ├── types/                             # trade + settings/instrument models
    ├── services/
    │   ├── storage/                       # IndexedDB wrapper, repositories, sample data
    │   ├── analytics/                     # calc engine, metrics, insights, streaks
    │   ├── importExport/                  # SheetJS importer, exporter, backup/restore
    │   ├── validation/                    # precise input validation
    │   ├── filters.ts                     # journal filters + URL round-trip
    │   └── store.ts                       # single source of truth (write-through cache)
    ├── components/                        # journal grid, form modal, cards, banners
    └── pages/                             # Dashboard, Journal, Analytics, ImportExport, Settings
```

## Notes & deliberate choices

- **No backend.** The prompt makes a file-based server optional; browser-local storage is the primary
  mode, so the app deploys anywhere for free and works fully offline. JSON backup/restore compensates
  for the lack of server persistence.
- **shadcn/ui was not used** — a hand-rolled Tailwind component layer (`index.css` + small components)
  keeps the bundle small and the dependency count low; lucide-react icons + Recharts cover the UI needs.
- **JPY-quoted pairs**: automatic results are expressed in the quote currency (e.g. JPY for USDJPY);
  the mixed-currency banner keeps them out of USD totals. Manual results override everything.
- Date semantics: the stored date is a plain calendar date (`YYYY-MM-DD`); weekday/month bucketing is
  done on that date.
