import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { useApp } from "@/hooks/useApp";
import { RangeFilter } from "@/components/common/RangeFilter";
import { SummaryCard, moneyOrDash, pct, profitFactorText } from "@/components/dashboard/SummaryCard";
import { MixedCurrencyBanner } from "@/components/common/Common";
import { computeMetrics, monthlyPerformance, cumulativeCurve, computeBreakdown } from "@/services/analytics/metrics";
import { generateInsights } from "@/services/analytics/insights";
import { formatMoney } from "@/services/analytics/calc";
import { rangeForPreset, type RangePreset } from "@/services/filters";

const N = 60; // chart height

export default function Dashboard() {
  const { trades, settings } = useApp();
  const [preset, setPreset] = useState<RangePreset>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const range = useMemo(() => (preset === "custom" ? { from: custom.from || null, to: custom.to || null } : rangeForPreset(preset)), [preset, custom]);

  if (!settings) return <div className="card p-10 text-center text-muted text-sm">Loading dashboard…</div>;

  const m = computeMetrics(trades, settings.accountCurrency, range);
  const currency = settings.accountCurrency;
  const curve = cumulativeCurve(trades, range);
  const monthly = monthlyPerformance(trades, currency, range);
  const wl = [
    { name: "Wins", value: m.winningTrades, fill: "#34d399" },
    { name: "Losses", value: m.losingTrades, fill: "#f87171" },
    { name: "Breakeven", value: m.breakevenTrades, fill: "#64748b" },
  ].filter((d) => d.value > 0);
  const byInstrument = computeBreakdown(trades, "instrument", currency, range).rows
    .filter((r) => r.closed > 0)
    .sort((a, b) => (b.netPnl ?? 0) - (a.netPnl ?? 0))
    .slice(0, 10);
  const insights = generateInsights(trades, currency, range);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted mt-0.5">Updates instantly as trades are added, edited, deleted, imported or restored.</p>
        </div>
        <RangeFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </header>

      <MixedCurrencyBanner
        excludedCount={m.excludedOtherCurrency}
        currencies={m.excludedCurrencies}
        accountCurrency={currency}
      />
      <NotCountedHint noResult={m.excludedNoResult} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Trades" value={String(m.totalTrades)} hint={`${m.closedTrades} with results · ${m.excludedNoResult} awaiting`} />
        <SummaryCard label="Net Profit / Loss" value={moneyOrDash(m.closedTrades ? m.netPnl : null, currency)} tone={m.netPnl > 0 ? "good" : m.netPnl < 0 ? "bad" : "neutral"} hint={`in ${currency}`} />
        <SummaryCard label="Win Rate" value={pct(m.winRate, 1)} hint={`${m.winningTrades}W / ${m.losingTrades}L / ${m.breakevenTrades}BE`} />
        <SummaryCard label="Profit Factor" value={profitFactorText(m.profitFactor)} hint="gross profit ÷ gross loss" />
        <SummaryCard label="Avg Winning Trade" value={moneyOrDash(m.avgWin, currency)} tone="good" />
        <SummaryCard label="Avg Losing Trade" value={m.avgLoss === null ? "—" : formatMoney(-m.avgLoss, currency)} tone="bad" hint="shown as loss magnitude" />
        <SummaryCard label="Best Trade" value={m.largestWin === null ? "—" : formatMoney(m.largestWin, currency)} tone="good" />
        <SummaryCard label="Worst Trade" value={m.largestLoss === null ? "—" : formatMoney(m.largestLoss, currency)} tone="bad" />
      </div>

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="card-title">Cumulative P&L curve</h2>
          <span className="text-[11px] text-muted">closed trades in chronological order · {currency}</span>
        </div>
        <ChartAreaN>
          {curve.length ? (
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4e8ef7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4e8ef7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b2537" vertical={false} />
              <XAxis dataKey="n" tick={{ fill: "#8292ab", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={{ fill: "#8292ab", fontSize: 10 }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => compactMoney(v)} />
              <Tooltip
                formatter={(value: unknown) => formatMoney(Number(value), currency)}
                labelFormatter={(label: unknown) => {
                  const pt = curve.find((p) => p.n === Number(label));
                  return pt ? (`Trade #${pt.n} · ${pt.date}` as string) : (`Trade #${String(label)}` as string);
                }}
                contentStyle={{ background: "#121a2c", border: "1px solid #263349", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#33445f" />
              <Area type="monotone" dataKey="equity" stroke="#4e8ef7" fill="url(#eqFill)" strokeWidth={1.8} dot={false} />
            </AreaChart>
          ) : (
            <EmptyChart label="Add trades with realized results to see your curve." />
          )}
        </ChartAreaN>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="card-title">Monthly performance ({currency})</h2>
          <ChartAreaN>
            {monthly.some((p) => p.netPnl !== null) ? (
              <BarChart data={monthly.filter((p) => p.netPnl !== null)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1b2537" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8292ab", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#8292ab", fontSize: 10 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compactMoney(v)} />
                <Tooltip formatter={(v: unknown) => formatMoney(Number(v), currency)} contentStyle={{ background: "#121a2c", border: "1px solid #263349", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#33445f" />
                <Bar dataKey="netPnl" radius={[3, 3, 0, 0]}>
                  {monthly.filter((p) => p.netPnl !== null).map((p, i) => (
                    <Cell key={i} fill={(p.netPnl ?? 0) >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <EmptyChart label="No closed trades in this period." />
            )}
          </ChartAreaN>
        </section>

        <section className="card p-4">
          <h2 className="card-title">Win vs Loss distribution</h2>
          <ChartAreaN>
            {wl.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={wl} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2} stroke="none">
                    {wl.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #263349", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="No results recorded yet." />
            )}
          </ChartAreaN>
          <div className="flex justify-center gap-4 text-[11px] text-muted -mt-2 pb-1">
            <span><Dot c="#34d399" /> wins {m.winningTrades}</span>
            <span><Dot c="#f87171" /> losses {m.losingTrades}</span>
            <span><Dot c="#64748b" /> breakeven {m.breakevenTrades}</span>
          </div>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="card-title">Performance by instrument</h2>
          <ChartAreaN>
            {byInstrument.length ? (
              <BarChart data={byInstrument} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#1b2537" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8292ab", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactMoney(v)} />
                <YAxis type="category" dataKey="key" width={70} tick={{ fill: "#8292ab", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: unknown) => formatMoney(Number(v), currency)} contentStyle={{ background: "#121a2c", border: "1px solid #263349", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#33445f" />
                <Bar dataKey="netPnl" radius={[0, 3, 3, 0]}>
                  {byInstrument.map((r, i) => (
                    <Cell key={i} fill={(r.netPnl ?? 0) >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <EmptyChart label="No closed trades in this period." />
            )}
          </ChartAreaN>
          <p className="text-right text-[11px] text-muted mt-1">
            <Link to="/analytics" className="text-accent hover:underline">Deeper breakdowns →</Link>
          </p>
        </section>

        <section className="card p-4">
          <h2 className="card-title">Psychology analysis</h2>
          {insights.length ? (
            <ul className="space-y-2 mt-2">
              {insights.slice(0, 5).map((ins, i) => (
                <li key={i} className={`text-xs leading-relaxed rounded px-2.5 py-2 border ${ins.kind === "warning" ? "border-warn/30 bg-warn/5 text-warn" : ins.kind === "positive" ? "border-good/30 bg-good/5 text-good" : "border-line-700 bg-surface-850 text-slate-300"}`}>
                  {ins.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted mt-2">Tag trades with psychology labels and record results — rule-based insights will appear here.</p>
          )}
          <p className="mt-3 text-[11px] text-muted">
            Computed from your data with plain rules — <Link to="/analytics" className="text-accent hover:underline">full list &amp; breakdowns</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

function ChartAreaN({ children }: { children: React.ReactElement }) {
  return <div style={{ height: N * 3.2 }} className="mt-2">{children}</div>;
}

function EmptyChart({ label }: { label: string }) {
  return <div className="h-full grid place-items-center text-xs text-muted">{label}</div>;
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ background: c }} />;
}

function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(v);
}

function NotCountedHint({ noResult }: { noResult: number }) {
  if (!noResult) return null;
  return <p className="text-[11px] text-muted">{noResult} trade(s) without a realized result are excluded from monetary metrics.</p>;
}
