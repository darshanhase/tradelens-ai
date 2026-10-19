/**
 * Core trade data model (prompt §13).
 *
 * Design rules:
 * - Stored values stay separate from analytics: no derived metrics are persisted
 *   (analytics recompute from the source of truth on every read).
 * - `realizedPnl` is authoritative when `resultSource === "manual"`.
 * - Every record carries `schemaVersion` so future updates can migrate safely.
 */

export const SCHEMA_VERSION = 1 as const;

export type Direction = "BUY" | "SELL";

/** How the realized result of a trade was produced. */
export type ResultSource = "manual" | "calculated";

/** Optional psychology tags offered on trade entry (prompt §5). */
export const PSYCHOLOGY_TAGS = [
  "Confident",
  "Fearful",
  "Greedy",
  "Impatient",
  "FOMO",
  "Revenge Trading",
  "Disciplined",
  "Hesitant",
  "Overconfident",
  "Other",
] as const;

export type PsychologyTag = (typeof PSYCHOLOGY_TAGS)[number];

export interface Trade {
  id: string;
  /** Trade date, local calendar date `YYYY-MM-DD`. */
  date: string;
  instrument: string;
  direction: Direction;
  /** Prices in the instrument's quote currency. */
  entryPrice: number;
  exitPrice: number;
  /** Position size in lots (broker semantics matter only via the instrument spec). */
  lotSize: number;
  /**
   * Realized monetary result. `null` for records where the user has not (yet)
   * supplied a result — such records are excluded from monetary analytics.
   */
  realizedPnl: number | null;
  /** Currency of `realizedPnl` when it is a manual value; falls back to the instrument quote currency for calculated values. */
  pnlCurrency: string | null;
  resultSource: ResultSource;
  psychology: string[];
  notes: string;
  /** True for generated sample rows — always removable in one click, never mixed with real trades silently. */
  sample?: boolean;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

export type TradeDraft = Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion">;

/** Buy/Sell as stored in the spreadsheet row representation used for copy/paste and import. */
export function parseDirection(raw: string): Direction | null {
  const t = raw.trim().toUpperCase();
  if (["BUY", "B", "LONG", "L"].includes(t)) return "BUY";
  if (["SELL", "S", "SHORT", "SH"].includes(t)) return "SELL";
  return null;
}
