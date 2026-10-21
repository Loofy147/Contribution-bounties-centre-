import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '@appdeploy/client';

type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  role: 'workspace_admin' | 'reviewer' | 'contributor' | 'observer';
};

type ReviewQueueItem = {
  id: string;
  contributorId: string;
  contributorName: string;
  projectName: string;
  workTitle: string;
  workType: string;
  description: string;
  workUrl?: string;
  evidenceUrl?: string;
  evidenceNote: string;
  acceptanceCriteria: string[];
  criteriaChecks: boolean[];
  riskLevel: 'low' | 'standard' | 'high';
  workspaceId: string;
  workspaceName: string;
  status: 'submitted';
  revisionNumber?: number;
  createdAt: string;
};

type ReviewDecision = 'accepted' | 'needs_changes' | 'rejected';
type ReviewDraft = { criteriaChecks: boolean[]; feedback: string };

function messageFromError(value: unknown): string {
  if (value && typeof value === 'object' && 'response' in value) {
    const response = (value as { response?: { data?: { message?: string; error?: string } } }).response;
    if (response?.data?.message) return response.data.message;
    if (response?.data?.error) return response.data.error;
  }
  return value instanceof Error ? value.message : 'The review could not be completed.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const WORK_TYPE_LABELS: Record<string, string> = {
  requirements: 'Requirements & product decisions',
  architecture: 'Architecture & systems design',
  research: 'Research & analysis',
  software: 'Software & automation',
  testing: 'Testing & quality assurance',
  documentation: 'Documentation & education',
  design: 'Design & accessibility',
  security: 'Security analysis',
  integration: 'Integration & APIs',
  operations: 'Operations & maintenance',
  coordination: 'Coordination & project management',
  community: 'Community & partnerships',
  other: 'Other useful work',
};

