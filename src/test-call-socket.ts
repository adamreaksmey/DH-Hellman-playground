/**
 * Socket.IO call playground (Node.js / ts-node).
 *
 * Usage:
 * 1) Set PLAYGROUND_CONFIG (caller accessToken, callee_ids, type, mode).
 * 2) Optionally set calleeAccessToken + calleeAction to exercise accept/reject.
 * 3) Run `runCallsPlayground()`.
 *
 * Notes:
 * - Responses use `{ data: ... }` (responseSuccess).
 * - Namespace: `/calls` (see CALL_SOCKET_NAMESPACE).
 * - GET /calls/stream-token requires call_session_id — run POST /calls/initiate first.
 */

import { io, type Socket } from "socket.io-client";

type CallInitiateResponseData = {
  call_session_id: number;
  stream_token: string;
  callee_online: boolean;
};

type StreamTokenResponseData = {
  token: string;
};

type AcceptCallResponseData = {
  call_session_id: number;
  stream_call_cid: string;
  caller_id: number;
};

type RejectCallResponseData = {
  success: boolean;
};

const SOCKET_NAMESPACE = "/calls";

const PLACEHOLDER_ACCESS_TOKEN = "PASTE_ACCESS_TOKEN_HERE";
const PLACEHOLDER_CALLEE_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidXNlcm5hbWUiOiJhbHBoYS11c2VyLTAxIiwiZnVsbG5hbWUiOiJBbHBoYSIsInVzZXJfbnVtYmVyIjoyODE4MTM2OSwicm9sZSI6MSwidGVuYW50X2lkIjo2LCJwbGF0Zm9ybSI6MiwiZGV2aWNlX3VpZCI6IkRFVi0wMDEtWFlaIiwiaWF0IjoxNzc1NjMyMjAyLCJleHAiOjE3NzU2NTAyMDJ9.EmytCMyI56B9IA55PhRAnsUKTE809BJvnTeLeGw0gAI";

const CALL_SOCKET_EVENTS = [
  "incoming_call",
  "call_state",
  "call_accepted",
  "call_rejected",
  "call_active",
  "call_ended",
] as const;

const KEEP_SOCKET_OPEN_MS = 30_000;

const PLAYGROUND_CONFIG = {
  /** Origin for Socket.IO (no /api suffix). */
  serverOrigin: "http://localhost:4000",
  /** REST base path prefix used by this Nest app. */
  apiPrefix: "/api",
  /** JWT for the user placing the call (caller). */
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJqYXp6IiwiZnVsbG5hbWUiOiJuaWNrbmFtZSIsInVzZXJfbnVtYmVyIjo4MzMwNjQ0MSwicm9sZSI6MSwidGVuYW50X2lkIjo2LCJwbGF0Zm9ybSI6MSwiaWF0IjoxNzc1NjMzNzYzLCJleHAiOjE3NzU2NTE3NjN9.Xz5IvD91i921IEb58QDcCf-qP9qHrO6YSScoLgoy5oI',
  /** Callee user ids (1:1 private → exactly one). */
  callee_ids: [3] as number[],
  callType: "video" as "audio" | "video",
  callMode: "private" as "private" | "group",
  streamTokenValiditySeconds: 3600,
  /**
   * Optional: JWT for a callee participant — use with calleeAction to hit accept/reject routes.
   * Must match a user in callee_ids.
   */
  calleeAccessToken: PLACEHOLDER_CALLEE_ACCESS_TOKEN,
  calleeAction: "skip" as "skip" | "accept" | "reject",
};

function assertCallerConfig(): void {
  if (PLAYGROUND_CONFIG.accessToken === PLACEHOLDER_ACCESS_TOKEN) {
    throw new Error(
      "Set PLAYGROUND_CONFIG.accessToken (caller) before running.",
    );
  }
}

function buildStreamTokenPath(callSessionId: number): string {
  const validity = PLAYGROUND_CONFIG.streamTokenValiditySeconds;
  const params = new URLSearchParams({
    call_session_id: String(callSessionId),
    validity_seconds: String(validity),
  });
  return `/calls/stream-token?${params.toString()}`;
}

function buildApiUrl(path: string): string {
  return `${PLAYGROUND_CONFIG.serverOrigin}${PLAYGROUND_CONFIG.apiPrefix}${path}`;
}

function attachConnectionLifecycleLogs(socket: Socket, label: string): void {
  socket.on("connect", () => {
    console.log(`[calls socket ${label}] connected`, socket.id);
  });
  socket.on("disconnect", (reason: string) => {
    console.log(`[calls socket ${label}] disconnected`, reason);
  });
  socket.on("connect_error", (error: Error) => {
    console.log(`[calls socket ${label}] connect_error`, error.message);
  });
}

