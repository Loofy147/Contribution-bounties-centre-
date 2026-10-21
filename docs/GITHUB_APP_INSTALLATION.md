# GitHub App installation contract

**Status:** implementation proposal on `feat/github-app-installation`. Not deployed or live-certified; the GitHub App registration and AppDeploy backend secrets must exist before connecting any repository.

## Separate the two GitHub concepts

- **GitHub identity linking** uses the existing OAuth/device flow to link one GitHub identity to the user's existing ContribQuest account.
- **GitHub App installation** grants the app access to repositories chosen in GitHub's installation screen. It is a separate per-installation grant and must not be inferred from identity linking or from a PAT.

## Setup

1. Register a GitHub App owned by the intended organization/account.
2. Configure the App **Setup URL** as `https://contribquest-lygj1x.v2.appdeploy.ai/api/integrations/github-app/callback`. Enable redirect after installation updates only if that flow is configured.
3. Keep the existing **User authorization callback URL** at `https://contribquest-lygj1x.v2.appdeploy.ai/api/integrations/github/callback`. That URL serves identity linking; do not replace it with the setup URL.
4. Configure only these repository permissions: Metadata **Read-only**, Contents **Read-only**, Issues **Read-only**, and Pull requests **Read-only**. Do not grant write/admin permissions or other capabilities in this first version.
5. Store the App ID, App slug, and private key using AppDeploy's secure backend-secret entry, under these exact names:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_SLUG`
   - `GITHUB_APP_PRIVATE_KEY`
6. Install the App on selected pilot repositories, not all repositories. This first version accepts between 1 and 100 selected repositories because the verification response is deliberately bounded to one page.

Never put the private key in frontend code, the repository, a normal database record, or logs. Do not paste it into a conversation.

## Verification and persistence model

- The signed-in ContribQuest user requests a setup URL. The backend stores a random, one-time state tied to that exact app user for ten minutes.
- GitHub redirects the installation result to the Setup URL with an installation ID and state. The callback does not rely on an app session cookie; it validates the pending state, expiry, and conditional state claim.
- The backend signs a short-lived RS256 App JWT using the private key, then asks GitHub to verify that the installation exists and belongs to the configured App ID.
- The backend enforces the exact four-permission read-only allowlist. It rejects extra permissions and any permission that is not `read`.
- A short-lived installation access token is minted only as needed to list selected repositories, and it stays in server memory for that request. It is not persisted, returned, or logged.
- Stored connection fields are the installing account, installation ID, selected repository IDs/names, permission summary, and timestamps. The connection record is partitioned by the authenticated ContribQuest user.
- Every status read re-verifies the installation and fetches the current selected-repository list from GitHub. If the App was uninstalled, suspended, revoked, has mismatched identity, or cannot issue an installation token, the backend returns disconnected and omits repository metadata.
- Disconnect removes only the authenticated user's connection record and appends an audit event. A later content-sync endpoint must independently re-verify the installation before using any stored repository snapshot.

## Current limitations

- This is the installation-verification and repository-metadata increment, not the full repository sync engine. No repository content is read or written by these routes.
- More than 100 selected repositories are rejected rather than silently truncated. Narrow the installation selection for now.
- The existing OAuth identity flow and owner-only PAT helper remain separate capabilities.
- Static contract tests do not establish a real GitHub App's configuration, key parsing, GitHub permissions, AppDeploy secret readability, or uninstall/revocation behavior. Validate those with a real but safe pilot installation before closing Issue #5.

## Validation plan

1. Configure the three backend secrets securely and set the GitHub App Setup URL.
2. Install the App on one explicitly selected test repository and verify the listed installation account, ID, exact four read permissions, and repository ID.
3. Verify an account without the saved connection cannot read another account's installation status.
4. Revoke/uninstall the App and confirm the next status request returns `connected: false` and no repository list.
5. Disconnect, restart setup, and verify old/expired/replayed state is rejected.
