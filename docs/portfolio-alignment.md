# Portfolio Alignment: Contribution Network and Contributions Centre

**Status:** Implementation boundary, v0.1  
**Date:** 2026-10-12

## Authority and relationship

- **Strategic source of truth:** [Contribution Network](https://github.com/Loofy147/contribution-network)
- **Portfolio charter:** [First-Consumer Project Charter](https://github.com/Loofy147/contribution-network/blob/main/docs/10-first-consumer-project-charter.md)
- **Shared engineering architecture:** [Engineering Primitives and Integration Architecture](https://github.com/Loofy147/contribution-network/blob/main/docs/11-engineering-primitives.md)
- **Application prototype:** this repository, [Contribution Bounties Centre](https://github.com/Loofy147/Contribution-bounties-centre-)
- **Live prototype:** https://contribquest-lygj1x.v2.appdeploy.ai/

The Contribution Network itself is Project 0 and the first real project. Its founder is the first consumer and contributes requirements, architecture, research, implementation, testing, documentation, security analysis, integration, and maintenance. These activities are eligible to be recorded as contributions. The current application does not yet implement the full founder self-contribution XP flow or verification-level labels; until then, use GitHub issues/PRs and inspectable evidence, and do not claim the app awarded XP.

## Shared policy

1. Any relevant, lawful type of contribution may be proposed; software code is not the only valid contribution.
2. A bounty uses 1–10 distinct, observable acceptance criteria. One criterion can be sufficient for a narrow task; split broad work into smaller packages.
3. The contribution preserves the criteria snapshot used for review. The owner records a rationale and a pass/fail result for every criterion.
4. Acceptance requires every criterion to pass. Changes requested, rejection, revisions, and review history must remain traceable.
5. The existing prototype grants 50 XP for accepted work. XP is not cash, an independently validated skill credential, or a guarantee of future paid work.
6. Self-verification, independent human review, and automated checks are different evidence levels. Do not overstate which one occurred.
7. Paid listings are not payment processing, escrow, or a guarantee of payout.
8. No license has been selected for either repository. Public visibility is not a substitute for an explicit license.

## Implementation status and known gaps

- The application source snapshot depends on AppDeploy-provided `@appdeploy/client` and `@appdeploy/sdk`, neither declared in the checked-in package manifest; standalone reproducibility remains unverified.
- The repository contract test checks source-level invariants; it does not run the app or prove deployed authorization and persistence behavior.
- The current app prevents a user from contributing to their own bounty and does not implement the charter's full first-party contribution/verification model.
- XP award idempotency, authorization, state transitions, and separate owner/contributor flows still require live end-to-end verification.
- Multi-project access and data isolation must be implemented and tested before unrelated communities are onboarded.
- Payment, escrow, refunds, disputes, uploads, and monitoring must not be represented as implemented until they actually exist and are verified.

## Change synchronization rule

When policy changes, update in this order:

1. Amend the strategic charter or relevant policy document in `contribution-network`.
2. Link the policy from this repository rather than maintaining a competing copy.
3. Update the application backend and UI to implement the policy.
4. Update contract tests and the browser QA manifest.
5. Update this repository's architecture, decision log, README, and roadmap.
6. Re-fetch the committed files and distinguish repository-level/static verification from live runtime verification.

The charter defines intended behavior; application code defines current behavior. Where they differ, report the gap explicitly and track implementation in the roadmap. Neither a document nor a UI claim is proof that the workflow works.
