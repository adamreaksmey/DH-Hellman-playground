

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

export function deriveDeviceSecret(sharedSecret: Uint8Array, deviceInfo: string): Uint8Array {
    const salt = Buffer.from('device-auth-v1', 'utf8');
    const info = Buffer.from(deviceInfo, 'utf8');
    return new Uint8Array(crypto.hkdfSync('sha256', sharedSecret, salt, info, 32));
}

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

