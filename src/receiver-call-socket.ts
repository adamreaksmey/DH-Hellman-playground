/**
 * Socket.IO receiver playground (Node.js / ts-node).
 *
 * Usage:
 * 1) Set PLAYGROUND_CONFIG.accessToken for the callee user.
 * 2) Run `runReceiverCallsPlayground()`.
 * 3) When an `incoming_call` event arrives, choose accept/reject/skip in terminal.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { io, type Socket } from 'socket.io-client';

type IncomingCallPayload = {
  call_session_id?: number;
  caller_id?: number;
  caller_nickname?: string;
  caller_number?: number;
  stream_call_cid?: string;
};

type AcceptCallResponseData = {
  call_session_id: number;
  stream_call_cid: string;
  caller_id: number;
};

type RejectCallResponseData = {
  success: boolean;
};

const SOCKET_NAMESPACE = '/calls';
const PLACEHOLDER_ACCESS_TOKEN = 'PASTE_RECEIVER_ACCESS_TOKEN_HERE';
const KEEP_SOCKET_OPEN_MS = 5 * 60_000;

const CALL_SOCKET_EVENTS = [
  'incoming_call',
  'call_state',
  'call_accepted',
  'call_rejected',
  'call_active',
  'call_ended',
] as const;

const PLAYGROUND_CONFIG = {
  /** Origin for Socket.IO (no /api suffix). */
  serverOrigin: 'http://localhost:4000',
  /** REST base path prefix used by this Nest app. */
  apiPrefix: '/api',
  /** JWT for the callee user listening for incoming calls. */
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidXNlcm5hbWUiOiJhbHBoYS11c2VyLTAxIiwiZnVsbG5hbWUiOiJBbHBoYSIsInVzZXJfbnVtYmVyIjoyODE4MTM2OSwicm9sZSI6MSwidGVuYW50X2lkIjo2LCJwbGF0Zm9ybSI6MiwiZGV2aWNlX3VpZCI6IkRFVi0wMDEtWFlaIiwiaWF0IjoxNzc1NjMyMjAyLCJleHAiOjE3NzU2NTAyMDJ9.EmytCMyI56B9IA55PhRAnsUKTE809BJvnTeLeGw0gAI',
  /** Auto action for incoming calls. Use prompt to decide interactively. */
  incomingAction: 'prompt' as 'prompt' | 'accept' | 'reject' | 'skip',
};

function buildApiUrl(path: string): string {
  return `${PLAYGROUND_CONFIG.serverOrigin}${PLAYGROUND_CONFIG.apiPrefix}${path}`;
}

function assertReceiverConfig(): void {
  if (PLAYGROUND_CONFIG.accessToken === PLACEHOLDER_ACCESS_TOKEN) {
    throw new Error('Set PLAYGROUND_CONFIG.accessToken (receiver) before running.');
  }
}

function attachConnectionLifecycleLogs(socket: Socket, label: string): void {
  socket.on('connect', () => {
    console.log(`[calls socket ${label}] connected`, socket.id);
  });
  socket.on('disconnect', (reason: string) => {
    console.log(`[calls socket ${label}] disconnected`, reason);
  });
  socket.on('connect_error', (error: Error) => {
    console.log(`[calls socket ${label}] connect_error`, error.message);
  });
}

function attachGenericCallEventLogs(socket: Socket, label: string): void {
  for (const eventName of CALL_SOCKET_EVENTS) {
    if (eventName === 'incoming_call') {
      continue;
    }
    socket.on(eventName, (payload: unknown) => {
      console.log(`[calls socket ${label}] ${eventName}`, payload);
    });
  }
}

function connectCallSocket(accessToken: string, label: string): Socket {
  const socketUrl = `${PLAYGROUND_CONFIG.serverOrigin}${SOCKET_NAMESPACE}`;
  const socket = io(socketUrl, {
    transports: ['websocket'],
    auth: { token: accessToken },
    timeout: 10_000,
    forceNew: true,
  });
  attachConnectionLifecycleLogs(socket, label);
  socket.on('connect_error', (error: Error) => {
    if (error.message.includes('Invalid namespace')) {
      console.warn('[calls socket] Invalid namespace. Make sure serverOrigin has no /api suffix.');
    }
  });
  attachGenericCallEventLogs(socket, label);
  return socket;
}

async function apiPost<T>(path: string, body: Record<string, unknown>, accessToken: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data?: T; message?: string };
  if (!response.ok) {
    const message = payload.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (!payload.data) {
    throw new Error('API response has no data field.');
  }
  return payload.data;
}

function pickActionFromAnswer(answer: string): 'accept' | 'reject' | 'skip' {
  const normalizedAnswer = answer.trim().toLowerCase();
  if (normalizedAnswer === 'a' || normalizedAnswer === 'accept') {
    return 'accept';
  }
  if (normalizedAnswer === 'r' || normalizedAnswer === 'reject') {
    return 'reject';
  }
  return 'skip';
}

async function askIncomingCallAction(payload: IncomingCallPayload): Promise<'accept' | 'reject' | 'skip'> {
  const callerName = payload.caller_nickname ?? payload.caller_number ?? payload.caller_id ?? 'unknown';
  const question = `Incoming call from ${callerName}. Choose [a]ccept / [r]eject / [s]kip: `;
  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(question);
    return pickActionFromAnswer(answer);
  } finally {
    readline.close();
  }
}

function resolveIncomingAction(payload: IncomingCallPayload): Promise<'accept' | 'reject' | 'skip'> {
  if (PLAYGROUND_CONFIG.incomingAction !== 'prompt') {
    return Promise.resolve(PLAYGROUND_CONFIG.incomingAction);
  }
  return askIncomingCallAction(payload);
}

async function handleIncomingCall(payload: IncomingCallPayload): Promise<void> {
  console.log('[calls socket receiver] incoming_call', payload);
  const callSessionId = payload.call_session_id;
  if (typeof callSessionId !== 'number') {
    console.warn('[receiver] incoming_call payload missing call_session_id; skipping.');
    return;
  }

  const action = await resolveIncomingAction(payload);
  if (action === 'skip') {
    console.log('[receiver] skip selected. No accept/reject request sent.');
    return;
  }

  const path = `/calls/${callSessionId}/${action}`;
  if (action === 'accept') {
    const acceptResult = await apiPost<AcceptCallResponseData>(path, {}, PLAYGROUND_CONFIG.accessToken);
    console.log('[api] accept result', acceptResult);
    return;
  }
  const rejectResult = await apiPost<RejectCallResponseData>(path, {}, PLAYGROUND_CONFIG.accessToken);
  console.log('[api] reject result', rejectResult);
}

async function keepSocketOpen(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function runReceiverCallsPlayground(): Promise<void> {
  assertReceiverConfig();
  const receiverSocket = connectCallSocket(PLAYGROUND_CONFIG.accessToken, 'receiver');
  receiverSocket.on('incoming_call', async (payload: IncomingCallPayload) => {
    try {
      await handleIncomingCall(payload);
    } catch (error) {
      console.error('[receiver] failed to handle incoming call', error);
    }
  });
  await keepSocketOpen(KEEP_SOCKET_OPEN_MS);
  receiverSocket.close();
  console.log('[calls socket receiver] closed connection');
}

type PlaygroundGlobal = typeof globalThis & { runReceiverCallsPlayground?: () => Promise<void> };
(globalThis as PlaygroundGlobal).runReceiverCallsPlayground = runReceiverCallsPlayground;


runReceiverCallsPlayground();