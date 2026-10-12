# Contributing

Contributions should improve verified outcomes, reliability, security, usability, or documentation. A merged change does not by itself prove the intended outcome was achieved; changes should include a way to inspect or test the result. This repository is the application prototype for the [Contribution Network](https://github.com/Loofy147/contribution-network); portfolio-level policy is defined in its [First-Consumer Project Charter](https://github.com/Loofy147/contribution-network/blob/main/docs/10-first-consumer-project-charter.md).

## Before opening a pull request

1. Check existing issues and the roadmap to avoid duplication.
2. Keep the change narrow and state the user or operator problem it solves.
3. For workflow changes, document permitted and invalid state transitions.
4. For acceptance/reputation changes, explain how bypasses, duplicate side effects, and inconsistent records are prevented.
5. Add or update tests at the right layer. Distinguish static, unit, integration, and live end-to-end checks.
6. Do not add secrets, credentials, real user data, or production database contents.

## Current development limitation

The checked-in source imports AppDeploy-provided @appdeploy/client and @appdeploy/sdk packages, which are absent from package.json. A standalone install/build path is not yet verified. Do not report a successful standalone build until those dependencies are resolved and the command has actually run.

The repository-level static test can be run with: node --test tests/repository-contract.test.mjs

This test does not launch the app or exercise the deployed backend.

## Pull request description

Include the problem, the change, observable acceptance checks, exact verification commands/results, untested paths, likely risks, and rollback plan.

## Quality bar

- Use server-side validation for permissions and consequential transitions.
- Avoid undocumented status changes and hidden reputation side effects.
- Do not imply that points equal payment or verified skill.
- Distinguish self-verification, independent review, and automated checks; state which actually occurred.
- For founder/internal work before self-contribution XP is implemented, link GitHub issue/PR evidence and do not claim the app awarded XP.
- Update architecture/decision docs when behavior or boundaries materially change.
