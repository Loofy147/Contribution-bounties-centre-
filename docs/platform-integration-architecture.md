# Platform Integration Architecture

**Status:** Implementation boundary, v0.1  
**Date:** 2026-10-12

This application is the first prototype of the broader [Contribution Network](https://github.com/Loofy147/contribution-network). The target integration/data architecture is specified in [Engineering Primitives and Integration Architecture](https://github.com/Loofy147/contribution-network/blob/main/docs/11-engineering-primitives.md). This document records how that target maps to the present app.

## Current implementation

The app uses AppDeploy authentication and its key-value/table database. Current logical tables include bounties, contributions, and profiles. The deployed app is healthy according to its latest AppDeploy status, but standalone build reproducibility remains unverified because the checked-in package manifest does not declare the AppDeploy client/server packages.

The AppDeploy SDK supports backend-only encrypted app secrets, bounded database operations, conditional patches, transactions, and atomic increments. The current app has no configured backend secrets. No GitHub App connection and no Network MCP server are implemented.

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

The current app's /api/my-work endpoint lists global bounded bounty/contribution collections and filters results in the handler. This must not become the multi-project design: the AppDeploy database SDK applies list filters after reads, so growing collections can create cost/latency and risk if future handlers accidentally return records before applying an authorization filter.

Before hosting unrelated projects, introduce explicit project/workspace identity and memberships, server-side authorization checks on every read/write, scoped lookup/index tables or migrate behind a repository interface to a relational store. Treat project IDs supplied by the browser as untrusted. Add negative tests for cross-project reads and writes.

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
