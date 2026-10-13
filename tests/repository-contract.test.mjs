import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('./tests.json', import.meta.url), 'utf8'),
);
const backend = await readFile(new URL('../backend/index.ts', import.meta.url), 'utf8');
const packageManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const workflow = await readFile(
  new URL('../.github/workflows/repository-contract.yml', import.meta.url),
  'utf8',
);
const codeqlWorkflow = await readFile(
  new URL('../.github/workflows/codeql.yml', import.meta.url),
  'utf8',
);
const secretsWorkflow = await readFile(
  new URL('../.github/workflows/secrets-scan.yml', import.meta.url),
  'utf8',
);

test('QA manifest includes the core workflow scenarios', () => {
  assert.equal(manifest.length, 10, 'expected ten documented browser scenarios');
  assert.equal(
    manifest.filter((item) => item.sanity === true).length,
    1,
    'exactly one scenario should be marked as the sanity test',
  );

  const names = new Set(manifest.map((item) => item.name));
  for (const required of [
    'Browse bounties and inspect the acceptance contract',
    'Create a bounty with validated acceptance criteria',
    'Submit work against a snapshot of agreed criteria',
    'Request changes, revise, and accept only the compliant version',
    'Reject unauthorized and incomplete acceptance transitions',
    'Review account roles and GitHub connection prerequisites',
  ]) {
    assert.ok(names.has(required), `missing QA scenario: ${required}`);
  }
});

test('backend source retains key acceptance and resubmission guards', () => {
  assert.match(backend, /'POST \/api\/bounties': \[\s*requireAuth\(\)/);
  assert.match(backend, /acceptanceCriteria\.length < 1 \|\| acceptanceCriteria\.length > 10/);
  assert.match(backend, /new Set\(acceptanceCriteria\.map\(item => item\.toLowerCase\(\)\)\)\.size !== acceptanceCriteria\.length/);
  assert.match(backend, /Provide between 1 and 10 acceptance criteria/);
  assert.match(backend, /acceptanceCriteria: \[\.\.\.acceptanceCriteria\]/);
  assert.match(backend, /'POST \/api\/contributions\/:id\/resubmit': \[\s*requireAuth\(\)/);
  assert.match(backend, /contribution\.submitterId !== user\.userId/);
  assert.match(backend, /contribution\.status !== 'needs_changes'/);
  assert.match(backend, /criteriaChecks\.length !== acceptanceCriteria\.length/);
  assert.match(backend, /status === 'accepted' && !criteriaChecks\.every\(Boolean\)/);
  assert.match(backend, /record: \{ xp: increment\(50\), acceptedCount: increment\(1\) \}/);
});


test('authenticated work views use private per-user indexes and bounded legacy migration', () => {
  assert.ok(backend.includes('function userPartitionKey(userId: string)'));
  assert.ok(backend.includes('function userBountiesTable(userId: string)'));
  assert.ok(backend.includes('function userSubmissionsTable(userId: string)'));
  assert.ok(backend.includes('function userReceivedTable(userId: string)'));
  assert.ok(backend.includes('function advanceWorkIndexMigration(userId: string)'));
  assert.ok(backend.includes("'active_submissions'"));
  assert.ok(backend.includes('confirmedGuard.contributionId === id'));
  assert.ok(backend.includes('if (!migration.contributionsDone)'));

  const myWorkRoute = backend.slice(
    backend.indexOf("'GET /api/my-work'"),
    backend.indexOf("'POST /api/contributions/:id/resubmit'")
  );
  assert.ok(myWorkRoute.includes('advanceWorkIndexMigration(user.userId)'));
  assert.ok(myWorkRoute.includes('userBountiesTable(user.userId)'));
  assert.ok(myWorkRoute.includes('userSubmissionsTable(user.userId)'));
  assert.ok(myWorkRoute.includes('userReceivedTable(user.userId)'));
  assert.equal(myWorkRoute.includes("db.list<Bounty>('bounties'"), false);
  assert.equal(myWorkRoute.includes("db.list<Contribution>('contributions'"), false);
  assert.ok(myWorkRoute.includes('indexing: !(migration.bountiesDone && migration.contributionsDone)'));

  const submitRoute = backend.slice(
    backend.indexOf("'POST /api/bounties/:id/submit'"),
    backend.indexOf("'GET /api/my-work'")
  );
  assert.ok(submitRoute.includes('if (!migration.contributionsDone)'));
  assert.ok(submitRoute.includes('Your existing contribution history is still being indexed.'));
  assert.equal(submitRoute.includes("db.list<Contribution>('contributions'"), false);
});

test('account roles and GitHub identity linking enforce server-side boundaries', () => {
  for (const route of [
    "'GET /api/account/security'",
    "'POST /api/workspaces'",
    "'GET /api/workspaces/:workspaceId/members'",
    "'POST /api/access/workspaces/:workspaceId/members'",
    "'DELETE /api/access/workspaces/:workspaceId/members/:userId'",
    "'POST /api/integrations/github/start'",
    "'GET /api/integrations/github/callback'",
    "'POST /api/integrations/github/disconnect'",
  ]) assert.ok(backend.includes(route), 'missing route: ' + route);

  assert.ok(backend.includes("secrets.readSecret(GITHUB_CLIENT_SECRET_SECRET)"));
  assert.ok(backend.includes("const PLATFORM_OWNER_SECRET = 'PLATFORM_OWNER_EMAILS'"));
  assert.ok(backend.includes("if (!(await isPlatformOwner(user)))"));
  assert.ok(backend.includes("if: { status: 'pending', appUserId: savedState.appUserId }"));
  assert.ok(backend.includes("new Date(savedState.expiresAt).getTime() <= Date.now()"));
  assert.ok(backend.includes("'github_identity_owners'"));
  assert.ok(backend.includes("'audit_events'"));
  assert.ok(backend.includes("workspaceMembersTable(workspaceId)"));
  assert.ok(backend.includes("userWorkspaceMembershipsTable(targetAccount.userId)"));
  assert.ok(backend.includes('The target must sign in to ContribQuest once before they can be assigned a role.'));
  assert.ok(backend.includes('A workspace must retain at least one administrator.'));
  assert.ok(backend.includes('Only a platform owner can remove a workspace administrator.'));
  assert.ok(backend.includes('repository installation is a separate pending step'));
  assert.doesNotMatch(backend, /record:\s*\{[^}]*accessToken/s);
});

test('package exposes a dependency-free contract test command', () => {
  assert.equal(packageManifest.private, true);
  assert.equal(packageManifest.type, 'module');
  assert.equal(
    packageManifest.scripts['test:contract'],
    'node --test tests/repository-contract.test.mjs',
  );
});

test('CI workflow has least privilege, immutable actions, and bounded execution', () => {
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^concurrency:/m);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /\\\\\$\\{\\{/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\./);

  const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s]+)/gm)]
    .map((match) => match[1]);

  assert.ok(actionRefs.length >= 2, 'expected checkout and Node setup actions');
  for (const reference of actionRefs) {
    assert.match(
      reference,
      /@[a-f0-9]{40}$/i,
      `workflow action must be pinned to a full commit SHA: ${reference}`,
    );
  }
});


