# Contributions Centre

Contributions Centre is the initial application prototype for the [Contribution Network](https://github.com/Loofy147/contribution-network), which is its own first real project and first consumer use case. **ContribQuest** is the current live prototype. The founder's useful work is eligible to be recorded as a contribution; the current app does not yet implement the complete founder self-contribution XP and verification-level workflow.

- **Live prototype:** https://contribquest-lygj1x.v2.appdeploy.ai/
- **Canonical repository:** https://github.com/Loofy147/Contribution-bounties-centre-
- **Imported deployed source snapshot:** AppDeploy version 1791833721555

## Current working boundary

Active development stays in this repository and the [strategic Contribution Network repository](https://github.com/Loofy147/contribution-network). The separate [`contribution-cloud/Contributions-centre`](https://github.com/contribution-cloud/Contributions-centre) is reserved as the future portfolio/repository control plane. It is **not** this application's current runtime or an active implementation dependency, and it must remain untouched until the system passes the readiness gates in the [first-consumer charter](https://github.com/Loofy147/contribution-network/blob/main/docs/10-first-consumer-project-charter.md).

The two GitHub accounts are separate authorization boundaries. A connection or permission in one does not imply access through the other.

## What's in this repository

This repository contains the deployed frontend, backend, configuration, and test manifest. The frontend uses React, Vite, TypeScript, and Lucide icons. Its backend imports the platform-provided @appdeploy/sdk; the frontend imports @appdeploy/client.

**Runtime caveat:** these AppDeploy integration packages are not declared in the checked-in package.json. This source snapshot has not yet been demonstrated to build or run independently outside AppDeploy. Do not treat the source import as proof of a reproducible self-hosted deployment.

## Product model

Bounties define 1–10 distinct acceptance criteria: one clear, verifiable criterion is enough for a narrow task, while broader work should be split into focused work packages. A contribution preserves a snapshot of the criteria against which it will be reviewed. Owners record a pass/fail value for every criterion and written rationale; acceptance is blocked unless every criterion passes. Work may be accepted, rejected, or returned for changes. The original contributor can revise and resubmit work returned for changes, while revision and review history are preserved.

Acceptance currently grants 50 platform XP and increments an accepted-work counter. XP is not an independently validated measure of skill. Paid bounty entries are listings only; this prototype does not implement escrow, payment processing, or guaranteed payouts.

## Repository guidance

- [Portfolio alignment and repository responsibilities](docs/portfolio-alignment.md)
- [Platform integration architecture: GitHub, MCP, data boundaries, and engineering primitives](docs/platform-integration-architecture.md)
- [Architecture and runtime boundaries](docs/architecture.md)
- [Acceptance protocol](docs/acceptance-protocol.md)
- [Engineering decisions](docs/decisions.md)
- [Roadmap and verification gates](docs/roadmap.md)
- [CI/CD pipeline and release readiness](docs/ci-cd-pipeline.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## Validation

The repository contract test uses Node's built-in test runner and checks the QA manifest plus selected source-level invariants. It is a static regression guard, **not** an end-to-end test of the running application.

Run it with: node --test tests/repository-contract.test.mjs

The AppDeploy test manifest at tests/tests.json describes five browser scenarios. These scenarios still require live execution with separate contributor and bounty-owner accounts before the workflow can be considered end-to-end verified.

## Initial verification priorities

1. Reproduce the deployed build outside the platform by resolving and documenting the AppDeploy SDK/client dependencies.
2. Run the five browser scenarios against the deployed application using independent owner and contributor identities.
3. Verify authorization, state transitions, review history, and exactly-once XP behavior in real persisted data.
4. Implement and test the charter's founder-contribution path with explicit verification levels; until then, track internal work through GitHub issues/PRs and evidence rather than implying the app has awarded XP.
5. Address evidence uploads, notifications, payout controls, abuse resistance, and operational monitoring before making production-readiness claims.

## License status

The `main` branch remains unlicensed today. This review branch proposes the [GNU Affero General Public License v3.0 or later](LICENSE); the proposal is not effective on `main` unless an authorized maintainer approves and merges it. Before merge, confirm first-party ownership and file provenance. The proposed license does not license AppDeploy's platform, `@appdeploy/sdk`, `@appdeploy/client`, or any third-party dependency or asset. See [license scope and required pre-merge checks](docs/LICENSE_SCOPE.md).
