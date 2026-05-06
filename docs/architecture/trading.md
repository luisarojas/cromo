# Trading & Sharing

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 11.1 Trade Matching Algorithm

1. Fetch requesting user's missing variant IDs
2. Fetch their duplicate variant IDs (quantity > 1)
3. Find users with mutual overlap (they have what you need AND need what you have)
4. Score and rank by mutual overlap count
5. Exclude users with trade matching disabled

Results cached in Redis for 2 minutes.

## 11.2 Trade Request Flow

```
User A views matches → sends trade request (specifying offered and wanted stickers)
User B receives email notification + sees badge in-app
User B chooses one of:
  ├── Accept  → status → accepted; both notified in-app + email
  │             *** no inventory change yet ***
  │             both users coordinate physical exchange via in-app messages
  │             either party clicks "Mark as Complete" once stickers are in hand
  │                → status → completed; both inventories update; both notified
  ├── Decline → trade closes; User A notified in-app + email
  └── Counter → propose different stickers; User A notified in-app + email
                and can Accept / Decline / Counter

Either party may cancel an accepted trade before it is marked complete.

Throughout: both users can send messages inside the trade
            to coordinate logistics (e.g. address, meetup, shipping)
```

**Counter-proposal:** When countering, the user edits the offered/wanted sticker lists and submits; the API increments `trade_requests.counter_count` (CHECK constraint enforces ≤ 5). The trade stays in `pending` status until one party accepts or declines. The 6th counter-attempt returns `409 Conflict`; a scheduled job (§34) transitions the trade to `expired` after 30 days of no activity in `pending` status.

**Multi-quantity:** Each `trade_items` row carries an explicit `quantity` (default 1). A user offering "2× MEX5 base + 1× BRA10 base" results in three `trade_items` rows (or two — one per variant — with appropriate quantities).

**Accepted-trade timeout:** When a trade transitions to `accepted`, `expires_at` is set to `accepted_at + INTERVAL '30 days'`. A daily scheduled job (§34) sweeps `accepted` trades whose `expires_at` has passed and transitions them to `expired`, notifying both parties. Either party may extend by sending a message (resets `expires_at` to `now() + 30 days`, max 3 extensions).

**Race condition on Mark Complete:** Either party may click "Mark complete." If both click simultaneously, the API wraps the inventory update in a single transaction that begins with `SELECT ... FOR UPDATE` on the `trade_requests` row, then re-checks the status. If the status is no longer `accepted`, the second click is a no-op (returns the already-completed response). This prevents double inventory mutation.

**Inventory update on completion:** When either party marks the trade complete (`status → completed`), the API runs a single database transaction:

1. `SELECT … FROM trade_requests WHERE id = $1 FOR UPDATE`; abort if status is not `accepted`
2. `UPDATE trade_requests SET status = 'completed', completed_at = now()`
3. For each `trade_item` with `direction = 'offer'`: decrement requester's `user_stickers.quantity` by `trade_items.quantity`
4. For each `trade_item` with `direction = 'want'`: decrement recipient's `user_stickers.quantity` by `trade_items.quantity`
5. Upsert `user_stickers` rows on the receiving side, incrementing `quantity` by the traded amount
6. Delete any `user_stickers` rows where `quantity` has reached `0`

If the transaction fails (e.g., insufficient quantity due to concurrent modification), the status remains `accepted` and no collections are changed; the user sees an error toast prompting them to refresh.

## 11.3 In-App Messaging: Implementation

### Why SSE (Server-Sent Events), not WebSockets

Messages are *sent* via a normal `POST /messages` API call. Only the *notification* of a new message needs to be pushed to the other user in real-time. SSE is a one-way server-to-browser push over plain HTTP — simpler than WebSockets, no special protocol, works through firewalls and corporate proxies, and Fastify supports it natively. WebSockets provide bidirectional communication which isn't needed here.

Managed real-time services (Pusher, Ably, Firebase) are explicitly rejected because they would store user messages on servers outside Canada, violating PIPEDA data residency requirements. Redis — already in the stack — provides all the pub/sub capability needed.

### The Multi-Server Problem and How Redis Solves It

In cloud, multiple API instances run in parallel (ECS Fargate tasks). A naive implementation breaks: User A connects to Server 1 for their SSE stream; User B sends a message that lands on Server 2; Server 1 never hears about it and User A sees nothing.

Redis Pub/Sub solves this cleanly:

