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
import { captureProductEvent, identifyAnalyticsUser, resetAnalyticsIdentity } from './analytics';

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
  indexing?: boolean;
  indexProgress?: { bountiesDone: boolean; contributionsDone: boolean };
  hasMore?: { myBounties: boolean; mySubmissions: boolean; receivedSubmissions: boolean };
};
type WorkspaceMembership = {
  id: string; workspaceId: string; workspaceName: string; userId: string;
  email?: string; displayName?: string;
  role: 'workspace_admin' | 'reviewer' | 'contributor' | 'observer';
  createdAt: string;
};
type GitHubOAuthState = {
  id: string; appUserId: string; purpose: 'identity_link';
  status: 'pending' | 'processing' | 'consumed' | 'failed' | 'cancelled';
  createdAt: string; expiresAt: string;
};

type GitHubPatRepositoryStatus = {
  repositoryFullName: string;
  accessible: boolean;
  repositoryRole?: string;
  defaultBranch?: string;
  message?: string;
  note?: string;
};
type GitHubPatVerification = {
  configured: boolean;
  verified: boolean;
  usable?: boolean;
  login?: string;
  id?: number;
  repositories?: GitHubPatRepositoryStatus[];
  message?: string;
};
type GitHubPatFile = {
  repo: string;
  path: string;
  branch: string;
  content: string;
  sha?: string;
  size?: number;
};
type GitHubDeviceSession = {
  flowId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalSeconds: number;
};

type AccountSecurity = {
  account: { userId: string; email?: string; displayName: string };
  access: { roles: string[]; platformOwnerConfigured: boolean; isPlatformOwner: boolean;
    workspaces: WorkspaceMembership[]; hasMoreWorkspaces: boolean };
  github: { configured: boolean; clientIdConfigured: boolean; clientSecretConfigured: boolean;
    linked: boolean; githubLogin?: string; githubUserId?: string; linkedAt?: string;
    verifiedEmails?: string[]; primaryEmail?: string;
    emailAccessStatus?: 'available' | 'permission_required' | 'unavailable' | 'not_linked';
    callbackUrl: string; scope: string };
};
type View =
  | 'Overview'
  | 'Explore bounties'
  | 'My contributions'
  | 'Manage work'
  | 'Goals & levels'
  | 'Leaderboard'
  | 'Account & integrations';

const EMPTY_WORK: WorkData = {
  profile: { xp: 0, acceptedCount: 0 },
  mySubmissions: [],
  myBounties: [],
  receivedSubmissions: [],
  indexing: false,
  indexProgress: { bountiesDone: true, contributionsDone: true },
};

