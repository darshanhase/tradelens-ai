import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/hooks/useApp";
import { SpreadsheetTable } from "@/components/journal/SpreadsheetTable";
import { TradeFormModal } from "@/components/forms/TradeFormModal";
import { EmptyState } from "@/components/common/Common";
import { PSYCHOLOGY_TAGS } from "@/types/trade";
import {
  emptyFilters, filterTrades, sortTradesForView, countActiveFilters, queryFromFilters,
  rangeForPreset, type RangePreset, type SortKey, type OutcomeFilter, type JournalFilters,
} from "@/services/filters";

const PAGE_SIZE = 50;

export default function Journal() {
  const { trades, settings } = useApp();
  const [params, setParams] = useSearchParams();

  // Filters round-trip through the URL so Analytics breakdowns can deep-link here.
  const presets: Array<{ id: RangePreset; label: string }> = [
    { id: "all", label: "All Time" },
    { id: "thisMonth", label: "This Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "last30", label: "Last 30 Days" },
    { id: "custom", label: "Custom" },
  ];
  const [preset, setPreset] = useState<RangePreset>((params.get("rf") as RangePreset) ?? "all");
  const [customFrom, setCustomFrom] = useState(params.get("customFrom") ?? "");
  const [customTo, setCustomTo] = useState(params.get("customTo") ?? "");
  const [instrument, setInstrument] = useState(params.get("instrument") ?? "");
  const [direction, setDirection] = useState<"" | "BUY" | "SELL">((params.get("direction") as "BUY" | "SELL") ?? "");
  const [outcome, setOutcome] = useState<OutcomeFilter>((params.get("outcome") as OutcomeFilter) ?? "all");
  const [psychology, setPsychology] = useState(params.get("psych") ?? "");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);

  const filters: JournalFilters = useMemo(() => {
    const range = preset === "custom"
      ? { from: customFrom || null, to: customTo || null }
      : rangeForPreset(preset);
    return {
      range,
      instrument: instrument.trim() ? instrument.trim().toUpperCase() : null,
      direction: direction || null,
      outcome,
      psychology: psychology || null,
      search,
    };
  }, [preset, customFrom, customTo, instrument, direction, outcome, psychology, search]);

  // URL follows the filters (replace mode) so Analytics breakdowns can deep-link here.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (preset !== "all") sp.set("rf", preset);
    if (customFrom && preset === "custom") sp.set("customFrom", customFrom);
    if (customTo && preset === "custom") sp.set("customTo", customTo);
    if (instrument.trim()) sp.set("instrument", instrument.trim().toUpperCase());
    if (direction) sp.set("direction", direction);
    if (outcome !== "all") sp.set("outcome", outcome);
    if (psychology) sp.set("psych", psychology);
    if (search.trim()) sp.set("q", search.trim());
    setParams(sp, { replace: true });
  }, [preset, customFrom, customTo, instrument, direction, outcome, psychology, search, setParams]);

  function pushUrl(): void {
    const sp = new URLSearchParams(params);
    Object.entries(queryFromFilters(filters, preset)).forEach(([k, v]) => v ? sp.set(k, String(v)) : sp.delete(k));
    setParams(sp, { replace: true });
  }

  if (!settings) return <LoadingBlock />;

  const filtered = filterTrades(trades, filters);
  const sorted = sortTradesForView(filtered, sortKey, sortDir);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const view = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const active = countActiveFilters(filters);

  const clear = () => {
    setPreset("all"); setCustomFrom(""); setCustomTo(""); setInstrument(""); setDirection(""); setOutcome("all"); setPsychology(""); setSearch(""); setPage(0);
    setParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Trade Journal</h1>
          <p className="text-xs text-muted mt-0.5">
            {trades.length} trade{trades.length === 1 ? "" : "s"} stored · {filtered.length} shown · results {settings.accountCurrency} where marked
          </p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen(true)}>
          <Plus size={15} /> Add Trade (form)
        </button>
      </header>

      {/* Filter toolbar (prompt §11) */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-line-700 overflow-hidden text-xs">
          {presets.map((p) => (
            <button
              key={p.id}
              className={`px-2.5 py-1.5 ${preset === p.id ? "bg-surface-700 text-slate-100" : "text-muted hover:text-slate-200"}`}
              onClick={() => { setPreset(p.id); setPage(0); }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <span className="flex items-center gap-1 text-xs">
            <input type="date" className="input !py-1" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }} aria-label="From date" />
            <span className="text-muted">→</span>
            <input type="date" className="input !py-1" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(0); }} aria-label="To date" />
          </span>
        )}
        <input className="input !py-1 w-36" placeholder="Instrument" value={instrument} onChange={(e) => { setInstrument(e.target.value); setPage(0); }} list="instrument-list" aria-label="Filter by instrument" />
        <select className="input !py-1 w-24" value={direction} onChange={(e) => { setDirection(e.target.value as "" | "BUY" | "SELL"); setPage(0); }} aria-label="Filter by direction">
          <option value="">Both sides</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <select className="input !py-1 w-28" value={outcome} onChange={(e) => { setOutcome(e.target.value as OutcomeFilter); setPage(0); }} aria-label="Filter by outcome">
          <option value="all">Any result</option>
          <option value="win">Wins only</option>
          <option value="loss">Losses only</option>
          <option value="breakeven">Breakeven only</option>
          <option value="unresolved">No result yet</option>
        </select>
        <select className="input !py-1 w-36" value={psychology} onChange={(e) => { setPsychology(e.target.value); setPage(0); }} aria-label="Filter by psychology tag">
          <option value="">Any psychology</option>
          {PSYCHOLOGY_TAGS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !py-1 !pl-7 w-44" placeholder="Search notes & tags" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label="Search" />
        </div>
        <select className="input !py-1 w-40" value={`${sortKey}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSortKey(k as SortKey); setSortDir(d as "asc" | "desc"); }} aria-label="Sort">
          <option value="date:asc">Date (oldest first)</option>
          <option value="date:desc">Date (newest first)</option>
          <option value="pnl:desc">P&L (worst first)</option>
          <option value="pnl:asc">P&L (best first)</option>
          <option value="instrument:asc">Instrument (A→Z)</option>
        </select>
        {active > 0 && (
          <button className="btn-ghost !py-1 !text-xs" onClick={clear}>
            <X size={12} /> Clear filters ({active})
          </button>
        )}
      </div>
      {trades.length === 0 ? (
        <EmptyState
          title="Your journal is empty"
          hint="Click “+ Add Trade” to enter your first trade in the spreadsheet below, paste rows copied straight out of Excel, or import your existing .xlsx/.csv journal from Import / Export."
        />
      ) : view.length === 0 ? (
        <EmptyState title="No trades match these filters" hint="Loosen or clear the filters above to see trades again." />
      ) : (
        <SpreadsheetTable settings={settings} />
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted">
          <button className="btn-ghost !py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={13} /></button>
          <span>Page {page + 1} / {pages} · {sorted.length} trades</span>
          <button className="btn-ghost !py-1" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
        </div>
      )}

      <datalist id="instrument-list">
        {settings.instruments.map((i) => <option key={i.id} value={i.symbol} />)}
      </datalist>

      {formOpen && <TradeFormModal onClose={() => { setFormOpen(false); pushUrl(); }} />}
    </div>
  );
}

function LoadingBlock() {
  return <div className="card p-10 text-center text-muted text-sm">Loading your journal…</div>;
}

// Prevent tree-shaking of the query helpers (used by Analytics deep links via /journal?...)
void emptyFilters;
