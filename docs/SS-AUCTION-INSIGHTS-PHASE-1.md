# SS AUCTION INSIGHTS — Phase 1

## Scope
Phase 1 creates an isolated analytics foundation on branch `feature/ss-auction-insights-phase-1`.
It does not change auction UI, bidding, room lifecycle, Firebase presence writes, or existing Supabase tables.

## Live definitions
- **Online players:** distinct, non-bot Firebase UIDs with `presence/{uid}/online === true` in any room.
- **Active players:** distinct, non-bot UIDs who are online, belong to that room's player roster, and are in a room whose live/room status is active, started, in_progress, bidding, or paused.
- **Active rooms:** rooms with one of those active statuses.
- **Waiting rooms:** rooms whose status is waiting.
- A UID present in multiple rooms counts once in player totals.

These are live presence estimates. Firebase onDisconnect handles hard disconnects; a short disconnect/reconnect delay may affect the snapshot.

## Security
- The insights API is server-side and verifies Firebase ID tokens.
- Only a verified Google account matching `ANALYTICS_ADMIN_EMAIL` may call it.
- Set `ANALYTICS_ADMIN_EMAIL=ssauctionforall@gmail.com` in Render.
- Never put Firebase service-account JSON or Supabase service-role keys in Vite variables or browser code.
- The new analytics tables deny access to `anon` and `authenticated`; only the server's service role may access them.
- Do not store email addresses, display names, IP addresses, chat contents, or other message contents in analytics events.

## Supabase setup
Run `scripts/analytics_schema.sql` in the Supabase SQL Editor. It creates only `analytics_sessions` and `analytics_events`.

## Render setup
Add `ANALYTICS_ADMIN_EMAIL=ssauctionforall@gmail.com`.
The existing `FIREBASE_SERVICE_ACCOUNT_JSON` and Firebase database URL are reused by the server-side Firebase Admin integration.

## Verification
Run:
- `npm test`
- `npm run lint`
- `npm run build`

Do not merge this branch or deploy it to production until these checks and the manual authorization checks pass.

## Phase 2 — activity collection

Phase 2 adds authenticated session/event ingestion at `POST /api/insights/track`.
The browser sends only an opaque session UUID and allowlisted event names. The server verifies the Firebase ID token, derives the UID and anonymous status from that token, verifies room membership for room-scoped events, and writes with the server-only Supabase service-role key.

Tracked events:
- `page_view` — route path only; query strings are removed.
- `room_join` / `room_leave` — successful room membership entry and route exit.
- `auction_start` — auction start action completed.
- `bid` — bid transaction committed successfully.
- `chat_message` — text chat message sent; message text is never stored in analytics.
- `voice_join` / `voice_leave` — LiveKit connection lifecycle.

Sessions are tab-scoped, anonymous status is derived server-side, and a 60-second heartbeat updates `last_seen_at`. A page-hide request attempts to set `ended_at`; abrupt browser/network termination may leave a session open until its last heartbeat becomes stale. Do not treat open sessions as currently online; use Firebase RTDB presence for live online counts.

### Required Render environment

The tracking endpoint requires:
- `SUPABASE_URL` (or the existing `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose as a `VITE_` variable.
- Existing Firebase Admin credentials and database URL.
- Existing `ANALYTICS_ADMIN_EMAIL`.

The Supabase service-role key is already used by the existing server-side room cleanup feature in this project. Confirm it is configured in Render; do not paste the key into chat.

### Data interpretation

- Daily players: distinct `firebase_uid` values with at least one event/session in the selected local-day window.
- Returning visitors: distinct UIDs with sessions on more than one date in the selected reporting period.
- Peak hours: group event/session timestamps by the dashboard's selected timezone.
- Session duration: `ended_at - started_at` where ended_at exists; otherwise use last_seen_at as an approximate endpoint after applying an inactivity cutoff.
- Historical reporting begins only after this instrumentation is deployed; it cannot backfill earlier visits.
- Analytics failures are intentionally non-blocking and must never prevent joining rooms, bidding, chat, or voice.
