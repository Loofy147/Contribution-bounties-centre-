import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileCheck2,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@appdeploy/client';
import ProjectReviewQueue from './ProjectReviewQueue';
import './ProjectContributions.css';

type WorkType =
  | 'requirements'
  | 'architecture'
  | 'research'
  | 'software'
  | 'testing'
  | 'documentation'
  | 'design'
  | 'security'
  | 'integration'
  | 'operations'
  | 'coordination'
  | 'community'
  | 'other';

type ProjectContribution = {
  id: string;
  contributorName: string;
  projectName: string;
  workTitle: string;
  workType: WorkType;
  description: string;
  workUrl?: string;
  evidenceUrl?: string;
  evidenceNote: string;
  acceptanceCriteria: string[];
  criteriaChecks: boolean[];
  riskLevel: 'low' | 'standard' | 'high';
  workspaceId?: string;
  workspaceName?: string;
  status: 'submitted' | 'needs_changes' | 'accepted' | 'rejected';
  verificationLevel: 'provisional' | 'self_verified' | 'independently_verified';
  verificationNote?: string;
  reviewFeedback?: string;
  reviewHistory?: {
    decision: 'accepted' | 'needs_changes' | 'rejected';
    feedback: string;
    reviewerName: string;
    reviewedAt: string;
    revisionNumber: number;
  }[];
  reviewerName?: string;
  revisionNumber?: number;
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
};
type WorkspaceMembershipOption = {
  workspaceId: string;
  workspaceName: string;
  role: 'workspace_admin' | 'reviewer' | 'contributor' | 'observer';
};
type ResubmitDraft = {
  description: string;
  workUrl: string;
  evidenceUrl: string;
  evidenceNote: string;
};

type CreateForm = {
  projectName: string;
  workspaceId: string;
  workTitle: string;
  workType: WorkType;
  description: string;
  workUrl: string;
  evidenceUrl: string;
  evidenceNote: string;
  acceptanceCriteria: string;
  riskLevel: 'low' | 'standard' | 'high';
};

type VerifyDraft = {
  criteriaChecks: boolean[];
  verificationNote: string;
};

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'requirements', label: 'Requirements & product decisions' },
  { value: 'architecture', label: 'Architecture & systems design' },
  { value: 'research', label: 'Research & analysis' },
  { value: 'software', label: 'Software & automation' },
  { value: 'testing', label: 'Testing & quality assurance' },
  { value: 'documentation', label: 'Documentation & education' },
  { value: 'design', label: 'Design & accessibility' },
  { value: 'security', label: 'Security analysis' },
  { value: 'integration', label: 'Integration & APIs' },
  { value: 'operations', label: 'Operations & maintenance' },
  { value: 'coordination', label: 'Coordination & project management' },
  { value: 'community', label: 'Community & partnerships' },
  { value: 'other', label: 'Other useful work' },
];

const EMPTY_FORM: CreateForm = {
  projectName: 'Contribution Network',
  workspaceId: '',
  workTitle: '',
  workType: 'architecture',
  description: '',
  workUrl: '',
  evidenceUrl: '',
  evidenceNote: '',
  acceptanceCriteria: 'The deliverable meets the stated objective and agreed scope.',
  riskLevel: 'standard',
};

function messageFromError(value: unknown): string {
  if (value && typeof value === 'object' && 'response' in value) {
    const response = (value as { response?: { data?: { message?: string; error?: string } } }).response;
    if (response?.data?.message) return response.data.message;
    if (response?.data?.error) return response.data.error;
  }
  return value instanceof Error ? value.message : 'The request could not be completed.';
}

