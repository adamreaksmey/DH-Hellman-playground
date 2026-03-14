import "./polyfill.js";
import axios from "axios";
import { randomUUID } from "node:crypto";

import { RegistrationClient } from "./registration.js";
import {
    base64Decode,
    deriveServerHMACKey,
    computeHMAC,
} from "./crypto.js";
import { storage } from "./storage.js";

const BASE_URL = "http://localhost:10008";
const DEVICE_INFO = "MyApp/1.0 web";
const PLATFORM = "web";

const areaCode = "+855";
const phoneNumber = "111111721";
const password = "SecurePass123!";

const PLATFORM_IDS = {
    ios: 1,
    android: 2,
    windows: 3,
    macos: 4,
    web: 5,
    harmony: 6,
} as const;

function toPlatformId(platform: string): number {
    const key = platform.toLowerCase() as keyof typeof PLATFORM_IDS;
    return PLATFORM_IDS[key] ?? PLATFORM_IDS.web;
}

function buildCredentialPhone(areaCode: string, phone: string): string {
    let code = areaCode.trim();
    if (code && !code.startsWith("+")) code = "+" + code;
    return `${code} ${phone.trim()}`;
}

async function ensureDevice(): Promise<{
    deviceID: string;
    serverHMACKey: Uint8Array;
}> {
    const client = new RegistrationClient(BASE_URL, DEVICE_INFO, PLATFORM);

    // Register device if we don't have one yet.
    if (!storage.getItem("device_id") || !storage.getItem("device_secret")) {
        await client.registerDevice("Password Login Demo Device");
    }

    const deviceID = storage.getItem("device_id");
    const deviceSecretB64 = storage.getItem("device_secret");

    if (!deviceID || !deviceSecretB64) {
        throw new Error(
            "Device registration failed; missing device_id or device_secret",
        );
    }

    const deviceSecret = base64Decode(deviceSecretB64);
    const serverHMACKey = deriveServerHMACKey(deviceSecret);

    return { deviceID, serverHMACKey };
}

async function passwordRegisterDemo() {
    const { deviceID, serverHMACKey } = await ensureDevice();

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const sessionMessage = `${deviceID}:${timestamp}:${nonce}`;
    const sessionID = computeHMAC(serverHMACKey, sessionMessage);

    const account = buildCredentialPhone(areaCode, phoneNumber);
    const registerMessage = `register:${account}:${timestamp}:${nonce}`;
    const deviceSignature = computeHMAC(serverHMACKey, registerMessage);

    const payload = {
        deviceID,
        platform: toPlatformId(PLATFORM),
        areaCode,
        phoneNumber,
        password,
        nickname: "John Doe (password)",
        sessionID,
        timestamp,
        nonce,
        deviceSignature,
    };

    console.log("show payload", payload)
    console.log("show register message", registerMessage)
    console.log("show device sig", deviceSignature)

    const { data } = await axios.post(
        `${BASE_URL}/account/password/register`,
        payload,
        {
            headers: {
                operationID: randomUUID(),
            },
        },
    );
    const reg = (data?.data ?? data) as {
        userID: string;
        sessionID?: string;
        chatToken?: string;
    };

    console.log("Password register result:", reg);
    console.log(
        "Registered (password):",
        reg.userID,
        "sessionID:",
        reg.sessionID ?? sessionID,
    );

    return {
        userID: reg.userID,
        sessionID: reg.sessionID ?? sessionID,
    };
}

async function passwordLoginDemo() {
    const { deviceID, serverHMACKey } = await ensureDevice();

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const sessionMessage = `${deviceID}:${timestamp}:${nonce}`;
    const sessionID = computeHMAC(serverHMACKey, sessionMessage);

    const account = buildCredentialPhone(areaCode, phoneNumber);
    const loginMessage = `login:${account}:${timestamp}:${nonce}`;
    const deviceSignature = computeHMAC(serverHMACKey, loginMessage);

    const payload = {
        areaCode,
        phoneNumber,
        password,
        platform: toPlatformId(PLATFORM),
        deviceID,
        sessionID,
        timestamp,
        nonce,
        deviceSignature,
        deviceInfo: DEVICE_INFO,
    };

    const { data } = await axios.post(
        `${BASE_URL}/account/password/login`,
        payload,
        {
            headers: {
                operationID: randomUUID(),
            },
        },
    );
    const auth = (data?.data ?? data) as {
        userID: string;
        sessionID: string;
        chatToken?: string;
    };

    console.log("Password login result:", auth);
    console.log("Login OK (password):", auth.userID, auth.sessionID);

    return {
        userID: auth.userID,
        sessionID: auth.sessionID,
    };
}

async function main() {
    try {
        console.log("=== Password registration (no OTP) ===");
        const reg = await passwordRegisterDemo();

        console.log("=== Password login (phone + password) ===");
        const auth = await passwordLoginDemo();

        console.log(
            "Demo complete. Registered user:",
            reg.userID,
            "Logged-in user:",
            auth.userID,
        );
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error("API Error:", err.response?.data ?? err.message);
        } else {
            throw err;
        }
    }
}

main();

