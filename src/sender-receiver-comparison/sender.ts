/**
 * Simple AppGateway WS test client.
 *
 * Usage:
 *   # Receiver (terminal 1)
 *   APPGATEWAY_URL=ws://127.0.0.1:10011/ws \
 *   APPGATEWAY_MODE=recv \
 *   APPGATEWAY_TOKEN=<receiver_token> \
 *   APPGATEWAY_EXPECT_TEXT=<expected_text_fragment> \
 *   npm run new-gateway
 *
 *   # Sender (terminal 2)
 *   APPGATEWAY_URL=ws://127.0.0.1:10011/ws \
 *   APPGATEWAY_MODE=send \
 *   APPGATEWAY_TOKEN=<sender_token> \
 *   APPGATEWAY_RECV_ID=<receiver_user_id> \
 *   APPGATEWAY_TEXT=<text_to_send> \
 *   npm run new-gateway
 *
 * Group chat usage:
 *   APPGATEWAY_URL=ws://127.0.0.1:10011/ws \
 *   APPGATEWAY_TOKEN=<user_token> \
 *   APPGATEWAY_GROUP_ID=<target_group_id> \
 *   APPGATEWAY_SESSION_TYPE=3 \
 *   npm run new-gateway
 *
 * Optional:
 *   APPGATEWAY_MODE=send|recv   (default: send)
 *   APPGATEWAY_CONTENT_TYPE=101
 *   APPGATEWAY_SESSION_TYPE=1
 *   APPGATEWAY_PING_MS=30000   (default 30s; keep below server readTimeout, e.g. 60s)
 *   APPGATEWAY_EXPECT_TEXT=... (receiver mode match condition; optional)
 *   APPGATEWAY_TEXT=...        (sender mode outgoing text; optional)
 *   APPGATEWAY_EXIT_ON_MATCH=true|false (receiver exits when matched; default: true)
 */

import { RegisterUserResponse } from "../interface.js";
import { storage } from "../storage.js";

type Envelope = {
  event: string;
  id?: string;
  data?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

const userInfo = JSON.parse(
  storage.getItem("userInfo") ?? "{}"
) as RegisterUserResponse;

const CONFIG = {
  wsURL: process.env.APPGATEWAY_URL ?? "ws://127.0.0.1:10011/ws",
  mode: process.env.APPGATEWAY_MODE ?? "send",
  token: process.env.APPGATEWAY_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySUQiOiIxOTk4OTI3MzE3IiwiUGxhdGZvcm1JRCI6NSwiZXhwIjoxNzgyMjA0NzEzLCJpYXQiOjE3NzQ0Mjg3MDh9.Z5ERB1mFHdpUhTH-snxgIq2AWa2dhVjQqEUW59jgVJU',
  recvID: process.env.APPGATEWAY_RECV_ID ?? '3665600382',
  groupID: process.env.APPGATEWAY_GROUP_ID ?? "",
  sessionType: Number(process.env.APPGATEWAY_SESSION_TYPE ?? "1"),
  contentType: Number(process.env.APPGATEWAY_CONTENT_TYPE ?? "101"),
  text:
    process.env.APPGATEWAY_TEXT ??
    `hello from scripts/appgateway_ws_test.ts @ ${new Date().toISOString()}`,
  expectText: process.env.APPGATEWAY_EXPECT_TEXT ?? "",
  exitOnMatch: (process.env.APPGATEWAY_EXIT_ON_MATCH ?? "true") !== "false",
  /** Application ping interval; must stay under server appGateway.readTimeout (default 60s). */
  pingMs: Number(process.env.APPGATEWAY_PING_MS ?? "30000"),
};

console.log("auth token len:", CONFIG.token.length);
console.log("auth token head:", CONFIG.token.slice(0, 20));

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

if (!CONFIG.token) {
  console.error("APPGATEWAY_TOKEN is required");
  process.exit(1);
}

if (CONFIG.mode !== "send" && CONFIG.mode !== "recv") {
  console.error('APPGATEWAY_MODE must be "send" or "recv"');
  process.exit(1);
}

if (CONFIG.mode === "send" && !CONFIG.recvID && !CONFIG.groupID) {
  console.error("Either APPGATEWAY_RECV_ID or APPGATEWAY_GROUP_ID is required");
  process.exit(1);
}

type TestWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
};

