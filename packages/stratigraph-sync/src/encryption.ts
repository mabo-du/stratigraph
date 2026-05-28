/// <reference lib="dom" />

/**
 * Generate a cryptographically random 256-bit key as a base64url string.
 * Suitable for embedding in shareable links.
 */
export function generateEncryptionKey(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Encrypt data using AES-GCM with the given base64url-encoded key.
 * Returns the IV + ciphertext concatenated as a single Uint8Array.
 */
export async function encryptData(plaintext: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const keyRaw = base64UrlDecode(keyBase64);
  const keyBuf = keyRaw.buffer.slice(keyRaw.byteOffset, keyRaw.byteOffset + keyRaw.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ptBuf = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer;
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, ptBuf
  );
  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result;
}

/**
 * Decrypt data encrypted with encryptData().
 */
export async function decryptData(data: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const keyRaw = base64UrlDecode(keyBase64);
  const keyBuf = keyRaw.buffer.slice(keyRaw.byteOffset, keyRaw.byteOffset + keyRaw.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'AES-GCM' }, false, ['decrypt']
  );
  const ivSlice = data.slice(0, 12);
  const ivBuf = ivSlice.buffer.slice(ivSlice.byteOffset, ivSlice.byteOffset + ivSlice.byteLength) as ArrayBuffer;
  const ctSlice = data.slice(12);
  const ctBuf = ctSlice.buffer.slice(ctSlice.byteOffset, ctSlice.byteOffset + ctSlice.byteLength) as ArrayBuffer;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf }, key, ctBuf
  );
  return new Uint8Array(plaintext);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
