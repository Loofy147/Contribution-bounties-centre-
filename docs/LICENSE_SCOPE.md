# Proposed License Scope — Review Required

**Status:** Draft for owner review on branch \`licensing/agpl-v3-or-later-review\`. The main branch remains without a selected license until an authorized maintainer merges the pull request.

## Proposal

Use **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)** for first-party application software source in this repository, subject to a rights/provenance review before merge.

This is an open-source license that permits commercial use. It is not a noncommercial or “no paid bounties” license. Its network-copyleft conditions are meant to require covered modified server versions to offer their source code to users interacting with those versions over a network. Maintainers must understand the corresponding-source and notice obligations before release.

## Proposed scope

The proposal is intended for first-party application source and supporting tests/configuration maintained in this repository. It does not relicense or convey rights to:

- The AppDeploy hosting platform, its \`@appdeploy/sdk\` or \`@appdeploy/client\` packages, or services provided by AppDeploy.
- Third-party dependencies, icons, fonts, model assets, datasets, user submissions, sample media, logos, trademarks, or any content whose rights are owned by another party.
- External software or material with incompatible terms.
- Credentials, secrets, production data, or user-submitted evidence.

The application README currently notes that \`@appdeploy/sdk\` and \`@appdeploy/client\` are imported but are not declared in the checked-in package manifest. Those packages are not included or licensed by this proposal. A separate dependency/runtime decision and an independent build are still required.

## Required checks before merge

1. The maintainer confirms that they have the right to license all first-party source and documentation that will be covered by AGPL.
2. Identify imported/generated code, copied snippets, design assets, and all files whose provenance is unknown; resolve them or exclude them from the license scope.
3. Inventory third-party dependencies and confirm that their terms are compatible; do not treat AppDeploy packages as first-party source.
4. Confirm the intended policy for future contributions and whether a Developer Certificate of Origin or contributor agreement is needed.
5. Keep the independent-build limitation and unverified live end-to-end tests explicit after the license is selected.

**Do not merge this PR solely because a LICENSE file exists.** Licensing is a rights grant; the owner must confirm the grant can lawfully be made for the covered material.

## Official text and explanations

- GNU AGPL v3.0: https://www.gnu.org/licenses/agpl-3.0.html
- GitHub repository licensing guidance: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
