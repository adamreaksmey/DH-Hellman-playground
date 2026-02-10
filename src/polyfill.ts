/**
 * Ensures globalThis.crypto.getRandomValues exists for @noble/curves in Node 18.
 * Node 19+ provides it by default.
 */
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
  (globalThis as unknown as { crypto: typeof webcrypto }).crypto = webcrypto;
}