const NAV: { name: View; icon: typeof Compass; hint?: string }[] = [
  { name: 'Overview', icon: BarChart3 },
  { name: 'Explore bounties', icon: Compass },
  { name: 'My contributions', icon: GitPullRequest },
  { name: 'Manage work', icon: ShieldCheck },
  { name: 'Goals & levels', icon: Target },
  { name: 'Leaderboard', icon: Trophy },
  { name: 'Account & integrations', icon: ShieldCheck },
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
    acceptanceCriteria: 'The deliverable matches the agreed scope and includes inspectable evidence.',
    tier: 'community',
    minAccepted: '2',
  });
  const [submissionForm, setSubmissionForm] = useState({
    workUrl: '',
    note: '',
  });
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [securityState, setSecurityState] = useState<AccountSecurity | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMembership[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'workspace_admin' | 'reviewer' | 'contributor' | 'observer'>('contributor');
  const [githubLoginHint, setGithubLoginHint] = useState('');
  const [githubDeviceSession, setGithubDeviceSession] = useState<GitHubDeviceSession | null>(null);
  const [githubPatBusy, setGithubPatBusy] = useState(false);
  const [githubPatVerification, setGithubPatVerification] = useState<GitHubPatVerification | null>(null);
  const [githubPatRepo, setGithubPatRepo] = useState<'Contribution-bounties-centre-' | 'contribution-network'>('Contribution-bounties-centre-');
  const [githubPatPath, setGithubPatPath] = useState('README.md');
  const [githubPatBranch, setGithubPatBranch] = useState('main');
  const [githubPatContent, setGithubPatContent] = useState('');
  const [githubPatCommitMessage, setGithubPatCommitMessage] = useState('Update README.md');
  const [githubPatFileLoaded, setGithubPatFileLoaded] = useState(false);

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
        identifyAnalyticsUser(current.userId);
        const workResponse = await api.get('/api/my-work');
        let currentWork = workResponse.data as WorkData;
        setWork(currentWork);
        // Advance legacy indexing through multiple bounded API requests, not one unbounded scan.
        for (let pass = 0; currentWork.indexing && pass < 2; pass += 1) {
          const nextWorkResponse = await api.get('/api/my-work');
          currentWork = nextWorkResponse.data as WorkData;
          setWork(currentWork);
        }
      } else {
        resetAnalyticsIdentity();
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

  useEffect(() => {
    if (view !== 'Account & integrations') {
      captureProductEvent('product_area_viewed', { area: view });
    }
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('integration') === 'github') {
      const status = params.get('status');
      const messages: Record<string, string> = {
        linked: 'GitHub identity linked to this existing account.',
        cancelled: 'GitHub connection was cancelled.',
        already_linked: 'That GitHub identity is already linked or this account has a different link.',
        configuration_required: 'The GitHub Client ID or Client Secret is missing or unreadable by the backend. Check the configured backend secrets.',
        callback_mismatch: 'GitHub rejected the callback URL. Set the GitHub App User authorization callback URL exactly to https://contribquest-lygj1x.v2.appdeploy.ai/api/integrations/github/callback.',
        client_credentials_rejected: 'GitHub rejected the Client ID or Client Secret. Verify both values came from the same GitHub App.',
        authorization_code_rejected: 'GitHub rejected or expired the one-time authorization code. Start a fresh connection and authorize once.',
        token_exchange_failed: 'ContribQuest could not exchange the GitHub authorization code. Check the GitHub App credentials and callback URL, then retry.',
        github_profile_rejected: 'GitHub authorization returned, but the profile request failed. Please try connecting again.',
        identity_invalid: 'GitHub returned an identity response ContribQuest could not validate. No account was linked.',
        persistence_failed: 'GitHub identity verification reached ContribQuest, but saving the link failed. Refresh Account & integrations before retrying.',
        state_invalid: 'The connection attempt expired or could not be validated. Start a fresh connection.',
        app_suspended: 'GitHub reports this app is suspended. Check the GitHub App status.',
        provider_error: 'GitHub returned an authorization error. Check the GitHub App settings and retry.',
      };
      setView('Account & integrations');
      setToast(status ? (messages[status] || 'GitHub connection failed. Start a fresh attempt and check app settings.') : 'GitHub connection failed. Start a fresh attempt and check app settings.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (user && view === 'Account & integrations') void refreshSecurity();
    if (!user) { setSecurityState(null); setWorkspaceMembers([]); }
  }, [user?.userId, view, selectedWorkspaceId]);

  useEffect(() => {
    const session = githubDeviceSession;
    if (!session || !user) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await api.post('/api/integrations/github/device/poll', {
          flowId: session.flowId,
          deviceCode: session.deviceCode,
        });
        if (stopped) return;
        const result = response.data as { status?: string; intervalSeconds?: number; message?: string };
        if (result.status === 'pending') {
          const nextInterval = typeof result.intervalSeconds === 'number'
            ? Math.max(5, result.intervalSeconds)
            : session.intervalSeconds;
          if (nextInterval !== session.intervalSeconds) {
            setGithubDeviceSession(current => current?.flowId === session.flowId
              ? { ...current, intervalSeconds: nextInterval } : current);
            return;
          }
          timer = setTimeout(() => void poll(), nextInterval * 1000);
          return;
        }
        setGithubDeviceSession(null);
        setSecurityBusy(false);
        if (result.status === 'linked') {
          await refreshSecurity();
          showToast('GitHub identity linked to this existing ContribQuest account.');
        } else {
          setError(result.message || 'GitHub device authorization did not complete. Start a new connection.');
        }
      } catch (err) {
        if (stopped) return;
        setGithubDeviceSession(null);
        setSecurityBusy(false);
        setError(errorText(err));
      }
    };

    timer = setTimeout(() => void poll(), Math.max(5, session.intervalSeconds) * 1000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [githubDeviceSession, user?.userId]);

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
      resetAnalyticsIdentity();
      setUser(null);
      setWork(EMPTY_WORK);
      setView('Overview');
      showToast('Signed out.');
    } catch (err) {
      setError(errorText(err));
    }
  };


  const refreshSecurity = async () => {
    setSecurityLoading(true);
    try {
      const response = await api.get('/api/account/security');
      const summary = response.data as AccountSecurity;
      setSecurityState(summary);
      const selected = summary.access.workspaces.some(item => item.workspaceId === selectedWorkspaceId)
        ? selectedWorkspaceId : summary.access.workspaces[0]?.workspaceId || '';
      if (selected && selected !== selectedWorkspaceId) setSelectedWorkspaceId(selected);
      if (selected && (summary.access.isPlatformOwner ||
        summary.access.workspaces.some(item => item.workspaceId === selected && item.role === 'workspace_admin'))) {
        const membersResponse = await api.get('/api/workspaces/' + encodeURIComponent(selected) + '/members');
        setWorkspaceMembers((membersResponse.data?.members ?? []) as WorkspaceMembership[]);
      } else setWorkspaceMembers([]);
    } catch (err) { setError(errorText(err)); }
    finally { setSecurityLoading(false); }
  };

  const startGitHubConnection = async () => {
    setSecurityBusy(true); setError('');
    try {
      const response = await api.post('/api/integrations/github/start', {
        login: githubLoginHint.trim().replace(/^@/, '') || undefined,
      });
      const url = response.data?.authorizationUrl;
      if (typeof url !== 'string' || !url.startsWith('https://github.com/login/oauth/authorize')) {
        throw new Error('The backend did not return a valid GitHub authorization URL.');
      }
      window.location.assign(url);
    } catch (err) { setError(errorText(err)); setSecurityBusy(false); }
  };

  const startGitHubDeviceConnection = async () => {
    setSecurityBusy(true);
    setError('');
    setGithubDeviceSession(null);
    try {
      const response = await api.post('/api/integrations/github/device/start', {});
      const flow = response.data as {
        flowId?: string; deviceCode?: string; userCode?: string; verificationUri?: string;
        expiresIn?: number; intervalSeconds?: number;
      };
      if (!flow.flowId || !flow.deviceCode || !flow.userCode ||
          flow.verificationUri !== 'https://github.com/login/device' ||
          typeof flow.expiresIn !== 'number' || typeof flow.intervalSeconds !== 'number') {
        throw new Error('ContribQuest did not return a valid GitHub device code.');
      }
      setGithubDeviceSession({
        flowId: flow.flowId,
        deviceCode: flow.deviceCode,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresAt: Date.now() + flow.expiresIn * 1000,
        intervalSeconds: flow.intervalSeconds,
      });
      showToast('Device code ready. Open GitHub, enter the code and authorize ContribQuest.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  const verifyGitHubPat = async () => {
    setGithubPatBusy(true);
    setError('');
    setGithubPatVerification(null);
    try {
      const response = await api.post('/api/integrations/github/pat/verify', {});
      const result = response.data as GitHubPatVerification;
      setGithubPatVerification(result);
      if (result.verified) {
        showToast(result.usable
          ? 'GitHub PAT verified. Both working repositories are visible.'
          : 'GitHub PAT identity verified; check repository access results below.');
      } else {
        setError(result.message || 'GitHub PAT verification failed.');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGithubPatBusy(false);
    }
  };

  const readGitHubPatFile = async () => {
    setGithubPatBusy(true);
    setError('');
    try {
      const response = await api.post('/api/integrations/github/pat/file/read', {
        repo: githubPatRepo,
        path: githubPatPath.trim(),
        branch: githubPatBranch.trim() || undefined,
      });
      const result = response.data as GitHubPatFile;
      setGithubPatContent(result.content);
      setGithubPatPath(result.path);
      setGithubPatBranch(result.branch);
      setGithubPatFileLoaded(true);
      setGithubPatCommitMessage('Update ' + result.path);
      showToast('Read ' + result.repo + '/' + result.path + ' through the server-side PAT.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGithubPatBusy(false);
    }
  };

  const writeGitHubPatFile = async () => {
    if (!githubPatFileLoaded) {
      setError('Read the existing file first. This avoids accidentally overwriting a file without its current SHA.');
      return;
    }
    if (githubPatCommitMessage.trim().length < 5) {
      setError('Enter a commit message of at least five characters.');
      return;
    }
    if (!window.confirm('Commit changes to ' + githubPatRepo + '/' + githubPatPath + ' on branch ' + githubPatBranch + '?')) return;
    setGithubPatBusy(true);
    setError('');
    try {
      const response = await api.post('/api/integrations/github/pat/file/write', {
        repo: githubPatRepo,
        path: githubPatPath.trim(),
        branch: githubPatBranch.trim(),
        content: githubPatContent,
        message: githubPatCommitMessage.trim(),
      });
      const result = response.data as { written: boolean; commitSha?: string; commitUrl?: string; path: string; branch: string };
      if (!result.written) throw new Error('GitHub did not confirm the file commit.');
      setGithubPatFileLoaded(false);
      if (result.commitUrl) {
        showToast('File committed. Open the commit link to inspect the change.');
      } else {
        showToast('File commit confirmed: ' + (result.commitSha || 'commit SHA unavailable'));
      }
      if (result.commitUrl) window.open(result.commitUrl, '_blank', 'noopener,noreferrer');
      await verifyGitHubPat();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGithubPatBusy(false);
    }
  };

  const disconnectGitHub = async () => {
    if (!window.confirm('Unlink this GitHub identity from the existing ContribQuest account?')) return;
    setSecurityBusy(true); setError('');
    try {
      await api.post('/api/integrations/github/disconnect', {});
      await refreshSecurity();
      showToast('GitHub identity unlinked from this account.');
    } catch (err) { setError(errorText(err)); }
    finally { setSecurityBusy(false); }
  };

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    setSecurityBusy(true); setError('');
    try {
      const response = await api.post('/api/workspaces', { name: workspaceName.trim() });
      const workspace = response.data?.workspace as { id?: string } | undefined;
      setWorkspaceName('');
      if (workspace?.id) setSelectedWorkspaceId(workspace.id);
      await refreshSecurity();
      showToast('Workspace created. You have workspace administrator access.');
    } catch (err) { setError(errorText(err)); }
    finally { setSecurityBusy(false); }
  };

  const assignWorkspaceRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedWorkspaceId || !memberEmail.trim()) return;
    setSecurityBusy(true); setError('');
    try {
      await api.post('/api/access/workspaces/' + encodeURIComponent(selectedWorkspaceId) + '/members', {
        email: memberEmail.trim(), role: memberRole,
      });
      setMemberEmail('');
      await refreshSecurity();
      showToast('Workspace role assigned and audited.');
    } catch (err) { setError(errorText(err)); }
    finally { setSecurityBusy(false); }
  };

  const removeWorkspaceMember = async (member: WorkspaceMembership) => {
    if (!selectedWorkspaceId || !window.confirm('Remove this member from the workspace?')) return;
    setSecurityBusy(true); setError('');
    try {
      await api.delete('/api/access/workspaces/' + encodeURIComponent(selectedWorkspaceId) + '/members/' + encodeURIComponent(member.userId));
      await refreshSecurity();
      showToast('Workspace membership removed and audited.');
    } catch (err) { setError(errorText(err)); }
    finally { setSecurityBusy(false); }
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
        acceptanceCriteria: 'The deliverable matches the agreed scope and includes inspectable evidence.',
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
      captureProductEvent('bounty_created', {
        category: bountyForm.category,
        bounty_tier: bountyForm.tier,
        acceptance_criteria_count: bountyForm.acceptanceCriteria.split('\\n').map(item => item.trim()).filter(Boolean).length,
        has_repository_url: Boolean(bountyForm.repoUrl.trim()),
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
        captureProductEvent('contribution_resubmitted', {
          bounty_tier: revisionTarget.bountyTier,
          revision_number: (revisionTarget.revisionNumber ?? 1) + 1,
          has_evidence_link: Boolean(submissionForm.workUrl.trim()),
        });
        setReviewDrafts(current => ({
          ...current,
          [revisionTarget.id]: {
            criteriaChecks: acceptanceCriteriaFor(revisionTarget).map(() => false),
            feedback: '',
          },
        }));
      } else if (target) {
        await api.post('/api/bounties/' + target.id + '/submit', submissionForm);
        captureProductEvent('contribution_submitted', {
          bounty_tier: target.tier,
          acceptance_criteria_count: acceptanceCriteriaFor(target).length,
          has_evidence_link: Boolean(submissionForm.workUrl.trim()),
        });
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
      const submittedAt = new Date(item.lastSubmittedAt || item.createdAt).getTime();
      const reviewLatencyHours = Number.isFinite(submittedAt)
        ? Math.round(Math.max(0, Date.now() - submittedAt) / 360000) / 10
        : undefined;
      captureProductEvent('contribution_reviewed', {
        outcome: status,
        criteria_count: draft.criteriaChecks.length,
        criteria_passed_count: draft.criteriaChecks.filter(Boolean).length,
        xp_awarded: status === 'accepted' ? 50 : 0,
        ...(reviewLatencyHours === undefined ? {} : { review_latency_hours: reviewLatencyHours }),
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
    'Account & integrations': 'Account, roles & integrations',
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


  const renderAccountIntegrations = () => {
    if (!user) return (
      <section className="settings-panel">
        <h2>Account and permissions</h2>
        <p>Sign in with your existing account to view its identity, roles and linked integrations.</p>
        <button className="button button-dark" onClick={() => void signIn()}><LogIn size={15} /> Sign in</button>
      </section>
    );
    if (securityLoading && !securityState) return <section className="settings-panel"><Activity size={18} /> Loading account security…</section>;
    const settings = securityState;
    const owner = Boolean(settings?.access.isPlatformOwner);
    const selectedMembership = settings?.access.workspaces.find(item => item.workspaceId === selectedWorkspaceId);
    const canManageSelected = owner || selectedMembership?.role === 'workspace_admin';
    const canManageAny = owner || Boolean(settings?.access.workspaces.some(item => item.role === 'workspace_admin'));
    return (
      <div className="settings-grid">
        <section className="settings-panel">
          <div className="settings-panel-heading"><ShieldCheck size={21}/><div><h2>Existing account</h2><p>This remains your canonical ContribQuest identity. Linking GitHub does not create a second profile.</p></div></div>
          <div className="settings-detail-list">
            <div><span>Display name</span><strong>{settings?.account.displayName || user.name || 'Contributor'}</strong></div>
            <div><span>Sign-in email</span><strong>{settings?.account.email || user.email || 'Email scope unavailable'}</strong></div>
            <div><span>Account ID</span><code>{settings?.account.userId || user.userId}</code></div>
            <div><span>Platform role</span><strong>{owner ? 'Platform owner' : settings?.access.platformOwnerConfigured ? 'Not on owner allowlist' : 'Owner setup pending'}</strong></div>
          </div>
          <div className="settings-role-row">{(settings?.access.roles ?? ['contributor']).map(role => <span className="role-chip" key={role}>{role.replace(/_/g,' ')}</span>)}</div>
          {!settings?.access.platformOwnerConfigured && <div className="settings-notice"><LockKeyhole size={17}/><span>Owner setup requires the verified account email to be configured server-side in <code>PLATFORM_OWNER_EMAILS</code>. Users cannot grant themselves platform-owner access.</span></div>}
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading"><GitBranch size={21}/><div><h2>GitHub identity</h2><p>Link GitHub to this account. Repository installation and access are separate permissions.</p></div><span className={'settings-status '+(settings?.github.linked?'settings-status-good':'')}>{settings?.github.linked?'Linked':settings?.github.configured?'Ready':'Not configured'}</span></div>
          {settings?.github.linked ? <>
            <div className="github-linked-row"><div className="github-mark"><GitBranch size={20}/></div><div><strong>@{settings.github.githubLogin}</strong><small>GitHub user ID {settings.github.githubUserId}</small></div></div>
            <div className="settings-detail-list">
              <div><span>Verified GitHub email(s)</span><strong>{settings.github.verifiedEmails?.length ? settings.github.verifiedEmails.map(email => email === settings.github.primaryEmail ? email + ' (primary)' : email).join(', ') : 'No verified GitHub email returned'}</strong></div>
              <div><span>ContribQuest sign-in email</span><strong>{settings.account.email || user.email || 'Email scope unavailable'}</strong></div>
            </div>
            {settings.github.emailAccessStatus === 'permission_required'
              ? <div className="settings-notice"><LockKeyhole size={17}/><span>GitHub identity is linked, but GitHub denied access to email addresses. In your GitHub App settings, enable User permissions → Email addresses: Read, save the permission change, then disconnect and reconnect the identity.</span></div>
              : settings.github.emailAccessStatus === 'unavailable'
                ? <div className="settings-notice"><Activity size={17}/><span>GitHub identity is linked, but its verified email list could not be retrieved. Check the GitHub App email permission and reconnect.</span></div>
                : <div className="settings-notice"><CheckCircle2 size={17}/><span>Verified GitHub emails are kept separate from your ContribQuest sign-in email. Different addresses are supported; email address differences alone do not block identity linking. Repository installation and sync are still separate.</span></div>}
            <button className="button button-muted" disabled={securityBusy} onClick={() => void disconnectGitHub()}>Disconnect identity</button>
          </> : <>
            <div className="settings-detail-list">
              <div><span>ContribQuest sign-in email</span><strong>{settings?.account.email || user.email || 'Email scope unavailable'}</strong></div>
              <div><span>Client ID</span><strong>{settings?.github.clientIdConfigured?'Configured':'Missing'}</strong></div>
              <div><span>Client secret</span><strong>{settings?.github.clientSecretConfigured?'Configured':'Missing'}</strong></div>
              <div><span>Callback URL</span><code>{settings?.github.callbackUrl || 'https://contribquest-lygj1x.v2.appdeploy.ai/api/integrations/github/callback'}</code></div>
            </div>
            <div className="github-login-field">
              <label>GitHub username to connect (optional)
                <input value={githubLoginHint} onChange={event => setGithubLoginHint(event.target.value.replace(/^@/, ''))} placeholder="Loofy147" maxLength={39} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
              <p className="settings-footnote">Enter the GitHub username that owns the repositories, not its email address. Leave blank to choose an account at GitHub. Your ContribQuest email can be different; after authorization, verified GitHub email addresses are shown separately.</p>
            </div>
            {!settings?.github.configured && <div className="settings-notice"><Activity size={17}/><span>Register a GitHub App using the exact callback URL. Then set <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> through AppDeploy secure backend-secret entry. Never paste credentials into chat or source.</span></div>}
            <div className="github-connect-actions">
              <button className="button button-dark" disabled={securityBusy || Boolean(githubDeviceSession) || !settings?.github.configured} onClick={() => void startGitHubConnection()}>{securityBusy && !githubDeviceSession?'Preparing…':'Connect GitHub identity'} <ArrowUpRight size={15}/></button>
              <button className="button button-muted" disabled={securityBusy || Boolean(githubDeviceSession) || !settings?.github.clientIdConfigured} onClick={() => void startGitHubDeviceConnection()}>Use device code instead <ShieldCheck size={15}/></button>
            </div>
            {githubDeviceSession && <div className="github-device-flow">
              <strong>Authorize the intended GitHub account</strong>
              <p>Open GitHub in your phone browser, sign in as <code>{githubLoginHint.trim().replace(/^@/, '') || 'the account that owns your repositories'}</code>, then enter this one-time code:</p>
              <div className="github-device-code">{githubDeviceSession.userCode}</div>
              <a href={githubDeviceSession.verificationUri} target="_blank" rel="noreferrer">Open GitHub device authorization <ExternalLink size={14}/></a>
              <p className="settings-footnote">Keep this ContribQuest page open. Authorization is checked automatically. The code expires at {new Date(githubDeviceSession.expiresAt).toLocaleTimeString()}.</p>
              <button className="button button-muted" onClick={() => { setGithubDeviceSession(null); setSecurityBusy(false); }}>Cancel device authorization</button>
            </div>}
            <p className="settings-footnote">The device method avoids the callback redirect. ContribQuest stores only a hash of the temporary device code; the returned access token is never stored in normal app records.</p>
          </>}
        </section>

        <section className="settings-panel settings-panel-wide">
          <div className="settings-panel-heading"><GitBranch size={21}/><div><h2>GitHub PAT repository operations</h2><p>Owner-only server-side access through the encrypted GITHUB_PAT secret. The browser never receives the token.</p></div><span className={'settings-status '+(githubPatVerification?.verified?'settings-status-good':'')}>{githubPatVerification?.verified?'Verified': 'Not verified'}</span></div>
          {!owner
            ? <div className="settings-notice"><LockKeyhole size={17}/><span>Repository operations through the PAT are restricted to the configured platform owner.</span></div>
            : <>
              <div className="settings-detail-list">
                <div><span>Backend PAT</span><strong>Stored as encrypted backend secret</strong></div>
                <div><span>Allowed repositories</span><strong>Loofy147/Contribution-bounties-centre- · Loofy147/contribution-network</strong></div>
                {githubPatVerification?.verified && <div><span>Authenticated GitHub account</span><strong>{githubPatVerification.login} (ID {githubPatVerification.id})</strong></div>}
              </div>
              <button className="button button-dark" disabled={githubPatBusy} onClick={() => void verifyGitHubPat()}>{githubPatBusy?'Verifying…':'Verify PAT and repository access'} <ShieldCheck size={15}/></button>
              {githubPatVerification?.message && <div className={'settings-notice'}><Activity size={17}/><span>{githubPatVerification.message}</span></div>}
              {githubPatVerification?.repositories && <div className="github-pat-repo-results">
                {githubPatVerification.repositories.map(repository => <div className="github-pat-repo-row" key={repository.repositoryFullName}>
                  <div><strong>{repository.repositoryFullName}</strong><small>{repository.accessible ? 'GitHub account role: ' + repository.repositoryRole + ' · default branch: ' + repository.defaultBranch + ' · PAT file permissions are tested by read/commit actions.' : repository.message}</small></div>
                  <span className={'settings-status '+(repository.accessible?'settings-status-good':'')}>{repository.accessible?'Metadata visible':'No access'}</span>
                </div>)}
              </div>}
              <div className="github-pat-editor">
                <div className="settings-subheading"><h3>Read or commit a text file</h3><span className="settings-footnote">Only the two listed repositories are allowed.</span></div>
                <div className="github-pat-editor-grid">
                  <label>Repository
                    <select value={githubPatRepo} onChange={event => { setGithubPatRepo(event.target.value as 'Contribution-bounties-centre-' | 'contribution-network'); setGithubPatFileLoaded(false); }}>
                      <option value="Contribution-bounties-centre-">Contribution-bounties-centre-</option>
                      <option value="contribution-network">contribution-network</option>
                    </select>
                  </label>
                  <label>Branch
                    <input value={githubPatBranch} onChange={event => { setGithubPatBranch(event.target.value); setGithubPatFileLoaded(false); }} maxLength={250} autoCapitalize="none" autoCorrect="off" />
                  </label>
                  <label className="github-pat-path-field">Relative file path
                    <input value={githubPatPath} onChange={event => { setGithubPatPath(event.target.value); setGithubPatFileLoaded(false); }} maxLength={500} placeholder="README.md" autoCapitalize="none" autoCorrect="off" />
                  </label>
                </div>
                <button className="button button-muted" disabled={githubPatBusy || !githubPatVerification?.verified || !githubPatVerification.usable} onClick={() => void readGitHubPatFile()}>{githubPatBusy?'Working…':'Read file from GitHub'} <ExternalLink size={15}/></button>
                {githubPatFileLoaded && <div className="github-pat-edit-form">
                  <label>File contents
                    <textarea value={githubPatContent} onChange={event => setGithubPatContent(event.target.value)} rows={10} spellCheck={false} />
                  </label>
                  <label>Commit message
                    <input value={githubPatCommitMessage} onChange={event => setGithubPatCommitMessage(event.target.value)} minLength={5} maxLength={200} />
                  </label>
                  <button className="button button-dark" disabled={githubPatBusy || !githubPatVerification?.verified || !githubPatVerification.usable} onClick={() => void writeGitHubPatFile()}>{githubPatBusy?'Committing…':'Commit file change'} <GitBranch size={15}/></button>
                  <p className="settings-footnote">Writing creates a commit on the selected branch. GitHub branch protection and repository rules still apply. Confirm each commit in the browser prompt.</p>
                </div>}
              </div>
            </>}
        </section>

        <section className="settings-panel settings-panel-wide">
          <div className="settings-panel-heading"><ShieldCheck size={21}/><div><h2>Roles and rules</h2><p>Application roles do not grant GitHub permissions. The backend checks every workspace membership change.</p></div></div>
          <div className="role-matrix">
            <div><strong>Platform owner</strong><span>Global policy and workspace creation. Assigned only through server-side allowlisting.</span></div>
            <div><strong>Workspace administrator</strong><span>Manage workspace membership and assign permitted roles.</span></div>
            <div><strong>Reviewer</strong><span>Review authorized evidence; existing bounty-owner checks remain in force.</span></div>
            <div><strong>Contributor</strong><span>Create and submit permitted work; XP follows accepted-work rules.</span></div>
            <div><strong>Observer</strong><span>Read authorized workspace information without mutating it.</span></div>
          </div>
          <div className="settings-notice"><LockKeyhole size={17}/><span>Legacy bounty records still use their existing ownership checks. Workspace roles are not yet a universal project-membership policy for every bounty route.</span></div>
        </section>

        <section className="settings-panel settings-panel-wide">
          <div className="settings-panel-heading"><Users size={21}/><div><h2>Workspaces</h2><p>Your own memberships are shown below. Workspace creation requires the configured platform-owner role.</p></div></div>
          {settings?.access.workspaces.length ? <div className="settings-workspace-list">{settings.access.workspaces.map(item =>
            <button key={item.workspaceId} className={'settings-workspace-row '+(selectedWorkspaceId===item.workspaceId?'settings-workspace-active':'')} onClick={() => {setSelectedWorkspaceId(item.workspaceId);setWorkspaceMembers([]);}}>
              <span><strong>{item.workspaceName}</strong><small>{item.workspaceId}</small></span><span className="role-chip">{item.role.replace(/_/g,' ')}</span>
            </button>
          )}</div> : <p className="settings-footnote">No workspace memberships yet.</p>}
          {owner && <form className="settings-inline-form" onSubmit={createWorkspace}><label>New workspace name<input required minLength={3} maxLength={100} value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} placeholder="Contribution Network"/></label><button className="button button-dark" disabled={securityBusy}>{securityBusy?'Saving…':'Create workspace'} <Plus size={15}/></button></form>}
          {canManageAny && settings?.access.workspaces.length ? <>
            <div className="settings-subheading"><h3>Members</h3>{selectedWorkspaceId&&<code>{selectedWorkspaceId}</code>}</div>
            <div className="settings-member-list">{workspaceMembers.map(member=><div className="settings-member-row" key={member.id}>
              <div><strong>{member.displayName||member.email||member.userId}</strong><small>{member.email||member.userId}</small></div><span className="role-chip">{member.role.replace(/_/g,' ')}</span>
              {member.userId!==user.userId&&<button className="button button-small button-muted" disabled={securityBusy} onClick={()=>void removeWorkspaceMember(member)}>Remove</button>}
            </div>)}{!workspaceMembers.length&&<p className="settings-footnote">Select a workspace you administer to see its members.</p>}</div>
            {canManageSelected&&<form className="settings-inline-form" onSubmit={assignWorkspaceRole}>
              <label>Existing account email<input type="email" required value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="person@example.com"/></label>
              <label>Role<select value={memberRole} onChange={e=>setMemberRole(e.target.value as typeof memberRole)}>{owner&&<option value="workspace_admin">Workspace administrator</option>}<option value="reviewer">Reviewer</option><option value="contributor">Contributor</option><option value="observer">Observer</option></select></label>
              <button className="button button-dark" disabled={securityBusy}>{securityBusy?'Saving…':'Assign role'} <ArrowRight size={15}/></button>
            </form>}
            <p className="settings-footnote">A target must sign into the app once before their account can be assigned a role. Only a platform owner may grant workspace-administrator access.</p>
          </>:null}
        </section>
      </div>
    );
  };

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
                {(user.name || user.email || 'C').slice(0, 1).toUpperCase()}              </div>
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
          {user && work.indexing && (
            <div className="indexing-banner" role="status">
              <Activity size={16} />
              <span>
                Preparing your existing work in private, user-scoped indexes. Your records remain saved; some older items may appear as indexing progresses.
              </span>
              <button className="button button-small button-outline" onClick={() => void refreshData(false)} disabled={loading}>
                Continue
              </button>
            </div>
          )}
          {view === 'Overview' && renderOverview()}
          {view === 'Explore bounties' && renderExplore()}
          {view === 'My contributions' && renderMyWork()}
          {view === 'Manage work' && renderManage()}
          {view === 'Goals & levels' && renderGoals()}
          {view === 'Leaderboard' && renderLeaderboard()}
          {view === 'Account & integrations' && renderAccountIntegrations()}
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
            </div>            {modal === 'create' ? (
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
                    placeholder="The result matches the agreed scope and can be inspected."
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
