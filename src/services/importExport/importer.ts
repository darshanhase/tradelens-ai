import * as XLSX from "xlsx";
import type { Trade, Direction } from "@/types/trade";
import { makeDraft } from "@/services/storage/tradesRepo";
import { parseDecimal, parseIsoDate, normalizePsychology } from "@/services/validation";

/**
 * Excel/CSV import (prompt §9) built on SheetJS.
 *
 * Workflow: read workbook → auto-map columns by alias → preview normalized
 * rows → import with an option for duplicate handling. Rows that fail
 * validation are never discarded silently: they come back with their source
 * row number and reason.
 */

export const TEMPLATE_COLUMNS = ["date", "instrument", "direction", "entryPrice", "exitPrice", "lotSize", "result", "psychology", "notes"] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/** Column aliases automatically recognized on import (prompt §9). */
const ALIASES: Record<TemplateColumn, string[]> = {
  date: ["date", "trade date", "day", "datetime", "time", "opened"],
  instrument: ["instrument", "pair", "symbol", "market"],
  direction: ["direction", "side", "type", "long/short"],
  entryPrice: ["entry", "entry price", "entryprice", "open"],
  exitPrice: ["exit", "exit price", "exitprice", "close"],
  lotSize: ["lots", "lot size", "lotsize", "volume", "size", "units", "qty", "quantity"],
  result: ["result", "p&l", "p/l", "pl", "profit", "profit loss", "net pnl", "realized pnl", "pnl", "profit/loss"],
  psychology: ["psychology", "emotion", "emotions", "psychology tag", "tags"],
  notes: ["notes", "comment", "comments", "note"],
};

export interface ColumnMapping {
  /** source column index (or null when unmapped) per target field */
  map: Partial<Record<TemplateColumn, number>>;
  unmappedSourceColumns: string[];
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const map: Partial<Record<TemplateColumn, number>> = {};
  const used = new Set<number>();
  const norm = (s: string) => s.replace(/[\s_-]+/g, " ").trim().toLowerCase();
  // Highest jaccard/normalized-equality match per target, template order wins ties.
  for (const target of TEMPLATE_COLUMNS) {
    let bestIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = norm(headers[i]);
      const hits = ALIASES[target].map((a) => a.replace(/_/g, " "));
      if (hits.includes(h)) { bestIndex = i; break; }
    }
    // fall back to "contains" match for things like "entry price (usd)"
    if (bestIndex === -1) {
      for (let i = 0; i < headers.length; i++) {
        if (used.has(i)) continue;
        const h = norm(headers[i]);
        if (ALIASES[target].some((a) => a.length > 3 && h.includes(a))) { bestIndex = i; break; }
      }
    }
    if (bestIndex >= 0) { map[target] = bestIndex; used.add(bestIndex); }
  }
  return { map, unmappedSourceColumns: headers.filter((_, i) => !used.has(i)) };
}

export interface ParsedRow {
  /** 1-based index of the row as it appeared in the user's sheet (2 = first data row). */
  sourceRow: number;
  trade?: Trade;
  errors: string[];
  warnings: string[];
}

export interface ParsedImport {
  rows: ParsedRow[];
  headers: string[];
  mapping: ColumnMapping;
}

