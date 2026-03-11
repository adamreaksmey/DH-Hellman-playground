

import { x25519 } from '@noble/curves/ed25519.js';
import crypto from 'node:crypto';

export function generateHMAC(secret: Buffer, message: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(message, 'utf8');
    return hmac.digest('hex');
}

export function generateNonce() {
    return crypto.randomBytes(16).toString('hex');
}

export function generateX25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
    const { secretKey: privateKey, publicKey } = x25519.keygen();
    return { privateKey, publicKey };
}

export function base64Encode(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
}

export function base64Decode(str: string): Uint8Array {
    return new Uint8Array(Buffer.from(str, 'base64'));
}

export function computeSharedSecret(privateKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
    return x25519.getSharedSecret(privateKey, serverPublicKey);
}

// This function derives a device-specific secret from the shared
// Diffie–Hellman secret. **EVERY input must match exactly between
// client and server**; otherwise authentication will fail.
//
// Parameters and importance:
//
// - sharedSecret: MUST be the exact X25519 DH secret. Directly using
//   it without HKDF is insecure. Never reuse it as-is for signing.
//
// - salt: "device-auth-v1" is a **protocol constant** that provides
//   domain separation. This ensures this key is only for device
//   authentication, and not reused elsewhere. MUST match exactly.
//
// - info: binds the derived key to this **specific device**. This
//   prevents key reuse across devices. Changing deviceInfo even
//   slightly (extra space, different casing) will break key agreement.
//
// - length: 32 bytes, which matches the expected size for downstream
//   HMAC signing. MUST be consistent.
//
// Security notes:
// - Do NOT modify salt or info without coordinating server changes.
// - Always encode both salt and info consistently (UTF-8 here).
// - Using HKDF ensures the raw DH secret is **never directly exposed**
//   and produces a stable, context-bound key suitable for authentication.
//
export function deriveDeviceSecret(sharedSecret: Uint8Array, deviceInfo: string): Uint8Array {
    const salt = Buffer.from('device-auth-v1', 'utf8');
    const info = Buffer.from(deviceInfo, 'utf8');
    return new Uint8Array(crypto.hkdfSync('sha256', sharedSecret, salt, info, 32));
}

// Derives the HMAC key used to authenticate requests to the server.
// **EVERY input must match exactly between client and server**; any
// mismatch will break authentication signatures.
//
// Parameters and importance:
//
// - deviceSecret: MUST be the device-specific secret derived from
//   X25519 DH shared secret. Never reuse the raw DH secret directly.
//
// - salt: "server-hmac-key-v1" provides **domain separation**. It
//   ensures this key is used only for server request signing. const string MUST match.
//
// - info: "server-verification" binds the key to its purpose. This
//   prevents accidental reuse in other cryptographic operations. const string MUST match.
//
// - length: 32 bytes, matching expected size for HMAC-SHA256 signing.
//
// Security notes:
// - Changing salt or info without updating the server will break
//   all request authentication.
// - Always encode salt and info consistently (UTF-8 here).
// - This derived key is **never transmitted**; only the derived HMAC
//   signatures are sent to the server.
export function deriveServerHMACKey(deviceSecret: Uint8Array): Uint8Array {
    const salt = Buffer.from('server-hmac-key-v1', 'utf8');
    const info = Buffer.from('server-verification', 'utf8');
    return new Uint8Array(crypto.hkdfSync('sha256', deviceSecret, salt, info, 32));
}

export function computeHMAC(key: Uint8Array, message: string): string {
    const h = crypto.createHmac('sha256', Buffer.from(key));
    h.update(message, 'utf8');
    return h.digest('hex');
}

