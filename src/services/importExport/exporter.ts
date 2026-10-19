import * as XLSX from "xlsx";
import type { Trade } from "@/types/trade";
import { TEMPLATE_COLUMNS } from "./importer";

/**
 * CSV/XLSX export (prompt §10). The stored, un-rounded values are exported
 * with full fidelity; nothing derived gets baked into the sheet.
 */

type CsvRow = Record<(typeof TEMPLATE_COLUMNS)[number], string | number | null>;

export function tradesToSheetRows(trades: Trade[]): CsvRow[] {
  return trades.map((t) => ({
    date: t.date,
    instrument: t.instrument,
    direction: t.direction,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    lotSize: t.lotSize,
    result: t.realizedPnl,
    psychology: t.psychology.join(", "),
    notes: t.notes,
  }));
}

const HEADER_LABELS: Record<string, string> = {
  date: "Date",
  instrument: "Pair",
  direction: "Direction",
  entryPrice: "Entry Price",
  exitPrice: "Exit Price",
  lotSize: "Lot Size",
  result: "Result",
  psychology: "Psychology",
  notes: "Notes",
};

export function exportCsv(trades: Trade[]): string {
  const ws = XLSX.utils.json_to_sheet(tradesToSheetRows(trades), { header: [...TEMPLATE_COLUMNS] });
  // Map the camelCase template keys to friendly headers.
  const csv = XLSX.utils.sheet_to_csv(ws);
  const friendlyHeader = TEMPLATE_COLUMNS.map((c) => HEADER_LABELS[c]).join(",");
  const lines = csv.split("\n");
  lines[0] = friendlyHeader;
  return lines.join("\n");
}

export function exportXlsx(trades: Trade[]): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(tradesToSheetRows(trades), { header: [...TEMPLATE_COLUMNS] });
  // Replace header row with friendly labels.
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    ws[addr] = { t: "s", v: HEADER_LABELS[TEMPLATE_COLUMNS[c]] };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trades");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out);
}

/** Downloadable CSV template with the exact supported columns (prompt §9). */
export function templateCsv(): string {
  return `${TEMPLATE_COLUMNS.map((c) => HEADER_LABELS[c]).join(",")}\n`;
}

export function downloadBlob(content: string | Uint8Array | Blob, filename: string, type: string): void {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
