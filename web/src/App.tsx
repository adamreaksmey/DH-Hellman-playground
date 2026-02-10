import React, { useState } from "react";
import axios from "axios";
import {
  base64Decode,
  base64Encode,
  computeHMAC,
  computeSharedSecret,
  deriveDeviceSecret,
  deriveServerHMACKey,
  generateNonce,
  generateX25519KeyPair,
} from "./cryptoUtils";
import { RegistrationClient } from "./RegistrationClient";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const App: React.FC = () => {
  const [nonce, setNonce] = useState("");
  const [keyPair, setKeyPair] = useState<{ pub: string; priv: string } | null>(
    null,
  );
  const [base64Input, setBase64Input] = useState("");
  const [base64Output, setBase64Output] = useState("");
  const [hmacMessage, setHmacMessage] = useState("");
  const [hmacKeyHex, setHmacKeyHex] = useState("");
  const [hmacOutput, setHmacOutput] = useState("");

  const [sharedSecretHex, setSharedSecretHex] = useState("");
  const [deviceInfo, setDeviceInfo] = useState("MyApp/1.0 web");
  const [deviceSecretHex, setDeviceSecretHex] = useState("");
  const [serverKeyHex, setServerKeyHex] = useState("");

  const [baseUrl, setBaseUrl] = useState("http://localhost:8081");
  const [phoneNumber, setPhoneNumber] = useState("855123456781");
  const [otp, setOtp] = useState("999999");
  const [deviceName, setDeviceName] = useState("My Device");
  const [profileUsername, setProfileUsername] = useState("johndoe2");
  const [profilePassword, setProfilePassword] = useState("SecurePass123!");
  const [profileDisplayName, setProfileDisplayName] = useState("John Doe");
  const [profileBio, setProfileBio] = useState("Hello world");
  const [regClient, setRegClient] = useState<RegistrationClient | null>(null);
  const [regLog, setRegLog] = useState<string[]>([]);
  const [regLoading, setRegLoading] = useState(false);

  function appendLog(line: string) {
    setRegLog((prev) => [...prev, line]);
  }

  function getClient() {
    if (regClient && regClient["baseURL"] === baseUrl) return regClient;
    const client = new RegistrationClient(baseUrl, deviceInfo, "web");
    setRegClient(client);
    return client;
  }

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
      setBase64Output("Invalid base64");
    }
  }

  function handleComputeHMAC() {
    try {
      const keyBytes = Uint8Array.from(
        hmacKeyHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [],
      );
      setHmacOutput(computeHMAC(keyBytes, hmacMessage));
    } catch {
      setHmacOutput("Invalid key hex");
    }
  }

  function handleComputeDeviceSecrets() {
    try {
      const sharedBytes = Uint8Array.from(
        sharedSecretHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [],
      );
      const deviceSecret = deriveDeviceSecret(sharedBytes, deviceInfo);
      setDeviceSecretHex(toHex(deviceSecret));
      const serverKey = deriveServerHMACKey(deviceSecret);
      setServerKeyHex(toHex(serverKey));
    } catch {
      setDeviceSecretHex("Invalid shared secret hex");
      setServerKeyHex("");
    }
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <h2>DH Hellman Debug Tools</h2>

      <section
        style={{
          marginTop: "3rem",
          borderTop: "1px solid #ddd",
          paddingTop: "2rem",
        }}
      >
        <h3>Registration flow</h3>
        <p style={{ color: "#555" }}>
          Runs the same steps as your Node script: register device → check user
          → request OTP → verify OTP → optional profile setup.
        </p>

        <div style={{ display: "grid", gap: "0.75rem", maxWidth: 480 }}>
          <label>
            Base URL
            <input
              style={{ width: "100%" }}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label>
            Device info
            <input
              style={{ width: "100%" }}
              value={deviceInfo}
              onChange={(e) => setDeviceInfo(e.target.value)}
            />
          </label>
          <label>
            Device name
            <input
              style={{ width: "100%" }}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
          <label>
            Phone number
            <input
              style={{ width: "100%" }}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </label>
          <label>
            OTP code
            <input
              style={{ width: "100%" }}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </label>
          <label>
            Profile username
            <input
              style={{ width: "100%" }}
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
            />
          </label>
          <label>
            Profile password
            <input
              type="password"
              style={{ width: "100%" }}
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
            />
          </label>
          <label>
            Display name
            <input
              style={{ width: "100%" }}
              value={profileDisplayName}
              onChange={(e) => setProfileDisplayName(e.target.value)}
            />
          </label>
          <label>
            Bio
            <textarea
              rows={2}
              style={{ width: "100%" }}
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
            />
          </label>
        </div>

        <button
          style={{ marginTop: "1rem" }}
          disabled={regLoading}
          onClick={async () => {
            setRegLoading(true);
            setRegLog([]);
            const client = getClient();
            try {
              appendLog("Registering device...");
              const deviceResp = await client.registerDevice(deviceName);
              appendLog(`Device registered: ${JSON.stringify(deviceResp)}`);

              appendLog("Checking user...");
              const checkResp = await client.checkUser(phoneNumber);
              appendLog(
                `User exists: ${checkResp.exist}, methods: ${checkResp.loginMethod.join(", ")}`,
              );

              appendLog("Requesting OTP...");
              const otpResp = await client.requestOTP(phoneNumber);
              appendLog(`OTP requested: ${otpResp.message ?? "ok"}`);

              appendLog(`Verifying OTP ${otp}...`);
              const authResult = await client.verifyOTP(phoneNumber, otp);
              appendLog(
                `Logged in as ${authResult.user.username}, isNewUser=${authResult.user.isNewUser}`,
              );

              if (authResult.user.isNewUser) {
                appendLog("User is new, setting up profile...");
                await client.setupProfile({
                  username: profileUsername || undefined,
                  password: profilePassword || undefined,
                  displayName: profileDisplayName || undefined,
                  bio: profileBio || undefined,
                });
                appendLog("Profile setup complete");
              }
            } catch (err) {
              if (axios.isAxiosError(err)) {
                appendLog(
                  `API error: ${JSON.stringify(err.response?.data ?? err.message)}`,
                );
              } else if (err instanceof Error) {
                appendLog(`Error: ${err.message}`);
              } else {
                appendLog("Unknown error");
              }
            } finally {
              setRegLoading(false);
            }
          }}
        >
          {regLoading ? "Running flow…" : "Run full registration flow"}
        </button>

        {regLog.length > 0 && (
          <pre
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "#f7f7f7",
              borderRadius: 4,
              maxHeight: 260,
              overflow: "auto",
            }}
          >
            {regLog.map((l, i) => `${i + 1}. ${l}`).join("\n")}
          </pre>
        )}
      </section>
      

      <hr />

      <p style={{ color: "#555" }}>
        small ugly ui to poke at the helpers in <code>src/crypto.ts</code>{" "}
        (browser-side equivalents).
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h3>Nonce</h3>
        <p style={{ color: "#555", margin: "0 0 0.5rem" }}>
          A one-time random value used in headers so each request is unique. You don&apos;t fetch this
          from the server — you just generate it on the client.
        </p>
        <button onClick={handleGenerateNonce}>Generate nonce</button>
        {nonce && <pre>{nonce}</pre>}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h3>X25519 key pair</h3>
        <p style={{ color: "#555", margin: "0 0 0.5rem" }}>
          Client Diffie–Hellman keys. You send the <strong>public</strong> key to the server during device
          registration; the <strong>private</strong> key stays on this device only.
        </p>
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

      <section style={{ marginTop: "2rem" }}>
        <h3>Base64 encode / decode</h3>
        <p style={{ color: "#555", margin: "0 0 0.5rem" }}>
          Convert between raw bytes and base64 strings. The backend usually returns things like public
          keys as base64 (e.g. <code>serverPublicKey</code>), which you then decode back to bytes.
        </p>
        <textarea
          rows={3}
          style={{ width: "100%" }}
          value={base64Input}
          onChange={(e) => setBase64Input(e.target.value)}
          placeholder="Enter text or base64 here"
        />
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
          <button onClick={handleBase64Encode}>Encode</button>
          <button onClick={handleBase64Decode}>Decode</button>
        </div>
        {base64Output && (
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Result</strong>
            <pre>{base64Output}</pre>
          </div>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h3>HMAC-SHA256</h3>
        <p style={{ color: "#555", margin: "0 0 0.5rem" }}>
          Computes an HMAC over a message with a secret key (e.g. the <code>serverHMACKey</code> derived
          below). The server uses the same secret to verify your request headers.
        </p>
        <label>
          Key (hex)
          <input
            style={{ width: "100%" }}
            value={hmacKeyHex}
            onChange={(e) => setHmacKeyHex(e.target.value.trim())}
          />
        </label>
        <label>
          Message
          <textarea
            rows={3}
            style={{ width: "100%" }}
            value={hmacMessage}
            onChange={(e) => setHmacMessage(e.target.value)}
          />
        </label>
        <button style={{ marginTop: "0.5rem" }} onClick={handleComputeHMAC}>
          Compute HMAC
        </button>
        {hmacOutput && (
          <div style={{ marginTop: "0.5rem" }}>
            <strong>HMAC (hex)</strong>
            <pre>{hmacOutput}</pre>
          </div>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h3>Device / server key derivation</h3>
        <p style={{ color: "#555", margin: "0 0 0.5rem" }}>
          Takes the X25519 shared secret between your device and the server (from both public/private
          keys) plus device info, and derives two keys: a device secret and a server HMAC key used for
          signing API requests.
        </p>
        <label>
          Shared secret (hex)
          <textarea
            rows={2}
            style={{ width: "100%" }}
            value={sharedSecretHex}
            onChange={(e) => setSharedSecretHex(e.target.value.trim())}
          />
        </label>
        <label>
          Device info
          <input
            style={{ width: "100%" }}
            value={deviceInfo}
            onChange={(e) => setDeviceInfo(e.target.value)}
          />
        </label>
        <button
          style={{ marginTop: "0.5rem" }}
          onClick={handleComputeDeviceSecrets}
        >
          Derive secrets
        </button>
        {deviceSecretHex && (
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Device secret (hex)</strong>
            <pre>{deviceSecretHex}</pre>
          </div>
        )}
        {serverKeyHex && (
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Server HMAC key (hex)</strong>
            <pre>{serverKeyHex}</pre>
          </div>
        )}
      </section>
    </div>
  );
};
