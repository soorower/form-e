// Test support only: an empty in-memory IndexedDB (fake-indexeddb) for each
// test, since jsdom has none. Imported by tests, never by the app.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { resetOutboxMigration } from '#/lib/questionnaire/outbox'
import { closeOfflineDb } from './db'

export async function freshOfflineDb() {
  await closeOfflineDb()
  globalThis.indexedDB = new IDBFactory()
  resetOutboxMigration()
}
