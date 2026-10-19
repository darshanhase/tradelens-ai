import type { Trade } from "@/types/trade";

/**
 * Analytics engine (prompt §7). Pure, deterministic functions over trade
 * records with explicit accuracy rules:
 *  - trades without realized P&L are excluded from monetary metrics and counted
 *  - profit factor is `Infinity`/`undefined` (not 0) when gross loss is zero
 *  - drawdown is computed on the chronological cumulative curve and
 *    is explicitly labelled trade-level (not intratrade equity drawdown)
 *  - trades sharing a date sort by createdAt then id (stable, decided upstream)
 */

export interface DateRange {
  /** ISO dates inclusive; null = unbounded. */
  from: string | null;
  to: string | null;
}

export function inRange(t: Trade, range: DateRange): boolean {
  if (range.from && t.date < range.from) return false;
  if (range.to && t.date > range.to) return false;
  return true;
}

export interface CurrencyScope {
  /** Trades included in monetary aggregation (matching the account currency or unknown). */
  included: Trade[];
  /** Trades with a realized P&L in a different currency — excluded and reported. */
  excluded: Trade[];
  /** Distinct currencies among excluded trades. */
  excludedCurrencies: string[];
}

/**
 * Split trades for monetary aggregation. Trades whose manual P&L currency
 * differs from the account currency are excluded rather than silently
 * summed — preventing meaningless mixed-currency totals (prompt §7).
 */
export function currencyScope(trades: Trade[], accountCurrency: string): CurrencyScope {
  const acct = accountCurrency.toUpperCase();
  const included: Trade[] = [];
  const excluded: Trade[] = [];
  for (const t of trades) {
    if (t.realizedPnl === null) { included.push(t); continue; }
    const cur = (t.pnlCurrency ?? "").toUpperCase();
    if (!cur || cur === acct) included.push(t);
    else excluded.push(t);
  }
  return { included, excluded, excludedCurrencies: [...new Set(excluded.map((t) => (t.pnlCurrency ?? "").toUpperCase()))].sort() };
}

export interface CoreMetrics {
  /** Rows matching the period, regardless of currency/resolved result. */
  totalTrades: number;
  /** Trades with a realized P&L in scope — the denominator for monetary metrics. */
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number | null; // percent
  lossRate: number | null; // percent
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgPnl: number | null;
  avgWin: number | null;
  avgLoss: number | null; // reported as a positive magnitude
  largestWin: number | null;
  largestLoss: number | null; // negative
  /** null when no closed trades; Infinity when gross loss is zero and gross profit > 0. */
  profitFactor: number | null | typeof Infinity;
  expectancy: number | null;
  /** Trade-level maximum drawdown: largest peak-to-trough decline of the cumulative curve. */
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  /** Trades in range excluded from monetary metrics (no realized P&L yet, or other currency). */
  excludedNoResult: number;
  excludedOtherCurrency: number;
  excludedCurrencies: string[];
}

