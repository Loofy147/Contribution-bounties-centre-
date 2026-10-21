# ContribQuest API Authorization Route Matrix

**Audit date:** 2026-10-16  
**Reviewed live AppDeploy snapshot:** `1792153585719`  
**Repository base:** `main` at `4cb980849b9757df2936a448159ecbfa066fc5bd`  
**Purpose:** document each API route's intended access boundary and encode source-level regression guards. This document is not an E2E certification.

## Findings

1. **Public responses previously passed through database records.** `GET /api/bounties` serialized complete bounty records, including internal `createdBy` account identifiers, and `GET /api/leaderboard` serialized raw profile records. These routes are public, so returning raw objects creates unnecessary exposure and can leak future fields if schemas grow. This branch changes both endpoints to explicit public-field projections. Bounty-card ownership UI now compares bounty IDs against the signed-in user's private `my-work` response rather than depending on the public creator ID.
2. **Authorization CI coverage was incomplete.** The existing static contract suite tested selected protected routes and business guards, but it did not inventory every route or require each route to be classified. This branch adds an exhaustive 28-route inventory and assertions for session auth, role checks, object ownership, OAuth/device-flow state binding, and response projections. These are source-contract checks, not proof of runtime behavior.
3. **Bounties are global, not workspace-private, in the current contract.** `Bounty` has no `workspaceId` or `projectId`; public browse and global leaderboard are explicitly covered by the product's public browsing scenario. Authenticated users may create public bounty listings; contributors may submit to eligible open listings, except their own. Workspace membership therefore does not scope global bounty listings. Do not describe workspace roles as protecting bounties. If workspace-private bounties become a requirement, add resource scope to the data model and validate membership in every read/write handler before exposing that feature.
4. **Runtime/repository equivalence is not assumed.** The reviewed AppDeploy snapshot and repository `main` are separate artifacts; match route names and guards, then record the tested commit/snapshot association at release time. Static tests do not replace runtime authorization tests.

## Route inventory

