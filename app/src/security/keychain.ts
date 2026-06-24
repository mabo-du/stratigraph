/**
 * keychain.ts — Secure Key Storage Abstraction
 *
 * exports:
 *   storeIdentity(privateKey: Uint8Array, publicKey: Uint8Array, pin: string) -> Promise<void>
 *   loadIdentity(pin: string) -> Promise<{ privateKey: Uint8Array, publicKey: Uint8Array } | null>
 *   hasIdentity() -> Promise<boolean>
 *
 * used_by: room.ts, persistence.ts, Setup UI
 *
 * rules:
 *   - Uses tauri-plugin-stronghold if running in Tauri.
 *   - Falls back to AES-GCM wrapped IndexedDB for PWA.
 *   - The 'pin' is required to unlock the stronghold or the IndexedDB wrapper.
 */

import { isTauri } from '../utils/tauriBridge';
import { encryptAtRest, decryptAtRest } from './crypto';

// Lazy load tauri plugins to avoid breaking web builds
let strongholdPlugin: any = null;

async function getStronghold() {
  if (strongholdPlugin) return strongholdPlugin;
  try {
    const { Stronghold, Location } = await import('@tauri-apps/plugin-stronghold');
    // We expect the vault path to be handled internally or initialized here
    // But since the API requires a path, we'll use a fixed vault name.
    strongholdPlugin = { Stronghold, Location };
    return strongholdPlugin;
  } catch {
    // Suppress raw error object in console — the failure reason is
    // surfaced through the public API return value instead.
    return null;
  }
}

// -----------------------------------------------------------------------------
// Web Crypto Fallback Storage (IndexedDB)
// -----------------------------------------------------------------------------

async function deriveKeyFromPin(pin: string, salt?: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // If no salt provided, derive from PIN alone (legacy/fallback).
  // For best security the caller should generate and store a random salt.
  const keySalt: BufferSource = salt ? new Uint8Array(salt) : enc.encode('stratigraph-local-salt');
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: keySalt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stratigraph-keychain', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('keys');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function storeIdentity(privateKey: Uint8Array, publicKey: Uint8Array, pin: string): Promise<void> {
  if (isTauri()) {
    const sh = await getStronghold();
    if (sh) {
      // Stronghold API: Requires initializing the vault with the password
      // For simplicity, we initialize a vault named 'stratigraph.vault'
      // Note: Tauri v2 Stronghold API varies, assuming basic init/insert pattern
      try {
        const vaultPath = '.stratigraph.vault';
        const stronghold = new sh.Stronghold(vaultPath, pin);
        // Depending on v2 API, load or init
        await stronghold.load();

        const store = stronghold.getStore('identity', []);

        // Combine into one payload
        const payload = new Uint8Array(privateKey.length + publicKey.length);
        payload.set(privateKey, 0);
        payload.set(publicKey, privateKey.length);

        await store.insert('keypair', Array.from(payload));
        await stronghold.save();
        return;
      } catch {
        // TODO(t130): Once @tauri-apps/plugin-stronghold v2 API is stable, replace with
        // the correct invocation pattern. Currently the vault path and API calls are
        // mismatched against the v2 plugin API — see audit §P0-8.
        // Fall back to IndexedDB with a visible warning rather than throwing.
        window.dispatchEvent(new CustomEvent('stratigraph-stronghold-fallback'));
      }
    }
  }

  // Web Fallback
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPin(pin, salt);
  const payload = new Uint8Array(privateKey.length + publicKey.length);
  payload.set(privateKey, 0);
  payload.set(publicKey, privateKey.length);

  const encrypted = await encryptAtRest(payload, key);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(encrypted, 'keypair');
    tx.objectStore('keys').put(salt, 'salt');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadIdentity(pin: string): Promise<{ privateKey: Uint8Array, publicKey: Uint8Array } | null> {
  if (isTauri()) {
    const sh = await getStronghold();
    if (sh) {
      try {
        const vaultPath = '.stratigraph.vault';
        const stronghold = new sh.Stronghold(vaultPath, pin);
        await stronghold.load();

        const store = stronghold.getStore('identity', []);
        const payloadArray = await store.get('keypair');
        if (!payloadArray) return null;

        const payload = new Uint8Array(payloadArray);
        const privateKey = payload.slice(0, 32);
        const publicKey = payload.slice(32);
        return { privateKey, publicKey };
      } catch {
        console.warn('Stronghold load failed, possibly wrong PIN');
        return null;
      }
    }
  }

  // Web Fallback
  const db = await openDB();
  const [encrypted, storedSalt] = await new Promise<[Uint8Array | undefined, Uint8Array | undefined]>((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const encReq = tx.objectStore('keys').get('keypair');
    const saltReq = tx.objectStore('keys').get('salt');
    tx.oncomplete = () => resolve([encReq.result, saltReq.result]);
    tx.onerror = () => reject(tx.error);
  });

  if (!encrypted) return null;

  try {
    const key = await deriveKeyFromPin(pin, storedSalt ?? undefined);
    const payload = await decryptAtRest(encrypted, key);
    const privateKey = payload.slice(0, 32);
    const publicKey = payload.slice(32);
    return { privateKey, publicKey };
  } catch {
    console.warn('Failed to decrypt IDB keychain, possibly wrong PIN');
    return null;
  }
}

export async function hasIdentity(): Promise<boolean> {
  if (isTauri()) {
    // Check if the vault file exists using tauri FS
    try {
      const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return await exists('.stratigraph.vault', { baseDir: BaseDirectory.AppLocalData });
    } catch {
      return false;
    }
  }

  // Web Fallback
  try {
    const db = await openDB();
    const encrypted = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction('keys', 'readonly');
      const req = tx.objectStore('keys').get('keypair');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return !!encrypted;
  } catch {
    return false;
  }
}
