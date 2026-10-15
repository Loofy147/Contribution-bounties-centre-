# Architecture and runtime boundaries

## Snapshot identity

The source in this repository was read from AppDeploy application contribquest-lygj1x, applied source version 1792091173658. The current public URL is https://contribquest-lygj1x.v2.appdeploy.ai/.

This is a source snapshot, not a claim that the repository independently reproduces the deployed runtime byte-for-byte.

## Portfolio relationship

This repository contains the initial application prototype for the [Contribution Network](https://github.com/Loofy147/contribution-network). The Network itself is the first real project and first-consumer use case. The strategic contract is maintained in the [First-Consumer Project Charter](https://github.com/Loofy147/contribution-network/blob/main/docs/10-first-consumer-project-charter.md); this repository implements only the workflows that are present and tested here. Do not assume founder self-contribution XP, verification-level labeling, or multi-project isolation is fully implemented merely because it is described in the charter.

## Components

- src/App.tsx: React application, UI state, forms, review flows, and calls through @appdeploy/client.
- src/main.tsx and index.html: application entry point.
- src/index.css: styling and responsive layout.
- backend/index.ts: API routes, validation, authorization, contribution workflow, audit/revision history, and XP updates.
- tests/tests.json: browser QA scenario manifest.
- package.json and Vite, TypeScript, Tailwind, and PostCSS config: frontend toolchain configuration as present in the deployed snapshot.

## Platform dependencies

The backend imports @appdeploy/sdk for routing, JSON responses, errors, authentication middleware, database access, and atomic increments. The frontend imports @appdeploy/client for API and authentication operations. Neither dependency is listed in the current package manifest. AppDeploy supplies these integration points; this repository does not yet include a compatible local adapter or independent backend implementation.

Consequences:

1. Do not advertise a clean standalone build until the missing runtime dependencies are resolved.
2. Keep any future local adapter explicit and test it against the hosting platform's observed behavior.
3. Do not replace platform persistence, identity, or authorization with browser-only mocks and claim production behavior is unchanged.

## Core entities

- **Bounty:** description, reward/listing tier, category, skills, creator, lifecycle state, and acceptance criteria.
- **Contribution:** bounty reference, contributor and owner identity, explanation, optional evidence URL, criteria snapshot, review state, and revision metadata.
- **Profile:** display name, XP total, and accepted-work count.

Review events retain reviewer identity, timestamp, rationale, criteria checks, and decision. Review and revision histories are capped to the latest 20 entries by the current implementation.

## Contribution lifecycle

1. An authenticated owner publishes a bounty with 1–10 distinct criteria. One criterion is acceptable for a narrow task; broader scope should be split where practical.
2. A contributor submits an explanation and optional evidence URL. The contribution stores the criteria in force at submission time.
3. The owner reviews the contribution and records a rationale and one Boolean check for every stored criterion.
4. The owner accepts, rejects, or requests changes. Acceptance requires all checks to pass.
5. Only the original contributor may resubmit a needs-changes contribution. Resubmission creates a new revision and returns it to pending review.
6. Acceptance updates the contribution/bounty workflow and awards platform XP. The current 50 XP award is a prototype rule, not money or a verified credential.

Server validation is consequential: UI controls alone are not the security boundary. This document describes source-level logic; live integration tests are still required to validate identity, persistence, race handling, and exactly-once side effects in the deployed environment.

## Known boundaries

- Paid offers are listings rather than escrowed or automatically paid contracts.
- A submitted evidence URL is not the same as stored, scanned, or independently verified evidence.
- XP is a product signal, not a professional credential.
- Repository contract tests are static and do not execute API handlers or exercise separate user accounts.

  
## Project 0 contribution ledger

The app includes a project-contribution ledger alongside community bounties. Private records are stored in a table derived from the authenticated contributor ID. A contributor may optionally associate a record with a workspace they belong to as a contributor, reviewer, or workspace administrator. Workspace association deliberately shares the work record with that workspace's review queue; records without a workspace remain private to the author.

Each record can link to a GitHub issue, pull request, commit, document, test output, or other deliverable, with separate evidence and an evidence note. The record preserves a 1–10 acceptance-criteria snapshot and risk classification.

### Verification modes

- **Private self-verification:** only low-risk, non-sensitive private records qualify. Every criterion must pass and a rationale is required. The unique `project_xp_<contribution-id>` award and profile XP update are committed transactionally. The community accepted-work counter is unchanged.
- **Independent workspace review:** only workspace reviewers and administrators can access the queue and decide a record. The reviewer must be a different account from the contributor. Acceptance requires a Boolean result for every criterion and a written rationale; any failed criterion blocks acceptance. The review event preserves decision, reviewer identity, revision number, timestamp, feedback, and criterion results.
- **Changes requested:** the original contributor may update the delivery description and evidence, then resubmit. The contribution's criteria snapshot stays fixed, revision number increases, and prior review events remain in a history capped at 20 events.
- **Rejected:** the record remains in the contribution history, receives no XP, and cannot be resubmitted through this path. A new submission is required if the work changes materially.
- **Accepted:** the shared and private copies are conditionally updated in one transaction with the review event, audit event, and exactly-once XP award. Independent acceptance uses rule version `project-independent-v1` and increments profile XP by 50 without changing the community accepted-work counter.

Workspace review indexes are only created for work deliberately shared into a workspace. Membership role is checked server-side for reading and reviewing; the contributor cannot review their own submission. The user-scoped ledger remains the contributor's personal history.

GitHub links remain evidence references, not automatic issue/PR synchronization. Automated-check attestation, evidence ingestion/scanning, verified payout, and a formal external credential are separate future capabilities. XP is a prototype reputation signal, not money or a professional qualification.

Repository contract tests assert the route, role, criteria, resubmission, and award invariants. They are static checks, not a substitute for live multi-account integration tests. Before representing the workflow as production-hardened, exercise the full contributor/reviewer lifecycle with two real app accounts and verify race handling and persistence in the deployed database.
