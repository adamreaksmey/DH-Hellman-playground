import "./polyfill.js";
import axios from "axios";
import {
    RegistrationClient,
    VerificationCodeFor,
} from "./registration.js";

async function main() {
    const BASE_URL = "http://localhost:10008";
    const DEVICE_INFO = "MyApp/1.0 web";
    const PLATFORM = "web";
    const defaultOTPVerificationCode = "999999";
    const areaCode = "+855";
    const phoneNumber = "123456781";

    const client = new RegistrationClient(BASE_URL, DEVICE_INFO, PLATFORM);

    try {
        // 1. Device registration — POST /device/register (matches messenger-business-service)
        const deviceResp = await client.registerDevice("My Device");
        console.log("Device registered:", deviceResp);

        // 2. Check user — POST /account/check with { user: { areaCode, phoneNumber } }
        const checkResp = await client.checkUser({ areaCode, phoneNumber });
        console.log(
            "User exists:",
            checkResp.isRegistered,
            "userid:",
            checkResp.userid
        );

        // 3. Send verification code — POST /account/code/send
        await client.sendVerifyCode(VerificationCodeFor.Login, {
            areaCode,
            phoneNumber,
        });
        console.log("OTP sent. Check your phone.");

        // 4. Login with OTP — POST /account/login (HMAC sessionID + deviceSignature)
        const otp = defaultOTPVerificationCode;
        const authResult = await client.verifyOTP(areaCode, phoneNumber, otp);
        console.log("Logged in:", authResult.userID, "sessionID:", authResult.sessionID);

        // 5. Update profile (HMAC protected) — POST /user/update
        await client.updateUserInfo({
            nickname: "John Doe",
            faceURL: "",
        });
        console.log("Profile update complete");
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(
                "API Error:",
                err.response?.data ?? err.message
            );
        } else {
            throw err;
        }
    }
}

async function login() {
    const BASE_URL = "http://localhost:10008";
    const client = new RegistrationClient(
        BASE_URL,
        "MyApp/1.0 web",
        "web"
    );
    await client.registerDevice();
    const auth = await client.loginWithOTP("+855", "123456781", "999999");
    console.log("Login OK:", auth.userID, auth.sessionID);
}

main();
