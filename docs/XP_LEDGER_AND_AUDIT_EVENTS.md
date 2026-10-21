# XP ledger and audit-event contract

**Status:** implementation proposal on `fix/community-xp-ledger-audit`; not merged or live-certified.

## Scope

Community bounty acceptance changes several records: the canonical contribution, contributor/owner indexes, bounty state, contributor XP and accepted-work count, active-submission guard, XP ledger, and audit history. These changes must not be applied independently.

## Community bounty acceptance

The proposed change uses deterministic key `community_xp_<contribution-id>` for one award per accepted contribution. The ledger entry includes:

- award key and contribution ID;
- accepted revision number;
- contributor ID and acting reviewer ID;
- amount (`50`);
- rule version (`community-review-v1`);
- verification level (`independently_reviewed`);
- creation timestamp.

The award record, aggregate XP/count increments, transition from `pending` to `accepted`, bounty completion, index changes, and active-submission removal are submitted as one database transaction. The deterministic award key is a second idempotency barrier: a replay that attempts to create the same award must not increment aggregates unless the whole transaction commits.

The API rejects a review when the contribution is no longer pending or when any criterion is missing/false. If a write outcome is unknown, the handler re-reads the canonical record and returns an explicit duplicate-success response only when the accepted state is visible.

## Append-only audit events

The proposed change appends audit events in the same transaction as:
- initial submission;
- contributor resubmission, with its revision number;
- acceptance, changes-requested or rejection, with actor, target, decision, revision and rule version where relevant.

The current `reviewHistory` and `revisionHistory` arrays are bounded to the latest 20 entries for UI payload size. They remain useful for rendering but are not the only historical record once each transition has an independent `audit_events` entry.

Founder/project-contribution creation and self-verification already append audit events; self-verification also writes the deterministic `project_xp_<contribution-id>` award key.

## Limitations and validation gate

- The repository contract test is source-level regression evidence; it is not an AppDeploy database test.
- This proposal does not claim that the database SDK's conditional writes or multi-table transactions have been fault-injection tested in the live runtime.
- Before closing Issues [#3](https://github.com/Loofy147/Contribution-bounties-centre-/issues/3) or [#7](https://github.com/Loofy147/Contribution-bounties-centre-/issues/7), run two concurrent acceptance requests, retry after an unknown client outcome, force a transaction conflict, and inspect persisted contribution/profile/bounty/index/award/audit rows.
- A migration/reconciliation is still needed to account for historical accepted contributions created before community XP ledger entries existed. Do not fabricate old ledger events or award XP during that reconciliation.
