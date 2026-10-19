import { describe, expect, it } from "vitest";
import { calculatePnl, outcomeOf, round, formatMoney } from "./calc";
import type { Instrument } from "@/types/settings";

const INSTRUMENTS: Instrument[] = [
  { id: "1", symbol: "EURUSD", contractSize: 100000, quoteCurrency: "USD", precision: 5 },
  { id: "2", symbol: "USDJPY", contractSize: 100000, quoteCurrency: "JPY", precision: 3 },
  { id: "3", symbol: "XAUUSD", contractSize: 100, quoteCurrency: "USD", precision: 2 },
];

describe("calculatePnl", () => {
  it("computes a BUY profit with the per-instrument contract size", () => {
    // EURUSD BUY 1.0 lot @1.10 → 1.11:  0.01 × 1.0 × 100000 = 1000 USD
    expect(calculatePnl({ instrument: "EURUSD", direction: "BUY", entryPrice: 1.1, exitPrice: 1.11, lotSize: 1 }, INSTRUMENTS))
      .toEqual({ pnl: 1000, currency: "USD" });
  });

  it("computes a SELL profit as entry − exit", () => {
    // XAUUSD SELL 0.5 lot @2000 → 1995:  5 × 0.5 × 100 = 250 USD
    expect(calculatePnl({ instrument: "XAUUSD", direction: "SELL", entryPrice: 2000, exitPrice: 1995, lotSize: 0.5 }, INSTRUMENTS))
      .toEqual({ pnl: 250, currency: "USD" });
  });

  it("computes a losing trade as negative", () => {
    // EURUSD BUY 0.1 lot @1.10 → 1.09:  −0.01 × 0.1 × 100000 = −100 USD
    const r = calculatePnl({ instrument: "EURUSD", direction: "BUY", entryPrice: 1.1, exitPrice: 1.09, lotSize: 0.1 }, INSTRUMENTS);
    expect(r?.pnl).toBe(-100);
    expect(r?.currency).toBe("USD");
  });

  it("uses the quote currency of the instrument (JPY cross)", () => {
    // USDJPY BUY 0.1 lot @150 → 150.50:  0.5 × 0.1 × 100000 = 5000 JPY
    const r = calculatePnl({ instrument: "USDJPY", direction: "BUY", entryPrice: 150, exitPrice: 150.5, lotSize: 0.1 }, INSTRUMENTS);
    expect(r?.currency).toBe("JPY");
    expect(r?.pnl).toBe(5000);
  });

  it("is case-insensitive on instrument symbols and trims spaces", () => {
    expect(calculatePnl({ instrument: " eurusd ", direction: "BUY", entryPrice: 1, exitPrice: 2, lotSize: 1 }, INSTRUMENTS)?.pnl).toBe(100000);
  });

  it("returns null for a symbol with no user-defined contract spec", () => {
    expect(calculatePnl({ instrument: "RANDOMCOIN", direction: "BUY", entryPrice: 1, exitPrice: 2, lotSize: 1 }, INSTRUMENTS)).toBeNull();
  });

  it("returns null on non-finite numbers", () => {
    expect(calculatePnl({ instrument: "EURUSD", direction: "BUY", entryPrice: NaN, exitPrice: 1, lotSize: 1 }, INSTRUMENTS)).toBeNull();
    expect(calculatePnl({ instrument: "EURUSD", direction: "BUY", entryPrice: 1, exitPrice: 1, lotSize: Infinity }, INSTRUMENTS)).toBeNull();
  });

  it("avoids floating point noise (0.1 + 0.2 style)", () => {
    const r = calculatePnl({ instrument: "XAUUSD", direction: "BUY", entryPrice: 2681.1, exitPrice: 2681.3, lotSize: 0.01 }, INSTRUMENTS);
    expect(r?.pnl).toBe(0.2);
  });
});

describe("outcomeOf", () => {
  it("labels win, loss, breakeven", () => {
    expect(outcomeOf(10)).toBe("win");
    expect(outcomeOf(-10)).toBe("loss");
    expect(outcomeOf(0)).toBe("breakeven");
    expect(outcomeOf(null)).toBeNull();
  });
});

describe("round", () => {
  it("rounds half away from zero, not banker's rounding", () => {
    expect(round(0.5, 0)).toBe(1);
    expect(round(-0.5, 0)).toBe(-1);
    expect(round(2.675, 2)).toBe(2.68);
  });
});

describe("formatMoney", () => {
  it("formats with a currency symbol and sign", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(-1234.5, "USD")).toBe("-$1,234.50");
    expect(formatMoney(3, "EUR")).toBe("€3.00");
    expect(formatMoney(7, "XYZ")).toBe("XYZ 7.00");
    expect(formatMoney(7, null)).toBe("7.00");
  });
});
