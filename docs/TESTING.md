# Testing — TradeLens AI

Run everything with:

```bash
npm test
```

## What is covered (62 tests across 6 suites)

| Suite | File | Covers |
| --- | --- | --- |
| Calculation engine | `src/services/analytics/calc.test.ts` | Per-instrument P&L (BUY/SELL, fractional lots, JPY quote currency), unknown-instrument behaviour, non-finite guards, floating-point noise, outcome labels (win/loss/breakeven), half-away-from-zero rounding, money formatting. |
| Metrics engine | `src/services/analytics/metrics.test.ts` | Win/loss/break-even counts and rates, net/gross figures, PF = ∞ at zero gross loss, empty-journal nulls, missing-result exclusion, date-range filters (inclusive), mixed-currency exclusion & reporting, drawdown on the chronological curve, streaks resetting on breakeven, month/weekday/psychology/direction breakdowns, cumulative curve ordering. |
| Insight rules | `src/services/validation/index.test.ts` (insight describe) | Small-sample warnings, tag averages with sample size, correlational wording (never causal), consecutive-loss reporting, empty-data guidance, no fabricated claims. |
| Validation | `src/services/validation/index.test.ts` | US & European decimals, currency symbols, calendar-exact ISO dates, instrument/settings validation, psychology tag normalization. |
| Import | `src/services/importExport/importer.test.ts` | Column alias auto-mapping, row-number-preserving rejection, dd/mm vs US dates, Excel serial dates, breakeven (0) vs missing results, full-row duplicate fingerprints, template columns. |
| Backup/restore | `src/services/importExport/backup.test.ts` | Round-trip schema validation, non-TradeLens file rejection, newer-schema rejection, per-record validation with counts, legacy (schema-0) migration, replace vs merge restore semantics. |
| Persistence | `src/services/storage/tradesRepo.test.ts` | Fake-IndexedDB save/list/update/delete, deterministic ordering, store re-read after connection reset (the page-reload path), replace-all semantics, unknown-future-schema skipping, settings defaults & persistence. |

## Manual E2E checks (browser walkthrough)

- Empty states on Dashboard/Journal before data.
- Spreadsheet: add trade inline (persists across reload), edit result cell (persists), delete with confirm.
- Form modal: validation for missing instrument, then saves with manual result + account currency.
- Import: CSV with one valid row, one duplicate-fingerprint row, two invalid rows — invalid rows rejected **with reasons**, valid row imported; states reported accurately.
- Analytics click-through: instrument row → `/journal?instrument=XAUUSD` shows exactly the filtered trades.
- Dashboard numbers hand-verified against the sample dataset (net, win rate, PF, drawdown).
- Mixed-currency banner behaves (JPY trade excluded, not summed).
- Theme toggle dark↔light persists across reload; all pages render in both themes.
- Export buttons fire without console errors.
