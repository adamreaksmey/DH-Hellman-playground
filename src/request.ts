import axios from "axios"

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

export function requestLog(body: LoginRequestBody) {
    return axios.post(`${BASE_URL}/login`, body)
}