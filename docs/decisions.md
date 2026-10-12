# Engineering decisions and current constraints

This log records decisions that affect the prototype's evolution. New decisions should include context, alternatives, consequences, and a date when appropriate.

## D-001 — Acceptance criteria are part of the submission contract

**Decision:** A bounty requires 1–10 unique criteria. One clear criterion is sufficient for a narrow task; broader work should be split where practical. A submission snapshots those criteria. Reviewers must check every criterion; acceptance is blocked if any check fails.

**Reason:** Review should evaluate the agreed outcome, not subjective impressions after the work is done.

**Consequence:** Criteria need to be verifiable before publication. Future edits must not silently rewrite an existing submission's review contract.

## D-002 — Changes requested is a first-class state

**Decision:** Work can be returned for changes and resubmitted by the original contributor. Previous revision and review events remain inspectable.

**Reason:** Useful work may need correction without losing its audit trail or forcing a second independent submission.

**Consequence:** Resubmission must enforce contributor identity and state on the server. Repeated acceptance must not duplicate XP awards.

## D-003 — XP is not a credential or monetary balance

**Decision:** XP is a platform reputation signal only. It is not cash, guaranteed payment, or a formal credential.

**Reason:** A count can help surface platform history but cannot independently establish competence or impact.

**Consequence:** Product language should avoid unsupported skill or earnings guarantees. XP awards require exactly-once behavior verified under concurrency.

## D-004 — AppDeploy remains the current runtime

**Decision:** The imported code preserves AppDeploy client/server integration points for now.

**Reason:** Replacing the platform runtime during repository initialization would mix source import with an unverified architecture migration.

**Consequence:** The source is not yet claimed to be self-hostable. A local adapter or migration is separate work requiring compatibility tests.

## D-005 — No license is chosen yet

**Decision:** Do not add a license until the project owner deliberately selects one.

**Reason:** A public repository without a license does not automatically grant general reuse rights.

**Consequence:** Contribution guidance must not imply contributions are already covered by an open-source license.

## D-006 — The Network is the first-consumer project

**Decision:** The Contribution Network itself is the first real project; its founder is its first consumer. The application prototype is one implementation of the broader portfolio contract.

**Reason:** Real use by the founder supplies a legitimate internal use case and exposes defects before community expansion.

**Consequence:** Distinguish observed internal usefulness from external market demand. Founder work is eligible to be recorded and receive XP under the published rules, but the current application does not yet implement the complete founder self-contribution and verification-level workflow. Use linked GitHub evidence as the interim record and do not claim app-awarded XP until the workflow actually exists and is tested.

## D-007 — Evidence strength and role separation are explicit

**Decision:** A contribution record must distinguish who authored, reviewed, approved, and handled any payout; record whether evidence was self-verified, independently reviewed, or checked by automation.

**Reason:** A solo project must be able to progress without pretending that self-review is independent review, while security-sensitive operations still need stronger controls.

**Consequence:** XP does not bypass release or security gates. XP awards must be idempotent, and 50 XP remains a prototype rule rather than a financial balance or professional credential.
