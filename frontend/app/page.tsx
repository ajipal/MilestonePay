'use client';

import { useState, useEffect, useRef } from 'react';
import type { PageName, UserRole, MsStatus, BuildMs, MilestoneData, Project, TimelineEntry, AdminDispute } from '@/lib/types';

// ── Constants ────────────────────────────────────────────────────────────────
const DL_LABEL: Record<number, string> = {
  172800: '48 hours', 86400: '24 hours', 259200: '72 hours',
};
const STATUS_ICON: Record<MsStatus, string> = {
  created: '📋', progress: '⚙️', review: '⏳', revision: '🔁', released: '✅', disputed: '⚠️',
};
const STATUS_LABEL: Record<MsStatus, string> = {
  created: 'Created', progress: 'In Progress', review: 'Under Review',
  revision: 'Revision', released: 'Released', disputed: 'Disputed',
};
const STATUS_SC: Record<MsStatus, string> = {
  created: 's-created', progress: 's-progress', review: 's-review',
  revision: 's-review', released: 's-released', disputed: 's-disputed',
};
const DEFAULT_BUILD: BuildMs[] = [
  { id: 1, title: 'Initial Wireframes', desc: 'Lo-fi wireframes and user flow', amount: 50 },
  { id: 2, title: 'Final Deliverables', desc: 'Finished design files ready for dev', amount: 50 },
];

// ── Utilities ────────────────────────────────────────────────────────────────
const short = (addr: string, f = 6, b = 4) =>
  !addr || addr.length <= f + b + 3 ? addr || '—' : `${addr.slice(0, f)}...${addr.slice(-b)}`;
const fmt = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
const nowStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

