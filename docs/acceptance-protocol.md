# Contribution acceptance protocol

The acceptance protocol reduces ambiguity before work starts and makes review decisions explainable afterward.

## 1. Define the contract before work begins

Every bounty must contain 2–10 criteria, one per line. Criteria should be observable, specific, appropriately scoped, and reviewable from evidence. Avoid subjective terms such as “great,” “professional,” or “high quality” without a measurable definition. Keep criteria independent where practical.

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

The current app awards 50 XP and increments an accepted-work count on acceptance. These counters do not independently prove skill, identity, impact, or work quality. The prototype does not escrow funds or execute payouts. A bounty that promises money requires a separate payment process and appropriate security, legal, and operational controls.
