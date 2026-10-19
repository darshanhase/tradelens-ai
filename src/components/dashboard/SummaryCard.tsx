import { formatMoney } from "@/services/analytics/calc";
import type { ReactNode } from "react";

export function SummaryCard({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="card p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-slate-100"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/** Formats a metric that is null when it has no denominator (e.g. empty period). */
export function moneyOrDash(value: number | null | undefined, currency: string): string {
  return value === null || value === undefined ? "—" : formatMoney(value, currency);
}

export function numberOrDash(value: number | null, format: (v: number) => string): string {
  return value === null || value === undefined ? "—" : format(value);
}

export function pct(value: number | null, decimals = 0): string {
  return value === null ? "—" : `${value.toFixed(decimals)}%`;
}

/** Profit factor is Infinity when gross loss is zero (prompt §7) — display accordingly. */
export function profitFactorText(pf: number | null | typeof Infinity): string {
  if (pf === null) return "—";
  if (pf === Infinity) return "∞ (no losses)";
  return pf.toFixed(2);
}

export function TrendBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}
