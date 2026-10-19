import { useState } from "react";
import { Trash2, Sigma, Hand } from "lucide-react";
import type { Trade } from "@/types/trade";
import { PSYCHOLOGY_TAGS } from "@/types/trade";
import type { Settings } from "@/types/settings";
import { calculatePnl, outcomeOf } from "@/services/analytics/calc";
import * as store from "@/services/store";

/**
 * Spreadsheet-style editable trade grid (prompt §5) — the most important
 * feature. Feels like Excel: cells are inputs, Enter commits and moves down,
 * Tab moves right, and tabular data pasted from Excel (TSV rows) appends
 * trades directly. Fields beyond the minimal set stay out of the way.
 */

const COLS = ["date", "instrument", "direction", "entryPrice", "exitPrice", "lotSize", "result", "psychology", "notes"] as const;
type Col = (typeof COLS)[number];

const COL_LABELS: Record<Col, string> = {
  date: "Date",
  instrument: "Instrument",
  direction: "Direction",
  entryPrice: "Entry",
  exitPrice: "Exit",
  lotSize: "Lots",
  result: "Result",
  psychology: "Psychology",
  notes: "Notes",
};

interface RowStrings {
  date: string; instrument: string; direction: string; entryPrice: string; exitPrice: string; lotSize: string; result: string; psychology: string; notes: string;
}

function stringsFromTrade(t: Trade): RowStrings {
  return {
    date: t.date,
    instrument: t.instrument,
    direction: t.direction,
    entryPrice: String(t.entryPrice),
    exitPrice: String(t.exitPrice),
    lotSize: String(t.lotSize),
    result: t.realizedPnl === null ? "" : String(t.realizedPnl),
    psychology: t.psychology.join(", "),
    notes: t.notes,
  };
}

