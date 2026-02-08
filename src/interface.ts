interface DeviceRegistrationRequest {
    clientPublicKey: string;
    deviceInfo: string;
    platform: 'ios' | 'android' | 'web';
    deviceName?: string;
}

interface DeviceRegistrationResponse {
    deviceId: string;
    serverPublicKey: string;
}

interface CheckUserRequest {
    identifier: string;
}

interface CheckUserResponse {
    exist: boolean;
    hasPassword: boolean;
    loginMethod: string[];
}

interface OTPRequest {
    phoneNumber: string;
}

interface OTPResponse {
    message: string;
    expiresIn: number;
}

interface VerifyOTPRequest {
    phoneNumber: string;
    otp: string;
    deviceId: string;
}

interface AuthResponse {
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

interface ProfileSetupRequest {
    username?: string;
    password?: string;
    displayName?: string;
    bio?: string;
}