/** Parse a workbook into draft trades. `psuedoToday` unused; results may be blank. */
export function parseWorkbookToTrades(data: ArrayBuffer, existingTrades: Trade[], mappingOverride?: Partial<Record<TemplateColumn, number>>): ParsedImport {
  const wb = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], headers: [], mapping: { map: {}, unmappedSourceColumns: [] } };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (matrix.length === 0) return { rows: [], headers: [], mapping: { map: {}, unmappedSourceColumns: [] } };
  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? ""));
  const guessed = guessColumnMapping(headers);
  const mapping: ColumnMapping = mappingOverride
    ? { map: mappingOverride, unmappedSourceColumns: headers.filter((_, i) => !Object.values(mappingOverride).includes(i)) }
    : guessed;
  const rows: ParsedRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] as unknown[];
    const sourceRow = r + 1; // spreadsheet row number for messages
    if (raw.every((c) => String(c ?? "").trim() === "")) continue; // skip fully blank lines
    const get = (col: TemplateColumn): string => {
      const idx = mapping.map[col];
      return idx === undefined || idx === null ? "" : String(raw[idx] ?? "").trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    const dateRaw = get("date");
    const date = parseIsoDate(toIsoDateLoose(dateRaw));
    if (!date) errors.push(`Column "${headers[mapping.map.date ?? 0] ?? "date"}": unrecognized date "${dateRaw}"`);

    const instrument = get("instrument").toUpperCase();
    if (!instrument) errors.push("Missing instrument/pair");

    const directionRaw = get("direction");
    const direction = parseDirectionLoose(directionRaw);
    if (!direction) errors.push(`Unrecognized direction "${directionRaw}"`);

    const entryPrice = parseDecimal(get("entryPrice"));
    if (entryPrice === null || entryPrice <= 0) errors.push(`Invalid entry price "${get("entryPrice")}"`);
    const exitPrice = parseDecimal(get("exitPrice"));
    if (exitPrice === null || exitPrice <= 0) errors.push(`Invalid exit price "${get("exitPrice")}"`);
    const lotSize = parseDecimal(get("lotSize"));
    if (lotSize === null || lotSize <= 0) errors.push(`Invalid lot size "${get("lotSize")}"`);

    const resultRaw = get("result");
    let realizedPnl: number | null = null;
    if (resultRaw !== "") {
      const parsed = parseDecimal(resultRaw);
      if (parsed === null) errors.push(`Invalid result value "${resultRaw}"`);
      else realizedPnl = parsed;
    } else {
      warnings.push("No result — will show as unresolved unless calculated");
    }

    if (errors.length) {
      rows.push({ sourceRow, errors, warnings });
      continue;
    }

    const trade = makeDraft({
      date: date as string,
      instrument,
      direction: direction as Direction,
      entryPrice: entryPrice as number,
      exitPrice: exitPrice as number,
      lotSize: lotSize as number,
      realizedPnl,
      pnlCurrency: null, // resolved below by the caller against instruments/settings
      resultSource: realizedPnl !== null ? "manual" : "calculated",
      psychology: normalizePsychology(splitTagsLoose(get("psychology"))),
    });
    trade.notes = get("notes");
    rows.push({ sourceRow, trade, errors: [], warnings });
  }

  // Duplicate handling data (prompt §9): same instrument+date is NOT a duplicate
  // by itself; fingerprint uses the full row identity, optional stable ID wins.
  void existingTrades;
  return { rows, headers, mapping };
}

function parseDirectionLoose(raw: string): Direction | null {
  const t = raw.trim().toUpperCase();
  if (["BUY", "B", "LONG", "L"].includes(t)) return "BUY";
  if (["SELL", "S", "SHORT", "SH"].includes(t)) return "SELL";
  return null;
}

function splitTagsLoose(raw: string): string[] {
  if (raw === "") return [];
  return raw.split(/[,;|]+/);
}

/** Excel dates may arrive as serial numbers or "dd/mm/yyyy" or "m/d/yy". */
export function toIsoDateLoose(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return t.replace(/-(\d)(?!\d)/g, "-0$1");
  // Excel serial date (1900 epoch, date-only values)
  const asNumber = Number(t);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 60000 && /^\d+(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(asNumber) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // dd/mm/yyyy or ambiguous d/m; falls back to day-first which is the common
  // journal layout — the import preview shows the parsed date so the user can
  // catch a mismatched interpretation before importing.
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    let day = a, month = b;
    if (Number(b) > 12) { day = b; month = a; } // unambiguous month-first (US style)
    if (y.length === 2) y = `20${y}`;
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return t;
}

/** Full-row fingerprint for duplicate detection (optional stable id handled upstream). */
export function tradeFingerprintParts(t: Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion" | "psychology" | "notes">): string {
  return [t.date, t.instrument, t.direction, t.entryPrice, t.exitPrice, t.lotSize, t.realizedPnl].map((v) => String(v)).join("|");
}
