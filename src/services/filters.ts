import type { Trade } from "@/types/trade";
import { outcomeOf } from "@/services/analytics/calc";
import { inRange, type DateRange } from "@/services/analytics/metrics";

/**
 * Trade journal filters (prompt §11): date range, instrument, direction,
 * win/loss/breakeven, psychology tag, search, sorting, pagination. The state
 * shape doubles as URL query parameters so Analytics breakdowns can link
 * users straight to matching trades.
 */

export type OutcomeFilter = "all" | "win" | "loss" | "breakeven" | "unresolved";

export interface JournalFilters {
  range: DateRange;
  instrument: string | null;
  direction: "BUY" | "SELL" | null;
  outcome: OutcomeFilter;
  psychology: string | null;
  search: string;
}

export function emptyFilters(): JournalFilters {
  return { range: { from: null, to: null }, instrument: null, direction: null, outcome: "all", psychology: null, search: "" };
}

export function countActiveFilters(f: JournalFilters): number {
  let n = 0;
  if (f.range.from || f.range.to) n++;
  if (f.instrument) n++;
  if (f.direction) n++;
  if (f.outcome !== "all") n++;
  if (f.psychology) n++;
  if (f.search.trim()) n++;
  return n;
}

export function filterTrades(trades: Trade[], f: JournalFilters): Trade[] {
  const q = f.search.trim().toLowerCase();
  return trades.filter((t) => {
    if (!inRange(t, f.range)) return false;
    if (f.instrument && t.instrument !== f.instrument) return false;
    if (f.direction && t.direction !== f.direction) return false;
    if (f.outcome !== "all" && outcomeOf(t.realizedPnl) !== f.outcome) return false;
    if (f.psychology && !t.psychology.includes(f.psychology)) return false;
    if (q && !(t.instrument.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.psychology.some((p) => p.toLowerCase().includes(q)))) return false;
    return true;
  });
}

// ---------- URL round-trip (analytics → journal links) ----------

export type RangePreset = "all" | "thisMonth" | "lastMonth" | "last30" | "custom";

export function rangeForPreset(preset: RangePreset): DateRange {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (preset) {    case "all":
      return { from: null, to: null };
    case "thisMonth": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(first), to: iso(now) };
    }
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
    case "last30": {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { from: iso(from), to: iso(now) };
    }
    case "custom":
      return { from: null, to: null };
  }
}

export interface JournalQuery {
  rf?: RangePreset;
  instrument?: string;
  direction?: string;
  outcome?: string;
  psych?: string;
  q?: string;
}

export function filtersFromQuery(q: JournalQuery): JournalFilters {
  const f = emptyFilters();
  const rangePreset: RangePreset = (q.rf as RangePreset) ?? "all";
  // custom preset with explicit custom dates is handled at the page level
  f.range = rangeForPreset(rangePreset);
  f.instrument = q.instrument ?? null;
  f.direction = q.direction === "BUY" || q.direction === "SELL" ? q.direction : null;
  f.outcome = (["win", "loss", "breakeven", "unresolved"].includes(q.outcome ?? "") ? q.outcome : "all") as OutcomeFilter;
  f.psychology = q.psych ?? null;
  f.search = q.q ?? "";
  return f;
}

export function queryFromFilters(f: JournalFilters, preset: RangePreset): JournalQuery {
  const q: JournalQuery = {};
  if (preset !== "all") q.rf = preset;
  if (f.instrument) q.instrument = f.instrument;
  if (f.direction) q.direction = f.direction;
  if (f.outcome !== "all") q.outcome = f.outcome;
  if (f.psychology) q.psych = f.psychology;
  if (f.search.trim()) q.q = f.search.trim();
  return q;
}

export type SortKey = "date" | "pnl" | "instrument";

export function sortTradesForView(trades: Trade[], key: SortKey, dir: "asc" | "desc"): Trade[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...trades].sort((a, b) => {
    switch (key) {
      case "date":
        return sign * (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1);
      case "pnl":
        return sign * ((a.realizedPnl ?? -Infinity) - (b.realizedPnl ?? -Infinity));
      case "instrument":
        return sign * (a.instrument === b.instrument ? (a.date < b.date ? -1 : 1) : a.instrument.localeCompare(b.instrument));
    }
  });
  return sorted;
}
