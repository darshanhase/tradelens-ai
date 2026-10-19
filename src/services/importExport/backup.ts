import type { Instrument, Settings } from "@/types/settings";
import type { Trade } from "@/types/trade";
import { SCHEMA_VERSION } from "@/types/trade";
import { migrateRecord } from "@/services/storage/tradesRepo";

/**
 * Full-data JSON backup (prompt §10). Includes trades, user instrument
 * settings, calculation settings and the app schema version so restores can
 * be validated and migrated.
 */
export interface BackupFile {
  app: "tradelens-ai";
  schemaVersion: number;
  exportedAt: string;
  trades: Trade[];
  instruments: Instrument[];
  settings: Omit<Settings, "lastBackupAt">;
}

export type BackupValidation = { ok: true; backup: BackupFile } | { ok: false; errors: string[] };

export function createBackup(trades: Trade[], settings: Settings): BackupFile {
  const { lastBackupAt, ...rest } = settings;
  void lastBackupAt;
  return {
    app: "tradelens-ai",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    trades: structuredClone(trades),
    instruments: structuredClone(settings.instruments),
    settings: rest,
  };
}

export function validateBackup(content: unknown): BackupValidation {
  if (content === null || typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, errors: ["Backup file is not a JSON object."] };
  }
  const b = content as Record<string, unknown>;
  const errors: string[] = [];
  if (b.app !== "tradelens-ai") errors.push("This file is not a TradeLens AI backup (missing app identifier).");
  if (typeof b.schemaVersion !== "number") errors.push("Backup is missing its schema version.");
  else if (b.schemaVersion > SCHEMA_VERSION) errors.push(`Backup was created by a newer app version (schema ${b.schemaVersion} > ${SCHEMA_VERSION}); update the app first.`);
  if (!Array.isArray(b.trades)) errors.push("Backup is missing the trades array.");
  if (!Array.isArray(b.instruments)) errors.push("Backup is missing the instrument settings.");
  if (errors.length) return { ok: false, errors };
  // Normalize/migrate trade records the same way the store does.
  const trades: Trade[] = [];
  const bad: number[] = [];
  (b.trades as unknown[]).forEach((raw, i) => {
    const migrated = migrateRecord(raw as Record<string, unknown>);
    if (migrated) trades.push(migrated);
    else bad.push(i + 1);
  });
  if (bad.length) errors.push(`${bad.length} trade record(s) could not be read (e.g. item ${bad.slice(0, 5).join(", ")}).`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, backup: { ...(b as unknown as BackupFile), trades } };
}

/** Restore modes (prompt §10): replace wipes existing data, merge de-duplicates by id. */
export type RestoreMode = "replace" | "merge";

export function applyRestore(existing: Trade[], backup: BackupFile, mode: RestoreMode): Trade[] {
  if (mode === "replace") return backup.trades;
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of backup.trades) byId.set(t.id, t); // backup wins on id collision
  return [...byId.values()];
}
