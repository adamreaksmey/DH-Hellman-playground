# AppGateway JSON WebSocket Guide

This document explains what changed with `openim-appgateway`, how clients connect, and how message/event behavior works without SDK-specific wire encoding.

## What Changed

`openim-appgateway` is a JSON-first WebSocket gateway designed for custom clients that do not want SDK framing/codec coupling.

- Removed SDK-tailored WS envelope requirements (`ReqIdentifier`, gob/json codec switching, SDK compression knobs).
- Added raw JSON event envelope:
  - inbound: `{ "event": "...", "id": "...", "data": { ... } }`
  - outbound: `{ "event": "...", "id": "...", "data": { ... } }`
- Message payload `content` is exposed as JSON-native data (object/array/string/number) rather than base64 transport fields.
- `message_new` push is queue-driven (Kafka topic consumption + in-memory socket fanout).

## Service and Config

- Binary entrypoint: `cmd/openim-appgateway/main.go`
- Default config: `config/openim-appgateway.yml`
- Queue config:
  - `eventDrivenConsumerGroup`: base consumer group id (default `openim-appgateway`)
  - Runtime group id is node-scoped: `<base>-<hostname>-<index>`

Command:

```bash
go run ./cmd/openim-appgateway -c ./config
```

Default route:

- `ws://<host>:10011/ws`

## Token Lifecycle UX

- `auth` returns `auth_ok` when token is valid.
- `refresh_auth` rotates JWT on the same socket and returns `auth_refreshed`.
- Server emits `token_expiring` about 2 minutes before JWT expiry.
- On expiry, server emits `token_expired`, then `kick`, and closes the socket.
- Business events validate token before processing.

## Event Namespace

Inbound:

- `auth` - authenticate websocket with JWT token.
- `refresh_auth` - rotate/refresh JWT on current socket.
- `ping` - application heartbeat probe.
- `send_message` - send normal chat message.
- `send_signal_message` - send signal-style message path.
- `fetch_history` - pull history by sequence range.
- `get_newest_seq` - fetch max seq for conversations.
- `pull_by_seqs` - fetch messages by explicit seq list/range.
- `get_seq_messages` - batch seq fetch across conversations.
- `get_conversation_read_max_seq` - read/max cursor snapshot query.
- `get_last_message` - fetch latest message per conversation.
- `mark_read` - update read cursor/seq state.
- `set_background_status` - set client background/foreground status.
- `subscribe_users_status` - subscribe/unsubscribe presence targets.
- `logout` - clear session context and close socket.

Outbound:

- `auth_ok` - initial authentication success.
- `auth_refreshed` - token refresh success on active socket.
- `token_expiring` - pre-expiry warning for token refresh.
- `token_expired` - token is expired on current socket.
- `pong` - response to `ping`.
- `message_ack` - send accepted by backend.
- `message_new` - async queue-driven message delivery event.
- `history` - response payload for history/pull requests.
- `newest_seq` - response for newest seq query.
- `seq_messages` - response for batch seq message query.
- `conversation_read_max_seq` - read/max cursor response.
- `last_message` - latest message result per conversation.
- `read_updated` - read-state update confirmation.
- `background_status_updated` - background status update confirmation.
- `users_status` - current snapshot for subscribed user status.
- `logout_ok` - logout processed successfully.
- `kick` - session invalidated; reconnect required.
- `error` - backend/business error response.
- `data_error` - invalid payload/event schema response.

## Notes

- Backend RPC communication and business logic remain the same (`Auth`, `Msg`, `Conversation`, `User`, `Push`).
- Client wire protocol is raw JSON only (no SDK-specific encode/decode envelope).
- Polling bridge/fallback is removed from appgateway runtime.
