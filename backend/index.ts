import {
  router,
  json,
  error,
  requireAuth,
  db,
  increment,
} from '@appdeploy/sdk';

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
type Profile = { displayName: string; xp: number; acceptedCount: number };

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

export const handler = router({
  'GET /api/_healthcheck': [
    async () => json({ message: 'ContribQuest API online' }),
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
      const body = objectBody(ctx.body);
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
      const minAccepted =
        body.minAccepted === undefined ? 2 : Number(body.minAccepted);
      if (!title || title.length < 8)
        return error('Use a clear bounty title of at least 8 characters.', 400);
      if (!description || description.length < 20)
        return error(
          'Describe the expected work in at least 20 characters.',
          400
        );
      if (!category) return error('Choose a bounty category.', 400);
      if (acceptanceCriteria.length < 2 || acceptanceCriteria.length > 10)
        return error('Provide between 2 and 10 acceptance criteria, one per line.', 400);
      if (acceptanceCriteria.some(item => item.length < 5 || item.length > 240))
        return error('Each acceptance criterion must be between 5 and 240 characters.', 400);
      if (new Set(acceptanceCriteria.map(item => item.toLowerCase())).size !== acceptanceCriteria.length)
        return error('Acceptance criteria must be unique. Remove duplicate checks.', 400);
      if (!Number.isFinite(reward) || reward < 1 || reward > 100000)
        return error('The offer must be between $1 and $100,000.', 400);
      if (repoUrl === null)
        return error('Repository URL must be a valid HTTP or HTTPS link.', 400);
      if (!tier) return error('Choose community or paid bounty type.', 400);
      if (!Number.isInteger(minAccepted) || minAccepted < 1 || minAccepted > 20)
        return error(
          'Minimum accepted contributions must be between 1 and 20.',
          400
        );
      const user = ctx.user!;
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
      const [id] = await db.add('bounties', [record]);
      if (!id)
        return error('The bounty could not be saved. Please retry.', 503);
      return json({ bounty: { ...record, id } }, 201);
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

      const previous = await db.list<Contribution>('contributions', {
        filter: { bountyId: ctx.params.id, submitterId: user.userId },
        limit: 100,
      });
      if (
        previous.items.some(
          item => item.status === 'pending' || item.status === 'accepted' || item.status === 'needs_changes'
        )
      ) {
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
      const [id] = await db.add('contributions', [record]);
      if (!id)
        return error('Your submission could not be saved. Please retry.', 503);
      return json({ contribution: { ...record, id } }, 201);
    },
  ],

  'GET /api/my-work': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const [bountyResult, contributionResult, profileResult] =
        await Promise.all([
          db.list<Bounty>('bounties', { limit: 100 }),
          db.list<Contribution>('contributions', { limit: 100 }),
          db.get<Profile>('profiles', [user.userId], { consistent: true }),
        ]);
      const myBounties = bountyResult.items.filter(
        item => item.createdBy === user.userId
      );
      const ownedIds = new Set(myBounties.map(item => item.id));
      const mySubmissions = contributionResult.items.filter(
        item => item.submitterId === user.userId
      );
      const receivedSubmissions = contributionResult.items.filter(item =>
        ownedIds.has(item.bountyId)
      );
      const profile = profileResult[0] || {
        displayName: contributorName(user),
        xp: 0,
        acceptedCount: 0,
      };
      return json({ profile, mySubmissions, myBounties, receivedSubmissions });
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

      const submittedAt = new Date().toISOString();
      const revisionNumber = (contribution.revisionNumber ?? 1) + 1;
      const revisionHistory = [
        ...(contribution.revisionHistory ?? [{ revisionNumber: 1, note: contribution.note, ...(contribution.workUrl ? { workUrl: contribution.workUrl } : {}), submittedAt: contribution.lastSubmittedAt || contribution.createdAt }]),
        { revisionNumber, note, ...(workUrl ? { workUrl } : {}), submittedAt },
      ].slice(-20);
      const acceptanceCriteria = contribution.acceptanceCriteria?.length
        ? contribution.acceptanceCriteria
        : DEFAULT_ACCEPTANCE_CRITERIA;
      const [updated] = await db.tx.update('contributions', [{
        id: ctx.params.id,
        record: {
          status: 'pending',
          workUrl: workUrl || undefined,
          note,
          revisionNumber,
          revisionHistory,
          lastSubmittedAt: submittedAt,
          feedback: undefined,
          criteriaChecks: acceptanceCriteria.map(() => false),
          reviewedAt: undefined,
        },
        if: { status: 'needs_changes', submitterId: user.userId },
      }], { patch: true });
      if (!updated)
        return error('The submission changed while you were editing. Refresh and try again.', 409);
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
          const contributionUpdate = db.tx.update(
            'contributions',
            [
              {
                id: ctx.params.id,
                record: {
                  status: 'accepted',
                  feedback,
                  criteriaChecks: [...criteriaChecks],
                  reviewHistory,
                  reviewedAt,
                },
                if: { status: 'pending' },
              },
            ],
            { patch: true }
          );
          const bountyUpdate = db.tx.update(
            'bounties',
            [
              {
                id: contribution.bountyId,
                record: { status: 'completed' },
                if: { status: 'open' },
              },
            ],
            { patch: true }
          );
          const profileUpdate = db.tx.update(
            'profiles',
            [
              {
                id: contribution.submitterId,
                record: { xp: increment(50), acceptedCount: increment(1) },
              },
            ],
            { patch: true }
          );
          await db.transact([contributionUpdate, bountyUpdate, profileUpdate]);
        } catch {
          return error(
            'The review could not be committed. The contribution or bounty may have changed; refresh and check its current status.',
            409
          );
        }
        return json({
          reviewed: true,
          status: 'accepted',
          xpAwarded: 50,
          message: 'Contribution accepted. 50 XP awarded.',
        });
      }

      const [updated] = await db.tx.update(
        'contributions',
        [
          {
            id: ctx.params.id,
            record: { status, feedback, criteriaChecks: [...criteriaChecks], reviewHistory, reviewedAt },
            if: { status: 'pending' },
          },
        ],
        { patch: true }
      );
      if (!updated)
        return error('This contribution has already been reviewed.', 409);
      return json({ reviewed: true, status });
    },
  ],
});
