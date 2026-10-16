# Build and runtime boundary

## Repository build gate

The repository CI validates three things from a clean checkout:

1. TypeScript checks the React frontend and the type-only declaration for the injected AppDeploy client.
2. Vite builds the frontend with `@appdeploy/client` externalized for this **local validation build only**.
3. The artifact smoke test confirms `dist/index.html` and its referenced assets exist and that the generated JavaScript still references the injected AppDeploy client.
4. The dependency-free source-contract suite checks route, ownership, role, and runtime-boundary invariants.

The local build is not a replacement for the AppDeploy deployment build. The generated local bundle retains the AppDeploy client import and is not intended to be served independently.

## AppDeploy-owned runtime

- The production backend entrypoint is `backend/index.ts`; AppDeploy injects `@appdeploy/sdk`.
- The frontend imports `api` and `auth` from `@appdeploy/client`; AppDeploy injects that runtime module.
- Neither injected module belongs in `package.json`.
- The type-only declaration in `types/appdeploy-client.d.ts` is used only by TypeScript. It does not provide or replace runtime behavior.
- Backend runtime validation and deployed QA must be performed against the AppDeploy source snapshot, not inferred from the local frontend bundle.

## Reproducibility status

**Not yet fully reproducible.** The repository does not currently contain `package-lock.json`. CI can clean-install and validate the frontend, but semver ranges may resolve to different transitive versions on future runs. Do not describe this as a lockfile-reproducible build until a lockfile is generated, reviewed, committed, and CI switches to `npm ci`.

## Current checkpoint

At the time this document was added, `main` was `02a9143b7d932cb1679817a494706762e8b85ff4`. The live AppDeploy snapshot is tracked separately in the project handoff. Source equality between the GitHub repository and the full deployed snapshot is not implied by this document.