function attachCallEventListeners(socket: Socket, label: string): void {
  for (const eventName of CALL_SOCKET_EVENTS) {
    socket.on(eventName, (payload: unknown) => {
      console.log(`[calls socket ${label}] ${eventName}`, payload);
    });
  }
}

function connectCallSocket(accessToken: string, label: string): Socket {
  const socketUrl = `${PLAYGROUND_CONFIG.serverOrigin}${SOCKET_NAMESPACE}`;
  const socket = io(socketUrl, {
    transports: ["websocket"],
    auth: { token: accessToken },
    timeout: 10_000,
    forceNew: true,
  });
  attachConnectionLifecycleLogs(socket, label);
  socket.on("connect_error", (error: Error) => {
    if (error.message.includes("Invalid namespace")) {
      console.warn(
        "[calls socket] Invalid namespace. Make sure serverOrigin has no /api suffix.",
      );
    }
  });
  attachCallEventListeners(socket, label);
  return socket;
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseApiResponse<T>(response);
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data?: T; message?: string };
  if (!response.ok) {
    const message =
      payload.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (!payload.data) {
    throw new Error("API response has no data field.");
  }
  return payload.data;
}

function shouldRunCalleeFlow(): boolean {
  if (PLAYGROUND_CONFIG.calleeAction === "skip") {
    return false;
  }
  if (PLAYGROUND_CONFIG.calleeAccessToken === PLACEHOLDER_CALLEE_ACCESS_TOKEN) {
    console.warn(
      "[playground] calleeAction is not skip but calleeAccessToken is unset; skipping callee HTTP calls.",
    );
    return false;
  }
  return true;
}

async function runCalleeHttpAction(callSessionId: number): Promise<void> {
  const token = PLAYGROUND_CONFIG.calleeAccessToken;
  const action = PLAYGROUND_CONFIG.calleeAction;
  if (action === "accept") {
    const acceptResult = await apiPost<AcceptCallResponseData>(
      `/calls/${callSessionId}/accept`,
      {},
      token,
    );
    console.log("[api] accept result", acceptResult);
    return;
  }
  if (action === "reject") {
    const rejectResult = await apiPost<RejectCallResponseData>(
      `/calls/${callSessionId}/reject`,
      {},
      token,
    );
    console.log("[api] reject result", rejectResult);
  }
}

async function initiateOneToOneAndRefreshStreamToken(): Promise<CallInitiateResponseData> {
  const token = PLAYGROUND_CONFIG.accessToken;
  const initiateResult = await apiPost<CallInitiateResponseData>(
    "/calls/initiate",
    {
      callee_ids: PLAYGROUND_CONFIG.callee_ids,
      type: PLAYGROUND_CONFIG.callType,
      mode: PLAYGROUND_CONFIG.callMode,
    },
    token,
  );
  console.log("[api] initiate result", initiateResult);
  const streamTokenPath = buildStreamTokenPath(initiateResult.call_session_id);
  const streamToken = await apiGet<StreamTokenResponseData>(
    streamTokenPath,
    token,
  );
  console.log("[api] stream token (GET after initiate)", streamToken);
  return initiateResult;
}

function closeAllSockets(sockets: Socket[]): void {
  for (const socket of sockets) {
    socket.close();
  }
}

async function runCallsPlayground(): Promise<void> {
  assertCallerConfig();
  const openSockets: Socket[] = [];
  const callerSocket = connectCallSocket(
    PLAYGROUND_CONFIG.accessToken,
    "caller",
  );
  openSockets.push(callerSocket);

  const initiateResult = await initiateOneToOneAndRefreshStreamToken();

  if (shouldRunCalleeFlow()) {
    const calleeSocket = connectCallSocket(
      PLAYGROUND_CONFIG.calleeAccessToken,
      "callee",
    );
    openSockets.push(calleeSocket);
    await runCalleeHttpAction(initiateResult.call_session_id);
  }

  await new Promise((resolve) => setTimeout(resolve, KEEP_SOCKET_OPEN_MS));
  closeAllSockets(openSockets);
  console.log("[calls socket] closed open connections");
}

type PlaygroundGlobal = typeof globalThis & {
  runCallsPlayground?: () => Promise<void>;
};
(globalThis as PlaygroundGlobal).runCallsPlayground = runCallsPlayground;

runCallsPlayground();
