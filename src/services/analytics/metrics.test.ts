import { describe, expect, it } from "vitest";
import type { Trade, TradeDraft } from "@/types/trade";
import {
  computeMetrics,
  currencyScope,
  cumulativeCurve,
  monthlyPerformance,
  weekdayBreakdown,
  computeBreakdown,
  inRange,
} from "./metrics";

/** Deterministic trade factory — same-date trades get distinct createdAt for stable ordering. */
let seq = 0;
function t(partial: Partial<TradeDraft> & { date: string }): Trade {
  const i = ++seq;
  return {
    id: `t${i}`,
    direction: "BUY",
    instrument: "EURUSD",
    entryPrice: 100,
    exitPrice: 101,
    lotSize: 1,
    realizedPnl: null,
    pnlCurrency: null,
    resultSource: "manual",
    psychology: [],
    notes: "",
    createdAt: `2026-01-01T00:00:0${seq % 10}.00${i % 100 >= 10 ? "0" : ""}Z`.replace(/\.\d+/, `.${String(i).padStart(3, "0")}Z`),
    updatedAt: "2026-01-01T00:00:00Z",
    schemaVersion: 1,
    ...partial,
  } as Trade;
}

describe("core metrics (prompt §7 formulas)", () => {
  it("computes win rate, profit factor and expectancy on a known example", () => {
    const trades = [
      t({ date: "2026-01-01", realizedPnl: 100 }),
      t({ date: "2026-01-02", realizedPnl: -50 }),
      t({ date: "2026-01-03", realizedPnl: 50 }),
      t({ date: "2026-01-04", realizedPnl: 0 }), // breakeven
    ];
    const m = computeMetrics(trades, "USD");
    expect(m.totalTrades).toBe(4);
    expect(m.closedTrades).toBe(4);
    expect(m.winningTrades).toBe(2);
    expect(m.losingTrades).toBe(1);
    expect(m.breakevenTrades).toBe(1);
    expect(m.winRate).toBeCloseTo(50); // 2 wins / 4 closed
    expect(m.lossRate).toBeCloseTo(25);
    expect(m.netPnl).toBe(100);
    expect(m.grossProfit).toBe(150);
    expect(m.grossLoss).toBe(50);
    expect(m.profitFactor).toBeCloseTo(3); // 150/50
    expect(m.expectancy).toBeCloseTo(25); // 100/4
    expect(m.avgWin).toBeCloseTo(75);
    expect(m.avgLoss).toBeCloseTo(50); // reported positive
    expect(m.largestWin).toBe(100);
    expect(m.largestLoss).toBe(-50);
  });

  it("zero gross loss → profit factor Infinity (never a misleading 0)", () => {
    const m = computeMetrics([t({ date: "2026-01-01", realizedPnl: 25 }), t({ date: "2026-01-02", realizedPnl: 75 })], "USD");
    expect(m.profitFactor).toBe(Infinity);
    // all-breakeven journal → PF 0 (defined, not infinite, no losses)
    const m2 = computeMetrics([t({ date: "2026-01-01", realizedPnl: 0 })], "USD");
    expect(m2.profitFactor).toBe(0);
  });

  it("empty journal → null rates and zero drawdown", () => {
    const m = computeMetrics([], "USD");
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.profitFactor).toBeNull();
    expect(m.expectancy).toBeNull();
    expect(m.maxDrawdown).toBe(0);
    expect(m.netPnl).toBe(0);
  });

  it("missing P&L is excluded from monetary metrics and counted", () => {
    const trades = [
      t({ date: "2026-01-01", realizedPnl: 100 }),
      t({ date: "2026-01-02", realizedPnl: null }),
      t({ date: "2026-01-03", realizedPnl: null }),
    ];
    const m = computeMetrics(trades, "USD");
    expect(m.closedTrades).toBe(1);
    expect(m.excludedNoResult).toBe(2);
    expect(m.netPnl).toBe(100); // never silently treated as 130
    expect(m.winRate).toBe(100);
  });

  it("invalid (non-finite) results are excluded like missing", () => {
    const m = computeMetrics([t({ date: "2026-01-01", realizedPnl: Number.NaN as unknown as number })], "USD");
    expect(m.closedTrades).toBe(0);
    expect(m.excludedNoResult).toBe(1);
  });

  it("computes trade-level maximum drawdown correctly", () => {
    const trades = [
      t({ date: "2026-01-01", realizedPnl: 100 }),
      t({ date: "2026-01-02", realizedPnl: 100 }),
      t({ date: "2026-01-03", realizedPnl: -80 }),
      t({ date: "2026-01-04", realizedPnl: -70 }),
      t({ date: "2026-01-05", realizedPnl: 90 }),
    ];
    // curve: 100,200,120,50,140 → peak 200 trough 50 → drawdown 150
    const m = computeMetrics(trades, "USD");
    expect(m.maxDrawdown).toBe(150);
  });

  it("streaks count consecutive wins/losses and reset on breakeven", () => {
    const trades = [
      t({ date: "2026-01-01", realizedPnl: 10 }),
      t({ date: "2026-01-02", realizedPnl: 10 }),
      t({ date: "2026-01-03", realizedPnl: -5 }),
      t({ date: "2026-01-04", realizedPnl: -5 }),
      t({ date: "2026-01-05", realizedPnl: -5 }),
      t({ date: "2026-01-06", realizedPnl: 0 }),
      t({ date: "2026-01-07", realizedPnl: 7 }),
    ];
    const m = computeMetrics(trades, "USD");
    expect(m.maxConsecutiveWins).toBe(2);
    expect(m.maxConsecutiveLosses).toBe(3);
  });
});