export function SpreadsheetTable({ settings }: { settings: Settings }) {
  const { trades } = store.getState();

  // per-trade pending edits, plus transient new-row draft
  const [edits, setEdits] = useState<Record<string, RowStrings>>({});
  const [draft, setDraft] = useState<RowStrings | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [flash, setFlash] = useState<string>("");

  function setEdit(id: string, col: Col, value: string) {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? stringsFromTrade(trades.find((t) => t.id === id) as Trade)), [col]: value } }));
  }

  async function commit(trade: Trade, strings: RowStrings): Promise<void> {
    const errors = validateRow(strings);
    setRowErrors((e) => ({ ...e, [trade.id]: errors }));
    if (errors.length) return;
    const current = store.getState().trades.find((t) => t.id === trade.id);
    if (!current) return;
    const realizedPnl = strings.result === "" ? null : Number(strings.result.replace(",", "."));
    await store.updateTrade(trade.id, {
      date: strings.date,
      instrument: strings.instrument.trim().toUpperCase(),
      direction: strings.direction as Trade["direction"],
      entryPrice: Number(strings.entryPrice.replace(",", ".")),
      exitPrice: Number(strings.exitPrice.replace(",", ".")),
      lotSize: Number(strings.lotSize.replace(",", ".")),
      realizedPnl,
      pnlCurrency: realizedPnl === null ? null : (current.pnlCurrency ?? settings.accountCurrency),
      resultSource: realizedPnl === null ? current.resultSource : "manual",
      psychology: splitTags(strings.psychology),
      notes: strings.notes,
    });
    setEdits((e) => {
      const next = { ...e };
      delete next[trade.id];
      return next;
    });
    setFlash(`Saved ${trade.instrument} ${trade.date}`);
    window.setTimeout(() => setFlash(""), 1500);
  }

  function commitDraft(d: RowStrings, after: () => void): void {
    const errors = validateRow(d);
    if (errors.length) {
      setFlash(errors[0]);
      window.setTimeout(() => setFlash(""), 2500);
      return; // keep the draft row so nothing is lost
    }
    void store.addTrade({
      ...stringsToDraft(d, settings.accountCurrency),
    }).then(() => {
      setDraft(null);
      setFlash("Trade added");
      window.setTimeout(() => setFlash(""), 1500);
      after();
    });
  }

  /** Paste tabular rows copied from Excel (prompt §5 "allow pasting tabular data"). */
  async function handlePaste(e: React.ClipboardEvent): Promise<void> {
    const text = e.clipboardData.getData("text/plain");
    if (!/\t/.test(text)) return; // only multi-column TSV
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 1) return;
    const parsed: Array<Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion">> = [];
    const skipped: number[] = [];
    lines.forEach((line, i) => {
      const cells = line.split("\t").map((c) => c.trim());
      // expected column order mirrors the visible grid: Date, Instrument, Direction, Entry, Exit, Lots, Result
      const [date, instrument, direction, entry, exit, lots, result] = cells;
      const errMsg = validateCells({ date, instrument, direction, entry, exit, lots, result });
      if (errMsg) {
        skipped.push(i + 1);
        return;
      }
      parsed.push(stringsToDraft({
        date, instrument, direction,
        entryPrice: entry, exitPrice: exit, lotSize: lots, result: result ?? "",
        psychology: "", notes: "",
      }, settings.accountCurrency));
    });
    e.preventDefault();
    if (parsed.length) {
      await store.addTrades(parsed);
      setFlash(`Pasted ${parsed.length} trade${parsed.length === 1 ? "" : "s"}${skipped.length ? ` · ${skipped.length} row(s) skipped (invalid)` : ""}`);
      window.setTimeout(() => setFlash(""), 3000);
    } else if (skipped.length) {
      setFlash(`Pasted rows invalid — nothing imported (${skipped.length} row(s) skipped)`);
      window.setTimeout(() => setFlash(""), 3000);
    }
  }

  function keyNav(e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, _colIndex: number): void {
    const inputs = Array.from((e.currentTarget.closest("table") as HTMLTableElement).querySelectorAll<HTMLInputElement>("input.cell-input"));
    const allInputs = inputs.filter((i) => !i.disabled);
    const globalIndex = inputs.indexOf(e.currentTarget);
    if (!allInputs.includes(e.currentTarget)) return;
    if (e.key === "Enter") {
      // commit + move down / add row at the end
      const row = trades[rowIndex];
      if (draft) {
        commitDraft(draft, () => {
          const nextInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input.cell-input"));
          nextInputs[globalIndex + COLS.length]?.focus();
        });
      } else if (row) {
        void commit(row, edits[row.id] ?? stringsFromTrade(row)).then(() => {
          const nextInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input.cell-input"));
          nextInputs[globalIndex + COLS.length]?.focus();
        });
      }
      return;
    }
    if (e.key === "Tab") return; // native behaviour already moves right; commit handled by blur handler
    if (e.key === "ArrowDown") {
      e.preventDefault();
      allInputs[allInputs.indexOf(e.currentTarget) + COLS.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      allInputs[allInputs.indexOf(e.currentTarget) - COLS.length]?.focus();
    } else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      allInputs[allInputs.indexOf(e.currentTarget) + 1]?.focus();
    } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      allInputs[allInputs.indexOf(e.currentTarget) - 1]?.focus();
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  function autoCalc(trade: Trade): void {
    const calc = calculatePnl(trade, settings.instruments);
    if (!calc) {
      setFlash(`No contract size saved for ${trade.instrument} — add it in Settings to auto-calculate`);
      window.setTimeout(() => setFlash(""), 2500);
      return;
    }
    void store.updateTrade(trade.id, {
      realizedPnl: calc.pnl,
      pnlCurrency: calc.currency,
      resultSource: "calculated",
    });
    setEdits((e) => {
      const next = { ...e };
      delete next[trade.id];
      return next;
    });
  }

  const input = "input cell-input";
  return (
    <div>
      {flash && <div className="fixed bottom-4 right-4 z-40 rounded bg-accent/90 px-3 py-1.5 text-xs text-white shadow" role="status">{flash}</div>}
      <div className="overflow-x-auto rounded-lg border border-line-900 bg-surface-900">
        <table className="w-full min-w-[980px] border-collapse text-sm" onPaste={handlePaste}>
          <thead>
            <tr className="border-b border-line-900">
              {COLS.map((c) => (
                <th key={c} className="table-head px-2 py-2 text-left whitespace-nowrap">{COL_LABELS[c]}</th>
              ))}
              <th className="table-head px-2 py-2 text-right">Done?</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, rowIndex) => {
              const strings = edits[trade.id] ?? stringsFromTrade(trade);
              const outcome = outcomeOf(strings.result === "" ? trade.realizedPnl : Number(strings.result.replace(",", ".")));
              const errors = rowErrors[trade.id] ?? [];
              const isCalc = trade.resultSource === "calculated";
              return (
                <tr key={trade.id} className="border-b border-line-900/60 hover:bg-surface-850/50 focus-within:bg-surface-850">
                  <RowCell key={isCalc ? `${trade.id}-calc` : `${trade.id}-${trade.updatedAt}`} errors={errors}>
                    <input className={input} inputMode="numeric" value={strings.date} onChange={(e) => setEdit(trade.id, "date", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 0)} onBlur={() => void commit(trade, strings)} aria-label="Date" />
                  </RowCell>
                  <td className="p-0">
                    <input className={input} value={strings.instrument} onChange={(e) => setEdit(trade.id, "instrument", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 1)} onBlur={() => void commit(trade, strings)} aria-label="Instrument" list="instrument-list" />
                  </td>
                  <td className="p-0">
                    <select className="cell-input cursor-pointer" value={strings.direction} onChange={(e) => { setEdit(trade.id, "direction", e.target.value); void store.updateTrade(trade.id, { direction: e.target.value as Trade["direction"] }); }} aria-label="Direction">
                      <option value="BUY">Buy</option>
                      <option value="SELL">Sell</option>
                    </select>
                  </td>
                  <RowCell errors={errors}>
                    <input className={input} inputMode="decimal" value={strings.entryPrice} onChange={(e) => setEdit(trade.id, "entryPrice", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 3)} onBlur={() => void commit(trade, strings)} aria-label="Entry price" />
                  </RowCell>
                  <RowCell errors={errors}>
                    <input className={input} inputMode="decimal" value={strings.exitPrice} onChange={(e) => setEdit(trade.id, "exitPrice", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 4)} onBlur={() => void commit(trade, strings)} aria-label="Exit price" />
                  </RowCell>
                  <RowCell errors={errors}>
                    <input className={input} inputMode="decimal" value={strings.lotSize} onChange={(e) => setEdit(trade.id, "lotSize", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 5)} onBlur={() => void commit(trade, strings)} aria-label="Lot size" />
                  </RowCell>
                  <RowCell errors={errors} className="max-w-[190px]">
                    <div className="flex items-stretch">
                      <input className={input} inputMode="decimal" value={strings.result} onChange={(e) => setEdit(trade.id, "result", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 6)} onBlur={() => void commit(trade, strings)} aria-label="Result (P&L)" />
                      <button
                        title={isCalc ? "Calculated from entry/exit price and lot size — click to recalculate" : "Manual result — click to calculate from prices"}
                        onClick={() => autoCalc(trade)}
                        className={`flex w-6 shrink-0 items-center justify-center border-l border-line-700 text-[10px] font-semibold ${isCalc ? "text-accent" : "text-warn"}`}
                        aria-label={isCalc ? "Result source: calculated" : "Result source: manual"}
                      >
                        {isCalc ? <Sigma size={12} /> : <Hand size={12} />}
                      </button>
                    </div>
                    {outcome && (
                      <span className={`absolute right-8 top-1/2 -translate-y-1/2 text-[10px] ${outcome === "win" ? "text-good" : outcome === "loss" ? "text-bad" : "text-muted"}`}>
                        {outcome}
                      </span>
                    )}
                  </RowCell>
                  <td className="p-0 max-w-[220px]">
                    <input className={input} value={strings.psychology} onChange={(e) => setEdit(trade.id, "psychology", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 7)} onBlur={() => void commit(trade, strings)} aria-label="Psychology" list="psychology-list" />
                  </td>
                  <td className="p-0 max-w-[260px]">
                    <input className={input} value={strings.notes} onChange={(e) => setEdit(trade.id, "notes", e.target.value)} onKeyDown={(e) => keyNav(e, rowIndex, 8)} onBlur={() => void commit(trade, strings)} aria-label="Notes" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button className="text-muted hover:text-bad" title="Delete trade" onClick={() => { if (confirm(`Delete ${trade.instrument} trade on ${trade.date}?`)) void store.deleteTrade(trade.id); }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {draft && (
              <tr className="bg-surface-850/60">
                {(Object.keys(draft) as Col[]).map((col, i) => (
                  <td key={col} className="p-0">
                    {col === "direction" ? (
                      <select className="cell-input cursor-pointer" value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value })} aria-label="Direction">
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                      </select>
                    ) : (
                      <input
                        autoFocus={i === 0}
                        className={input}
                        inputMode={col === "date" ? "numeric" : "decimal"}
                        value={draft[col]}
                        onChange={(e) => setDraft({ ...draft, [col]: e.target.value })}
                        onKeyDown={(e) => keyNav(e, trades.length, i)}
                        aria-label={`${COL_LABELS[col]} (new trade)`}
                      />
                    )}
                  </td>
                ))}
                <td className="px-2 py-1 text-right">
                  <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => commitDraft(draft, () => {})}>Save</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <datalist id="instrument-list">
        {settings.instruments.map((i) => <option key={i.id} value={i.symbol} />)}
      </datalist>
      <datalist id="psychology-list">
        {PSYCHOLOGY_TAGS.map((p) => <option key={p} value={p} />)}
      </datalist>

      <div className="mt-3 flex items-center justify-between">
        <button className="btn-primary" onClick={() => { if (!draft) setDraft({ date: todayIso(), instrument: settings.defaultInstrument ?? "", direction: "BUY", entryPrice: "", exitPrice: "", lotSize: "", result: "", psychology: "", notes: "" }); }}>
          + Add Trade
        </button>
        <p className="text-[11px] text-muted">
          Tip: Enter saves &amp; moves down · Tab moves right · paste Excel rows anywhere in the table · the Σ badge recalculates the result from prices
        </p>
      </div>
    </div>
  );
}