let buildUID = 2;

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth state ──
  const [page, setPage] = useState<PageName>('connect');
  const [wallet, setWallet] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [pendingRole, setPendingRole] = useState(false); // true if name was set but role still needed

  // ── Data state ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeMilestoneId, setActiveMilestoneId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Create form ──
  const [formName, setFormName] = useState('');
  const [formFreelancerWallet, setFormFreelancerWallet] = useState('');
  const [formDeadline, setFormDeadline] = useState(172800);
  const [formProjectDeadline, setFormProjectDeadline] = useState('');
  const [buildList, setBuildList] = useState<BuildMs[]>(DEFAULT_BUILD);

  // ── Manage mode ──
  const [manageMode, setManageMode] = useState(false);

  // ── Withdrawal modal ──
  const [modalWithdraw, setModalWithdraw] = useState(false);
  const [withdrawProjectId, setWithdrawProjectId] = useState<number | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');

  // ── Proof/submit modal ──
  const [modalSubmit, setModalSubmit] = useState(false);
  const [modalRevision, setModalRevision] = useState(false);
  const [modalDispute, setModalDispute] = useState(false);
  const [proofLink, setProofLink] = useState('');
  const [proofFileUrl, setProofFileUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [revFeedback, setRevFeedback] = useState('');
  const [revFeePercent, setRevFeePercent] = useState(20);

  // ── Dispute form ──
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidenceLink, setDisputeEvidenceLink] = useState('');

  // ── Dashboard filter & search ──
  const [dashFilter, setDashFilter] = useState<'all' | 'not_started' | 'in_progress' | 'for_review' | 'for_revision' | 'done'>('all');
  const [dashSearch, setDashSearch] = useState('');
  const [dashPage, setDashPage] = useState(0);
  const DASH_PER_PAGE = 3;

  // ── Status page carousel ──
  const [carouselIdx, setCarouselIdx] = useState(0);

  // ── Admin state ──
  const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? '';
  const isAdmin = wallet === ADMIN_WALLET;
  const [adminDisputes, setAdminDisputes] = useState<AdminDispute[]>([]);

  // ── Toast ──
  const [toast, setToast] = useState({ show: false, msg: '', icon: '✅' });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Derived ──
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const activeMilestone = activeProject?.milestones.find(m => m.id === activeMilestoneId) ?? null;
  const isProjectClient = activeProject?.clientWallet === wallet;
  const isProjectFreelancer = activeProject?.freelancerWallet === wallet;

  // ── Auto-connect on mount ─────────────────────────────────────────────────
  useEffect(() => {
    async function checkExisting() {
      try {
        const { getWalletAddress } = await import('@/lib/wallet');
        const addr = await getWalletAddress();
        if (!addr) return;
        setWallet(addr);
        const adminAddr = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? '';
        if (addr === adminAddr) { setPage('admin'); return; }
        const { getUserProfile } = await import('@/lib/db');
        const profile = await getUserProfile(addr);
        if (profile?.name) setUserName(profile.name);
        if (!profile?.name) { setPage('name'); setPendingRole(!profile?.role); return; }
        if (!profile?.role) { setPage('role'); return; }
        setRole(profile.role);
        setPage('dashboard');
      } catch { /* stay on connect page */ }
    }
    checkExisting();
  }, []);

  // ── Load projects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet || !role) return;
    import('@/lib/db').then(({ loadProjects }) =>
      loadProjects(wallet, role).then(setProjects).catch((e: Error) => showToast(e.message, '⚠'))
    );
  }, [wallet, role]);

  // ── Load disputes ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || !wallet) return;
    import('@/lib/db').then(({ loadAdminDisputes }) =>
      loadAdminDisputes().then(setAdminDisputes).catch(() => {})
    );
  }, [isAdmin, wallet]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setProjects(prev => {
        const hasActive = prev.some(p => p.milestones.some(m => m.status === 'review' && m.timerSecs > 0));
        if (!hasActive) return prev;
        return prev.map(p => ({
          ...p,
          milestones: p.milestones.map(m =>
            m.status === 'review' && m.timerSecs > 0 ? { ...m, timerSecs: m.timerSecs - 1 } : m
          ),
        }));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showToast = (msg: string, icon = '✅') => {
    setToast({ show: true, msg, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const go = (p: PageName) => { setPage(p); window.scrollTo(0, 0); };

  const patchMilestoneInProject = (projId: number, msId: number, patch: Partial<MilestoneData>) => {
    setProjects(prev => prev.map(p =>
      p.id !== projId ? p : {
        ...p,
        milestones: p.milestones.map(m => m.id !== msId ? m : { ...m, ...patch }),
      }
    ));
  };

  const addTimelineToProject = (projId: number, dot: TimelineEntry['dot'], text: string) => {
    setProjects(prev => prev.map(p =>
      p.id !== projId ? p : {
        ...p,
        timeline: [{ dot, time: nowStr(), text }, ...p.timeline],
      }
    ));
  };

  const refreshProjects = () => {
    if (!wallet || !role) return;
    import('@/lib/db').then(({ loadProjects }) =>
      loadProjects(wallet, role).then(setProjects).catch(() => {})
    );
  };

  // ── Project status classifier ─────────────────────────────────────────────
  function projStatus(p: Project): 'not_started' | 'in_progress' | 'for_review' | 'for_revision' | 'done' {
    const ms = p.milestones;
    if (ms.length === 0) return 'not_started';
    if (ms.every(m => m.status === 'released')) return 'done';
    if (ms.some(m => m.status === 'review' || m.status === 'disputed')) return 'for_review';
    if (ms.some(m => m.status === 'revision')) return 'for_revision';
    if (ms.some(m => m.status === 'progress')) return 'in_progress';
    return 'not_started';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function doConnect() {
    setLoading(true);
    try {
      const { connectWallet, validateWallet } = await import('@/lib/wallet');
      const addr = await connectWallet();
      const valid = await validateWallet(addr);
      if (!valid) throw new Error('Account not found on Stellar Testnet. Fund it at laboratory.stellar.org first.');
      setWallet(addr);
      const adminAddr = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? '';
      if (addr === adminAddr) { go('admin'); return; }
      const { getUserProfile } = await import('@/lib/db');
      const profile = await getUserProfile(addr);
      if (profile?.name) setUserName(profile.name);
      if (!profile?.name) { setPendingRole(!profile?.role); go('name'); return; }
      if (!profile?.role) { go('role'); return; }
      setRole(profile.role);
      go('dashboard');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function saveName() {
    if (!nameInput.trim()) return showToast('Please enter your name', '⚠');
    setLoading(true);
    try {
      const { saveUserName } = await import('@/lib/db');
      await saveUserName(wallet, nameInput.trim());
      setUserName(nameInput.trim());
      setNameInput('');
      if (pendingRole) go('role');
      else go('dashboard');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  function doDisconnect() {
    setWallet(''); setRole(null); setProjects([]); setUserName('');
    setActiveProjectId(null); setActiveMilestoneId(null);
    go('connect');
  }

  async function selectRole(r: UserRole) {
    setLoading(true);
    try {
      const { saveUserRole } = await import('@/lib/db');
      await saveUserRole(wallet, r);
      setRole(r);
      go('dashboard');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Create project ────────────────────────────────────────────────────────
  const buildTotal = buildList.reduce((s, m) => s + m.amount, 0);

  function addBuildMs() {
    buildUID++;
    setBuildList(prev => [...prev, { id: buildUID, title: '', desc: '', amount: 50 }]);
  }
  function removeBuildMs(id: number) {
    if (buildList.length <= 1) return;
    setBuildList(prev => prev.filter(m => m.id !== id));
  }

  async function lockProject() {
    if (!formName.trim()) return showToast('Enter a project name', '⚠');
    if (!formFreelancerWallet.trim()) return showToast("Enter the freelancer's wallet address", '⚠');
    if (!formProjectDeadline) return showToast('Please set a project deadline', '⚠');
    if (buildList.some(m => !m.title.trim())) return showToast('All milestones need a title', '⚠');
    if (buildList.some(m => m.amount <= 0)) return showToast('All milestone amounts must be > 0', '⚠');
    if (!process.env.NEXT_PUBLIC_CONTRACT_ID) return showToast('Contract not configured', '⚠');
    const duplicate = projects.find(
      p => p.clientWallet === wallet &&
           p.name.toLowerCase() === formName.trim().toLowerCase() &&
           p.freelancerWallet === formFreelancerWallet.trim() &&
           p.tx !== ''
    );
    if (duplicate) return showToast(`A project named "${formName.trim()}" with this freelancer already exists.`, '⚠');

    setLoading(true);
    let pid: number | null = null;
    try {
      const { createProject, updateProjectTx, addTimeline: dbTimeline, loadProjects, deleteProject } = await import('@/lib/db');
      const { signTx } = await import('@/lib/wallet');
      const { projectId, milestoneIds } = await createProject(
        formName.trim(), wallet, formFreelancerWallet.trim(), formDeadline,
        buildList.map(m => ({ name: m.title || `Milestone ${m.id}`, desc: m.desc, amount: m.amount })),
        formProjectDeadline,
      );
      pid = projectId;

      let lastTxHash = '';
      try {
        const { createProjectBatch } = await import('@/lib/contract');
        lastTxHash = await createProjectBatch(
          wallet, formFreelancerWallet.trim(),
          process.env.NEXT_PUBLIC_USDC_TOKEN ?? '',
          milestoneIds, buildList.map(m => m.amount),
          Math.floor(Date.now() / 1000) + formDeadline,
          signTx,
        );
      } catch (onChainErr) {
        await deleteProject(pid);
        throw onChainErr;
      }

      await updateProjectTx(pid, lastTxHash);
      await dbTimeline(pid, 'done', `<strong>${buildTotal} XLM locked</strong> — ${buildList.length} milestone${buildList.length > 1 ? 's' : ''} initialized. TX: ${lastTxHash.slice(0, 12)}...`);

      const updated = await loadProjects(wallet, role!);
      setProjects(updated);
      setActiveProjectId(pid);

      setFormName(''); setFormFreelancerWallet(''); setFormDeadline(172800); setFormProjectDeadline('');
      setBuildList([...DEFAULT_BUILD]); buildUID = 2;

      showToast(`<strong>${buildTotal} XLM locked</strong> — project created!`, '🔒');
      setTimeout(() => go('project'), 1400);
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function openProject(id: number) { setActiveProjectId(id); setCarouselIdx(0); go('project'); }

  // ── Withdrawal modal ──────────────────────────────────────────────────────
  function openWithdrawModal(id: number) {
    const p = projects.find(proj => proj.id === id);
    if (!p) return;
    if (!p.milestones.every(m => m.status === 'created')) {
      return showToast('Cannot withdraw — freelancer has already started work', '⚠');
    }
    setWithdrawProjectId(id);
    setWithdrawReason('');
    setModalWithdraw(true);
  }

  async function confirmWithdraw() {
    if (!withdrawProjectId) return;
    if (!withdrawReason.trim()) return showToast('A reason is required to withdraw a project.', '⚠');
    const p = projects.find(proj => proj.id === withdrawProjectId);
    if (!p) return;
    setLoading(true);
    try {
      const { signTx } = await import('@/lib/wallet');
      const { deleteProject } = await import('@/lib/db');
      if (p.tx) {
        const { cancelProjectBatch } = await import('@/lib/contract');
        await cancelProjectBatch(wallet, p.milestones.map(ms => ms.id), signTx);
      }
      await deleteProject(withdrawProjectId);
      setProjects(prev => prev.filter(proj => proj.id !== withdrawProjectId));
      setManageMode(false);
      setModalWithdraw(false);
      setWithdrawProjectId(null);
      setWithdrawReason('');
      showToast(p.tx ? 'Project withdrawn — XLM refunded.' : 'Project withdrawn.', '✅');
    } catch (err: unknown) {
      showToast((err as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Inline project-page actions ───────────────────────────────────────────
  async function inlineStartWork(m: MilestoneData) {
    const p = projects.find(proj => proj.id === m.projId);
    if (!p) return;
    patchMilestoneInProject(p.id, m.id, { status: 'progress' });
    addTimelineToProject(p.id, 'done', `<strong>Work started</strong> on "${m.name}"`);
    showToast(`${m.name} — work started`, '⚙️');
    try {
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'progress' });
      await addTimeline(p.id, 'done', `<strong>Work started</strong> on "${m.name}"`);
    } catch { showToast('Sync failed — refresh to reload', '⚠'); }
  }

  async function inlineApproveMs(m: MilestoneData) {
    const p = projects.find(proj => proj.id === m.projId);
    if (!p) return;
    setLoading(true);
    try {
      const { confirmDelivery } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await confirmDelivery(wallet, m.id, signTx);
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'released' });
      await addTimeline(p.id, 'done', `<strong>${m.amount} XLM released</strong> — client approved "${m.name}"`);
      patchMilestoneInProject(p.id, m.id, { status: 'released' });
      addTimelineToProject(p.id, 'done', `<strong>${m.amount} XLM released</strong> — client approved "${m.name}"`);
      showToast(`${m.amount} XLM released to freelancer`, '✅');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function inlineClaimMs(m: MilestoneData) {
    const p = projects.find(proj => proj.id === m.projId);
    if (!p || m.timerSecs > 0) return;
    setLoading(true);
    try {
      const { claimPayment } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await claimPayment(wallet, m.id, signTx);
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'released' });
      await addTimeline(p.id, 'done', `<strong>${m.amount} XLM auto-released</strong> — deadline passed`);
      patchMilestoneInProject(p.id, m.id, { status: 'released' });
      addTimelineToProject(p.id, 'done', `<strong>${m.amount} XLM auto-released</strong> — claimed after deadline`);
      showToast(`${m.amount} XLM claimed — auto-release`, '💸');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  function openSubmitModal(m: MilestoneData) { setActiveMilestoneId(m.id); setModalSubmit(true); }
  function openRevisionModal(m: MilestoneData) { setActiveMilestoneId(m.id); setModalRevision(true); }
  function openDisputeModal(m: MilestoneData) { setActiveMilestoneId(m.id); setModalDispute(true); }

  // ── Modal confirm actions ─────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeMilestoneId) return;
    setUploadingFile(true);
    try {
      const { uploadProofFile } = await import('@/lib/db');
      const url = await uploadProofFile(file, activeMilestoneId);
      setProofFileUrl(url);
      setProofFileName(file.name);
      showToast('File uploaded', '📎');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setUploadingFile(false);
    }
  }

  async function confirmSubmit() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    if (!proofLink.trim() && !proofFileUrl) return showToast('Please provide a delivery link or attach a file.', '⚠');
    const expiresAt = new Date(Date.now() + m.timerMax * 1000).toISOString();
    const link = proofLink || proofFileUrl || '';
    setLoading(true);
    try {
      // Always call mark_complete on-chain. For re-submissions after revision,
      // request_revision reset completed=false, so mark_complete is needed again.
      const isResubmission = m.status === 'revision';
      const { markComplete } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await markComplete(wallet, m.id, signTx);
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'review', review_expires_at: expiresAt, proof_link: proofLink, proof_file_url: proofFileUrl });
      await addTimeline(p.id, 'done', `<strong>${isResubmission ? 'Re-submitted' : 'Milestone submitted'}</strong> — "${m.name}". Proof: ${link || 'No link'}`);
      patchMilestoneInProject(p.id, m.id, { status: 'review', proofLink, proofFileUrl, timerSecs: m.timerMax });
      addTimelineToProject(p.id, 'done', `<strong>${isResubmission ? 'Re-submitted' : 'Milestone submitted'}</strong> — "${m.name}". Proof: ${link || 'No link'}`);
      setModalSubmit(false);
      setProofLink(''); setProofFileUrl(''); setProofFileName('');
      showToast(`<strong>${m.name} ${isResubmission ? 're-submitted' : 'submitted'}</strong> — client review window started`, '📤');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function confirmRevision() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    const feePaid   = parseFloat((m.amount * revFeePercent / 100).toFixed(7));
    const remaining = parseFloat((m.amount - feePaid).toFixed(7));
    setLoading(true);
    try {
      const { requestRevision } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await requestRevision(wallet, m.id, feePaid, signTx);
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, {
        status: 'revision', rev_fee: feePaid,
        rev_feedback: revFeedback || 'Client requested changes.',
        review_expires_at: null, amount: remaining,
      });
      await addTimeline(p.id, 'act', `<strong>Revision requested</strong> on "${m.name}" — ${feePaid} XLM paid to freelancer.`);
      patchMilestoneInProject(p.id, m.id, { status: 'revision', revFee: feePaid, revFeedback: revFeedback || 'Client requested changes.', timerSecs: 0, amount: remaining });
      addTimelineToProject(p.id, 'act', `<strong>Revision requested</strong> on "${m.name}" — ${feePaid} XLM paid to freelancer`);
      showToast(`${feePaid} XLM sent to freelancer — revision started`, '🔁');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setModalRevision(false); setRevFeedback(''); setRevFeePercent(20);
      setLoading(false);
    }
  }

  async function confirmDispute() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    if (!disputeReason.trim()) return showToast('Please provide a reason for the dispute.', '⚠');
    setLoading(true);
    try {
      const { raiseDispute } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await raiseDispute(wallet, m.id, signTx);
      const { updateMsStatus, addTimeline, createDispute } = await import('@/lib/db');
      await createDispute(m.id, p.id, wallet, role ?? 'client', disputeReason.trim(), disputeEvidenceLink.trim() || undefined, undefined, undefined);
      await updateMsStatus(m.id, { status: 'disputed', review_expires_at: null });
      await addTimeline(p.id, 'act', `<strong>Dispute raised</strong> on "${m.name}" by ${role}. Reason: ${disputeReason.trim()}`);
      patchMilestoneInProject(p.id, m.id, { status: 'disputed', timerSecs: 0 });
      addTimelineToProject(p.id, 'act', `<strong>Dispute raised</strong> on "${m.name}" — funds frozen`);
      showToast('Dispute raised on-chain — admin notified', '⚠');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setModalDispute(false);
      setDisputeReason(''); setDisputeEvidenceLink('');
      setLoading(false);
    }
  }

  async function adminResolve(dispute: AdminDispute, action: 'freelancer' | 'refund') {
    const ms = dispute.milestones;
    const proj = ms.projects;
    setLoading(true);
    try {
      const { signTx } = await import('@/lib/wallet');
      const { resolveDisputeDb, loadProjectMilestones, deleteProject } = await import('@/lib/db');
      if (action === 'freelancer') {
        const { resolveDispute } = await import('@/lib/contract');
        await resolveDispute(wallet, dispute.milestone_id, proj.freelancer_wallet, signTx);
        await resolveDisputeDb(dispute.milestone_id, 'freelancer', 'released');
        showToast('Funds released to freelancer — project continues', '✅');
        setAdminDisputes(prev => prev.filter(d => d.id !== dispute.id));
      } else {
        const { adminCancelMilestone } = await import('@/lib/contract');
        const allMs = await loadProjectMilestones(dispute.project_id);
        for (const m of allMs) {
          if (m.status !== 'released') {
            await adminCancelMilestone(wallet, m.id, signTx);
          }
        }
        await deleteProject(dispute.project_id);
        showToast('Project cancelled — all funds refunded to client. Client must refresh their dashboard.', '✅');
        setAdminDisputes(prev => prev.filter(d => d.id !== dispute.id));
      }
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared button style helper ────────────────────────────────────────────
  const disconnectBtnStyle: React.CSSProperties = {
    background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 6,
    color: 'var(--ink3)', fontSize: 11, fontFamily: 'var(--mono)',
    padding: '5px 12px', cursor: 'pointer',
  };

  // ── Render: Connect ───────────────────────────────────────────────────────
  function renderConnect() {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">M</div>
          <div className="login-title">MilestonePay</div>
          <div className="login-sub">Anti-ghosting payment system for freelancers.<br />Lock funds. Deliver work. Get paid.</div>
          <button className="wallet-connect-btn" onClick={doConnect} disabled={loading}>
            {loading ? <><span className="spinner" /> Connecting...</> : <><span>👛</span><span>Connect Freighter Wallet</span></>}
          </button>
          <div className="login-hint">
            Don&apos;t have Freighter? <a href="https://freighter.app" target="_blank" rel="noreferrer">Install here →</a>
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
            Stellar Testnet · XLM · Soroban Smart Contracts
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Name page ─────────────────────────────────────────────────────
  function renderName() {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">👤</div>
          <div className="login-title">What&apos;s your name?</div>
          <div className="login-sub" style={{ marginBottom: 28 }}>
            This is how others will see you on MilestonePay.
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--purple)', marginBottom: 20, background: 'var(--purpledim)', border: '1px solid var(--bdrm)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
            {short(wallet)}
          </div>
          <div className="fg" style={{ marginBottom: 0, textAlign: 'left' }}>
            <label className="fl">Your Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="fi"
              type="text"
              placeholder="e.g. Alfred Santos"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
              autoFocus
            />
            <div className="fhint">Enter your first name or display name</div>
          </div>
          <button className="btn btn-primary" onClick={saveName} disabled={loading || !nameInput.trim()}>
            {loading ? <><span className="spinner" /> Saving...</> : 'Continue →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Role ──────────────────────────────────────────────────────────
  function renderRole() {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ maxWidth: 500 }}>
          <div className="login-logo">M</div>
          <div className="login-title">Welcome{userName ? `, ${userName}` : ''}!</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--purple)', marginBottom: 8 }}>{short(wallet)}</div>
          <div className="login-sub">How will you use MilestonePay?</div>
          <div className="role-grid">
            <button className="role-card" onClick={() => selectRole('client')} disabled={loading}>
              <div className="role-icon">🏢</div>
              <div className="role-title">I&apos;m a Client</div>
              <div className="role-desc">I have projects that need to be done. I&apos;ll lock XLM and hire freelancers.</div>
            </button>
            <button className="role-card" onClick={() => selectRole('freelancer')} disabled={loading}>
              <div className="role-icon">💼</div>
              <div className="role-title">I&apos;m a Freelancer</div>
              <div className="role-desc">I deliver work for clients and receive guaranteed payments through escrow.</div>
            </button>
          </div>
          {loading && <div style={{ fontSize: 13, color: 'var(--ink3)' }}><span className="spinner spinner-dark" /> Saving...</div>}
        </div>
      </div>
    );
  }

  // ── Render: Dashboard ─────────────────────────────────────────────────────
  function renderDashboard() {
    const isClient = role === 'client';
    const allMs = projects.flatMap(p => p.milestones);
    const pendingAmt = allMs.filter(m => m.status !== 'released' && m.status !== 'disputed').reduce((s, m) => s + m.amount, 0);
    const releasedAmt = allMs.filter(m => m.status === 'released').reduce((s, m) => s + m.amount, 0);
    const reviewCount = allMs.filter(m => m.status === 'review').length;
    const counterpartySet = new Set(projects.map(p => isClient ? p.freelancerWallet : p.clientWallet));

    const allTimeline = projects.flatMap(p => p.timeline.map(t => ({ ...t, projName: p.name }))).slice(0, 30);

    const filterTabs: { key: typeof dashFilter; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'not_started', label: 'Not Started' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'for_review', label: 'For Review' },
      { key: 'for_revision', label: 'For Revision' },
      { key: 'done', label: 'Done' },
    ];

    const filtered = projects.filter(p => {
      const matchSearch = !dashSearch.trim() || p.name.toLowerCase().includes(dashSearch.toLowerCase());
      const matchFilter = dashFilter === 'all' || projStatus(p) === dashFilter;
      return matchSearch && matchFilter;
    });
    const totalPages = Math.ceil(filtered.length / DASH_PER_PAGE);
    const safePage = Math.min(dashPage, Math.max(0, totalPages - 1));
    const pageProjects = filtered.slice(safePage * DASH_PER_PAGE, (safePage + 1) * DASH_PER_PAGE);

    const psLabel: Record<string, string> = {
      not_started: 'Not Started', in_progress: 'In Progress',
      for_review: 'For Review', for_revision: 'For Revision', done: 'Done',
    };
    const psColor: Record<string, string> = {
      not_started: 'var(--ink3)', in_progress: 'var(--purple)',
      for_review: '#92400E', for_revision: '#92400E', done: 'var(--green)',
    };
    const psBg: Record<string, string> = {
      not_started: 'rgba(155,142,196,0.1)', in_progress: 'var(--purpledim)',
      for_review: 'var(--amberdim)', for_revision: 'rgba(245,158,11,0.08)', done: 'var(--greendim)',
    };

    return (
      <div className="page active">
        <div style={{ marginBottom: 28 }}>
          <div className="eyebrow">{isClient ? 'Client Dashboard' : 'Freelancer Dashboard'}</div>
          <div className="h1">Hello{userName ? `, ${userName}` : ''} 👋</div>
          <div className="sub">{isClient ? 'Manage your projects and track payment milestones.' : 'Track your assigned projects and earn guaranteed pay.'}</div>
        </div>

        <div className="dash-layout">
          {/* Left column */}
          <div>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">{isClient ? 'Total Locked' : 'Pending Earnings'}</div>
                <div className="stat-val" style={{ color: 'var(--amber)' }}>{pendingAmt.toFixed(0)}</div>
                <div className="stat-sub">XLM in escrow</div>
              </div>
              <div className="stat">
                <div className="stat-label">{isClient ? 'Released' : 'Earned'}</div>
                <div className="stat-val" style={{ color: 'var(--green)' }}>{releasedAmt.toFixed(0)}</div>
                <div className="stat-sub">XLM {isClient ? 'paid out' : 'received'}</div>
              </div>
              <div className="stat">
                <div className="stat-label">{isClient ? 'Under Review' : 'Awaiting Review'}</div>
                <div className="stat-val" style={{ color: 'var(--purple)' }}>{reviewCount}</div>
                <div className="stat-sub">{reviewCount === 1 ? 'milestone' : 'milestones'}</div>
              </div>
              <div className="stat">
                <div className="stat-label">{isClient ? 'Freelancers' : 'Clients'}</div>
                <div className="stat-val" style={{ color: 'var(--ink)' }}>{counterpartySet.size}</div>
                <div className="stat-sub">{isClient ? 'hired' : 'working with'}</div>
              </div>
            </div>

            {/* Section heading */}
            <div className="sec-hd">
              <div className="h2">{isClient ? 'Projects' : 'Assigned Projects'}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={refreshProjects} title="Refresh projects" style={{
                  background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 8,
                  color: 'var(--ink3)', fontSize: 14, padding: '5px 10px', cursor: 'pointer',
                }}>↻</button>
                {isClient && (
                  <button className="btn btn-primary btn-primary-auto btn-sm" style={{ marginTop: 0 }} onClick={() => go('create')}>+ New Project</button>
                )}
                {isClient && projects.length > 0 && (
                  <button onClick={() => setManageMode(m => !m)} style={{
                    background: manageMode ? 'var(--reddim)' : 'var(--surf)',
                    border: `1.5px solid ${manageMode ? 'var(--red)' : 'var(--bdrm)'}`,
                    borderRadius: 8, color: manageMode ? 'var(--red)' : 'var(--ink3)',
                    fontSize: 12, fontFamily: 'var(--mono)', padding: '6px 12px', cursor: 'pointer',
                  }}>{manageMode ? 'Done' : 'Manage'}</button>
                )}
              </div>
            </div>

            {projects.length > 0 && (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input className="fi" type="text" placeholder="Search projects..."
                  value={dashSearch} onChange={e => { setDashSearch(e.target.value); setDashPage(0); }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {filterTabs.map(({ key, label }) => {
                    const active = dashFilter === key;
                    return (
                      <button key={key} onClick={() => { setDashFilter(key); setDashPage(0); }} style={{
                        background: active ? 'var(--purple)' : 'var(--surf)',
                        border: `1.5px solid ${active ? 'var(--purple)' : 'var(--bdrm)'}`,
                        borderRadius: 20, color: active ? '#fff' : 'var(--ink3)',
                        fontSize: 11, fontFamily: 'var(--mono)', padding: '5px 13px', cursor: 'pointer',
                        boxShadow: active ? '0 2px 8px var(--purpleglow)' : 'none',
                        transition: 'all .15s',
                      }}>{label}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {projects.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">{isClient ? '📭' : '🔍'}</div>
                <div className="empty-ttl">{isClient ? 'No projects yet' : 'No projects assigned'}</div>
                <div>{isClient ? 'Create a project to get started.' : 'When a client assigns your wallet to a project, it appears here.'}</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">🔍</div>
                <div className="empty-ttl">No projects match</div>
                <div>Try a different filter or clear the search.</div>
              </div>
            ) : (<>
              {pageProjects.map(p => {
              const total = p.milestones.reduce((s, m) => s + m.amount, 0);
              const done = p.milestones.filter(m => m.status === 'released').length;
              const ps = projStatus(p);
              return (
                <div className="proj-card" key={p.id}
                  onClick={() => !manageMode && openProject(p.id)}
                  style={{ cursor: manageMode ? 'default' : 'pointer', marginBottom: 10 }}>
                  <div className="proj-icon">📁</div>
                  <div style={{ flex: 1 }}>
                    <div className="proj-name">{p.name}</div>
                    <div className="proj-meta">
                      {p.milestones.length} milestones ·{' '}
                      {isClient ? `Freelancer: ${short(p.freelancerWallet)}` : `Client: ${short(p.clientWallet)}`}
                    </div>
                    {p.projectDeadline && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        Deadline: {fmtDate(p.projectDeadline)}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <span style={{
                        fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                        color: psColor[ps], background: psBg[ps],
                        border: `1px solid ${psColor[ps]}33`,
                        borderRadius: 10, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.04em',
                      }}>{psLabel[ps]}</span>
                    </div>
                  </div>
                  <div className="proj-right">
                    <div className="proj-amt">{total} XLM</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 3 }}>{done}/{p.milestones.length} done</div>
                    {manageMode && isClient && (
                      <button
                        onClick={e => { e.stopPropagation(); openWithdrawModal(p.id); }}
                        disabled={loading || !p.milestones.every(m => m.status === 'created')}
                        style={{
                          marginTop: 8, background: 'var(--reddim)', border: '1px solid var(--red)',
                          borderRadius: 5, color: 'var(--red)', fontSize: 11, fontFamily: 'var(--mono)',
                          padding: '3px 10px', cursor: 'pointer',
                          opacity: p.milestones.every(m => m.status === 'created') ? 1 : 0.4,
                        }}
                      >{p.tx ? '🔓 withdraw & refund' : '✕ withdraw'}</button>
                    )}
                  </div>
                </div>
              );
            })}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '0 2px' }}>
                  <button onClick={() => setDashPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={{
                    background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 8,
                    color: safePage === 0 ? 'var(--ink3)' : 'var(--purple)', fontSize: 12,
                    fontFamily: 'var(--mono)', padding: '6px 14px', cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                    opacity: safePage === 0 ? 0.4 : 1,
                  }}>← Prev</button>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>
                    {safePage + 1} / {totalPages}
                  </span>
                  <button onClick={() => setDashPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} style={{
                    background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 8,
                    color: safePage >= totalPages - 1 ? 'var(--ink3)' : 'var(--purple)', fontSize: 12,
                    fontFamily: 'var(--mono)', padding: '6px 14px', cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: safePage >= totalPages - 1 ? 0.4 : 1,
                  }}>Next →</button>
                </div>
              )}
            </>)}
          </div>

          {/* Right sidebar: transaction history — no horizontal scroll */}
          <div className="sidebar" style={{ maxHeight: 640, overflowY: 'auto', overflowX: 'hidden' }}>
            <div className="clabel">History of Transactions</div>
            {allTimeline.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No activity yet.</div>
            ) : (
              <div className="tl">
                {allTimeline.map((t, i) => (
                  <div className="tl-item" key={i}>
                    <div className={`tl-dot ${t.dot}`} />
                    <div className="tl-time">{t.time} · {t.projName}</div>
                    <div className="tl-text" dangerouslySetInnerHTML={{ __html: t.text }}
                      style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Create ────────────────────────────────────────────────────────
  function renderCreate() {
    return (
      <div className="page active">
        <div className="back" onClick={() => go('dashboard')}>← Back to Dashboard</div>
        <div className="eyebrow">New Project</div>
        <div className="h1">Lock funds,<br />guarantee payment.</div>
        <div className="sub" style={{ marginBottom: 32 }}>Set milestones, enter the freelancer&apos;s wallet, and lock XLM before work begins.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
          <div>
            <div className="card">
              <div className="clabel">Project Details</div>
              <div className="fg">
                <label className="fl">Project Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" type="text" placeholder="e.g. Brand Identity Redesign"
                  value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Your Wallet (Client)</label>
                <input className="fi" type="text" value={wallet} readOnly style={{ opacity: .6, cursor: 'not-allowed' }} />
                <div className="fhint">Auto-filled from your connected Freighter wallet</div>
              </div>
              <div className="fg">
                <label className="fl">Freelancer&apos;s Stellar Wallet Address <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" type="text" placeholder="G... (ask your freelancer for their Stellar public key)"
                  value={formFreelancerWallet} onChange={e => setFormFreelancerWallet(e.target.value)} />
                <div className="fhint">Funds release to this address on approval or deadline</div>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Project Deadline <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" type="date" value={formProjectDeadline}
                  onChange={e => setFormProjectDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} />
                <div className="fhint">Overall project deadline shown to both parties. Different from the per-milestone auto-release window.</div>
              </div>
            </div>

            <div className="card">
              <div className="clabel">Milestones</div>
              <div className="ms-build-headers">
                <span>Title</span><span>Description</span><span>XLM</span><span></span>
              </div>
              {buildList.map(m => (
                <div className="ms-build-row" key={m.id}>
                  <input type="text" placeholder="Milestone title..." value={m.title}
                    onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, title: e.target.value } : x))} />
                  <input type="text" placeholder="Short description..." value={m.desc}
                    onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, desc: e.target.value } : x))} />
                  <div className="amt-wrap">
                    <span className="amt-pre">XLM</span>
                    <input type="number" className="amt-in" value={m.amount} min={1}
                      onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, amount: Number(e.target.value) } : x))} />
                  </div>
                  <button className="rm-btn" onClick={() => removeBuildMs(m.id)}>×</button>
                </div>
              ))}
              <button className="add-ms-btn" onClick={addBuildMs}>+ Add milestone</button>
              <div className="total-bar">
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Total to lock in escrow</span>
                <div><span className="total-val">{buildTotal}</span><span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 4 }}>XLM</span></div>
              </div>
            </div>

            <div className="card">
              <div className="clabel">Auto-Release Window (per milestone)</div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Release funds after freelancer submits milestone</label>
                <select className="fi" value={formDeadline} onChange={e => setFormDeadline(Number(e.target.value))}>
                  <option value={172800}>48 hours (recommended)</option>
                  <option value={86400}>24 hours</option>
                  <option value={259200}>72 hours</option>
                </select>
                <div className="fhint">You have this window to approve, request revision, or dispute before auto-release</div>
              </div>
            </div>

            <button className="btn btn-primary" onClick={lockProject} disabled={loading}>
              {loading ? <><span className="spinner" /> Locking on-chain...</> : <>🔒 Lock {buildTotal} XLM into Escrow</>}
            </button>
          </div>

          <div className="sidebar">
            <div className="clabel">Contract Preview</div>
            <div className="escrow-box">
              <div className="escrow-lbl">Funds to Lock</div>
              <div><span className="escrow-amt">{buildTotal}</span><span className="escrow-unit">XLM</span></div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--purple)', marginTop: 4 }}>⬡ Stellar Testnet</div>
            </div>
            {buildList.map(m => (
              <div className="srow" key={m.id}><span className="slbl">{m.title || 'Untitled'}</span><span className="sval">{m.amount} XLM</span></div>
            ))}
            <div className="div" />
            <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(formFreelancerWallet) || '—'}</span></div>
            {formProjectDeadline && <div className="srow"><span className="slbl">Project deadline</span><span className="sval">{fmtDate(formProjectDeadline) ?? '—'}</span></div>}
            <div className="srow"><span className="slbl">Auto-release</span><span className="sval">{DL_LABEL[formDeadline]}</span></div>
            <div className="srow"><span className="slbl">Wire fee</span><span className="sval" style={{ color: 'var(--green)' }}>&lt;$0.01</span></div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Project ───────────────────────────────────────────────────────
  function renderProject() {
    const p = activeProject;
    if (!p) return null;
    const total = p.milestones.reduce((s, m) => s + m.amount, 0);
    const released = p.milestones.filter(m => m.status === 'released').reduce((s, m) => s + m.amount, 0);

    const groups: { key: string; label: string; milestones: MilestoneData[] }[] = [
      { key: 'not_started', label: 'Not Started', milestones: p.milestones.filter(m => m.status === 'created') },
      { key: 'in_progress', label: 'In Progress', milestones: p.milestones.filter(m => m.status === 'progress') },
      { key: 'for_review', label: 'For Review', milestones: p.milestones.filter(m => m.status === 'review' || m.status === 'disputed') },
      { key: 'for_revision', label: 'Need Revision', milestones: p.milestones.filter(m => m.status === 'revision') },
      { key: 'done', label: 'Done', milestones: p.milestones.filter(m => m.status === 'released') },
    ].filter(g => g.milestones.length > 0);

    return (
      <div className="page active">
        <div className="back" onClick={() => go('dashboard')}>← Back to Dashboard</div>

        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Project</div>
          <div className="h1">{p.name}</div>
          <div className="sub">
            {isProjectClient ? `Freelancer: ${short(p.freelancerWallet, 8, 4)}` : `Client: ${short(p.clientWallet, 8, 4)}`}
            {' · '}{p.milestones.length} milestones · {total} XLM
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
          {/* Left: grouped milestones with inline actions */}
          <div>
            {groups.map(group => (
              <div key={group.key} style={{ marginBottom: 28 }}>
                <div className="ms-group-hd">{group.label} ({group.milestones.length})</div>
                {group.milestones.map((m) => {
                  const allIdx = p.milestones.indexOf(m);
                  const timerExpired = m.status === 'review' && m.timerSecs <= 0;
                  const timerPct = m.timerMax > 0 ? Math.max(0, (m.timerSecs / m.timerMax) * 100) : 0;
                  return (
                    <div className="ms-row" key={m.id} style={{ cursor: 'default' }}>
                      <div className="ms-top">
                        <div style={{ flex: 1 }}>
                          <div className="ms-num">MILESTONE {String(allIdx + 1).padStart(2, '0')}</div>
                          <div className="ms-name">{m.name}</div>
                          {m.desc && <div className="ms-desc">{m.desc}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                          <div className="ms-amt">{m.amount}<span className="ms-amt-unit">XLM</span></div>
                          <div style={{ marginTop: 4 }}>
                            <span className={`badge ${m.status}`}><span className="bd" />{STATUS_LABEL[m.status]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Proof link for client on review */}
                      {m.status === 'review' && isProjectClient && (m.proofLink || m.proofFileUrl) && (
                        <div style={{ margin: '10px 0 4px', background: 'var(--surf2)', border: '1px solid var(--bdrm)', borderRadius: 8, padding: '8px 12px', fontSize: 12, wordBreak: 'break-all' }}>
                          📎 Proof:{' '}
                          {m.proofLink && <a href={m.proofLink} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>{m.proofLink}</a>}
                          {m.proofFileUrl && <a href={m.proofFileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)', marginLeft: 6 }}>[File]</a>}
                        </div>
                      )}

                      {/* Timer */}
                      {m.status === 'review' && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: timerExpired ? '#047857' : '#92400E', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                              {timerExpired ? 'DEADLINE REACHED' : 'AUTO-RELEASE IN'}
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: timerExpired ? 'var(--green)' : '#92400E' }}>
                              {timerExpired ? '00:00:00' : fmt(m.timerSecs)}
                            </span>
                          </div>
                          <div className="timer-bar-wrap">
                            <div className="timer-bar" style={{ width: `${timerPct}%`, background: timerExpired ? 'var(--green)' : 'var(--amber)' }} />
                          </div>
                        </div>
                      )}

                      {/* Revision info */}
                      {m.status === 'revision' && (
                        <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, color: '#92400E', marginBottom: 6 }}>{m.revFeedback || 'Client requested changes.'}</div>
                          <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--mono)' }}>
                            <span style={{ color: 'var(--ink3)' }}>Paid: <strong style={{ color: 'var(--purple)' }}>{m.revFee} XLM</strong></span>
                            <span style={{ color: 'var(--ink3)' }}>Remaining: <strong style={{ color: 'var(--green)' }}>{m.amount} XLM</strong></span>
                          </div>
                        </div>
                      )}

                      {/* Inline actions */}
                      <div style={{ marginTop: 12 }}>
                        {/* FREELANCER */}
                        {m.status === 'created' && isProjectFreelancer && (
                          <div className="action-row">
                            <button className="btn btn-outline btn-sm" onClick={() => inlineStartWork(m)}>▶ Start Work</button>
                          </div>
                        )}
                        {(m.status === 'progress' || m.status === 'revision') && isProjectFreelancer && (
                          <div className="action-row">
                            <button className="btn btn-amber btn-sm" onClick={() => openSubmitModal(m)}>
                              📤 {m.status === 'revision' ? 'Re-submit' : 'Submit for Review'}
                            </button>
                          </div>
                        )}
                        {m.status === 'review' && isProjectFreelancer && (
                          <div className="action-row">
                            {timerExpired ? (
                              <button className="btn btn-green btn-sm" onClick={() => inlineClaimMs(m)} disabled={loading}>
                                {loading ? <span className="spinner" /> : '↓ Claim Payment'}
                              </button>
                            ) : (
                              <button className="btn btn-red btn-sm" onClick={() => openDisputeModal(m)} disabled={loading}>⚠ Dispute</button>
                            )}
                          </div>
                        )}

                        {/* CLIENT */}
                        {m.status === 'created' && isProjectClient && (
                          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Waiting for freelancer to start work.</div>
                        )}
                        {m.status === 'progress' && isProjectClient && (
                          <div style={{ fontSize: 12, color: 'var(--purple)' }}>⚙️ Freelancer is working on this milestone.</div>
                        )}
                        {m.status === 'review' && isProjectClient && !timerExpired && (
                          <div className="action-row">
                            <button className="btn btn-green btn-sm" onClick={() => inlineApproveMs(m)} disabled={loading}>
                              {loading ? <span className="spinner" /> : '✓ Approve & Release'}
                            </button>
                            <button className="btn btn-amber btn-sm" onClick={() => openRevisionModal(m)} disabled={loading}>🔁 Revision</button>
                            <button className="btn btn-red btn-sm" onClick={() => openDisputeModal(m)} disabled={loading}>⚠ Dispute</button>
                          </div>
                        )}
                        {m.status === 'review' && isProjectClient && timerExpired && (
                          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Deadline passed — freelancer can claim payment.</div>
                        )}
                        {m.status === 'revision' && isProjectClient && (
                          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>🔁 Waiting for freelancer to re-submit.</div>
                        )}

                        {/* Terminal states */}
                        {m.status === 'released' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#047857' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', flexShrink: 0 }} />
                            {m.amount} XLM released to freelancer
                          </div>
                        )}
                        {m.status === 'disputed' && (
                          <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ Dispute active — admin is reviewing. Funds frozen.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {p.milestones.length === 0 && (
              <div className="empty"><div className="empty-ico">📋</div><div className="empty-ttl">No milestones</div></div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="sidebar">
            {p.projectDeadline && (
              <div style={{ marginBottom: 16, background: 'rgba(114,27,254,0.06)', border: '1.5px solid var(--bdrm)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Project Deadline</div>
                <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{fmtDate(p.projectDeadline)}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                  {new Date(p.projectDeadline) > new Date()
                    ? `${Math.ceil((new Date(p.projectDeadline).getTime() - Date.now()) / 86400000)} days remaining`
                    : 'Deadline passed'}
                </div>
              </div>
            )}

            <div className="escrow-box">
              <div className="escrow-lbl">Remaining in Escrow</div>
              <div><span className="escrow-amt" style={{ fontSize: 24 }}>{total - released}</span><span className="escrow-unit">XLM</span></div>
            </div>
            <div className="srow"><span className="slbl">Total locked</span><span className="sval">{total} XLM</span></div>
            <div className="srow"><span className="slbl">Released</span><span className="sval" style={{ color: 'var(--green)' }}>{released} XLM</span></div>
            <div className="srow"><span className="slbl">Milestones</span><span className="sval">{p.milestones.filter(m => m.status === 'released').length}/{p.milestones.length} done</span></div>

            <div className="div" />
            <div className="clabel">On-Chain Activity</div>
            {p.timeline.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No activity yet.</div>
            ) : (
              <div className="tl" style={{ maxHeight: 280, overflowY: 'auto', overflowX: 'hidden' }}>
                {p.timeline.map((t, i) => (
                  <div className="tl-item" key={i}>
                    <div className={`tl-dot ${t.dot}`} />
                    <div className="tl-time">{t.time}</div>
                    <div className="tl-text" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                      dangerouslySetInnerHTML={{ __html: t.text }} />
                  </div>
                ))}
              </div>
            )}

            <div className="div" />
            <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={() => go('status')}>View Full Status →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Status (carousel) ─────────────────────────────────────────────
  function renderStatus() {
    const p = activeProject;
    if (!p) return null;
    const total = p.milestones.reduce((s, m) => s + m.amount, 0);
    const released = p.milestones.filter(m => m.status === 'released').reduce((s, m) => s + m.amount, 0);
    const disputes = p.milestones.filter(m => m.status === 'disputed').length;
    const ms = p.milestones;
    const idx = Math.min(carouselIdx, ms.length - 1);
    const cur = ms[idx];

    return (
      <div className="page active">
        <div className="back" onClick={() => go('project')}>← Back to Project</div>
        <div className="eyebrow">Status View</div>
        <div className="h1" style={{ marginBottom: 6 }}>{p.name}</div>
        <div className="sub" style={{ marginBottom: 28 }}>
          {isProjectClient ? `Freelancer: ${short(p.freelancerWallet, 8, 4)}` : `Client: ${short(p.clientWallet, 8, 4)}`} · {total} XLM total
        </div>

        {/* Carousel */}
        {ms.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            {/* Nav row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>
                Milestone {idx + 1} of {ms.length}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCarouselIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                  style={{ background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 8, color: idx === 0 ? 'var(--ink3)' : 'var(--purple)', fontSize: 14, padding: '6px 14px', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.5 : 1 }}>
                  ← Prev
                </button>
                <button onClick={() => setCarouselIdx(i => Math.min(ms.length - 1, i + 1))} disabled={idx === ms.length - 1}
                  style={{ background: 'var(--surf)', border: '1.5px solid var(--bdrm)', borderRadius: 8, color: idx === ms.length - 1 ? 'var(--ink3)' : 'var(--purple)', fontSize: 14, padding: '6px 14px', cursor: idx === ms.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === ms.length - 1 ? 0.5 : 1 }}>
                  Next →
                </button>
              </div>
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, justifyContent: 'center' }}>
              {ms.map((m, i) => (
                <button key={i} onClick={() => setCarouselIdx(i)} style={{
                  width: i === idx ? 20 : 8, height: 8, borderRadius: 4,
                  border: 'none', cursor: 'pointer',
                  background: i === idx ? 'var(--purple)' : 'var(--bdrm)',
                  transition: 'all .2s',
                  padding: 0,
                }} />
              ))}
            </div>

            {/* Current milestone card */}
            {cur && (() => {
              const sc = STATUS_SC[cur.status] ?? 's-created';
              return (
                <div className={`sc ${sc}`} style={{ maxWidth: '100%' }}>
                  <div className="sc-icon">{STATUS_ICON[cur.status]}</div>
                  <span className={`badge ${cur.status}`} style={{ marginBottom: 8 }}><span className="bd" />{STATUS_LABEL[cur.status]}</span>
                  <div className="sc-name" style={{ fontSize: 18 }}>{cur.name}</div>
                  {cur.desc && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4, marginBottom: 8 }}>{cur.desc}</div>}
                  <div className="sc-amt">{cur.amount} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>XLM</span></div>
                  <div style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--mono)' }}>
                    {cur.status === 'review' && cur.timerSecs > 0 && <span style={{ color: '#92400E' }}>{fmt(cur.timerSecs)} remaining</span>}
                    {cur.status === 'released' && <span style={{ color: 'var(--green)' }}>✅ Funds sent</span>}
                    {cur.status === 'disputed' && <span style={{ color: 'var(--red)' }}>⚠ Awaiting admin</span>}
                    {cur.status === 'revision' && cur.revFee > 0 && <span style={{ color: 'var(--purple)' }}>{cur.revFee} XLM paid as rev. fee</span>}
                    {(cur.status === 'created' || cur.status === 'progress') && <span style={{ color: 'var(--ink3)' }}>{STATUS_LABEL[cur.status]}</span>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
          <div className="card">
            <div className="clabel">On-Chain Activity</div>
            <div className="tl">
              {p.timeline.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No activity yet.</div>}
              {p.timeline.map((t, i) => (
                <div className="tl-item" key={i}>
                  <div className={`tl-dot ${t.dot}`} />
                  <div className="tl-time">{t.time}</div>
                  <div className="tl-text" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    dangerouslySetInnerHTML={{ __html: t.text }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="card">
              <div className="clabel">Contract Summary</div>
              <div className="escrow-box" style={{ marginBottom: 12 }}>
                <div className="escrow-lbl">Remaining in Escrow</div>
                <div><span className="escrow-amt" style={{ fontSize: 26 }}>{total - released}</span><span className="escrow-unit">XLM</span></div>
              </div>
              <div className="srow"><span className="slbl">Project</span><span className="sval">{p.name}</span></div>
              <div className="srow"><span className="slbl">Total locked</span><span className="sval">{total} XLM</span></div>
              <div className="srow"><span className="slbl">Released</span><span className="sval" style={{ color: 'var(--green)' }}>{released} XLM</span></div>
              {p.projectDeadline && <div className="srow"><span className="slbl">Deadline</span><span className="sval">{fmtDate(p.projectDeadline)}</span></div>}
              <div className="srow">
                <span className="slbl">{isProjectClient ? 'Freelancer' : 'Client'}</span>
                <span className="sval">{short(isProjectClient ? p.freelancerWallet : p.clientWallet, 8, 4)}</span>
              </div>
              <div className="srow"><span className="slbl">Disputes</span><span className="sval">{disputes > 0 ? `${disputes} active` : 'None'}</span></div>
            </div>
            {p.tx && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', marginTop: 12 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>TX</div>
                <a href={`https://stellar.expert/explorer/testnet/tx/${p.tx}`} target="_blank" rel="noreferrer"
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--purple)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title="View on stellar.expert">{p.tx}</a>
                <button onClick={() => { navigator.clipboard?.writeText(p.tx); showToast('TX hash copied', '⎘'); }}
                  style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12 }}>⎘</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Modals ────────────────────────────────────────────────────────
  function renderModalWithdraw() {
    if (!modalWithdraw || !withdrawProjectId) return null;
    const p = projects.find(proj => proj.id === withdrawProjectId);
    if (!p) return null;
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { setModalWithdraw(false); setWithdrawReason(''); } }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--red)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>Withdraw Project</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>{p.name}</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.6 }}>
            {p.tx
              ? <>This will refund <strong style={{ color: 'var(--green)' }}>{p.milestones.reduce((s, m) => s + m.amount, 0)} XLM</strong> back to your wallet and permanently close this project.</>
              : 'This will permanently remove this project.'}
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Reason for withdrawal <span style={{ color: 'var(--red)' }}>*</span></label>
            <textarea className="fi" rows={3} placeholder="Explain why you're withdrawing this project..."
              value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setModalWithdraw(false); setWithdrawReason(''); }}>Cancel</button>
            <button className="btn btn-red-solid" style={{ flex: 2 }} onClick={confirmWithdraw}
              disabled={loading || !withdrawReason.trim()}>
              {loading ? <span className="spinner" /> : p.tx ? '🔓 Withdraw & Refund XLM' : '✕ Withdraw Project'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderModalSubmit() {
    if (!modalSubmit) return null;
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalSubmit(false); }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--amber)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: '#92400E', textTransform: 'uppercase', marginBottom: 8 }}>Submit Milestone</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--ink)' }}>Upload Proof of Work</div>
          <div className="fg">
            <label className="fl">Delivery Link</label>
            <input className="fi" type="text" placeholder="Figma link, GitHub URL, Drive folder..."
              value={proofLink} onChange={e => setProofLink(e.target.value)} />
            <div className="fhint">Share a link to your deliverables</div>
          </div>
          <label className="proof-area" style={{ display: 'block', cursor: 'pointer' }}>
            <div className="proof-icon">📎</div>
            {uploadingFile
              ? <div style={{ fontSize: 13, color: '#92400E' }}><span className="spinner spinner-dark" /> Uploading...</div>
              : proofFileName
                ? <div style={{ fontSize: 13, color: 'var(--green)' }}>✅ {proofFileName}</div>
                : <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Click to attach a file (optional)</div>}
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, fontFamily: 'var(--mono)' }}>PNG, PDF, ZIP, MP4 · max 20MB</div>
            <input type="file" style={{ display: 'none' }} onChange={handleFileChange} accept=".png,.jpg,.jpeg,.pdf,.zip,.mp4,.mov,.fig,.sketch" />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalSubmit(false)}>Cancel</button>
            <button className="btn btn-amber" style={{ flex: 2 }} onClick={confirmSubmit} disabled={loading || uploadingFile}>
              {loading ? <><span className="spinner" /> Submitting...</> : 'Submit for Review →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderModalRevision() {
    const m = activeMilestone;
    if (!modalRevision || !m) return null;
    const feePaid   = parseFloat((m.amount * revFeePercent / 100).toFixed(2));
    const remaining = parseFloat((m.amount - feePaid).toFixed(2));
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalRevision(false); }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--purple)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 8 }}>Request Revision</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 6, color: 'var(--ink)' }}>Request Changes</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.6 }}>
            A revision fee is released from escrow to the freelancer <strong>immediately</strong>. The remainder stays locked and releases when you approve the resubmission.
          </div>
          <div className="fg">
            <label className="fl">Feedback</label>
            <textarea className="fi" rows={3} placeholder="Describe what needs to change..."
              value={revFeedback} onChange={e => setRevFeedback(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Revision Fee (% of milestone amount)</label>
            <select className="fi" value={revFeePercent} onChange={e => setRevFeePercent(Number(e.target.value))}>
              <option value={20}>20% — minor changes</option>
              <option value={35}>35% — moderate changes</option>
              <option value={50}>50% — major rework</option>
            </select>
          </div>
          <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--ink3)' }}>Paid to freelancer now</span>
              <span style={{ color: 'var(--purple)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{feePaid} XLM</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>Remaining in escrow (on approval)</span>
              <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{remaining} XLM</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalRevision(false)}>Cancel</button>
            <button className="btn btn-purple" style={{ flex: 2 }} onClick={confirmRevision} disabled={loading}>
              {loading ? <><span className="spinner" /> Paying fee...</> : `Pay ${feePaid} XLM & Request Revision`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderModalDispute() {
    if (!modalDispute) return null;
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { setModalDispute(false); setDisputeReason(''); setDisputeEvidenceLink(''); } }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--red)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>Raise a Dispute</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>Freeze Funds & Notify Admin</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.6 }}>
            Funds will be <strong style={{ color: '#92400E' }}>frozen</strong> and the timer stopped. An admin will review and decide the outcome.
          </div>
          <div className="fg">
            <label className="fl">Reason <span style={{ color: 'var(--red)' }}>*</span></label>
            <textarea className="fi" rows={3} placeholder="Describe the issue clearly..."
              value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Evidence Link <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(optional)</span></label>
            <input className="fi" type="text" placeholder="Link to your proof (GitHub, Drive, Figma, etc.)"
              value={disputeEvidenceLink} onChange={e => setDisputeEvidenceLink(e.target.value)} />
            <div className="fhint">Share one link to any relevant evidence</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setModalDispute(false); setDisputeReason(''); setDisputeEvidenceLink(''); }}>Cancel</button>
            <button className="btn btn-red-solid" style={{ flex: 2 }} onClick={confirmDispute} disabled={loading || !disputeReason.trim()}>
              {loading ? <span className="spinner" /> : '⚠ Raise Dispute On-Chain'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Admin ─────────────────────────────────────────────────────────
  function renderAdmin() {
    return (
      <div className="page active">
        <div className="eyebrow">Admin Panel</div>
        <div className="h1">Dispute Resolution</div>
        <div className="sub" style={{ marginBottom: 12 }}>Review disputed milestones and make a final decision. Your decision is irreversible.</div>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 24, fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
          ℹ️ A small Stellar network fee (~0.001 XLM) is charged per transaction to your admin wallet. This is unavoidable.
          After resolving a dispute with &quot;Refund &amp; Cancel&quot;, the client must <strong>refresh their dashboard</strong> to see the changes.
        </div>

        {adminDisputes.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">⚖️</div>
            <div className="empty-ttl">No active disputes</div>
            <div>All milestones are running smoothly.</div>
          </div>
        ) : adminDisputes.map(d => {
          const ms = d.milestones;
          const proj = ms.projects;
          return (
            <div className="card" key={d.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>⚠ Disputed</div>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{ms.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Project: {proj.name}</div>
                </div>
                <div className="escrow-box" style={{ minWidth: 110, textAlign: 'center', padding: '10px 14px' }}>
                  <div className="escrow-lbl">Amount</div>
                  <div><span className="escrow-amt" style={{ fontSize: 20 }}>{ms.amount}</span><span className="escrow-unit">XLM</span></div>
                </div>
              </div>
              <div className="div" style={{ marginBottom: 12 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div className="srow"><span className="slbl">Client</span><span className="sval">{short(proj.client_wallet, 8, 4)}</span></div>
                <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(proj.freelancer_wallet, 8, 4)}</span></div>
                <div className="srow"><span className="slbl">Raised by</span><span className="sval" style={{ textTransform: 'capitalize' }}>{d.raised_by_role} · {short(d.raised_by, 6, 4)}</span></div>
                <div className="srow"><span className="slbl">Filed</span><span className="sval">{new Date(d.created_at).toLocaleDateString()}</span></div>
              </div>
              <div style={{ background: 'var(--reddim)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Dispute Reason</div>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{d.reason}</div>
              </div>
              {(ms.proof_link || ms.proof_file_url || d.file_link) && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Evidence</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ms.proof_link && <a href={ms.proof_link} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>📎 Freelancer Proof</a>}
                    {ms.proof_file_url && <a href={ms.proof_file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>📁 Proof File</a>}
                    {d.file_link && <a href={d.file_link} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>🔗 Evidence</a>}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-green btn-sm" style={{ flex: 1 }} onClick={() => adminResolve(d, 'freelancer')} disabled={loading}>
                  {loading ? <span className="spinner" /> : '✓ Release to Freelancer'}
                </button>
                <button className="btn btn-red btn-sm" style={{ flex: 1 }} onClick={() => adminResolve(d, 'refund')} disabled={loading}>
                  {loading ? <span className="spinner" /> : '↩ Refund & Cancel Project'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 6 }}>
                Release → pays freelancer, project continues. Refund → all milestones returned to client, project closed.
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  const toastEl = (
    <div className={`toast${toast.show ? ' show' : ''}`}>
      <span className="t-icon">{toast.icon}</span>
      <div dangerouslySetInnerHTML={{ __html: toast.msg }} />
    </div>
  );

  // ── Root render ───────────────────────────────────────────────────────────
  if (page === 'connect') return <>{renderConnect()}{toastEl}</>;
  if (page === 'name') return <>{renderName()}{toastEl}</>;
  if (page === 'role') return <>{renderRole()}{toastEl}</>;

  if (isAdmin) return (
    <>
      <div className="wrap">
        <header className="topbar">
          <div className="logo" onClick={() => go('admin')}>
            <div className="logo-mark">M</div>
            <div>
              <div className="logo-name">MilestonePay</div>
              <div className="logo-tag">admin panel</div>
            </div>
          </div>
          <div className="topbar-right">
            <span className="role-badge" style={{ background: 'var(--reddim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)' }}>admin</span>
            <div className="wallet-chip"><div className="wdot" /><span>{short(wallet)}</span></div>
            <button onClick={doDisconnect} style={disconnectBtnStyle}>disconnect</button>
          </div>
        </header>
        {renderAdmin()}
      </div>
      {renderModalDispute()}{toastEl}
    </>
  );

  return (
    <>
      <div className="wrap">
        <header className="topbar">
          <div className="logo" onClick={() => go('dashboard')}>
            <div className="logo-mark">M</div>
            <div>
              <div className="logo-name">MilestonePay</div>
              <div className="logo-tag">anti-ghosting payments</div>
            </div>
          </div>
          <div className="topbar-right">
            <span className={`role-badge ${role}`}>{role}</span>
            <div className="wallet-chip"><div className="wdot" /><span>{short(wallet)}</span></div>
            <button onClick={doDisconnect} style={disconnectBtnStyle}>disconnect</button>
          </div>
        </header>

        {page === 'dashboard' && renderDashboard()}
        {page === 'create' && renderCreate()}
        {page === 'project' && renderProject()}
        {page === 'milestone' && renderMilestone()}
        {page === 'status' && renderStatus()}
        {page === 'admin' && renderAdmin()}
      </div>

      {toastEl}
      {renderModalWithdraw()}
      {renderModalSubmit()}
      {renderModalRevision()}
      {renderModalDispute()}
    </>
  );

  // ── renderMilestone (kept for backwards compatibility) ────────────────────
  function renderMilestone() {
    const p = activeProject;
    const m = activeMilestone;
    if (!p || !m) return null;
    const idx = p.milestones.indexOf(m);
    const timerPct = m.timerMax > 0 ? Math.max(0, (m.timerSecs / m.timerMax) * 100) : 0;
    const timerExpired = m.status === 'review' && m.timerSecs <= 0;

    return (
      <div className="page active">
        <div className="back" onClick={() => go('project')}>← Back to Project</div>
        <div className="detail-grid">
          <div>
            <div className="eyebrow">Milestone {String(idx + 1).padStart(2, '0')} · {p.name}</div>
            <div className="h1">{m.name}</div>
            <div className="sub" style={{ marginBottom: 16 }}>{m.desc || 'No description provided.'}</div>
            <div className="card">
              <div className="clabel">Status</div>
              <span className={`badge ${m.status}`}><span className="bd" />{STATUS_LABEL[m.status]}</span>
              {m.status === 'review' && (
                <div style={{ marginTop: 12 }}>
                  <div className="timer-block" style={timerExpired ? { borderColor: 'var(--green)' } : {}}>
                    <div className="timer-lbl" style={{ color: timerExpired ? '#047857' : '#92400E' }}>
                      {timerExpired ? 'DEADLINE REACHED' : 'AUTO-RELEASE IN'}
                    </div>
                    <div className="timer-val" style={{ color: timerExpired ? 'var(--green)' : '#92400E' }}>
                      {timerExpired ? '00:00:00' : fmt(m.timerSecs)}
                    </div>
                  </div>
                  <div className="timer-bar-wrap">
                    <div className="timer-bar" style={{ width: `${timerPct}%`, background: timerExpired ? 'var(--green)' : 'var(--amber)' }} />
                  </div>
                </div>
              )}
              {m.status === 'revision' && m.revFee > 0 && (
                <div className="rev-block" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#92400E', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Revision Requested</div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}>{m.revFeedback}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--ink3)' }}>Paid: </span><span style={{ color: 'var(--purple)', fontWeight: 700 }}>{m.revFee} XLM</span>
                    <span style={{ color: 'var(--ink3)', marginLeft: 12 }}>Remaining: </span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{m.amount} XLM</span>
                  </div>
                </div>
              )}
              {m.status === 'released' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', fontSize: 13, color: '#047857' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
                  {m.amount} XLM released to the freelancer&apos;s wallet.
                </div>
              )}
              {m.status === 'disputed' && (
                <div style={{ background: 'var(--reddim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, fontSize: 13, color: 'var(--red)', marginTop: 12 }}>
                  ⚠ Dispute active — funds frozen. Admin is reviewing.
                </div>
              )}
            </div>
          </div>
          <div className="sidebar">
            <div className="clabel">Milestone Info</div>
            <div className="escrow-box">
              <div className="escrow-lbl">Locked Amount</div>
              <div><span className="escrow-amt" style={{ fontSize: 26 }}>{m.amount}</span><span className="escrow-unit">XLM</span></div>
            </div>
            <div className="srow"><span className="slbl">Client</span><span className="sval">{short(p.clientWallet, 8, 4)}</span></div>
            <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(p.freelancerWallet, 8, 4)}</span></div>
            <div className="srow"><span className="slbl">Review window</span><span className="sval">{DL_LABEL[p.deadline] ?? `${p.deadline}s`}</span></div>
          </div>
        </div>
      </div>
    );
  }
}
