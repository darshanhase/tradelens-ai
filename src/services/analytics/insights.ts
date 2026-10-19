import type { Trade } from "@/types/trade";
import { computeBreakdown, type DateRange } from "./metrics";
import { weeklyStreaks } from "./streaks";

/**
 * Rule-based psychology insight generation (prompt §8).
 *
 * Hard rules enforced here:
 *  - every insight cites its sample size
 *  - samples below MIN_SAMPLE get an explicit "too few trades" warning
 *  - wording is always correlational; never claims a tag *caused* a loss
 *  - no fake predictions, no "AI model" claims — these are plain computed rules
 *  - when data is insufficient, the message says what additional data would help
 */

export const MIN_SAMPLE = 10;

export interface Insight {
  kind: "positive" | "warning" | "neutral";
  message: string;
  sampleSize: number;
}

export function generateInsights(trades: Trade[], accountCurrency: string, range: DateRange = { from: null, to: null }): Insight[] {
  const insights: Insight[] = [];
  const psych = computeBreakdown(trades, "psychology", accountCurrency, range);
  const tagged = psych.rows.filter((r) => r.key !== "(none)");

  for (const row of tagged) {
    const n = row.closed;
    if (n === 0) {
      insights.push({
        kind: "neutral",
        message: `"${row.key}" has ${row.trades} trade(s) but no recorded results yet — entering the realized P&L for these will unlock this comparison.`,
        sampleSize: row.trades,
      });
      continue;
    }
    const small = n < MIN_SAMPLE ? " (small sample — see more trades before reading much into this)" : "";
    if (row.avgPnl !== null && row.netPnl !== null && row.netPnl < 0) {
      insights.push({
        kind: "warning",
        message: `Your "${row.key}"-tagged trades average ${row.avgPnl.toFixed(2)} ${accountCurrency} across ${n} closed trade${n === 1 ? "" : "s"}${small}.`,
        sampleSize: n,
      });
    } else if (row.netPnl !== null && row.netPnl > 0 && row.winRate !== null) {
      insights.push({
        kind: "positive",
        message: `Your "${row.key}"-tagged trades show a ${row.winRate.toFixed(0)}% win rate with positive net P&L across ${n} closed trade${n === 1 ? "" : "s"}${small}.`,
        sampleSize: n,
      });
    }
  }

  // Cross-tag comparisons when both sides have data.
  for (const a of tagged) {
    for (const b of tagged) {
      if (a.key >= b.key) continue; // each unordered pair once
      if (a.winRate !== null && b.winRate !== null && a.closed >= 3 && b.closed >= 3) {
        const diff = a.winRate - b.winRate;
        const hi = diff > 0 ? a : b;
        const lo = diff > 0 ? b : a;
        if (Math.abs(diff) >= 10) {
          insights.push({
            kind: "neutral",
            message: `"${hi.key}" trades win ${(diff).toFixed(0)}%-points more often than "${lo.key}" trades (${hi.closed} vs ${lo.closed} closed trades) — a correlation in your log, not proof of cause.`,
            sampleSize: hi.closed + lo.closed,
          });
        }
      }
    }
  }

  // Streaks within the selected period.
  for (const s of weeklyStreaks(trades, range)) {
    if (s.tradeCount >= 3) {
      insights.push({
        kind: s.direction === "loss" ? "warning" : "positive",
        message: `You recorded ${s.tradeCount} consecutive ${s.direction === "loss" ? "losing" : "winning"} trades from ${s.from} to ${s.to} in the selected period.`,
        sampleSize: s.tradeCount,
      });
    }
  }

  // Weekday concentration of losses (needs enough losses to be meaningful).
  const wd = computeBreakdown(trades, "weekday", accountCurrency, range);
  const lossRows = wd.rows.filter((r) => r.closed > 0);
  const totalLosses = lossRows.reduce((s, r) => s + (r.closed - r.wins), 0);
  if (totalLosses >= 8) {
    const worst = [...lossRows].sort((a, b) => (b.closed - b.wins) - (a.closed - a.wins))[0];
    const losses = worst.closed - worst.wins;
    if (losses / totalLosses >= 0.35) {
      insights.push({
        kind: "warning",
        message: `${losses} of your ${totalLosses} losses (${Math.round((losses / totalLosses) * 100)}%) fell on ${worst.key} — worth watching, though being correlated with a weekday does not mean that weekday causes losses.`,
        sampleSize: totalLosses,
      });
    }
  }

  // Instrument concentration for the current month.
  const inst = computeBreakdown(trades, "instrument", accountCurrency, range);
  const losers = inst.rows.filter((r) => r.netPnl !== null && r.netPnl < 0);
  const totalNetLoss = -losers.reduce((s, r) => s + (r.netPnl ?? 0), 0);
  if (totalNetLoss > 0 && losers.length) {
    const biggest = [...losers].sort((a, b) => (a.netPnl ?? 0) - (b.netPnl ?? 0))[0];
    if ((biggest.netPnl ?? 0) / -totalNetLoss >= 0.5 && biggest.closed >= 3) {
      insights.push({
        kind: "warning",
        message: `Your ${biggest.key} trades account for most of the negative net P&L in the selected period (${biggest.closed} closed trades, ${(biggest.netPnl ?? 0).toFixed(2)} ${accountCurrency}).`,
        sampleSize: biggest.closed,
      });
    }
  }

  if (!insights.length) {
    const taggedCount = tagged.reduce((s, r) => s + r.closed, 0);
    insights.push({
      kind: "neutral",
      message: taggedCount === 0
        ? "No psychology-tagged trade results yet. Tag your next consecutive trades with e.g. \"Disciplined\" or \"FOMO\" and record the realized result — after about 10 tagged trades per tag, comparisons become meaningful."
        : `Only ${taggedCount} tagged trade result(s) so far. Keep tagging and recording results; rule-based insights appear once tags have enough samples.`,
      sampleSize: taggedCount,
    });
  }

  return insights;
}
