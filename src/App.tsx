import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  Compass,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  GitPullRequest,
  Lightbulb,
  LockKeyhole,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api, auth } from '@appdeploy/client';

type Bounty = {
  id: string;
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
  id: string;
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
type ReviewDraft = { criteriaChecks: boolean[]; feedback: string };
type CurrentUser = {
  userId: string;
  name?: string;
  email?: string;
  picture?: string;
};
type Profile = { displayName?: string; xp: number; acceptedCount: number };
type WorkData = {
  profile: Profile;
  mySubmissions: Contribution[];
  myBounties: Bounty[];
  receivedSubmissions: Contribution[];
};
type View =
  | 'Overview'
  | 'Explore bounties'
  | 'My contributions'
  | 'Manage work'
  | 'Goals & levels'
  | 'Leaderboard';

const EMPTY_WORK: WorkData = {
  profile: { xp: 0, acceptedCount: 0 },
  mySubmissions: [],
  myBounties: [],
  receivedSubmissions: [],
};

const NAV: { name: View; icon: typeof Compass; hint?: string }[] = [
  { name: 'Overview', icon: BarChart3 },
  { name: 'Explore bounties', icon: Compass },
  { name: 'My contributions', icon: GitPullRequest },
  { name: 'Manage work', icon: ShieldCheck },
  { name: 'Goals & levels', icon: Target },
  { name: 'Leaderboard', icon: Trophy },
];

const DEFAULT_ACCEPTANCE_CRITERIA = [
  'The deliverable meets the stated objective.',
  'The result is complete and can be reviewed against the agreed scope.',
];

function acceptanceCriteriaFor(item: { acceptanceCriteria?: string[] }) {
  return item.acceptanceCriteria?.length
    ? item.acceptanceCriteria
    : DEFAULT_ACCEPTANCE_CRITERIA;
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
const shortDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? 'Recently'
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const errorText = (err: unknown) => {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (
      err as { response?: { data?: { message?: string; error?: string } } }
    ).response;
    if (response?.data?.message) return response.data.message;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error
    ? err.message
    : 'Something went wrong. Please try again.';
};
const statusLabel = (status: Contribution['status']) =>
  ({
    pending: 'Awaiting review',
    accepted: 'Accepted',
    needs_changes: 'Changes requested',
    rejected: 'Not accepted',
  })[status];
const statusClass = (status: Contribution['status']) =>
  ({
    pending: 'status-pending',
    accepted: 'status-accepted',
    needs_changes: 'status-changes',
    rejected: 'status-rejected',
  })[status];

function App() {
  const [view, setView] = useState<View>('Overview');
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [work, setWork] = useState<WorkData>(EMPTY_WORK);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [tierFilter, setTierFilter] = useState('All bounties');
  const [modal, setModal] = useState<'create' | 'submit' | 'revise' | null>(null);
  const [target, setTarget] = useState<Bounty | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<Contribution | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [bountyForm, setBountyForm] = useState({
    title: '',
    description: '',
    reward: '150',
    category: 'General / Other',
    skills: 'Any relevant skills',
    repoUrl: '',
    acceptanceCriteria: 'Deliverable meets the stated objective.\nResult is complete and can be reviewed against the agreed scope.',
    tier: 'community',
    minAccepted: '2',
  });
  const [submissionForm, setSubmissionForm] = useState({
    workUrl: '',
    note: '',
  });
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});

  const getReviewDraft = (item: Contribution): ReviewDraft =>
    reviewDrafts[item.id] ?? {
      criteriaChecks: acceptanceCriteriaFor(item).map(() => false),
      feedback: '',
    };

  const updateReviewDraft = (item: Contribution, patch: Partial<ReviewDraft>) => {
    setReviewDrafts(current => {
      const existing = current[item.id] ?? {
        criteriaChecks: acceptanceCriteriaFor(item).map(() => false),
        feedback: '',
      };
      return { ...current, [item.id]: { ...existing, ...patch } };
    });
  };

  const refreshData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const [bountyResponse, leaderboardResponse] = await Promise.all([
        api.get('/api/bounties'),
        api.get('/api/leaderboard'),
      ]);
      setBounties((bountyResponse.data?.bounties ?? []) as Bounty[]);
      setLeaderboard((leaderboardResponse.data?.profiles ?? []) as Profile[]);
      let current: CurrentUser | null = null;
      try {
        current = (await auth.getUser()) as CurrentUser | null;
      } catch {
        current = null;
      }
      setUser(current);
      if (current) {
        const workResponse = await api.get('/api/my-work');
        setWork(workResponse.data as WorkData);
      } else {
        setWork(EMPTY_WORK);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  const acceptedCount = work.profile?.acceptedCount ?? 0;
  const xp = work.profile?.xp ?? 0;
  const level = Math.floor(xp / 250) + 1;
  const xpInLevel = xp % 250;
  const canAccessPaid = acceptedCount >= 2;
  const openBounties = useMemo(
    () => bounties.filter(item => item.status === 'open'),
    [bounties]
  );
  const filteredBounties = useMemo(() => {
    const search = query.trim().toLowerCase();
    return openBounties.filter(item => {
      const matchesSearch =
        !search ||
        [
          item.title,
          item.description,
          item.category,
          ...(item.skills || []),
        ].some(value => value.toLowerCase().includes(search));
      const matchesCategory =
        category === 'All categories' || item.category === category;
      const matchesTier =
        tierFilter === 'All bounties' || item.tier === tierFilter;
      return matchesSearch && matchesCategory && matchesTier;
    });
  }, [openBounties, query, category, tierFilter]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const signIn = async () => {
    setError('');
    try {
      const result = await auth.signIn();
      setUser(result.user as CurrentUser);
      await refreshData(false);
      showToast('You are signed in. Let’s make a contribution count.');
      return true;
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      setError(
        code === 'popup_blocked'
          ? 'Your browser blocked the sign-in popup. Allow popups and try again.'
          : code === 'popup_closed'
            ? 'Sign-in was cancelled. You can continue browsing.'
            : errorText(err)
      );
      return false;
    }
  };

  const signOut = async () => {
    try {
      await auth.signOut();
      setUser(null);
      setWork(EMPTY_WORK);
      setView('Overview');
      showToast('Signed out.');
    } catch (err) {
      setError(errorText(err));
    }
  };

  const requireUser = async () => {
    if (user) return true;
    return await signIn();
  };

  const openCreateModal = async () => {
    if (await requireUser()) {
      setRevisionTarget(null);
      setTarget(null);
      setBountyForm({
        title: '',
        description: '',
        reward: '150',
        category: 'General / Other',
        skills: 'Any relevant skills',
        repoUrl: '',
        acceptanceCriteria: 'Deliverable meets the stated objective.\nResult is complete and can be reviewed against the agreed scope.',
        tier: 'community',
        minAccepted: '2',
      });
      setModal('create');
    }
  };

  const startSubmission = async (bounty: Bounty) => {
    if (bounty.sample) {
      showToast(
        'This is a sample listing. Create a real bounty or choose a community bounty.'
      );
      return;
    }
    if (bounty.tier === 'paid' && acceptedCount < bounty.minAccepted) {
      setView('Goals & levels');
      showToast(
        'Earn accepted community contributions to unlock this paid bounty.'
      );
      return;
    }
    if (user) {
      const existingRevision = work.mySubmissions.find(
        item => item.bountyId === bounty.id && item.status === 'needs_changes'
      );
      if (existingRevision) {
        setView('My contributions');
        showToast('The owner requested changes on your existing submission. Use Revise & resubmit there.');
        return;
      }
    }
    if (await requireUser()) {
      setRevisionTarget(null);
      setTarget(bounty);
      setSubmissionForm({ workUrl: '', note: '' });
      setModal('submit');
    }
  };

  const startRevision = async (item: Contribution) => {
    if (item.status !== 'needs_changes') return;
    if (await requireUser()) {
      setRevisionTarget(item);
      setTarget(bounties.find(bounty => bounty.id === item.bountyId) ?? null);
      setSubmissionForm({ workUrl: item.workUrl ?? '', note: item.note });
      setModal('revise');
    }
  };

  const createBounty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/api/bounties', {
        title: bountyForm.title,
        description: bountyForm.description,
        reward: Number(bountyForm.reward),
        category: bountyForm.category,
        acceptanceCriteria: bountyForm.acceptanceCriteria
          .split('\n')
          .map(item => item.trim())
          .filter(Boolean),
        skills: bountyForm.skills
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
        repoUrl: bountyForm.repoUrl,
        tier: bountyForm.tier,
        minAccepted: Number(bountyForm.minAccepted),
      });
      setModal(null);
      await refreshData(false);
      setView('Explore bounties');
      showToast('Bounty published. It is now on the board.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resubmitting = modal === 'revise' && revisionTarget !== null;
    if (resubmitting && revisionTarget) {
      // A revision updates the existing submission and keeps its original criteria and audit history.
    } else if (!target) {
      setError('Choose a bounty before submitting work.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (resubmitting && revisionTarget) {
        await api.post('/api/contributions/' + revisionTarget.id + '/resubmit', submissionForm);
        setReviewDrafts(current => ({
          ...current,
          [revisionTarget.id]: {
            criteriaChecks: acceptanceCriteriaFor(revisionTarget).map(() => false),
            feedback: '',
          },
        }));
      } else if (target) {
        await api.post('/api/bounties/' + target.id + '/submit', submissionForm);
      }
      setModal(null);
      setRevisionTarget(null);
      setTarget(null);
      await refreshData(false);
      setView('My contributions');
      showToast(resubmitting ? 'Revised work resubmitted for review.' : 'Contribution submitted for review.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const reviewContribution = async (
    item: Contribution,
    status: 'accepted' | 'needs_changes' | 'rejected'
  ) => {
    const draft = getReviewDraft(item);
    const feedback = draft.feedback.trim();
    if (feedback.length < 15) {
      setError('Write a review rationale of at least 15 characters before recording a decision.');
      return;
    }
    if (draft.criteriaChecks.length !== acceptanceCriteriaFor(item).length) {
      setError('The acceptance checklist is out of date. Refresh and review again.');
      return;
    }
    if (status === 'accepted' && !draft.criteriaChecks.every(Boolean)) {
      setError('Every acceptance criterion must be marked as met before accepting the contribution.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/contributions/' + item.id + '/review', {
        status,
        feedback,
        criteriaChecks: draft.criteriaChecks,
      });
      await refreshData(false);
      showToast(
        status === 'accepted'
          ? 'Contribution accepted · 50 XP awarded.'
          : 'Review saved.'
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const allCategories = [
    'All categories',
    ...Array.from(new Set(bounties.map(item => item.category))).sort(),
  ];
  const viewTitle: Record<View, string> = {
    Overview: 'Your contribution HQ',
    'Explore bounties': 'Find meaningful work',
    'My contributions': 'Your work, your track record',
    'Manage work': 'Review contributions',
    'Goals & levels': 'Build your reputation',
    Leaderboard: 'Community leaderboard',
  };

  const renderBounty = (item: Bounty) => {
    const isPaid = item.tier === 'paid';
    const locked = isPaid && acceptedCount < item.minAccepted;
    const owned = user?.userId === item.createdBy;
    return (
      <article className="bounty-card" key={item.id}>
        <div className="bounty-topline">
          <span
            className={'tier-pill ' + (isPaid ? 'tier-paid' : 'tier-community')}
          >
            {isPaid ? <CircleDollarSign size={13} /> : <GitBranch size={13} />}
            {isPaid ? 'Paid bounty' : 'Community'}
          </span>
          {item.sample && <span className="sample-label">Example</span>}
          <span className="posted-date">{shortDate(item.createdAt)}</span>
        </div>
        <div className="bounty-title-row">
          <div className="bounty-symbol">
            <Code2 size={19} />
          </div>
          <div className="bounty-title-block">
            <h3>{item.title}</h3>
            <p className="owner-line">
              Posted by {item.createdByName || 'Community'}
            </p>
          </div>
          <div className="reward-block">
            <strong>{money(item.reward)}</strong>
            <span>offered</span>
          </div>
        </div>
        <p className="bounty-description">{item.description}</p>
        <div className="acceptance-preview">
          <strong>Acceptance criteria</strong>
          <ul>
            {acceptanceCriteriaFor(item).slice(0, 3).map(criterion => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
          {acceptanceCriteriaFor(item).length > 3 && (
            <small>+{acceptanceCriteriaFor(item).length - 3} more criteria</small>
          )}
        </div>
        <div className="bounty-meta">
          <span>
            <FileText size={13} /> {item.category}
          </span>
          {isPaid && (
            <span>
              <BadgeCheck size={13} /> {item.minAccepted} accepted contributions
              required
            </span>
          )}
          {item.repoUrl && (
            <a href={item.repoUrl} target="_blank" rel="noreferrer">
              Reference <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="skill-row">
          {(item.skills || []).slice(0, 4).map(skill => (
            <span className="skill-chip" key={skill}>
              {skill}
            </span>
          ))}
        </div>
        <div className="bounty-card-footer">
          <span className="bounty-footnote">
            {isPaid
              ? 'Manual review · payout outside app'
              : 'Contribution reputation XP'}
          </span>
          <button
            className={
              'button ' +
              (locked || item.sample || owned ? 'button-muted' : 'button-dark')
            }
            onClick={() => void startSubmission(item)}
            disabled={locked || item.sample || owned || busy}
            title={
              locked ? 'Unlock by earning more accepted contributions' : ''
            }
          >
            {item.sample ? (
              'Example only'
            ) : owned ? (
              'Your bounty'
            ) : locked ? (
              <>
                <LockKeyhole size={14} /> Locked
              </>
            ) : (
              <>
                Contribute <ArrowUpRight size={15} />
              </>
            )}
          </button>
        </div>
        {locked && (
          <div className="lock-note">
            Your next milestone: {item.minAccepted - acceptedCount} more
            accepted community contribution(s).
          </div>
        )}
      </article>
    );
  };

  const renderOverview = () => (
    <>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow">
            <Sparkles size={13} /> SMALL CONTRIBUTIONS. REAL PROOF.
          </span>
          <h2>
            {user
              ? 'Welcome back, ' +
                (user.name?.split(' ')[0] || 'contributor') +
                '.'
              : 'Turn your work into reputation.'}
          </h2>
          <p>
            Deliver useful work of any kind. Build a track record of accepted contributions and earn access to higher-stakes bounty opportunities.
          </p>
          <div className="welcome-actions">
            <button
              className="button button-lime"
              onClick={() => setView('Explore bounties')}
            >
              Explore bounties <ArrowRight size={15} />
            </button>
            {!user && (
              <button
                className="button button-outline-light"
                onClick={() => void signIn()}
              >
                <LogIn size={15} /> Sign in to contribute
              </button>
            )}
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one"></div>
          <div className="orbit orbit-two"></div>
          <div className="orbit-center">
            <GitPullRequest size={31} />
          </div>
          <div className="floating-token token-one">
            <Zap size={16} /> +50 XP
          </div>
          <div className="floating-token token-two">
            <BadgeCheck size={16} /> Proof of work
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">
            Open bounties <Compass size={17} />
          </div>
          <div className="stat-value">{openBounties.length}</div>
          <div className="stat-caption">Work ready to pick up</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Your reputation <Zap size={17} />
          </div>
          <div className="stat-value">
            {user ? xp : '—'} <small>XP</small>
          </div>
          <div className="stat-caption">
            {user
              ? 'Level ' + level + ' · ' + xpInLevel + '/250 to next'
              : 'Sign in to track XP'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Accepted work <CheckCircle2 size={17} />
          </div>
          <div className="stat-value">{user ? acceptedCount : '—'}</div>
          <div className="stat-caption">Verified by bounty owners</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            In review <Clock3 size={17} />
          </div>
          <div className="stat-value">
            {user
              ? work.mySubmissions.filter(item => item.status === 'pending')
                  .length
              : '—'}
          </div>
          <div className="stat-caption">Contributions awaiting feedback</div>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR NEXT MOVE</span>
          <h2>High-signal opportunities</h2>
        </div>
        <button
          className="text-link"
          onClick={() => setView('Explore bounties')}
        >
          Browse all <ArrowRight size={15} />
        </button>
      </div>
      {loading ? (
        <div className="loading-panel">
          <span className="spinner"></span> Loading the bounty board…
        </div>
      ) : (
        <div className="bounty-grid">
          {openBounties.slice(0, 2).map(renderBounty)}
        </div>
      )}
      <section className="two-column">
        <div className="panel-card progress-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">REPUTATION PATH</span>
              <h3>Unlock paid work</h3>
            </div>
            <div className="small-icon lime-icon">
              <Target size={18} />
            </div>
          </div>
          <p>
            Accepted community contributions are your proof of work. Earn two to
            unlock paid-bounty submissions by default.
          </p>
          <div className="milestone-track">
            <div
              className="milestone-fill"
              style={{ width: Math.min(100, (acceptedCount / 2) * 100) + '%' }}
            ></div>
          </div>
          <div className="milestone-labels">
            <span>{acceptedCount} accepted</span>
            <span>
              {canAccessPaid
                ? 'Paid access unlocked'
                : Math.max(0, 2 - acceptedCount) + ' to go'}
            </span>
          </div>
          <div className="mini-milestones">
            <div
              className={
                acceptedCount >= 1 ? 'mini-milestone done' : 'mini-milestone'
              }
            >
              <span>{acceptedCount >= 1 ? <Check size={13} /> : '1'}</span>
              <div>
                <strong>First accepted contribution</strong>
                <small>Prove you can deliver</small>
              </div>
            </div>
            <div
              className={
                canAccessPaid ? 'mini-milestone done' : 'mini-milestone'
              }
            >
              <span>{canAccessPaid ? <Check size={13} /> : '2'}</span>
              <div>
                <strong>Paid bounty access</strong>
                <small>Two accepted contributions</small>
              </div>
            </div>
          </div>
        </div>
        <div className="panel-card quest-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">DAILY QUEST</span>
              <h3>Make one useful improvement</h3>
            </div>
            <div className="small-icon blue-icon">
              <Lightbulb size={18} />
            </div>
          </div>
          <p>
            Design something, write or translate, research a question, test a product, help a community, or ship code. Clear deliverables and accepted work matter more than the category.
          </p>
          <div className="quest-footer">
            <span>
              <Zap size={14} /> 50 XP per accepted contribution
            </span>
            <button
              className="text-link"
              onClick={() => setView('Explore bounties')}
            >
              Find a quest <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </>
  );

  const renderExplore = () => (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">THE BOUNTY BOARD</span>
          <h2>Find a task worth shipping.</h2>
          <p>
            Start with community work, show proof, and build toward paid
            opportunities.
          </p>
        </div>
        <button
          className="button button-dark"
          onClick={() => void openCreateModal()}
        >
          <Plus size={16} /> Post a bounty
        </button>
      </section>
      <section className="filters-panel">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search bounties"
            placeholder="Search skills, repositories, tasks…"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <div className="filter-select">
          <Filter size={15} />
          <select
            aria-label="Filter by category"
            value={category}
            onChange={event => setCategory(event.target.value)}
          >
            {allCategories.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="filter-select">
          <select
            aria-label="Filter by bounty type"
            value={tierFilter}
            onChange={event => setTierFilter(event.target.value)}
          >
            <option>All bounties</option>
            <option value="community">Community</option>
            <option value="paid">Paid bounty</option>
          </select>
        </div>
      </section>
      <div className="results-line">
        <span>
          {filteredBounties.length} open{' '}
          {filteredBounties.length === 1 ? 'bounty' : 'bounties'}
        </span>
        <span>Each accepted contribution earns 50 reputation XP</span>
      </div>
      {loading ? (
        <div className="loading-panel">
          <span className="spinner"></span> Loading opportunities…
        </div>
      ) : filteredBounties.length ? (
        <div className="bounty-grid">{filteredBounties.map(renderBounty)}</div>
      ) : (
        <div className="empty-state">
          <div className="empty-symbol">
            <Search size={23} />
          </div>
          <h3>No matching bounties</h3>
          <p>Try another search or post the first bounty in this category.</p>
          <button
            className="button button-dark"
            onClick={() => void openCreateModal()}
          >
            Post a bounty <Plus size={15} />
          </button>
        </div>
      )}
      <div className="notice-strip">
        <ShieldCheck size={17} />
        <p>
          <strong>Trust, not just points.</strong> Owners review submitted proof and award XP only after accepting work. Payment offers are not escrowed or paid by this app.
        </p>
      </div>
    </>
  );

  const renderMyWork = () => (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">YOUR CONTRIBUTION LOG</span>
          <h2>Every submission tells a story.</h2>
          <p>Track review status, feedback, and accepted work in one place.</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => setView('Explore bounties')}
        >
          Find work <ArrowRight size={15} />
        </button>
      </section>
      {!user ? (
        <div className="empty-state">
          <div className="empty-symbol">
            <GitPullRequest size={23} />
          </div>
          <h3>Sign in to see your work</h3>
          <p>
            Your submissions and earned reputation are tied to your account.
          </p>
          <button className="button button-dark" onClick={() => void signIn()}>
            <LogIn size={15} /> Sign in
          </button>
        </div>
      ) : (
        <div className="work-list">
          {work.mySubmissions.length === 0 && (
            <div className="empty-state compact">
              <div className="empty-symbol">
                <GitPullRequest size={22} />
              </div>
              <h3>Your story starts with one contribution.</h3>
              <p>
                Choose a community bounty, submit your work URL, and let the
                owner review it.
              </p>
              <button
                className="button button-dark"
                onClick={() => setView('Explore bounties')}
              >
                Explore bounties <ArrowRight size={15} />
              </button>
            </div>
          )}
          {work.mySubmissions
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(item => (
              <article className="submission-card" key={item.id}>
                <div className="submission-icon">
                  <GitPullRequest size={18} />
                </div>
                <div className="submission-main">
                  <div className="submission-title-row">
                    <h3>{item.bountyTitle}</h3>
                    <span className={'status-pill ' + statusClass(item.status)}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p>{item.note}</p>
                  <div className="submission-links">
                    {item.workUrl ? (
                      <a href={item.workUrl} target="_blank" rel="noreferrer">
                        Open submitted work <ExternalLink size={13} />
                      </a>
                    ) : (
                      <span>Written deliverable · no external link</span>
                    )}
                    <span>Version {item.revisionNumber ?? 1} · submitted {shortDate(item.lastSubmittedAt || item.createdAt)}</span>
                    {item.status === 'needs_changes' && (
                      <button type="button" className="text-link" onClick={() => void startRevision(item)}>
                        Revise & resubmit <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  {item.reviewHistory?.length ? (
                    <div className="review-history-list">
                      {item.reviewHistory.map((entry, index) => (
                        <div className="review-history" key={entry.reviewedAt + index}>
                          <div className="review-history-title">
                            <strong>{entry.status.replace('_', ' ')} · {entry.reviewerName}</strong>
                            <span>{shortDate(entry.reviewedAt)} · {entry.criteriaChecks.filter(Boolean).length}/{entry.criteriaChecks.length} criteria met</span>
                          </div>
                          <p>{entry.feedback}</p>
                        </div>
                      ))}
                    </div>
                  ) : item.feedback && (
                    <div className="feedback-box">
                      <strong>Reviewer feedback</strong>
                      <p>{item.feedback}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
        </div>
      )}
    </>
  );

  const renderManage = () => (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">QUALITY CONTROL</span>
          <h2>Good reviews build trust.</h2>
          <p>
            Review work submitted to your bounties. Acceptance awards the
            contributor 50 XP and closes a paid bounty.
          </p>
        </div>
        <button
          className="button button-dark"
          onClick={() => void openCreateModal()}
        >
          <Plus size={16} /> Post bounty
        </button>
      </section>
      {!user ? (
        <div className="empty-state">
          <div className="empty-symbol">
            <ShieldCheck size={23} />
          </div>
          <h3>Sign in to manage work</h3>
          <p>Only bounty owners can review submissions to their listings.</p>
          <button className="button button-dark" onClick={() => void signIn()}>
            <LogIn size={15} /> Sign in
          </button>
        </div>
      ) : (
        <>
          <div className="manage-stats">
            <div>
              <span>Your bounties</span>
              <strong>{work.myBounties.length}</strong>
            </div>
            <div>
              <span>Submissions received</span>
              <strong>{work.receivedSubmissions.length}</strong>
            </div>
            <div>
              <span>Awaiting review</span>
              <strong>
                {
                  work.receivedSubmissions.filter(
                    item => item.status === 'pending'
                  ).length
                }
              </strong>
            </div>
          </div>
          {work.myBounties.length === 0 && (
            <div className="empty-state compact">
              <h3>Publish your first bounty</h3>
              <p>
                Write a clear task, define acceptance criteria, and review the
                submitted proof.
              </p>
              <button
                className="button button-dark"
                onClick={() => void openCreateModal()}
              >
                Create bounty <Plus size={15} />
              </button>
            </div>
          )}
          {work.receivedSubmissions.map(item => (
            <article className="review-card" key={item.id}>
              <div className="review-heading">
                <div className="submission-icon">
                  <Users size={17} />
                </div>
                <div>
                  <h3>{item.bountyTitle}</h3>
                  <p>
                    Submitted by {item.submitterName} ·{' '}
                    {shortDate(item.createdAt)}
                  </p>
                </div>
                <span className={'status-pill ' + statusClass(item.status)}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="review-note">{item.note}</p>
              {item.reviewHistory?.length ? (
                <div className="review-history-list">
                  {item.reviewHistory.map((entry, index) => (
                    <div className="review-history" key={entry.reviewedAt + index}>
                      <div className="review-history-title">
                        <strong>{entry.status.replace('_', ' ')} · {entry.reviewerName}</strong>
                        <span>{shortDate(entry.reviewedAt)} · {entry.criteriaChecks.filter(Boolean).length}/{entry.criteriaChecks.length} criteria met</span>
                      </div>
                      <p>{entry.feedback}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {item.workUrl ? (
                <a
                  className="work-url"
                  href={item.workUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect linked work <ExternalLink size={13} />
                </a>
              ) : (
                <p className="work-url">Written deliverable · no external link</p>
              )}
              {item.status === 'pending' && (
            <div className="criteria-review">
              <div className="criteria-review-heading">
                <strong>Acceptance checklist</strong>
                <span>All checks must pass to accept</span>
              </div>
              <div className="criteria-checklist">
                {acceptanceCriteriaFor(item).map((criterion, index) => {
                  const draft = getReviewDraft(item);
                  return (
                    <label className="criteria-check" key={criterion}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.criteriaChecks[index])}
                        onChange={event => {
                          const checks = [...draft.criteriaChecks];
                          checks[index] = event.target.checked;
                          updateReviewDraft(item, { criteriaChecks: checks });
                        }}
                      />
                      <span>{criterion}</span>
                    </label>
                  );
                })}
              </div>
              <label className="review-rationale">
                Review rationale <span>(required, at least 15 characters)</span>
                <textarea
                  rows={3}
                  minLength={15}
                  maxLength={1000}
                  value={getReviewDraft(item).feedback}
                  onChange={event => updateReviewDraft(item, { feedback: event.target.value })}
                  placeholder="Explain the evidence, quality, and why this decision follows the agreed criteria."
                />
              </label>
              <div className="review-readiness">
                {getReviewDraft(item).criteriaChecks.filter(Boolean).length} of {acceptanceCriteriaFor(item).length} criteria checked
              </div>
            </div>
          )}
          {item.status === 'pending' ? (
            <div className="review-actions">
                  <button
                    className="button button-success"
                    disabled={busy || getReviewDraft(item).feedback.trim().length < 15 || !getReviewDraft(item).criteriaChecks.every(Boolean)}
                    onClick={() => void reviewContribution(item, 'accepted')}
                  >
                    <Check size={15} /> Accept · Award 50 XP
                  </button>
                  <button
                    className="button button-muted"
                    disabled={busy || getReviewDraft(item).feedback.trim().length < 15}
                    onClick={() =>
                      void reviewContribution(item, 'needs_changes')
                    }
                  >
                    Request changes
                  </button>
                  <button
                    className="button button-quiet"
                    disabled={busy || getReviewDraft(item).feedback.trim().length < 15}
                    onClick={() => void reviewContribution(item, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              ) : !item.reviewHistory?.length && item.feedback ? (
                <div className="feedback-box">
                  <strong>Review saved</strong>
                  <p>{item.feedback}</p>
                </div>
              ) : null}
            </article>
          ))}
        </>
      )}
    </>
  );

  const renderGoals = () => {
    const goals = [
      {
        title: 'Get your first contribution accepted',
        desc: 'Build a public proof-of-work record with a small, useful change.',
        progress: Math.min(100, acceptedCount * 100),
        done: acceptedCount >= 1,
        metric: acceptedCount >= 1 ? 'Complete' : '0 / 1 accepted',
        icon: GitPullRequest,
      },
      {
        title: 'Unlock paid bounty access',
        desc: 'Earn trust through two accepted community contributions.',
        progress: Math.min(100, (acceptedCount / 2) * 100),
        done: canAccessPaid,
        metric: acceptedCount + ' / 2 accepted',
        icon: LockKeyhole,
      },
      {
        title: 'Reach Level 2',
        desc: 'Collect 250 reputation XP from accepted work.',
        progress: Math.min(100, (xp / 250) * 100),
        done: xp >= 250,
        metric: xp + ' / 250 XP',
        icon: Zap,
      },
      {
        title: 'Become a trusted contributor',
        desc: 'Build a repeatable track record of quality work and thoughtful reviews.',
        progress: Math.min(100, (acceptedCount / 5) * 100),
        done: acceptedCount >= 5,
        metric: acceptedCount + ' / 5 accepted',
        icon: Award,
      },
    ];
    return (
      <>
        <section className="level-hero">
          <div>
            <span className="eyebrow">
              <Trophy size={13} /> YOUR REPUTATION JOURNEY
            </span>
            <h2>
              {user
                ? 'Level ' + level + ' contributor'
                : 'Your next level starts here'}
            </h2>
            <p>
              Reputation is earned by accepted work, not by opening tickets or
              clicking buttons.
            </p>
          </div>
          <div className="level-number">
            <span>LEVEL</span>
            <strong>{user ? level : '—'}</strong>
            <small>{user ? xp + ' total XP' : 'Sign in to track'}</small>
          </div>
          <div className="level-progress">
            <div className="level-progress-label">
              <span>Progress to next level</span>
              <strong>{user ? xpInLevel + ' / 250 XP' : '0 / 250 XP'}</strong>
            </div>
            <div className="milestone-track">
              <div
                className="milestone-fill"
                style={{ width: (user ? (xpInLevel / 250) * 100 : 0) + '%' }}
              ></div>
            </div>
          </div>
        </section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">GOALS & OBJECTIVES</span>
            <h2>Milestones that unlock opportunity</h2>
          </div>
        </div>
        <div className="goal-grid">
          {goals.map((goal, index) => {
            const Icon = goal.icon;
            return (
              <article className="goal-card" key={goal.title}>
                <div className="goal-card-top">
                  <div className="goal-icon">
                    <Icon size={19} />
                  </div>
                  <span
                    className={goal.done ? 'goal-state complete' : 'goal-state'}
                  >
                    {goal.done ? (
                      <>
                        <CheckCircle2 size={13} /> Complete
                      </>
                    ) : (
                      'In progress'
                    )}
                  </span>
                </div>
                <span className="goal-number">OBJECTIVE 0{index + 1}</span>
                <h3>{goal.title}</h3>
                <p>{goal.desc}</p>
                <div className="goal-progress">
                  <div className="milestone-track">
                    <div
                      className="milestone-fill"
                      style={{ width: goal.progress + '%' }}
                    ></div>
                  </div>
                  <strong>{goal.metric}</strong>
                </div>
              </article>
            );
          })}
        </div>
        <div className="notice-strip">
          <Lightbulb size={17} />
          <p>
            <strong>Improvement rule:</strong> choose small tasks with clear
            acceptance criteria. After each review, note what went well, what
            blocked progress, and what should change next time.
          </p>
        </div>
      </>
    );
  };

  const renderLeaderboard = () => (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">REPUTATION, EARNED</span>
          <h2>People who ship useful work.</h2>
          <p>
            Ranked by accepted contributions and XP. Rejected or pending
            submissions earn no reputation.
          </p>
        </div>
        <div className="leaderboard-badge">
          <Trophy size={18} /> 50 XP / accepted contribution
        </div>
      </section>
      <div className="leaderboard-list">
        {leaderboard.length === 0 ? (
          <div className="empty-state">
            <div className="empty-symbol">
              <Trophy size={23} />
            </div>
            <h3>The first contribution sets the bar.</h3>
            <p>
              The leaderboard will populate when a bounty owner accepts a
              contribution.
            </p>
            <button
              className="button button-dark"
              onClick={() => setView('Explore bounties')}
            >
              Find the first task <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          leaderboard
            .slice()
            .sort((a, b) => b.xp - a.xp)
            .map((profile, index) => (
              <div
                className="leader-row"
                key={(profile.displayName || 'contributor') + index}
              >
                <div className={'rank-number ' + (index < 3 ? 'top-rank' : '')}>
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="avatar">
                  {(profile.displayName || 'C').slice(0, 1).toUpperCase()}
                </div>
                <div className="leader-person">
                  <strong>{profile.displayName || 'Contributor'}</strong>
                  <small>
                    {profile.acceptedCount} accepted contribution
                    {profile.acceptedCount === 1 ? '' : 's'}
                  </small>
                </div>
                <div className="leader-xp">
                  <Zap size={14} /> {profile.xp} XP
                </div>
                <div className="leader-level">
                  Level {Math.floor(profile.xp / 250) + 1}
                </div>
              </div>
            ))
        )}
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
        <div className="brand-row">
          <div className="brand-mark">
            <GitBranch size={20} />
          </div>
          <div className="brand-word">
            contrib<span>quest</span>
            <small>ANY SKILL → REAL CONTRIBUTIONS</small>
          </div>
          <button
            className="icon-button close-nav"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                className={
                  'nav-item ' + (view === item.name ? 'nav-active' : '')
                }
                onClick={() => {
                  setView(item.name);
                  setMobileNav(false);
                }}
              >
                <Icon size={18} />
                <span>{item.name}</span>
                {item.name === 'Explore bounties' && (
                  <span className="nav-count">{openBounties.length}</span>
                )}
                {view === item.name && (
                  <ChevronRight className="nav-chevron" size={15} />
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-level-card">
            <div className="level-card-head">
              <span>YOUR LEVEL</span>
              <Zap size={15} />
            </div>
            <div className="sidebar-level-row">
              <strong>{user ? level : '—'}</strong>
              <span>{user ? xp + ' XP' : 'Sign in to track'}</span>
            </div>
            <div className="mini-track">
              <div
                style={{ width: (user ? (xpInLevel / 250) * 100 : 0) + '%' }}
              ></div>
            </div>
            <button
              className="side-link"
              onClick={() => setView('Goals & levels')}
            >
              View objectives <ArrowUpRight size={13} />
            </button>
          </div>
          {user ? (
            <div className="user-chip">
              <div className="avatar">
                {(user.name || user.email || 'C').slice(0, 1).toUpperCase()}
              </div>
              <div className="user-chip-copy">
                <strong>{user.name || 'Contributor'}</strong>
                <small>{user.email || 'Signed in'}</small>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button className="sign-in-button" onClick={() => void signIn()}>
              <LogIn size={16} /> Sign in <ArrowRight size={15} />
            </button>
          )}
          <div className="side-footer">
            Built for people who make
            <br />
            make things better.
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation overlay"
        ></button>
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <span></span> COMMUNITY BETA
            </span>
            {user ? (
              <button
                className="top-avatar"
                title={user.name || user.email || 'Contributor'}
                onClick={() => setView('Goals & levels')}
              >
                {(user.name || user.email || 'C').slice(0, 1).toUpperCase()}
              </button>
            ) : (
              <button
                className="button button-small button-outline"
                onClick={() => void signIn()}
              >
                <LogIn size={14} /> Sign in
              </button>
            )}
          </div>
        </header>
        <div className="content-wrap">
          <div className="content-header">
            <div>
              <p className="page-breadcrumb">
                CONTRIBQUEST / <span>{view.toUpperCase()}</span>
              </p>
              <h1>{viewTitle[view]}</h1>
            </div>
            <div className="content-head-actions">
              <span className="avatar-stack">
                <i>G</i>
                <i>O</i>
                <i>+</i>
              </span>
              <span className="community-count">Community-powered</span>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <Activity size={16} />
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {view === 'Overview' && renderOverview()}
          {view === 'Explore bounties' && renderExplore()}
          {view === 'My contributions' && renderMyWork()}
          {view === 'Manage work' && renderManage()}
          {view === 'Goals & levels' && renderGoals()}
          {view === 'Leaderboard' && renderLeaderboard()}
          <footer className="app-footer">
            <span>
              CONTRIBQUEST <span className="footer-dot">•</span> PROOF OF WORK,
              NOT PROMISES
            </span>
            <span>
              XP is reputation. Bounty payments are handled outside this app.
            </span>
          </footer>
        </div>
      </main>

      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {modal === 'create'
                    ? 'CREATE OPPORTUNITY'
                    : modal === 'revise'
                      ? 'RESUBMIT REVISED WORK'
                      : 'SUBMIT PROOF OF WORK'}
                </span>
                <h2 id="modal-title">
                  {modal === 'create'
                    ? 'Post a bounty'
                    : modal === 'revise'
                      ? 'Resubmit updated contribution'
                      : 'Submit your contribution'}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                <X size={19} />
              </button>
            </div>
            {modal === 'create' ? (
              <form className="form-stack" onSubmit={createBounty}>
                <label>
                  Title
                  <input
                    required
                    minLength={8}
                    maxLength={100}
                    value={bountyForm.title}
                    onChange={event =>
                      setBountyForm({
                        ...bountyForm,
                        title: event.target.value,
                      })
                    }
                    placeholder="e.g. Design an onboarding flow or translate a guide"
                  />
                </label>
                <label>
                  Description
                  <textarea
                    required
                    minLength={20}
                    maxLength={2500}
                    rows={4}
                    value={bountyForm.description}
                    onChange={event =>
                      setBountyForm({
                        ...bountyForm,
                        description: event.target.value,
                      })
                    }
                    placeholder="Describe the goal, deliverable, acceptance criteria, and how the result will be reviewed."
                  />
                </label>
                <div className="form-row">
                  <label>
                    Contribution category
                    <input
                      list="contribution-categories"
                      maxLength={50}
                      value={bountyForm.category}
                      onChange={event =>
                        setBountyForm({
                          ...bountyForm,
                          category: event.target.value,
                        })
                      }
                      placeholder="e.g. design, translation, science, community"
                    />
                    <datalist id="contribution-categories">
                      <option value="Software & Engineering" />
                      <option value="Design & UX" />
                      <option value="Writing & Editing" />
                      <option value="Research & Analysis" />
                      <option value="Data & Open Knowledge" />
                      <option value="Translation & Localization" />
                      <option value="Accessibility" />
                      <option value="Testing & Quality" />
                      <option value="Community & Support" />
                      <option value="Education & Mentoring" />
                      <option value="Marketing & Outreach" />
                      <option value="Operations & Admin" />
                      <option value="Creative Media" />
                      <option value="Events & Volunteering" />
                      <option value="Product & Strategy" />
                      <option value="Science & Experiments" />
                      <option value="Other / Custom" />
                    </datalist>
                  </label>
                  <label>
                    Offer (USD)
                    <input
                      required
                      type="number"
                      min="1"
                      max="100000"
                      value={bountyForm.reward}
                      onChange={event =>
                        setBountyForm({
                          ...bountyForm,
                          reward: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Acceptance criteria (one per line)
                  <textarea
                    required
                    maxLength={1800}
                    rows={4}
                    value={bountyForm.acceptanceCriteria}
                    onChange={event => setBountyForm({ ...bountyForm, acceptanceCriteria: event.target.value })}
                    placeholder="The deliverable meets the agreed objective.\nAll requested items are included.\nThe result can be reviewed or reproduced."
                  />
                  <small className="field-hint">Use 1–10 observable checks. One strong criterion is enough for a narrow task; split broader work into smaller packages. Every criterion must pass before acceptance.</small>
                </label>
                <label>
                  Reference link (optional)
                  <input
                    type="url"
                    value={bountyForm.repoUrl}
                    onChange={event =>
                      setBountyForm({
                        ...bountyForm,
                        repoUrl: event.target.value,
                      })
                    }
                    placeholder="Link to a doc, design, demo, repository, or reference"
                  />
                </label>
                <label>
                  Skills, comma-separated
                  <input
                    value={bountyForm.skills}
                    onChange={event =>
                      setBountyForm({
                        ...bountyForm,
                        skills: event.target.value,
                      })
                    }
                    placeholder="TypeScript, tests, docs"
                  />
                </label>
                <div className="form-section-label">OPPORTUNITY TYPE</div>
                <div className="tier-choice">
                  <button
                    type="button"
                    className={
                      bountyForm.tier === 'community'
                        ? 'tier-choice-card selected'
                        : 'tier-choice-card'
                    }
                    onClick={() =>
                      setBountyForm({ ...bountyForm, tier: 'community' })
                    }
                  >
                    <GitBranch size={17} />
                    <strong>Community bounty</strong>
                    <small>Open to contributors at every level.</small>
                  </button>
                  <button
                    type="button"
                    className={
                      bountyForm.tier === 'paid'
                        ? 'tier-choice-card selected'
                        : 'tier-choice-card'
                    }
                    onClick={() =>
                      setBountyForm({ ...bountyForm, tier: 'paid' })
                    }
                  >
                    <CircleDollarSign size={17} />
                    <strong>Paid bounty</strong>
                    <small>Applicants need an accepted-work record.</small>
                  </button>
                </div>
                {bountyForm.tier === 'paid' && (
                  <label>
                    Minimum accepted contributions
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={bountyForm.minAccepted}
                      onChange={event =>
                        setBountyForm({
                          ...bountyForm,
                          minAccepted: event.target.value,
                        })
                      }
                    />
                    <small className="field-hint">
                      Default: 2 accepted community contributions. This gate is
                      enforced by the server.
                    </small>
                  </label>
                )}
                <div className="form-notice">
                  <ShieldCheck size={16} />
                  <span>
                    Payment offers are listings only. This beta does not escrow
                    funds, verify GitHub activity automatically, or process
                    payouts.
                  </span>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="button button-dark" disabled={busy}>
                    {busy ? 'Publishing…' : 'Publish bounty'}{' '}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </form>
            ) : (
              <form className="form-stack" onSubmit={submitContribution}>
                <div className="target-summary">
                  <strong>{target?.title || revisionTarget?.bountyTitle}</strong>
                  <span>
                    {target ? `${money(target.reward)} offered · ${target.category}` : 'Revision to requested changes'}
                  </span>
                  <strong>What the owner will check</strong>
                  <ul className="target-criteria">
                    {(revisionTarget ? acceptanceCriteriaFor(revisionTarget) : target ? acceptanceCriteriaFor(target) : DEFAULT_ACCEPTANCE_CRITERIA).map(criterion => <li key={criterion}>{criterion}</li>)}
                  </ul>
                </div>
                <label>
                  Evidence link (optional)
                  <input
                    type="url"
                    value={submissionForm.workUrl}
                    onChange={event =>
                      setSubmissionForm({
                        ...submissionForm,
                        workUrl: event.target.value,
                      })
                    }
                    placeholder="Link to a file, image, video, document, repo, or demo"
                  />
                </label>
                <label>
                  Describe your contribution or deliverable
                  <textarea
                    required
                    minLength={15}
                    maxLength={2000}
                    rows={4}
                    value={submissionForm.note}
                    onChange={event =>
                      setSubmissionForm({
                        ...submissionForm,
                        note: event.target.value,
                      })
                    }
                    placeholder="Explain what you delivered, its impact, how it meets the criteria, and how the owner can verify it. Required even when you provide a link."
                  />
                </label>
                <div className="form-notice">
                  <Clock3 size={16} />
                  <span>
                    The bounty owner reviews your description and any evidence link manually. A link is optional; clear written proof is required. Accepted contributions award 50 XP. Payments are outside ContribQuest.
                  </span>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="button button-dark" disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit for review'}{' '}
                    <Send size={15} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast-message">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss message">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
