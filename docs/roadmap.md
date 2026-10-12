# Roadmap and verification gates

Priorities are ordered by risk reduction, not by feature visibility.

## P0 — Portfolio contract and first-consumer alignment

- [x] Record the Network as the first real project and first-consumer use case in the strategic charter.
- [x] Link this application to the [portfolio charter](https://github.com/Loofy147/contribution-network/blob/main/docs/10-first-consumer-project-charter.md).
- [x] Align acceptance criteria so one clear criterion can be sufficient.
- [ ] Implement founder self-contribution records and explicit verification levels without allowing XP to bypass safety/release gates.
- [ ] Add the minimum project identity and access boundaries needed before unrelated community projects share the instance.

**Exit gate:** documentation and UI/backend policy agree; founder work can be traced to evidence without falsely claiming independent review or app-issued XP; project data is isolated before multi-project/community onboarding.

## P0 — Integration and data boundaries

- [x] Document GitHub App, MCP, database, secret-management, and authorization boundaries.
- [ ] Register a GitHub App with minimal read permissions; configure callback and secrets through the secure secret flow.
- [ ] Implement a read-only Connect GitHub flow with state validation, selected-repository linking, permission display, and disconnect/revocation behavior.
- [ ] Replace growing global list-and-filter access patterns with project/user-scoped lookup paths before unrelated projects are onboarded.
- [ ] Add workspace/project memberships and negative cross-project authorization tests.
- [ ] Define an append-only audit/event contract and idempotent XP ledger/replay handling.
- [ ] Specify MCP tool schemas and authorization. Implement read-only tools only after shared domain services and project scope checks exist.
- [ ] Verify secrets are never exposed in frontend bundles, ordinary records, API responses, or logs.

**Exit gate:** GitHub access is limited to selected repositories; cross-project access is denied; database mutations are auditable and idempotent; MCP is not claimed as connected until transport and authorization tests pass.

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
- [ ] Prove empty, malformed, duplicated, over-limit, or incomplete criteria/checklists are rejected through the UI and direct API requests; verify a single valid criterion can be accepted.
- [ ] Test duplicate submission and repeated review/resubmission paths.
- [ ] Verify XP is awarded once only, including concurrent and retried requests; cover self-contribution separately only after that workflow is implemented.
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
