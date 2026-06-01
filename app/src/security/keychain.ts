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
  } catch (e) {
    console.error('Stronghold plugin not available', e);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Web Crypto Fallback Storage (IndexedDB)
// -----------------------------------------------------------------------------

async function deriveKeyFromPin(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // Fixed salt for the local storage wrapper to allow deterministic derivation from the PIN
  // In a real scenario, the salt would be stored alongside the encrypted payload.
  const salt = enc.encode('stratigraph-local-salt'); 
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
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
      } catch (e) {
        console.error('Failed to store identity in Stronghold', e);
        // fallback to IDB below if preferred, but we should strictly rely on stronghold on Desktop
        throw new Error('Stronghold storage failed');
      }
    }
  }

  // Web Fallback
  const key = await deriveKeyFromPin(pin);
  const payload = new Uint8Array(privateKey.length + publicKey.length);
  payload.set(privateKey, 0);
  payload.set(publicKey, privateKey.length);
  
  const encrypted = await encryptAtRest(payload, key);
  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(encrypted, 'keypair');
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
      } catch (e) {
        console.warn('Stronghold load failed, possibly wrong PIN', e);
        return null;
      }
    }
  }

  // Web Fallback
  const db = await openDB();
  const encrypted = await new Promise<Uint8Array | undefined>((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const req = tx.objectStore('keys').get('keypair');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!encrypted) return null;

  try {
    const key = await deriveKeyFromPin(pin);
    const payload = await decryptAtRest(encrypted, key);
    const privateKey = payload.slice(0, 32);
    const publicKey = payload.slice(32);
    return { privateKey, publicKey };
  } catch (e) {
    console.warn('Failed to decrypt IDB keychain, possibly wrong PIN', e);
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
