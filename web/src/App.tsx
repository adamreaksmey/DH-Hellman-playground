import React, { useState } from 'react';
import {
  base64Decode,
  base64Encode,
  computeHMAC,
  computeSharedSecret,
  deriveDeviceSecret,
  deriveServerHMACKey,
  generateNonce,
  generateX25519KeyPair,
} from './cryptoUtils';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const App: React.FC = () => {
  const [nonce, setNonce] = useState('');
  const [keyPair, setKeyPair] = useState<{ pub: string; priv: string } | null>(null);
  const [base64Input, setBase64Input] = useState('');
  const [base64Output, setBase64Output] = useState('');
  const [hmacMessage, setHmacMessage] = useState('');
  const [hmacKeyHex, setHmacKeyHex] = useState('');
  const [hmacOutput, setHmacOutput] = useState('');

  const [sharedSecretHex, setSharedSecretHex] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('MyApp/1.0 web');
  const [deviceSecretHex, setDeviceSecretHex] = useState('');
  const [serverKeyHex, setServerKeyHex] = useState('');

  function handleGenerateNonce() {
    setNonce(generateNonce());
  }

  function handleGenerateKeypair() {
    const { publicKey, privateKey } = generateX25519KeyPair();
    setKeyPair({ pub: toHex(publicKey), priv: toHex(privateKey) });
  }

  function handleBase64Encode() {
    const bytes = new TextEncoder().encode(base64Input);
    setBase64Output(base64Encode(bytes));
  }

  function handleBase64Decode() {
    try {
      const bytes = base64Decode(base64Input);
      setBase64Output(new TextDecoder().decode(bytes));
    } catch (e) {
      setBase64Output('Invalid base64');
    }
  }

  function handleComputeHMAC() {
    try {
      const keyBytes = Uint8Array.from(hmacKeyHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
      setHmacOutput(computeHMAC(keyBytes, hmacMessage));
    } catch {
      setHmacOutput('Invalid key hex');
    }
  }

  function handleComputeDeviceSecrets() {
    try {
      const sharedBytes = Uint8Array.from(sharedSecretHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
      const deviceSecret = deriveDeviceSecret(sharedBytes, deviceInfo);
      setDeviceSecretHex(toHex(deviceSecret));
      const serverKey = deriveServerHMACKey(deviceSecret);
      setServerKeyHex(toHex(serverKey));
    } catch {
      setDeviceSecretHex('Invalid shared secret hex');
      setServerKeyHex('');
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h2>DH Hellman Debug Tools</h2>
      <p style={{ color: '#555' }}>
        Small React UI to poke at the helpers in <code>src/crypto.ts</code> (browser-side equivalents).
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h3>Nonce</h3>
        <button onClick={handleGenerateNonce}>Generate nonce</button>
        {nonce && <pre>{nonce}</pre>}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>X25519 key pair</h3>
        <button onClick={handleGenerateKeypair}>Generate key pair</button>
        {keyPair && (
          <div>
            <div>
              <strong>Public key (hex)</strong>
              <pre>{keyPair.pub}</pre>
            </div>
            <div>
              <strong>Private key (hex)</strong>
              <pre>{keyPair.priv}</pre>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Base64 encode / decode</h3>
        <textarea
          rows={3}
          style={{ width: '100%' }}
          value={base64Input}
          onChange={(e) => setBase64Input(e.target.value)}
          placeholder="Enter text or base64 here"
        />
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleBase64Encode}>Encode</button>
          <button onClick={handleBase64Decode}>Decode</button>
        </div>
        {base64Output && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Result</strong>
            <pre>{base64Output}</pre>
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>HMAC-SHA256</h3>
        <label>
          Key (hex)
          <input
            style={{ width: '100%' }}
            value={hmacKeyHex}
            onChange={(e) => setHmacKeyHex(e.target.value.trim())}
          />
        </label>
        <label>
          Message
          <textarea
            rows={3}
            style={{ width: '100%' }}
            value={hmacMessage}
            onChange={(e) => setHmacMessage(e.target.value)}
          />
        </label>
        <button style={{ marginTop: '0.5rem' }} onClick={handleComputeHMAC}>
          Compute HMAC
        </button>
        {hmacOutput && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>HMAC (hex)</strong>
            <pre>{hmacOutput}</pre>
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Device / server key derivation</h3>
        <label>
          Shared secret (hex)
          <textarea
            rows={2}
            style={{ width: '100%' }}
            value={sharedSecretHex}
            onChange={(e) => setSharedSecretHex(e.target.value.trim())}
          />
        </label>
        <label>
          Device info
          <input
            style={{ width: '100%' }}
            value={deviceInfo}
            onChange={(e) => setDeviceInfo(e.target.value)}
          />
        </label>
        <button style={{ marginTop: '0.5rem' }} onClick={handleComputeDeviceSecrets}>
          Derive secrets
        </button>
        {deviceSecretHex && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Device secret (hex)</strong>
            <pre>{deviceSecretHex}</pre>
          </div>
        )}
        {serverKeyHex && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Server HMAC key (hex)</strong>
            <pre>{serverKeyHex}</pre>
          </div>
        )}
      </section>
    </div>
  );
};

