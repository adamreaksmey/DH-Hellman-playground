/** Matches messenger-business-service RegisterDeviceReq / device.go */
export interface DeviceRegistrationRequest {
  clientPublicKey: string;
  deviceInfo: string;
  platform: string; // e.g. 'ios' | 'android' | 'web'; server accepts string, may map to platform ID
  deviceName?: string;
}

/** Matches messenger-business-service RegisterDeviceResponse (JSON: deviceID, serverPublicKey) */
export interface DeviceRegistrationResponse {
  errCode: number;
  errMsg: string;
  errDlt: string;
  data: {
    deviceID: string;
    serverPublicKey: string;
  };
}

/** CheckUserExistReq: body has user (RegisterUserInfo with areaCode, phoneNumber, or email) */
export interface CheckUserRequest {
  user: {
    areaCode?: string;
    phoneNumber?: string;
    email?: string;
  };
}

/** CheckUserExistResp: userid, isRegistered */
export interface CheckUserResponse {
    errCode: 0,
    errMsg: '',
    errDlt: '',
    data: { userid: '', isRegistered: false }
  }

/** SendVerifyCodeReq: usedFor (1=register, 2=reset pwd, 3=login), deviceID, platform (int32), areaCode, phoneNumber, or email */
export interface SendVerifyCodeRequest {
  usedFor: number;
  deviceID?: string;
  platform: number;
  areaCode?: string;
  phoneNumber?: string;
  email?: string;
  invitationCode?: string;
}

/** SendVerifyCodeResp is empty */
export interface SendVerifyCodeResponse {
  // empty
}

/** RegisterUserReq (HTTP /account/register): verifyCode + user + HMAC fields */
export interface RegisterUserRequest {
    invitationCode?: string;
    verifyCode: string;
    deviceID: string;
    platform: number;
    autoLogin?: boolean;
    user: {
        userID?: string;
        nickname?: string;
        faceURL?: string;
        birth?: number; // unix ms
        gender?: number;
        areaCode?: string;
        phoneNumber?: string;
        email?: string;
        account?: string;
        password?: string;
        RegisterType?: number;
    };
    sessionID: string;
    timestamp: string;
    nonce: string;
    deviceSignature: string;
}

/** /account/register response is apistruct.UserRegisterResp */
export interface RegisterUserResponse {
    imToken?: string;
    chatToken?: string;
    sessionID?: string;
    userID: string;
}

/** LoginReq for OTP login: areaCode, phoneNumber, verifyCode, deviceID, sessionID, timestamp, nonce, deviceSignature, deviceInfo, platform, ip */
export interface LoginRequest {
  areaCode?: string;
  phoneNumber?: string;
  verifyCode?: string;
  account?: string;
  password?: string;
  platform: number;
  deviceID: string;
  ip?: string;
  email?: string;
  sessionID: string;
  timestamp: string;
  nonce: string;
  deviceSignature: string;
  deviceInfo?: string;
}

/** LoginResp: sessionID, userID (chatToken deprecated for HMAC) */
export interface LoginResponse {
  sessionID: string;
  userID: string;
}

export interface AuthResponse {
  sessionID: string;
  userID: string;
  user?: {
    userID: string;
    username?: string;
    phoneNumber?: string;
    displayName?: string;
    avatarUrl?: string;
    isNewUser?: boolean;
    isGuest?: boolean;
    hasPassword?: boolean;
    bio?: string;
  };
}

/** UpdateUserInfoReq: optional fields (server sets userID from HMAC context) */
export interface ProfileSetupRequest {
  nickname?: string;
  faceURL?: string;
  account?: string;
  phoneNumber?: string;
  areaCode?: string;
  email?: string;
  gender?: number;
  birth?: number;
}
