import type { Trade } from "@/types/trade";
import { inRange, type DateRange } from "./metrics";

/** Runs of consecutive same-outcome closed trades inside a date range. */
export interface StreakRun {
  direction: "win" | "loss";
  tradeCount: number;
  from: string;
  to: string;
}

export function weeklyStreaks(trades: Trade[], range: DateRange = { from: null, to: null }, minRun = 3): StreakRun[] {
  const closed = trades
    .filter((t) => inRange(t, range) && t.realizedPnl !== null && Number.isFinite(t.realizedPnl))
    .sort((a, b) => (a.date === b.date ? (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));

  const runs: StreakRun[] = [];
  let dir: "win" | "loss" | null = null;
  let count = 0;
  let start = "";
  let last = "";
  for (const t of closed) {
    const pnl = t.realizedPnl as number;
    const outcome = pnl > 0 ? "win" : pnl < 0 ? "loss" : null;
    if (outcome !== dir) {
      if (dir && count >= minRun) runs.push({ direction: dir, tradeCount: count, from: start, to: last });
      dir = outcome;
      count = outcome ? 1 : 0;
      start = t.date;
    } else if (outcome) {
      count++;
    }
    last = t.date;
  }
  if (dir && count >= minRun) runs.push({ direction: dir, tradeCount: count, from: start, to: last });
  return runs;
}