test('CodeQL is enabled for JavaScript and TypeScript with job-scoped write permission', () => {
  assert.doesNotMatch(codeqlWorkflow, /\\\\\$\\{\\{/);
  assert.match(codeqlWorkflow, /^  pull_request:/m);
  assert.match(codeqlWorkflow, /^  schedule:/m);
  assert.match(codeqlWorkflow, /languages: javascript-typescript/);
  assert.match(codeqlWorkflow, /build-mode: none/);
  assert.match(codeqlWorkflow, /security-events: write/);
  assert.match(codeqlWorkflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(codeqlWorkflow, /pull_request_target/);
  assert.doesNotMatch(codeqlWorkflow, /secrets\./);

  const actionRefs = [...codeqlWorkflow.matchAll(/^\s*uses:\s*([^\s]+)/gm)]
    .map((match) => match[1]);
  assert.ok(actionRefs.length >= 3, 'expected checkout and CodeQL init/analyze');
  for (const reference of actionRefs) {
    assert.match(
      reference,
      /@[a-f0-9]{40}$/i,
      `workflow action must be pinned to a full commit SHA: ${reference}`,
    );
  }
});


test('secret scanning installs a pinned CLI without account lookup or report uploads', () => {
  assert.doesNotMatch(secretsWorkflow, /\\\\\$\\{\\{/);
  assert.match(secretsWorkflow, /^permissions:\n  contents: read$/m);
  assert.match(secretsWorkflow, /fetch-depth: 0/);
  assert.match(secretsWorkflow, /go-version: "1\.25\.4"/);
  assert.match(secretsWorkflow, /go install github\.com\/zricethezav\/gitleaks\/v8@v8\.30\.0/);
  assert.match(secretsWorkflow, /gitleaks detect --source \. --redact/);
  assert.ok(secretsWorkflow.includes("REPORT_PATH: ${{ runner.temp }}/gitleaks-report.json"));
  assert.ok(secretsWorkflow.includes("jq -c '[.[] | {RuleID, File, Commit, StartLine, Fingerprint}]'"));
  assert.match(secretsWorkflow, /rm -f "\$REPORT_PATH"/);
  assert.doesNotMatch(secretsWorkflow, /Match, Secret/);
  assert.doesNotMatch(secretsWorkflow, /pull_request_target/);
  assert.doesNotMatch(secretsWorkflow, /pull-requests:\s*write/);
  assert.doesNotMatch(secretsWorkflow, /secrets\./);
  assert.doesNotMatch(secretsWorkflow, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT/);

  const actionRefs = [...secretsWorkflow.matchAll(/^\s*uses:\s*([^\s]+)/gm)]
    .map((match) => match[1]);
  assert.ok(actionRefs.length >= 2, 'expected checkout and Go setup actions');
  for (const reference of actionRefs) {
    assert.match(
      reference,
      /@[a-f0-9]{40}$/i,
      `workflow action must be pinned to a full commit SHA: ${reference}`,
    );
  }
});
