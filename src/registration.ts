import axios, { AxiosInstance } from "axios";
import {
  AuthResponse,
  CheckUserRequest,
  CheckUserResponse,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  LoginRequest,
  LoginResponse,
  ProfileSetupRequest,
  RegisterUserRequest,
  RegisterUserResponse,
  SendVerifyCodeRequest,
  SendVerifyCodeResponse,
} from "./interface.js";
import {
  base64Decode,
  base64Encode,
  computeHMAC,
  computeSharedSecret,
  deriveDeviceSecret,
  deriveServerHMACKey,
  generateX25519KeyPair,
} from "./crypto.js";
import { storage } from "./storage.js";
import { randomUUID } from "node:crypto";

/** Platform ID values used by messenger-business-service (openim protocol). */
const PLATFORM_IDS = {
  ios: 1,
  android: 2,
  windows: 3,
  macos: 4,
  web: 5,
  harmony: 6,
} as const;

/** usedFor: 1=register, 2=reset password, 3=login (messenger-business-service constant) */
export const VerificationCodeFor = {
  Register: 1,
  ResetPassword: 2,
  Login: 3,
} as const;

function toPlatformId(platform: string): number {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_IDS;
  return PLATFORM_IDS[key] ?? PLATFORM_IDS.web;
}

/**
 * Normalize areaCode to include leading '+' and build account string for OTP message.
 * Server uses verifyCodeJoin(areaCode, phoneNumber) => areaCode + " " + phoneNumber.
 */
function verifyCodeJoin(areaCode: string, phoneNumber: string): string {
  let code = areaCode.trim();
  if (code && !code.startsWith("+")) code = "+" + code;
  return code + " " + phoneNumber.trim();
}

export class RegistrationClient {
  private axios: AxiosInstance;
  private baseURL: string;
  private deviceInfo: string;
  private platform: string;

  // State (persist these securely - e.g. Keychain/Keystore)
  deviceID?: string;
  deviceSecret?: Uint8Array;
  serverHMACKey?: Uint8Array;
  sessionID?: string;