async function resolveWebSocketCtor(): Promise<new (url: string) => TestWebSocket> {
  if (typeof WebSocket !== "undefined") {
    return WebSocket as unknown as new (url: string) => TestWebSocket;
  }

  try {
    const wsModule = await import("ws");
    return wsModule.WebSocket as unknown as new (url: string) => TestWebSocket;
  } catch {
    console.error(
      "WebSocket is unavailable. Use Node.js 22+ or install dependency: npm i ws",
    );
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/*                                WS Helpers                                  */
/* -------------------------------------------------------------------------- */

const WebSocketCtor = await resolveWebSocketCtor();
const ws = new WebSocketCtor(CONFIG.wsURL);

function send(event: string, data?: unknown) {
  const envelope: Envelope = {
    event,
    id: `${event}-${Date.now()}`,
    data,
  };
  ws.send(JSON.stringify(envelope));
}

/** WebSocket.OPEN */
const WS_OPEN = 1;

let pingInterval: ReturnType<typeof setInterval> | undefined;

function startAppPing() {
  if (pingInterval !== undefined) return;
  const ms = Number.isFinite(CONFIG.pingMs) && CONFIG.pingMs > 0 ? CONFIG.pingMs : 30_000;
  pingInterval = setInterval(() => {
    if (ws.readyState !== WS_OPEN) return;
    send("ping", {});
  }, ms);
  console.log(`[ping] application heartbeat every ${ms}ms`);
}

function stopAppPing() {
  if (pingInterval !== undefined) {
    clearInterval(pingInterval);
    pingInterval = undefined;
  }
}

function buildSendMessage() {
  const base = {
    sessionType: CONFIG.sessionType,
    contentType: CONFIG.contentType,
    content: {
      text: CONFIG.text,
    },
  };

  return CONFIG.groupID
    ? { ...base, groupID: CONFIG.groupID }
    : { ...base, recvID: CONFIG.recvID };
}

function extractTextFromMessageNew(msg: Envelope): string {
  const data = msg.data as
    | {
        message?: {
          content?: unknown;
        };
      }
    | undefined;
  const content = data?.message?.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return "";
}

/* -------------------------------------------------------------------------- */
/*                               WS Handlers                                  */
/* -------------------------------------------------------------------------- */

ws.onopen = () => {
  console.log(`[open] connected: ${CONFIG.wsURL}`);
  send("auth", { token: CONFIG.token });
};

ws.onmessage = (event) => {
  const raw = String(event.data);

  let msg: Envelope;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.log("[recv/non-json]", raw);
    return;
  }

  console.log("[recv]", JSON.stringify(msg));

  switch (msg.event) {
    case "auth_ok":
      startAppPing();
      if (CONFIG.mode === "send") {
        console.log("[mode] sender: sending message now");
        send("send_message", buildSendMessage());
      } else {
        console.log("[mode] receiver: waiting for message_new...");
      }
      break;

    case "auth_refreshed":
      // keep ping running; token was rotated server-side
      break;

    case "message_ack":
      console.log("[ok] message acknowledged, waiting for push events...");
      break;

    case "message_new": {
      const text = extractTextFromMessageNew(msg);
      if (CONFIG.mode === "recv") {
        const expected = CONFIG.expectText;
        if (!expected || text.includes(expected)) {
          console.log(`[PASS] receiver got expected message. text="${text}"`);
          if (CONFIG.exitOnMatch) {
            ws.close();
          }
        } else {
          console.log(
            `[recv] message_new did not match APPGATEWAY_EXPECT_TEXT. text="${text}" expect="${expected}"`,
          );
        }
      }
      break;
    }

    case "kick":
      stopAppPing();
      console.log("[kick] session invalidated by server");
      ws.close();
      break;
  }
};

ws.onerror = (event) => {
  console.error("[error]", event);
};

ws.onclose = (event) => {
  stopAppPing();
  console.log(`[close] code=${event.code} reason=${event.reason}`);
};