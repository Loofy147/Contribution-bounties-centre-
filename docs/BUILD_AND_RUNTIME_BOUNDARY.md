# Build and runtime boundary

## Repository build gate

The repository CI validates the frontend toolchain from a clean checkout:

1. `npm ci --no-audit --no-fund` installs the exact dependency graph recorded by `package-lock.json` (lockfile version 3).
2. TypeScript checks the React frontend and the type-only declaration for the injected AppDeploy client.
3. Vite builds the frontend with `@appdeploy/client` externalized for this **local validation build only**.
4. The artifact smoke test confirms `dist/index.html` and its referenced assets exist and the generated JavaScript still references the injected AppDeploy client.
5. The repository contract suite checks route, ownership, role and runtime-boundary invariants, including lockfile/manifest alignment.

This gives the frontend validation toolchain a reproducible npm dependency graph. It is not a standalone full application build or an AppDeploy deployment certification.

## AppDeploy-owned runtime

- The production backend entrypoint is `backend/index.ts`; AppDeploy injects `@appdeploy/sdk`.
- The frontend imports `api` and `auth` from `@appdeploy/client`; AppDeploy injects that runtime module.
- Neither injected module belongs in `package.json` or `package-lock.json`.
- The type-only declaration in `types/appdeploy-client.d.ts` is used only by TypeScript. It does not provide or replace runtime behavior.
- The local validation build intentionally retains the unresolved AppDeploy client import and is not intended to be served independently.
- Backend runtime validation and deployed QA must be performed against the AppDeploy source snapshot, not inferred from the local frontend bundle.

## Reproducibility status

**Frontend dependency installation and local validation build: verified in CI.** The committed lockfile and `npm ci` pin the frontend dependency resolution. CI also runs TypeScript validation, the Vite validation build, artifact smoke checks, and the source-contract suite.

**Full runtime / independent deployment: not yet reproducible.** The repository still depends on the platform-injected `@appdeploy/client` and `@appdeploy/sdk`. No compatible standalone adapter has been established, and the local validation bundle deliberately leaves the AppDeploy client external. Do not describe the application as self-hostable based only on these checks.

## Current checkpoint

The lockfile change is being proposed separately from `main`. The AppDeploy source snapshot and live deployment version are separate artifacts; source equality or deployment of this branch is not implied. Record the exact repository commit and AppDeploy version for any live end-to-end certification.
