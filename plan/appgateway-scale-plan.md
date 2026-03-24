# AppGateway Scalability Plan (Future)

This document outlines a practical path to scale `openim-appgateway` beyond the current poll-bridge implementation, while keeping compatibility with the existing JSON event contract.

## Current State (Accepted for now)

- Per-connection in-memory state (`connState`) for auth/session/cursors/subscriptions.
- Per-connection polling bridge (`bridgePollSec`) for:
  - new message push (`message_new`)
  - subscribed user status changes (`user_status_changed`)
- JSON-first event contract already in use by custom clients.

This is functionally correct and suitable for low-to-moderate traffic, but not optimal for large concurrent websocket counts.

## Scale Risks in Current Design

1. **Polling fan-out**
   - RPC calls grow with connection count.
   - Repeated conversation scans for the same user across multiple sessions.
2. **No shared session/cursor layer**
   - Cursor/subscription state is process-local.
   - Reconnect/restart causes state rebuild and burst pulls.
3. **Hot paths can duplicate work**
   - Same user online in multiple sockets/nodes can trigger redundant polling.
4. **Operational visibility is limited**
   - Need deeper metrics for bridge pressure and push lag.

## Target Architecture (v2)

Keep websocket JSON API unchanged. Replace internal delivery strategy.

- Event-driven push pipeline for message/status changes.
- Per-user shared dispatcher inside gateway process.
- Optional distributed session/cache for multi-node stability.
- Strict backpressure and delivery throttling controls.

## Phased Roadmap

## Phase 1: Hardening and Observability

Goal: make current polling model safer under load.

- Add metrics:
  - bridge tick duration
  - pull RPC QPS/error rate
  - pushed messages per connection
  - active connections and subscriptions
- Add guards:
  - max subscriptions per connection
  - per-connection outbound queue limits
  - optional close policy for repeated malformed events
- Add config knobs:
  - bridge jitter/randomization to avoid synchronized spikes
  - max conversations scanned per tick
  - max pulled messages per tick

Success criteria:

- Stable p95 bridge tick latency under expected concurrent sockets.
- No unbounded memory growth per connection.

## Phase 2: In-Process Work Deduplication

Goal: reduce duplicate polling work without changing external contract.

- Introduce per-user polling coordinator:
  - one poll loop per active user (not per socket)
  - fan out results to all sockets for that user
- Cache short-lived conversation snapshots to avoid repeated full scans.
- Reuse shared online-status snapshot for subscribers.

Success criteria:

- Significant reduction in Msg/Conversation RPC calls at same traffic.
- Same client-visible events and ordering guarantees as today.

## Phase 3: Event-Driven Delivery Backbone

Goal: transition from polling to push-driven internal delivery.

- Subscribe to internal message/status streams (existing queue/pubsub where possible).
- Drive `message_new` and `user_status_changed` from stream events.
- Keep polling as fallback path for resiliency/recovery.

Success criteria:

- Lower end-to-end push latency.
- Predictable backend load independent of websocket count growth.

## Phase 4: Multi-Node Session Consistency

Goal: make behavior stable across horizontally scaled gateway instances.

- Externalize minimal shared state (if needed):
  - user session presence
  - cursor checkpoint hints
  - subscription index
- Add sticky-session guidance or cross-node fan-out strategy.
- Add node-aware observability dashboards.

Success criteria:

- No correctness regressions during node failover/restart.
- Consistent push behavior with multiple gateway replicas.

## Non-Goals

- No change to client JSON event namespace in scale phases.
- No forced migration for current custom clients.

## Suggested Initial Priority Order

1. Phase 1 metrics/guards
2. Phase 2 per-user dedupe
3. Phase 3 event-driven internals
4. Phase 4 distributed consistency

## Rollout Strategy

- Feature flags per phase.
- Canary one gateway instance first.
- Compare canary vs baseline:
  - auth success rate
  - send ack latency
  - message push latency
  - rpc error rates
- Roll back by toggling feature flags to polling baseline.
