import { useState } from "react";
import { Flame, Trash2, Plus, Save, Database, Info } from "lucide-react";
import { useApp } from "@/hooks/useApp";
import * as store from "@/services/store";
import { deleteSampleTrades } from "@/services/store";
import { sampleTrades } from "@/services/storage/sampleData";
import { validateSettings } from "@/services/validation";
import type { Instrument } from "@/types/settings";
import { EmptyState } from "@/components/common/Common";

export default function Settings() {
  const { settings, trades } = useApp();
  const [saved, setSaved] = useState(false);
  const [, setErrors] = useState<string[]>([]);
  const [sampleMsg, setSampleMsg] = useState<string | null>(null);

  if (!settings) return <EmptyState title="Loading settings…" hint="" />;

  const patch = (p: Partial<typeof settings>) => {
    setSaved(false);
    setErrors([]);
    void store.updateSettings(p).then(() => setSaved(true));
  };

  const sampleCount = trades.filter((t) => t.sample === true).length;

  async function loadSample(): Promise<void> {
    if (sampleCount > 0 && !window.confirm(`Replace the existing ${sampleCount} sample trade(s) with a fresh set?`)) return;
    await store.deleteSampleTrades();
    await store.addTrades(sampleTrades());
    setSampleMsg("Sample trades loaded — they are flagged “sample” in the journal and can be removed below.");
  }

  function instrumentsError(i: Instrument): string[] {
    return validateSettings({ ...settings, instruments: [...settings.instruments.filter((x) => x.id !== i.id), i] });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted mt-0.5">Stored locally in your browser alongside your journal.</p>
        {saved && <span className="text-xs text-good">Saved ✓</span>}
      </header>

      <section className="card p-4 grid sm:grid-cols-2 gap-3">
        <h2 className="card-title sm:col-span-2">Journal preferences</h2>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Account currency (totals shown in this currency)
          <input className="input" value={settings.accountCurrency} onChange={(e) => patch({ accountCurrency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date format
          <select className="input" value={settings.dateFormat} onChange={(e) => patch({ dateFormat: e.target.value as typeof settings.dateFormat })}>
            <option value="iso">YYYY-MM-DD</option>
            <option value="dd/mm/yyyy">DD/MM/YYYY</option>
            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Theme
          <select className="input" value={settings.theme} onChange={(e) => patch({ theme: e.target.value as "dark" | "light" })}>
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Default instrument (new rows)
          <select className="input" value={settings.defaultInstrument ?? ""} onChange={(e) => patch({ defaultInstrument: e.target.value || null })}>
            <option value="">— none —</option>
            {settings.instruments.map((i) => <option key={i.id} value={i.symbol}>{i.symbol}</option>)}
          </select>
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="card-title flex items-center gap-1.5"><Database size={14} /> Instrument contract specs</h2>
        <p className="text-[11px] text-muted leading-relaxed">
          Per-instrument contract size and quote currency drive the automatic result calculation
          (result = signed price change × lots × contract size). Check these against your broker —
          they differ between brokers and account currencies. If unsure, leave results manual.
        </p>
        <div className="space-y-2">
          {settings.instruments.map((i) => (
            <InstrumentRow key={i.id} instrument={i} errorsFn={instrumentsError} />
          ))}
        </div>
        <button
          className="btn-ghost !text-xs"
          onClick={() => {
            const id = `instr-${Date.now().toString(36)}`;
            const next = [...settings.instruments, { id, symbol: "NEWPAIR", contractSize: 100000, quoteCurrency: settings.accountCurrency, precision: 5 }];
            void store.updateSettings({ instruments: next });
          }}
        >
          <Plus size={13} /> Add instrument
        </button>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="card-title flex items-center gap-1.5"><Flame size={14} /> Sample data</h2>
        <p className="text-[11px] text-muted">
          Sample trades are deterministic example rows, flagged <code>sample</code> so they are always visible and removable.
          {sampleCount > 0 && <span> Currently loaded: <strong className="text-slate-300">{sampleCount}</strong>.</span>}
        </p>
        {sampleMsg && <p className="text-xs text-good">{sampleMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost !text-xs" onClick={() => void loadSample()}>
            <Flame size={13} /> {sampleCount > 0 ? "Reload sample trades" : "Load sample trades"}
          </button>
          <button
            className="btn-ghost !text-xs border-bad/40 text-bad"
            disabled={sampleCount === 0}
            onClick={() => void deleteSampleTrades().then((n) => setSampleMsg(`Removed ${n} sample trade(s). Real trades untouched.`))}
          >
            <Trash2 size={13} /> Remove sample trades
          </button>
        </div>
      </section>

      <section className="card p-4 space-y-1.5 text-[11px] text-muted leading-relaxed">
        <h2 className="card-title flex items-center gap-1.5"><Info size={14} /> Data storage &amp; privacy</h2>
        <p>• Your journal lives in <strong>IndexedDB inside this browser profile on this device</strong> — not on a server, not on other devices. It will not sync automatically between browsers or machines.</p>
        <p>• Clearing the browser's site data (or using private/incognito windows) can erase the journal. <strong className="text-warn">Browser storage is not a backup</strong> — download a JSON backup from Import / Export regularly.</p>
        <p>• Everything is computed locally in your browser. No accounts, no API keys, no network calls with your data.</p>
      </section>
    </div>
  );
}

type InstrumentRowProps = {
  instrument: Instrument;
  errorsFn: (i: Instrument) => string[];
};

function InstrumentRow({ instrument, errorsFn }: InstrumentRowProps) {
  const [draft, setDraft] = useState<Instrument>(instrument);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(instrument);

  const set = (k: keyof Instrument, v: string) => setDraft((d) => ({
    ...d,
    [k]: k === "symbol" ? v.toUpperCase().slice(0, 12)
      : k === "contractSize" || k === "precision" ? Number(v)
      : (k === "quoteCurrency" ? v.toUpperCase().slice(0, 3) : (d as unknown as Record<string, unknown>)[k]),
  }));

  return (
    <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start bg-surface-850 rounded p-2 border border-line-900">
      <label className="text-[10px] text-muted">Symbol
        <input className="input !py-1" value={draft.symbol} onChange={(e) => set("symbol", e.target.value)} />
      </label>
      <label className="text-[10px] text-muted">Contract size
        <input className="input !py-1" inputMode="decimal" value={draft.contractSize} onChange={(e) => set("contractSize", e.target.value)} />
      </label>
      <label className="text-[10px] text-muted">Quote currency
        <input className="input !py-1" value={draft.quoteCurrency} onChange={(e) => set("quoteCurrency", e.target.value)} maxLength={3} />
      </label>
      <div className="flex gap-1.5 items-start md:pt-4">
        <button
          className="btn-primary !py-1 !text-xs"
          disabled={!dirty}
          onClick={() => {
            const errs = errorsFn(draft);
            if (errs.length) { setError(errs.filter((e) => e.includes(draft.symbol) || !e.includes("unique")).join(" ") || errs.join(" ")); return; }
            setError(null);
            void store.upsertInstrument(draft);
          }}
          title="Save this instrument"
        >
          <Save size={12} />
        </button>
        <button
          className="btn-ghost !py-1 !text-xs text-bad border-bad/40"
          onClick={() => {
            if (window.confirm(`Remove ${draft.symbol}? Sheets that already used it keep their stored trades.`)) {
              void store.updateSettings({ instruments: store.getState().settings.instruments.filter((x) => x.id !== draft.id) });
            }
          }}
          title="Delete instrument"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {error && <p className="col-span-full text-[10px] text-bad">{error}</p>}
    </div>
  );
}
