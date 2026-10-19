import type { Trade, TradeDraft } from "@/types/trade";
import { SCHEMA_VERSION } from "@/types/trade";
import * as db from "./db";

/** Migrations run when a saved record has an older schemaVersion. Patch-based. */
type Migration = (record: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  // v0 → v1: initial versioned shape. Records missing fields gain defaults.
  0: (r) => ({
    psychology: [],
    notes: "",
    pnlCurrency: null,
    resultSource: "manual",
    ...r,
    schemaVersion: 1,
  }),
};

export function migrateRecord(raw: Record<string, unknown>): Trade | null {
  let version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  let record: Record<string, unknown> = { ...raw };
  while (version < SCHEMA_VERSION && MIGRATIONS[version]) {
    record = MIGRATIONS[version](record);
    version = typeof record.schemaVersion === "number" ? record.schemaVersion : version + 1;
  }
  if (version !== SCHEMA_VERSION) return null; // unknown newer schema → skip
  if (typeof record.id !== "string" || typeof record.date !== "string") return null;
  return record as unknown as Trade;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeDraft(draft: Partial<TradeDraft>): Trade {
  const ts = nowIso();
  return {
    direction: "BUY",
    realizedPnl: null,
    pnlCurrency: null,
    resultSource: "manual",
    psychology: [],
    notes: "",
    sample: false,
    ...draft,
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
    schemaVersion: SCHEMA_VERSION,
  } as Trade;
}

export async function listTrades(): Promise<Trade[]> {
  const rows = await db.getAll<Trade>(db.TRADES_STORE);
  // Defensive: migrate records; records that cannot be migrated (unknown
  // future schema, corrupt shape) are skipped rather than crashing reads.
  return rows
    .map((r) => migrateRecord(r as unknown as Record<string, unknown>))
    .filter((t): t is Trade => Boolean(t))
    .sort((a, b) => (a.date === b.date ? (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
}

export async function saveTrade(t: Trade): Promise<void> {
  await db.put(db.TRADES_STORE, { ...t, updatedAt: nowIso() });
}

export async function saveTrades(ts: Trade[]): Promise<void> {
  await db.putMany(db.TRADES_STORE, ts);
}

export async function deleteTrade(id: string): Promise<void> {
  await db.remove(db.TRADES_STORE, id);
}

export async function replaceAllTrades(ts: Trade[]): Promise<void> {
  await db.clearStore(db.TRADES_STORE);
  await db.putMany(db.TRADES_STORE, ts);
}
