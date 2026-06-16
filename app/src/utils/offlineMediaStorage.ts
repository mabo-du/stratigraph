/**
 * offlineMediaStorage.ts — Dual-strategy local media blob storage.
 * exports: saveMedia, loadMedia, deleteMedia
 * used_by: Sidebar/index.tsx, MatrixCanvas (cytoscapeHelpers)
 * rules:
 * - Uses Tauri SQLite plugin in desktop environments for robustness.
 * - Falls back to IndexedDB for browser environments.
 */

import { isTauri } from './tauriBridge';
import Database from '@tauri-apps/plugin-sql';

const DB_NAME = 'StratiGraphMedia';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

// IndexedDB Helper
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Global cache for Tauri SQLite database connection
let _sqliteDb: Database | null = null;
async function getSqliteDb(): Promise<Database> {
  if (_sqliteDb) return _sqliteDb;
  _sqliteDb = await Database.load('sqlite:media.db');
  await _sqliteDb.execute(`
    CREATE TABLE IF NOT EXISTS media_blobs (
      id TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      mime_type TEXT NOT NULL
    )
  `);
  return _sqliteDb;
}

/**
 * Saves a File/Blob to local storage using Content-Addressable Storage (CAS).
 * Generates a SHA-256 hash of the binary content as the unique ID.
 * Optionally verifies against an expected hash (explicitHash).
 */
export async function saveMedia(file: File | Blob, explicitHash?: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const id = hashHex;

  if (explicitHash && explicitHash !== hashHex) {
    throw new Error(`CAS verification failed: expected ${explicitHash} but got ${hashHex}`);
  }

  const mimeType = file.type || 'application/octet-stream';

  if (isTauri()) {
    // Tauri: Save to SQLite (use arrayBuffer already computed above for SHA-256)
    const uint8Array = new Uint8Array(arrayBuffer);
    const db = await getSqliteDb();
    
    // Deduplicate: check if exists
    const existing = await db.select<{ id: string }[]>('SELECT id FROM media_blobs WHERE id = $1', [id]);
    if (existing && existing.length > 0) return id;

    // SQLite expects parameterized arrays for blobs
    await db.execute('INSERT INTO media_blobs (id, data, mime_type) VALUES ($1, $2, $3)', [
      id,
      Array.from(uint8Array), // Plugin-sql handles arrays of numbers for BLOBs
      mimeType,
    ]);
  } else {
    // Browser: Save to IndexedDB
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Deduplicate: check if exists
    const exists = await new Promise<boolean>((resolve) => {
      const checkReq = store.get(id);
      checkReq.onsuccess = () => resolve(!!checkReq.result);
      checkReq.onerror = () => resolve(false);
    });
    
    if (exists) return id;

    await new Promise<void>((resolve, reject) => {
      const req = store.put({ id, blob: file });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return id;
}

/**
 * Loads a media asset by UUID and returns an Object URL.
 * The caller is responsible for revoking the URL when done.
 */
export async function loadMedia(id: string): Promise<string | null> {
  if (isTauri()) {
    // Tauri: Load from SQLite
    try {
      const db = await getSqliteDb();
      const result = await db.select<{ data: number[]; mime_type: string }[]>('SELECT data, mime_type FROM media_blobs WHERE id = $1', [id]);
      if (result && result.length > 0) {
        const row = result[0];
        const uint8Array = new Uint8Array(row.data);
        const blob = new Blob([uint8Array], { type: row.mime_type });
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error('Failed to load media from SQLite', e);
    }
    return null;
  } else {
    // Browser: Load from IndexedDB
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(URL.createObjectURL(req.result.blob));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }
}

/**
 * Deletes a media asset by UUID.
 */
export async function deleteMedia(id: string): Promise<void> {
  if (isTauri()) {
    // Tauri: Delete from SQLite
    const db = await getSqliteDb();
    await db.execute('DELETE FROM media_blobs WHERE id = $1', [id]);
  } else {
    // Browser: Delete from IndexedDB
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * Returns a list of all locally stored CAS hashes.
 * Used by Garbage Collection to identify orphaned blobs.
 */
export async function listMedia(): Promise<string[]> {
  if (isTauri()) {
    const db = await getSqliteDb();
    const result = await db.select<{ id: string }[]>('SELECT id FROM media_blobs');
    return result.map(r => r.id);
  } else {
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => resolve([]);
    });
  }
}
