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