```
User B sends message (POST)
         │
         ▼
  Server 2 writes message to PostgreSQL
         │
         ▼
  Server 2 publishes to Redis channel: trade:channel:{tradeId}
         │
         ▼ (Redis broadcasts to all subscribed servers)
         │
  Server 1 receives the Redis message
         │
         ▼
  Server 1 pushes SSE event to User A's open stream  ✓
```

Every API instance subscribes to the Redis channel for each active trade with an open SSE connection. When a message arrives on any server, Redis delivers it to all subscribed servers, which each push it to their connected clients.

### SSE Event Types

The SSE stream at `GET /trade/requests/:id/stream` emits these event types:

```
event: new_message
data: {"id":"...","senderId":"...","body":"Hello!","sentAt":"2026-05-03T..."}

event: status_changed
data: {"status":"accepted","updatedAt":"2026-05-03T..."}

event: status_changed
data: {"status":"completed","updatedAt":"2026-05-03T..."}

event: heartbeat
data: {}
```

The heartbeat is sent every 30 seconds to keep the connection alive through proxies and load balancers that close idle connections.

### Frontend Behaviour

```typescript
// Open the stream when the trade page loads
const eventSource = new EventSource(`/api/v1/trade/requests/${tradeId}/stream`, {
  withCredentials: true,
})

eventSource.addEventListener('new_message', (e) => {
  const message = JSON.parse(e.data)
  appendMessageToUI(message)
})

eventSource.addEventListener('status_changed', (e) => {
  const { status } = JSON.parse(e.data)
  updateTradeStatusUI(status)
})

// Close when the user navigates away
return () => eventSource.close()
```

If the connection drops (network blip), the browser automatically reconnects using the `Last-Event-ID` header. The server re-sends any messages missed during the gap. This makes the stream resilient to brief disconnections.

### Message Persistence and Deletion

- Messages are stored in PostgreSQL (`trade_messages` table) — durable, queryable, exportable
- `GET /trade/requests/:id/messages` returns the full message history with cursor-based pagination
- **Retention:** Messages are deleted 90 days after the trade closes (accepted, declined, or expired)
- **Right to erasure:** Deleting a user account (`DELETE /users/:id`) cascades to their messages
- Body length is capped at 2,000 characters per message (`CHECK (char_length(body) BETWEEN 1 AND 2000)`)
- **XSS prevention:** Messages are stored as plain text and rendered with HTML escaping. No HTML, Markdown, or rich text is permitted; URLs are detected client-side and rendered as `<a rel="noopener noreferrer nofollow" target="_blank">`. The `Content-Security-Policy` header (§9.4) provides defence-in-depth.
- **Idempotency:** `POST /api/v1/trade/requests/:id/messages` accepts an optional `Idempotency-Key` header (UUID). The server stores `(key, sender_id) → response` in Redis for 24 hours and replays the cached response on duplicate requests, preventing duplicate messages from mobile retry loops.

### Local Development

Locally, a single API instance runs with Redis in Docker — no multi-server coordination needed. The pub/sub path still executes (Server 1 publishes and receives its own message), making the local experience identical to cloud behaviour. No mocking required.

## 11.4 Post-Trade Ratings (Trust & Safety)

After a trade is marked `completed`, both parties enter a **14-day rating window** where they can rate each other on a binary scale (thumbs up / thumbs down). This rating system builds trust and helps identify users with problematic behaviour. Full details on the rating system, user reporting, and moderation capabilities are in **Section 33: Trust & Safety**.

## 11.5 Disputes

If a trade is marked `completed` but one party never received their stickers (or received fakes/damaged stickers), the formal recourse is the user-reporting flow described in §33.2. Categories `no_show`, `fake_stickers`, and `damaged_stickers` exist specifically to capture these cases. Reports filed within the 14-day rating window are weighted more heavily during admin review (linked-trade context is preserved on the report).

There is no "rollback" of a completed trade — once both inventories have been updated, the inventory cannot be unwound automatically (the physical stickers may already have been re-traded). Disputes therefore lead to ratings and reports, not inventory changes. Admins may issue partial refunds of trust-score impact in egregious cases via the moderation tools described in §33.3.

## 11.6 Shareable Public Lists

Unique expiring share links generated with cryptographically random tokens:
`https://stickfolio.ca/share/abc123xyz`

Privacy options per list: Private (default) | Link-only | Public.

Share links can be revoked manually by their owner via `DELETE /api/v1/users/:id/share/:token`. Revoked tokens return `410 Gone`.

