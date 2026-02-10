## dh-hellman

TypeScript helpers and client for a Diffie–Hellman–based device registration and OTP login flow, plus a small React UI to poke at the crypto and registration steps.

This repo is meant as a **reference implementation for client-side logic**. It does **not** include the backend – you plug it into your own API that exposes the expected endpoints.

---

## Project layout

- **`src/`**: Node/TS client library and helpers
  - `registration.ts`: high-level `RegistrationClient` for device registration, OTP login and profile setup
  - `crypto.ts`: X25519 key generation, shared-secret and key derivation, HMAC helpers (Node)
  - `interface.ts`: shared request/response TypeScript interfaces
  - `request.ts`: simple session-based login/logout helpers (separate from the OTP flow)
  - `storage.ts`: in-memory `localStorage`-like shim used by the client
  - `polyfill.ts`: ensures `globalThis.crypto.getRandomValues` exists in Node 18
  - `index.ts`: example script that runs the full registration flow against a local backend
- **`web/`**: Vite + React playground for the same crypto helpers and registration flow
  - `src/App.tsx`: UI with registration flow runner and crypto debugging tools
  - `src/RegistrationClient.ts`: browser version of the `RegistrationClient`
  - `src/cryptoUtils.ts`: browser-safe equivalents of the helpers in `src/crypto.ts`

The compiled Node output lives in **`dist/`** after building.

---

## Prerequisites

- **Node.js**: 18+ (ES modules + `node:crypto`; `polyfill.ts` backfills `globalThis.crypto` for Node 18)
- **npm**: uses `package-lock.json` (you can adapt to pnpm/yarn if you prefer)

---

## Installation

From the repo root:

```bash
npm install
```

---

## Scripts

From `package.json`:

- **`npm run build`**: compile TypeScript in `src/` to `dist/` via `tsc`
- **`npm run start`**: run the compiled example script (`node dist/index.js`)
- **`npm run dev`**: build once then run `dist/index.js` (no file watcher)
- **`npm run web:dev`**: start the Vite dev server for the React playground
- **`npm run web:build`**: build the web app into `web/dist-web`
- **`npm run web:preview`**: preview the built web app using Vite’s preview server

---

## Backend expectations (high level)

The client assumes there is an HTTP API (default base URL in examples: `http://localhost:8081`) exposing:

- `POST /api/v1/device/register` → `DeviceRegistrationResponse`
- `POST /api/v1/auth/check` → `CheckUserResponse`
- `POST /api/v1/auth/otp/send` → `OTPResponse`
- `POST /api/v1/auth/otp/verify` → `AuthResponse`  
  (requires HMAC-protected headers)
- `POST /api/v1/user/profile/setup` → `{ message: string; user: AuthResponse['user'] }`  
  (also HMAC-protected)

TypeScript interfaces for these payloads live in `src/interface.ts` and should be kept in sync with your backend.

---

## Using the Node client (`src/registration.ts`)

The main entry point is the `RegistrationClient` class:

```ts
import { RegistrationClient } from './src/registration';

const BASE_URL = 'http://localhost:8081';
const DEVICE_INFO = 'MyApp/1.0 ios';

async function example() {
  const client = new RegistrationClient(BASE_URL, DEVICE_INFO, 'ios');

  // 1. Device registration (once per device)
  const deviceResp = await client.registerDevice('My iPhone');
  console.log('Device registered:', deviceResp.deviceId);

  // 2. Check user (optional)
  const phoneNumber = '855123456781';
  const checkResp = await client.checkUser(phoneNumber);
  console.log('User exists:', checkResp.exist, 'methods:', checkResp.loginMethod);

  // 3. Request OTP
  await client.requestOTP(phoneNumber);

  // 4. Verify OTP (user supplies code)
  const otp = '999999';
  const auth = await client.verifyOTP(phoneNumber, otp);

  // 5. Optionally complete profile for new users
  if (auth.user.isNewUser) {
    await client.setupProfile({
      username: 'johndoe',
      password: 'StrongPass123!',
      displayName: 'John Doe',
      bio: 'Hello world',
    });
  }
}
```

