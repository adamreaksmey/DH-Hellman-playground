import axios, { AxiosInstance } from "axios";
import { AuthResponse, CheckUserRequest, CheckUserResponse, DeviceRegistrationRequest, DeviceRegistrationResponse, OTPRequest, OTPResponse, ProfileSetupRequest, VerifyOTPRequest } from "./interface.js";
import { base64Decode, base64Encode, computeHMAC, computeSharedSecret, deriveDeviceSecret, deriveServerHMACKey, generateX25519KeyPair } from "./crypto.js";

export class RegistrationClient {
    private axios: AxiosInstance;
    private baseURL: string;
    private deviceInfo: string;
    private platform: 'ios' | 'android' | 'web';

    // State (persist these securely - e.g. Keychain/Keystore)
    deviceId?: string;
    deviceSecret?: Uint8Array;
    serverHMACKey?: Uint8Array;
    sessionId?: string;

    constructor(baseURL: string, deviceInfo: string, platform: 'ios' | 'android' | 'web') {
        this.baseURL = baseURL.replace(/\/$/, '');
        this.deviceInfo = deviceInfo;
        this.platform = platform;
        this.axios = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': deviceInfo,
            },
            timeout: 15000,
        });
    }

    // --------------------------------------------------------------------------
    // Step 1: Device Registration (required before any auth)
    // --------------------------------------------------------------------------
    async registerDevice(deviceName?: string): Promise<DeviceRegistrationResponse> {
        const { publicKey, privateKey } = generateX25519KeyPair();
        const clientPublicKeyBase64 = base64Encode(publicKey);

        const payload: DeviceRegistrationRequest = {
            clientPublicKey: clientPublicKeyBase64,
            deviceInfo: this.deviceInfo,
            platform: this.platform,
            deviceName: deviceName ?? '',
        };

        const { data } = await this.axios.post<DeviceRegistrationResponse>(
            '/api/v1/device/register',
            payload
        );

        // Derive shared secret and keys
        const serverPubKeyBytes = base64Decode(data.serverPublicKey);
        const sharedSecret = computeSharedSecret(privateKey, serverPubKeyBytes);
        const deviceSecret = deriveDeviceSecret(sharedSecret, this.deviceInfo);
        const serverHMACKey = deriveServerHMACKey(deviceSecret);

        this.deviceId = data.deviceId;
        this.deviceSecret = deviceSecret;
        this.serverHMACKey = serverHMACKey;

        return data;
    }

    // --------------------------------------------------------------------------
    // Step 2: Check User (optional - to see if user exists and login methods)
    // --------------------------------------------------------------------------
    async checkUser(identifier: string): Promise<CheckUserResponse> {
        const { data } = await this.axios.post<CheckUserResponse>('/api/v1/auth/check', {
            identifier,
        } as CheckUserRequest);
        return data;
    }

    // --------------------------------------------------------------------------
    // Step 3: Request OTP
    // --------------------------------------------------------------------------
    async requestOTP(phoneNumber: string): Promise<OTPResponse> {
        const { data } = await this.axios.post<OTPResponse>('/api/v1/auth/otp/send', {
            phoneNumber,
        } as OTPRequest);
        return data;
    }

    // --------------------------------------------------------------------------
    // Step 4: Verify OTP (requires session ID + HMAC headers)
    // --------------------------------------------------------------------------
    async verifyOTP(phoneNumber: string, otp: string): Promise<AuthResponse> {
        if (!this.deviceId || !this.serverHMACKey) {
            throw new Error('Device must be registered first. Call registerDevice().');
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomUUID();

        // Session ID: HMAC(serverHMACKey, "{deviceId}:{timestamp}:{nonce}")
        const sessionMessage = `${this.deviceId.toLowerCase()}:${timestamp}:${nonce}`;
        const sessionId = computeHMAC(this.serverHMACKey, sessionMessage);

        // X-Signature: HMAC(serverHMACKey, "otp-verify:{phoneNumber}:{timestamp}:{nonce}")
        const signatureMessage = `otp-verify:${phoneNumber}:${timestamp}:${nonce}`;
        const signature = computeHMAC(this.serverHMACKey, signatureMessage);

        const payload: VerifyOTPRequest = {
            phoneNumber,
            otp,
            deviceId: this.deviceId,
        };

        const { data } = await this.axios.post<AuthResponse>('/api/v1/auth/otp/verify', payload, {
            headers: {
                Authorization: `Session ${sessionId}`,
                'X-Signature': signature,
                'X-Timestamp': timestamp,
                'X-Nonce': nonce,
            },
        });

        this.sessionId = data.sessionId;
        return data;
    }

    // --------------------------------------------------------------------------
    // Step 5: Setup Profile (for new users - HMAC protected)
    // --------------------------------------------------------------------------
    async setupProfile(profile: ProfileSetupRequest): Promise<{ message: string; user: AuthResponse['user'] }> {
        if (!this.sessionId || !this.serverHMACKey) {
            throw new Error('Must be logged in. Call verifyOTP() first.');
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomUUID();
        const body = JSON.stringify(profile);
        const path = '/api/v1/user/profile/setup';

        const message = `${this.sessionId}:POST:${path}:${body}:${timestamp}:${nonce}`;
        const signature = computeHMAC(this.serverHMACKey, message);

        const { data } = await this.axios.post('/api/v1/user/profile/setup', profile, {
            headers: {
                Authorization: `Session ${this.sessionId}`,
                'X-Signature': signature,
                'X-Timestamp': timestamp,
                'X-Nonce': nonce,
            },
        });

        return data;
    }

    // --------------------------------------------------------------------------
    // Convenience: Full registration flow
    // --------------------------------------------------------------------------
    async fullRegistrationFlow(
        phoneNumber: string,
        otp: string,
        profile?: ProfileSetupRequest
    ): Promise<AuthResponse> {
        const authResult = await this.verifyOTP(phoneNumber, otp);

        if (authResult.user.isNewUser && profile) {
            await this.setupProfile(profile);
        }

        return authResult;
    }
}