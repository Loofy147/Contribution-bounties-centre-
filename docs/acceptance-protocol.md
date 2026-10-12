# Contribution acceptance protocol

The acceptance protocol reduces ambiguity before work starts and makes review decisions explainable afterward.

## 1. Define the contract before work begins

Every bounty must contain 1–10 criteria, one per line. One clear, verifiable criterion is sufficient for a narrow task; use more only when the scope requires them. The limit of 10 keeps a single review contract manageable—split broader work into smaller work packages. Criteria should be observable, specific, appropriately scoped, and reviewable from evidence. Avoid subjective terms such as “great,” “professional,” or “high quality” without a measurable definition. Keep criteria independent where practical.

Weak: “Improve the UI.”

Better: “At a 390px-wide viewport, the contribution form has no horizontal overflow and all required controls remain usable.”

## 2. Submit evidence, not just a status claim

A submission needs a written explanation. A supporting URL may be attached where relevant. Explain what changed or was produced, where the result can be inspected, and which criteria it addresses.

A URL alone does not prove that a link is accessible, authentic, safe, or sufficient to meet the contract. For sensitive or high-impact work, define stronger evidence requirements in the bounty itself.

## 3. Review every criterion

The reviewer records a pass/fail decision for each criterion and provides specific written rationale. The current backend rejects incomplete checklists, non-Boolean checklist values, and rationale shorter than 15 characters.

Acceptance is valid only when every criterion is marked as met. Do not use acceptance to mean “the contributor tried,” “the work is promising,” or “the owner wants to reward effort.” If effort should be compensated regardless of acceptance, define that policy separately.

## 4. Choose the correct outcome

- **Accept:** all criteria are satisfied by inspectable evidence. Explain why the evidence meets the contract.
- **Request changes:** at least one criterion is not yet satisfied, and a concrete revision could resolve the gap. Name failed criteria and specify the expected correction.
- **Reject:** the submission is materially out of scope, invalid, unsafe, duplicated, or not suitable for revision under the published terms. Explain the basis.

The current product stores changes-requested reviews and permits the original contributor to revise and resubmit. Review and revision history are preserved.

## 5. Avoid unfair or adversarial review

Criteria should not be changed retroactively to reject a submission. Review against the criteria snapshot stored with the contribution. Disclose conflicts of interest and follow any published project-specific policy. Do not request secrets, unsafe code execution, or unrelated unpaid work as a condition of acceptance.

## 6. Reputation and payment are distinct

The current app awards 50 XP and increments an accepted-work count on acceptance. These counters do not independently prove skill, identity, impact, or work quality. Founder contributions are eligible under the portfolio charter, but the running app does not yet implement the full self-contribution and verification-level workflow; use GitHub issues/PRs and evidence as the interim record. The prototype does not escrow funds or execute payouts. A bounty that promises money requires a separate payment process and appropriate security, legal, and operational controls.

## 7. Verification strength must be explicit

The author, reviewer, approver, and payout authority are distinct roles even if one person temporarily fills more than one. Self-checked low-risk work may be recorded as self-verified where the project's rules allow it, but must not be described as independently reviewed. Automated checks prove only the checks that actually ran. Security-sensitive changes, production releases, financial operations, and access-control changes require stronger gates and independent review where available.
