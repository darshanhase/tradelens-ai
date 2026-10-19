import { describe, expect, it } from "vitest";
import { defaultInstruments, defaultSettings } from "@/types/settings";
import { SCHEMA_VERSION } from "@/types/trade";
import type { Trade } from "@/types/trade";
import { applyRestore, createBackup, validateBackup, type BackupFile } from "./backup";

function trade(id: string, date: string, pnl: number) {
  return {
    id, date, instrument: "EURUSD", direction: "BUY" as const, entryPrice: 1.1, exitPrice: 1.2, lotSize: 1,
    realizedPnl: pnl, pnlCurrency: "USD", resultSource: "manual" as const, psychology: [], notes: "",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", schemaVersion: SCHEMA_VERSION,
  };
}

describe("createBackup / validateBackup", () => {
  const settings = defaultSettings();

  it("round-trips through create → JSON → validate, including instruments and settings", () => {
    const backup = createBackup([trade("a", "2026-01-01", 10)], settings);
    const restored = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.backup.trades).toHaveLength(1);
      expect(restored.backup.trades[0].realizedPnl).toBe(10);
      expect(restored.backup.instruments.length).toBe(defaultInstruments().length);
      expect(restored.backup.settings.accountCurrency).toBe("USD");
    }
  });

  it("rejects non-TradeLens JSON files", () => {
    const r = validateBackup({ hello: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("not a TradeLens AI backup");
  });

  it("rejects backups from a newer schema version", () => {
    const backup: BackupFile = {
      app: "tradelens-ai", schemaVersion: SCHEMA_VERSION + 1, exportedAt: "x",
      trades: [], instruments: [], settings: { ...settings },
    };
    const r = validateBackup(backup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("newer app version");
  });

  it("validates each trade record and reports unreadable ones", () => {
    const backup: BackupFile = {
      app: "tradelens-ai", schemaVersion: SCHEMA_VERSION, exportedAt: "x",
      trades: [{ nope: true } as unknown as Trade, trade("a", "2026-01-01", 1)], instruments: [], settings: { ...settings },
    };
    const r = validateBackup(backup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("1 trade record(s)");
  });

  it("migrates legacy records (schema 0) during validation", () => {
    const backup = {
      app: "tradelens-ai",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: "x",
      trades: [{ id: "old", date: "2026-01-01", instrument: "XAUUSD", schemaVersion: 0 }],
      instruments: [],
      settings: { ...settings },
    };
    const r = validateBackup(backup);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.trades[0].schemaVersion).toBe(SCHEMA_VERSION);
      expect(r.backup.trades[0].psychology).toEqual([]);
    }
  });
});

describe("applyRestore", () => {
  const backup = { app: "tradelens-ai", schemaVersion: 1, exportedAt: "", trades: [trade("b", "2026-01-02", 5)], instruments: [], settings: defaultSettings() } as BackupFile;
  const existing = [trade("a", "2026-01-01", 10)];

  it("replace discards existing data entirely", () => {
    const next = applyRestore(existing, backup, "replace");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("b");
  });

  it("merge keeps existing rows and adds new ones by id", () => {
    const next = applyRestore(existing, backup, "merge");
    expect(next.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("merge lets the backup win on id collision", () => {
    const conflictBackup = { ...backup, trades: [trade("a", "2026-02-01", -3)] } as BackupFile;
    const next = applyRestore(existing, conflictBackup, "merge");
    expect(next).toHaveLength(1);
    expect(next[0].date).toBe("2026-02-01");
  });
});
