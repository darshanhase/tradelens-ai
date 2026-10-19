import type { Trade } from "@/types/trade";
import { makeDraft } from "@/services/storage/tradesRepo";

/**
 * Optional sample trades (prompt §6): clearly flagged via `sample: true`,
 * never silently mixed with real data, and removable in one click.
 * Deterministic values with manually verified results — they exercise every
 * dashboard chart without pretending to be a market view.
 */

export interface SampleRow {
  month: number; day: number; symbol: string; dir: "BUY" | "SELL";
  entry: number; exit: number; lots: number; pnl: number | null;
  psych: string[]; notes: string;
  /** Currency of the stored realized result. */
  currency: string;
}

export const SAMPLE_ROWS: SampleRow[] = [
  { month: 1, day: 5,  symbol: "EURUSD", dir: "BUY",  entry: 1.085,  exit: 1.0912,  lots: 0.5,  pnl: 310,   psych: ["Disciplined"],        notes: "followed plan", currency: "USD" },
  { month: 1, day: 8,  symbol: "XAUUSD", dir: "BUY",  entry: 2655,   exit: 2672,    lots: 0.01, pnl: 170,   psych: ["Confident"],          notes: "clean trend",   currency: "USD" },
  { month: 1, day: 12, symbol: "XAUUSD", dir: "SELL", entry: 2680,   exit: 2672,    lots: 0.01, pnl: 80,    psych: [],                     notes: "",              currency: "USD" },
  { month: 1, day: 15, symbol: "GBPUSD", dir: "BUY",  entry: 1.262,  exit: 1.2598,  lots: 1,    pnl: -220,  psych: ["FOMO"],               notes: "chased the breakout", currency: "USD" },
  { month: 1, day: 19, symbol: "EURUSD", dir: "SELL", entry: 1.0925, exit: 1.094,   lots: 0.5,  pnl: -75,   psych: ["Revenge Trading"],    notes: "red trade after loss", currency: "USD" },
  { month: 1, day: 22, symbol: "NAS100", dir: "BUY",  entry: 21640,  exit: 21610,   lots: 1,    pnl: -30,   psych: ["Impatient"],          notes: "no setup",      currency: "USD" },
  { month: 1, day: 26, symbol: "USDJPY", dir: "BUY",  entry: 155.2,  exit: 156.0,   lots: 0.25, pnl: 2000,  psych: ["Disciplined"],        notes: "trend trade",   currency: "JPY" },
  { month: 2, day: 2,  symbol: "EURUSD", dir: "BUY",  entry: 1.0831, exit: 1.0879,  lots: 1,    pnl: 480,   psych: ["Disciplined"],        notes: "",              currency: "USD" },
  { month: 2, day: 4,  symbol: "GBPNZD", dir: "BUY",  entry: 2.152,  exit: 2.1494,  lots: 1,    pnl: -260,  psych: ["Overconfident"],      notes: "oversized",     currency: "USD" },
  { month: 2, day: 9,  symbol: "XAGUSD", dir: "BUY",  entry: 31.2,   exit: 31.6,    lots: 0.05, pnl: 200,   psych: ["Hesitant"],           notes: "late entry",    currency: "USD" },
  { month: 2, day: 11, symbol: "NAS100", dir: "SELL", entry: 21590,  exit: 21588,   lots: 1,    pnl: 20,    psych: ["Disciplined"],        notes: "quick scalp",   currency: "USD" },
  { month: 2, day: 16, symbol: "US30",   dir: "BUY",  entry: 44500,  exit: 44480,   lots: 1,    pnl: -20,   psych: ["Fearful"],            notes: "cut too early", currency: "USD" },
  { month: 2, day: 18, symbol: "XAUUSD", dir: "BUY",  entry: 2938,   exit: 2954.5,  lots: 0.02, pnl: 330,   psych: ["Confident"],          notes: "",              currency: "USD" },
  { month: 2, day: 20, symbol: "EURUSD", dir: "SELL", entry: 1.0852, exit: 1.0852,  lots: 0.5,  pnl: 0,     psych: ["Disciplined"],        notes: "scratch",       currency: "USD" },
  { month: 2, day: 24, symbol: "GBPUSD", dir: "BUY",  entry: 1.2618, exit: 1.2641,  lots: 0.5,  pnl: 115,   psych: ["Disciplined"],        notes: "",              currency: "USD" },
];

export function sampleTrades(year = 2026): Trade[] {
  return SAMPLE_ROWS.map((row, i) => {
    const trade = makeDraft({
      date: `${year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`,
      instrument: row.symbol,
      direction: row.dir,
      entryPrice: row.entry,
      exitPrice: row.exit,
      lotSize: row.lots,
      realizedPnl: row.pnl,
      pnlCurrency: row.pnl === null ? null : row.currency,
      resultSource: "manual",
      psychology: row.psych,
      notes: row.notes,
      sample: true,
    });
    // Sequential minutes give every sample row a stable chronological position.
    trade.createdAt = `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`;
    return trade;
  });
}
