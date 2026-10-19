/**
 * Thin typed wrapper over IndexedDB. The browser database is the single
 * source of truth for the static (primary) deployment mode — no backend
 * and no external database are required (prompt §2/§3).
 *
 * Object stores:
 *  - trades  { keyPath: "id" }           indexes: date, instrument
 *  - app     { keyPath: "key" }          key/value store for settings + meta
 */

const DB_NAME = "tradelens-ai";
const DB_VERSION = 1;

export const TRADES_STORE = "trades";
export const APP_STORE = "app";

let dbPromise: Promise<IDBDatabase> | null = null;

/** Test seam: allow injecting a database factory (fake-indexeddb in tests). */
let openFactory: (name: string, version: number) => Promise<IDBDatabase> = (n, v) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(n, v);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRADES_STORE)) {
        const store = db.createObjectStore(TRADES_STORE, { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("instrument", "instrument");
      }
      if (!db.objectStoreNames.contains(APP_STORE)) {
        db.createObjectStore(APP_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });

export function setOpenFactoryForTests(factory: typeof openFactory): void {
  openFactory = factory;
}

export function resetDbForTests(): void {
  dbPromise = null;
}

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openFactory(DB_NAME, DB_VERSION);
  }
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await getDb();
  const tx = db.transaction(store, "readonly");
  return reqAsPromise(tx.objectStore(store).getAll()) as Promise<T[]>;
}

export async function put<T>(store: string, value: T): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function putMany<T>(store: string, values: T[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function get<T>(store: string, key: string): Promise<T | undefined> {
  const db = await getDb();
  const tx = db.transaction(store, "readonly");
  return reqAsPromise(tx.objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function remove(store: string, key: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function removeMany(store: string, keys: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const k of keys) os.delete(k);
  await txDone(tx);
}

export async function clearStore(store: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

export function deleteDatabase(): Promise<void> {
  dbPromise = null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete database"));
    req.onblocked = () => resolve();
  });
}
