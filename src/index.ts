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
    const phoneNumber = "123216721";

    const client = new RegistrationClient(BASE_URL, DEVICE_INFO, PLATFORM);

    try {
        // 1. Device registration — POST /device/register (matches messenger-business-service)
        const deviceResp = await client.registerDevice("My Device");
        console.log("Device registered:", deviceResp);

        // 2. Check user — POST /account/check with { user: { areaCode, phoneNumber } }
        const checkResp = await client.checkUser({ areaCode, phoneNumber });

        console.log("checheckRespck", checkResp)
        console.log(
            "User exists:",
            checkResp.data.isRegistered,
            "userid:",
            checkResp.data.userid
        );

        // 3. Send verification code for REGISTRATION — POST /account/code/send
        // NOTE: using usedFor=Login will reject unregistered phones/emails.
        await client.sendVerifyCode(VerificationCodeFor.Register, {
            areaCode,
            phoneNumber,
        });
        console.log("OTP sent. Check your phone.");

        // 4. Register user — POST /account/register (creates the user; returns sessionID)
        const otp = defaultOTPVerificationCode;
        const reg = await client.registerUser({
            verifyCode: otp,
            autoLogin: false,
            user: {
                areaCode,
                phoneNumber,
                nickname: "John Doe",
                password: "SecurePass123!",
            },
        });

        console.log("show register result", reg);
        console.log("Registered:", reg.userID, "sessionID:", reg.sessionID);

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
