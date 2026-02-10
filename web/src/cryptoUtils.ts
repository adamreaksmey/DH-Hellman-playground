import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

export function generateNonce(): string {
  const bytes = randomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateX25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const { secretKey: privateKey, publicKey } = x25519.keygen();
  return { privateKey, publicKey };
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function computeSharedSecret(privateKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, serverPublicKey);
}

export function deriveDeviceSecret(sharedSecret: Uint8Array, deviceInfo: string): Uint8Array {
  const salt = new TextEncoder().encode('device-auth-v1');
  const info = new TextEncoder().encode(deviceInfo);
  return hkdf(sha256, sharedSecret, salt, info, 32);
}

export function deriveServerHMACKey(deviceSecret: Uint8Array): Uint8Array {
  const salt = new TextEncoder().encode('server-hmac-key-v1');
  const info = new TextEncoder().encode('server-verification');
  return hkdf(sha256, deviceSecret, salt, info, 32);
}

export function computeHMAC(key: Uint8Array, message: string): string {
  const mac = hmac(sha256, key, new TextEncoder().encode(message));
  return Array.from(mac)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

