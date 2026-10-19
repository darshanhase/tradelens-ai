import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/hooks/useApp";
import { RangeFilter } from "@/components/common/RangeFilter";
import { MixedCurrencyBanner } from "@/components/common/Common";
import { computeMetrics, computeBreakdown, weekdayBreakdown, type BreakdownDimension } from "@/services/analytics/metrics";
import { generateInsights } from "@/services/analytics/insights";
import { formatMoney } from "@/services/analytics/calc";
import { rangeForPreset, type RangePreset } from "@/services/filters";
import { PSYCHOLOGY_TAGS } from "@/types/trade";

const CURRENCY_NOTE = "counts and rates include every trade with a usable result; monetary figures aggregate the account currency only";

export default function Analytics() {
  const { trades, settings } = useApp();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<RangePreset>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [dimension, setDimension] = useState<BreakdownDimension>("instrument");

  const range = useMemo(() => (preset === "custom" ? { from: custom.from || null, to: custom.to || null } : rangeForPreset(preset)), [preset, custom]);

  if (!settings) return <div className="card p-10 text-center text-muted text-sm">Loading analytics…</div>;

  const currency = settings.accountCurrency;
  const m = computeMetrics(trades, currency, range);

  const dims: Array<{ id: BreakdownDimension; label: string }> = [
    { id: "instrument", label: "Instrument" },
    { id: "month", label: "Month" },
    { id: "weekday", label: "Day of week" },
    { id: "direction", label: "Buy vs Sell" },
    { id: "psychology", label: "Psychology tag" },
  ];

  const breakdown = dimension === "weekday" ? null : computeBreakdown(trades, dimension, currency, range);
  const weekly = dimension === "weekday" ? weekdayBreakdown(trades, currency, range) : null;
  const insights = generateInsights(trades, currency, range);

  const jump = (params: { instrument?: string; direction?: string; psych?: string }) => {
    if (dimension === "month" || dimension === "weekday") return; // journal filters don't expose these buckets yet
    const sp = new URLSearchParams();
    if (preset !== "all") sp.set("rf", preset);
    if (custom.from) sp.set("customFrom", custom.from);
    if (custom.to) sp.set("customTo", custom.to);
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    navigate(`/journal?${sp.toString()}`);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-muted mt-0.5">{CURRENCY_NOTE}.</p>
        </div>
        <RangeFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </header>

      <MixedCurrencyBanner excludedCount={m.excludedOtherCurrency} currencies={m.excludedCurrencies} accountCurrency={currency} />

      <section className="card p-4">
        <h2 className="card-title mb-2">Core metrics — {m.closedTrades} trade{m.closedTrades === 1 ? "" : "s"} included</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs">
          <Metric label="Total Trades" value={String(m.totalTrades)} />
          <Metric label="Winning Trades" value={String(m.winningTrades)} tone="good" />
          <Metric label="Losing Trades" value={String(m.losingTrades)} tone="bad" />
          <Metric label="Breakeven Trades" value={String(m.breakevenTrades)} />
          <Metric label="Win Rate" value={pctOf(m.winRate)} />
          <Metric label="Loss Rate" value={pctOf(m.lossRate)} />
          <Metric label="Net P&L" value={closed(m.closedTrades, m.netPnl, currency)} tone={m.netPnl > 0 ? "good" : m.netPnl < 0 ? "bad" : "neutral"} />
          <Metric label="Gross Profit" value={closed(m.closedTrades, m.grossProfit, currency)} tone="good" />
          <Metric label="Gross Loss" value={closed(m.closedTrades, -m.grossLoss, currency)} tone="bad" />
          <Metric label="Average P&L per Trade" value={m.expectancy === null ? "—" : formatMoney(m.expectancy, currency)} />
          <Metric label="Average Winning Trade" value={m.avgWin === null ? "—" : formatMoney(m.avgWin, currency)} tone="good" />
          <Metric label="Average Losing Trade" value={m.avgLoss === null ? "—" : formatMoney(-m.avgLoss, currency)} tone="bad" />
          <Metric label="Largest Win" value={m.largestWin === null ? "—" : formatMoney(m.largestWin, currency)} tone="good" />
          <Metric label="Largest Loss" value={m.largestLoss === null ? "—" : formatMoney(m.largestLoss, currency)} tone="bad" />
          <Metric label="Profit Factor" value={pfText(m.profitFactor)} />
          <Metric label="Expectancy per Trade" value={m.expectancy === null ? "—" : formatMoney(m.expectancy, currency)} />
          <Metric label="Trade-Level Max Drawdown" value={formatMoney(m.maxDrawdown, currency)} hint="from realized results, not intratrade" tone="bad" />
          <Metric label="Max Consecutive Wins" value={String(m.maxConsecutiveWins)} tone="good" />
          <Metric label="Max Consecutive Losses" value={String(m.maxConsecutiveLosses)} tone="bad" />
          <Metric label="Excluded (no result)" value={String(m.excludedNoResult)} />
          <Metric label="Excluded (other currency)" value={String(m.excludedOtherCurrency)} />
        </div>
        <p className="text-[10px] text-muted mt-3">
          Formulas: Win Rate = wins ÷ closed × 100 · Profit Factor = gross profit ÷ gross loss (∞ when gross loss is 0) · Expectancy = net ÷ closed · Drawdown = largest peak-to-trough decline of the chronological realized-P&L stack.
        </p>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">Performance by</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {dims.map((d) => (
              <button key={d.id} className={`rounded-full border px-2.5 py-0.5 ${dimension === d.id ? "border-accent bg-accent/15 text-accent" : "border-line-500 text-muted hover:text-slate-300"}`} onClick={() => setDimension(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        {dimension === "psychology" && (
          <p className="text-[11px] text-muted mt-1">Insight rules appear in the Dashboard &amp; below only when real data supports them — a tag never “causes” a result.</p>
        )}
        <div className="overflow-x-auto mt-2">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-line-900 text-muted">
                <th className="text-left py-1.5 pr-3 font-medium uppercase tracking-wider text-[10px]">{dimension === "weekday" ? "Weekday" : dimension === "psychology" ? "Tag" : dimension === "direction" ? "Side" : dimension === "month" ? "Month" : "Instrument"}</th>
                <th className="text-right py-1.5 px-3 font-medium uppercase tracking-wider text-[10px]">Trades</th>
                <th className="text-right py-1.5 px-3 font-medium uppercase tracking-wider text-[10px]">Closed</th>
                <th className="text-right py-1.5 px-3 font-medium uppercase tracking-wider text-[10px]">Win rate</th>
                <th className="text-right py-1.5 px-3 font-medium uppercase tracking-wider text-[10px]">Net P&L ({currency})</th>
                <th className="text-right py-1.5 font-medium uppercase tracking-wider text-[10px]">Avg P&L ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {(weekly ?? breakdown!.rows).map((r) => {
                const clickable = dimension === "instrument" ? { instrument: r.key }
                  : dimension === "direction" ? { direction: r.key }
                  : dimension === "psychology" ? { psych: r.key === "(none)" ? "" : r.key }
                  : {};
                return (
                  <tr
                    key={r.key}
                    className={`border-b border-line-900/60 hover:bg-surface-850 ${dimension === "month" || dimension === "weekday" ? "" : "cursor-pointer"}`}
                    onClick={() => jump(clickable)}
                    title={dimension === "month" || dimension === "weekday" ? undefined : "Open these trades in the journal"}
                  >
                    <td className="py-1.5 pr-3 text-slate-200">{r.key}</td>
                    <td className="text-right px-3 text-muted">{r.trades}</td>
                    <td className="text-right px-3 text-muted">{r.closed}</td>
                    <td className="text-right px-3 text-muted">{r.winRate === null ? "—" : `${r.winRate.toFixed(0)}%`}</td>
                    <td className={`text-right px-3 font-medium ${pnlTone(r.netPnl)}`}>{r.netPnl === null ? "—" : formatMoney(r.netPnl, currency)}</td>
                    <td className={`text-right ${pnlTone(r.avgPnl)}`}>{r.avgPnl === null ? "—" : formatMoney(r.avgPnl, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(dimension === "instrument" ? breakdown!.rows.length === 0 : weekly ? weekly.length === 0 : breakdown!.rows.length === 0) && (
            <p className="text-xs text-muted mt-2 py-4 text-center">No trades in this period.</p>
          )}
        </div>
        {dimension === "psychology" && <p className="text-[11px] text-muted mt-2">Tag vocabulary comes from your entries; the standard list is {PSYCHOLOGY_TAGS.slice(0, 5).join(", ")}… </p>}
      </section>

      <section className="card p-4">
        <h2 className="card-title">Rule-based psychology insights</h2>
        <ul className="space-y-2 mt-2">
          {insights.map((ins, i) => (
            <li key={i} className={`text-xs leading-relaxed rounded px-3 py-2 border ${ins.kind === "warning" ? "border-warn/30 bg-warn/5 text-warn" : ins.kind === "positive" ? "border-good/30 bg-good/5 text-good" : "border-line-700 bg-surface-850 text-slate-300"}`}>
              {ins.message}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted mt-3">These messages are generated from your recorded data by fixed rules — no AI model, no predictions, and correlation is not causation.</p>
      </section>
    </div>
  );
}

function Metric({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div>
      <div className="text-muted">{label}{hint ? <span className="text-[10px] text-muted/70"> · {hint}</span> : ""}</div>
      <div className={`text-sm font-medium ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

function closed(closedCount: number, value: number, currency: string): string {
  return closedCount === 0 ? "—" : formatMoney(value, currency);
}

function pctOf(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function pfText(pf: number | null | typeof Infinity): string {
  if (pf === null) return "—";
  if (pf === Infinity) return "∞ (zero gross loss)";
  return pf.toFixed(2);
}

function pnlTone(v: number | null): string {
  if (v === null) return "text-muted";
  return v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-muted";
}
