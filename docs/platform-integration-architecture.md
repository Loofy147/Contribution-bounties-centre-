# Platform Integration Architecture

**Status:** Implementation boundary, v0.1  
**Date:** 2026-10-13

This application is the first prototype of the broader [Contribution Network](https://github.com/Loofy147/contribution-network). The target integration/data architecture is specified in [Engineering Primitives and Integration Architecture](https://github.com/Loofy147/contribution-network/blob/main/docs/11-engineering-primitives.md). This document records how that target maps to the present app.

## Current implementation

The app uses AppDeploy authentication and its key-value/table database. Current logical tables include bounties, contributions, and profiles. The deployed app is healthy according to its latest AppDeploy status, but standalone build reproducibility remains unverified because the checked-in package manifest does not declare the AppDeploy client/server packages.

The AppDeploy SDK supports backend-only encrypted app secrets, bounded database operations, conditional patches, transactions, and atomic increments. The current app has no configured backend secrets. A server-side GitHub identity-link flow and workspace role/membership primitives are now implemented. The GitHub client secrets are not configured, so no GitHub identity is connected and no repository installation is active. Workspace roles are enforced by the new workspace-management endpoints; legacy bounty routes still use their existing owner checks and are not yet fully project-membership-scoped. No Network MCP server is implemented.

The separate [`contribution-cloud/Contributions-centre`](https://github.com/contribution-cloud/Contributions-centre) is reserved for the future portfolio/repository control plane and is not currently integrated with this app. Keep active development in the two `Loofy147` repositories until the readiness gates in the strategic first-consumer charter are met. The GitHub accounts are distinct authorization boundaries; no access or synchronization between them should be assumed.

## Required identity distinction

- AppDeploy auth identifies the signed-in Network user.
- GitHub App installation grants access to specific selected GitHub repositories.
- Network workspace/project membership grants access to Network data.
- An MCP client's authorization grants only the tools/resources defined for that MCP service.

No one of these permissions implies the others. GitHub access must not be implemented by asking the user to paste a personal token into a text field.

## GitHub integration contract

Use a GitHub App. Start with read-only repository access and minimum permissions (Metadata read, Contents read, Issues read, Pull requests read; add Checks or Actions read only if a shipped workflow needs them). The app must be installed only on repositories selected by the user. Add write permissions later one capability at a time.

Connection callbacks must validate one-time state bound to the authenticated Network user. Store the GitHub installation ID, repository IDs, selected project mapping, granted permission summary, and sync status—not a long-lived installation token. Mint short-lived installation tokens server-side when needed. Keep client secrets and private keys in AppDeploy backend secrets. If user OAuth tokens are ever stored, encrypt and rotate them; do not place them in normal record JSON.

Webhooks, when enabled, require signature verification, repository/installation scope checks, delivery deduplication, bounded retries, and an auditable failed-event path.

## Database/access contract

The app now uses per-user private table indexes for authored bounties, submitted contributions, and received reviews. New bounty/submission writes and review/resubmission transitions update canonical records and their indexes transactionally. A stable active-submission guard blocks concurrent duplicate submissions. Existing records are indexed through bounded pages; the /api/my-work route reads from the signed-in user's tables and returns migration progress rather than filtering the global collections for normal reads. During migration, a bounded legacy duplicate check remains enabled until the contribution scan is complete. The public bounty board and leaderboard remain separate bounded reads.

These indexes are a first scale and data-isolation step, not a complete multi-project authorization model. Before hosting unrelated projects, introduce explicit workspace/project identity and memberships, server-side authorization checks on every read/write, and negative tests for cross-project reads and writes. Treat browser-supplied project IDs as untrusted; evaluate a relational store behind a repository interface when query requirements outgrow the current key-value database.

Keep audit/review events append-only, add an XP ledger with unique idempotency keys, and use transaction receipts for side effects that can be retried. Do not rely solely on counters or rolling arrays as the permanent audit record.

## MCP contract

The MCP layer must call shared domain services, not raw database access. Read-only tools come first. Every tool validates Network identity, project scope, typed input and bounded output, and writes audit metadata. External GitHub issue/PR/file contents are untrusted data and cannot change permissions or tool policies. Consequential writes require explicit confirmation and idempotency protection.

If the current app runtime cannot correctly support the chosen MCP HTTP transport and OAuth requirements, host the MCP server separately and use authenticated domain APIs; do not describe ad hoc JSON routes as a conforming MCP service.

## Acceptance gates before calling an integration connected

1. The user can see the GitHub App name, selected repositories and exact permissions.
2. A repository can only be linked if the installation actually has access.
3. A second Network user cannot use the first user's private connection unless they independently have project permission and an authorized GitHub path.
4. Invalid/replayed callback state is rejected.
5. Tokens and private keys never appear in frontend code, browser storage, ordinary database records, API responses or logs.
6. Revoking or uninstalling the GitHub App causes access to fail closed.
7. MCP read tools enforce the same project scope as the web/API; unknown tools and unapproved writes are rejected.
8. Database cross-project reads/writes, duplicate XP events, replayed webhook deliveries and request retries have explicit regression coverage.

## Not yet implemented

The following are roadmap items, not current features: user-visible Connect GitHub flow, GitHub App registration/configuration, repository picker, webhook sync, MCP server, workspace/project data isolation, GitHub write actions, versioned schema migrations and a full XP ledger.