| Route | Intended boundary | Server-side enforcement / rationale |
|---|---|---|
| `OPTIONS /api/mcp` | Public preflight, allowlisted browser origins | Validates origin before granting CORS preflight |
| `GET /api/mcp` | Public, non-data transport hint | Returns 405; MCP requests use POST |
| `POST /api/mcp` | Dedicated bearer credential | Handler validates origin and bearer token before initialize, ping, tools/list or tools/call; private tools resolve exactly one configured platform owner |
| `GET /api/_healthcheck` | Public health status | Returns a fixed availability message only |
| `GET /api/account/security` | Authenticated account self-view | Reads current user's identity, roles, membership index and own GitHub link |
| `GET /api/workspaces` | Authenticated membership self-view | Reads only the current user's workspace index |
| `POST /api/workspaces` | Platform owner only | `requireAuth()` and `isPlatformOwner`; creator becomes workspace admin |
| `GET /api/workspaces/:workspaceId/members` | Platform owner or workspace admin | Validates workspace ID, checks `canManageWorkspace`, then reads that workspace's members |
| `POST /api/access/workspaces/:workspaceId/members` | Platform owner or workspace admin; only owner may grant workspace-admin | Checks caller authority, validates role/workspace, resolves target from trusted account identity index, rejects duplicate membership and writes audit event |
| `DELETE /api/access/workspaces/:workspaceId/members/:userId` | Platform owner or workspace admin; admin removal owner-only | Checks caller and target role, refuses removal of final workspace admin and writes audit event |
| `POST /api/integrations/github/pat/verify` | Platform owner only | Requires session and configured-owner identity; tests only the fixed allowlisted repositories |
| `POST /api/integrations/github/pat/file/read` | Platform owner only | Requires session/owner; validates repository against allowlist and path/branch before GitHub read |
| `POST /api/integrations/github/pat/file/write` | Platform owner only | Requires session/owner; validates repository allowlist/path/branch and applies explicit write request |
| `POST /api/integrations/github/start` | Authenticated account's own link flow | Rejects already-linked account; creates random, expiring OAuth state bound to current app user |
| `POST /api/integrations/github/device/start` | Authenticated account's own link flow | Rejects already-linked account; validates provider response and stores a hash of the device code |
| `POST /api/integrations/github/device/poll` | Authenticated owner of device-flow record | Binds flow to `appUserId` and code digest; enforces expiry/status; prevents linking a GitHub identity already owned by another account |
| `GET /api/integrations/github/callback` | Provider redirect; session is not required by design | Requires a pending, unexpired, single-use state; atomically claims it and uses the stored app user ID; prevents cross-account GitHub identity linking |
| `POST /api/integrations/github/disconnect` | Authenticated account's own linked identity | Loads link by current app user ID and only deletes matching identity-owner index |
| `GET /api/project-contributions` | Authenticated user's private ledger | Reads the current user's dedicated partition |
| `POST /api/project-contributions` | Authenticated user's private ledger | Records contributor ID from session and writes only into that user's partition plus audit event |
| `POST /api/project-contributions/:id/verify` | Authenticated author of private ledger record | Reads through user's partition; requires every criterion true; rejects non-low-risk/sensitive work; uses fixed award ID and atomic transaction |
| `GET /api/bounties` | Public global marketplace | No workspace scope exists on bounty records; response now explicitly projects public fields and excludes internal `createdBy` ID |
| `GET /api/leaderboard` | Public reputation summary | Response now explicitly projects only display name, XP and accepted count |
| `POST /api/bounties` | Any authenticated account may publish a global listing | Bounty creator is set from the authenticated session; server validates all input |
| `POST /api/bounties/:id/submit` | Authenticated contributor; not listing owner | Requires an open non-sample bounty, blocks self-submission, applies paid eligibility and uses active-submission guard |
| `GET /api/my-work` | Authenticated account's private work | Initial and continuation pages read only caller-derived bounty, submission, and received-review partitions. Each page is capped at 100; continuation sections are allowlisted and tokens are never used to choose a user or table. |
| `POST /api/contributions/:id/resubmit` | Original contributor only | Requires submitter ID match, `needs_changes` state and open bounty; conditional updates retain that ownership condition |
| `POST /api/contributions/:id/review` | Bounty owner only | Requires owner ID match, pending state, checklist length match; acceptance requires every criterion to pass |

## Regression controls added in this branch

- Exact-match inventory of all 28 API route declarations: unclassified/new routes fail the source-contract test.
- All session-protected routes must contain `requireAuth()`.
- Explicit tests for workspace role/admin boundaries, GitHub PAT owner-only and repository allowlist guards, OAuth/device-flow identity/state binding, personal-ledger indexing, submission ownership, resubmission ownership, and bounty-owner review.
- Explicit source-contract tests for sanitized public bounty and leaderboard projections.
- Proposal-branch tests assert `GET /api/my-work` continuation pages use only the authenticated user's partitions, a three-section allowlist, cursor-size limits, and bounded page sizes.
- The UI exposes load-more actions for owned bounties, submitted contributions, and received submissions, merging results by record ID to avoid duplicates.

## Remaining acceptance work

- Run CI on this branch and review every failure before merge.
- Deploy the privacy projection fix only after the branch is accepted; then confirm public response shapes through the live app.
- Exercise negative authorization cases with two independent test accounts in a safe test environment. Static source checks alone cannot prove that unauthorized requests return the correct HTTP status and no private data.
- Decide separately whether any future bounty/workspace product must be workspace-private. This branch preserves the current global marketplace behavior.


## Work-list pagination proposal

The `fix/my-work-pagination` branch adds a cursor continuation mode to the existing authenticated `GET /api/my-work` route. It does not add a new data source or use client-supplied user/project identifiers. The selected table is always derived from `ctx.user.userId`; a query parameter selects only one of three approved list categories. Each request remains bounded at 100 rows, rejects malformed/oversized cursors, and returns the next cursor for the same list.

The UI can request additional pages for each personal index and merges by stable record ID. A cursor request fails closed while the legacy index migration is incomplete. This is an application/API pagination improvement, **not database-native row-level security** and not a live two-account isolation certification. Merge remains gated on CI and safe AppDeploy verification.
