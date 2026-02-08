export interface DeviceRegistrationRequest {
    clientPublicKey: string;
    deviceInfo: string;
    platform: 'ios' | 'android' | 'web';
    deviceName?: string;
}

export interface DeviceRegistrationResponse {
    deviceId: string;
    serverPublicKey: string;
}

export interface CheckUserRequest {
    identifier: string;
}

export interface CheckUserResponse {
    exist: boolean;
    hasPassword: boolean;
    loginMethod: string[];
}

export interface OTPRequest {
    phoneNumber: string;
}

export interface OTPResponse {
    message: string;
    expiresIn: number;
}

export interface VerifyOTPRequest {
    phoneNumber: string;
    otp: string;
    deviceId: string;
}

export interface AuthResponse {
    sessionId: string;
    user: {
        userId: string;
        username: string;
        phoneNumber: string;
        displayName?: string;
        avatarUrl?: string;
        isNewUser: boolean;
        isGuest: boolean;
        hasPassword: boolean;
        bio?: string;
    };
}

export interface ProfileSetupRequest {
    username?: string;
    password?: string;
    displayName?: string;
    bio?: string;
}