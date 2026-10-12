# Roadmap and verification gates

Priorities are ordered by risk reduction, not by feature visibility.

## P0 — Reproducible engineering baseline

- [x] Create a canonical repository and document the product/runtime boundary.
- [x] Import deployed frontend, backend, configuration, and QA manifest.
- [x] Add a repository-level static contract test and CI workflow.
- [ ] Resolve AppDeploy-provided @appdeploy/client and @appdeploy/sdk dependencies for a reproducible local path.
- [ ] Record supported runtime versions and verified setup/build commands.
- [ ] Capture a known-good test run with logs/artifacts and exact source version.

**Exit gate:** a clean checkout can install, build, and run the intended suite using documented commands without undeclared platform-injected dependencies.

## P0 — Verify trust-critical workflow transitions

- [ ] Run the browser QA manifest against the live deployment with separate owner and contributor accounts.
- [ ] Prove unauthorized owners cannot review submissions and non-owners cannot resubmit another contributor's work.
- [ ] Prove incomplete criteria checklists cannot be accepted through the UI or direct API requests.
- [ ] Test duplicate submission and repeated review/resubmission paths.
- [ ] Verify XP is awarded once only, including concurrent and retried requests.
- [ ] Verify history and bounty state remain consistent after failures and refreshes.

**Exit gate:** traces and persisted-state checks support the claims; a green UI smoke test alone is insufficient.

## P1 — Evidence and audit quality

- [ ] Decide when URL evidence is enough and when stored artifacts are required.
- [ ] Add safe upload limits, type validation, retention/deletion policy, and abuse controls if uploads are introduced.
- [ ] Define reviewer correction, appeal, recusal, and dispute procedures.
- [ ] Make state transitions and actor identities auditable without exposing unnecessary personal information.

## P1 — Identity, incentives, and anti-abuse

- [ ] Define bot, Sybil, collusion, spam, and self-dealing threat models.
- [ ] Separate activity counts from independently verified competence and impact.
- [ ] Define owner eligibility and conflict-of-interest rules.
- [ ] Evaluate rate limits, duplicate detection, reputation manipulation, and appeals.

## P2 — Money movement and operational readiness

- [ ] Treat monetary offers as listings until a real payment lifecycle exists.
- [ ] Before payouts, design authorization, escrow/provider flows, failed-payment recovery, refunds/disputes, tax/legal requirements, and auditable ledger semantics.
- [ ] Add monitoring, incident response, backup/restore tests, dependency updates, and release/rollback procedures.

## Initial-baseline non-goal

Do not add more reward mechanics before acceptance enforcement, identity, auditability, and exactly-once state changes have been tested against the running backend.