  constructor(baseURL: string, deviceInfo: string, platform: string) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.deviceInfo = deviceInfo;
    this.platform = platform;
    this.axios = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": deviceInfo,
        operationID: randomUUID(),
      },
      timeout: 15000,
    });
  }

  private get platformId(): number {
    return toPlatformId(this.platform);
  }

  // --------------------------------------------------------------------------
  // Step 1: Device Registration (required before any auth)
  // POST /device/register — matches messenger-business-service
  // --------------------------------------------------------------------------
  async registerDevice(
    deviceName?: string,
  ): Promise<DeviceRegistrationResponse> {
    const { publicKey, privateKey } = generateX25519KeyPair();
    // console.log("show public key", publicKey);
    // console.log("show private key", privateKey);
    const clientPublicKeyBase64 = base64Encode(publicKey);

    const payload: DeviceRegistrationRequest = {
      clientPublicKey: clientPublicKeyBase64,
      deviceInfo: this.deviceInfo,
      platform: toPlatformId(this.platform),
      deviceName: deviceName ?? "",
    };

    console.log("show payload", payload);

    const { data } = await this.axios.post<DeviceRegistrationResponse>(
      "/device/register",
      payload,
    );

    console.log("show register data", data);

    // Server sends the X25519 public key as base64 because JSON cannot safely carry raw binary.
    // Decode it back to the original 32-byte public key.
    const serverPubKeyBytes = base64Decode(data.data.serverPublicKey);

    // Perform X25519 Diffie–Hellman key exchange using our private key
    // and the server's public key to produce a shared secret.
    // Both client and server independently compute the same secret.
    const sharedSecret = computeSharedSecret(privateKey, serverPubKeyBytes);

    // Derive a device-specific secret from the shared secret.
    // deviceInfo is mixed in so the derived key is bound to this device.
    const deviceSecret = deriveDeviceSecret(sharedSecret, this.deviceInfo);

    // Derive the HMAC signing key used for authenticated requests
    // between the client and server after device registration.
    const serverHMACKey = deriveServerHMACKey(deviceSecret);

    this.deviceID = data.data.deviceID;
    this.deviceSecret = deviceSecret;
    this.serverHMACKey = serverHMACKey;

    storage.setItem("device_secret", base64Encode(this.deviceSecret));
    storage.setItem("device_id", this.deviceID);

    return data;
  }

  // --------------------------------------------------------------------------
  // Step 2: Check User — POST /account/check
  // Body: { user: { areaCode?, phoneNumber? } } or { user: { email? } }
  // --------------------------------------------------------------------------
  async checkUser(options: {
    areaCode?: string;
    phoneNumber?: string;
    email?: string;
  }): Promise<CheckUserResponse> {
    const user: CheckUserRequest["user"] = {};
    if (options.areaCode != null) user.areaCode = options.areaCode;
    if (options.phoneNumber != null) user.phoneNumber = options.phoneNumber;
    if (options.email != null) user.email = options.email;
    const { data } = await this.axios.post<CheckUserResponse>(
      "/account/check",
      {
        user,
      },
    );
    return data;
  }

  // --------------------------------------------------------------------------
  // Step 3: Send verification code — POST /account/code/send
  // usedFor: 1=register, 2=reset password, 3=login
  // --------------------------------------------------------------------------
  async sendVerifyCode(
    usedFor: 1 | 2 | 3,
    options: {
      areaCode?: string;
      phoneNumber?: string;
      email?: string;
      invitationCode?: string;
    },
  ): Promise<SendVerifyCodeResponse> {
    if (!this.deviceID) {
      throw new Error(
        "Device must be registered first. Call registerDevice().",
      );
    }
    const payload: SendVerifyCodeRequest = {
      usedFor,
      deviceID: this.deviceID,
      platform: this.platformId,
      ...(options.areaCode != null && { areaCode: options.areaCode }),
      ...(options.phoneNumber != null && { phoneNumber: options.phoneNumber }),
      ...(options.email != null && { email: options.email }),
      ...(options.invitationCode != null && {
        invitationCode: options.invitationCode,
      }),
    };
    const { data } = await this.axios.post<SendVerifyCodeResponse>(
      "/account/code/send",
      payload,
    );
    return data ?? {};
  }

  // --------------------------------------------------------------------------
  // Step 4: Login (OTP or password) — POST /account/login
  // Session ID = HMAC(serverHMACKey, "deviceID:timestamp:nonce") — no lowercase
  // OTP: deviceSignature = HMAC(serverHMACKey, "otp-verify:account:timestamp:nonce")
  //      account = areaCode + " " + phoneNumber (areaCode with +) or email
  // --------------------------------------------------------------------------
  async loginWithOTP(
    areaCode: string,
    phoneNumber: string,
    verifyCode: string,
  ): Promise<AuthResponse>;
  async loginWithOTP(email: string, verifyCode: string): Promise<AuthResponse>;
  async loginWithOTP(
    areaCodeOrEmail: string,
    phoneNumberOrVerifyCode: string,
    verifyCodeOptional?: string,
  ): Promise<AuthResponse> {
    if (!this.deviceID || !this.serverHMACKey) {
      throw new Error(
        "Device must be registered first. Call registerDevice().",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();

    const sessionMessage = `${this.deviceID}:${timestamp}:${nonce}`;
    const sessionID = computeHMAC(this.serverHMACKey, sessionMessage);

    let account: string;
    let areaCode = "";
    let phoneNumber = "";
    let email = "";
    const isPhone = verifyCodeOptional !== undefined;
    if (isPhone) {
      areaCode = areaCodeOrEmail;
      phoneNumber = phoneNumberOrVerifyCode;
      account = verifyCodeJoin(areaCode, phoneNumber);
    } else {
      email = areaCodeOrEmail;
      account = email;
    }
    const verifyCode = isPhone ? verifyCodeOptional! : phoneNumberOrVerifyCode;

    const signatureMessage = `otp-verify:${account}:${timestamp}:${nonce}`;
    const deviceSignature = computeHMAC(this.serverHMACKey, signatureMessage);

    const payload: LoginRequest = {
      ...(email ? { email } : { areaCode, phoneNumber }),
      verifyCode,
      platform: this.platformId,
      deviceID: this.deviceID,
      sessionID,
      timestamp,
      nonce,
      deviceSignature,
      deviceInfo: this.deviceInfo,
    };

    const { data } = await this.axios.post<LoginResponse>(
      "/account/login",
      payload,
    );

    console.log("show login data", data);

    this.sessionID = data.sessionID;
    return {
      sessionID: data.sessionID,
      userID: data.userID,
    };
  }

  /** Alias for loginWithOTP(areaCode, phoneNumber, verifyCode). */
  async verifyOTP(
    areaCode: string,
    phoneNumber: string,
    otp: string,
  ): Promise<AuthResponse> {
    return this.loginWithOTP(areaCode, phoneNumber, otp);
  }

  // --------------------------------------------------------------------------
  // Step 4b: Register user — POST /account/register (creates the user)
  // HMAC:
  // - sessionID = HMAC(serverHMACKey, "deviceID:timestamp:nonce")
  // - deviceSignature = HMAC(serverHMACKey, "register:{account}:{timestamp}:{nonce}")
  //   where account = areaCode + " " + phoneNumber OR email (same as server)
  // --------------------------------------------------------------------------
  async registerUser(options: {
    verifyCode: string;
    invitationCode?: string;
    autoLogin?: boolean;
    user: {
      nickname?: string;
      faceURL?: string;
      birth?: number;
      gender?: number;
      areaCode?: string;
      phoneNumber?: string;
      email?: string;
      account?: string;
      password?: string;
    };
  }): Promise<RegisterUserResponse> {
    if (!this.deviceID || !this.serverHMACKey) {
      throw new Error(
        "Device must be registered first. Call registerDevice().",
      );
    }
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();

    const sessionMessage = `${this.deviceID}:${timestamp}:${nonce}`;
    const sessionID = computeHMAC(this.serverHMACKey, sessionMessage);

    const registerAccount =
      options.user.email && options.user.email.trim() !== ""
        ? options.user.email.trim()
        : verifyCodeJoin(
            options.user.areaCode ?? "",
            options.user.phoneNumber ?? "",
          );

    const registerMessage = `register:${registerAccount}:${timestamp}:${nonce}`;
    const deviceSignature = computeHMAC(this.serverHMACKey, registerMessage);

    const payload: RegisterUserRequest = {
      ...(options.invitationCode
        ? { invitationCode: options.invitationCode }
        : {}),
      verifyCode: options.verifyCode,
      deviceID: this.deviceID,
      platform: this.platformId,
      autoLogin: options.autoLogin ?? false,
      user: {
        nickname: options.user.nickname,
        faceURL: options.user.faceURL,
        birth: options.user.birth,
        gender: options.user.gender,
        areaCode: options.user.areaCode,
        phoneNumber: options.user.phoneNumber,
        email: options.user.email,
        account: options.user.account,
        password: options.user.password,
      },
      sessionID,
      timestamp,
      nonce,
      deviceSignature,
    };

    console.log("show payload", payload)

    const { data } = await this.axios.post("/account/register", payload);

    // Some deployments wrap responses as { errCode, errMsg, data }.
    const unwrapped: RegisterUserResponse = (data?.data ??
      data) as RegisterUserResponse;

    if (unwrapped?.sessionID) {
      this.sessionID = unwrapped.sessionID;
    } else {
      // Chat RPC always returns sessionID for end-user register; keep our derived one as fallback.
      this.sessionID = sessionID;
    }

    return unwrapped;
  }

  // --------------------------------------------------------------------------
  // Step 5: Update profile (HMAC protected) — POST /user/update
  // Signature: HMAC(serverHMACKey, "sessionID:POST:/user/update:<body>:timestamp:nonce")
  // --------------------------------------------------------------------------
  async updateUserInfo(profile: ProfileSetupRequest): Promise<unknown> {
    if (!this.sessionID || !this.serverHMACKey) {
      throw new Error(
        "Must be logged in. Call loginWithOTP() or verifyOTP() first.",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const path = "/user/update";
    const body = JSON.stringify(profile);
    const message = `${this.sessionID}:POST:${path}:${body}:${timestamp}:${nonce}`;
    const signature = computeHMAC(this.serverHMACKey, message);

    const headers = {
      Authorization: `Session ${this.sessionID}`,
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
    };

    const { data } = await this.axios.post("/user/update", profile, {
      headers,
    });
    return data;
  }

  // --------------------------------------------------------------------------
  // Step 6: Get current user info — POST /user/me
  // Signature: HMAC(serverHMACKey, "sessionID:POST:/user/me:<body>:timestamp:nonce")
  // --------------------------------------------------------------------------
  async getCurrentUserInfo(): Promise<unknown> {
    if (!this.sessionID || !this.serverHMACKey) {
      throw new Error(
        "Must be logged in. Call loginWithOTP() or verifyOTP() first.",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const path = "/user/me";
    const body = JSON.stringify({});
    const message = `${this.sessionID}:POST:${path}:${body}:${timestamp}:${nonce}`;
    const signature = computeHMAC(this.serverHMACKey, message);

    const headers = {
      Authorization: `Session ${this.sessionID}`,
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
    };

    const { data } = await this.axios.post(path, body, {
      headers,
    });
    return data;
  }

  /** Legacy alias: setupProfile -> updateUserInfo (field names match UpdateUserInfoReq). */
  async setupProfile(profile: ProfileSetupRequest): Promise<unknown> {
    return this.updateUserInfo(profile);
  }

  // --------------------------------------------------------------------------
  // Logout — POST /account/logout (HMAC protected)
  // Body: LogoutReq { sessionID?, all? }. If all is false/omitted, server uses session from context.
  // --------------------------------------------------------------------------
  async logout(options?: { all?: boolean }): Promise<unknown> {
    if (!this.sessionID || !this.serverHMACKey) {
      throw new Error(
        "Must be logged in. Call loginWithOTP() or registerUser() first.",
      );
    }

    const path = "/account/logout";
    const bodyObj = options?.all === true ? { all: true } : {};
    const body = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const message = `${this.sessionID}:POST:${path}:${body}:${timestamp}:${nonce}`;
    const signature = computeHMAC(this.serverHMACKey, message);

    const headers = {
      Authorization: `Session ${this.sessionID}`,
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
    };

    console.log("show bodyObj", bodyObj);
    console.log("show headers", headers)

    const { data } = await this.axios.post(path, bodyObj, { headers });
    console.log("show the data", data)
    return data;
  }

  // --------------------------------------------------------------------------
  // Convenience: full registration flow (send code -> login with OTP -> optional profile)
  // --------------------------------------------------------------------------
  async fullRegistrationFlow(
    areaCode: string,
    phoneNumber: string,
    otp: string,
    profile?: ProfileSetupRequest,
  ): Promise<AuthResponse> {
    await this.sendVerifyCode(VerificationCodeFor.Register, {
      areaCode,
      phoneNumber,
    });
    const reg = await this.registerUser({
      verifyCode: otp,
      user: {
        areaCode,
        phoneNumber,
      },
      autoLogin: false,
    });

    if (profile) {
      await this.updateUserInfo(profile);
    }

    return {
      sessionID: reg.sessionID ?? this.sessionID ?? "",
      userID: reg.userID,
    };
  }
}
