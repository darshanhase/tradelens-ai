import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { Trade } from "@/types/trade";
import type { Settings } from "@/types/settings";
import { makeDraft, listTrades, saveTrade, deleteTrade, replaceAllTrades } from "./tradesRepo";
import { loadSettings, saveSettings } from "./settingsRepo";
import { resetDbForTests, TRADES_STORE, getDb } from "./db";

/**
 * Persistence tests (prompt §16: "Persistence after page reload"). Fake
 * IndexedDB gives a fresh empty database per test; `resetDbForTests` drops
 * the cached connection, and a later `listTrades()` re-opens it — the same
 * read path a page refresh takes in the real browser.
 */

beforeEach(() => {
  // A brand-IDBFactory per test simulates both "first visit" and "reload"
  // without the deleteDatabase/upgrade dance hanging on open connections.
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  resetDbForTests();
});

function draft(date: string, pnl: number | null): Omit<Trade, "id" | "createdAt" | "updatedAt" | "schemaVersion"> {
  return {
    date,
    instrument: "EURUSD",
    direction: "BUY",
    entryPrice: 1.1,
    exitPrice: 1.2,
    lotSize: 1,
    realizedPnl: pnl,
    pnlCurrency: pnl === null ? null : "USD",
    resultSource: pnl === null ? "calculated" : "manual",
    psychology: [],
    notes: "",
  };
}

describe("tradesRepo (fake IndexedDB)", () => {
  it("saves, lists, updates and deletes trades", async () => {
    await saveTrade(makeDraft(draft("2026-01-01", 10)));
    await saveTrade(makeDraft(draft("2026-01-02", -5)));
    let rows = await listTrades();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-02"]);

    // update in place
    const first = rows[0];
    await saveTrade({ ...first, realizedPnl: 99 });
    rows = await listTrades();
    expect(rows.find((r) => r.id === first.id)?.realizedPnl).toBe(99);

    await deleteTrade(rows[0].id);
    rows = await listTrades();
    expect(rows).toHaveLength(1);
    expect(rows[0].realizedPnl).toBe(-5);
  });

  it("sorts chronologically with deterministic tie-breaks", async () => {
    // Explicit timestamps with distinct createdAt (same date, different times).
    const a = { ...makeDraft({ ...draft("2026-01-01", 1) }), createdAt: "2026-01-01T09:00:00Z", updatedAt: "2026-01-01T09:00:00Z" };
    const b = { ...makeDraft({ ...draft("2026-01-01", 2) }), createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-01T10:00:00Z" };
    await replaceAllTrades([b, a]); // intentionally out of order
    const rows = await listTrades();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(a.id); // earlier createdAt first on same date
  });

  it("persists: re-reading the store returns what was written (reload path)", async () => {
    await saveTrade(makeDraft(draft("2026-02-02", 42)));
    resetDbForTests(); // drop cached connection → next read opens fresh
    const rows = await listTrades();
    expect(rows).toHaveLength(1);
    expect(rows[0].realizedPnl).toBe(42);
  });

  it("replaceAll wipes the store first", async () => {
    await saveTrade(makeDraft(draft("2026-01-01", 1)));
    await replaceAllTrades([makeDraft(draft("2026-03-01", 7))]);
    const rows = await listTrades();
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-03-01");
  });

  it("skips records with unknown future schema", async () => {
    const good = makeDraft(draft("2026-01-01", 1));
    const conn = await getDb();
    const tx = conn.transaction(TRADES_STORE, "readwrite");
    tx.objectStore(TRADES_STORE).put({ ...good, id: "from-future", schemaVersion: 99 });
    tx.objectStore(TRADES_STORE).put({ ...good, id: "good-one" });
    await new Promise<void>((res) => (tx.oncomplete = () => res()));
    const rows = await listTrades();
    expect(rows.map((r) => r.id)).toEqual(["good-one"]);
  });
});

describe("settingsRepo", () => {
  it("defaults when nothing saved and persists edits", async () => {
    let s: Settings = await loadSettings();
    expect(s.accountCurrency).toBe("USD");
    expect(s.instruments.length).toBeGreaterThan(0);

    await saveSettings({ ...s, accountCurrency: "EUR", defaultInstrument: "XAUUSD" });

    resetDbForTests();
    const again = await loadSettings();
    expect(again.accountCurrency).toBe("EUR");
    expect(again.defaultInstrument).toBe("XAUUSD");
  });
});
