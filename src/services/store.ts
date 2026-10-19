import type { Trade } from "@/types/trade";
import type { Settings } from "@/types/settings";
import type { Instrument } from "@/types/settings";
import * as tradesRepo from "@/services/storage/tradesRepo";
import { loadSettings, saveSettings } from "@/services/storage/settingsRepo";
import { getDb, TRADES_STORE } from "@/services/storage/db";

/**
 * Single source of truth for the UI (prompt §14): one tiny store consumed by
 * every page. Mutations write through to IndexedDB first, then update the
 * in-memory snapshot — so a refresh re-reads the same persisted records.
 * No state-management library on top; useSyncExternalStore is enough here.
 */

export interface AppState {
  trades: Trade[];
  settings: Settings;
  loaded: boolean;
}

let state: AppState = { trades: [], settings: null as unknown as Settings, loaded: false };
const listeners = new Set<() => void>();

function emit(): void {
  state = { ...state };
  for (const l of listeners) l();
}

function setAndEmit(next: AppState & { trades: Trade[]; settings: Settings }): void {
  state = next;
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppState {
  return state;
}

export function snapshot(): AppState {
  return state;
}

export async function init(): Promise<void> {
  if (state.loaded) return;
  await initPromise;
}

const initPromise = (async () => {
  const [trades, settings] = await Promise.all([tradesRepo.listTrades(), loadSettings()]);
  state = { trades, settings, loaded: true };
  applyTheme(settings.theme);
  emit();
})();

export function applyTheme(theme: Settings["theme"]): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

// ---------- trade mutations (persist first) ----------

export async function addTrade(draft: Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion">): Promise<Trade> {
  const trade = tradesRepo.makeDraft(draft);
  setAndEmit({ ...state, trades: sortTrades([...state.trades, trade]) });
  await tradesRepo.saveTrade(trade);
  return trade;
}

export async function addTrades(drafts: Array<Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion">>): Promise<Trade[]> {
  const created = drafts.map((d) => tradesRepo.makeDraft(d));
  setAndEmit({ ...state, trades: sortTrades([...state.trades, ...created]) });
  await tradesRepo.saveTrades(created);
  return created;
}

export async function updateTrade(id: string, patch: Partial<Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion">>): Promise<void> {
  const next = state.trades.map((t) => (t.id === id ? { ...t, ...patch } : t));
  setAndEmit({ ...state, trades: sortTrades(next) });
  const updated = next.find((t) => t.id === id);
  if (updated) await tradesRepo.saveTrade(updated);
}

export async function deleteTrade(id: string): Promise<void> {
  setAndEmit({ ...state, trades: state.trades.filter((t) => t.id !== id) });
  await tradesRepo.deleteTrade(id);
}

export async function deleteTrades(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  setAndEmit({ ...state, trades: state.trades.filter((t) => !idSet.has(t.id)) });
  await removeManyFromDb(ids);
}

async function removeManyFromDb(ids: string[]): Promise<void> {
  const conn = await getDb();
  const tx = conn.transaction(TRADES_STORE, "readwrite");
  const os = tx.objectStore(TRADES_STORE);
  for (const id of ids) os.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
  });
}

export async function clearAllTrades(): Promise<void> {
  setAndEmit({ ...state, trades: [] });
  await tradesRepo.replaceAllTrades([]);
}

export async function deleteSampleTrades(): Promise<number> {
  const ids = state.trades.filter((t) => t.sample === true).map((t) => t.id);
  setAndEmit({ ...state, trades: state.trades.filter((t) => t.sample !== true) });
  await removeManyFromDb(ids);
  return ids.length;
}

export async function replaceAllTrades(trades: Trade[]): Promise<void> {
  setAndEmit({ ...state, trades: sortTrades(trades) });
  await tradesRepo.replaceAllTrades(trades);
}

// ---------- settings mutations ----------

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings: Settings = { ...state.settings, ...patch };
  setAndEmit({ ...state, settings });
  applyTheme(settings.theme);
  await saveSettings(settings);
}

export function upsertInstrument(instrument: Instrument): void {
  const instruments = state.settings.instruments.some((i) => i.id === instrument.id)
    ? state.settings.instruments.map((i) => (i.id === instrument.id ? instrument : i))
    : [...state.settings.instruments, instrument];
  void updateSettings({ instruments });
}

export function removeInstrument(id: string): void {
  void updateSettings({ instruments: state.settings.instruments.filter((i) => i.id !== id) });
}

export function instrumentFor(symbol: string | null): Instrument | undefined {
  if (!symbol) return undefined;
  const s = symbol.trim().toUpperCase();
  return state.settings.instruments.find((i) => i.symbol.toUpperCase() === s);
}

// ---------- helpers ----------

export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => (a.date === b.date ? (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
}
