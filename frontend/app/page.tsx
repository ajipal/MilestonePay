'use client';

import { useState, useEffect, useRef } from 'react';
import type { PageName, UserRole, MsStatus, BuildMs, MilestoneData, Project, TimelineEntry } from '@/lib/types';

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

let buildUID = 2;

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth state ──
  const [page, setPage] = useState<PageName>('connect');
  const [wallet, setWallet] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);

  // ── Data state ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeMilestoneId, setActiveMilestoneId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Create form ──
  const [formName, setFormName] = useState('');
  const [formFreelancerWallet, setFormFreelancerWallet] = useState('');
  const [formDeadline, setFormDeadline] = useState(172800);
  const [buildList, setBuildList] = useState<BuildMs[]>(DEFAULT_BUILD);

  // ── Modal state ──
  const [modalSubmit, setModalSubmit] = useState(false);
  const [modalRevision, setModalRevision] = useState(false);
  const [modalDispute, setModalDispute] = useState(false);
  const [proofLink, setProofLink] = useState('');
  const [proofFileUrl, setProofFileUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [revFeedback, setRevFeedback] = useState('');
  const [revFeePercent, setRevFeePercent] = useState(20);

  // ── Toast ──
  const [toast, setToast] = useState({ show: false, msg: '', icon: '✅' });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Derived ──
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const activeMilestone = activeProject?.milestones.find(m => m.id === activeMilestoneId) ?? null;
  const isProjectClient = activeProject?.clientWallet === wallet;
  const isProjectFreelancer = activeProject?.freelancerWallet === wallet;

  // ── Auto-connect on mount (if Freighter was previously authorized) ──────────
  useEffect(() => {
    async function checkExisting() {
      try {
        const { getWalletAddress } = await import('@/lib/wallet');
        const addr = await getWalletAddress();
        if (!addr) return;
        setWallet(addr);
        const { getUserRole } = await import('@/lib/db');
        const r = await getUserRole(addr);
        if (r) { setRole(r); setPage('dashboard'); }
        else setPage('role');
      } catch { /* stay on connect page */ }
    }
    checkExisting();
  }, []);

  // ── Load projects when wallet + role are set ─────────────────────────────
  useEffect(() => {
    if (!wallet || !role) return;
    import('@/lib/db').then(({ loadProjects }) =>
      loadProjects(wallet, role)
        .then(setProjects)
        .catch((e: Error) => showToast(e.message, '⚠'))
    );
  }, [wallet, role]);

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

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg: string, icon = '✅') => {
    setToast({ show: true, msg, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3200);
  };

  const go = (p: PageName) => { setPage(p); window.scrollTo(0, 0); };

  const updateMilestoneLocal = (patch: Partial<MilestoneData>) => {
    if (activeProjectId === null || activeMilestoneId === null) return;
    setProjects(prev => prev.map(p =>
      p.id !== activeProjectId ? p : {
        ...p,
        milestones: p.milestones.map(m => m.id !== activeMilestoneId ? m : { ...m, ...patch }),
      }
    ));
  };

  const addTimelineLocal = (text: string, dot: TimelineEntry['dot']) => {
    if (activeProjectId === null) return;
    setProjects(prev => prev.map(p =>
      p.id !== activeProjectId ? p : {
        ...p,
        timeline: [{ dot, time: nowStr(), text }, ...p.timeline],
      }
    ));
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function doConnect() {
    setLoading(true);
    try {
      const { connectWallet, validateWallet } = await import('@/lib/wallet');
      const addr = await connectWallet();

      const valid = await validateWallet(addr);
      if (!valid) throw new Error('Account not found on Stellar Testnet. Fund it at laboratory.stellar.org first.');

      setWallet(addr);
      const { getUserRole } = await import('@/lib/db');
      const existingRole = await getUserRole(addr);
      if (existingRole) { setRole(existingRole); go('dashboard'); }
      else go('role');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
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
    if (buildList.some(m => !m.title.trim())) return showToast('All milestones need a title', '⚠');
    if (buildList.some(m => m.amount <= 0)) return showToast('All milestone amounts must be > 0', '⚠');
    if (!process.env.NEXT_PUBLIC_CONTRACT_ID) return showToast('Contract not configured — set NEXT_PUBLIC_CONTRACT_ID in .env.local', '⚠');

    setLoading(true);
    try {
      const { createProject, updateProjectTx, addTimeline: dbTimeline, loadProjects } = await import('@/lib/db');
      const { createMilestone } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');

      // 1. Create in DB first (get IDs)
      const pid = await createProject(
        formName.trim(), wallet, formFreelancerWallet.trim(), formDeadline,
        buildList.map(m => ({ name: m.title || `Milestone ${m.id}`, desc: m.desc, amount: m.amount }))
      );

      // 2. Lock on-chain
      const txHash = await createMilestone(
        wallet, pid, formFreelancerWallet.trim(),
        process.env.NEXT_PUBLIC_USDC_TOKEN ?? '',
        buildTotal,
        Math.floor(Date.now() / 1000) + formDeadline,
        signTx,
      );

      // 3. Persist tx hash + timeline
      await updateProjectTx(pid, txHash);
      await dbTimeline(pid, 'done', `<strong>$${buildTotal} USDC locked</strong> — ${buildList.length} milestone${buildList.length > 1 ? 's' : ''} initialized. TX: ${txHash.slice(0, 12)}...`);

      // 4. Reload & navigate
      const updated = await loadProjects(wallet, role!);
      setProjects(updated);
      setActiveProjectId(pid);

      // 5. Reset form
      setFormName(''); setFormFreelancerWallet(''); setFormDeadline(172800);
      setBuildList([...DEFAULT_BUILD]); buildUID = 2;

      showToast(`<strong>$${buildTotal} USDC locked</strong> — project created!`, '🔒');
      setTimeout(() => go('project'), 1400);
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Milestone actions ─────────────────────────────────────────────────────
  function openProject(id: number) { setActiveProjectId(id); go('project'); }
  function openMilestone(msId: number) { setActiveMilestoneId(msId); go('milestone'); }

  async function freelancerStartWork() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    updateMilestoneLocal({ status: 'progress' });
    addTimelineLocal(`<strong>Work started</strong> on "${m.name}"`, 'done');
    showToast(`${m.name} — work started`, '⚙️');
    try {
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'progress' });
      await addTimeline(p.id, 'done', `<strong>Work started</strong> on "${m.name}"`);
    } catch { showToast('Sync failed — refresh to reload', '⚠'); }
  }

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
    const expiresAt = new Date(Date.now() + m.timerMax * 1000).toISOString();
    const link = proofLink || proofFileUrl || '';
    setLoading(true);
    try {
      const { markComplete } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await markComplete(wallet, p.id, signTx);

      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'review', review_expires_at: expiresAt, proof_link: proofLink, proof_file_url: proofFileUrl });
      await addTimeline(p.id, 'done', `<strong>Milestone submitted</strong> — "${m.name}". Proof: ${link || 'No link'}`);

      updateMilestoneLocal({ status: 'review', proofLink, proofFileUrl, timerSecs: m.timerMax });
      addTimelineLocal(`<strong>Milestone submitted</strong> — "${m.name}". Proof: ${link || 'No link'}`, 'done');
      setModalSubmit(false);
      setProofLink(''); setProofFileUrl(''); setProofFileName('');
      showToast(`<strong>${m.name} submitted</strong> — client review window started`, '📤');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function approveMs() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    setLoading(true);
    try {
      const { confirmDelivery } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await confirmDelivery(wallet, p.id, signTx);

      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'released' });
      await addTimeline(p.id, 'done', `<strong>$${m.amount} USDC released</strong> — client approved "${m.name}"`);

      updateMilestoneLocal({ status: 'released' });
      addTimelineLocal(`<strong>$${m.amount} USDC released</strong> — client approved "${m.name}"`, 'done');
      showToast(`$${m.amount} USDC released to freelancer`, '✅');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function claimMs() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p || m.timerSecs > 0) return;
    setLoading(true);
    try {
      const { claimPayment } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await claimPayment(wallet, p.id, signTx);

      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'released' });
      await addTimeline(p.id, 'done', `<strong>$${m.amount} USDC auto-released</strong> — deadline passed, claimed by freelancer`);

      updateMilestoneLocal({ status: 'released' });
      addTimelineLocal(`<strong>$${m.amount} USDC auto-released</strong> — claimed after deadline`, 'done');
      showToast(`$${m.amount} USDC claimed — auto-release`, '💸');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function confirmRevision() {
    const m = activeMilestone; const p = activeProject;
    if (!m || !p) return;
    const feePaid = parseFloat((m.amount * revFeePercent / 100).toFixed(2));
    setLoading(true);
    try {
      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'revision', rev_fee: revFeePercent, rev_feedback: revFeedback || 'Client requested changes.', review_expires_at: null });
      await addTimeline(p.id, 'act', `<strong>Revision requested</strong> on "${m.name}" — $${feePaid} fee. ${revFeedback || 'Changes requested.'}`);

      updateMilestoneLocal({ status: 'revision', revFee: revFeePercent, revFeedback: revFeedback || 'Client requested changes.', timerSecs: 0 });
      addTimelineLocal(`<strong>Revision requested</strong> on "${m.name}" — $${feePaid} fee`, 'act');
      showToast(`Revision requested — $${feePaid} USDC fee`, '🔁');
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
    setLoading(true);
    try {
      const { raiseDispute } = await import('@/lib/contract');
      const { signTx } = await import('@/lib/wallet');
      await raiseDispute(wallet, p.id, signTx);

      const { updateMsStatus, addTimeline } = await import('@/lib/db');
      await updateMsStatus(m.id, { status: 'disputed', review_expires_at: null });
      await addTimeline(p.id, 'act', `<strong>Dispute raised</strong> on "${m.name}" — funds frozen. Admin notified.`);

      updateMilestoneLocal({ status: 'disputed', timerSecs: 0 });
      addTimelineLocal(`<strong>Dispute raised</strong> on "${m.name}" — funds frozen`, 'act');
      showToast('Dispute raised on-chain — funds frozen', '⚠');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setModalDispute(false); setLoading(false);
    }
  }

  // ── Render: Connect ───────────────────────────────────────────────────────
  function renderConnect() {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">M</div>
          <div className="login-title">MilestonePay</div>
          <div className="login-sub">Anti-ghosting payment system for freelancers.<br />Lock funds. Deliver work. Get paid.</div>
          <button className="wallet-connect-btn" onClick={doConnect} disabled={loading}>
            {loading
              ? <><span className="spinner" /> Connecting...</>
              : <><span>👛</span><span>Connect Freighter Wallet</span></>}
          </button>
          <div className="login-hint">
            Don&apos;t have Freighter? <a href="https://freighter.app" target="_blank" rel="noreferrer">Install here →</a>
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
            Stellar Testnet · USDC · Soroban Smart Contracts
          </div>
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
          <div className="login-title">Welcome</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', marginBottom: 8 }}>{wallet}</div>
          <div className="login-sub">How will you use MilestonePay?</div>
          <div className="role-grid">
            <button className="role-card" onClick={() => selectRole('client')} disabled={loading}>
              <div className="role-icon">🏢</div>
              <div className="role-title">I&apos;m a Client</div>
              <div className="role-desc">I have projects that need to be done. I&apos;ll lock USDC and hire freelancers.</div>
            </button>
            <button className="role-card" onClick={() => selectRole('freelancer')} disabled={loading}>
              <div className="role-icon">💼</div>
              <div className="role-title">I&apos;m a Freelancer</div>
              <div className="role-desc">I deliver work for clients and receive guaranteed payments through escrow.</div>
            </button>
          </div>
          {loading && <div style={{ fontSize: 13, color: 'var(--ink3)' }}><span className="spinner" style={{ borderColor: 'rgba(255,255,255,.2)', borderTopColor: 'var(--blue)' }} /> Saving...</div>}
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 8 }}>
            Connected as: {short(wallet)}
          </div>
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
    const nextMs = allMs.filter(m => m.status === 'review' && m.timerSecs > 0).sort((a, b) => a.timerSecs - b.timerSecs)[0] ?? null;

    return (
      <div className="page active">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">Dashboard</div>
            <div className="h1">{isClient ? 'Your Projects' : 'Your Work'}</div>
            <div className="sub">{isClient ? 'Projects you\'ve funded and their milestone status.' : 'Milestones assigned to your wallet.'}</div>
          </div>
          {isClient && <button className="btn btn-primary btn-primary-auto" onClick={() => go('create')}>+ New Project</button>}
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">{isClient ? 'Total Locked' : 'Pending Earnings'}</div>
            <div className="stat-val" style={{ color: 'var(--amber)' }}>${pendingAmt.toFixed(0)}</div>
            <div className="stat-sub">USDC</div>
          </div>
          <div className="stat">
            <div className="stat-label">{isClient ? 'Released' : 'Earned'}</div>
            <div className="stat-val" style={{ color: 'var(--green)' }}>${releasedAmt.toFixed(0)}</div>
            <div className="stat-sub">USDC</div>
          </div>
          <div className="stat">
            <div className="stat-label">{isClient ? 'Under Review' : 'Awaiting Review'}</div>
            <div className="stat-val" style={{ color: 'var(--blue)' }}>{reviewCount}</div>
            <div className="stat-sub">{reviewCount === 1 ? 'milestone' : 'milestones'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Next Deadline</div>
            <div className="stat-val" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {nextMs ? fmt(nextMs.timerSecs) : '—'}
            </div>
            <div className="stat-sub">{nextMs ? nextMs.name : 'no active timers'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="h2">{isClient ? 'Projects' : 'Assigned Projects'}</div>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">{isClient ? '📭' : '🔍'}</div>
            <div className="empty-ttl">{isClient ? 'No projects yet' : 'No projects assigned'}</div>
            <div>{isClient ? 'Create a project to get started.' : 'When a client assigns your wallet to a project, it appears here.'}</div>
          </div>
        ) : (
          projects.map(p => {
            const total = p.milestones.reduce((s, m) => s + m.amount, 0);
            const done = p.milestones.filter(m => m.status === 'released').length;
            const statusMs = p.milestones.find(m => m.status === 'review') ?? p.milestones.find(m => m.status === 'progress') ?? p.milestones[0];
            return (
              <div className="proj-card" key={p.id} onClick={() => openProject(p.id)}>
                <div className="proj-icon">📁</div>
                <div>
                  <div className="proj-name">{p.name}</div>
                  <div className="proj-meta">
                    {p.milestones.length} milestones ·{' '}
                    {isClient ? `Freelancer: ${short(p.freelancerWallet)}` : `Client: ${short(p.clientWallet)}`}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {statusMs && <span className={`badge ${statusMs.status}`}><span className="bd" />{STATUS_LABEL[statusMs.status]}</span>}
                  </div>
                </div>
                <div className="proj-right">
                  <div className="proj-amt">${total} USDC</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 3 }}>{done}/{p.milestones.length} done</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ── Render: Create (client only) ──────────────────────────────────────────
  function renderCreate() {
    return (
      <div className="page active">
        <div className="back" onClick={() => go('dashboard')}>← Back to Dashboard</div>
        <div className="eyebrow">New Project</div>
        <div className="h1">Lock funds,<br />guarantee payment.</div>
        <div className="sub" style={{ marginBottom: 32 }}>Set milestones, enter the freelancer&apos;s wallet, and lock USDC before work begins.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          <div>
            <div className="card">
              <div className="clabel">Project Details</div>
              <div className="fg">
                <label className="fl">Project Name</label>
                <input className="fi" type="text" placeholder="e.g. Brand Identity Redesign"
                  value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Your Wallet (Client)</label>
                <input className="fi" type="text" value={wallet} readOnly style={{ opacity: .6, cursor: 'not-allowed' }} />
                <div className="fhint">Auto-filled from your connected Freighter wallet</div>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Freelancer&apos;s Stellar Wallet Address</label>
                <input className="fi" type="text" placeholder="G... (ask your freelancer for their Stellar public key)"
                  value={formFreelancerWallet} onChange={e => setFormFreelancerWallet(e.target.value)} />
                <div className="fhint">Funds release to this address on approval or deadline</div>
              </div>
            </div>

            <div className="card">
              <div className="clabel">Milestones</div>
              <div className="ms-build-headers">
                <span>Title</span><span>Description</span><span>USDC</span><span></span>
              </div>
              {buildList.map(m => (
                <div className="ms-build-row" key={m.id}>
                  <input type="text" placeholder="Milestone title..." value={m.title}
                    onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, title: e.target.value } : x))} />
                  <input type="text" placeholder="Short description..." value={m.desc}
                    onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, desc: e.target.value } : x))} />
                  <div className="amt-wrap">
                    <span className="amt-pre">USDC</span>
                    <input type="number" className="amt-in" value={m.amount} min={1}
                      onChange={e => setBuildList(prev => prev.map(x => x.id === m.id ? { ...x, amount: Number(e.target.value) } : x))} />
                  </div>
                  <button className="rm-btn" onClick={() => removeBuildMs(m.id)}>×</button>
                </div>
              ))}
              <button className="add-ms-btn" onClick={addBuildMs}>+ Add milestone</button>
              <div className="total-bar">
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Total to lock in escrow</span>
                <div><span className="total-val">{buildTotal}</span><span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 4 }}>USDC</span></div>
              </div>
            </div>

            <div className="card">
              <div className="clabel">Review Window</div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Auto-release funds after freelancer submits milestone</label>
                <select className="fi" value={formDeadline} onChange={e => setFormDeadline(Number(e.target.value))}>
                  <option value={172800}>48 hours (recommended)</option>
                  <option value={86400}>24 hours</option>
                  <option value={259200}>72 hours</option>
                </select>
                <div className="fhint">You have this window to approve, request revision, or dispute before auto-release</div>
              </div>
            </div>

            <button className="btn btn-primary" onClick={lockProject} disabled={loading}>
              {loading ? <><span className="spinner" /> Locking on-chain...</> : <>🔒 Lock ${buildTotal} USDC into Escrow</>}
            </button>
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <div className="clabel">Contract Preview</div>
            <div className="escrow-box">
              <div className="escrow-lbl">Funds to Lock</div>
              <div><span className="escrow-amt">{buildTotal}</span><span className="escrow-unit">USDC</span></div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', marginTop: 4 }}>⬡ Stellar Testnet</div>
            </div>
            {buildList.map(m => (
              <div className="srow" key={m.id}><span className="slbl">{m.title || 'Untitled'}</span><span className="sval">{m.amount} USDC</span></div>
            ))}
            <div className="div" />
            <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(formFreelancerWallet) || '—'}</span></div>
            <div className="srow"><span className="slbl">Review window</span><span className="sval">{DL_LABEL[formDeadline]}</span></div>
            <div className="srow"><span className="slbl">Wire fee</span><span className="sval" style={{ color: 'var(--green)' }}>&lt;$0.01</span></div>
            <div className="srow"><span className="slbl">Network</span><span className="sval" style={{ color: 'var(--green)' }}>Stellar Testnet</span></div>
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
    return (
      <div className="page active">
        <div className="back" onClick={() => go('dashboard')}>← Back to Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">Project</div>
            <div className="h1">{p.name}</div>
            <div className="sub">
              {isProjectClient ? `Freelancer: ${short(p.freelancerWallet, 8, 4)}` : `Client: ${short(p.clientWallet, 8, 4)}`}
              {' · '}{p.milestones.length} milestones · ${total} USDC
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => go('status')}>View Status →</button>
        </div>

        {p.milestones.map((m, i) => {
          const hasTimer = m.status === 'review' && m.timerSecs > 0;
          return (
            <div className="ms-row" key={m.id} onClick={() => openMilestone(m.id)}>
              <div className="ms-top">
                <div>
                  <div className="ms-num">MILESTONE {String(i + 1).padStart(2, '0')}</div>
                  <div className="ms-name">{m.name}</div>
                  <div className="ms-desc">{m.desc || 'No description'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="ms-amt">{m.amount}<span className="ms-amt-unit">USDC</span></div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <span className={`badge ${m.status}`}><span className="bd" />{STATUS_LABEL[m.status]}</span>
                    {hasTimer && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)' }}>⏱ {fmt(m.timerSecs)}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render: Milestone Detail ──────────────────────────────────────────────
  function renderMilestone() {
    const p = activeProject;
    const m = activeMilestone;
    if (!p || !m) return null;
    const idx = p.milestones.indexOf(m);
    const timerPct = m.timerMax > 0 ? Math.max(0, (m.timerSecs / m.timerMax) * 100) : 0;
    const canClaim = m.status === 'review' && m.timerSecs <= 0;
    const timerExpired = m.status === 'review' && m.timerSecs <= 0;

    return (
      <div className="page active">
        <div className="back" onClick={() => go('project')}>← Back to Project</div>
        <div className="detail-grid">
          <div>
            <div className="eyebrow">Milestone {String(idx + 1).padStart(2, '0')} · {p.name}</div>
            <div className="h1">{m.name}</div>
            <div className="sub" style={{ marginBottom: 16 }}>{m.desc || 'No description provided.'}</div>

            {/* Role indicator */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              background: isProjectClient ? 'var(--bluedim)' : isProjectFreelancer ? 'var(--greendim)' : 'var(--surf2)',
              border: `1px solid ${isProjectClient ? 'rgba(59,130,246,.25)' : isProjectFreelancer ? 'rgba(16,185,129,.25)' : 'var(--bdr)'}`,
              borderRadius: 6, fontSize: 11, fontFamily: 'var(--mono)',
              color: isProjectClient ? 'var(--blue)' : isProjectFreelancer ? 'var(--green)' : 'var(--ink3)',
              marginBottom: 20,
            }}>
              {isProjectClient ? '🏢 You are the Client' : isProjectFreelancer ? '💼 You are the Freelancer' : '👁 Observer'}
            </div>

            <div className="card">
              <div className="clabel">Actions</div>

              {/* ── FREELANCER ACTIONS ── */}
              {m.status === 'created' && isProjectFreelancer && (
                <>
                  <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--ink3)', marginBottom: 14 }}>
                    Funds are locked and ready. Start work when you&apos;re ready.
                  </div>
                  <div className="action-row">
                    <button className="btn btn-outline btn-sm" onClick={freelancerStartWork}>▶ Start Work</button>
                  </div>
                </>
              )}

              {m.status === 'progress' && isProjectFreelancer && (
                <>
                  <div style={{ background: 'var(--purpledim)', border: '1px solid var(--purple)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--purple)', marginBottom: 14 }}>
                    <strong>In Progress</strong> — Submit your work when ready for client review.
                  </div>
                  <div className="action-row">
                    <button className="btn btn-amber btn-sm" onClick={() => setModalSubmit(true)}>📤 Submit for Review</button>
                  </div>
                </>
              )}

              {m.status === 'review' && isProjectFreelancer && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.6 }}>
                    Work submitted — waiting for client. If no response, funds auto-release at deadline.
                  </div>
                  <div className="timer-block" style={timerExpired ? { borderColor: 'var(--green)' } : {}}>
                    <div>
                      <div className="timer-lbl" style={{ color: timerExpired ? 'var(--green)' : 'var(--amber)' }}>
                        {timerExpired ? 'DEADLINE REACHED — CLAIM NOW' : 'AUTO-RELEASE IN'}
                      </div>
                    </div>
                    <div className="timer-val" style={{ color: timerExpired ? 'var(--green)' : 'var(--amber)' }}>
                      {timerExpired ? '00:00:00' : fmt(m.timerSecs)}
                    </div>
                  </div>
                  <div className="timer-bar-wrap">
                    <div className="timer-bar" style={{ width: `${timerPct}%`, background: timerExpired ? 'var(--green)' : 'var(--amber)' }} />
                  </div>
                  {canClaim && (
                    <div className="action-row" style={{ marginTop: 14 }}>
                      <button className="btn btn-green btn-sm" onClick={claimMs} disabled={loading}>
                        {loading ? <span className="spinner" /> : '↓ Claim Payment'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {m.status === 'revision' && isProjectFreelancer && (
                <>
                  <div className="rev-block">
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Revision Requested</div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{m.revFeedback || 'Client requested changes.'}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--purple)', fontFamily: 'var(--mono)' }}>
                      Revision fee paid to you: ${(m.amount * m.revFee / 100).toFixed(2)} USDC
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-amber btn-sm" onClick={() => setModalSubmit(true)}>📤 Re-submit for Review</button>
                  </div>
                </>
              )}

              {/* ── CLIENT ACTIONS ── */}
              {m.status === 'created' && isProjectClient && (
                <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--ink3)' }}>
                  ✅ Funds locked. Waiting for freelancer to start work.
                </div>
              )}

              {m.status === 'progress' && isProjectClient && (
                <div style={{ background: 'var(--purpledim)', border: '1px solid var(--purple)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--purple)' }}>
                  ⚙️ Freelancer is working on this milestone.
                </div>
              )}

              {m.status === 'review' && isProjectClient && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.6 }}>
                    Freelancer submitted work. Review and decide — or do nothing, funds auto-release at deadline.
                  </div>
                  {(m.proofLink || m.proofFileUrl) && (
                    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 12 }}>
                      📎 Proof:{' '}
                      {m.proofLink && <a href={m.proofLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{m.proofLink}</a>}
                      {m.proofFileUrl && <a href={m.proofFileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', marginLeft: 6 }}>[Attached File]</a>}
                    </div>
                  )}
                  <div className="timer-block">
                    <div>
                      <div className="timer-lbl">{timerExpired ? 'DEADLINE PASSED' : 'AUTO-RELEASE IN'}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {timerExpired ? 'Freelancer can claim now' : 'Act now to approve, revise, or dispute'}
                      </div>
                    </div>
                    <div className="timer-val">{timerExpired ? '00:00:00' : fmt(m.timerSecs)}</div>
                  </div>
                  <div className="timer-bar-wrap">
                    <div className="timer-bar" style={{ width: `${timerPct}%` }} />
                  </div>
                  {!timerExpired && (
                    <div className="action-row" style={{ marginTop: 14 }}>
                      <button className="btn btn-green btn-sm" onClick={approveMs} disabled={loading}>
                        {loading ? <span className="spinner" /> : '✓ Approve & Release'}
                      </button>
                      <button className="btn btn-amber btn-sm" onClick={() => setModalRevision(true)} disabled={loading}>🔁 Request Revision</button>
                      <button className="btn btn-red btn-sm" onClick={() => setModalDispute(true)} disabled={loading}>⚠ Dispute</button>
                    </div>
                  )}
                </>
              )}

              {m.status === 'revision' && isProjectClient && (
                <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--ink2)' }}>
                  🔁 Revision in progress — waiting for freelancer to re-submit.
                </div>
              )}

              {/* ── SHARED TERMINAL STATES ── */}
              {m.status === 'released' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', fontSize: 14, color: 'var(--green)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', flexShrink: 0 }} />
                  ${m.amount} USDC released to the freelancer&apos;s wallet.
                </div>
              )}

              {m.status === 'disputed' && (
                <div style={{ background: 'var(--reddim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, fontSize: 13, color: 'var(--red)' }}>
                  ⚠ Dispute active — funds frozen. Admin is reviewing. Awaiting resolution.
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <div className="clabel">Milestone Info</div>
            <div className="escrow-box">
              <div className="escrow-lbl">Locked Amount</div>
              <div><span className="escrow-amt" style={{ fontSize: 26 }}>{m.amount}</span><span className="escrow-unit">USDC</span></div>
            </div>
            <div className="srow">
              <span className="slbl">Status</span>
              <span className="sval"><span className={`badge ${m.status}`}><span className="bd" />{STATUS_LABEL[m.status]}</span></span>
            </div>
            <div className="srow"><span className="slbl">Client</span><span className="sval">{short(p.clientWallet, 8, 4)}</span></div>
            <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(p.freelancerWallet, 8, 4)}</span></div>
            <div className="srow"><span className="slbl">Review window</span><span className="sval">{DL_LABEL[p.deadline] ?? `${p.deadline}s`}</span></div>
            {m.proofLink && <div className="srow"><span className="slbl">Proof link</span><span className="sval" style={{ color: 'var(--blue)' }}>Submitted</span></div>}
            {m.proofFileUrl && <div className="srow"><span className="slbl">Proof file</span><span className="sval" style={{ color: 'var(--blue)' }}>Uploaded</span></div>}
            {m.revFee > 0 && <div className="srow"><span className="slbl">Rev. fee</span><span className="sval" style={{ color: 'var(--purple)' }}>${(m.amount * m.revFee / 100).toFixed(2)} USDC</span></div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Status ────────────────────────────────────────────────────────
  function renderStatus() {
    const p = activeProject;
    if (!p) return null;
    const total = p.milestones.reduce((s, m) => s + m.amount, 0);
    const released = p.milestones.filter(m => m.status === 'released').reduce((s, m) => s + m.amount, 0);
    const disputes = p.milestones.filter(m => m.status === 'disputed').length;

    return (
      <div className="page active">
        <div className="back" onClick={() => go('project')}>← Back to Project</div>
        <div className="eyebrow">Status View</div>
        <div className="h1" style={{ marginBottom: 6 }}>{p.name}</div>
        <div className="sub" style={{ marginBottom: 28 }}>
          {isProjectClient ? `Freelancer: ${short(p.freelancerWallet, 8, 4)}` : `Client: ${short(p.clientWallet, 8, 4)}`} · ${total} USDC total
        </div>

        <div className="sc-grid">
          {p.milestones.map(m => {
            const sc = STATUS_SC[m.status] ?? 's-created';
            return (
              <div className={`sc ${sc}`} key={m.id}>
                <div className="sc-icon">{STATUS_ICON[m.status]}</div>
                <span className={`badge ${m.status}`} style={{ marginBottom: 8 }}><span className="bd" />{STATUS_LABEL[m.status]}</span>
                <div className="sc-name">{m.name}</div>
                <div className="sc-amt">${m.amount} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>USDC</span></div>
                <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--mono)' }}>
                  {m.status === 'review' && m.timerSecs > 0 && <span style={{ color: 'var(--amber)' }}>{fmt(m.timerSecs)} remaining</span>}
                  {m.status === 'released' && <span style={{ color: 'var(--ink3)' }}>Funds sent</span>}
                  {m.status === 'disputed' && <span style={{ color: 'var(--red)' }}>Awaiting admin</span>}
                  {(m.status === 'created' || m.status === 'progress' || m.status === 'revision') && <span style={{ color: 'var(--ink3)' }}>{STATUS_LABEL[m.status]}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          <div className="card">
            <div className="clabel">On-Chain Activity</div>
            <div className="tl">
              {p.timeline.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No activity yet.</div>}
              {p.timeline.map((t, i) => (
                <div className="tl-item" key={i}>
                  <div className={`tl-dot ${t.dot}`} />
                  <div className="tl-time">{t.time}</div>
                  <div className="tl-text" dangerouslySetInnerHTML={{ __html: t.text }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="card">
              <div className="clabel">Contract Summary</div>
              <div className="escrow-box" style={{ marginBottom: 12 }}>
                <div className="escrow-lbl">Remaining in Escrow</div>
                <div><span className="escrow-amt" style={{ fontSize: 26 }}>{total - released}</span><span className="escrow-unit">USDC</span></div>
              </div>
              <div className="srow"><span className="slbl">Project</span><span className="sval">{p.name}</span></div>
              <div className="srow"><span className="slbl">Total locked</span><span className="sval">${total} USDC</span></div>
              <div className="srow"><span className="slbl">Released</span><span className="sval" style={{ color: 'var(--green)' }}>${released} USDC</span></div>
              <div className="srow">
                <span className="slbl">{isProjectClient ? 'Freelancer' : 'Client'}</span>
                <span className="sval">{short(isProjectClient ? p.freelancerWallet : p.clientWallet, 8, 4)}</span>
              </div>
              <div className="srow"><span className="slbl">Disputes</span><span className="sval">{disputes > 0 ? `${disputes} active` : 'None'}</span></div>
            </div>
            {p.tx && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', marginTop: 12 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>TX</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tx}</div>
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
  function renderModalSubmit() {
    if (!modalSubmit) return null;
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalSubmit(false); }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--amber)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 8 }}>Submit Milestone</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Upload Proof of Work</div>
          <div className="fg">
            <label className="fl">Delivery Link</label>
            <input className="fi" type="text" placeholder="Figma link, GitHub URL, Drive folder..."
              value={proofLink} onChange={e => setProofLink(e.target.value)} />
            <div className="fhint">Share a link to your deliverables</div>
          </div>
          <label className="proof-area" style={{ display: 'block', cursor: 'pointer' }}>
            <div className="proof-icon">📎</div>
            {uploadingFile
              ? <div style={{ fontSize: 13, color: 'var(--amber)' }}><span className="spinner" /> Uploading...</div>
              : proofFileName
                ? <div style={{ fontSize: 13, color: 'var(--green)' }}>✅ {proofFileName}</div>
                : <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Click to attach a file (optional)</div>}
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, fontFamily: 'var(--mono)' }}>PNG, PDF, ZIP, MP4 · max 20MB</div>
            <input type="file" style={{ display: 'none' }} onChange={handleFileChange}
              accept=".png,.jpg,.jpeg,.pdf,.zip,.mp4,.mov,.fig,.sketch" />
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
    const feePaid = (m.amount * revFeePercent / 100).toFixed(2);
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalRevision(false); }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--purple)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 8 }}>Request Revision</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Request Changes</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.6 }}>
            A revision fee is required to prevent abuse. This amount is paid to the freelancer upfront regardless of outcome.
          </div>
          <div className="fg">
            <label className="fl">Feedback</label>
            <textarea className="fi" rows={3} placeholder="Describe what needs to change..."
              value={revFeedback} onChange={e => setRevFeedback(e.target.value)} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Revision Fee (% of milestone amount)</label>
            <select className="fi" value={revFeePercent} onChange={e => setRevFeePercent(Number(e.target.value))}>
              <option value={20}>20% — minor changes</option>
              <option value={35}>35% — moderate changes</option>
              <option value={50}>50% — major rework</option>
            </select>
            <div className="fhint">Fee: ${feePaid} USDC ({revFeePercent}%)</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalRevision(false)}>Cancel</button>
            <button className="btn btn-purple" style={{ flex: 2 }} onClick={confirmRevision} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Pay Fee & Request Revision'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderModalDispute() {
    if (!modalDispute) return null;
    return (
      <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalDispute(false); }}>
        <div className="modal">
          <div className="modal-top-bar" style={{ background: 'var(--red)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>Dispute</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Raise a Dispute</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.6 }}>
            Funds will be <strong style={{ color: 'var(--amber)' }}>frozen</strong> and the timer stopped. An admin will review and release to the correct party.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalDispute(false)}>Cancel</button>
            <button className="btn btn-red-solid" style={{ flex: 2 }} onClick={confirmDispute} disabled={loading}>
              {loading ? <span className="spinner" /> : '⚠ Raise Dispute On-Chain'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Toast element ─────────────────────────────────────────────────────────
  const toastEl = (
    <div className={`toast${toast.show ? ' show' : ''}`}>
      <span className="t-icon">{toast.icon}</span>
      <div dangerouslySetInnerHTML={{ __html: toast.msg }} />
    </div>
  );

  // ── Root render ───────────────────────────────────────────────────────────
  if (page === 'connect') return <>{renderConnect()}{toastEl}</>;
  if (page === 'role') return <>{renderRole()}{toastEl}</>;

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
            <div className="wallet-chip">
              <div className="wdot" />
              <span>{short(wallet)}</span>
            </div>
          </div>
        </header>

        {page === 'dashboard' && renderDashboard()}
        {page === 'create' && renderCreate()}
        {page === 'project' && renderProject()}
        {page === 'milestone' && renderMilestone()}
        {page === 'status' && renderStatus()}
      </div>

      {toastEl}
      {renderModalSubmit()}
      {renderModalRevision()}
      {renderModalDispute()}
    </>
  );
}
