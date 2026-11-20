# Firebase Security Hardening Plan

## Safety status
This branch is a work-in-progress. No rules from this branch are deployed or merged. The preliminary team-write restriction was removed because client-side owner/host rules alone cannot protect purse, squad, auction settlement, or retention-card state from manipulation. Current production rules remain unchanged.

## Goal
Make Firebase enforce room membership and narrowly scoped access, and move integrity-critical auction mutations to trusted server-side code. Security rules should not pretend to validate business logic that is currently executed in clients.

## Recommended architecture
1. Verify Firebase ID tokens on every trusted mutation endpoint.
2. Verify the caller is a member of the specified room and, for host actions, the recorded host.
3. Use server-side transactions for room membership and franchise claims, preventing lost joins and duplicate team claims.
4. Use trusted server-side auction settlement to update the sold status, winner, purse, squad, retention state, and player state atomically (or with a recoverable transaction/operation ID).
5. Make RTDB client writes read-only for integrity-critical paths; permit only narrowly validated user-owned presence, chat, and lobby requests where appropriate.
6. Bot roster/team creation and removal must be host-authorized and transactionally coordinated with room state.
7. Use Firebase Emulator Suite tests before deploy. Test allow and deny cases, race conditions, reconnects, Server 1/2/3 routing, and cleanup.

## Current audit findings
- Existing client `joinRoomDb` reads and rewrites the entire `room.players` roster with `set()`, so simultaneous joins can overwrite one another.
- Existing `addBotTeam` and `fillEmptyTeamsWithBots` similarly read and rewrite roster state, then separately create team records; concurrent operations can create inconsistent roster/team state.
- Existing reconnect logic allows a participant to update their franchise assignment and team record. The new pure join policy now rejects franchise reassignment during reconnect and checks occupancy for all join attempts, but it is not yet wired into the live client/backend flow.
- A server-authoritative join/bot endpoint must atomically coordinate room roster and franchise claim state, preserve rejoin behavior, and route by room-code prefix (Server 1/2/3). Client integration remains intentionally deferred until the transaction design and tests are ready.

## Test matrix required before deployment
- Unauthenticated read/write: denied.
- Authenticated non-member read/write to private room: denied.
- Host creates room and manages settings: allowed.
- Friend joins concurrently with another friend: both remain in roster.
- Two users claim same franchise concurrently: exactly one succeeds.
- Host adds/removes bots: allowed and consistent; non-host bot manipulation denied.
- Human takeover of bot franchise: succeeds through intended flow without duplicate team.
- Participant changes own purse/squad directly: denied.
- Participant changes another team's purse/squad: denied.
- Client fabricates a sold result/high bid: denied.
- Legitimate server settlement: succeeds and is idempotent.
- Retention flow: valid decisions succeed; forged decisions denied.
- Server 2/3 room operations use the room's assigned Firebase database.
- Cleanup never removes active rooms; inactive-room expiry matches the configured policy.

## Completed-auction visibility requirement
- Completed-auction summaries must allow every authenticated room viewer to inspect every franchise's squad and saved Playing XI, including the ordered starting XI, both Impact Player selections, and auto-selected XI status.
- `AuctionSummary.jsx` reads the completed room's team records directly from the room's Server 1/2/3 RTDB, while also merging context and legacy fallbacks. This avoids depending on the live-auction listeners remaining active after completion.
- The Franchise XI cards now explicitly indicate submitted XI, automatically selected XI, unavailable XI, and disqualified status, and show each franchise's squad count. The Squad tab remains the detailed roster view.
- RTDB room/team reads are currently authenticated-user-readable in the existing rules; no client-only privacy restriction should hide other franchises' results from auction participants/viewers. This visibility is a required regression test before deployment.
- Verified by source inspection only so far; no production deployment and no emulator/CI validation claimed.

## Rollout
- Keep this branch isolated.
- Implement trusted server mutation endpoints and client integration first.
- Add emulator tests and run CI.
- Review the rules diff and test results.
- Merge only after tests pass and a deployment/rollback plan is ready.
- Deploy rules in a coordinated window; verify room creation, joining, bots, bidding, retention, and cleanup immediately.

## Branch-only protections added during this audit
- Winner analysis endpoint now requires a verified Firebase ID token and room-host authorization, with room-phase checks and server routing by room-code prefix.
- Agora voice token requests now bind the requested RTC identity to the authenticated Firebase UID to prevent participant identity impersonation.
- Room activity endpoint now has a per-user in-memory rate limit of 30 requests per minute; bot identities are rejected.
- CI workflow explicitly runs on pushes to `security-rules-hardening`. The production health-check job remains restricted to `main`.
- These changes are isolated in the security branch and have not been merged or deployed.

## Transactional join implementation status
- Added `POST /api/room-join`, which verifies the primary Firebase ID token, routes rooms by code prefix, checks waiting-room status/ban/franchise occupancy/reconnect identity, and commits roster changes using an RTDB transaction.
- Team records are initialized through an idempotent transaction that preserves existing team state on reconnect.
- The RTDB client join flow now calls the endpoint; legacy non-RTDB rooms retain a compatibility path.
- Remaining caveat: roster transaction and team-record transaction are separate RTDB paths, so a failure between them can leave a roster member without a team record. The endpoint is designed to be safely retried, but full atomic coordination across room and team paths remains a follow-up.
- Bot add/remove/fill operations are not yet server-authoritative and remain pending.
