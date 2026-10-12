# Contributions Centre

**Contributions Centre** is a platform concept for discovering, organizing, reviewing, and rewarding useful contributions across different kinds of work. **ContribQuest** is the current live prototype.

- **Live prototype:** https://contribquest-lygj1x.v2.appdeploy.ai/
- **Canonical repository:** https://github.com/Loofy147/Contribution-bounties-centre-

## Current product model

The prototype models bounties with explicit acceptance criteria and submissions tied to a snapshot of those criteria. Bounty owners review submissions against each criterion and provide written rationale. A submission can be accepted, rejected, or sent back for changes; contributors can revise and resubmit work that needs changes.

The prototype also increments XP/reputation on acceptance. XP is a platform signal, not a verified measure of real-world ability. Paid offers, where shown, are listings only: the prototype does not provide escrow, payment processing, or a guaranteed payout.

## Product principles

1. **Outcomes over activity.** Reward useful, reviewable deliverables rather than clicks, time spent, or unsupported claims.
2. **Explicit acceptance.** Define observable acceptance criteria before work begins.
3. **Evidence and rationale.** Submissions need a written explanation and may include a supporting URL. Reviews record criterion checks and written reasoning.
4. **Auditable workflow.** Preserve state transitions, review history, and revised submission versions.
5. **Server-side enforcement.** Authorization and consequential state changes must be validated on the server, not only in the browser.
6. **Honest reputation.** Distinguish platform points from independently demonstrated competence.

## Engineering status

The live prototype is deployed on AppDeploy and uses platform-provided runtime dependencies. This repository is being established as the canonical engineering home. It has not yet been verified as independently buildable or self-hostable from repository contents alone; runtime dependencies and deployment instructions must be confirmed before claiming a reproducible standalone build.

A small test manifest exists in the deployed prototype for acceptance-criteria and workflow scenarios. Those checks are not a substitute for live end-to-end testing with separate contributor and bounty-owner accounts.

## Near-term engineering plan

- Import and version the current deployed frontend, backend, configuration, and test manifest.
- Document the platform-injected runtime and create a reproducible development/test path.
- Execute two-account end-to-end tests for submission, change request, resubmission, acceptance, duplicate handling, and unauthorized transitions.
- Improve evidence handling, auditability, notifications, and payment integration only with explicit security and operational controls.

## License

No open-source license has been selected. Public visibility does not by itself grant permission to reuse, modify, or redistribute the project. Choose a license deliberately before presenting this as licensed open source.

## Status and claims

This is an evolving prototype. Treat features described here as implemented only to the extent verified in source and the running application. Security, payout, identity, and production-readiness claims require dedicated testing and review.
