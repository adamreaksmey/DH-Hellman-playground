import './polyfill.js';
import axios from "axios";
import { RegistrationClient } from "./registration.js";

async function main() {
    const BASE_URL = 'http://localhost:8081';
    const DEVICE_INFO = 'MyApp/1.0 web';
    const PLATFORM = 'web' as const;
    const defaultOTPVerificationCode = '999999'
    const phoneNumber = '855123456781'
  
    const client = new RegistrationClient(BASE_URL, DEVICE_INFO, PLATFORM);
  
    try {
      // 1. Device Registration (do once per device)
      const deviceResp = await client.registerDevice('My Device');
      console.log('Device registered:', deviceResp);
  
      // // 2. Check user (optional)
      const checkResp = await client.checkUser(phoneNumber);
      console.log('User exists:', checkResp.exist, 'Login methods:', checkResp.loginMethod);
  
      // // 3. Request OTP
      await client.requestOTP(phoneNumber);
      console.log('OTP sent. Check your phone.');
  
      // // 4. User enters OTP (in real app, from input)
      const otp = structuredClone(defaultOTPVerificationCode); // Replace with actual OTP from user
  
      // // 5. Verify OTP
      const authResult = await client.verifyOTP(phoneNumber, otp);
      console.log('Logged in:', authResult.user.username, 'isNewUser:', authResult.user.isNewUser);
      console.log("show auth result: ", authResult);
  
      // // 6. If new user, setup profile
      if (authResult.user.isNewUser) {
        await client.setupProfile({
          username: 'johndoe2',
          password: 'SecurePass123!',
          displayName: 'John Doe',
          bio: 'Hello world',
        });
        console.log('Profile setup complete');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('API Error:', err.response?.data ?? err.message);
      } else {
        throw err;
      }
    }
  }

  main()