function RowCell({ children, errors, className = "" }: { children: React.ReactNode; errors?: string[]; className?: string }) {
  return (
    <td className={`p-0 relative ${errors?.length ? "outline outline-bad/50" : ""} ${className}`} title={errors?.[0]}>
      {errors?.length ? <span className="absolute left-1 top-0 z-10 text-[9px] text-bad">!</span> : null}
      {children}
    </td>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function splitTags(raw: string): string[] {
  return raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
    .map((s) => (PSYCHOLOGY_TAGS as readonly string[]).find((p) => p.toLowerCase() === s.toLowerCase()) ?? s);
}

function validateRow(s: RowStrings): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) errors.push("Date must be YYYY-MM-DD");
  if (!s.instrument.trim()) errors.push("Instrument is required");
  if (s.direction !== "BUY" && s.direction !== "SELL") errors.push("Direction must be Buy or Sell");
  for (const [label, v] of [["entry", s.entryPrice], ["exit", s.exitPrice], ["lot size", s.lotSize]] as const) {
    if (v === "" || !Number.isFinite(Number(v.replace(",", "."))) || Number(v.replace(",", ".")) <= 0) errors.push(`Invalid ${label}`);
  }
  if (s.result !== "" && !Number.isFinite(Number(s.result.replace(",", ".")))) errors.push("Result must be a number");
  return errors;
}

