import './polyfill.js';
import axios from "axios";
import { RegistrationClient } from "./registration.js";

async function main() {
    const BASE_URL = 'http://localhost:8081';
    const DEVICE_INFO = 'MyApp/1.0 web';
    const PLATFORM = 'web' as const;
  
    const client = new RegistrationClient(BASE_URL, DEVICE_INFO, PLATFORM);
  
    try {
      // 1. Device Registration (do once per device)
      const deviceResp = await client.registerDevice('My Device');
      console.log('Device registered:', deviceResp.deviceId);
  
      // // 2. Check user (optional)
      // const checkResp = await client.checkUser('855123456789');
      // console.log('User exists:', checkResp.exist, 'Login methods:', checkResp.loginMethod);
  
      // // 3. Request OTP
      // await client.requestOTP('855123456789');
      // console.log('OTP sent. Check your phone.');
  
      // // 4. User enters OTP (in real app, from input)
      // const otp = '123456'; // Replace with actual OTP from user
  
      // // 5. Verify OTP
      // const authResult = await client.verifyOTP('855123456789', otp);
      // console.log('Logged in:', authResult.user.username, 'isNewUser:', authResult.user.isNewUser);
  
      // // 6. If new user, setup profile
      // if (authResult.user.isNewUser) {
      //   await client.setupProfile({
      //     username: 'johndoe',
      //     password: 'SecurePass123!',
      //     displayName: 'John Doe',
      //     bio: 'Hello world',
      //   });
      //   console.log('Profile setup complete');
      // }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('API Error:', err.response?.data ?? err.message);
      } else {
        throw err;
      }
    }
  }

  main()