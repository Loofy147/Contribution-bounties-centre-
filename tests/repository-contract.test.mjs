import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('./tests.json', import.meta.url), 'utf8'),
);
const backend = await readFile(new URL('../backend/index.ts', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const projectContributions = await readFile(new URL('../src/ProjectContributions.tsx', import.meta.url), 'utf8');
const projectReviewQueue = await readFile(new URL('../src/ProjectReviewQueue.tsx', import.meta.url), 'utf8');
const analytics = await readFile(new URL('../src/analytics.ts', import.meta.url), 'utf8');
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
const gitleaksConfig = await readFile(new URL('../.gitleaks.toml', import.meta.url), 'utf8');

test('QA manifest includes the core workflow scenarios', () => {
  assert.equal(manifest.length, 6, 'expected six consolidated browser scenarios');
  assert.equal(
    manifest.filter((item) => item.sanity === true).length,
    1,
    'exactly one scenario should be marked as the sanity test',
  );

  const names = new Set(manifest.map((item) => item.name));
  for (const required of [
    'Browse bounties and inspect the acceptance contract',
    "Record and verify the founder's project contribution",
    'Keep higher-risk work provisional until stronger review',
    'Preserve bounty submission, review, revision and XP controls',
    'Check account and GitHub integration safety',
    'Independently review and revise shared project work',
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


test('Project 0 contribution records link work and restrict self-verification XP', () => {
  assert.ok(backend.includes("function userProjectContributionsTable(userId: string)"));
  assert.ok(backend.includes("'GET /api/project-contributions'"));
  assert.ok(backend.includes("'POST /api/project-contributions'"));
  assert.ok(backend.includes("'POST /api/project-contributions/:id/verify'"));
  assert.ok(backend.includes('requiresIndependentProjectReview(contribution)'));
  assert.ok(backend.includes("ruleVersion: 'project-self-v1'"));
  assert.ok(backend.includes("appendAuditEvent(user.userId, 'project_contribution.self_verified'"));
  assert.ok(frontend.includes("import ProjectContributions from './ProjectContributions'"));
  assert.ok(projectContributions.includes("api.post('/api/project-contributions'"));
  assert.ok(projectContributions.includes('item.workUrl'));
  assert.ok(projectContributions.includes('item.evidenceUrl'));

  const verifyRoute = backend.slice(
    backend.indexOf("'POST /api/project-contributions/:id/verify'"),
    backend.indexOf("'GET /api/bounties'")
  );
  assert.ok(verifyRoute.includes("record: { xp: increment(50) }"));
  assert.ok(verifyRoute.includes("db.tx.add('xp_awards'"));
  assert.ok(verifyRoute.includes("if (contribution.riskLevel !== 'low' || reviewRequired)"));
  assert.equal(verifyRoute.includes("acceptedCount: increment(1)"), false);
});

test('shared project contributions require independent workspace review', () => {
  assert.ok(backend.includes("function workspaceProjectContributionsTable(workspaceId: string)"));
  assert.ok(backend.includes("'GET /api/workspaces/:workspaceId/project-contributions/review-queue'"));
  assert.ok(backend.includes("'POST /api/workspaces/:workspaceId/project-contributions/:id/review'"));
  assert.ok(backend.includes("'POST /api/project-contributions/:id/resubmit'"));
  assert.ok(backend.includes("if (contribution.workspaceId)"));
  assert.ok(backend.includes("'project-independent-v1'"));
  assert.ok(backend.includes("contribution.contributorId === user.userId"));
  assert.ok(backend.includes("decision === 'accepted' && !criteriaChecks.every(Boolean)"));

  const reviewRoute = backend.slice(
    backend.indexOf("'POST /api/workspaces/:workspaceId/project-contributions/:id/review'"),
    backend.indexOf("'POST /api/project-contributions/:id/resubmit'")
  );
  assert.ok(reviewRoute.includes("membership.role !== 'workspace_admin' && membership.role !== 'reviewer'"));
  assert.ok(reviewRoute.includes("db.tx.add('xp_awards'"));
  assert.ok(reviewRoute.includes("db.tx.update('profiles'"));
  assert.ok(reviewRoute.includes("verificationLevel: 'independently_verified'"));
  assert.equal(reviewRoute.includes("acceptedCount: increment(1)"), false);
  assert.ok(reviewRoute.includes("if (decision === 'accepted' && !criteriaChecks.every(Boolean))"));

  const resubmitRoute = backend.slice(
    backend.indexOf("'POST /api/project-contributions/:id/resubmit'"),
    backend.indexOf("'GET /api/bounties'")
  );
  assert.ok(resubmitRoute.includes("contribution.status !== 'needs_changes'"));
  assert.ok(resubmitRoute.includes("contributorId: user.userId"));
  assert.ok(resubmitRoute.includes("revisionNumber"));

  assert.ok(projectContributions.includes("Shared review workspace"));
  assert.ok(projectContributions.includes("ProjectReviewQueue"));
  assert.ok(projectContributions.includes("'/resubmit'"));
  assert.ok(projectContributions.includes("reviewHistory"));
  assert.ok(projectReviewQueue.includes("project-contributions/review-queue"));
  assert.ok(projectReviewQueue.includes("!draft.criteriaChecks.every(Boolean)"));
  assert.ok(projectReviewQueue.includes("submitReview(item, 'needs_changes')"));
  assert.ok(projectReviewQueue.includes("submitReview(item, 'rejected')"));
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

test('PostHog analytics uses explicit low-PII events and disables ambient data capture', () => {
  assert.ok(packageManifest.dependencies['posthog-js']);
  for (const setting of [
    'autocapture: false',
    'capture_pageview: false',
    'capture_pageleave: false',
    'disable_session_recording: true',
    'disable_surveys: true',
    "person_profiles: 'identified_only'",
    'ip: false',
  ]) assert.ok(analytics.includes(setting), 'missing privacy setting: ' + setting);
  assert.ok(analytics.includes('posthog.identify(userId)'));
  assert.ok(analytics.includes('posthog.reset()'));
  assert.ok(!/posthog\.identify\([^)]*(email|displayName|name)/i.test(analytics));
  assert.ok(frontend.includes("acceptance_criteria_count: bountyForm.acceptanceCriteria.split('\\n')"));
  for (const event of [
    'product_area_viewed',
    'bounty_created',
    'contribution_submitted',
    'contribution_resubmitted',
    'contribution_reviewed',
  ]) {
    assert.ok(analytics.includes("'" + event + "'"), 'missing declared event: ' + event);
    assert.ok(frontend.includes("captureProductEvent('" + event + "'"), 'missing capture call: ' + event);
  }
  assert.ok(frontend.includes('identifyAnalyticsUser(current.userId)'));
  assert.ok(frontend.includes('resetAnalyticsIdentity()'));
});

test('Gitleaks exception is limited to the public analytics key finding', () => {
  assert.ok(secretsWorkflow.includes('--config .gitleaks.toml'));
  assert.ok(gitleaksConfig.includes('targetRules = ["generic-api-key"]'));
  assert.ok(gitleaksConfig.includes('condition = "AND"'));
  assert.ok(gitleaksConfig.includes('commits = ["9781e3f639ba6008d18a08c14a11fb4c5b2ab44f", "48abb5f14d37f4574d1bff2a9c6e4c7fb5ca6f37"]'));
  assert.ok(gitleaksConfig.includes("src/analytics"));
  assert.ok(gitleaksConfig.includes('public PostHog JS ingestion project key'));
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
