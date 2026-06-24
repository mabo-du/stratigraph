/**
 * crypto.ts — Zero-Trust Identity and Security Foundation
 *
 * exports:
 *   generateIdentity(seed?: Uint8Array) -> { publicKey: Uint8Array, privateKey: Uint8Array }
 *   signUpdate(message: Uint8Array, privateKey: Uint8Array) -> Uint8Array
 *   verifyUpdate(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) -> boolean
 *   exportEncryptedBackup(privateKey: Uint8Array, pin: string) -> Promise<Uint8Array>
 *   importEncryptedBackup(data: Uint8Array, pin: string) -> Promise<Uint8Array>
 *   deriveSpake2SessionKey(pin: string, localPubKey: Uint8Array, remotePubKey: Uint8Array) -> Promise<Uint8Array>
 *   encryptAtRest(data: Uint8Array, key: CryptoKey) -> Promise<Uint8Array>
 *   decryptAtRest(data: Uint8Array, key: CryptoKey) -> Promise<Uint8Array>
 *
 * used_by: room.ts, persistence.ts, QRScanner.tsx, QRDisplay.tsx
 *
 * rules:
 *   - Ed25519 used for all digital signatures (Yjs updates).
 *   - AES-GCM (256-bit) used for all at-rest encryption and backup export.
 *   - SPAKE2 (simulated via ECDH+KDF for now) derives session keys from QR PINs.
 */

import * as ed from '@noble/ed25519';
import { sha512, sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';

// noble-ed25519 v3 uses ed.hashes.sha512 for sync operations (not ed.etc.sha512Sync as in v2)
ed.hashes.sha512 = sha512;

/**
 * Generate a new Ed25519 keypair for device identity.
 */
export function generateIdentity(seed?: Uint8Array) {
  const privateKey = seed || crypto.getRandomValues(new Uint8Array(32));
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Sign a Yjs update buffer (detached signature).
 */
export function signUpdate(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

/**
 * Verify a Yjs update buffer against a trusted public key.
 */
export function verifyUpdate(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  return ed.verify(signature, message, publicKey);
}

// -----------------------------------------------------------------------------
// Backup Export/Import (Web Crypto API)
// -----------------------------------------------------------------------------

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt the private key as an exportable backup file using a user-chosen password.
 */
export async function exportEncryptedBackup(privateKey: Uint8Array, pin: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(pin, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    privateKey as any
  );

  // Payload structure: [salt(16)] [iv(12)] [encrypted_data]
  const payload = new Uint8Array(16 + 12 + encrypted.byteLength);
  payload.set(salt, 0);
  payload.set(iv, 16);
  payload.set(new Uint8Array(encrypted), 28);
  return payload;
}

/**
 * Decrypt an exported backup file to recover the private key.
 */
export async function importEncryptedBackup(data: Uint8Array, pin: string): Promise<Uint8Array> {
  if (data.length < 28) throw new Error("Invalid backup data format");
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const encrypted = data.slice(28);

  const key = await deriveKeyFromPassword(pin, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
}

// -----------------------------------------------------------------------------
// SPAKE2 Session Key Derivation
// -----------------------------------------------------------------------------

/**
 * Derive a secure session key using the QR ceremony PIN and both public keys.
 *
 * Uses PBKDF2-HMAC-SHA256 (100 000 iterations) to stretch the PIN before
 * feeding it into HKDF together with both peers' public keys.  The stretching
 * makes offline PIN-guessing attacks substantially more expensive.
 *
 * TODO: Replace with a full SPAKE2+ (RFC 9383) or OPAQUE implementation for
 * production use.
 */
export async function deriveSpake2SessionKey(pin: string, localPubKey: Uint8Array, remotePubKey: Uint8Array): Promise<Uint8Array> {
  // Sort pubkeys to ensure both peers derive the identical shared material regardless of role
  const keys = [localPubKey, remotePubKey].sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });

  const ikm = new Uint8Array(keys[0].length + keys[1].length);
  ikm.set(keys[0], 0);
  ikm.set(keys[1], keys[0].length);

  const encoder = new TextEncoder();

  // Stretch the PIN via PBKDF2 (100 000 iterations) before feeding it into
  // HKDF.  This forces an attacker who captures both public keys to perform
  // 100 000 hash iterations per PIN guess instead of a single invocation.
  // TODO: Replace with a full SPAKE2+ (RFC 9383) or OPAQUE implementation.
  const pinKeyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const stretchedPin = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode('stratigraph-spake2-pbkdf2'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    pinKeyMaterial,
    256,
  );

  // HKDF-SHA256 to derive a 32-byte symmetric session key
  return hkdf(sha256, ikm, new Uint8Array(stretchedPin), encoder.encode('stratigraph-spake2-session'), 32);
}

// -----------------------------------------------------------------------------
// At-Rest Encryption Utilities (IndexedDB)
// -----------------------------------------------------------------------------

/**
 * Encrypt arbitrary data for at-rest storage (e.g. IndexedDB).
 */
export async function encryptAtRest(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data as any
  );
  const payload = new Uint8Array(12 + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), 12);
  return payload;
}

/**
 * Decrypt data from at-rest storage.
 */
export async function decryptAtRest(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
}
