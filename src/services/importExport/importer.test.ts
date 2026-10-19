import { describe, expect, it } from "vitest";
import { guessColumnMapping, parseWorkbookToTrades, toIsoDateLoose, tradeFingerprintParts, TEMPLATE_COLUMNS } from "./importer";

/** Build a minimal .ods-independent binary via SheetJS in-memory. */
import * as XLSX from "xlsx";

function workbookBytes(rows: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("guessColumnMapping", () => {
  it("recognizes common journal headers (prompt §9 list)", () => {
    const m = guessColumnMapping(["Trade Date", "Pair", "Side", "Entry", "Exit", "Lots", "P&L", "Emotion", "Comments"]);
    expect(m.map.date).toBe(0);
    expect(m.map.instrument).toBe(1);
    expect(m.map.direction).toBe(2);
    expect(m.map.entryPrice).toBe(3);
    expect(m.map.exitPrice).toBe(4);
    expect(m.map.lotSize).toBe(5);
    expect(m.map.result).toBe(6);
    expect(m.map.psychology).toBe(7);
    expect(m.map.notes).toBe(8);
    expect(m.unmappedSourceColumns).toEqual([]);
  });

  it("handles loose variants and leaves unknown columns unmapped", () => {
    const m = guessColumnMapping(["date opened", "symbol", "entry price (usd)", "unknown col"]);
    expect(m.map.date).toBe(0);
    expect(m.map.instrument).toBe(1);
    expect(m.map.entryPrice).toBe(2);
    expect(m.unmappedSourceColumns).toEqual(["unknown col"]);
  });
});

describe("parseWorkbookToTrades", () => {
  it("imports valid rows and reports invalid ones with their source row number", () => {
    const data = workbookBytes([
      ["Date", "Pair", "Direction", "Entry", "Exit", "Lots", "Result", "Psychology", "Notes"],
      ["2026-01-05", "EURUSD", "BUY", "1.10", "1.11", "0.1", "100", "Confident", "clean"],
      ["", "XAUUSD", "BUY", "1", "2", "1", "", "", ""], // invalid date
      ["2026-01-06", "", "SELL", "1", "2", "1", "", "", ""], // missing instrument
      ["2026-01-07", "GBPUSD", "BUY", "abc", "2", "1", "", "", ""], // invalid price
    ]);
    const parsed = parseWorkbookToTrades(data, []);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0].trade?.realizedPnl).toBe(100);
    expect(parsed.rows[0].trade?.resultSource).toBe("manual");
    expect(parsed.rows[0].trade?.instrument).toBe("EURUSD");
    expect(parsed.rows[0].errors).toEqual([]);

    expect(parsed.rows[1].errors[0]).toContain("unrecognized date");
    expect(parsed.rows[2].errors.join(" ")).toContain("Missing instrument");
    expect(parsed.rows[3].errors.join(" ")).toContain("entry price");
  });

  it("respects row numbers exactly as in the sheet", () => {
    const data = workbookBytes([
      ["Date", "Pair", "Direction", "Entry", "Exit", "Lots"],
      ["2026-01-05", "EURUSD", "BUY", "1", "2", "1"],
      ["bad", "XAUUSD", "BUY", "1", "2", "1"],
      ["", "", "", "", "", ""],               // blank → skipped silently (no content)
      ["alsobad", "XAUUSD", "BUY", "1", "2", "1"],
    ]);
    const parsed = parseWorkbookToTrades(data, []);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[1].sourceRow).toBe(3);
    expect(parsed.rows[2].sourceRow).toBe(5);
  });

  it("maps dd/mm/yyyy and Excel serial dates to ISO", () => {
    const data = workbookBytes([
      ["Date", "Pair", "Direction", "Entry", "Exit", "Lots", "Result"],
      ["05/01/2026", "EURUSD", "BUY", "1", "2", "1", ""],   // day-first
      [45947, "EURUSD", "BUY", "1", "2", "1", ""],           // excel serial → 2025-10-31
    ]);
    const parsed = parseWorkbookToTrades(data, []);
    expect(parsed.rows[0].trade?.date).toBe("2026-01-05");
    expect(parsed.rows[1].trade?.date).toBe("2025-10-17");
  });

  it("breakeven results (0) are preserved, not treated as missing", () => {
    const data = workbookBytes([
      ["Date", "Pair", "Direction", "Entry", "Exit", "Lots", "Result"],
      ["2026-02-01", "EURUSD", "SELL", "1.1", "1.1", "1", "0"],
    ]);
    const parsed = parseWorkbookToTrades(data, []);
    expect(parsed.rows[0].trade?.realizedPnl).toBe(0);
    expect(parsed.rows[0].trade?.resultSource).toBe("manual");
  });

  it("missing result yields a warning, not an error", () => {
    const data = workbookBytes([
      ["Date", "Pair", "Direction", "Entry", "Exit", "Lots"],
      ["2026-02-01", "EURUSD", "SELL", "1.1", "1.0", "1"],
    ]);
    const parsed = parseWorkbookToTrades(data, []);
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].warnings.join(" ")).toContain("No result");
    expect(parsed.rows[0].trade?.resultSource).toBe("calculated");
  });
});

describe("toIsoDateLoose", () => {
  it("accepts ISO, padded-input, serial and date-first formats", () => {
    expect(toIsoDateLoose("2026-03-07")).toBe("2026-03-07");
    expect(toIsoDateLoose("7/3/2026")).toBe("2026-03-07");   // day-first: 7 March
    expect(toIsoDateLoose("03/07/2026")).toBe("2026-07-03"); // day-first: 3 July
    expect(toIsoDateLoose("3/20/2026")).toBe("2026-03-20");  // US unambiguous month-first
    expect(toIsoDateLoose("2026-3-7")).toBe("2026-03-07");   // pads compact ISO
    expect(toIsoDateLoose("45947")).toBe("2025-10-17");      // Excel serial date
    expect(toIsoDateLoose("not a date")).toBe("not a date"); // validator will reject
  });
});

describe("duplicate fingerprints", () => {
  it("includes the full row identity, not just instrument+date", () => {
    const base = { date: "2026-01-01", instrument: "EURUSD", direction: "BUY" as const, entryPrice: 1.1, exitPrice: 1.2, lotSize: 1, realizedPnl: 10, pnlCurrency: "USD", resultSource: "manual" as const };
    const a = tradeFingerprintParts(base);
    const bSame = tradeFingerprintParts({ ...base });
    const cDifferentResult = tradeFingerprintParts({ ...base, realizedPnl: 11 });
    const dDifferentLots = tradeFingerprintParts({ ...base, lotSize: 2 });
    expect(a).toBe(bSame);
    expect(a).not.toBe(cDifferentResult);
    expect(a).not.toBe(dDifferentLots);
  });

  it("template columns cover the documented fields", () => {
    expect(TEMPLATE_COLUMNS).toContain("result");
    expect(TEMPLATE_COLUMNS).toContain("psychology");
  });
});
