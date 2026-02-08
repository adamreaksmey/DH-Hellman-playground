

import crypto from 'node:crypto';

const ECDHMode = 'x25519'

export function generateHMAC(secret: Buffer, message: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(message, 'utf8');
    return hmac.digest('hex');
}

export function generateNonce() {
    return crypto.randomBytes(16).toString('hex');
}

export function generateX25519KeyPair() {
    const ecdh = crypto.createECDH(ECDHMode);
    ecdh.generateKeys();
    return {
        privateKey: ecdh.getPrivateKey(),
        publicKey: ecdh.getPublicKey(),
        ecdh: ecdh
    };
}