### What `RegistrationClient` does

- **`registerDevice(deviceName?)`**
  - Generates an X25519 keypair
  - Sends the **public** key + device metadata to `/api/v1/device/register`
  - Receives the server’s public key, computes the shared secret, and derives:
    - `deviceSecret` (HKDF from shared secret + `deviceInfo`)
    - `serverHMACKey` (HKDF from `deviceSecret`)
  - Persists `deviceId` and a base64-encoded `deviceSecret` via `storage`

- **`checkUser(identifier)`**
  - Lightweight existence lookup (e.g. phone number or username)

- **`requestOTP(phoneNumber)`**
  - Triggers an OTP SMS (or equivalent) via the backend

- **`verifyOTP(phoneNumber, otp)`**
  - Requires that the device has been registered
  - Derives a **session ID** and **request signature** using `serverHMACKey`:
    - `Authorization: Session {sessionId}`
    - `X-Signature`, `X-Timestamp`, `X-Nonce`
  - On success, stores `sessionId` on the client instance and returns `AuthResponse`

- **`setupProfile(profile)`**
  - HMAC-signs the body and sends it to `/api/v1/user/profile/setup` using the same header pattern

- **`fullRegistrationFlow(phoneNumber, otp, profile?)`**
  - Convenience wrapper: `verifyOTP` then `setupProfile` if `user.isNewUser` and `profile` is provided

---

## Example: running the demo script

`src/index.ts` wires the client together into a single script that:

1. Registers the device
2. Checks whether the user exists
3. Requests an OTP
4. Verifies the OTP
5. Optionally sets up a profile for new users

To run it against your backend:

1. Ensure your backend is running and reachable (defaults to `http://localhost:8081`)
2. Adjust `BASE_URL`, `DEVICE_INFO`, `phoneNumber`, and the default OTP in `src/index.ts` as needed
3. From the repo root:

   ```bash
   npm run dev
   # or, explicitly:
   npm run build
   npm run start
   ```

Check the console output to verify headers, payloads, and responses.

---

## React playground (`web/`)

The `web/` folder contains a small React app that lets you **interactively** exercise the same flows and crypto helpers.

### Start the dev server

```bash
npm run web:dev
```

Vite will print the local URL (by default `http://localhost:5173`). Open it in a browser.

### What the UI provides

- **Registration flow panel**
  - Configure base URL, device info, phone number, OTP, and profile fields
  - Runs the same steps as the Node script (`registerDevice → checkUser → requestOTP → verifyOTP → setupProfile`)
  - Shows a log of each request/response for easier debugging with your backend

- **Crypto helpers**
  - **Nonce generation** (`generateNonce`)
  - **X25519 key pair generation**
  - **Base64 encode/decode**
  - **HMAC-SHA256** computation from key (hex) + message
  - **Device/server key derivation** from the X25519 shared secret and `deviceInfo`

This is intentionally a “small ugly UI” focused on correctness and observability rather than production design.

---

## Storage & security notes

- The `storage` implementation in `src/storage.ts` is a **simple in-memory map**.  
  In a real app you should plug in a secure storage layer (Keychain/Keystore, encrypted storage, etc.).
- Secrets kept client-side:
  - `deviceSecret` and `serverHMACKey` (derived, never sent over the wire)
  - `sessionId` for authenticated requests
- Never log these secrets in production; they are logged only for debugging in this reference implementation.

---

## Extending / integrating

Some common integration patterns for your team:

- **Mobile app**: mirror `RegistrationClient`’s logic in Swift/Kotlin using your platform’s crypto APIs (this project is a reference for the exact message formats and HMAC calculations).
- **Backend validation**: use `src/interface.ts` as the single source of truth for request/response shapes and keep it aligned with your backend DTOs.
- **Additional signed endpoints**: reuse the HMAC header pattern from `setupProfile` to sign other authenticated API calls with `serverHMACKey`.

If you add or change endpoints, update `src/interface.ts`, `src/registration.ts`, and (optionally) the React playground to keep everything in sync.

