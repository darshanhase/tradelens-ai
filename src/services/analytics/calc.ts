import type { Instrument } from "@/types/settings";
import type { Trade } from "@/types/trade";

/**
 * Deterministic P&L calculation rules (prompt §5/§7).
 *
 * The monetary result of a trade equals:
 *   signedPriceDelta × lotSize × contractSize
 *
 * signedPriceDelta = (exit − entry) for BUY, (entry − exit) for SELL.
 * The result is denominated in the instrument's quote currency, which
 * becomes the trade's pnlCurrency. Manual results are never recomputed.
 */

export interface CalcResult {
  pnl: number;
  currency: string;
}

/** Per-instrument contract size × lot size × price delta. No global multiplier. */
export function calculatePnl(trade: Pick<Trade, "instrument" | "direction" | "entryPrice" | "exitPrice" | "lotSize">, instruments: Instrument[]): CalcResult | null {
  const spec = instruments.find((i) => i.symbol.toUpperCase() === trade.instrument.trim().toUpperCase());
  if (!spec) return null; // unknown instrument → user must enter result manually
  if (![trade.entryPrice, trade.exitPrice, trade.lotSize].every(Number.isFinite)) return null;
  const signed = trade.direction === "BUY" ? trade.exitPrice - trade.entryPrice : trade.entryPrice - trade.exitPrice;
  const pnl = signed * trade.lotSize * spec.contractSize;
  // Guard against floating-point artifacts at display scale (8 dp is far below
  // any broker's monetary precision yet avoids 0.1+0.2 style noise).
  const rounded = Number(pnl.toFixed(8));
  return { pnl: rounded, currency: spec.quoteCurrency };
}

/** Win/loss/breakeven label based on the realized P&L (prompt §5). */
export type Outcome = "win" | "loss" | "breakeven";

export function outcomeOf(pnl: number | null): Outcome | null {
  if (pnl === null || !Number.isFinite(pnl)) return null;
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

/**
 * Round half-away-from-zero to a number of decimals for display.
 * Avoids the banker's-rounding surprise of Intl/toFixed on exact halves.
 */
export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
}

export function formatMoney(value: number, currency: string | null): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(round(value, 2));
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currency ? symbolOf(currency) : ""}${formatted}`;
}

function symbolOf(code: string): string {
  switch (code.toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "JPY": return "¥";
    case "INR": return "₹";
    default: return `${code} `;
  }
}
