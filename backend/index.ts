import {
  router,
  json,
  error,
  requireAuth,
  db,
  increment,
  isAppDatabaseError,
  secrets,
} from '@appdeploy/sdk';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

type Bounty = {
  title: string;
  description: string;
  reward: number;
  currency: string;
  category: string;
  skills: string[];
  repoUrl?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: 'open' | 'completed';
  tier: 'community' | 'paid';
  minAccepted: number;
  acceptanceCriteria?: string[];
  sample?: boolean;
};
type Contribution = {
  bountyId: string;
  bountyTitle: string;
  bountyTier: 'community' | 'paid';
  submitterId: string;
  submitterName: string;
  ownerId: string;
  workUrl?: string;
  note: string;
  acceptanceCriteria?: string[];
  criteriaChecks?: boolean[];
  reviewHistory?: ReviewEvent[];
  feedback?: string;
  status: 'pending' | 'accepted' | 'needs_changes' | 'rejected';
  createdAt: string;
  lastSubmittedAt?: string;
  revisionNumber?: number;
  revisionHistory?: RevisionEvent[];
  reviewedAt?: string;
};
type RevisionEvent = {
  revisionNumber: number;
  note: string;
  workUrl?: string;
  submittedAt: string;
};
type ReviewEvent = {
  status: 'accepted' | 'needs_changes' | 'rejected';
  feedback: string;
  criteriaChecks: boolean[];
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
};

type ProjectContribution = {
  id: string;
  contributorId: string;
  contributorName: string;
  projectName: string;
  workTitle: string;
  workType: 'requirements' | 'architecture' | 'research' | 'software' | 'testing' | 'documentation' | 'design' | 'security' | 'integration' | 'operations' | 'coordination' | 'community' | 'other';
  description: string;
  workUrl?: string;
  evidenceUrl?: string;
  evidenceNote: string;
  acceptanceCriteria: string[];
  criteriaChecks: boolean[];
  riskLevel: 'low' | 'standard' | 'high';
  status: 'submitted' | 'accepted';
  verificationLevel: 'provisional' | 'self_verified';
  verificationNote?: string;
  reviewerId?: string;
  reviewerName?: string;
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
};
type Profile = { displayName: string; xp: number; acceptedCount: number };
type WorkspaceRole = 'workspace_admin' | 'reviewer' | 'contributor' | 'observer';
type WorkspaceRecord = { id: string; name: string; createdBy: string; createdAt: string };
type WorkspaceMembership = {
  id: string; workspaceId: string; workspaceName: string; userId: string;
  email?: string; displayName?: string; role: WorkspaceRole; createdBy: string; createdAt: string;
};
type AccountIdentity = { id: string; userId: string; email?: string; displayName: string; firstSeenAt: string; lastSeenAt: string };
type AccountEmailIndex = { id: string; userId: string; email: string };
type GitHubIdentity = { id: string; appUserId: string; githubUserId: string; githubLogin: string; verifiedEmails?: string[]; primaryEmail?: string; emailAccessStatus?: 'available' | 'permission_required' | 'unavailable'; linkedAt: string };
type GitHubIdentityOwner = { id: string; appUserId: string; githubUserId: string };
type GitHubOAuthState = {
  id: string; appUserId: string; purpose: 'identity_link';
  status: 'pending' | 'processing' | 'consumed' | 'failed' | 'cancelled';
  createdAt: string; expiresAt: string;
};
type GitHubDeviceFlow = {
  id: string; appUserId: string; deviceCodeHash: string; userCode: string;
  status: 'pending' | 'consumed' | 'failed' | 'expired';
  createdAt: string; expiresAt: string; intervalSeconds: number;
};
type AuditEvent = {
  id: string; actorUserId: string; action: string; resourceType: string; resourceId: string;
  targetUserId?: string; role?: string; createdAt: string;
};
const APP_BASE_URL = 'https://contribquest-lygj1x.v2.appdeploy.ai';
const GITHUB_CALLBACK_URL = APP_BASE_URL + '/api/integrations/github/callback';
const PLATFORM_OWNER_SECRET = 'PLATFORM_OWNER_EMAILS';
const GITHUB_CLIENT_ID_SECRET = 'GITHUB_CLIENT_ID';
const GITHUB_CLIENT_SECRET_SECRET = 'GITHUB_CLIENT_SECRET';
const GITHUB_PAT_SECRET = 'GITHUB_PAT';
const MCP_TOKEN_SECRET = 'CONTRIBQUEST_MCP_TOKEN';
const GITHUB_PAT_REPOSITORIES = ['Contribution-bounties-centre-', 'contribution-network'] as const;
type GitHubPatRepository = typeof GITHUB_PAT_REPOSITORIES[number];

async function readConfiguredGitHubPat(): Promise<string> {
  const names = await secrets.listSecretNames();
  if (!names.includes(GITHUB_PAT_SECRET)) throw new Error('github_pat_not_configured');
  const token = await secrets.readSecret(GITHUB_PAT_SECRET);
  if (!token || !token.trim()) throw new Error('github_pat_empty');
  return token.trim();
}

function validGitHubPatPath(value: unknown): string | null {
  const path = textField(value, 500);
  if (!path || path.startsWith('/') || path.split('/').some(part =>
    !part || part === '.' || part === '..' || part.includes('\\'))) return null;
  return path;
}

function isGitHubPatRepository(value: unknown): value is GitHubPatRepository {
  return typeof value === 'string' &&
    GITHUB_PAT_REPOSITORIES.includes(value as GitHubPatRepository);
}

async function githubPatFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ContribQuest',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
const WORKSPACE_ROLES: WorkspaceRole[] = ['workspace_admin', 'reviewer', 'contributor', 'observer'];


type WorkIndexMigration = {
  id: string;
  userId: string;
  bountiesDone: boolean;
  bountiesCursor?: string;
  contributionsDone: boolean;
  contributionsCursor?: string;
};
type ActiveSubmission = {
  id: string;
  contributionId: string;
  bountyId: string;
  submitterId: string;
  createdAt: string;
  status: Contribution['status'];
};

function userPartitionKey(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('Authenticated user ID did not match the expected UUID shape.');
  }
  return userId.replace(/-/g, '').toLowerCase();
}
function userBountiesTable(userId: string): string {
  return 'user_bounties_' + userPartitionKey(userId);
}
function userSubmissionsTable(userId: string): string {
  return 'user_submissions_' + userPartitionKey(userId);
}
function userReceivedTable(userId: string): string {
  return 'user_received_' + userPartitionKey(userId);
}
function userProjectContributionsTable(userId: string): string {
  return 'user_project_contributions_' + userPartitionKey(userId);
}
function submissionGuardId(bountyId: string, userId: string): string {
  return 'active_' + userPartitionKey(userId) + '_' + encodeURIComponent(bountyId);
}
function newRecordId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
}

function emailKey(email: string): string {
  return 'email_' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}
function validWorkspaceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(value);
}
function workspaceMembershipId(workspaceId: string, userId: string): string {
  return 'wm_' + workspaceId + '_' + userPartitionKey(userId);
}
function workspaceMembersTable(workspaceId: string): string {
  return 'workspace_members_' + workspaceId;
}
function userWorkspaceMembershipsTable(userId: string): string {
  return 'user_workspaces_' + userPartitionKey(userId);
}
async function configuredOwnerEmails(): Promise<string[]> {
  try {
    const names = await secrets.listSecretNames();
    if (!names.includes(PLATFORM_OWNER_SECRET)) return [];
    const value = await secrets.readSecret(PLATFORM_OWNER_SECRET);
    return value.split(/[,\n;]/).map(item => item.trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}
async function isPlatformOwner(user: { userId: string; email?: string }): Promise<boolean> {
  const email = normalizeEmail(user.email);
  if (!email) return false;
  return (await configuredOwnerEmails()).includes(email);
}
async function getWorkspaceMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
  const [membership] = await db.get<WorkspaceMembership>(
    'workspace_memberships', [workspaceMembershipId(workspaceId, userId)], { consistent: true }
  );
  return membership;
}
async function canManageWorkspace(user: { userId: string; email?: string }, workspaceId: string): Promise<boolean> {
  if (await isPlatformOwner(user)) return true;
  const membership = await getWorkspaceMembership(workspaceId, user.userId);
  return membership?.role === 'workspace_admin';
}
async function ensureAccountIdentity(user: { userId: string; email?: string; name?: string }): Promise<void> {
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(user.email);
  const displayName = user.name?.trim() || normalizedEmail?.split('@')[0] || 'Contributor';
  const [existing] = await db.get<AccountIdentity>('account_identities', [user.userId], { consistent: true });
  if (!existing) {
    await db.tx.add('account_identities', [{
      id: user.userId, userId: user.userId,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      displayName, firstSeenAt: now, lastSeenAt: now,
    }]);
  } else {
    const changedEmail = normalizedEmail && normalizeEmail(existing.email) !== normalizedEmail;
    const [updated] = await db.tx.update('account_identities', [{
      id: user.userId, record: {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        displayName, lastSeenAt: now,
      },
    }], { patch: true });
    if (!updated) throw new Error('Account identity could not be refreshed.');
    if (changedEmail && existing.email) {
      const oldEmailId = emailKey(existing.email);
      const [oldIndex] = await db.get<AccountEmailIndex>('account_email_index', [oldEmailId], { consistent: true });
      if (oldIndex?.userId === user.userId) await db.tx.delete('account_email_index', [oldEmailId]);
    }
  }
  if (normalizedEmail) {
    const id = emailKey(normalizedEmail);
    const [existingIndex] = await db.get<AccountEmailIndex>('account_email_index', [id], { consistent: true });
    if (!existingIndex) {
      await db.tx.add('account_email_index', [{ id, userId: user.userId, email: normalizedEmail }]);
    }
  }
}
async function githubSecretStatus(): Promise<{ clientIdConfigured: boolean; clientSecretConfigured: boolean }> {
  try {
    const names = await secrets.listSecretNames();
    return { clientIdConfigured: names.includes(GITHUB_CLIENT_ID_SECRET), clientSecretConfigured: names.includes(GITHUB_CLIENT_SECRET_SECRET) };
  } catch {
    return { clientIdConfigured: false, clientSecretConfigured: false };
  }
}
function githubCallbackRedirect(status: 'linked' | 'cancelled' | 'configuration_required' | 'failed' | 'already_linked' | 'callback_mismatch' | 'client_credentials_rejected' | 'authorization_code_rejected' | 'token_exchange_failed' | 'github_profile_rejected' | 'identity_invalid' | 'persistence_failed' | 'state_invalid' | 'app_suspended' | 'provider_error'): {
  statusCode: number; headers: Record<string, string>; body: string;
} {
  return {
    statusCode: 302,
    headers: {
      Location: APP_BASE_URL + '/?integration=github&status=' + status,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
    body: '',
  };
}
function appendAuditEvent(
  actorUserId: string, action: string, resourceType: string, resourceId: string,
  fields: { targetUserId?: string; role?: string } = {}
): AuditEvent {
  return { id: newRecordId('audit'), actorUserId, action, resourceType, resourceId, ...fields, createdAt: new Date().toISOString() };
}
async function ensureIndexRecords<T extends { id: string }>(table: string, records: T[]): Promise<void> {
  const unique = new Map<string, T>();
  for (const record of records) unique.set(record.id, record);
  const rows = Array.from(unique.values());
  if (!rows.length) return;

  const existing = await db.get<Record<string, unknown>>(
    table,
    rows.map(row => row.id),
    { consistent: true }
  );
  const missing = rows.filter((_, index) => !existing[index]);
  if (!missing.length) return;

  const created = await db.tx.add(
    table,
    missing.map(row => ({ ...row }))
  );
  const uncertainIds = missing
    .filter((_, index) => created[index] === null)
    .map(row => row.id);
  if (uncertainIds.length) {
    const confirmed = await db.get<Record<string, unknown>>(
      table,
      uncertainIds,
      { consistent: true }
    );
    if (confirmed.some(row => !row)) {
      throw new Error('A scoped work-index record could not be confirmed after a write conflict.');
    }
  }
}
function activeSubmissionRecord(contributionId: string, contribution: Contribution): ActiveSubmission | null {
  if (
    contribution.status !== 'pending' &&
    contribution.status !== 'accepted' &&
    contribution.status !== 'needs_changes'
  ) {
    return null;
  }
  return {
    id: submissionGuardId(contribution.bountyId, contribution.submitterId),
    contributionId,
    bountyId: contribution.bountyId,
    submitterId: contribution.submitterId,
    createdAt: contribution.createdAt,
    status: contribution.status,
  };
}
async function ensureContributionIndexes(contributionId: string, contribution: Contribution): Promise<void> {
  const indexed = { ...contribution, id: contributionId };
  await ensureIndexRecords(userSubmissionsTable(contribution.submitterId), [indexed]);
  await ensureIndexRecords(userReceivedTable(contribution.ownerId), [indexed]);
  const guard = activeSubmissionRecord(contributionId, contribution);
  if (guard) await ensureIndexRecords('active_submissions', [guard]);
}
async function loadWorkIndexMigration(userId: string): Promise<WorkIndexMigration> {
  const id = 'work_index_v1_' + userPartitionKey(userId);
  const [saved] = await db.get<WorkIndexMigration>('user_index_migrations', [id], {
    consistent: true,
  });
  if (saved) return { ...saved, id };

  await db.tx.add('user_index_migrations', [{
    id,
    userId,
    bountiesDone: false,
    contributionsDone: false,
  }]);
  const [created] = await db.get<WorkIndexMigration>('user_index_migrations', [id], {
    consistent: true,
  });
  if (!created) throw new Error('Work-index migration state could not be initialized.');
  return { ...created, id };
}
async function saveWorkIndexProgress(
  migration: WorkIndexMigration,
  section: 'bounties' | 'contributions',
  patch: Partial<WorkIndexMigration>
): Promise<WorkIndexMigration> {
  const doneField = section === 'bounties' ? 'bountiesDone' : 'contributionsDone';
  const cursorField = section === 'bounties' ? 'bountiesCursor' : 'contributionsCursor';
  const expected: Record<string, unknown> = {
    [doneField]: false,
    [cursorField]: migration[cursorField],
  };
  const [updated] = await db.tx.update('user_index_migrations', [{
    id: migration.id,
    record: patch as Record<string, unknown>,
    if: expected,
  }], { patch: true });
  if (updated) return { ...migration, ...patch };

  const [current] = await db.get<WorkIndexMigration>(
    'user_index_migrations',
    [migration.id],
    { consistent: true }
  );
  if (!current) throw new Error('Work-index migration state disappeared during progress update.');
  return { ...current, id: migration.id };
}
async function advanceWorkIndexMigration(userId: string): Promise<WorkIndexMigration> {
  let migration = await loadWorkIndexMigration(userId);

  if (!migration.bountiesDone) {
    const page = await db.list<Bounty>('bounties', {
      limit: 50,
      ...(migration.bountiesCursor !== undefined
        ? { nextToken: migration.bountiesCursor }
        : {}),
    });
    const owned = page.items.filter(item => item.createdBy === userId).map(item => ({ ...item }));
    await ensureIndexRecords(userBountiesTable(userId), owned);
    migration = await saveWorkIndexProgress(migration, 'bounties', {
      bountiesCursor: page.nextToken,
      bountiesDone: !page.nextToken,
    });
  }

  if (!migration.contributionsDone) {
    const page = await db.list<Contribution>('contributions', {
      limit: 40,
      ...(migration.contributionsCursor !== undefined
        ? { nextToken: migration.contributionsCursor }
        : {}),
    });
    const submitted = page.items
      .filter(item => item.submitterId === userId)
      .map(item => ({ ...item }));
    const received = page.items
      .filter(item => item.ownerId === userId)
      .map(item => ({ ...item }));
    await ensureIndexRecords(userSubmissionsTable(userId), submitted);
    await ensureIndexRecords(userReceivedTable(userId), received);
    await ensureIndexRecords(
      'active_submissions',
      submitted
        .map(item => activeSubmissionRecord(item.id, item))
        .filter((item): item is ActiveSubmission => item !== null)
    );
    migration = await saveWorkIndexProgress(migration, 'contributions', {
      contributionsCursor: page.nextToken,
      contributionsDone: !page.nextToken,
    });
  }

  return migration;
}


const samples = [
  {
    id: 'sample_docs',
    title: 'Improve getting-started documentation',
    description:
      'Clarify the install steps, add a short first-run example, and make sure a new contributor can complete the setup without guesswork.',
    reward: 120,
    currency: 'USD',
    category: 'Documentation',
    skills: ['Markdown', 'Developer experience'],
    repoUrl: 'https://github.com/topics/documentation',
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-10T10:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_tests',
    title: 'Add regression tests for edge cases',
    description:
      'Identify two important edge cases, write reproducible tests, and explain why the cases matter. The sample shows the kind of scoped task that works well.',
    reward: 180,
    currency: 'USD',
    category: 'Testing',
    skills: ['Testing', 'Debugging', 'Git'],
    repoUrl: 'https://github.com/topics/testing',
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-09T09:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_bug',
    title: 'Reproduce and document a small bug',
    description:
      'Create a minimal reproduction, write clear steps to trigger the issue, and propose the expected behavior so maintainers can triage it quickly.',
    reward: 90,
    currency: 'USD',
    category: 'Bug fix',
    skills: ['Debugging', 'Issue writing'],
    repoUrl: 'https://github.com/topics/bug-tracking',
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-08T14:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_design',
    title: 'Review an onboarding flow and suggest UX improvements',
    description:
      'Review a short user journey, identify three points of friction, and provide prioritized recommendations with sketches or annotated screenshots if useful.',
    reward: 220,
    currency: 'USD',
    category: 'Design & UX',
    skills: ['UX review', 'Visual communication', 'Accessibility'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-12T10:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_translation',
    title: 'Translate a newcomer guide into another language',
    description:
      'Translate a short guide, preserve its meaning and tone, and note any phrases that need local context. A public link is optional for the written submission.',
    reward: 140,
    currency: 'USD',
    category: 'Translation & Localization',
    skills: ['Translation', 'Language review', 'Localization'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-11T15:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_research',
    title: 'Research and summarize options for a community project',
    description:
      'Compare credible alternatives against agreed criteria, summarize trade-offs, and make a recommendation that another person can act on.',
    reward: 200,
    currency: 'USD',
    category: 'Research & Analysis',
    skills: ['Research', 'Critical thinking', 'Synthesis'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-11T12:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_community',
    title: 'Write a helpful answer for a community newcomer',
    description:
      'Answer a recurring question with a respectful, accurate, reusable explanation that helps newcomers solve a problem and find reliable resources.',
    reward: 100,
    currency: 'USD',
    category: 'Community & Support',
    skills: ['Communication', 'Support', 'Knowledge sharing'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-11T09:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_data',
    title: 'Curate a small open-knowledge dataset',
    description:
      'Collect a small set of useful sources or records, document where they came from, check quality, and describe any coverage limitations.',
    reward: 160,
    currency: 'USD',
    category: 'Data & Open Knowledge',
    skills: ['Data curation', 'Documentation', 'Quality review'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-10T16:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
  {
    id: 'sample_accessibility',
    title: 'Audit a user journey for accessibility barriers',
    description:
      'Review a small user journey for accessible language, keyboard or screen-reader friction, and clear next steps. A checklist or written report is a valid deliverable.',
    reward: 180,
    currency: 'USD',
    category: 'Accessibility',
    skills: ['Accessibility', 'Plain language', 'Evaluation'],
    createdBy: 'community',
    createdByName: 'Community showcase',
    createdAt: '2026-10-10T12:00:00.000Z',
    status: 'open',
    tier: 'community',
    minAccepted: 0,
    sample: true,
  },
];

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
function textField(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}
function validUrl(value: unknown, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === ''))
    return '';
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function requiresIndependentProjectReview(contribution: Pick<ProjectContribution, 'projectName' | 'workTitle' | 'workType' | 'description'>): boolean {
  if (contribution.workType === 'security') return true;
  const sensitiveTerms = /\b(security|authorization|authentication|access control|permission|credential|secret|token|key management|payment|financial|production|release|deployment|incident|safety|oauth|bearer)\b/i;
  return sensitiveTerms.test([
    contribution.projectName,
    contribution.workTitle,
    contribution.description,
  ].join(' '));
}

const DEFAULT_ACCEPTANCE_CRITERIA = [
  'The deliverable meets the stated objective.',
  'The result is complete and can be reviewed against the agreed scope.',
];

function contributorName(user: { name?: string; email?: string }): string {
  return user.name?.trim() || user.email?.split('@')[0] || 'Contributor';
}
async function seedSamples() {
  await db.tx.add(
    'bounties',
    samples.map(item => ({ ...item }))
  );
}
async function readBounties() {
  await seedSamples();
  const result = await db.list<Bounty>('bounties', { limit: 100 });
  return result.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type CreateBountyOutcome =
  | { ok: true; bounty: Bounty & { id: string } }
  | { ok: false; message: string; status: number };

async function createBountyForUser(
  user: { userId: string; email?: string; name?: string },
  input: unknown
): Promise<CreateBountyOutcome> {
  const body = objectBody(input);
  const title = textField(body.title, 100);
  const description = textField(body.description, 2500);
  const category = textField(body.category, 50);
  const rawCriteria = Array.isArray(body.acceptanceCriteria) ? body.acceptanceCriteria : [];
  const acceptanceCriteria = rawCriteria
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim());
  const reward = Number(body.reward);
  const skills = Array.isArray(body.skills)
    ? body.skills
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const repoUrl = validUrl(body.repoUrl, true);
  const tier =
    body.tier === 'paid'
      ? 'paid'
      : body.tier === 'community'
        ? 'community'
        : null;
  const minAccepted = body.minAccepted === undefined ? 2 : Number(body.minAccepted);

  if (!title || title.length < 8)
    return { ok: false, message: 'Use a clear bounty title of at least 8 characters.', status: 400 };
  if (!description || description.length < 20)
    return { ok: false, message: 'Describe the expected work in at least 20 characters.', status: 400 };
  if (!category) return { ok: false, message: 'Choose a bounty category.', status: 400 };
  if (acceptanceCriteria.length < 1 || acceptanceCriteria.length > 10)
    return { ok: false, message: 'Provide between 1 and 10 acceptance criteria, one per line.', status: 400 };
  if (acceptanceCriteria.some(item => item.length < 5 || item.length > 240))
    return { ok: false, message: 'Each acceptance criterion must be between 5 and 240 characters.', status: 400 };
  if (new Set(acceptanceCriteria.map(item => item.toLowerCase())).size !== acceptanceCriteria.length)
    return { ok: false, message: 'Acceptance criteria must be unique. Remove duplicate checks.', status: 400 };
  if (!Number.isFinite(reward) || reward < 1 || reward > 100000)
    return { ok: false, message: 'The offer must be between $1 and $100,000.', status: 400 };
  if (repoUrl === null)
    return { ok: false, message: 'Repository URL must be a valid HTTP or HTTPS link.', status: 400 };
  if (!tier) return { ok: false, message: 'Choose community or paid bounty type.', status: 400 };
  if (!Number.isInteger(minAccepted) || minAccepted < 1 || minAccepted > 20)
    return { ok: false, message: 'Minimum accepted contributions must be between 1 and 20.', status: 400 };

  const record = {
    title,
    description,
    reward,
    currency: 'USD',
    category,
    acceptanceCriteria,
    skills,
    repoUrl: repoUrl || undefined,
    createdBy: user.userId,
    createdByName: contributorName(user),
    createdAt: new Date().toISOString(),
    status: 'open' as const,
    tier,
    minAccepted: tier === 'paid' ? minAccepted : 0,
  };
  const id = newRecordId('b');
  const persisted = { ...record, id };

  try {
    const bountyWrite = db.tx.add('bounties', [persisted]);
    const bountyIndexWrite = db.tx.add(userBountiesTable(user.userId), [persisted]);
    const [bountyIds, indexIds] = await db.transact([bountyWrite, bountyIndexWrite]);
    if (!bountyIds[0] || !indexIds[0])
      return { ok: false, message: 'The bounty could not be saved. Please retry.', status: 503 };
  } catch (cause: unknown) {
    if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
    return { ok: false, message: 'The bounty could not be saved atomically. Refresh and retry.', status: 503 };
  }

  return { ok: true, bounty: persisted };
}

type McpOwner = { userId: string; email: string; name: string };

async function resolveMcpOwner(): Promise<McpOwner> {
  const configuredOwners = await configuredOwnerEmails();
  const matches = new Map<string, { userId: string; email: string }>();
  for (const email of configuredOwners) {
    const [index] = await db.get<AccountEmailIndex>('account_email_index', [emailKey(email)], { consistent: true });
    if (index?.userId) matches.set(index.userId, { userId: index.userId, email });
  }
  if (matches.size !== 1) throw new Error('mcp_owner_missing_or_ambiguous');

  const selected = [...matches.values()][0];
  if (!(await isPlatformOwner({ userId: selected.userId, email: selected.email })))
    throw new Error('mcp_platform_owner_not_configured');

  const [identity] = await db.get<AccountIdentity>('account_identities', [selected.userId], { consistent: true });
  if (!identity) throw new Error('mcp_owner_identity_missing');
  return { userId: selected.userId, email: selected.email, name: identity.displayName };
}

function mcpHeaderValue(event: unknown, name: string): string {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return '';
  const headers = (event as Record<string, unknown>).headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return '';
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === name.toLowerCase() && typeof value === 'string') return value;
  }
  return '';
}

function mcpOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  return [
    'https://chatgpt.com',
    'https://chat.openai.com',
    'https://platform.openai.com',
    'http://localhost:6274',
    'http://127.0.0.1:6274',
  ].includes(origin);
}

function mcpCorsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
    Vary: 'Origin',
  };
  if (origin && mcpOriginAllowed(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function mcpHttpResponse(
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
    body: payload === undefined ? '' : JSON.stringify(payload),
  };
}

async function validateMcpBearer(event: unknown): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  let expected: string | null = null;
  try {
    const names = await secrets.listSecretNames();
    if (!names.includes(MCP_TOKEN_SECRET))
      return { ok: false, status: 503, message: 'ContribQuest MCP authentication is not configured yet.' };
    const configured = await secrets.readSecret(MCP_TOKEN_SECRET);
    if (configured && configured.trim()) expected = configured.trim();
  } catch {
    return { ok: false, status: 503, message: 'ContribQuest MCP authentication is temporarily unavailable.' };
  }
  if (!expected) return { ok: false, status: 503, message: 'ContribQuest MCP authentication is not configured yet.' };

  const authorization = mcpHeaderValue(event, 'authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return { ok: false, status: 401, message: 'A valid bearer token is required.' };

  const candidateDigest = createHash('sha256').update(match[1].trim()).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(candidateDigest, expectedDigest))
    return { ok: false, status: 401, message: 'A valid bearer token is required.' };
  return { ok: true };
}

function mcpBountyView(bounty: Bounty & { id: string }): Record<string, unknown> {
  return {
    id: bounty.id,
    title: bounty.title,
    description: bounty.description,
    reward: bounty.reward,
    currency: bounty.currency,
    category: bounty.category,
    skills: bounty.skills,
    ...(bounty.repoUrl ? { repoUrl: bounty.repoUrl } : {}),
    createdByName: bounty.createdByName,
    createdAt: bounty.createdAt,
    status: bounty.status,
    tier: bounty.tier,
    minAccepted: bounty.minAccepted,
    acceptanceCriteria: bounty.acceptanceCriteria ?? [],
    sample: Boolean(bounty.sample),
  };
}

function mcpContributionView(contribution: Contribution & { id: string }): Record<string, unknown> {
  return {
    id: contribution.id,
    bountyId: contribution.bountyId,
    bountyTitle: contribution.bountyTitle,
    bountyTier: contribution.bountyTier,
    submitterId: contribution.submitterId,
    submitterName: contribution.submitterName,
    ownerId: contribution.ownerId,
    ...(contribution.workUrl ? { workUrl: contribution.workUrl } : {}),
    note: contribution.note,
    acceptanceCriteria: contribution.acceptanceCriteria ?? [],
    criteriaChecks: contribution.criteriaChecks ?? [],
    reviewHistory: contribution.reviewHistory ?? [],
    ...(contribution.feedback ? { feedback: contribution.feedback } : {}),
    status: contribution.status,
    createdAt: contribution.createdAt,
    lastSubmittedAt: contribution.lastSubmittedAt ?? null,
    revisionNumber: contribution.revisionNumber ?? 1,
    revisionHistory: contribution.revisionHistory ?? [],
    reviewedAt: contribution.reviewedAt ?? null,
  };
}

function mcpToolDefinitions(): Record<string, unknown>[] {
  return [
    {
      name: 'contribquest_get_status',
      title: 'Get ContribQuest status',
      description: 'Returns the connected ContribQuest owner account, platform role, deployment identity, and configured integration status. It never returns credentials or token values.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'contribquest_list_bounties',
      title: 'List bounties',
      description: 'Lists recent ContribQuest bounty listings. Use status=open, completed, or all. Paid entries are listings only; this tool does not process payments.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'completed', 'all'], description: 'Filter by bounty status; defaults to open.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum listings to return; defaults to 20.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'contribquest_get_bounty',
      title: 'Get bounty details',
      description: 'Returns the full public details and acceptance criteria for one bounty by its ID.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', minLength: 1, maxLength: 160 } },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'contribquest_get_my_work',
      title: 'Get my ContribQuest work',
      description: 'Returns the connected platform owner’s own bounties, submissions, received submissions, profile XP and accepted-work count. Includes private contribution/review details visible to that owner.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'contribquest_list_workspaces',
      title: 'List my workspaces',
      description: 'Lists workspaces in the connected platform owner’s membership index and the owner’s role in each.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'contribquest_create_bounty',
      title: 'Create a bounty',
      description: 'Creates a public ContribQuest bounty using the same server-side validation and atomic persistence path as the app. Requires a title, description, category, reward, tier and 1–10 unique acceptance criteria. A paid bounty is a listing only, not a payment or escrow promise.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 8, maxLength: 100 },
          description: { type: 'string', minLength: 20, maxLength: 2500 },
          category: { type: 'string', minLength: 1, maxLength: 50 },
          reward: { type: 'number', minimum: 1, maximum: 100000 },
          tier: { type: 'string', enum: ['community', 'paid'] },
          acceptanceCriteria: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', minLength: 5, maxLength: 240 } },
          skills: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 } },
          repoUrl: { type: 'string', maxLength: 2048 },
          minAccepted: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['title', 'description', 'category', 'reward', 'tier', 'acceptanceCriteria'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
  ];
}

function mcpToolSuccess(value: unknown): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function mcpToolFailure(message: string): Record<string, unknown> {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function executeMcpTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let owner: McpOwner;
  try {
    owner = await resolveMcpOwner();
  } catch {
    return mcpToolFailure('The configured platform-owner account could not be resolved uniquely. Check the server-side owner allowlist and account identity index.');
  }

  try {
    if (name === 'contribquest_get_status') {
      const names = await secrets.listSecretNames().catch(() => [] as string[]);
      const github = await githubSecretStatus();
      return mcpToolSuccess({
        application: 'ContribQuest',
        account: { displayName: owner.name, email: owner.email },
        platformRole: 'platform_owner',
        deployment: { appId: 'contribquest-lygj1x', url: APP_BASE_URL },
        integrations: {
          githubAppOAuthConfigured: github.clientIdConfigured && github.clientSecretConfigured,
          githubPatConfigured: names.includes(GITHUB_PAT_SECRET),
          platformOwnerAllowlistConfigured: names.includes(PLATFORM_OWNER_SECRET),
          mcpTokenConfigured: names.includes(MCP_TOKEN_SECRET),
        },
        availableTools: mcpToolDefinitions().map(tool => tool.name),
      });
    }

    if (name === 'contribquest_list_bounties') {
      const status = typeof args.status === 'string' ? args.status : 'open';
      if (!['open', 'completed', 'all'].includes(status))
        return mcpToolFailure('status must be open, completed, or all.');
      const limit = args.limit === undefined ? 20 : args.limit;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50)
        return mcpToolFailure('limit must be an integer between 1 and 50.');
      const result = await db.list<Bounty & { id: string }>('bounties', { limit: 100 });
      const bounties = result.items
        .filter(item => status === 'all' || item.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(mcpBountyView);
      return mcpToolSuccess({ bounties, count: bounties.length, hasMore: Boolean(result.nextToken) });
    }

    if (name === 'contribquest_get_bounty') {
      const id = textField(args.id, 160);
      if (!id) return mcpToolFailure('A bounty ID is required.');
      const [bounty] = await db.get<Bounty & { id: string }>('bounties', [id], { consistent: true });
      if (!bounty) return mcpToolFailure('Bounty not found.');
      return mcpToolSuccess({ bounty: mcpBountyView(bounty) });
    }

    if (name === 'contribquest_get_my_work') {
      const [bountyResult, submissionResult, receivedResult, profileResult] = await Promise.all([
        db.list<Bounty & { id: string }>(userBountiesTable(owner.userId), { limit: 50 }),
        db.list<Contribution & { id: string }>(userSubmissionsTable(owner.userId), { limit: 50 }),
        db.list<Contribution & { id: string }>(userReceivedTable(owner.userId), { limit: 50 }),
        db.get<Profile>('profiles', [owner.userId], { consistent: true }),
      ]);
      const profile = profileResult[0] || { displayName: owner.name, xp: 0, acceptedCount: 0 };
      return mcpToolSuccess({
        profile: { displayName: profile.displayName, xp: profile.xp, acceptedCount: profile.acceptedCount },
        myBounties: bountyResult.items.map(mcpBountyView),
        mySubmissions: submissionResult.items.map(mcpContributionView),
        receivedSubmissions: receivedResult.items.map(mcpContributionView),
        hasMore: {
          myBounties: Boolean(bountyResult.nextToken),
          mySubmissions: Boolean(submissionResult.nextToken),
          receivedSubmissions: Boolean(receivedResult.nextToken),
        },
      });
    }

    if (name === 'contribquest_list_workspaces') {
      const result = await db.list<WorkspaceMembership>(userWorkspaceMembershipsTable(owner.userId), { limit: 50 });
      return mcpToolSuccess({
        workspaces: result.items.map(item => ({
          id: item.workspaceId,
          name: item.workspaceName,
          role: item.role,
          createdAt: item.createdAt,
        })),
        hasMore: Boolean(result.nextToken),
      });
    }

    if (name === 'contribquest_create_bounty') {
      if (!(await isPlatformOwner({ userId: owner.userId, email: owner.email })))
        return mcpToolFailure('Only a configured platform owner can create a bounty through this integration.');
      const outcome = await createBountyForUser(owner, args);
      if (outcome.ok === false) return mcpToolFailure(outcome.message);
      return mcpToolSuccess({
        created: true,
        bounty: mcpBountyView(outcome.bounty),
        note: outcome.bounty.tier === 'paid'
          ? 'This is a paid listing only. Payment processing and escrow are not provided by ContribQuest.'
          : 'The community bounty is published and ready for eligible contributions.',
      });
    }

    return mcpToolFailure('Unknown ContribQuest tool.');
  } catch {
    return mcpToolFailure('The ContribQuest tool call failed internally. No success is confirmed; inspect the app state before retrying any write.');
  }
}

async function handleMcpRequest(ctx: { body: unknown; event: unknown }): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const origin = mcpHeaderValue(ctx.event, 'origin');
  const cors = mcpCorsHeaders(origin);
  if (!mcpOriginAllowed(origin))
    return mcpHttpResponse(403, { error: 'Origin is not allowed.' }, cors);

  const request = objectBody(ctx.body);
  const requestId = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null;
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string')
    return mcpHttpResponse(400, { jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'Invalid JSON-RPC request.' } }, cors);

  const auth = await validateMcpBearer(ctx.event);
  if (auth.ok === false) {
    const payload = { jsonrpc: '2.0', id: requestId, error: { code: -32001, message: auth.message } };
    return mcpHttpResponse(auth.status, payload, {
      ...cors,
      'WWW-Authenticate': 'Bearer realm="ContribQuest MCP"',
    });
  }

  if (typeof request.id !== 'string' && typeof request.id !== 'number') {
    if (request.method.startsWith('notifications/')) return mcpHttpResponse(202, undefined, cors);
    return mcpHttpResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'A request ID is required for this method.' } }, cors);
  }

  if (request.method === 'initialize') {
    const params = objectBody(request.params);
    const versions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const protocolVersion = versions.includes(requested) ? requested : '2025-11-25';
    return mcpHttpResponse(200, {
      jsonrpc: '2.0',
      id: requestId,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'contribquest-mcp', version: '1.0.0' },
        instructions: 'ContribQuest provides bounded tools for the configured platform owner. Public listings can be read; private work is scoped to the allowlisted owner account. Creating a bounty publishes a listing and does not move money. Review each proposed write before calling it.',
      },
    }, cors);
  }

  if (request.method === 'ping')
    return mcpHttpResponse(200, { jsonrpc: '2.0', id: requestId, result: {} }, cors);

  if (request.method === 'tools/list')
    return mcpHttpResponse(200, { jsonrpc: '2.0', id: requestId, result: { tools: mcpToolDefinitions() } }, cors);

  if (request.method === 'tools/call') {
    const params = objectBody(request.params);
    if (typeof params.name !== 'string')
      return mcpHttpResponse(200, { jsonrpc: '2.0', id: requestId, error: { code: -32602, message: 'Tool name is required.' } }, cors);
    const args = objectBody(params.arguments);
    const result = await executeMcpTool(params.name, args);
    return mcpHttpResponse(200, { jsonrpc: '2.0', id: requestId, result }, cors);
  }

  return mcpHttpResponse(200, { jsonrpc: '2.0', id: requestId, error: { code: -32601, message: 'Method not found.' } }, cors);
}

