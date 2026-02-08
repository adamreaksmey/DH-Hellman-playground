import crypto from 'node:crypto';

export function generateHMAC(secret: Buffer, message: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(message, 'utf8');
    return hmac.digest('hex');
}

export function generateNonce() {
    return crypto.randomBytes(16).toString('hex');
}