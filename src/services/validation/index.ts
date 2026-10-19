import type { Instrument, Settings } from "@/types/settings";
import { PSYCHOLOGY_TAGS } from "@/types/trade";

/**
 * Validation (prompt §9/§15): every rejected input returns a precise reason;
 * nothing is silently discarded or coerced into a misleading zero.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!DATE_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // calendar-exact round trip rejects e.g. 2026-02-30
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  const yyyy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}` === t ? t : null;
}

/** Accepts "1.234,56" (European) or "1,234.56" (US) or plain "1234.56". */
export function parseDecimal(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let t = raw.trim().replace(/\s|\$/g, "");
  if (t === "") return null;
  if (t.includes(",")) {
    if (t.includes(".")) {
      // both present: the rightmost separator is the decimal mark
      t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    } else if (/,\d{1,2}$/.test(t)) {
      // comma only, 1–2 trailing digits → decimal comma: 1,5 → 1.5 ; 1234,56 → 1234.56
      t = t.replace(",", ".");
    } else {
      // comma only, 3-digit groups → thousands separators: 2,500 → 2500
      t = t.replace(/,/g, "");
    }
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validateTradeInput(input: {
  date: string; instrument: string; direction: string; entryPrice: string; exitPrice: string; lotSize: string;
}): Validated<{ date: string; instrument: string; direction: "BUY" | "SELL"; entryPrice: number; exitPrice: number; lotSize: number }> {
  const errors: string[] = [];
  const date = parseIsoDate(input.date);
  if (!date) errors.push(`Invalid date "${input.date}" (expected YYYY-MM-DD).`);
  const instrument = input.instrument.trim().toUpperCase();
  if (!instrument) errors.push("Instrument is required.");
  if (input.direction !== "BUY" && input.direction !== "SELL") errors.push(`Direction must be BUY or SELL.`);
  const entryPrice = parseDecimal(input.entryPrice);
  if (entryPrice === null || entryPrice <= 0) errors.push(`Invalid entry price "${input.entryPrice}".`);
  const exitPrice = parseDecimal(input.exitPrice);
  if (exitPrice === null || exitPrice <= 0) errors.push(`Invalid exit price "${input.exitPrice}".`);
  const lotSize = parseDecimal(input.lotSize);
  if (lotSize === null || lotSize <= 0) errors.push(`Invalid lot size "${input.lotSize}".`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { date: date as string, instrument, direction: input.direction as "BUY" | "SELL", entryPrice: entryPrice as number, exitPrice: exitPrice as number, lotSize: lotSize as number },
  };
}

/** Validate + normalize an unknown psychology tag list (import path). */
export function normalizePsychology(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => (PSYCHOLOGY_TAGS as readonly string[]).find((p) => p.toLowerCase() === t.trim().toLowerCase()) ?? t.trim());
}

export function validateInstrument(i: Instrument): string[] {
  const errors: string[] = [];
  if (!i.symbol.trim()) errors.push("Symbol is required.");
  if (!Number.isFinite(i.contractSize) || i.contractSize <= 0) errors.push(`${i.symbol || "Instrument"}: contract size must be a positive number.`);
  if (!i.quoteCurrency.trim()) errors.push(`${i.symbol || "Instrument"}: quote currency is required.`);
  if (!Number.isFinite(i.precision) || i.precision < 0) errors.push(`${i.symbol || "Instrument"}: precision must be zero or more.`);
  return errors;
}

export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  if (!s.accountCurrency.trim() || s.accountCurrency.trim().length !== 3) errors.push("Account currency must be a 3-letter code.");
  for (const i of s.instruments) errors.push(...validateInstrument(i));
  const symbols = s.instruments.map((i) => i.symbol.trim().toUpperCase());
  if (new Set(symbols).size !== symbols.length) errors.push("Instrument symbols must be unique.");
  return errors.filter(Boolean);
}
