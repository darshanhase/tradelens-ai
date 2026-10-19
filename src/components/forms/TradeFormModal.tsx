import { useState } from "react";
import { X } from "lucide-react";
import { PSYCHOLOGY_TAGS, type Trade } from "@/types/trade";
import { useApp } from "@/hooks/useApp";
import { addTrade, instrumentFor } from "@/services/store";
import { calculatePnl } from "@/services/analytics/calc";
import { todayIso } from "@/components/journal/spreadsheet-utils";

/**
 * Simple add-trade form (prompt §5: "a simple form for users who prefer not
 * to edit cells directly"). Minimal required fields; the result can be left
 * blank and auto-filled from the instrument spec, or entered manually.
 */
export function TradeFormModal({ onClose }: { onClose: () => void }) {
  const { settings } = useApp();
  const [form, setForm] = useState({
    date: todayIso(),
    instrument: settings?.defaultInstrument ?? "",
    direction: "BUY" as Trade["direction"],
    entryPrice: "",
    exitPrice: "",
    lotSize: "",
    resultSource: "manual" as "manual" | "calculated",
    result: "",
    psychology: [] as string[],
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string | string[] | number) => setForm((f) => ({ ...f, [k]: v }));

  const preview = previewPnl(form);

  async function save(): Promise<void> {
    setError(null);
    const errs: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errs.push("Valid date required (YYYY-MM-DD).");
    if (!form.instrument.trim()) errs.push("Instrument is required.");
    for (const [label, v] of [["entry price", form.entryPrice], ["exit price", form.exitPrice], ["lot size", form.lotSize]] as const) {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) errs.push(`Valid ${label} required.`);
    }
    if (form.resultSource === "manual" && form.result !== "" && !Number.isFinite(Number(form.result.replace(",", ".")))) errs.push("Result must be a number.");
    if (errs.length) { setError(errs.join(" ")); return; }

    setSaving(true);
    let realizedPnl: number | null = null;
    let pnlCurrency: string | null = null;
    let resultSource: Trade["resultSource"] = "manual";
    const base = {
      date: form.date,
      instrument: form.instrument.trim().toUpperCase(),
      direction: form.direction,
      entryPrice: Number(form.entryPrice.replace(",", ".")),
      exitPrice: Number(form.exitPrice.replace(",", ".")),
      lotSize: Number(form.lotSize.replace(",", ".")),
      psychology: form.psychology,
      notes: form.notes,
    };
    if (form.resultSource === "manual" && form.result !== "") {
      realizedPnl = Number(form.result.replace(",", "."));
      pnlCurrency = settings.accountCurrency;
      resultSource = "manual";
    } else {
      const calc = calculatePnl(base, settings.instruments);
      if (calc) { realizedPnl = calc.pnl; pnlCurrency = calc.currency; resultSource = "calculated"; }
      // unknown instrument without a manual result → record stays unresolved with a warning
    }
    await addTrade({ ...base, realizedPnl, pnlCurrency, resultSource });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add trade">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Add trade</h2>
          <button className="text-muted hover:text-slate-200" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted gap-1 flex flex-col">Date <span className="sr-only">Date</span>
            <input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Instrument
            <input className="input" value={form.instrument} onChange={(e) => set("instrument", e.target.value.toUpperCase())} list="instrument-list" placeholder="EURUSD / XAUUSD / custom…" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Direction
            <select className="input" value={form.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Lot size
            <input className="input" inputMode="decimal" value={form.lotSize} onChange={(e) => set("lotSize", e.target.value)} placeholder="0.10" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Entry price
            <input className="input" inputMode="decimal" value={form.entryPrice} onChange={(e) => set("entryPrice", e.target.value)} placeholder="1.1000" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Exit price
            <input className="input" inputMode="decimal" value={form.exitPrice} onChange={(e) => set("exitPrice", e.target.value)} placeholder="1.1100" />
          </label>

          <div className="col-span-2 flex items-center gap-2 text-xs text-muted">
            <span>Result:</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={form.resultSource === "manual"} onChange={() => set("resultSource", "manual")} /> manual ({settings.accountCurrency})
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={form.resultSource === "calculated"} onChange={() => set("resultSource", "calculated")} /> auto-calculate
            </label>
          </div>
          {form.resultSource === "manual" ? (
            <label className="text-xs text-muted flex flex-col gap-1 col-span-2">
              Realized result ({settings.accountCurrency})
              <input className="input" inputMode="decimal" value={form.result} onChange={(e) => set("result", e.target.value)} placeholder="e.g. -75.25" />
            </label>
          ) : (
            <p className="col-span-2 text-xs text-muted">
              {preview.ok
                ? `${preview.sign}$${Math.abs(preview.value).toFixed(2)} ${preview.currency}`
                : preview.reason}
            </p>
          )}

          <div className="col-span-2">
            <div className="text-xs text-muted mb-1">Psychology (optional)</div>
            <div className="flex flex-wrap gap-1.5">
              {PSYCHOLOGY_TAGS.map((tag) => {
                const active = form.psychology.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => set("psychology", active ? form.psychology.filter((p) => p !== tag) : [...form.psychology, tag])}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${active ? "border-accent bg-accent/15 text-accent" : "border-line-500 text-muted hover:text-slate-300"}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="text-xs text-muted flex flex-col gap-1 col-span-2">
            Trade notes (optional)
            <textarea className="input h-20 resize-y" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What was the plan? How did it play out?" />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-bad">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={() => void save()}>Save trade</button>
        </div>
      </div>
    </div>
  );
}

function previewPnl(form: { direction: Trade["direction"]; instrument: string; entryPrice: string; exitPrice: string; lotSize: string }): { ok: true; value: number; currency: string; sign: string } | { ok: false; reason: string } {
  const spec = instrumentFor(form.instrument);
  if (!spec) return { ok: false, reason: `No contract spec saved for ${form.instrument || "this instrument"} yet — set one in Settings, or enter the result manually.` };
  const entry = Number(form.entryPrice.replace(",", "."));
  const exit = Number(form.exitPrice.replace(",", "."));
  const lots = Number(form.lotSize.replace(",", "."));
  if (![entry, exit, lots].every(Number.isFinite)) return { ok: false, reason: "Enter entry, exit and lot size to see the calculated result." };
  const signed = form.direction === "BUY" ? exit - entry : entry - exit;
  const value = signed * lots * spec.contractSize;
  return { ok: true, value: Math.abs(value) <= 1e-9 ? 0 : value, currency: spec.quoteCurrency, sign: value < 0 ? "-" : "+" };
}
