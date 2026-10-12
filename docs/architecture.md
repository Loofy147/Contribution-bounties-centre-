# Architecture and runtime boundaries

## Snapshot identity

The source in this repository was read from AppDeploy application contribquest-lygj1x, applied source version 1791833721555. The current public URL is https://contribquest-lygj1x.v2.appdeploy.ai/.

This is a source snapshot, not a claim that the repository independently reproduces the deployed runtime byte-for-byte.

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

1. An authenticated owner publishes a bounty with 2–10 distinct criteria.
2. A contributor submits an explanation and optional evidence URL. The contribution stores the criteria in force at submission time.
3. The owner reviews the contribution and records a rationale and one Boolean check for every stored criterion.
4. The owner accepts, rejects, or requests changes. Acceptance requires all checks to pass.
5. Only the original contributor may resubmit a needs-changes contribution. Resubmission creates a new revision and returns it to pending review.
6. Acceptance updates the contribution/bounty workflow and awards platform XP.

Server validation is consequential: UI controls alone are not the security boundary. This document describes source-level logic; live integration tests are still required to validate identity, persistence, race handling, and exactly-once side effects in the deployed environment.

## Known boundaries

- Paid offers are listings rather than escrowed or automatically paid contracts.
- A submitted evidence URL is not the same as stored, scanned, or independently verified evidence.
- XP is a product signal, not a professional credential.
- Repository contract tests are static and do not execute API handlers or exercise separate user accounts.
