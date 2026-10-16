import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { requireUniqueMcpOwner } from '../backend/mcp-owner-resolution.mjs';

const manifest = JSON.parse(
  await readFile(new URL('./tests.json', import.meta.url), 'utf8'),
);
const backend = await readFile(new URL('../backend/index.ts', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const projectContributions = await readFile(new URL('../src/ProjectContributions.tsx', import.meta.url), 'utf8');
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

test('MCP owner selection fails closed unless exactly one identity remains', () => {
  assert.throws(
    () => requireUniqueMcpOwner([]),
    /mcp_owner_missing_or_ambiguous/,
    'an empty allowlist must not resolve an owner',
  );
  assert.throws(
    () => requireUniqueMcpOwner([
      { userId: 'owner-a', email: 'first@example.test' },
      { userId: 'owner-b', email: 'second@example.test' },
    ]),
    /mcp_owner_missing_or_ambiguous/,
    'multiple distinct owner identities must be rejected',
  );
  assert.throws(
    () => requireUniqueMcpOwner([
      { userId: '  ', email: 'owner@example.test' },
    ]),
    /mcp_owner_missing_or_ambiguous/,
    'malformed identity values must not count as a valid owner',
  );
  assert.deepEqual(
    requireUniqueMcpOwner([
      { userId: 'owner-a', email: 'alias@example.test' },
      { userId: 'owner-a', email: 'owner@example.test' },
    ]),
    { userId: 'owner-a', email: 'owner@example.test' },
    'multiple allowlisted email aliases for the same account are one identity',
  );
});

test('MCP tools resolve and validate the owner before returning account-scoped data', () => {
  const resolver = backend.slice(
    backend.indexOf('async function resolveMcpOwner'),
    backend.indexOf('function mcpHeaderValue'),
  );
  const executor = backend.slice(
    backend.indexOf('async function executeMcpTool'),
    backend.indexOf('async function handleMcpRequest'),
  );
  assert.ok(resolver.includes('requireUniqueMcpOwner(candidates)'));
  assert.ok(resolver.includes('isPlatformOwner({ userId: selected.userId, email: selected.email })'));
  assert.ok(resolver.includes("if (!identity) throw new Error('mcp_owner_identity_missing')"));
  assert.match(executor, /owner = await resolveMcpOwner\(\)/);
  assert.match(executor, /return mcpToolFailure\('The configured platform-owner account could not be resolved uniquely/);
});

test('MCP tool declarations distinguish read-only tools from bounty creation', () => {
  const definitions = backend.slice(
    backend.indexOf('function mcpToolDefinitions'),
    backend.indexOf('function mcpToolSuccess'),
  );
  const readOnly = [
    'contribquest_get_status',
    'contribquest_list_bounties',
    'contribquest_get_bounty',
    'contribquest_get_my_work',
    'contribquest_list_workspaces',
  ];
  for (const name of readOnly) {
    const nameOffset = definitions.indexOf("name: '" + name + "'");
    assert.ok(nameOffset >= 0, 'missing MCP tool definition: ' + name);
    const start = definitions.lastIndexOf('    {', nameOffset);
    const closing = definitions.indexOf('\n    },', nameOffset);
    const declaration = definitions.slice(start, closing + 7);
    assert.match(declaration, /readOnlyHint: true/, name + ' must be annotated read-only');
  }
  const writeOffset = definitions.indexOf("name: 'contribquest_create_bounty'");
  assert.ok(writeOffset >= 0, 'missing bounty creation tool');
  const writeStart = definitions.lastIndexOf('    {', writeOffset);
  const writeClosing = definitions.indexOf('\n    },', writeOffset);
  assert.match(definitions.slice(writeStart, writeClosing + 7), /readOnlyHint: false/);
});


test('QA manifest includes the core workflow scenarios', () => {
  assert.equal(manifest.length, 5, 'expected five consolidated browser scenarios');
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


test('every API route has an explicit public, bearer, session, or one-time-state boundary', () => {
  const routePattern = /^[ \t]{2}'((?:OPTIONS|GET|POST|PUT|PATCH|DELETE) \/api\/[^']+)': \[/gm;
  const declarations = [...backend.matchAll(routePattern)];
  const declaredRoutes = declarations.map((match) => match[1]);
  const expectedRoutes = [
    'OPTIONS /api/mcp',
    'GET /api/mcp',
    'POST /api/mcp',
    'GET /api/_healthcheck',
    'GET /api/account/security',
    'GET /api/workspaces',
    'POST /api/workspaces',
    'GET /api/workspaces/:workspaceId/members',
    'POST /api/access/workspaces/:workspaceId/members',
    'DELETE /api/access/workspaces/:workspaceId/members/:userId',
    'POST /api/integrations/github/pat/verify',
    'POST /api/integrations/github/pat/file/read',
    'POST /api/integrations/github/pat/file/write',
    'POST /api/integrations/github/start',
    'POST /api/integrations/github/device/start',
    'POST /api/integrations/github/device/poll',
    'GET /api/integrations/github/callback',
    'POST /api/integrations/github/disconnect',
    'GET /api/project-contributions',
    'POST /api/project-contributions',
    'POST /api/project-contributions/:id/verify',
    'GET /api/bounties',
    'GET /api/leaderboard',
    'POST /api/bounties',
    'POST /api/bounties/:id/submit',
    'GET /api/my-work',
    'POST /api/contributions/:id/resubmit',
    'POST /api/contributions/:id/review',
  ];
  assert.deepEqual(
    [...declaredRoutes].sort(),
    [...expectedRoutes].sort(),
    'every API route, including newly added routes, must be classified in this contract',
  );

  const routeSource = (name) => {
    const index = declarations.findIndex((match) => match[1] === name);
    assert.notEqual(index, -1, 'missing declared route: ' + name);
    return backend.slice(
      declarations[index].index,
      declarations[index + 1]?.index ?? backend.length,
    );
  };

  const sessionProtected = [
    'GET /api/account/security',
    'GET /api/workspaces',
    'POST /api/workspaces',
    'GET /api/workspaces/:workspaceId/members',
    'POST /api/access/workspaces/:workspaceId/members',
    'DELETE /api/access/workspaces/:workspaceId/members/:userId',
    'POST /api/integrations/github/pat/verify',
    'POST /api/integrations/github/pat/file/read',
    'POST /api/integrations/github/pat/file/write',
    'POST /api/integrations/github/start',
    'POST /api/integrations/github/device/start',
    'POST /api/integrations/github/device/poll',
    'POST /api/integrations/github/disconnect',
    'GET /api/project-contributions',
    'POST /api/project-contributions',
    'POST /api/project-contributions/:id/verify',
    'POST /api/bounties',
    'POST /api/bounties/:id/submit',
    'GET /api/my-work',
    'POST /api/contributions/:id/resubmit',
    'POST /api/contributions/:id/review',
  ];
  for (const route of sessionProtected) {
    assert.match(
      routeSource(route),
      /requireAuth\(\)/,
      route + ' must require an authenticated app session',
    );
  }

  for (const route of [
    'OPTIONS /api/mcp',
    'GET /api/mcp',
    'GET /api/_healthcheck',
    'GET /api/bounties',
    'GET /api/leaderboard',
  ]) {
    assert.doesNotMatch(
      routeSource(route),
      /requireAuth\(\)/,
      route + ' is intentionally public and must stay limited to public/preflight data',
    );
  }
  assert.match(routeSource('OPTIONS /api/mcp'), /mcpOriginAllowed\(origin\)/);
  assert.match(routeSource('GET /api/mcp'), /mcpHttpResponse\(405/);
  assert.match(routeSource('GET /api/_healthcheck'), /ContribQuest API online/);
  assert.match(routeSource('GET /api/bounties'), /readBounties\(\)/);
  assert.match(routeSource('GET /api/leaderboard'), /db\.list<Profile>\('profiles'/);

  const mcpHandler = backend.slice(
    backend.indexOf('async function handleMcpRequest'),
    backend.indexOf('export const handler'),
  );
  assert.match(mcpHandler, /if \(!mcpOriginAllowed\(origin\)\)/);
  assert.match(mcpHandler, /const auth = await validateMcpBearer\(ctx\.event\)/);
  assert.match(mcpHandler, /if \(auth\.ok === false\)/);
  assert.match(mcpHandler, /request\.method === 'tools\/call'/);
});

test('workspace and GitHub integration mutations enforce actor role and object boundaries', () => {
  assert.match(routeSourceForTest("POST /api/workspaces"), /isPlatformOwner\(user\)/);
  assert.match(routeSourceForTest("GET /api/workspaces/:workspaceId/members"), /canManageWorkspace\(ctx\.user!, workspaceId\)/);

  const addMember = routeSourceForTest('POST /api/access/workspaces/:workspaceId/members');
  assert.match(addMember, /isPlatformOwner\(user\)/);
  assert.match(addMember, /canManageWorkspace\(user, workspaceId\)/);
  assert.match(addMember, /role === 'workspace_admin' && !owner/);
  assert.match(addMember, /accountIndex\.userId/);

  const removeMember = routeSourceForTest('DELETE /api/access/workspaces/:workspaceId/members/:userId');
  assert.match(removeMember, /canManageWorkspace\(user, workspaceId\)/);
  assert.match(removeMember, /membership\.role === 'workspace_admin' && !owner/);
  assert.match(removeMember, /A workspace must retain at least one administrator/);

  for (const route of [
    'POST /api/integrations/github/pat/verify',
    'POST /api/integrations/github/pat/file/read',
    'POST /api/integrations/github/pat/file/write',
  ]) {
    assert.match(routeSourceForTest(route), /isPlatformOwner\(ctx\.user!\)/, route + ' must be owner-only');
  }
  assert.match(routeSourceForTest('POST /api/integrations/github/pat/file/read'), /isGitHubPatRepository\(repository\)/);
  assert.match(routeSourceForTest('POST /api/integrations/github/pat/file/write'), /isGitHubPatRepository\(repository\)/);

  const startOAuth = routeSourceForTest('POST /api/integrations/github/start');
  assert.match(startOAuth, /github_identity_links', \[ctx\.user!\.userId\]/);
  assert.match(startOAuth, /appUserId: ctx\.user!\.userId/);
  assert.match(startOAuth, /expiresAt: new Date\(createdAt\.getTime\(\) \+ 10 \* 60 \* 1000\)/);

  const startDevice = routeSourceForTest('POST /api/integrations/github/device/start');
  assert.match(startDevice, /appUserId: ctx\.user!\.userId/);
  assert.match(startDevice, /deviceCodeHash: createHash\('sha256'\)/);

  const pollDevice = routeSourceForTest('POST /api/integrations/github/device/poll');
  assert.match(pollDevice, /flow\.appUserId !== user\.userId/);
  assert.match(pollDevice, /flow\.deviceCodeHash !== createHash\('sha256'\)/);
  assert.match(pollDevice, /if: \{ status: 'pending', appUserId: user\.userId \}/);

  const callback = routeSourceForTest('GET /api/integrations/github/callback');
  assert.match(callback, /savedState\.status !== 'pending'/);
  assert.match(callback, /savedState\.purpose !== 'identity_link'/);
  assert.match(callback, /new Date\(savedState\.expiresAt\)\.getTime\(\) <= Date\.now\(\)/);
  assert.match(callback, /if: \{ status: 'pending', appUserId: savedState\.appUserId \}/);
  assert.match(callback, /const \[existingOwner\] = await db\.get<GitHubIdentityOwner>/);

  const disconnect = routeSourceForTest('POST /api/integrations/github/disconnect');
  assert.match(disconnect, /github_identity_links', \[user\.userId\]/);
  assert.match(disconnect, /owner\?\.appUserId === user\.userId/);
});

test('contributions and bounty routes preserve per-user and resource-owner authorization', () => {
  const personalList = routeSourceForTest('GET /api/project-contributions');
  assert.match(personalList, /userProjectContributionsTable\(ctx\.user!\.userId\)/);

  const createPersonal = routeSourceForTest('POST /api/project-contributions');
  assert.match(createPersonal, /contributorId: user\.userId/);
  assert.match(createPersonal, /userProjectContributionsTable\(user\.userId\)/);

  const verifyPersonal = routeSourceForTest('POST /api/project-contributions/:id/verify');
  assert.match(verifyPersonal, /userProjectContributionsTable\(user\.userId\)/);
  assert.match(verifyPersonal, /contribution\.riskLevel !== 'low' \|\| reviewRequired/);
  assert.match(verifyPersonal, /db\.tx\.add\('xp_awards'/);
  assert.match(verifyPersonal, /project_xp_' \+ contribution\.id/);

  const createBounty = routeSourceForTest('POST /api/bounties');
  assert.match(createBounty, /createBountyForUser\(ctx\.user!, ctx\.body\)/);

  const submit = routeSourceForTest('POST /api/bounties/:id/submit');
  assert.match(submit, /bounty\.createdBy === user\.userId/);
  assert.match(submit, /bounty\.sample/);
  assert.match(submit, /bounty\.status !== 'open'/);
  assert.match(submit, /active_submissions/);

  const myWork = routeSourceForTest('GET /api/my-work');
  assert.match(myWork, /userBountiesTable\(user\.userId\)/);
  assert.match(myWork, /userSubmissionsTable\(user\.userId\)/);
  assert.match(myWork, /userReceivedTable\(user\.userId\)/);

  const resubmit = routeSourceForTest('POST /api/contributions/:id/resubmit');
  assert.match(resubmit, /contribution\.submitterId !== user\.userId/);
  assert.match(resubmit, /contribution\.status !== 'needs_changes'/);
  assert.match(resubmit, /if: \{ status: 'needs_changes', submitterId: user\.userId \}/);

  const review = routeSourceForTest('POST /api/contributions/:id/review');
  assert.match(review, /contribution\.ownerId !== ctx\.user!\.userId/);
  assert.match(review, /contribution\.status !== 'pending'/);
  assert.match(review, /criteriaChecks\.length !== acceptanceCriteria\.length/);
  assert.match(review, /status === 'accepted' && !criteriaChecks\.every\(Boolean\)/);
});

function routeSourceForTest(name) {
  const routePattern = /^[ \t]{2}'((?:OPTIONS|GET|POST|PUT|PATCH|DELETE) \/api\/[^']+)': \[/gm;
  const declarations = [...backend.matchAll(routePattern)];
  const index = declarations.findIndex((match) => match[1] === name);
  assert.notEqual(index, -1, 'missing route: ' + name);
  return backend.slice(
    declarations[index].index,
    declarations[index + 1]?.index ?? backend.length,
  );
}


test('public bounty and leaderboard responses use explicit allowlisted projections', () => {
  const publicBountyReader = backend.slice(
    backend.indexOf("async function readBounties"),
    backend.indexOf("type CreateBountyOutcome"),
  );
  assert.match(backend, /type PublicBounty = Omit<Bounty, 'createdBy'>/);
  assert.match(publicBountyReader, /id: item\.id/);
  assert.match(publicBountyReader, /createdByName: item\.createdByName/);
  assert.doesNotMatch(
    publicBountyReader,
    /\bcreatedBy\s*:/,
    'public bounty payload must not expose the internal creator account ID',
  );

  const leaderboard = routeSourceForTest('GET /api/leaderboard');
  assert.match(leaderboard, /map\(profile => \(\{/);
  assert.match(leaderboard, /displayName: profile\.displayName/);
  assert.match(leaderboard, /xp: profile\.xp/);
  assert.match(leaderboard, /acceptedCount: profile\.acceptedCount/);
  assert.doesNotMatch(
    leaderboard,
    /profiles:\s*result\.items/,
    'public leaderboard must not serialize raw database records',
  );
  assert.doesNotMatch(
    frontend,
    /user\?\.userId === item\.createdBy/,
    'public bounty cards must not depend on a leaked internal creator ID',
  );
  assert.match(
    frontend,
    /work\.myBounties\.some\(ownedBounty => ownedBounty\.id === item\.id\)/,
    'owner-only UI affordances should derive from the signed-in user’s private work view',
  );
});
