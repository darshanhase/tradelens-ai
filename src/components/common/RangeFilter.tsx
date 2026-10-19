import { useMemo } from "react";
import { rangeForPreset, type RangePreset } from "@/services/filters";
import type { DateRange } from "@/services/analytics/metrics";

const PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: "all", label: "All Time" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom" },
];

/** Date-range filter shared by Dashboard and Analytics (prompt §6). */
export function RangeFilter({
  preset,
  custom,
  onPreset,
  onCustom,
}: {
  preset: RangePreset;
  custom: { from: string; to: string };
  onPreset: (p: RangePreset) => void;
  onCustom: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded border border-line-700 overflow-hidden text-xs">
        {PRESETS.map((p) => (
          <button key={p.id} className={`px-2.5 py-1.5 ${preset === p.id ? "bg-surface-700 text-slate-100" : "text-muted hover:text-slate-200"}`} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <span className="flex items-center gap-1 text-xs">
          <input type="date" className="input !py-1" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} aria-label="From date" />
          <span className="text-muted">→</span>
          <input type="date" className="input !py-1" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} aria-label="To date" />
        </span>
      )}
      <RangeHint preset={preset} custom={custom} />
    </div>
  );
}

function RangeHint({ preset, custom }: { preset: RangePreset; custom: { from: string; to: string } }) {
  const range: DateRange = useMemo(() => (preset === "custom" ? { from: custom.from || null, to: custom.to || null } : rangeForPreset(preset)), [preset, custom]);
  if (!range.from && !range.to) return null;
  return <span className="text-[11px] text-muted">{range.from ?? "…"} → {range.to ?? "…"}</span>;
}