function needsIndependentReview(item: Pick<ProjectContribution, 'projectName' | 'workTitle' | 'workType' | 'description' | 'riskLevel'>): boolean {
  if (item.riskLevel !== 'low' || item.workType === 'security') return true;
  return /\b(security|authorization|authentication|access control|permission|credential|secret|token|key management|payment|financial|production|release|deployment|incident|safety|oauth|bearer)\b/i.test(
    [item.projectName, item.workTitle, item.description].join(' ')
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectContributions({ onUpdated }: { onUpdated?: () => void }) {
  const [items, setItems] = useState<ProjectContribution[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembershipOption[]>([]);
  const [resubmitDrafts, setResubmitDrafts] = useState<Record<string, ResubmitDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [drafts, setDrafts] = useState<Record<string, VerifyDraft>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadContributions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/project-contributions');
      setItems((response.data?.contributions ?? []) as ProjectContribution[]);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContributions();
  }, []);

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const response = await api.get('/api/workspaces');
        const available = (response.data?.workspaces ?? []) as WorkspaceMembershipOption[];
        setWorkspaces(available.filter(item => item.role !== 'observer'));
      } catch {
        setWorkspaces([]);
      }
    };
    void loadWorkspaces();
  }, []);

  const updateForm = (patch: Partial<CreateForm>) => {
    setForm(current => ({ ...current, ...patch }));
  };

  const getDraft = (item: ProjectContribution): VerifyDraft =>
    drafts[item.id] ?? {
      criteriaChecks: item.acceptanceCriteria.map(() => false),
      verificationNote: '',
    };

  const updateDraft = (item: ProjectContribution, patch: Partial<VerifyDraft>) => {
    setDrafts(current => {
      const existing = current[item.id] ?? {
        criteriaChecks: item.acceptanceCriteria.map(() => false),
        verificationNote: '',
      };
      return { ...current, [item.id]: { ...existing, ...patch } };
    });
  };

  const createContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const payload = {
        ...form,
        workspaceId: form.workspaceId || undefined,
        acceptanceCriteria: form.acceptanceCriteria
          .split('\n')
          .map(item => item.trim())
          .filter(Boolean),
      };
      const response = await api.post('/api/project-contributions', payload);
      const saved = response.data?.contribution as ProjectContribution | undefined;
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await loadContributions();
      onUpdated?.();
      setNotice(saved ? 'Contribution recorded and linked to your work evidence.' : 'Contribution recorded.');
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  const getResubmitDraft = (item: ProjectContribution): ResubmitDraft =>
    resubmitDrafts[item.id] ?? {
      description: item.description,
      workUrl: item.workUrl ?? '',
      evidenceUrl: item.evidenceUrl ?? '',
      evidenceNote: item.evidenceNote,
    };

  const updateResubmitDraft = (item: ProjectContribution, patch: Partial<ResubmitDraft>) => {
    setResubmitDrafts(current => ({
      ...current,
      [item.id]: { ...getResubmitDraft(item), ...patch },
    }));
  };

  const resubmitContribution = async (event: FormEvent<HTMLFormElement>, item: ProjectContribution) => {
    event.preventDefault();
    const draft = getResubmitDraft(item);
    if (draft.description.trim().length < 30 || draft.evidenceNote.trim().length < 15) {
      setErrorMessage('Update the delivery description and evidence note before resubmitting.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await api.post('/api/project-contributions/' + encodeURIComponent(item.id) + '/resubmit', {
        description: draft.description,
        workUrl: draft.workUrl,
        evidenceUrl: draft.evidenceUrl,
        evidenceNote: draft.evidenceNote,
      });
      await loadContributions();
      onUpdated?.();
      setNotice('Revision resubmitted to the workspace review queue. Previous review history is preserved.');
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  const verifyContribution = async (item: ProjectContribution) => {
    const draft = getDraft(item);
    if (!draft.criteriaChecks.every(Boolean)) {
      setErrorMessage('Mark every acceptance criterion as met before self-verification.');
      return;
    }
    if (draft.verificationNote.trim().length < 15) {
      setErrorMessage('Write a verification rationale of at least 15 characters.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await api.post('/api/project-contributions/' + encodeURIComponent(item.id) + '/verify', {
        criteriaChecks: draft.criteriaChecks,
        verificationNote: draft.verificationNote,
      });
      await loadContributions();
      onUpdated?.();
      setNotice('Low-risk contribution verified. Its 50 XP award is recorded once.');
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  const totalXp = items.reduce((total, item) => total + (item.xpAwarded || 0), 0);
  const verifiedCount = items.filter(item => item.status === 'accepted').length;
  const pendingCount = items.filter(item => item.status === 'submitted' || item.status === 'needs_changes').length;

  return (
    <section className="project-contributions" aria-labelledby="project-contributions-title">
      <div className="project-contributions__heading">
        <div>
          <p className="project-contributions__eyebrow">PROJECT 0 · FIRST-CONSUMER WORK</p>
          <h3 id="project-contributions-title">Contributions to the network</h3>
          <p className="project-contributions__intro">
            Record real work, link it to the issue or deliverable, and preserve evidence before claiming progress.
          </p>
        </div>
        <button
          type="button"
          className="pc-button pc-button--primary"
          onClick={() => { setFormOpen(current => !current); setErrorMessage(''); }}
        >
          <Plus size={16} /> {formOpen ? 'Close form' : 'Record work'}
        </button>
      </div>

      <div className="project-contributions__stats">
        <div><span>Recorded</span><strong>{items.length}</strong></div>
        <div><span>Provisional</span><strong>{pendingCount}</strong></div>
        <div><span>Verified</span><strong>{verifiedCount}</strong></div>
        <div><span>Project XP</span><strong>{totalXp}</strong></div>
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

      {formOpen && (
        <form className="pc-form" onSubmit={createContribution}>
          <div className="pc-form__title">
            <div><span className="project-contributions__eyebrow">NEW CONTRIBUTION RECORD</span><h4>Describe the outcome</h4></div>
            <p>Record the work first. XP is a separate, evidence-based decision.</p>
          </div>
          <div className="pc-form__grid">
            <label>
              Project
              <input required minLength={3} maxLength={120} value={form.projectName} onChange={event => updateForm({ projectName: event.target.value })} />
            </label>
            <label className="pc-form__wide">
              Shared review workspace <span className="pc-field-hint">Optional. Work linked to a workspace enters its authorized independent review queue and cannot be self-verified.</span>
              <select value={form.workspaceId} onChange={event => updateForm({ workspaceId: event.target.value })}>
                <option value="">Private record — no shared reviewer</option>
                {workspaces.map(workspace => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.workspaceName} · {workspace.role.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Work type
              <select value={form.workType} onChange={event => updateForm({ workType: event.target.value as WorkType })}>
                {WORK_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="pc-form__wide">
              Work item title
              <input required minLength={5} maxLength={160} value={form.workTitle} onChange={event => updateForm({ workTitle: event.target.value })} placeholder="e.g. Define the first-consumer contribution workflow" />
            </label>
            <label className="pc-form__wide">
              What did you deliver?
              <textarea required minLength={30} maxLength={4000} rows={3} value={form.description} onChange={event => updateForm({ description: event.target.value })} placeholder="State the outcome, scope, and how it moves the project forward." />
            </label>
            <label>
              Work item URL
              <input type="url" maxLength={2048} value={form.workUrl} onChange={event => updateForm({ workUrl: event.target.value })} placeholder="GitHub issue, PR, commit, or doc" />
            </label>
            <label>
              Evidence URL
              <input type="url" maxLength={2048} value={form.evidenceUrl} onChange={event => updateForm({ evidenceUrl: event.target.value })} placeholder="Tests, report, artifact, or demo" />
            </label>
            <label className="pc-form__wide">
              Evidence note
              <textarea required minLength={15} maxLength={1000} rows={2} value={form.evidenceNote} onChange={event => updateForm({ evidenceNote: event.target.value })} placeholder="Explain what can be inspected and what the evidence demonstrates." />
            </label>
            <label className="pc-form__wide">
              Acceptance criteria <span className="pc-field-hint">One criterion per line; keep checks specific and observable.</span>
              <textarea required rows={3} value={form.acceptanceCriteria} onChange={event => updateForm({ acceptanceCriteria: event.target.value })} placeholder={'Outcome meets the agreed scope.\nEvidence can be reviewed.'} />
            </label>
            <label>
              Risk level
              <select value={form.riskLevel} onChange={event => updateForm({ riskLevel: event.target.value as CreateForm['riskLevel'] })}>
                <option value="low">Low — bounded and reversible</option>
                <option value="standard">Standard — needs stronger review</option>
                <option value="high">High — independent review required</option>
              </select>
            </label>
          </div>
          <div className="pc-form__footer">
            <p>Self-verification is limited to low-risk work. Security, credentials, permissions, production, release, and financial changes need stronger review.</p>
            <button className="pc-button pc-button--primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Record contribution'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="pc-empty">Loading your project contributions…</div>
      ) : items.length === 0 ? (
        <div className="pc-empty">
          <div className="pc-empty__icon"><FileCheck2 size={20} /></div>
          <h4>No project contributions recorded yet</h4>
          <p>Start with the work already happening in the Contribution Network: decisions, research, implementation, tests, or documentation.</p>
          <button type="button" className="pc-button pc-button--secondary" onClick={() => setFormOpen(true)}><Plus size={15} /> Record the first item</button>
        </div>
      ) : (
        <div className="pc-list">
          {items.map(item => {
            const draft = getDraft(item);
            const canSelfVerify = !item.workspaceId && !needsIndependentReview(item);
            const statusLabel = item.status === 'accepted'
              ? item.verificationLevel === 'independently_verified' ? 'Independently reviewed' : 'Self-verified'
              : item.status === 'needs_changes' ? 'Changes requested'
                : item.status === 'rejected' ? 'Rejected' : 'Provisional';
            return (
              <article className="pc-card" key={item.id}>
                <div className="pc-card__top">
                  <div className="pc-card__type">{WORK_TYPES.find(type => type.value === item.workType)?.label ?? 'Contribution'}</div>
                  <span className={item.status === 'accepted' ? 'pc-status pc-status--verified' : 'pc-status pc-status--provisional'}>
                    {statusLabel}
                  </span>
                </div>
                <h4>{item.workTitle}</h4>
                <p className="pc-card__project">{item.projectName} <span>·</span> {formatDate(item.createdAt)} <span>·</span> {item.riskLevel} risk</p>
                <p className="pc-card__description">{item.description}</p>
                <div className="pc-card__evidence">
                  {item.workUrl && <a href={item.workUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> Open work item</a>}
                  {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open evidence</a>}
                  {!item.workUrl && !item.evidenceUrl && <span>No external link attached; inspect the evidence note below.</span>}
                </div>
                <div className="pc-evidence-note"><strong>Evidence note</strong><p>{item.evidenceNote}</p></div>
                {item.status === 'accepted' ? (
                  <div className="pc-verified-record">
                    <div>
                      <ShieldCheck size={17} />
                      <strong>50 XP recorded</strong>
                      <span>Rule {item.verificationLevel === 'independently_verified' ? 'project-independent-v1' : 'project-self-v1'}</span>
                    </div>
                    <p>{item.verificationLevel === 'independently_verified' ? item.reviewFeedback : item.verificationNote}</p>
                    <p className="pc-verified-meta">
                      {item.verificationLevel === 'independently_verified' ? 'Independently reviewed by ' : 'Self-verified by '}
                      {item.reviewerName || 'the contributor'} · {formatDate(item.acceptedAt || item.createdAt)}.
                      {item.verificationLevel === 'independently_verified' ? ' Reviewer identity and decision are retained in the audit history.' : ' Self-verification is not an independent credential.'}
                    </p>
                  </div>
                ) : item.status === 'needs_changes' ? (
                  <>
                    <div className="pc-review-required pc-review-required--changes">
                      <AlertTriangle size={17} />
                      <div>
                        <strong>Changes requested by {item.reviewerName || 'a workspace reviewer'}</strong>
                        <p>{item.reviewFeedback || 'Review feedback was recorded. Inspect the review history for details.'}</p>
                      </div>
                    </div>
                    <form className="pc-resubmit-form" onSubmit={event => void resubmitContribution(event, item)}>
                      <h5>Revise and resubmit</h5>
                      <label>
                        Updated delivery description
                        <textarea required minLength={30} maxLength={4000} rows={3} value={getResubmitDraft(item).description} onChange={event => updateResubmitDraft(item, { description: event.target.value })} />
                      </label>
                      <div className="pc-resubmit-form__grid">
                        <label>
                          Updated work URL
                          <input type="url" maxLength={2048} value={getResubmitDraft(item).workUrl} onChange={event => updateResubmitDraft(item, { workUrl: event.target.value })} />
                        </label>
                        <label>
                          Updated evidence URL
                          <input type="url" maxLength={2048} value={getResubmitDraft(item).evidenceUrl} onChange={event => updateResubmitDraft(item, { evidenceUrl: event.target.value })} />
                        </label>
                      </div>
                      <label>
                        Updated evidence note
                        <textarea required minLength={15} maxLength={1000} rows={2} value={getResubmitDraft(item).evidenceNote} onChange={event => updateResubmitDraft(item, { evidenceNote: event.target.value })} />
                      </label>
                      <button className="pc-button pc-button--primary" type="submit" disabled={saving || getResubmitDraft(item).description.trim().length < 30 || getResubmitDraft(item).evidenceNote.trim().length < 15}>
                        {saving ? 'Submitting…' : 'Resubmit for review'}
                      </button>
                    </form>
                  </>
                ) : item.status === 'rejected' ? (
                  <div className="pc-review-required pc-review-required--rejected">
                    <AlertTriangle size={17} />
                    <div>
                      <strong>Contribution rejected · no XP awarded</strong>
                      <p>{item.reviewFeedback || 'The reviewer rejected this submission.'}</p>
                    </div>
                  </div>
                ) : canSelfVerify ? (
                  <div className="pc-verify">
                    <div className="pc-verify__heading"><CheckCircle2 size={17} /><div><strong>Verify a completed low-risk outcome</strong><span>Every criterion must pass; the evidence note must justify the result.</span></div></div>
                    <div className="pc-checklist">
                      {item.acceptanceCriteria.map((criterion, index) => (
                        <label key={criterion} className="pc-check">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.criteriaChecks[index])}
                            onChange={event => updateDraft(item, { criteriaChecks: item.acceptanceCriteria.map((_, checkIndex) => checkIndex === index ? event.target.checked : Boolean(draft.criteriaChecks[checkIndex])) })}
                          />
                          <span>{criterion}</span>
                        </label>
                      ))}
                    </div>
                    <label className="pc-verify__note">
                      Verification rationale
                      <textarea rows={2} minLength={15} maxLength={1000} value={draft.verificationNote} onChange={event => updateDraft(item, { verificationNote: event.target.value })} placeholder="Explain how the linked work and evidence satisfy each criterion." />
                    </label>
                    <div className="pc-verify__footer">
                      <span>{draft.criteriaChecks.filter(Boolean).length} / {item.acceptanceCriteria.length} criteria passed</span>
                      <button type="button" className="pc-button pc-button--primary" disabled={saving || !draft.criteriaChecks.every(Boolean) || draft.verificationNote.trim().length < 15} onClick={() => void verifyContribution(item)}><CheckCircle2 size={15} /> Verify and award 50 XP</button>
                    </div>
                  </div>
                ) : (
                  <div className="pc-review-required">
                    <AlertTriangle size={17} />
                    <div><strong>Independent review required</strong><p>This record remains provisional. Self-verification cannot award XP for standard/high-risk or sensitive work. Select a shared workspace when recording the work to route it to an authorized reviewer.</p></div>
                  </div>
                )}
                {item.reviewHistory && item.reviewHistory.length > 0 && (
                  <details className="pc-review-history">
                    <summary>Review history ({item.reviewHistory.length})</summary>
                    <div className="pc-review-history__events">
                      {item.reviewHistory.map((event, index) => (
                        <div key={event.reviewedAt + '-' + index}>
                          <strong>{event.decision.replace('_', ' ')} · {event.reviewerName}</strong>
                          <span>Revision {event.revisionNumber} · {formatDate(event.reviewedAt)}</span>
                          <p>{event.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
      <ProjectReviewQueue onUpdated={onUpdated} />
      <p className="pc-footnote"><Sparkles size={14} /> Work records stay linked to evidence. Shared records require an authorized reviewer; private self-verification is explicitly not independent validation.</p>
    </section>
  );
}