export default function ProjectReviewQueue({ onUpdated }: { onUpdated?: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadQueue = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/workspaces');
      const memberships = ((response.data?.workspaces ?? []) as WorkspaceMembership[])
        .filter(item => item.role === 'workspace_admin' || item.role === 'reviewer');
      setWorkspaces(memberships);
      const groups = await Promise.all(memberships.map(async workspace => {
        try {
          const queueResponse = await api.get(
            '/api/workspaces/' + encodeURIComponent(workspace.workspaceId) + '/project-contributions/review-queue'
          );
          return (queueResponse.data?.contributions ?? []) as ReviewQueueItem[];
        } catch {
          return [];
        }
      }));
      const unique = new Map<string, ReviewQueueItem>();
      groups.flat().forEach(item => unique.set(item.id, item));
      setItems(Array.from(unique.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (error) {
      setErrorMessage(messageFromError(error));
      setWorkspaces([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const getDraft = (item: ReviewQueueItem): ReviewDraft =>
    drafts[item.id] ?? {
      criteriaChecks: item.acceptanceCriteria.map(() => false),
      feedback: '',
    };

  const updateDraft = (item: ReviewQueueItem, patch: Partial<ReviewDraft>) => {
    setDrafts(current => ({
      ...current,
      [item.id]: { ...getDraft(item), ...patch },
    }));
  };

  const submitReview = async (item: ReviewQueueItem, decision: ReviewDecision) => {
    const draft = getDraft(item);
    if (draft.feedback.trim().length < 15) {
      setErrorMessage('Provide specific review feedback of at least 15 characters.');
      return;
    }
    if (decision === 'accepted' && !draft.criteriaChecks.every(Boolean)) {
      setErrorMessage('An acceptance decision requires every criterion to pass.');
      return;
    }

    setSavingId(item.id);
    setErrorMessage('');
    setNotice('');
    try {
      await api.post(
        '/api/workspaces/' + encodeURIComponent(item.workspaceId) + '/project-contributions/' +
          encodeURIComponent(item.id) + '/review',
        { decision, feedback: draft.feedback, criteriaChecks: draft.criteriaChecks }
      );
      await loadQueue();
      onUpdated?.();
      setNotice(
        decision === 'accepted'
          ? 'Contribution accepted. The 50 XP award is recorded once.'
          : decision === 'needs_changes'
            ? 'Changes requested. The contributor can revise and resubmit.'
            : 'Contribution rejected. No XP was awarded.'
      );
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSavingId(null);
    }
  };

  if (!loading && workspaces.length === 0) return null;

  return (
    <section className="pc-review-queue" aria-labelledby="pc-review-queue-title">
      <div className="pc-review-queue__heading">
        <div>
          <p className="project-contributions__eyebrow">WORKSPACE REVIEW</p>
          <h3 id="pc-review-queue-title">Independent review queue</h3>
          <p>Only workspace reviewers and administrators can make these decisions. Contributors cannot review their own work.</p>
        </div>
        <button type="button" className="pc-button pc-button--secondary" onClick={() => void loadQueue()} disabled={loading || savingId !== null}>
          <ClipboardCheck size={15} /> Refresh queue
        </button>
      </div>

      {errorMessage && (
        <div className="pc-message pc-message--error" role="alert">
          <AlertTriangle size={16} /><span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage('')} aria-label="Dismiss error">×</button>
        </div>
      )}
      {notice && (
        <div className="pc-message pc-message--success" role="status">
          <CheckCircle2 size={16} /><span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">×</button>
        </div>
      )}

      {loading ? (
        <div className="pc-empty">Loading workspace review queue…</div>
      ) : items.length === 0 ? (
        <div className="pc-empty">No other workspace contributions are awaiting review.</div>
      ) : (
        <div className="pc-list">
          {items.map(item => {
            const draft = getDraft(item);
            return (
              <article className="pc-card pc-review-card" key={item.id}>
                <div className="pc-card__top">
                  <div className="pc-card__type">
                    {WORK_TYPE_LABELS[item.workType] ?? 'Contribution'} · {item.workspaceName}
                  </div>
                  <span className="pc-status pc-status--provisional">Awaiting review</span>
                </div>
                <h4>{item.workTitle}</h4>
                <p className="pc-card__project">
                  {item.projectName} · submitted by {item.contributorName} · {formatDate(item.createdAt)} · {item.riskLevel} risk
                </p>
                <p className="pc-card__description">{item.description}</p>
                <div className="pc-card__evidence">
                  {item.workUrl && <a href={item.workUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open work item</a>}
                  {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open evidence</a>}
                </div>
                <div className="pc-evidence-note">
                  <strong>Evidence note</strong>
                  <p>{item.evidenceNote}</p>
                </div>

                <div className="pc-review-decision">
                  <div className="pc-review-decision__heading">
                    <ShieldCheck size={17} />
                    <strong>Check every acceptance criterion</strong>
                  </div>
                  <div className="pc-checklist">
                    {item.acceptanceCriteria.map((criterion, index) => (
                      <label className="pc-check" key={criterion}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.criteriaChecks[index])}
                          onChange={event => updateDraft(item, {
                            criteriaChecks: item.acceptanceCriteria.map((_, checkIndex) =>
                              checkIndex === index ? event.target.checked : Boolean(draft.criteriaChecks[checkIndex])
                            ),
                          })}
                        />
                        <span>{criterion}</span>
                      </label>
                    ))}
                  </div>
                  <label className="pc-review-decision__feedback">
                    Review rationale <span>Required for every decision; at least 15 characters.</span>
                    <textarea rows={3} maxLength={1000} value={draft.feedback} onChange={event => updateDraft(item, { feedback: event.target.value })} placeholder="Explain which criteria passed, what must change, or why the work is rejected." />
                  </label>
                  <div className="pc-review-decision__actions">
                    <button
                      type="button"
                      className="pc-button pc-button--primary"
                      disabled={savingId !== null || !draft.criteriaChecks.every(Boolean) || draft.feedback.trim().length < 15}
                      onClick={() => void submitReview(item, 'accepted')}
                    >
                      <CheckCircle2 size={15} /> Accept and award 50 XP
                    </button>
                    <button
                      type="button"
                      className="pc-button pc-button--secondary"
                      disabled={savingId !== null || draft.feedback.trim().length < 15}
                      onClick={() => void submitReview(item, 'needs_changes')}
                    >
                      Request changes
                    </button>
                    <button
                      type="button"
                      className="pc-button pc-button--secondary pc-button--reject"
                      disabled={savingId !== null || draft.feedback.trim().length < 15}
                      onClick={() => void submitReview(item, 'rejected')}
                    >
                      Reject
                    </button>
                  </div>
                  <p className="pc-review-decision__footnote">Acceptance requires every criterion to pass. Review decisions and reviewer identity are retained in the contribution history.</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