export function computeMetrics(trades: Trade[], accountCurrency: string, range: DateRange = { from: null, to: null }): CoreMetrics {
  const scoped = trades.filter((t) => inRange(t, range));
  const { included, excluded, excludedCurrencies } = currencyScope(scoped, accountCurrency);

  const closed = included.filter((t) => t.realizedPnl !== null && Number.isFinite(t.realizedPnl));
  const pnls = closed.map((t) => t.realizedPnl as number);

  const winningTradeList = pnls.filter((p) => p > 0);
  const losingTradeList = pnls.filter((p) => p < 0);
  const breakevenTrades = pnls.filter((p) => p === 0).length;

  const grossProfit = sumPositive(pnls);
  const grossLoss = Math.abs(sumNegative(pnls));
  const netPnl = total(pnls);

  // Chronological cumulative curve for the trade-level drawdown. Closed trades
  // only; the contained sort keeps same-date ties deterministic.
  const curve = chronologicalClosed(scoped).map((r) => r.pnl);
  let peak = 0;
  let running = 0;
  let maxDrawdown = 0;
  for (const p of curve) {
    running += p;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  maxDrawdown = Number(maxDrawdown.toFixed(8));

  const { wins, losses } = consecutiveStreaks(curve);

  return {
    totalTrades: scoped.length,
    closedTrades: closed.length,
    winningTrades: winningTradeList.length,
    losingTrades: losingTradeList.length,
    breakevenTrades,
    winRate: closed.length ? (winningTradeList.length / closed.length) * 100 : null,
    lossRate: closed.length ? (losingTradeList.length / closed.length) * 100 : null,
    netPnl: Number(netPnl.toFixed(8)),
    grossProfit: Number(grossProfit.toFixed(8)),
    grossLoss: Number(grossLoss.toFixed(8)),
    avgPnl: closed.length ? netPnl / closed.length : null,
    avgWin: winningTradeList.length ? grossProfit / winningTradeList.length : null,
    avgLoss: losingTradeList.length ? grossLoss / losingTradeList.length : null,
    largestWin: winningTradeList.length ? Math.max(...winningTradeList) : null,
    largestLoss: losingTradeList.length ? Math.min(...losingTradeList) : null,
    profitFactor: closed.length === 0 ? null : grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    expectancy: closed.length ? netPnl / closed.length : null,
    maxDrawdown,
    maxConsecutiveWins: wins,
    maxConsecutiveLosses: losses,
    excludedNoResult: included.length - closed.length,
    excludedOtherCurrency: excluded.length,
    excludedCurrencies,
  };
}

/** Negative sorted chronology wins/losses counted over the closed curve. */
function consecutiveStreaks(pnls: number[]): { wins: number; losses: number } {
  let wins = 0, losses = 0, cw = 0, cl = 0;
  for (const p of pnls) {
    if (p > 0) { cw++; cl = 0; }
    else if (p < 0) { cl++; cw = 0; }
    else { cw = 0; cl = 0; }
    if (cw > wins) wins = cw;
    if (cl > losses) losses = cl;
  }
  return { wins, losses };
}

/** Chronologically sorted closed rows, stable for same-date trades. */
function chronologicalClosed(trades: Trade[]): { date: string; pnl: number }[] {
  const closed = trades.filter((t) => t.realizedPnl !== null && Number.isFinite(t.realizedPnl));
  closed.sort((a, b) => (a.date === b.date ? (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
  return closed.map((t) => ({ date: t.date, pnl: t.realizedPnl as number }));
}

function total(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
function sumPositive(values: number[]): number {
  let s = 0;
  for (const v of values) if (v > 0) s += v;
  return s;
}
function sumNegative(values: number[]): number {
  let s = 0;
  for (const v of values) if (v < 0) s += v;
  return s;
}

export interface EquityPoint {
  /** Row index (1-based) for chronological plotting; avoids date-collision issues. */
  n: number;
  date: string;
  equity: number;
}

/** Cumulative realized P&L curve points (used by the dashboard chart). */
export function cumulativeCurve(trades: Trade[], range: DateRange = { from: null, to: null }): EquityPoint[] {
  const scoped = chronologicalClosed(trades.filter((t) => inRange(t, range)));
  const points: EquityPoint[] = [];
  let running = 0;
  scoped.forEach((row, i) => {
    running += row.pnl;
    points.push({ n: i + 1, date: row.date, equity: Number(running.toFixed(8)) });
  });
  return points;
}

export interface BreakdownRow {
  key: string;
  trades: number;
  closed: number;
  wins: number;
  winRate: number | null;
  netPnl: number | null;
  avgPnl: number | null;
}

export interface Breakdown {
  rows: BreakdownRow[];
  /** Non-currency metric scope problems inside this breakdown (mixed currencies). */
  mixedCurrencies: boolean;
}

type Grouper = (t: Trade) => string[];

function breakdownFrom(trades: Trade[], groupBy: Grouper, accountCurrency: string): Breakdown {
  const buckets = new Map<string, Trade[]>();
  for (const t of trades) {
    const keys = groupBy(t);
    // Trades without a group key (e.g. no tags yet) are counted under "(none)".
    for (const k of keys.length ? keys : ["(none)"]) {
      const list = buckets.get(k) ?? [];
      list.push(t);
      buckets.set(k, list);
    }
  }
  let mixedCurrencies = false;
  const rows: BreakdownRow[] = [];
  for (const [key, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const scope = currencyScope(list, accountCurrency);
    if (scope.excluded.length > 0) mixedCurrencies = true;
    const closed = scope.included.filter((t) => t.realizedPnl !== null);
    const pnls = closed.map((t) => t.realizedPnl as number);
    const wins = pnls.filter((p) => p > 0).length;
    const net = total(pnls);
    rows.push({
      key,
      trades: list.length,
      closed: closed.length,
      wins,
      winRate: closed.length ? (wins / closed.length) * 100 : null,
      netPnl: closed.length ? Number(net.toFixed(8)) : null,
      avgPnl: closed.length ? Number((net / closed.length).toFixed(8)) : null,
    });
  }
  return { rows, mixedCurrencies };
}

export type BreakdownDimension = "instrument" | "month" | "weekday" | "direction" | "psychology";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthOf(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return WEEKDAYS[d.getUTCDay()];
}

export function computeBreakdown(trades: Trade[], dimension: BreakdownDimension, accountCurrency: string, range: DateRange = { from: null, to: null }): Breakdown {
  const scoped = trades.filter((t) => inRange(t, range));
  switch (dimension) {
    case "instrument": return breakdownFrom(scoped, (t) => [t.instrument], accountCurrency);
    case "month": return breakdownFrom(scoped, (t) => [monthOf(t.date)], accountCurrency);
    case "weekday": return breakdownFrom(scoped, (t) => [weekdayOf(t.date)], accountCurrency);
    case "direction": return breakdownFrom(scoped, (t) => [t.direction], accountCurrency);
    case "psychology": return breakdownFrom(scoped, (t) => t.psychology, accountCurrency);
  }
}

export interface MonthlyPoint {
  month: string;
  netPnl: number | null;
  trades: number;
}

/** Monthly net P&L for the dashboard chart (prompt §6). */
export function monthlyPerformance(trades: Trade[], accountCurrency: string, range: DateRange = { from: null, to: null }): MonthlyPoint[] {
  const bd = computeBreakdown(trades, "month", accountCurrency, range);
  return bd.rows
    .map((r) => ({ month: r.key, netPnl: r.netPnl, trades: r.trades }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface WeekdayPoint extends BreakdownRow {
  weekday: string;
}

export function weekdayBreakdown(trades: Trade[], accountCurrency: string, range: DateRange = { from: null, to: null }): WeekdayPoint[] {
  const order = new Map(WEEKDAYS.map((w, i) => [w, i]));
  return computeBreakdown(trades, "weekday", accountCurrency, range)
    .rows.map((r) => ({ ...r, weekday: r.key }))
    .sort((a, b) => (order.get(a.weekday) ?? 7) - (order.get(b.weekday) ?? 7));
}
