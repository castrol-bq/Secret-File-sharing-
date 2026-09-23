/**
 * Client-Side WebCrypto Utilities for Zero-Knowledge End-to-End Encryption (AES-GCM-256)
 */

// Generate a high-entropy 256-bit encryption key (URL-safe string)
export async function generateSecretKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return bufferToBase64Url(exported);
}

// Convert ArrayBuffer to URL-safe Base64
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Convert URL-safe Base64 to ArrayBuffer
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive an AES-GCM key from a string key or passphrase
async function importKey(keyStr: string): Promise<CryptoKey> {
  try {
    // If length matches 256-bit raw key (32 bytes = 43/44 chars in base64url)
    const rawBuffer = base64UrlToBuffer(keyStr);
    if (rawBuffer.byteLength === 32) {
      return await window.crypto.subtle.importKey(
        'raw',
        rawBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    }
  } catch {}

  // Fallback: derive 256-bit key from arbitrary password/passcode using SHA-256
  const enc = new TextEncoder();
  const passBuffer = enc.encode(keyStr);
  const hash = await window.crypto.subtle.digest('SHA-256', passBuffer);
  return await window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext with AES-GCM 256-bit
export async function encryptPayload(
  text: string,
  keyStr: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(keyStr);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit standard IV for GCM
  const encodedText = new TextEncoder().encode(text);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );

  return {
    ciphertext: bufferToBase64Url(encryptedBuffer),
    iv: bufferToBase64Url(iv.buffer),
  };
}

// Decrypt ciphertext with AES-GCM 256-bit
export async function decryptPayload(
  ciphertext: string,
  ivStr: string,
  keyStr: string
): Promise<string> {
  const key = await importKey(keyStr);
  const ivBuffer = base64UrlToBuffer(ivStr);
  const cipherBuffer = base64UrlToBuffer(ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    cipherBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Generate cool anonymous codename for temporary room participants
const PREFIXES = [
  'Ghost', 'Cipher', 'Viper', 'Shadow', 'Apex', 'Phantom', 'Nexus',
  'Spectre', 'Zero', 'Echo', 'Stealth', 'Enigma', 'Obsidian', 'Raven'
];
const ACCENTS = ['Cyan', 'Amber', 'Neon', 'Chrome', 'Cobalt', 'Onyx', 'Krypton', 'Vortex'];

export function generateRandomCodename(): string {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const a = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
  const n = Math.floor(10 + Math.random() * 89);
  return `${p}-${a}-${n}`;
}

export const CYBER_COLORS = [
  '#00f0ff', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#38bdf8', // Sky
];
