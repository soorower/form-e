/**
 * The tablet's own database (IndexedDB), for what must outlast a lost
 * connection, a reload, or a restart: responses waiting to be sent
 * (`outbox`) and the surveys saved for offline use (`surveys`).
 *
 * IndexedDB rather than localStorage: localStorage holds about 5 MB for the
 * whole site and is the first thing a browser clears when space runs low,
 * while IndexedDB holds far more and, once `navigator.storage.persist()` is
 * granted, is only ever cleared by the user. Where IndexedDB cannot be opened
 * (some private windows) the same calls fall back to localStorage, so
 * nothing stops working.
 */

const DB_NAME = 'forme'
const DB_VERSION = 1

export type StoreName = 'outbox' | 'surveys'
const STORES: StoreName[] = ['outbox', 'surveys']

let opening: Promise<IDBDatabase | null> | null = null

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function open(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null)
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store, { keyPath: 'id' })
          }
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // Another tab upgrading the database: step aside so it can.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

/** Closes the connection; the next call opens a fresh one. For tests. */
export async function closeOfflineDb() {
  const db = await opening
  db?.close()
  opening = null
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// ── localStorage fallback ───────────────────────────────────────────────

const fallbackKey = (store: StoreName) => `forme:db:${store}`

function readFallback<T>(store: StoreName): T[] {
  try {
    const raw = window.localStorage.getItem(fallbackKey(store))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeFallback<T>(store: StoreName, rows: T[]) {
  window.localStorage.setItem(fallbackKey(store), JSON.stringify(rows))
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

// ── the calls ───────────────────────────────────────────────────────────

export async function getAll<T extends { id: string }>(store: StoreName): Promise<T[]> {
  const db = await open()
  if (!db) return canUseLocalStorage() ? readFallback<T>(store) : []
  try {
    return await done(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>)
  } catch {
    return []
  }
}

export async function getOne<T extends { id: string }>(store: StoreName, id: string): Promise<T | null> {
  const db = await open()
  if (!db) {
    return canUseLocalStorage() ? (readFallback<T>(store).find((row) => row.id === id) ?? null) : null
  }
  try {
    const row = await done(db.transaction(store, 'readonly').objectStore(store).get(id))
    return (row as T | undefined) ?? null
  } catch {
    return null
  }
}

/** Stores the rows (replacing any with the same id). False when nothing could be stored. */
export async function putMany<T extends { id: string }>(store: StoreName, rows: T[]): Promise<boolean> {
  if (rows.length === 0) return true
  const db = await open()
  if (!db) {
    if (!canUseLocalStorage()) return false
    try {
      const ids = new Set(rows.map((row) => row.id))
      writeFallback(store, [...readFallback<T>(store).filter((row) => !ids.has(row.id)), ...rows])
      return true
    } catch {
      return false
    }
  }
  try {
    const transaction = db.transaction(store, 'readwrite')
    const objects = transaction.objectStore(store)
    for (const row of rows) objects.put(row)
    await committed(transaction)
    return true
  } catch {
    return false
  }
}

export function putOne<T extends { id: string }>(store: StoreName, row: T): Promise<boolean> {
  return putMany(store, [row])
}

export async function deleteOne(store: StoreName, id: string): Promise<void> {
  const db = await open()
  if (!db) {
    if (!canUseLocalStorage()) return
    try {
      writeFallback(
        store,
        readFallback<{ id: string }>(store).filter((row) => row.id !== id),
      )
    } catch {
      // Nothing more can be done; the row simply stays.
    }
    return
  }
  try {
    const transaction = db.transaction(store, 'readwrite')
    transaction.objectStore(store).delete(id)
    await committed(transaction)
  } catch {
    // Ignored: a row left behind is harmless (the server ignores repeats).
  }
}

/**
 * Asks the browser never to clear this site's data by itself. Chrome on
 * Android grants it without asking once the app is installed to the home
 * screen (or used often); otherwise it says no, silently. True when granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersistent(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}
