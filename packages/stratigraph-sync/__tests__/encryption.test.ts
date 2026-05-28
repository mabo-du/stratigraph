import { describe, it, expect } from 'vitest';
import { generateEncryptionKey, encryptData, decryptData } from '../src/encryption';

describe('encryption', () => {
  it('generates a 256-bit base64url key', () => {
    const key = generateEncryptionKey();
    expect(key).toBeTruthy();
    // base64url-encoded 256-bit key is 43 chars + 0-1 padding
    expect(key.length).toBeGreaterThanOrEqual(43);
    expect(key.length).toBeLessThanOrEqual(44);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });

  it('encrypts and decrypts data round-trip', async () => {
    const key = generateEncryptionKey();
    const data = new TextEncoder().encode('Hello collaboration');
    const encrypted = await encryptData(data, key);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.byteLength).toBeGreaterThan(0);

    const decrypted = await decryptData(encrypted, key);
    const text = new TextDecoder().decode(decrypted);
    expect(text).toBe('Hello collaboration');
  });

  it('produces different ciphertext for same plaintext (IV-based)', async () => {
    const key = generateEncryptionKey();
    const data = new TextEncoder().encode('fixed message');
    const a = await encryptData(data, key);
    const b = await encryptData(data, key);
    // AES-GCM uses a random IV each time, so outputs differ
    expect(a).not.toEqual(b);
  });
});
