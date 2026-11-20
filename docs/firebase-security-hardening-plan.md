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
- The RTDB `auctions/{roomId}/teams` path still has broad authenticated client write access. A signed-in client can potentially manipulate purse, squad, retention, or team fields directly; this is the highest-priority remaining integrity risk.
- The room root and room metadata reads are available to any authenticated user who knows the room code. This is needed by the current invite/join flow but does not enforce membership-based privacy.
- The `live` auction state remains client-writable under complex rules. These rules are not a complete trusted settlement system and may permit tampering with auction state.
- The transactional `POST /api/room-join` endpoint now replaces the RTDB roster read-modify-write client flow for RTDB rooms, checking room phase, bans, franchise occupancy, and reconnect identity.
- Bot add/remove/fill now use `POST /api/room-bots`; the server verifies the Firebase identity and host role and commits roster changes in a room transaction. Team-record initialization is separate and idempotent; this leaves a recoverable cross-path failure window.
- Auction settlement is currently coordinated by clients: the client claims expired lots with RTDB transactions, reads pre-settlement room/team snapshots for RTM eligibility, and then applies sale side effects in separate team and roster transactions. Recovery is idempotent for duplicate squad entries, but the process is not trusted-server authoritative and the pre-read snapshots can be stale.
- Live player state advances to the next lot and room phase through client-side transactions/updates. This is a correctness/recovery mechanism, not a security boundary.
- Server-authoritative auction settlement, purse/squad/retention integrity, membership-scoped room reads, and comprehensive Firebase Emulator tests remain unfinished.

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

## Server-authoritative bidding expiry and RTM offer creation
- `POST /api/finalize-bidding` now verifies room-server Firebase identity, membership, ban status, active room, and server-side bid timer expiry.
- It computes sold/unsold state and eligibility for an RTM offer using the original-franchise dataset, eligible franchise manager, card count, purse, and overseas-player limit, then commits the live state in an RTDB transaction.
- Client timer/recovery flow calls this endpoint for expired bidding and the RTM finalization endpoint for expired processing stages.
- Pure helper tests cover timer rejection, eligible offer creation, and RTM skip conditions.
- Cross-path consistency caveat remains: eligibility reads room/team snapshots before the live transaction; trusted settlement still validates purse/card/squad limits. Restrictive Firebase rules are not yet safe to deploy.

## Server-authoritative Playing XI submission
- `POST /api/submit-playing-xi` verifies the assigned Firebase project token, room membership, ban status, XI phase/deadline, and disqualification state.
- The server validates the ordered 11 starters and both Impact Player choices against the franchise squad and player catalogue, then commits the XI in a team transaction.
- The client no longer writes the submitted XI directly.
- Emulator tests for ownership/deadline/quota edge cases are still required before restrictive rules are introduced.

## Server-authoritative pause/resume and host end
- Host pause/resume is now authenticated by the assigned Firebase project and host identity; timer and RTM expiry freezing are applied inside the server transaction.
- Host end-auction/disqualification is now performed in an atomic auction-root transaction. Mega auction minimum-squad disqualification and XI-phase metadata are calculated server-side.
- Clients call the trusted APIs and only add the system log messages afterward.
- Pure helper tests cover pause/resume timer freezing and host end/disqualification rules.
- Emulator testing is still required for multi-path transaction contention and pause/end races.

## Server-authoritative auction start
- `POST /api/start-auction` authenticates the room's assigned Firebase project, requires the recorded host, a waiting room, and at least two distinct participants.
- Server-generated marquee/role-balanced player order and the initial live lot are committed in a transaction at the room's auction root.
- The client no longer writes auction status, player order, or initial live bidding state directly.
- Unit tests cover host-room prerequisites, minimum participants, start initialization, and sprint player selection.
- The atomic transaction operates on the room's auction subtree, so production emulator/load validation is still required before rollout.

## Server-authoritative auction progression
- `POST /api/advance-auction` authenticates the room participant against the assigned Firebase project and validates the sold/unsold transition deadline.
- It advances to the next ordered player with server-calculated timer reset, or transactionally marks the live auction as `awaiting_xi` and updates the room XI phase metadata at auction completion.
- Both normal client progression and overdue-transition recovery now call the trusted endpoint rather than writing the next live player directly.
- Unit tests cover transition wait, next-player advancement, and final-lot completion.
- Remaining gap: the client still initiates the first expired-bidding transition and retention-offer creation. That is the next server-state-machine migration before restrictive RTDB rules.

