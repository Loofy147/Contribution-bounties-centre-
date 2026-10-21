# CI/CD Pipeline and Release Readiness

**Status:** CI strengthened; independent build and automated deployment remain blocked.  
**Date:** 2026-10-12

## 1. Pipeline inventory

| Workflow | Trigger | What it proves | What it does not prove |
|---|---|---|---|
| `.github/workflows/repository-contract.yml` | Pull request, push to main, manual | Locked npm install, TypeScript frontend check, local Vite build, artifact smoke test, and source/QA-manifest contract checks | AppDeploy backend runtime, live database, two-account browser flow, or deployment |
| `.github/workflows/codeql.yml` | Pull request, push to main, weekly schedule, manual | CodeQL static analysis of JavaScript/TypeScript | Runtime authorization correctness, dependency exploitability, or end-to-end behavior |
| `.github/workflows/secrets-scan.yml` | Pull request, push to main, weekly schedule, manual | Pinned Gitleaks v8.30.0 CLI scans full Git history with redacted output | Protection against secrets added outside covered refs or already leaked externally; revoke exposed credentials immediately |
| Dependabot | Weekly schedule | Candidate updates for npm packages and GitHub Actions | That an update is compatible; update PRs still require CI and review |

All workflow actions are pinned to full commit SHAs. The exact release tags are comments for human review; the SHA is the immutable reference. The contract workflow uses read-only repository permissions, explicit job timeouts, concurrency cancellation, and checkout without persisted credentials.

## 2. Current build limitation

The source snapshot imports AppDeploy-provided `@appdeploy/client` and `@appdeploy/sdk`, neither of which is declared in `package.json`; AppDeploy supplies those runtime integration points.

The current lockfile proposal adds `package-lock.json` (lockfile version 3) and switches CI to `npm ci --no-audit --no-fund`. A clean CI run has successfully executed lockfile generation, `npm ci`, TypeScript validation, the local Vite validation build, the artifact smoke test and the contract suite. The branch/PR still needs review before that lockfile and CI change becomes canonical.

**Frontend toolchain gate: verified on the proposal branch. Full runtime acceptance is still open.** The current check proves the frontend dependencies are reproducible and the generated validation artifact is well formed. It does not resolve or simulate the injected AppDeploy runtime.

The remaining runtime decision is whether the initial supported target is AppDeploy-only or a fully supported local/self-hosted application. Do not add no-op mocks that change production identity, persistence or authorization semantics. A self-hosted path needs a real compatible adapter/runtime contract, backend persistence and auth behavior, and live integration verification before it can be claimed.

## 3. Required CI progression

### P0 — Contract and static security

- Repository contract tests validate the browser QA manifest and critical source invariants.
- CI's own triggers, permissions, action pins, timeout and concurrency settings are guarded by tests.
- CodeQL analyzes JavaScript/TypeScript.
- A pinned Gitleaks CLI scans full history with redacted output and no GitHub account lookup, license dependency, PR comments, or report artifact upload.
- Dependabot proposes dependency and workflow updates.
- Main-branch settings should require appropriate checks after they are stable; settings are not changed by this file.

### P0 — Reproducible build

Add a blocking job only when a real clean-install path exists. It should run:
- `npm ci`;
- `npm run typecheck` after a supported type-check path is implemented;
- `npm run build`;
- an artifact smoke test with an identified artifact digest.

The existing `tsconfig.json` and Vite configuration should be reviewed as part of this work. Do not label a static regex test as a type-check or build.

### P0 — Integration and end-to-end evidence

Use a separate test environment with distinct owner and contributor identities. Verify authorization, criterion snapshots, rejection/change-request/resubmission transitions, audit history, persisted state, concurrency and exactly-once XP updates. Do not use production data or secrets in untrusted pull-request tests.

## 4. CD is deliberately disabled

The app currently runs on AppDeploy. A verified GitHub Actions deployment interface, scoped deployment credential, reproducible build artifact, protected environment, post-deploy smoke test and rollback mechanism have not been established. No workflow should claim that a GitHub commit was deployed merely because the contract or CodeQL workflow passed.

Before enabling deployment:
1. document and test the supported AppDeploy deploy API/CLI or integration;
2. produce an immutable artifact from a clean, locked build;
3. add a protected GitHub Environment with approver requirements;
4. store only scoped deployment credentials in environment secrets;
5. require build, contract, dependency and security gates;
6. deploy by commit/artifact identity, never from arbitrary pull-request code;
7. run smoke/health checks and record the deployed version;
8. stop promotion and roll back or recover if verification fails.

The public prototype URL is not proof that the current repository commit is deployed. Keep the source snapshot version and the live AppDeploy version as distinct facts until deployment provenance is verified.

## 5. Recommended repository settings

After the new checks have produced verified successful runs:
- protect `main` with pull requests and required CI checks;
- require CodeQL results before merging where supported;
- prevent force pushes and branch deletion;
- require review for workflow and credential-handling changes;
- limit who can bypass checks;
- keep the default workflow token read-only and grant extra permissions only at job scope.

These are recommended settings, not claims that repository protection rules have been enabled.

## 6. Pipeline change acceptance

For every workflow change, verify the committed YAML, trigger behavior, action SHAs, permission scopes, run status, job logs and resulting artifacts. Re-fetch the files from GitHub. If a check is skipped, unavailable or blocked, document that fact rather than reporting it as passed.

The strategic release specification is maintained in the [CI/CD pipeline and quality-gate document](https://github.com/Loofy147/contribution-network/blob/main/docs/13-ci-cd-and-quality-gates.md).