function validateCells(c: { date: string; instrument: string; direction: string; entry: string; exit: string; lots: string; result: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return "bad date";
  if (!c.instrument) return "missing instrument";
  if (!["BUY", "SELL"].includes(c.direction.toUpperCase())) return "bad direction";
  for (const v of [c.entry, c.exit, c.lots]) if (!Number.isFinite(Number(v)) || Number(v) <= 0) return "invalid number";
  if (c.result && !Number.isFinite(Number(c.result))) return "invalid result";
  return null;
}

function stringsToDraft(s: RowStrings, accountCurrency: string): Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion"> {
  const manual = s.result !== "";
  return {
    date: s.date,
    instrument: s.instrument.trim().toUpperCase(),
    direction: s.direction as Trade["direction"],
    entryPrice: Number(s.entryPrice.replace(",", ".")),
    exitPrice: Number(s.exitPrice.replace(",", ".")),
    lotSize: Number(s.lotSize.replace(",", ".")),
    realizedPnl: manual ? Number(s.result.replace(",", ".")) : null,
    // manual results are per trade; calculated ones get the instrument quote currency resolved on read
    pnlCurrency: manual ? accountCurrency : null,
    resultSource: manual ? "manual" : "calculated",
    psychology: splitTags(s.psychology),
    notes: s.notes,
  };
}
