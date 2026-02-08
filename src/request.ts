import axios from "axios"
import { storage } from "./storage.js"

const BASE_URL = "http://localhost:3000"
type LoginRequestBody = {
    username: string
    password: string
    device_id: string
    timestamp: string
    nonce: string
    session_id: string
    device_signature: string
    device_info: string
    ip_address: string
}

export async function requestLog(body: LoginRequestBody) {
    const data = await axios.post(`${BASE_URL}/login`, body)

    if (data.status !== 200) {
        throw new Error(`Failed to login: ${data.statusText}`)
    }

    storage.setItem('session_id', data.data.session_id);
    storage.setItem('user_id', data.data.user.user_id);

    return data;
}