## Server-authoritative RTM finalization
- The `POST /api/retention-finalize` endpoint authenticates the caller against the room's assigned Firebase project and checks room membership and ban state.
- Final RTM outcomes (original manager retain after counter-bid timeout, match decision, decline, or expiry) are resolved by a server transaction using server time.
- The client now requests finalization from this endpoint instead of directly mutating the RTM outcome.
- Pure helper tests cover RTM phase/window resolution.
- RTM offer creation still originates from the client timer path and remains a security gap. Full bidding-expiry/offer creation and auction progression should be migrated before restrictive rules.

## Trusted sale-side effects
- Durable sold-player team updates (squad append, purse deduction, spent total, and RTM card decrement) now call `POST /api/settle-sale`.
- The endpoint verifies a room participant caller against the assigned Firebase project, validates that the live state is sold, verifies the winner/franchise roster entry and player catalog record, and commits the team record idempotently.
- Team settlement checks squad size, overseas quota, purse affordability, and RTM-card availability. A repeated request returns the existing team record without double-charging.
- Client sale settlement and recovery now use this endpoint, then reconcile room roster counters from the trusted team result.
- Remaining trust gap: the client still controls transitions into `sold`/RTM-finalized live state. The settlement endpoint is not yet a complete trusted auction state machine; the bid-expiry/RTM offer opening/finalization and next-player progression still need server migration before restrictive Firebase live/team rules can safely be deployed.

## Server-authoritative retention decisions
- Initial RTM accept/decline and original-franchise match/decline-counter decisions now use `POST /api/retention-decision`.
- The server verifies the room's assigned Firebase project token, room membership, ban status, RTM phase, eligible manager identity, and offer expiry, then commits the phase/decision through a live-state transaction.
- Buyer counter-bids now use `POST /api/retention-counter-bid`; the server verifies the buyer, pending counter-bid phase, deadline, higher amount, and purse affordability before transactionally advancing to the match-decision phase.
- Pure validation tests cover RTM decisions and counter-bids.
- Client-side RTM transaction writes have been removed from these two actions. Final sale settlement and durable purse/squad/card updates are still client-coordinated and remain the next critical migration.

## Server-authoritative bidding
- Client bid placement now calls `POST /api/place-bid`; the server verifies the Firebase ID token against the room's assigned Firebase project (Server 1/2/3).
- Server validation checks membership, ban state, active room/live bidding state, current high bidder, timer expiry, team-record identity/franchise match, player catalog entry, squad size, overseas quota, and purse affordability.
- The live bid is committed in an RTDB transaction with server-computed bid increment and timer reset. The client no longer writes the live bid directly.
- Unit tests cover authorization, phase/timer, high-bidder rejection, identity mismatch, squad/overseas limits, and insufficient budget.
- This migration is incomplete: auction start/advance, RTM decision and sale settlement still involve client-side writes. Firebase rules remain permissive until the rest of the trusted mutation path is migrated and emulator-tested.

## Server-authoritative bot team management
- Bot add/remove/fill requests now call `POST /api/room-bots` with a Firebase ID token.
- The server verifies the authenticated host, room-code server routing, and waiting-room status; clients cannot manage bots after the auction starts.
- Room roster changes use an RTDB room transaction to avoid concurrent roster overwrites.
- Bot team records are initialized idempotently through per-team transactions and existing team purse/squad state is preserved.
- Bot removal is restricted to bot identities and removes the corresponding team record after the room transaction.
- Cross-path atomicity remains a caveat: room roster and team records are separate RTDB paths. A failure after roster commit can leave a bot roster entry without a team record; retry/fill can repair missing team initialization, but removal can similarly require a retry.
- This is branch-only and awaits CI/emulator verification; no production deployment.

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
- Bot add/remove/fill operations are now server-authoritative through `POST /api/room-bots`, with host authorization, waiting-room enforcement, room transactions, and idempotent team initialization (see implementation caveats above).
