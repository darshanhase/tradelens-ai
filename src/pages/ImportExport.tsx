import { useMemo, useState } from "react";
import {
  FileSpreadsheet, FileDown, FileJson, Upload, Download, CheckCircle2, TriangleAlert, Trash2, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useApp } from "@/hooks/useApp";
import { parseWorkbookToTrades, TEMPLATE_COLUMNS, tradeFingerprintParts, type ParsedImport, type TemplateColumn } from "@/services/importExport/importer";
import { exportCsv, exportXlsx, templateCsv, downloadBlob } from "@/services/importExport/exporter";
import { createBackup, validateBackup, applyRestore, type RestoreMode } from "@/services/importExport/backup";
import { addTrades, replaceAllTrades, snapshot } from "@/services/store";
import { calculatePnl, outcomeOf } from "@/services/analytics/calc";
import { rangeForPreset, type RangePreset } from "@/services/filters";
import { inRange } from "@/services/analytics/metrics";

type ImportMode = "all" | "skipDuplicates" | "review";

export default function ImportExport() {
  const { settings } = useApp();
  if (!settings) {
    return <div className="card p-10 text-center text-muted text-sm">Loading import / export tools…</div>;
  }
  return <ImportExportInner />;
}

function ImportExportInner() {
  const { trades, settings } = useApp();
  const [fileData, setFileData] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<TemplateColumn, number>>>({});
  const [mode, setMode] = useState<ImportMode>("skipDuplicates");
  const [reviewSkip, setReviewSkip] = useState<Record<number, boolean>>({});
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const preset = (new URLSearchParams(window.location.search).get("rf") as RangePreset) ?? "all";
  const viewPreset = preset === "custom"
    ? { from: new URLSearchParams(window.location.search).get("customFrom"), to: new URLSearchParams(window.location.search).get("customTo") }
    : rangeForPreset(preset);

  const headers = parsed?.headers ?? [];
  const validRows = (parsed?.rows ?? []).filter((r) => !!r.trade);
  const invalidRows = (parsed?.rows ?? []).filter((r) => !r.trade);

  // Duplicate detection across (existing trades ∪ rows already accepted in this batch).
  const duplicates = useMemo(() => {
    if (!parsed) return new Set<number>();
    const existingFingerprints = new Set(trades.map((t) => tradeFingerprintParts(t)));
    const seen = new Set<number>();
    const dup = new Set<number>();
    for (const row of parsed.rows) {
      if (!row.trade) continue;
      const fp = tradeFingerprintParts(row.trade);
      if (existingFingerprints.has(fp) || seen.has(hashFp(fp))) dup.add(row.sourceRow);
      seen.add(hashFp(fp));
    }
    return dup;
  }, [parsed, trades]);

  function hashFp(fp: string): number {
    let h = 0;
    for (let i = 0; i < fp.length; i++) h = (h * 31 + fp.charCodeAt(i)) | 0;
    return h;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErr(null);
    setImportMsg(null);
    const buffer = await file.arrayBuffer();
    setFileData({ name: file.name, buffer });
    try {
      const result = parseWorkbookToTrades(buffer.slice(0), snapshot().trades);
      setParsed(result);
      setMapping(result.mapping.map);
      setReviewSkip({});
    } catch (err) {
      setParsed(null);
      setImportErr(`Could not read "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = "";
  }

  function remap(field: TemplateColumn, value: string): void {
    const next = { ...mapping };
    for (const k of Object.keys(next) as TemplateColumn[]) if (next[k] === Number(value)) delete next[k];
    if (value === "") delete next[field];
    else next[field] = Number(value);
    setMapping(next);
    if (fileData) {
      const re = parseWorkbookToTrades(fileData.buffer.slice(0), snapshot().trades, next);
      setParsed(re);
      setReviewSkip({});
    }
  }

  /** Resolve each accepted row: manual results keep the account currency; rows without a result are auto-calculated when the spec exists. */
  async function confirmImport(): Promise<void> {
    if (!parsed) return;
    setBusy(true);
    setImportErr(null);
    try {
      const drafts: Array<Parameters<typeof addTrades>[0][number]> = [];
      let dupSkipped = 0;
      for (const row of parsed.rows) {
        if (!row.trade) continue;
        const isDup = duplicates.has(row.sourceRow);
        if (isDup && mode === "skipDuplicates") { dupSkipped++; continue; }
        if (isDup && mode === "review" && reviewSkip[row.sourceRow]) { dupSkipped++; continue; }
        const t = row.trade;
        if (t.realizedPnl !== null) {
          drafts.push({ ...t, pnlCurrency: t.pnlCurrency ?? settings.accountCurrency, resultSource: "manual" });
        } else {
          const calc = calculatePnl(t, settings.instruments);
          drafts.push(calc
            ? { ...t, realizedPnl: calc.pnl, pnlCurrency: calc.currency, resultSource: "calculated" }
            : { ...t, realizedPnl: null, pnlCurrency: null, resultSource: "calculated" });
        }
      }
      await addTrades(drafts);
      setImportMsg(`Imported ${drafts.length} trade${drafts.length === 1 ? "" : "s"}${dupSkipped ? ` · skipped ${dupSkipped} duplicate${dupSkipped === 1 ? "" : "s"}` : ""}.${invalidRows.length ? ` ${invalidRows.length} invalid row(s) were not imported (see list above).` : ""}`);
      setParsed(null);
      setFileData(null);
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function restoreFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const content: unknown = JSON.parse(await file.text());
        const v = validateBackup(content);
        if (!v.ok) { setImportErr(`Restore rejected: ${v.errors.join(" ")}`); return; }
        const mode: RestoreMode = window.confirm(`Backup contains ${v.backup.trades.length} trades.\n\nOK = REPLACE everything currently stored\nCancel = MERGE (keep existing, add new)`) ? "replace" : "merge";
        if (mode === "replace" && !window.confirm("Replace will delete ALL trades currently stored in this browser. Continue?")) return;
        await replaceAllTrades(applyRestore(snapshot().trades, v.backup, mode));
        setImportMsg(`Restored ${v.backup.trades.length} trades (${mode} mode) from "${file.name}".`);
      } catch (err) {
        setImportErr(`Invalid backup file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    input.click();
  }

  const currentView = [...trades].filter((t) => inRange(t, { from: viewPreset.from ?? null, to: viewPreset.to ?? null }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Import / Export</h1>
        <p className="text-xs text-muted mt-0.5">Bring your existing Excel journal in, and keep a backup out.</p>
      </header>

      {(importMsg || importErr) && (
        <div className={`rounded px-3 py-2 text-xs flex items-start gap-2 border ${importErr ? "border-bad/40 bg-bad/10 text-bad" : "border-good/40 bg-good/10 text-good"}`}>
          {importErr ? <TriangleAlert size={14} className="mt-0.5" /> : <CheckCircle2 size={14} className="mt-0.5" />}
          <span>{importErr ?? importMsg}</span>
          <button className="ml-auto text-muted" onClick={() => { setImportMsg(null); setImportErr(null); }} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ---------- Import (prompt §9) ---------- */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="card-title flex items-center gap-1.5"><Upload size={14} /> Import Excel / CSV</h2>
          <div className="flex gap-2">
            <button className="btn-ghost !py-1 !text-xs" onClick={() => downloadBlob(templateCsv(), "tradelens-ai-template.csv", "text/csv")}>
              <FileDown size={13} /> CSV template
            </button>
            <button className="btn-ghost !py-1 !text-xs" onClick={() => downloadSampleXlsx() as unknown as void}>
              <FileDown size={13} /> XLSX template
            </button>
          </div>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Supported columns (auto-detected): Date, Pair/Symbol, Direction/Side, Entry, Exit, Lots/Volume, Result/P&L, Psychology/Emotion, Notes — in .xlsx, .xls or .csv.
          Rows that fail validation are kept visible with their row number; nothing is silently dropped.
        </p>

        <label className="btn-primary cursor-pointer w-fit">
          <FileSpreadsheet size={15} /> Choose .xlsx / .xls / .csv file…
          <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => void onFile(e)} aria-label="Choose import file" />
        </label>
        {fileData && <p className="text-[11px] text-muted">Selected: {fileData.name}</p>}

        {parsed && (
          <div className="space-y-3">
            {/* Column mapping */}
            <div>
              <button className="text-xs text-accent hover:underline" onClick={() => setMapOpen((v) => !v)}>
                {mapOpen ? "▾" : "▸"} Column mapping {mapOpen ? "" : "(auto-detected — click to adjust)"}
              </button>
              {mapOpen && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TEMPLATE_COLUMNS.map((field) => (
                    <label key={field} className="text-[11px] text-muted flex items-center gap-1.5">
                      <span className="w-20">{field}</span>
                      <select className="input !py-1 !text-xs" value={mapping[field] !== undefined ? String(mapping[field]) : ""} onChange={(e) => remap(field, e.target.value)}>
                        <option value="">— unmapped —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `column ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Preview normalized rows */}
            <div className="overflow-x-auto rounded border border-line-900 max-h-72">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-surface-800">
                  <tr className="text-muted">
                    <th className="px-2 py-1.5 text-left font-medium">Row</th>
                    <th className="px-2 py-1.5 text-left font-medium">Date</th>
                    <th className="px-2 py-1.5 text-left font-medium">Instrument</th>
                    <th className="px-2 py-1.5 text-left font-medium">Dir</th>
                    <th className="px-2 py-1.5 text-right font-medium">Entry</th>
                    <th className="px-2 py-1.5 text-right font-medium">Exit</th>
                    <th className="px-2 py-1.5 text-right font-medium">Lots</th>
                    <th className="px-2 py-1.5 text-right font-medium">Result</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 60).map((r) => {
                    const t = r.trade;
                    const isDup = duplicates.has(r.sourceRow);
                    const outcome = outcomeOf(t?.realizedPnl ?? null);
                    return (
                      <tr key={r.sourceRow} className={`border-t border-line-900/60 ${r.errors.length ? "bg-bad/5" : isDup && (mode === "skipDuplicates" || reviewSkip[r.sourceRow]) ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1 text-muted">{r.sourceRow}</td>
                        {t ? (
                          <>
                            <td className="px-2 py-1">{t.date}</td>
                            <td className="px-2 py-1">{t.instrument}</td>
                            <td className="px-2 py-1">{t.direction}</td>
                            <td className="px-2 py-1 text-right">{t.entryPrice}</td>
                            <td className="px-2 py-1 text-right">{t.exitPrice}</td>
                            <td className="px-2 py-1 text-right">{t.lotSize}</td>
                            <td className={`px-2 py-1 text-right ${outcome === "win" ? "text-good" : outcome === "loss" ? "text-bad" : "text-slate-300"}`}>{t.realizedPnl ?? <span className="text-muted">—</span>}</td>
                            <td className="px-2 py-1">
                              {isDup && <span className="text-warn">duplicate · </span>}
                              {r.warnings.map((w, i) => <span key={i} className="text-warn">{w} · </span>)}
                              <span className="text-muted">{t.realizedPnl !== null ? "manual result" : calculatePnl(t, settings.instruments) ? `auto → ${calculatePnl(t, settings.instruments)!.currency}` : "no spec → unresolved"}</span>
                              {isDup && mode === "review" && (
                                <label className="ml-2 text-[10px]">
                                  <input type="checkbox" checked={reviewSkip[r.sourceRow] ?? false} onChange={(e) => setReviewSkip((s) => ({ ...s, [r.sourceRow]: e.target.checked }))} /> skip
                                </label>
                              )}
                            </td>
                          </>
                        ) : (
                          <td colSpan={9} className="px-2 py-1 text-bad">
                            ⚠ {r.errors.join(" · ")}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsed.rows.length > 60 && <p className="px-2 py-1.5 text-[10px] text-muted">…and {parsed.rows.length - 60} more rows.</p>}
            </div>

            {/* Duplicate handling (prompt §9) */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted">Duplicates:</span>
              {([
                { id: "all", label: "Import all valid rows" },
                { id: "skipDuplicates", label: `Skip likely duplicates (${duplicates.size})` },
                { id: "review", label: "Review duplicates (marked above)" },
              ] as const).map((o) => (
                <label key={o.id} className="flex items-center gap-1.5">
                  <input type="radio" name="dupMode" checked={mode === o.id} onChange={() => { setMode(o.id); if (o.id === "review") { const skip: Record<number, boolean> = {}; for (const r of duplicates) skip[r] = true; setReviewSkip(skip); } }} />
                  {o.label}
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button className="btn-primary" disabled={busy || validRows.length === 0} onClick={() => void confirmImport()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import {validRows.length} valid row(s)
              </button>
              <button className="btn-ghost" onClick={() => { setParsed(null); setFileData(null); }}>Discard</button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Export & backup (prompt §10) ---------- */}
      <section className="card p-4 space-y-3">
        <h2 className="card-title flex items-center gap-1.5"><Download size={14} /> Export &amp; backup</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <button className="btn-ghost justify-start" onClick={() => downloadBlob(exportCsv([...trades].sort((a, b) => (a.date < b.date ? -1 : 1))), `tradelens-ai-all-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv")}>
            <FileDown size={14} /> Export all trades (CSV)
          </button>
          <button className="btn-ghost justify-start" onClick={() => downloadBlob(exportXlsx([...trades].sort((a, b) => (a.date < b.date ? -1 : 1))), `tradelens-ai-all-${new Date().toISOString().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
            <FileSpreadsheet size={14} /> Export all trades (Excel)
          </button>
          <button className="btn-ghost justify-start" onClick={() => downloadBlob(exportCsv(currentView), `tradelens-ai-view-${viewPreset.from ?? "start"}-${viewPreset.to ?? "end"}.csv`, "text/csv")}>
            <FileDown size={14} /> Export current journal view ({currentView.length})
          </button>
          <button className="btn-ghost justify-start" onClick={() => downloadBlob(JSON.stringify(createBackup(trades, settings), null, 2), `tradelens-ai-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json")}>
            <FileJson size={14} /> Download full JSON backup
          </button>
          <button className="btn-ghost justify-start" onClick={restoreFile}>
            <Upload size={14} /> Restore from JSON backup…
          </button>
          <button
            className="btn-danger justify-start"
            onClick={() => {
              const dayCount = trades.length;
              if (window.confirm(`Clear ALL data? This deletes ${dayCount} stored trade(s) from this browser permanently.\n(Cancel = do nothing. Export a backup first if unsure.)`)) {
                void replaceAllTrades([]);
              }
            }}
          >
            <Trash2 size={14} /> Clear all data…
          </button>
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          Trades: {trades.length} stored · Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : "never"}. Backups include trades,
          instrument specs and settings — keep copies outside the browser, since Clearing site data in the browser wipes your journal.
        </p>
      </section>
    </div>
  );
}

function downloadSampleXlsx(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Date", "Pair", "Direction", "Entry", "Exit", "Lots", "Result", "Psychology", "Notes"],
    ["2026-01-05", "EURUSD", "BUY", 1.1, 1.115, 0.5, "", "Disciplined", "followed plan"],
    ["2026-01-06", "XAUUSD", "SELL", 2680, 2672, 0.01, 80, "", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trades");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Uint8Array(out), "tradelens-ai-template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