export const handler = router({
  'OPTIONS /api/mcp': [
    async ctx => {
      const origin = mcpHeaderValue(ctx.event, 'origin');
      if (!mcpOriginAllowed(origin)) return mcpHttpResponse(403, { error: 'Origin is not allowed.' }, mcpCorsHeaders(''));
      return mcpHttpResponse(204, undefined, mcpCorsHeaders(origin));
    },
  ],

  'GET /api/mcp': [
    async ctx => mcpHttpResponse(405, { error: 'Use POST for the ContribQuest Streamable HTTP MCP endpoint.' }, {
      ...mcpCorsHeaders(mcpHeaderValue(ctx.event, 'origin')),
      Allow: 'POST, OPTIONS',
    }),
  ],

  'POST /api/mcp': [
    async ctx => handleMcpRequest(ctx),
  ],

  'GET /api/_healthcheck': [
    async () => json({ message: 'ContribQuest API online' }),
  ],

  'GET /api/account/security': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      await ensureAccountIdentity(user);
      const [githubLinks, workspaceResult, ownerEmails, githubSecrets, secretNames] = await Promise.all([
        db.get<GitHubIdentity>('github_identity_links', [user.userId], { consistent: true }),
        db.list<WorkspaceMembership>(userWorkspaceMembershipsTable(user.userId), { limit: 50 }),
        configuredOwnerEmails(),
        githubSecretStatus(),
        secrets.listSecretNames().catch(() => [] as string[]),
      ]);
      const roles = new Set<string>(['contributor']);
      if (user.email && ownerEmails.includes(user.email.trim().toLowerCase())) roles.add('platform_owner');
      for (const membership of workspaceResult.items) roles.add(membership.role);
      const githubLink = githubLinks[0];
      return json({
        account: {
          userId: user.userId,
          ...(user.email ? { email: user.email } : {}),
          displayName: user.name?.trim() || user.email?.split('@')[0] || 'Contributor',
        },
        access: {
          roles: [...roles],
          platformOwnerConfigured: secretNames.includes(PLATFORM_OWNER_SECRET),
          isPlatformOwner: roles.has('platform_owner'),
          workspaces: workspaceResult.items,
          hasMoreWorkspaces: Boolean(workspaceResult.nextToken),
        },
        github: {
          configured: githubSecrets.clientIdConfigured && githubSecrets.clientSecretConfigured,
          clientIdConfigured: githubSecrets.clientIdConfigured,
          clientSecretConfigured: githubSecrets.clientSecretConfigured,
          linked: Boolean(githubLink),
          ...(githubLink ? { githubLogin: githubLink.githubLogin, githubUserId: githubLink.githubUserId, linkedAt: githubLink.linkedAt, verifiedEmails: githubLink.verifiedEmails ?? [], ...(githubLink.primaryEmail ? { primaryEmail: githubLink.primaryEmail } : {}), emailAccessStatus: githubLink.emailAccessStatus || 'unavailable' } : { verifiedEmails: [], emailAccessStatus: 'not_linked' }),
          callbackUrl: GITHUB_CALLBACK_URL,
          scope: 'GitHub identity linking only; repository installation is a separate pending step.',
        },
      });
    },
  ],

  'GET /api/workspaces': [
    requireAuth(),
    async ctx => {
      const result = await db.list<WorkspaceMembership>(userWorkspaceMembershipsTable(ctx.user!.userId), { limit: 50 });
      return json({ workspaces: result.items, hasMore: Boolean(result.nextToken) });
    },
  ],

  'POST /api/workspaces': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if (!(await isPlatformOwner(user))) return error('Only a configured platform owner can create a workspace.', 403);
      const name = textField(objectBody(ctx.body).name, 100);
      if (!name || name.length < 3) return error('Workspace name must be between 3 and 100 characters.', 400);
      const workspaceId = 'ws_' + randomUUID().replace(/-/g, '');
      const createdAt = new Date().toISOString();
      const workspace: WorkspaceRecord = { id: workspaceId, name, createdBy: user.userId, createdAt };
      const memberId = workspaceMembershipId(workspaceId, user.userId);
      const membership: WorkspaceMembership = {
        id: memberId, workspaceId, workspaceName: name, userId: user.userId,
        ...(normalizeEmail(user.email) ? { email: normalizeEmail(user.email)! } : {}),
        displayName: user.name?.trim() || 'Contributor', role: 'workspace_admin',
        createdBy: user.userId, createdAt,
      };
      const userIndex = {
        id: 'wm_' + workspaceId, workspaceId, workspaceName: name, userId: user.userId,
        role: 'workspace_admin' as const, createdAt,
      };
      try {
        await db.transact([
          db.tx.add('workspaces', [workspace]),
          db.tx.add('workspace_memberships', [membership]),
          db.tx.add(workspaceMembersTable(workspaceId), [membership]),
          db.tx.add(userWorkspaceMembershipsTable(user.userId), [userIndex]),
          db.tx.add('audit_events', [appendAuditEvent(user.userId, 'workspace.created', 'workspace', workspaceId)]),
        ]);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        return error('Workspace creation could not be confirmed. Refresh and check your workspace list.', 503);
      }
      return json({ workspace, membership }, 201);
    },
  ],

  'GET /api/workspaces/:workspaceId/members': [
    requireAuth(),
    async ctx => {
      const workspaceId = ctx.params.workspaceId;
      if (!validWorkspaceId(workspaceId)) return error('Invalid workspace identifier.', 400);
      if (!(await canManageWorkspace(ctx.user!, workspaceId))) return error('Workspace administrator permission required.', 403);
      const [workspace] = await db.get<WorkspaceRecord>('workspaces', [workspaceId], { consistent: true });
      if (!workspace) return error('Workspace not found.', 404);
      const page = await db.list<WorkspaceMembership>(workspaceMembersTable(workspaceId), { limit: 100 });
      return json({ workspace, members: page.items, hasMore: Boolean(page.nextToken) });
    },
  ],

  'POST /api/access/workspaces/:workspaceId/members': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const workspaceId = ctx.params.workspaceId;
      if (!validWorkspaceId(workspaceId)) return error('Invalid workspace identifier.', 400);
      const body = objectBody(ctx.body);
      const email = normalizeEmail(body.email);
      const role = body.role;
      if (!email) return error('Provide the target account email address.', 400);
      if (typeof role !== 'string' || !WORKSPACE_ROLES.includes(role as WorkspaceRole))
        return error('Choose workspace administrator, reviewer, contributor, or observer.', 400);
      const owner = await isPlatformOwner(user);
      if (role === 'workspace_admin' && !owner) return error('Only a platform owner can grant workspace administrator role.', 403);
      if (!owner && !(await canManageWorkspace(user, workspaceId))) return error('Workspace administrator permission required.', 403);
      const [workspace] = await db.get<WorkspaceRecord>('workspaces', [workspaceId], { consistent: true });
      if (!workspace) return error('Workspace not found.', 404);
      const [accountIndex] = await db.get<AccountEmailIndex>('account_email_index', [emailKey(email)], { consistent: true });
      if (!accountIndex) return error('The target must sign in to ContribQuest once before they can be assigned a role.', 404);
      const [targetAccount] = await db.get<AccountIdentity>('account_identities', [accountIndex.userId], { consistent: true });
      if (!targetAccount || normalizeEmail(targetAccount.email) !== email)
        return error('The target account email index is stale. Ask the target to sign in again.', 409);
      const memberId = workspaceMembershipId(workspaceId, targetAccount.userId);
      const [existing] = await db.get<WorkspaceMembership>('workspace_memberships', [memberId], { consistent: true });
      if (existing) return error('This account is already a workspace member. Remove the existing membership before changing its role.', 409);
      const createdAt = new Date().toISOString();
      const membership: WorkspaceMembership = {
        id: memberId, workspaceId, workspaceName: workspace.name, userId: targetAccount.userId,
        email, displayName: targetAccount.displayName, role: role as WorkspaceRole,
        createdBy: user.userId, createdAt,
      };
      const userIndex = {
        id: 'wm_' + workspaceId, workspaceId, workspaceName: workspace.name,
        userId: targetAccount.userId, email, displayName: targetAccount.displayName,
        role: role as WorkspaceRole, createdAt,
      };
      try {
        await db.transact([
          db.tx.add('workspace_memberships', [membership]),
          db.tx.add(workspaceMembersTable(workspaceId), [membership]),
          db.tx.add(userWorkspaceMembershipsTable(targetAccount.userId), [userIndex]),
          db.tx.add('audit_events', [appendAuditEvent(user.userId, 'workspace.member_added', 'workspace_membership', memberId, { targetUserId: targetAccount.userId, role })]),
        ]);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        return error('Membership was not confirmed. Refresh and inspect the workspace before retrying.', 503);
      }
      return json({ membership }, 201);
    },
  ],

  'DELETE /api/access/workspaces/:workspaceId/members/:userId': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const workspaceId = ctx.params.workspaceId;
      const targetUserId = ctx.params.userId;
      if (!validWorkspaceId(workspaceId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId))
        return error('Invalid workspace or user identifier.', 400);
      const owner = await isPlatformOwner(user);
      if (!owner && !(await canManageWorkspace(user, workspaceId))) return error('Workspace administrator permission required.', 403);
      const memberId = workspaceMembershipId(workspaceId, targetUserId);
      const [membership] = await db.get<WorkspaceMembership>('workspace_memberships', [memberId], { consistent: true });
      if (!membership) return error('Workspace membership not found.', 404);
      if (membership.role === 'workspace_admin' && !owner)
        return error('Only a platform owner can remove a workspace administrator.', 403);
      if (membership.role === 'workspace_admin') {
        const page = await db.list<WorkspaceMembership>(workspaceMembersTable(workspaceId), { limit: 100 });
        if (page.nextToken) return error('Cannot safely remove an administrator while the member list exceeds the verification page. Review administrators first.', 409);
        if (page.items.filter(item => item.role === 'workspace_admin').length <= 1)
          return error('A workspace must retain at least one administrator.', 409);
      }
      try {
        await db.transact([
          db.tx.delete('workspace_memberships', [memberId]),
          db.tx.delete(workspaceMembersTable(workspaceId), [memberId]),
          db.tx.delete(userWorkspaceMembershipsTable(targetUserId), ['wm_' + workspaceId]),
          db.tx.add('audit_events', [appendAuditEvent(user.userId, 'workspace.member_removed', 'workspace_membership', memberId, { targetUserId, role: membership.role })]),
        ]);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        return error('Membership removal could not be confirmed. Refresh and inspect the workspace before retrying.', 503);
      }
      return json({ removed: true, workspaceId, userId: targetUserId });
    },
  ],

  'POST /api/integrations/github/pat/verify': [
    requireAuth(),
    async ctx => {
      if (!(await isPlatformOwner(ctx.user!)))
        return error('Only the configured platform owner can verify GitHub repository credentials.', 403);
      let token: string;
      try {
        token = await readConfiguredGitHubPat();
      } catch (cause: unknown) {
        const reason = cause instanceof Error ? cause.message : '';
        return error(reason === 'github_pat_not_configured' || reason === 'github_pat_empty'
          ? 'GITHUB_PAT is not configured. Add it through the secure backend-secret form.'
          : 'ContribQuest could not read GITHUB_PAT from backend secrets.', 503);
      }

      try {
        const profileResponse = await githubPatFetch(token, 'https://api.github.com/user');
        if (!profileResponse.ok) {
          const message = profileResponse.status === 401
            ? 'GitHub rejected GITHUB_PAT. Revoke the token if it is incorrect, then submit a replacement through the secure form.'
            : profileResponse.status === 403
              ? 'GitHub denied the PAT identity check. Check token approval, expiration and account policy.'
              : 'GitHub could not verify the PAT identity.';
          return json({ configured: true, verified: false, message });
        }
        const profile = await profileResponse.json() as Record<string, unknown>;
        if (typeof profile.id !== 'number' || typeof profile.login !== 'string' ||
            !Number.isSafeInteger(profile.id) || profile.id <= 0) {
          return json({ configured: true, verified: false, message: 'GitHub returned an invalid account identity for this PAT.' });
        }

        const repositories = await Promise.all(GITHUB_PAT_REPOSITORIES.map(async repository => {
          const response = await githubPatFetch(token, 'https://api.github.com/repos/Loofy147/' + encodeURIComponent(repository));
          if (!response.ok) {
            return {
              repositoryFullName: 'Loofy147/' + repository,
              accessible: false, canRead: false, canWrite: false,
              httpStatus: response.status,
              message: response.status === 404
                ? 'Repository is not visible to this token or account.'
                : response.status === 403
                  ? 'GitHub denied repository metadata access; check selected repositories and token permissions.'
                  : 'GitHub could not verify repository access.',
            };
          }
          const detail = await response.json() as Record<string, unknown>;
          const permissions = detail.permissions && typeof detail.permissions === 'object'
            ? detail.permissions as Record<string, unknown> : {};
          const repositoryRole = permissions.admin === true ? 'admin'
            : permissions.maintain === true ? 'maintain'
            : permissions.push === true ? 'write'
            : permissions.triage === true ? 'triage'
            : 'read';
          return {
            repositoryFullName: 'Loofy147/' + repository,
            accessible: true,
            repositoryRole,
            defaultBranch: typeof detail.default_branch === 'string' ? detail.default_branch : 'main',
            private: detail.private === true,
            note: 'This is the account repository role, not proof of every PAT endpoint permission.',
          };
        }));
        const usable = repositories.every(repository => repository.accessible);
        return json({
          configured: true,
          verified: true,
          usable,
          login: profile.login,
          id: profile.id,
          repositories,
          message: usable
            ? 'PAT identity verified and both configured working repositories are visible. Repository role and subsequent file/API operations are reported separately.'
            : 'PAT identity verified, but one or more configured repositories are not accessible to this token.',
        });
      } catch {
        console.warn('github_pat_verification_failed');
        return error('GitHub PAT verification encountered a network or API error. Retry without sharing the token.', 502);
      }
    },
  ],

  'POST /api/integrations/github/pat/file/read': [
    requireAuth(),
    async ctx => {
      if (!(await isPlatformOwner(ctx.user!)))
        return error('Only the configured platform owner can read repositories through GITHUB_PAT.', 403);
      const body = objectBody(ctx.body);
      const repository = body.repo;
      const path = validGitHubPatPath(body.path);
      const requestedBranch = textField(body.branch, 250);
      if (!isGitHubPatRepository(repository) || !path)
        return error('Choose one of the configured repositories and enter a valid relative file path.', 400);

      let token: string;
      try { token = await readConfiguredGitHubPat(); }
      catch { return error('GITHUB_PAT is not configured or could not be read by the backend.', 503); }

      try {
        const repoResponse = await githubPatFetch(token, 'https://api.github.com/repos/Loofy147/' + encodeURIComponent(repository));
        if (!repoResponse.ok) return error(repoResponse.status === 404
          ? 'This repository is not available to GITHUB_PAT.'
          : 'GitHub denied repository access. Run PAT verification and check token permissions.', 403);
        const repoDetail = await repoResponse.json() as Record<string, unknown>;
        const defaultBranch = typeof repoDetail.default_branch === 'string' ? repoDetail.default_branch : 'main';
        const branch = requestedBranch || defaultBranch;
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,249}$/.test(branch) || branch.split('/').some(part => !part || part === '.' || part === '..'))
          return error('Enter a valid branch name.', 400);
        const fileUrl = 'https://api.github.com/repos/Loofy147/' + encodeURIComponent(repository) +
          '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
        const response = await githubPatFetch(token, fileUrl);
        if (!response.ok) return error(response.status === 404
          ? 'File or branch not found, or this token lacks Contents: Read permission.'
          : response.status === 403
            ? 'GitHub denied file access. Check Contents: Read permission and token approval.'
            : 'GitHub file read failed. Retry and inspect repository access.', response.status === 404 ? 404 : 502);
        const payload = await response.json() as Record<string, unknown>;
        if (payload.type !== 'file' || typeof payload.content !== 'string' ||
            (typeof payload.size === 'number' && payload.size > 180000))
          return error('This path is not a supported text file or it exceeds the 180 KB editor limit.', 413);
        const content = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
        return json({
          repositoryFullName: 'Loofy147/' + repository,
          path,
          branch,
          defaultBranch,
          content,
          sha: typeof payload.sha === 'string' ? payload.sha : undefined,
          size: typeof payload.size === 'number' ? payload.size : Buffer.byteLength(content, 'utf8'),
        });
      } catch {
        console.warn('github_pat_file_read_failed');
        return error('GitHub file read failed. No credentials were returned to the client.', 502);
      }
    },
  ],

  'POST /api/integrations/github/pat/file/write': [
    requireAuth(),
    async ctx => {
      if (!(await isPlatformOwner(ctx.user!)))
        return error('Only the configured platform owner can write repository files through GITHUB_PAT.', 403);
      const body = objectBody(ctx.body);
      const repository = body.repo;
      const path = validGitHubPatPath(body.path);
      const content = typeof body.content === 'string' ? body.content : null;
      const message = textField(body.message, 200);
      const requestedBranch = textField(body.branch, 250);
      if (!isGitHubPatRepository(repository) || !path || content === null || !message || message.length < 5)
        return error('Choose a configured repository and valid path, file content and commit message.', 400);
      if (Buffer.byteLength(content, 'utf8') > 180000)
        return error('File content exceeds the 180 KB editor limit.', 413);

      let token: string;
      try { token = await readConfiguredGitHubPat(); }
      catch { return error('GITHUB_PAT is not configured or could not be read by the backend.', 503); }

      try {
        const repoResponse = await githubPatFetch(token, 'https://api.github.com/repos/Loofy147/' + encodeURIComponent(repository));
        if (!repoResponse.ok) return error(repoResponse.status === 404
          ? 'This repository is not available to GITHUB_PAT.'
          : 'GitHub denied repository access. Run PAT verification and check token permissions.', 403);
        const repoDetail = await repoResponse.json() as Record<string, unknown>;
        const defaultBranch = typeof repoDetail.default_branch === 'string' ? repoDetail.default_branch : 'main';
        const branch = requestedBranch || defaultBranch;
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,249}$/.test(branch) || branch.split('/').some(part => !part || part === '.' || part === '..'))
          return error('Enter a valid branch name.', 400);

        const fileUrl = 'https://api.github.com/repos/Loofy147/' + encodeURIComponent(repository) +
          '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
        const currentResponse = await githubPatFetch(token, fileUrl);
        let existingSha: string | undefined;
        if (currentResponse.ok) {
          const currentPayload = await currentResponse.json() as Record<string, unknown>;
          if (currentPayload.type !== 'file' || typeof currentPayload.sha !== 'string')
            return error('The selected path is not an existing file. Choose a file path, not a directory.', 400);
          existingSha = currentPayload.sha;
        } else if (currentResponse.status !== 404) {
          return error(currentResponse.status === 403
            ? 'GitHub denied file access. Check Contents: Read and Write permissions.'
            : 'GitHub could not verify the current file before writing; no update was sent.', 502);
        }

        const updateBody = {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          ...(existingSha ? { sha: existingSha } : {}),
        };
        const writeResponse = await githubPatFetch(token, 'https://api.github.com/repos/Loofy147/' +
          encodeURIComponent(repository) + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody),
          });
        const writePayload = await writeResponse.json().catch(() => ({})) as Record<string, unknown>;
        if (!writeResponse.ok) {
          const status = writeResponse.status === 401 ? 401 : writeResponse.status === 403 ? 403 : writeResponse.status === 404 ? 404 : 502;
          return error(status === 403
            ? 'GitHub denied this write. Check Contents: Write, Workflows: Write for workflow files, branch protection and organization policy.'
            : status === 404
              ? 'GitHub could not find the repository, branch, or path required for this commit.'
              : 'GitHub rejected the file update. Check the branch, permissions and repository rules.', status);
        }
        const commit = writePayload.commit && typeof writePayload.commit === 'object'
          ? writePayload.commit as Record<string, unknown> : {};
        return json({
          written: true,
          repositoryFullName: 'Loofy147/' + repository,
          path,
          branch,
          commitSha: typeof commit.sha === 'string' ? commit.sha : undefined,
          commitUrl: typeof commit.html_url === 'string' ? commit.html_url : undefined,
          contentSha: writePayload.content && typeof writePayload.content === 'object'
            ? (writePayload.content as Record<string, unknown>).sha : undefined,
        });
      } catch {
        console.warn('github_pat_file_write_failed');
        return error('GitHub file update did not complete cleanly. Refresh the file before retrying; no credentials were returned.', 502);
      }
    },
  ],

  'POST /api/integrations/github/start': [
    requireAuth(),
    async ctx => {
      let stage = 'configuration';
      try {
        const body = objectBody(ctx.body);
        const requestedLogin = textField(body.login, 39);
        if (requestedLogin && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(requestedLogin))
          return error('Enter a valid GitHub username, not an email address.', 400);
        const config = await githubSecretStatus();
        if (!config.clientIdConfigured || !config.clientSecretConfigured)
          return error('GitHub identity linking is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend secrets first.', 503);
        stage = 'identity_check';
        const [existing] = await db.get<GitHubIdentity>('github_identity_links', [ctx.user!.userId], { consistent: true });
        if (existing) return error('A GitHub identity is already linked. Disconnect it before linking a different account.', 409);
        stage = 'credentials';
        const clientId = await secrets.readSecret(GITHUB_CLIENT_ID_SECRET);
        const clientSecret = await secrets.readSecret(GITHUB_CLIENT_SECRET_SECRET);
        if (!clientId.trim() || !clientSecret)
          return error('The configured GitHub Client ID or Client Secret is empty. Update both values from the same GitHub App.', 503);
        const state = randomUUID();
        const createdAt = new Date();
        stage = 'state_write';
        const [savedId] = await db.tx.add('github_oauth_states', [{
          id: state, appUserId: ctx.user!.userId, purpose: 'identity_link',
          status: 'pending', createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString(),
        }]);
        if (!savedId) return error('A secure one-time connection state could not be saved. Refresh and retry.', 503);
        const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
        authorizationUrl.searchParams.set('client_id', clientId.trim());
        authorizationUrl.searchParams.set('redirect_uri', GITHUB_CALLBACK_URL);
        authorizationUrl.searchParams.set('state', state);
        authorizationUrl.searchParams.set('allow_signup', 'false');
        if (requestedLogin) authorizationUrl.searchParams.set('login', requestedLogin);
        else authorizationUrl.searchParams.set('prompt', 'select_account');
        return json({ authorizationUrl: authorizationUrl.toString() });
      } catch {
        console.warn('github_oauth_start_failed', { stage });
        return error(
          stage === 'state_write'
            ? 'ContribQuest could not save the temporary GitHub connection state. Refresh and retry; if it persists, inspect app service status.'
            : stage === 'credentials'
              ? 'ContribQuest could not read the GitHub Client ID or Client Secret. Re-enter both values from the same GitHub App.'
              : 'ContribQuest could not prepare GitHub authorization. Refresh Account & integrations and retry.',
          503
        );
      }
    },
  ],

  'POST /api/integrations/github/device/start': [
    requireAuth(),
    async ctx => {
      let stage = 'configuration';
      try {
        const config = await githubSecretStatus();
        if (!config.clientIdConfigured)
          return error('GitHub device authorization is not configured. Check GITHUB_CLIENT_ID.', 503);
        const [existing] = await db.get<GitHubIdentity>('github_identity_links', [ctx.user!.userId], { consistent: true });
        if (existing)
          return error('A GitHub identity is already linked. Disconnect it before linking a different account.', 409);

        const clientId = await secrets.readSecret(GITHUB_CLIENT_ID_SECRET);
        if (!clientId.trim()) return error('The GitHub Client ID is empty. Update it from the ContribQuest-WorkLink GitHub App.', 503);

        stage = 'device_code_request';
        const codeResponse = await fetch('https://github.com/login/device/code', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ContribQuest',
          },
          body: new URLSearchParams({ client_id: clientId.trim() }),
        });
        const codePayload = await codeResponse.json() as Record<string, unknown>;
        const providerError = typeof codePayload.error === 'string' ? codePayload.error : '';
        if (providerError === 'device_flow_disabled')
          return error('GitHub Device Flow is disabled. In GitHub Settings → Developer settings → GitHub Apps → ContribQuest-WorkLink, enable Device Flow and save, then retry.', 409);
        if (!codeResponse.ok || providerError ||
            typeof codePayload.device_code !== 'string' ||
            typeof codePayload.user_code !== 'string' ||
            typeof codePayload.verification_uri !== 'string' ||
            typeof codePayload.expires_in !== 'number') {
          console.warn('github_device_flow_start_rejected', {
            status: providerError === 'incorrect_client_credentials' ? 'client_id_rejected' : 'provider_rejected',
          });
          return error('GitHub could not start device authorization. Verify the GitHub App Client ID and that Device Flow is enabled.', 502);
        }

        const deviceCode = codePayload.device_code;
        const userCode = codePayload.user_code;
        if (!/^[A-Za-z0-9_-]{20,128}$/.test(deviceCode) ||
            !/^[A-Z0-9]{4,6}-[A-Z0-9]{4,6}$/i.test(userCode) ||
            codePayload.verification_uri !== 'https://github.com/login/device') {
          console.warn('github_device_flow_start_invalid_payload');
          return error('GitHub returned an invalid device authorization response. Please retry.', 502);
        }

        const flowId = randomUUID();
        const createdAt = new Date();
        const expiresIn = Math.max(60, Math.min(codePayload.expires_in, 1800));
        const intervalSeconds = typeof codePayload.interval === 'number'
          ? Math.max(5, Math.min(codePayload.interval, 60))
          : 5;
        stage = 'state_write';
        const [savedId] = await db.tx.add('github_device_flows', [{
          id: flowId,
          appUserId: ctx.user!.userId,
          deviceCodeHash: createHash('sha256').update(deviceCode).digest('hex'),
          userCode,
          status: 'pending',
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + expiresIn * 1000).toISOString(),
          intervalSeconds,
        }]);
        if (!savedId) return error('ContribQuest could not save the temporary device-flow state. Refresh and retry.', 503);
        return json({
          flowId,
          deviceCode,
          userCode,
          verificationUri: 'https://github.com/login/device',
          expiresIn,
          intervalSeconds,
        });
      } catch {
        console.warn('github_device_flow_start_failed', { stage });
        return error(
          stage === 'state_write'
            ? 'ContribQuest could not save the temporary device authorization. Refresh and retry.'
            : 'ContribQuest could not prepare GitHub device authorization. Verify the GitHub App Client ID and Device Flow setting.',
          503
        );
      }
    },
  ],

  'POST /api/integrations/github/device/poll': [
    requireAuth(),
    async ctx => {
      const body = objectBody(ctx.body);
      const flowId = textField(body.flowId, 64);
      const deviceCode = textField(body.deviceCode, 128);
      if (!flowId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowId) ||
          !deviceCode || !/^[A-Za-z0-9_-]{20,128}$/.test(deviceCode))
        return error('The device authorization session is invalid. Start a new connection.', 400);

      const user = ctx.user!;
      const [flow] = await db.get<GitHubDeviceFlow>('github_device_flows', [flowId], { consistent: true });
      if (!flow || flow.appUserId !== user.userId ||
          flow.deviceCodeHash !== createHash('sha256').update(deviceCode).digest('hex'))
        return error('The device authorization session could not be verified. Start a new connection.', 403);
      if (flow.status === 'consumed') return json({ status: 'linked' });
      if (flow.status === 'failed') return json({ status: 'failed', message: 'This GitHub device authorization has already failed. Start a new connection.' });
      if (flow.status === 'expired' || new Date(flow.expiresAt).getTime() <= Date.now()) {
        await db.tx.update('github_device_flows', [{
          id: flowId, record: { status: 'expired' }, if: { status: 'pending', appUserId: user.userId },
        }], { patch: true });
        return json({ status: 'expired', message: 'The GitHub device code expired. Start a new connection.' });
      }
      if (flow.status !== 'pending') return json({ status: 'failed', message: 'This GitHub device authorization is not pending.' });

      let stage: 'credentials' | 'token_exchange' | 'github_profile' | 'github_email' | 'persistence' = 'credentials';
      try {
        const clientId = await secrets.readSecret(GITHUB_CLIENT_ID_SECRET);
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ContribQuest',
          },
          body: new URLSearchParams({
            client_id: clientId.trim(),
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });
        stage = 'token_exchange';
        const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
        const oauthError = typeof tokenPayload.error === 'string' ? tokenPayload.error : '';
        if (oauthError === 'authorization_pending') {
          return json({ status: 'pending', intervalSeconds: flow.intervalSeconds });
        }
        if (oauthError === 'slow_down') {
          const nextInterval = Math.min(flow.intervalSeconds + 5, 60);
          await db.tx.update('github_device_flows', [{
            id: flowId, record: { intervalSeconds: nextInterval },
            if: { status: 'pending', appUserId: user.userId },
          }], { patch: true });
          return json({ status: 'pending', intervalSeconds: nextInterval });
        }

        const finishWithError = async (status: 'failed' | 'expired', message: string) => {
          await db.tx.update('github_device_flows', [{
            id: flowId, record: { status }, if: { status: 'pending', appUserId: user.userId },
          }], { patch: true });
          return json({ status, message });
        };
        if (oauthError === 'expired_token') return finishWithError('expired', 'The GitHub device code expired. Start a new connection.');
        if (oauthError === 'access_denied') return finishWithError('failed', 'GitHub authorization was denied. Start a new connection when ready.');
        if (oauthError === 'device_flow_disabled')
          return finishWithError('failed', 'GitHub Device Flow is disabled. Enable it in the ContribQuest-WorkLink GitHub App settings, save, and retry.');
        if (oauthError === 'incorrect_client_credentials')
          return finishWithError('failed', 'GitHub rejected the Client ID. Verify it belongs to ContribQuest-WorkLink.');
        if (!tokenResponse.ok || oauthError || typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token)
          return finishWithError('failed', 'GitHub could not complete device authorization. Verify Device Flow is enabled and retry.');

        const accessToken = tokenPayload.access_token as string;
        stage = 'github_profile';
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + accessToken,
            'X-GitHub-Api-Version': '2026-03-10',
            'User-Agent': 'ContribQuest',
          },
        });
        if (!userResponse.ok) {
          console.warn('github_device_profile_rejected', { status: userResponse.status });
          return finishWithError('failed', 'GitHub authorized the device, but ContribQuest could not verify the GitHub profile.');
        }
        const githubUser = await userResponse.json() as Record<string, unknown>;
        if (typeof githubUser.id !== 'number' || typeof githubUser.login !== 'string' ||
            !Number.isSafeInteger(githubUser.id) || githubUser.id <= 0 ||
            !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser.login)) {
          return finishWithError('failed', 'GitHub returned an identity that ContribQuest could not validate.');
        }

        stage = 'github_email';
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + accessToken,
            'X-GitHub-Api-Version': '2026-03-10',
            'User-Agent': 'ContribQuest',
          },
        });
        let verifiedEmails: string[] = [];
        let primaryEmail: string | undefined;
        let emailAccessStatus: 'available' | 'permission_required' | 'unavailable' =
          emailResponse.status === 403 ? 'permission_required' : 'unavailable';
        if (emailResponse.ok) {
          const emailPayload = await emailResponse.json() as unknown;
          if (Array.isArray(emailPayload)) {
            const verifiedRecords = emailPayload.filter((item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item) &&
              item.verified === true && Boolean(normalizeEmail(item.email))
            );
            verifiedEmails = Array.from(new Set(verifiedRecords
              .map(item => normalizeEmail(item.email))
              .filter((email): email is string => Boolean(email))));
            primaryEmail = normalizeEmail(verifiedRecords.find(item => item.primary === true)?.email) || undefined;
            emailAccessStatus = 'available';
          }
        }

        stage = 'persistence';
        const githubUserId = String(githubUser.id);
        const [existingLink] = await db.get<GitHubIdentity>('github_identity_links', [user.userId], { consistent: true });
        const ownerId = 'ghu_' + githubUserId;
        const [existingOwner] = await db.get<GitHubIdentityOwner>('github_identity_owners', [ownerId], { consistent: true });
        if (existingOwner && existingOwner.appUserId !== user.userId) {
          await finishWithError('failed', 'This GitHub identity is already linked to a different ContribQuest account.');
          return json({ status: 'already_linked', message: 'This GitHub identity is already linked to a different ContribQuest account.' });
        }
        if (existingLink && existingLink.githubUserId !== githubUserId) {
          await finishWithError('failed', 'A different GitHub identity is already linked to this ContribQuest account. Disconnect it first.');
          return json({ status: 'already_linked', message: 'A different GitHub identity is already linked to this ContribQuest account. Disconnect it first.' });
        }

        const linkedAt = existingLink?.linkedAt || new Date().toISOString();
        const link: GitHubIdentity = {
          id: user.userId, appUserId: user.userId, githubUserId, githubLogin: githubUser.login,
          verifiedEmails, ...(primaryEmail ? { primaryEmail } : {}),
          emailAccessStatus, linkedAt,
        };
        const owner: GitHubIdentityOwner = { id: ownerId, appUserId: user.userId, githubUserId };
        const operations = [
          db.tx.add('github_identity_links', [link]),
          ...(!existingOwner ? [db.tx.add('github_identity_owners', [owner])] : []),
          db.tx.add('audit_events', [appendAuditEvent(user.userId, 'github.identity_linked', 'integration_identity', githubUserId)]),
          db.tx.update('github_device_flows', [{
            id: flowId, record: { status: 'consumed' }, if: { status: 'pending', appUserId: user.userId },
          }], { patch: true }),
        ];
        const outcome = await db.transact(operations);
        if (!outcome[outcome.length - 1]) {
          return json({ status: 'failed', message: 'The GitHub link could not be committed. Refresh and inspect Account & integrations before retrying.' });
        }
        return json({ status: 'linked', githubLogin: githubUser.login, githubUserId, emailAccessStatus });
      } catch {
        console.warn('github_device_flow_poll_failed', { stage });
        return json({
          status: 'failed',
          message: stage === 'credentials'
            ? 'ContribQuest could not read its GitHub Client ID. Check backend secrets.'
            : stage === 'persistence'
              ? 'GitHub identity was verified, but ContribQuest could not save the link. Refresh and inspect Account & integrations.'
              : 'GitHub device authorization could not be completed. Retry with a new device code.',
        });
      }
    },
  ],

  'GET /api/integrations/github/callback': [
    async ctx => {
      const providerError = ctx.query.error;
      if (providerError) {
        const providerStatus: 'cancelled' | 'callback_mismatch' | 'app_suspended' | 'client_credentials_rejected' | 'provider_error' =
          providerError === 'access_denied' ? 'cancelled'
          : providerError === 'redirect_uri_mismatch' ? 'callback_mismatch'
          : providerError === 'application_suspended' ? 'app_suspended'
          : providerError === 'incorrect_client_credentials' ? 'client_credentials_rejected'
          : 'provider_error';
        if (providerStatus !== 'cancelled') console.warn('github_oauth_provider_rejected', { status: providerStatus });
        return githubCallbackRedirect(providerStatus);
      }

      const state = ctx.query.state;
      const code = ctx.query.code;
      if (!state || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state))
        return githubCallbackRedirect('state_invalid');
      if (!code || code.length > 512) return githubCallbackRedirect('authorization_code_rejected');

      let stage: 'state_validation' | 'credentials' | 'token_exchange' | 'github_profile' | 'persistence' = 'state_validation';
      let failureStatus:
        | 'callback_mismatch'
        | 'client_credentials_rejected'
        | 'authorization_code_rejected'
        | 'token_exchange_failed'
        | 'github_profile_rejected'
        | 'identity_invalid'
        | 'persistence_failed'
        | undefined;
      try {
        const [savedState] = await db.get<GitHubOAuthState>('github_oauth_states', [state], { consistent: true });
        if (!savedState || savedState.status !== 'pending' || savedState.purpose !== 'identity_link' ||
            new Date(savedState.expiresAt).getTime() <= Date.now()) return githubCallbackRedirect('state_invalid');
        const [claimed] = await db.tx.update('github_oauth_states', [{
          id: state, record: { status: 'processing' },
          if: { status: 'pending', appUserId: savedState.appUserId },
        }], { patch: true });
        if (!claimed) return githubCallbackRedirect('state_invalid');

        stage = 'credentials';
        const clientId = await secrets.readSecret(GITHUB_CLIENT_ID_SECRET);
        const clientSecret = await secrets.readSecret(GITHUB_CLIENT_SECRET_SECRET);
        if (!clientId.trim() || !clientSecret) return githubCallbackRedirect('configuration_required');

        stage = 'token_exchange';
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId.trim(), client_secret: clientSecret, code, redirect_uri: GITHUB_CALLBACK_URL }),
        });
        const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
        const oauthError = typeof tokenPayload.error === 'string' ? tokenPayload.error : '';
        if (oauthError === 'incorrect_client_credentials') failureStatus = 'client_credentials_rejected';
        else if (oauthError === 'redirect_uri_mismatch') failureStatus = 'callback_mismatch';
        else if (oauthError === 'bad_verification_code') failureStatus = 'authorization_code_rejected';
        else if (!tokenResponse.ok || oauthError || typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token)
          failureStatus = 'token_exchange_failed';
        if (failureStatus) throw new Error('oauth_token_exchange_failed');
        const accessToken = tokenPayload.access_token as string;

        stage = 'github_profile';
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + accessToken,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ContribQuest',
          },
        });
        if (!userResponse.ok) {
          failureStatus = 'github_profile_rejected';
          throw new Error('github_profile_request_failed');
        }
        const githubUser = await userResponse.json() as Record<string, unknown>;
        if (typeof githubUser.id !== 'number' || typeof githubUser.login !== 'string' ||
            !Number.isSafeInteger(githubUser.id) || githubUser.id <= 0 ||
            !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(githubUser.login)) {
          failureStatus = 'identity_invalid';
          throw new Error('github_identity_invalid');
        }

        const githubEmailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + accessToken,
            'X-GitHub-Api-Version': '2026-03-10',
            'User-Agent': 'ContribQuest',
          },
        });
        let verifiedEmails: string[] = [];
        let primaryEmail: string | undefined;
        let emailAccessStatus: 'available' | 'permission_required' | 'unavailable' =
          githubEmailResponse.status === 403 ? 'permission_required' : 'unavailable';
        if (githubEmailResponse.ok) {
          const emailPayload = await githubEmailResponse.json() as unknown;
          if (Array.isArray(emailPayload)) {
            const verifiedRecords = emailPayload.filter((item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item) &&
              item.verified === true && Boolean(normalizeEmail(item.email))
            );
            verifiedEmails = Array.from(new Set(verifiedRecords
              .map(item => normalizeEmail(item.email))
              .filter((email): email is string => Boolean(email))));
            primaryEmail = normalizeEmail(verifiedRecords.find(item => item.primary === true)?.email) || undefined;
            emailAccessStatus = 'available';
          }
        }

        stage = 'persistence';
        const githubUserId = String(githubUser.id);
        const [existingLink] = await db.get<GitHubIdentity>('github_identity_links', [savedState.appUserId], { consistent: true });
        const ownerId = 'ghu_' + githubUserId;
        const [existingOwner] = await db.get<GitHubIdentityOwner>('github_identity_owners', [ownerId], { consistent: true });
        if (existingLink) {
          if (existingLink.githubUserId === githubUserId && existingOwner?.appUserId === savedState.appUserId) {
            const [updated] = await db.tx.update('github_identity_links', [{
              id: savedState.appUserId,
              record: { verifiedEmails, ...(primaryEmail ? { primaryEmail } : { primaryEmail: undefined }), emailAccessStatus, linkedAt: existingLink.linkedAt },
            }], { patch: true });
            if (!updated) throw new Error('github_email_refresh_failed');
            await db.tx.update('github_oauth_states', [{ id: state, record: { status: 'consumed' }, if: { status: 'processing' } }], { patch: true });
            return githubCallbackRedirect('linked');
          }          await db.tx.update('github_oauth_states', [{ id: state, record: { status: 'failed' }, if: { status: 'processing' } }], { patch: true });
          return githubCallbackRedirect('already_linked');
        }
        if (existingOwner && existingOwner.appUserId !== savedState.appUserId) {
          await db.tx.update('github_oauth_states', [{ id: state, record: { status: 'failed' }, if: { status: 'processing' } }], { patch: true });
          return githubCallbackRedirect('already_linked');
        }
        const linkedAt = new Date().toISOString();
        const link: GitHubIdentity = { id: savedState.appUserId, appUserId: savedState.appUserId, githubUserId, githubLogin: githubUser.login, verifiedEmails, ...(primaryEmail ? { primaryEmail } : {}), emailAccessStatus, linkedAt };
        const owner: GitHubIdentityOwner = { id: ownerId, appUserId: savedState.appUserId, githubUserId };
        const operations = [
          db.tx.add('github_identity_links', [link]),
          ...(!existingOwner ? [db.tx.add('github_identity_owners', [owner])] : []),
          db.tx.add('audit_events', [appendAuditEvent(savedState.appUserId, 'github.identity_linked', 'integration_identity', githubUserId)]),
        ];
        await db.transact(operations);
        await db.tx.update('github_oauth_states', [{ id: state, record: { status: 'consumed' }, if: { status: 'processing' } }], { patch: true });
        return githubCallbackRedirect('linked');
      } catch {
        const failure =
          failureStatus
          || (stage === 'credentials' ? 'configuration_required'
            : stage === 'token_exchange' ? 'token_exchange_failed'
            : stage === 'github_profile' ? 'github_profile_rejected'
            : 'persistence_failed');
        console.warn('github_oauth_callback_failed', { stage, status: failure });
        await db.tx.update('github_oauth_states', [{ id: state, record: { status: 'failed' }, if: { status: 'processing' } }], { patch: true }).catch(() => []);
        return githubCallbackRedirect(failure);
      }
    },
  ],

  'POST /api/integrations/github/disconnect': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const [identity] = await db.get<GitHubIdentity>('github_identity_links', [user.userId], { consistent: true });
      if (!identity) return error('No GitHub identity is linked to this account.', 404);
      const ownerId = 'ghu_' + identity.githubUserId;
      const [owner] = await db.get<GitHubIdentityOwner>('github_identity_owners', [ownerId], { consistent: true });
      const operations = [
        db.tx.delete('github_identity_links', [user.userId]),
        ...(owner?.appUserId === user.userId ? [db.tx.delete('github_identity_owners', [ownerId])] : []),
        db.tx.add('audit_events', [appendAuditEvent(user.userId, 'github.identity_disconnected', 'integration_identity', identity.githubUserId)]),
      ];
      try { await db.transact(operations); }
      catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        return error('GitHub disconnect could not be confirmed. Refresh and check account settings.', 503);
      }
      return json({ disconnected: true });
    },
  ],

  'GET /api/project-contributions': [
    requireAuth(),
    async ctx => {
      const contributions = await db.list<ProjectContribution>(
        userProjectContributionsTable(ctx.user!.userId),
        { limit: 100 }
      );
      return json({
        contributions: contributions.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        hasMore: Boolean(contributions.nextToken),
      });
    },
  ],

  'POST /api/project-contributions': [
    requireAuth(),
    async ctx => {
      const body = objectBody(ctx.body);
      const user = ctx.user!;
      const projectName = textField(body.projectName, 120);
      const workTitle = textField(body.workTitle, 160);
      const description = textField(body.description, 4000);
      const evidenceNote = textField(body.evidenceNote, 1000);
      const workUrl = validUrl(body.workUrl, true);
      const evidenceUrl = validUrl(body.evidenceUrl, true);
      const workTypes = [
        'requirements', 'architecture', 'research', 'software', 'testing',
        'documentation', 'design', 'security', 'integration', 'operations',
        'coordination', 'community', 'other',
      ] as const;
      const riskLevels = ['low', 'standard', 'high'] as const;
      const workType = body.workType;
      const riskLevel = body.riskLevel;
      const acceptanceCriteria = Array.isArray(body.acceptanceCriteria)
        ? body.acceptanceCriteria.map(value => typeof value === 'string' ? value.trim() : '')
        : [];

      if (!projectName || projectName.length < 3)
        return error('Project name must contain at least 3 characters.', 400);
      if (!workTitle || workTitle.length < 5)
        return error('Work title must contain at least 5 characters.', 400);
      if (!description || description.length < 30)
        return error('Describe the delivered work in at least 30 characters.', 400);
      if (!evidenceNote || evidenceNote.length < 15)
        return error('Add an evidence note of at least 15 characters so the result can be checked.', 400);
      if (!workTypes.includes(workType as typeof workTypes[number]))
        return error('Choose a supported contribution type.', 400);
      if (!riskLevels.includes(riskLevel as typeof riskLevels[number]))
        return error('Choose a supported risk level.', 400);
      if (workUrl === null || evidenceUrl === null)
        return error('Work and evidence links must be valid HTTP or HTTPS URLs when provided.', 400);
      if (acceptanceCriteria.length < 1 || acceptanceCriteria.length > 10 ||
          acceptanceCriteria.some(item => item.length < 5 || item.length > 300) ||
          new Set(acceptanceCriteria.map(item => item.toLocaleLowerCase())).size !== acceptanceCriteria.length)
        return error('Provide 1–10 distinct acceptance criteria, each between 5 and 300 characters.', 400);

      const createdAt = new Date().toISOString();
      const id = newRecordId('pc');
      const contribution: ProjectContribution = {
        id,
        contributorId: user.userId,
        contributorName: contributorName(user),
        projectName,
        workTitle,
        workType: workType as ProjectContribution['workType'],
        description,
        ...(workUrl ? { workUrl } : {}),
        ...(evidenceUrl ? { evidenceUrl } : {}),
        evidenceNote,
        acceptanceCriteria,
        criteriaChecks: acceptanceCriteria.map(() => false),
        riskLevel: riskLevel as ProjectContribution['riskLevel'],
        status: 'submitted',
        verificationLevel: 'provisional',
        xpAwarded: 0,
        createdAt,
        updatedAt: createdAt,
      };

      try {
        const outcome = await db.transact([
          db.tx.add(userProjectContributionsTable(user.userId), [contribution]),
          db.tx.add('audit_events', [
            appendAuditEvent(user.userId, 'project_contribution.recorded', 'project_contribution', id),
          ]),
        ]);
        if (!outcome[0][0] || !outcome[1][0])
          return error('The contribution record could not be saved atomically. Refresh and retry.', 503);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        return error('The contribution record could not be confirmed. Refresh before retrying.', 503);
      }
      return json({ contribution }, 201);
    },
  ],

  'POST /api/project-contributions/:id/verify': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const body = objectBody(ctx.body);
      const [contribution] = await db.get<ProjectContribution>(
        userProjectContributionsTable(user.userId),
        [ctx.params.id],
        { consistent: true }
      );
      if (!contribution) return error('Contribution not found in your private work log.', 404);
      if (contribution.status === 'accepted') {
        return json({
          verified: true,
          duplicate: true,
          status: contribution.status,
          xpAwarded: contribution.xpAwarded,
          message: 'This contribution was already verified. No duplicate XP was awarded.',
        });
      }
      if (contribution.status !== 'submitted')
        return error('This contribution is not available for verification.', 409);

      const criteriaChecks = Array.isArray(body.criteriaChecks) ? body.criteriaChecks : [];
      if (criteriaChecks.some(value => typeof value !== 'boolean') ||
          criteriaChecks.length !== contribution.acceptanceCriteria.length)
        return error('Record a true or false result for every acceptance criterion.', 400);
      if (!criteriaChecks.every(Boolean))
        return error('Self-verification requires every acceptance criterion to pass. Update the work or its evidence first.', 400);
      const verificationNote = textField(body.verificationNote, 1000);
      if (!verificationNote || verificationNote.length < 15)
        return error('Add a verification rationale of at least 15 characters.', 400);

      const reviewRequired = requiresIndependentProjectReview(contribution);
      if (contribution.riskLevel !== 'low' || reviewRequired) {
        return error(
          'This record needs independent review or documented automated checks. Self-verification and XP are disabled for standard/high-risk or security-sensitive work.',
          403
        );
      }

      const now = new Date().toISOString();
      const awardId = 'project_xp_' + contribution.id;
      const patch = {
        status: 'accepted' as const,
        verificationLevel: 'self_verified' as const,
        verificationNote,
        criteriaChecks: [...criteriaChecks] as boolean[],
        reviewerId: user.userId,
        reviewerName: contributorName(user),
        xpAwarded: 50,
        updatedAt: now,
        acceptedAt: now,
      };
      const [profile] = await db.get<Profile>('profiles', [user.userId], { consistent: true });
      if (!profile) {
        await db.tx.add('profiles', [{
          id: user.userId,
          displayName: contributorName(user),
          xp: 0,
          acceptedCount: 0,
        }]);
      }

      try {
        await db.transact([
          db.tx.update(userProjectContributionsTable(user.userId), [{
            id: contribution.id,
            record: patch,
            if: { status: 'submitted', contributorId: user.userId },
          }], { patch: true }),
          db.tx.add('xp_awards', [{
            id: awardId,
            userId: user.userId,
            contributionId: contribution.id,
            amount: 50,
            ruleVersion: 'project-self-v1',
            verificationLevel: 'self_verified',
            createdAt: now,
          }]),
          db.tx.update('profiles', [{
            id: user.userId,
            record: { xp: increment(50) },
          }], { patch: true }),
          db.tx.add('audit_events', [
            appendAuditEvent(user.userId, 'project_contribution.self_verified', 'project_contribution', contribution.id),
          ]),
        ]);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        const [saved] = await db.get<ProjectContribution>(
          userProjectContributionsTable(user.userId),
          [contribution.id],
          { consistent: true }
        );
        if (saved?.status === 'accepted') {
          return json({
            verified: true,
            duplicate: true,
            status: saved.status,
            xpAwarded: saved.xpAwarded,
            message: 'This contribution is already verified. No duplicate XP was awarded.',
          });
        }
        return error('Verification could not be confirmed. Refresh the work log before retrying.', 503);
      }

      return json({
        verified: true,
        duplicate: false,
        status: 'accepted',
        verificationLevel: 'self_verified',
        xpAwarded: 50,
        message: 'Low-risk contribution self-verified. 50 XP recorded.',
      });
    },
  ],

  'GET /api/bounties': [
    async () => {
      const bounties = await readBounties();
      return json({ bounties });
    },
  ],

  'GET /api/leaderboard': [
    async () => {
      const result = await db.list<Profile>('profiles', { limit: 100 });
      const profiles = result.items.sort((a, b) => b.xp - a.xp).slice(0, 25);
      return json({ profiles });
    },
  ],

  'POST /api/bounties': [
    requireAuth(),
    async ctx => {
      const outcome = await createBountyForUser(ctx.user!, ctx.body);
      if (outcome.ok === false) return error(outcome.message, outcome.status);
      return json({ bounty: outcome.bounty }, 201);
    },
  ],

  'POST /api/bounties/:id/submit': [
    requireAuth(),
    async ctx => {
      const body = objectBody(ctx.body);
      const user = ctx.user!;
      const workUrl = validUrl(body.workUrl, true);
      const note = textField(body.note, 2000);
      if (workUrl === null)
        return error('Evidence link must be a valid HTTP or HTTPS URL when provided.', 400);
      if (!note || note.length < 15)
        return error(
          'Explain your change and testing in at least 15 characters.',
          400
        );
      const [bounty] = await db.get<Bounty>('bounties', [ctx.params.id], {
        consistent: true,
      });
      if (!bounty) return error('Bounty not found.', 404);
      if (bounty.sample)
        return error(
          'Sample listings are examples only. Submit to a live bounty.',
          400
        );
      if (bounty.status !== 'open')
        return error('This bounty is no longer open.', 409);
      if (bounty.createdBy === user.userId)
        return error('You cannot submit work to your own bounty.', 403);

      if (bounty.tier === 'paid') {
        const [profile] = await db.get<Profile>('profiles', [user.userId], {
          consistent: true,
        });
        const acceptedCount = profile?.acceptedCount ?? 0;
        if (acceptedCount < bounty.minAccepted) {
          return error(
            'This paid bounty requires ' +
              bounty.minAccepted +
              ' accepted contributions. Your current count is ' +
              acceptedCount +
              '.',
            403
          );
        }
      }

      const migration = await advanceWorkIndexMigration(user.userId);
      if (!migration.contributionsDone) {
        return error(
          'Your existing contribution history is still being indexed. Open My contributions and continue indexing before submitting new work.',
          409
        );
      }
      const guardId = submissionGuardId(ctx.params.id, user.userId);
      const [activeGuard] = await db.get<ActiveSubmission>('active_submissions', [guardId], {
        consistent: true,
      });
      if (activeGuard) {
        return error(
          'You already have an active submission or requested revision for this bounty. Use the existing submission to respond to review feedback.',
          409
        );
      }

      const acceptanceCriteria = bounty.acceptanceCriteria?.length
        ? bounty.acceptanceCriteria
        : DEFAULT_ACCEPTANCE_CRITERIA;
      const submittedAt = new Date().toISOString();
      const record = {
        bountyId: ctx.params.id,
        bountyTitle: bounty.title,
        bountyTier: bounty.tier,
        submitterId: user.userId,
        submitterName: contributorName(user),
        ownerId: bounty.createdBy,
        ...(workUrl ? { workUrl } : {}),
        acceptanceCriteria: [...acceptanceCriteria],
        note,
        status: 'pending' as const,
        createdAt: submittedAt,
        lastSubmittedAt: submittedAt,
        revisionNumber: 1,
        revisionHistory: [{
          revisionNumber: 1,
          note,
          ...(workUrl ? { workUrl } : {}),
          submittedAt,
        }],
      };
      const id = newRecordId('c');
      const persisted = { ...record, id };
      const guard: ActiveSubmission = {
        id: guardId,
        contributionId: id,
        bountyId: ctx.params.id,
        submitterId: user.userId,
        createdAt: submittedAt,
        status: 'pending',
      };
      try {
        const contributionWrite = db.tx.add('contributions', [persisted]);
        const submitterIndexWrite = db.tx.add(userSubmissionsTable(user.userId), [persisted]);
        const ownerIndexWrite = db.tx.add(userReceivedTable(bounty.createdBy), [persisted]);
        const guardWrite = db.tx.add('active_submissions', [guard]);
        const [contributionIds, submitterIds, ownerIds, guardIds] = await db.transact([
          contributionWrite,
          submitterIndexWrite,
          ownerIndexWrite,
          guardWrite,
        ]);
        if (!contributionIds[0] || !submitterIds[0] || !ownerIds[0] || !guardIds[0])
          return error('Your submission could not be saved atomically. Please refresh and retry.', 503);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        const [confirmedGuard] = await db.get<ActiveSubmission>('active_submissions', [guardId], {
          consistent: true,
        });
        if (confirmedGuard) {
          const [existingContribution] = await db.get<Contribution>(
            'contributions',
            [confirmedGuard.contributionId],
            { consistent: true }
          );
          if (existingContribution && confirmedGuard.contributionId === id) {
            return json({ contribution: { ...existingContribution, id: confirmedGuard.contributionId } }, 201);
          }
          return error(
            'You already have an active submission or requested revision for this bounty. Use the existing submission to respond to review feedback.',
            409
          );
        }
        return error('Your submission could not be saved atomically. Please refresh and retry.', 503);
      }
      return json({ contribution: persisted }, 201);
    },
  ],

  'GET /api/my-work': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const migration = await advanceWorkIndexMigration(user.userId);
      const [bountyResult, submissionResult, receivedResult, profileResult] =
        await Promise.all([
          db.list<Bounty>(userBountiesTable(user.userId), { limit: 100 }),
          db.list<Contribution>(userSubmissionsTable(user.userId), { limit: 100 }),
          db.list<Contribution>(userReceivedTable(user.userId), { limit: 100 }),
          db.get<Profile>('profiles', [user.userId], { consistent: true }),
        ]);
      const profile = profileResult[0] || {
        displayName: contributorName(user),
        xp: 0,
        acceptedCount: 0,
      };
      return json({
        profile,
        mySubmissions: submissionResult.items,
        myBounties: bountyResult.items,
        receivedSubmissions: receivedResult.items,
        indexing: !(migration.bountiesDone && migration.contributionsDone),
        indexProgress: {
          bountiesDone: migration.bountiesDone,
          contributionsDone: migration.contributionsDone,
        },
        hasMore: {
          myBounties: Boolean(bountyResult.nextToken),
          mySubmissions: Boolean(submissionResult.nextToken),
          receivedSubmissions: Boolean(receivedResult.nextToken),
        },
      });
    },
  ],

  'POST /api/contributions/:id/resubmit': [
    requireAuth(),
    async ctx => {
      const body = objectBody(ctx.body);
      const user = ctx.user!;
      const workUrl = validUrl(body.workUrl, true);
      const note = textField(body.note, 2000);
      if (workUrl === null)
        return error('Evidence link must be a valid HTTP or HTTPS URL when provided.', 400);
      if (!note || note.length < 15)
        return error('Explain the revised contribution in at least 15 characters.', 400);
      const [contribution] = await db.get<Contribution>('contributions', [ctx.params.id], { consistent: true });
      if (!contribution) return error('Contribution not found.', 404);
      if (contribution.submitterId !== user.userId)
        return error('Only the original contributor can resubmit this work.', 403);
      if (contribution.status !== 'needs_changes')
        return error('Only work with a changes-requested review can be resubmitted.', 409);
      const [bounty] = await db.get<Bounty>('bounties', [contribution.bountyId], { consistent: true });
      if (!bounty || bounty.status !== 'open')
        return error('This bounty is no longer open for revisions.', 409);

      await ensureContributionIndexes(ctx.params.id, contribution);
      const submittedAt = new Date().toISOString();
      const revisionNumber = (contribution.revisionNumber ?? 1) + 1;
      const revisionHistory = [
        ...(contribution.revisionHistory ?? [{ revisionNumber: 1, note: contribution.note, ...(contribution.workUrl ? { workUrl: contribution.workUrl } : {}), submittedAt: contribution.lastSubmittedAt || contribution.createdAt }]),
        { revisionNumber, note, ...(workUrl ? { workUrl } : {}), submittedAt },
      ].slice(-20);
      const acceptanceCriteria = contribution.acceptanceCriteria?.length
        ? contribution.acceptanceCriteria
        : DEFAULT_ACCEPTANCE_CRITERIA;
      const revisionPatch = {
        status: 'pending' as const,
        workUrl: workUrl || undefined,
        note,
        revisionNumber,
        revisionHistory,
        lastSubmittedAt: submittedAt,
        feedback: undefined,
        criteriaChecks: acceptanceCriteria.map(() => false),
        reviewedAt: undefined,
      };
      try {
        await db.transact([
          db.tx.update('contributions', [{
            id: ctx.params.id,
            record: revisionPatch,
            if: { status: 'needs_changes', submitterId: user.userId },
          }], { patch: true }),
          db.tx.update(userSubmissionsTable(user.userId), [{
            id: ctx.params.id,
            record: revisionPatch,
            if: { status: 'needs_changes', submitterId: user.userId },
          }], { patch: true }),
          db.tx.update(userReceivedTable(contribution.ownerId), [{
            id: ctx.params.id,
            record: revisionPatch,
            if: { status: 'needs_changes', submitterId: user.userId },
          }], { patch: true }),
        ]);
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        const [saved] = await db.get<Contribution>('contributions', [ctx.params.id], { consistent: true });
        if (saved?.status === 'pending' && saved.revisionNumber === revisionNumber) {
          return json({ resubmitted: true, status: 'pending', revisionNumber });
        }
        return error('The resubmission could not be confirmed. Refresh and check the current contribution before retrying.', 503);
      }
      return json({ resubmitted: true, status: 'pending', revisionNumber });
    },
  ],

  'POST /api/contributions/:id/review': [
    requireAuth(),
    async ctx => {
      const body = objectBody(ctx.body);
      const status = body.status;
      const allowed =
        status === 'accepted' ||
        status === 'needs_changes' ||
        status === 'rejected';
      if (!allowed)
        return error('Choose accepted, needs changes, or rejected.', 400);
      const feedback = textField(body.feedback, 1000);
      if (!feedback || feedback.length < 15)
        return error('Provide a specific review rationale of at least 15 characters.', 400);
      const criteriaChecks = Array.isArray(body.criteriaChecks) ? body.criteriaChecks : [];
      if (criteriaChecks.some(value => typeof value !== 'boolean'))
        return error('Every review checklist value must be true or false.', 400);
      const [contribution] = await db.get<Contribution>(
        'contributions',
        [ctx.params.id],
        { consistent: true }
      );
      if (!contribution) return error('Contribution not found.', 404);
      if (contribution.ownerId !== ctx.user!.userId)
        return error('Only the bounty owner can review this work.', 403);
      if (contribution.status !== 'pending')
        return error('This contribution has already been reviewed.', 409);
      const acceptanceCriteria = contribution.acceptanceCriteria?.length
        ? contribution.acceptanceCriteria
        : DEFAULT_ACCEPTANCE_CRITERIA;
      if (criteriaChecks.length !== acceptanceCriteria.length)
        return error('The review must record a pass or fail for every acceptance criterion.', 400);
      if (status === 'accepted' && !criteriaChecks.every(Boolean))
        return error('Acceptance blocked: every agreed acceptance criterion must be marked as met.', 400);
      const reviewedAt = new Date().toISOString();
      const reviewEvent: ReviewEvent = {
        status,
        feedback,
        criteriaChecks: [...criteriaChecks],
        reviewerId: ctx.user!.userId,
        reviewerName: contributorName(ctx.user!),
        reviewedAt,
      };
      const reviewHistory = [...(contribution.reviewHistory ?? []), reviewEvent].slice(-20);

      await ensureContributionIndexes(ctx.params.id, contribution);

      if (status === 'accepted') {
        const [bounty] = await db.get<Bounty>(
          'bounties',
          [contribution.bountyId],
          { consistent: true }
        );
        if (!bounty || bounty.status !== 'open')
          return error('This bounty is no longer open.', 409);
        await db.tx.add('profiles', [
          {
            id: contribution.submitterId,
            displayName: contribution.submitterName,
            xp: 0,
            acceptedCount: 0,
          },
        ]);
        try {
          const acceptedPatch = {
            status: 'accepted' as const,
            feedback,
            criteriaChecks: [...criteriaChecks],
            reviewHistory,
            reviewedAt,
          };
          const contributionUpdate = db.tx.update(
            'contributions',
            [{ id: ctx.params.id, record: acceptedPatch, if: { status: 'pending' } }],
            { patch: true }
          );
          const submitterIndexUpdate = db.tx.update(
            userSubmissionsTable(contribution.submitterId),
            [{ id: ctx.params.id, record: acceptedPatch, if: { status: 'pending' } }],
            { patch: true }
          );
          const ownerIndexUpdate = db.tx.update(
            userReceivedTable(contribution.ownerId),
            [{ id: ctx.params.id, record: acceptedPatch, if: { status: 'pending' } }],
            { patch: true }
          );
          const bountyUpdate = db.tx.update(
            'bounties',
            [{ id: contribution.bountyId, record: { status: 'completed' }, if: { status: 'open' } }],
            { patch: true }
          );
          const profileUpdate = db.tx.update(
            'profiles',
            [{ id: contribution.submitterId, record: { xp: increment(50), acceptedCount: increment(1) } }],
            { patch: true }
          );
          const guardDelete = db.tx.delete('active_submissions', [
            submissionGuardId(contribution.bountyId, contribution.submitterId),
          ]);
          await db.transact([
            contributionUpdate,
            submitterIndexUpdate,
            ownerIndexUpdate,
            bountyUpdate,
            profileUpdate,
            guardDelete,
          ]);
        } catch (cause: unknown) {
          if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
          const [saved] = await db.get<Contribution>('contributions', [ctx.params.id], { consistent: true });
          if (saved?.status === 'accepted') {
            return json({
              reviewed: true,
              status: 'accepted',
              xpAwarded: 50,
              message: 'Contribution accepted. 50 XP awarded.',
            });
          }
          return error(
            'The review could not be confirmed. Refresh and check the current contribution before retrying.',
            503
          );
        }
        return json({
          reviewed: true,
          status: 'accepted',
          xpAwarded: 50,
          message: 'Contribution accepted. 50 XP awarded.',
        });
      }

      const reviewPatch = {
        status,
        feedback,
        criteriaChecks: [...criteriaChecks],
        reviewHistory,
        reviewedAt,
      };
      try {
        const contributionUpdate = db.tx.update('contributions', [{
          id: ctx.params.id,
          record: reviewPatch,
          if: { status: 'pending' },
        }], { patch: true });
        const submitterIndexUpdate = db.tx.update(userSubmissionsTable(contribution.submitterId), [{
          id: ctx.params.id,
          record: reviewPatch,
          if: { status: 'pending' },
        }], { patch: true });
        const ownerIndexUpdate = db.tx.update(userReceivedTable(contribution.ownerId), [{
          id: ctx.params.id,
          record: reviewPatch,
          if: { status: 'pending' },
        }], { patch: true });
        if (status === 'rejected') {
          await db.transact([
            contributionUpdate,
            submitterIndexUpdate,
            ownerIndexUpdate,
            db.tx.delete('active_submissions', [
              submissionGuardId(contribution.bountyId, contribution.submitterId),
            ]),
          ]);
        } else {
          await db.transact([contributionUpdate, submitterIndexUpdate, ownerIndexUpdate]);
        }
      } catch (cause: unknown) {
        if (isAppDatabaseError(cause) && cause.code === 'AppDatabaseQuotaExceeded') throw cause;
        const [saved] = await db.get<Contribution>('contributions', [ctx.params.id], { consistent: true });
        if (saved?.status === status) return json({ reviewed: true, status });
        return error('The review could not be confirmed. Refresh and check the current contribution before retrying.', 503);
      }
      return json({ reviewed: true, status });
    },
  ],
});
