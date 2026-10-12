# Security policy

## Scope

This repository contains an evolving prototype, not a claim of production security. Sensitive areas include authentication/authorization, bounty ownership, submission ownership, review transitions, persistence consistency, evidence URLs, and XP/reputation updates.

## Reporting a vulnerability

Do not post exploitable details, credentials, personal data, or production records in a public issue. Use GitHub's private vulnerability reporting option if it is enabled, or contact the repository owner privately. Include impact, affected version/path, prerequisites, and a minimal reproduction. Redact real user identifiers and secrets.

If no private channel is available, contact the project owner before publishing a proof of concept that could affect real users.

## Review expectations

- Enforce access control and input validation on the server.
- Treat client data, evidence URLs, and submitted text as untrusted.
- Test direct API requests, not only disabled interface controls.
- Check race conditions/idempotency for acceptance, resubmission, and reward side effects.
- Do not log credentials or unnecessary personal data.
- Review third-party dependencies and runtime integrations.

## Current limitations

The client/server runtime depends on AppDeploy-provided packages not currently declared in the repository manifest. No independent security audit or comprehensive adversarial test has been completed. Do not send real money or sensitive information through this prototype.