describe("date ranges", () => {
  const trades = [
    t({ date: "2026-01-01", realizedPnl: 10 }),
    t({ date: "2026-01-31", realizedPnl: 20 }),
    t({ date: "2026-02-15", realizedPnl: -5 }),
    t({ date: "2026-03-01", realizedPnl: 7 }),
  ];

  it("respects inclusive from/to bounds", () => {
    expect(trades.filter((x) => inRange(x, { from: "2026-01-31", to: "2026-02-15" })).map((x) => x.date)).toEqual(["2026-01-31", "2026-02-15"]);
  });

  it("metrics respect the selected range", () => {
    expect(computeMetrics(trades, "USD", { from: "2026-02-01", to: "2026-02-28" }).netPnl).toBe(-5);
    expect(computeMetrics(trades, "USD", { from: null, to: "2026-01-31" }).netPnl).toBe(30);
  });
});

describe("mixed currencies", () => {
  it("excludes other-currency results from aggregation and reports them", () => {
    const trades = [
      t({ date: "2026-01-01", realizedPnl: 100, pnlCurrency: "USD" }),
      t({ date: "2026-01-02", realizedPnl: 1000, pnlCurrency: "JPY" }),
      t({ date: "2026-01-03", realizedPnl: 10, pnlCurrency: null }), // unknown → included
    ];
    const m = computeMetrics(trades, "USD");
    expect(m.netPnl).toBe(110); // never sums the JPY 1000 into USD
    expect(m.excludedOtherCurrency).toBe(1);
    expect(m.excludedCurrencies).toEqual(["JPY"]);
  });

  it("currencyScope reports excluded trades so the UI can warn", () => {
    const scope = currencyScope(
      [t({ date: "2026-01-01", realizedPnl: 1, pnlCurrency: "EUR" }), t({ date: "2026-01-02", realizedPnl: 2, pnlCurrency: "EUR" })],
      "USD",
    );
    expect(scope.excluded).toHaveLength(2);
    expect(scope.excludedCurrencies).toEqual(["EUR"]);
  });
});

describe("aggregations", () => {
  it("monthly aggregation nets by YYYY-MM", () => {
    const points = monthlyPerformance(
      [
        t({ date: "2026-01-05", realizedPnl: 10 }),
        t({ date: "2026-01-20", realizedPnl: -3 }),
        t({ date: "2026-02-02", realizedPnl: 4 }),
      ],
      "USD",
    );
    expect(points).toEqual([
      { month: "2026-01", netPnl: 7, trades: 2 },
      { month: "2026-02", netPnl: 4, trades: 1 },
    ]);
  });

  it("weekdays bucket by UTC calendar day of the ISO date", () => {
    // 2026-01-01 is a Thursday
    const rows = weekdayBreakdown([t({ date: "2026-01-01", realizedPnl: 5 }), t({ date: "2026-01-05", realizedPnl: -2 })], "USD");
    expect(rows.map((r) => r.weekday)).toEqual(["Mon", "Thu"]);
    expect(rows.find((r) => r.weekday === "Thu")?.netPnl).toBe(5);
  });

  it("psychology breakdown buckets trades with multiple tags and (none)", () => {
    const bd = computeBreakdown(
      [t({ date: "2026-01-01", realizedPnl: 10, psychology: ["FOMO", "Greedy"] }), t({ date: "2026-01-02", realizedPnl: -5, psychology: ["FOMO"] }), t({ date: "2026-01-03", realizedPnl: 3 })],
      "psychology",
      "USD",
    );
    const fomo = bd.rows.find((r) => r.key === "FOMO");
    expect(fomo?.trades).toBe(2);
    expect(fomo?.netPnl).toBe(5);
    const none = bd.rows.find((r) => r.key === "(none)");
    expect(none?.netPnl).toBe(3);
  });

  it("direction breakdown separates BUY and SELL", () => {
    const bd = computeBreakdown([t({ date: "2026-01-01", direction: "BUY", realizedPnl: 10 }), t({ date: "2026-01-02", direction: "SELL", realizedPnl: -4 })], "direction", "USD");
    expect(bd.rows.find((r) => r.key === "BUY")?.winRate).toBe(100);
    expect(bd.rows.find((r) => r.key === "SELL")?.winRate).toBe(0);
  });
});

describe("cumulative curve", () => {
  it("accumulates chronologically and keeps trade dates", () => {
    const pts = cumulativeCurve([t({ date: "2026-01-02", realizedPnl: 5 }), t({ date: "2026-01-01", realizedPnl: 2 })]);
    expect(pts.map((p) => p.equity)).toEqual([2, 7]);
    expect(pts[0].date).toBe("2026-01-01");
  });
});
