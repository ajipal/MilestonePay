'use client';

import { useState, useEffect, useRef } from 'react';
import type { PageName, MsStatus, BuildMs, MilestoneData, Project, User, TimelineEntry } from '@/lib/types';

// ── Constants ────────────────────────────────────────────────────────────────
const DL_LABEL: Record<number, string> = {
  172800: '48 hours', 86400: '24 hours', 259200: '72 hours', 10: '10 seconds (demo)',
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
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const IS_DEMO = !CONTRACT_ID;

// ── Utilities ────────────────────────────────────────────────────────────────
const short = (addr: string, f = 6, b = 4) =>
  !addr || addr.length <= f + b + 3 ? addr || '—' : `${addr.slice(0, f)}...${addr.slice(-b)}`;
const fmt = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
const randTx = () => `a${Math.random().toString(36).slice(2, 10)}...${Math.random().toString(36).slice(2, 6)}`;
const nowStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

let projUID = 0;
let buildUID = 2;

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── App state ──
  const [page, setPage] = useState<PageName>('login');
  const [user, setUser] = useState<User>({ name: '', email: '', wallet: '', balance: 1200 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeMilestoneId, setActiveMilestoneId] = useState<number | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [obVisible, setObVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Login form ──
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');

  // ── Create form ──
  const [formName, setFormName] = useState('');
  const [formClientWallet, setFormClientWallet] = useState('');
  const [formFreelancerWallet, setFormFreelancerWallet] = useState('');
  const [formDeadline, setFormDeadline] = useState(172800);
  const [buildList, setBuildList] = useState<BuildMs[]>([
    { id: 1, title: 'Initial Wireframes', desc: 'Lo-fi wireframes and user flow', amount: 50 },
    { id: 2, title: 'Final Deliverables', desc: 'Finished design files ready for dev', amount: 50 },
  ]);

  // ── Modal state ──
  const [modalSubmit, setModalSubmit] = useState(false);
  const [modalRevision, setModalRevision] = useState(false);
  const [modalDispute, setModalDispute] = useState(false);
  const [proofLink, setProofLink] = useState('');
  const [proofFileAttached, setProofFileAttached] = useState(false);
  const [revFeedback, setRevFeedback] = useState('');
  const [revFeePercent, setRevFeePercent] = useState(20);

  // ── Toast ──
  const [toast, setToast] = useState({ show: false, msg: '', icon: '✅' });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Derived ──
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const activeMilestone = activeProject?.milestones.find(m => m.id === activeMilestoneId) ?? null;

  // ── Global countdown timer ──────────────────────────────────────────────────
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

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const showToast = (msg: string, icon = '✅') => {
    setToast({ show: true, msg, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3200);
  };

  // ── Navigation ───────────────────────────────────────────────────────────────
  const go = (p: PageName) => { setPage(p); window.scrollTo(0, 0); };

  // ── Milestone updater helper ─────────────────────────────────────────────────
  const updateMilestone = (patch: Partial<MilestoneData>) => {
    if (activeProjectId === null || activeMilestoneId === null) return;
    setProjects(prev => prev.map(p =>
      p.id !== activeProjectId ? p : {
        ...p,
        milestones: p.milestones.map(m => m.id !== activeMilestoneId ? m : { ...m, ...patch }),
      }
    ));
  };

  const addTimeline = (text: string, dot: TimelineEntry['dot']) => {
    if (activeProjectId === null) return;
    setProjects(prev => prev.map(p =>
      p.id !== activeProjectId ? p : {
        ...p,
        timeline: [{ dot, time: nowStr(), text }, ...p.timeline],
      }
    ));
  };

  // ── Login ────────────────────────────────────────────────────────────────────
  function connectWallet() {
    const next = !walletConnected;
    setWalletConnected(next);
    if (next) showToast('Freighter wallet connected', '👛');
  }

  async function doLogin() {
    if (!loginName.trim()) return showToast('Please enter your name', '⚠');
    setUser(u => ({
      ...u,
      name: loginName.trim(),
      email: loginEmail.trim(),
      wallet: walletConnected ? 'GD7X4KQWP2N8CJRYMXL3HFTQ9K9QR' : 'GD7X...DEMO',
    }));
    go('dashboard');
    setTimeout(() => { setObVisible(true); setTimeout(() => setObVisible(false), 6000); }, 2000);
  }

  // ── Create project ───────────────────────────────────────────────────────────
  function addBuildMs() {
    buildUID++;
    setBuildList(prev => [...prev, { id: buildUID, title: '', desc: '', amount: 50 }]);
  }
  function removeBuildMs(id: number) {
    if (buildList.length <= 1) return;
    setBuildList(prev => prev.filter(m => m.id !== id));
  }
  const buildTotal = buildList.reduce((s, m) => s + m.amount, 0);

  async function lockProject() {
    if (!formName.trim()) return showToast('Please enter a project name', '⚠');
    if (!formFreelancerWallet.trim()) return showToast("Enter the freelancer's wallet address", '⚠');
    if (buildList.some(m => m.amount <= 0)) return showToast('All milestone amounts must be > 0', '⚠');

    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { createMilestone } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        await createMilestone(
          user.wallet, Date.now(), formFreelancerWallet,
          process.env.NEXT_PUBLIC_USDC_TOKEN ?? '',
          buildTotal, Math.floor(Date.now() / 1000) + formDeadline, signTx,
        );
      }
      projUID++;
      const pid = projUID;
      const ms: MilestoneData[] = buildList.map((m, i) => ({
        id: i, projId: pid,
        name: m.title || `Milestone ${i + 1}`, desc: m.desc, amount: m.amount,
        status: 'created', timerSecs: 0, timerMax: formDeadline,
        proofLink: '', revFee: 0, revFeedback: '',
      }));
      const proj: Project = {
        id: pid, name: formName.trim(),
        clientWallet: formClientWallet.trim() || user.wallet,
        freelancerWallet: formFreelancerWallet.trim(),
        deadline: formDeadline, tx: randTx(),
        milestones: ms,
        timeline: [{
          dot: 'done', time: nowStr(),
          text: `<strong>$${buildTotal} USDC locked</strong> — contract initialized with ${ms.length} milestone${ms.length > 1 ? 's' : ''}`,
        }],
      };
      setProjects(prev => [...prev, proj]);
      setUser(u => ({ ...u, balance: u.balance - buildTotal }));
      setActiveProjectId(pid);
      // Reset form
      setFormName(''); setFormClientWallet(''); setFormFreelancerWallet(''); setFormDeadline(172800);
      setBuildList([
        { id: 1, title: 'Initial Wireframes', desc: 'Lo-fi wireframes and user flow', amount: 50 },
        { id: 2, title: 'Final Deliverables', desc: 'Finished design files ready for dev', amount: 50 },
      ]);
      buildUID = 2;
      showToast(`<strong>$${buildTotal} USDC locked</strong> — project created!`, '🔒');
      setTimeout(() => go('project'), 1400);
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Milestone actions ────────────────────────────────────────────────────────
  function openProject(id: number) { setActiveProjectId(id); go('project'); }
  function openMilestone(msId: number) { setActiveMilestoneId(msId); go('milestone'); }

  function freelancerStartWork() {
    updateMilestone({ status: 'progress' });
    addTimeline(`<strong>Work started</strong> on "${activeMilestone?.name}" — milestone is in progress.`, 'done');
    showToast(`${activeMilestone?.name} — freelancer started work`, '⚙️');
  }

  function confirmSubmit() {
    const link = proofLink || '(file attached)';
    updateMilestone({ status: 'review', proofLink: link, timerSecs: activeMilestone?.timerMax ?? formDeadline });
    addTimeline(`<strong>Milestone submitted</strong> — "${activeMilestone?.name}" delivered. Review window opened. Proof: ${link}`, 'done');
    setModalSubmit(false);
    setProofLink(''); setProofFileAttached(false);
    showToast(`<strong>${activeMilestone?.name} submitted</strong> — client review window started`, '📤');
  }

  function approveMs() {
    const amt = activeMilestone?.amount ?? 0;
    updateMilestone({ status: 'released' });
    setUser(u => ({ ...u, balance: u.balance + amt }));
    addTimeline(`<strong>$${amt} USDC released</strong> — client approved "${activeMilestone?.name}" via confirm_delivery(). Instant release.`, 'done');
    showToast(`Client approved — $${amt} USDC released instantly`, '✅');
  }

  function claimMs() {
    if ((activeMilestone?.timerSecs ?? 1) > 0) return;
    const amt = activeMilestone?.amount ?? 0;
    updateMilestone({ status: 'released' });
    addTimeline(`<strong>$${amt} USDC auto-released</strong> — deadline passed, claim_payment() executed for "${activeMilestone?.name}".`, 'done');
    showToast(`$${amt} USDC released — auto-release after deadline`, '💸');
  }

  function confirmRevision() {
    const m = activeMilestone;
    if (!m) return;
    const feePaid = parseFloat((m.amount * revFeePercent / 100).toFixed(2));
    updateMilestone({ status: 'revision', revFee: revFeePercent, revFeedback: revFeedback || 'Client requested changes.', timerSecs: 0 });
    setUser(u => ({ ...u, balance: u.balance - feePaid }));
    addTimeline(`<strong>Revision requested</strong> on "${m.name}" — fee of $${feePaid} USDC paid. Feedback: ${revFeedback || 'Changes requested.'}`, 'act');
    setModalRevision(false);
    setRevFeedback(''); setRevFeePercent(20);
    showToast(`Revision requested — $${feePaid} USDC fee paid`, '🔁');
  }

  function confirmDispute() {
    const m = activeMilestone;
    if (!m) return;
    updateMilestone({ status: 'disputed', timerSecs: 0 });
    addTimeline(`<strong>Dispute raised</strong> on "${m.name}" — funds frozen, raise_dispute() called. Admin notified.`, 'act');
    setModalDispute(false);
    showToast('Dispute raised on-chain — funds frozen, admin notified', '⚠');
  }

  // ── Render: Login ─────────────────────────────────────────────────────────────
  function renderLogin() {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">M</div>
          <div className="login-title">MilestonePay</div>
          <div className="login-sub">Anti-ghosting payment system for freelancers.<br />Lock funds. Deliver work. Get paid.</div>
          <div className="fg">
            <label className="fl">Your Name</label>
            <input className="fi" type="text" placeholder="e.g. Eijay Palpal-latoc"
              value={loginName} onChange={e => setLoginName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} />
          </div>
          <div className="fg">
            <label className="fl">Email Address</label>
            <input className="fi" type="email" placeholder="you@email.com"
              value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} />
          </div>
          <div className="or-div">or connect your wallet</div>
          <button className={`wallet-connect-btn${walletConnected ? ' connected' : ''}`} onClick={connectWallet}>
            <span>{walletConnected ? '✅' : '👛'}</span>
            <span>{walletConnected ? 'GD7X...K9QR — Connected' : 'Connect Freighter Wallet'}</span>
          </button>
          <button className="btn btn-primary" onClick={doLogin}>Get Started →</button>
          <div style={{ marginTop: 18, fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
            Stellar Testnet · USDC · Soroban Smart Contracts{IS_DEMO ? ' · Demo Mode' : ''}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Dashboard ─────────────────────────────────────────────────────────
  function renderDashboard() {
    const nextMs = projects.flatMap(p => p.milestones)
      .filter(m => m.status === 'review' && m.timerSecs > 0)
      .sort((a, b) => a.timerSecs - b.timerSecs)[0] ?? null;
    const pending = projects.reduce((s, p) =>
      s + p.milestones.filter(m => !['released'].includes(m.status)).reduce((a, m) => a + m.amount, 0), 0);

    return (
      <div className="page active">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">Dashboard</div>
            <div className="h1">Welcome back, {user.name.split(' ')[0]}!</div>
            <div className="sub">Your projects and active milestones at a glance.</div>
          </div>
          <button className="btn btn-primary btn-primary-auto" onClick={() => go('create')}>+ New Project</button>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Wallet Balance</div>
            <div className="stat-val" style={{ color: 'var(--green)' }}>${user.balance.toFixed(0)}</div>
            <div className="stat-sub">USDC</div>
          </div>
          <div className="stat">
            <div className="stat-label">Active Projects</div>
            <div className="stat-val" style={{ color: 'var(--blue)' }}>{projects.length}</div>
            <div className="stat-sub">{projects.length === 0 ? 'no projects yet' : `project${projects.length > 1 ? 's' : ''}`}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Pending Payments</div>
            <div className="stat-val" style={{ color: 'var(--amber)' }}>${pending}</div>
            <div className="stat-sub">USDC locked</div>
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
          <div className="h2">Projects</div>
        </div>
        {projects.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">📭</div>
            <div className="empty-ttl">No projects yet</div>
            <div>Create a project to get started.</div>
          </div>
        ) : (
          projects.map(p => {
            const total = p.milestones.reduce((s, m) => s + m.amount, 0);
            const done = p.milestones.filter(m => m.status === 'released').length;
            const statusMs = p.milestones.find(m => m.status === 'review') ??
              p.milestones.find(m => m.status === 'progress') ?? p.milestones[0];
            return (
              <div className="proj-card" key={p.id} onClick={() => openProject(p.id)}>
                <div className="proj-icon">📁</div>
                <div>
                  <div className="proj-name">{p.name}</div>
                  <div className="proj-meta">{p.milestones.length} milestones · Freelancer: {short(p.freelancerWallet)}</div>
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

  // ── Render: Create ────────────────────────────────────────────────────────────
  function renderCreate() {
    return (
      <div className="page active">
        <div className="back" onClick={() => go('dashboard')}>← Back to Dashboard</div>
        <div className="eyebrow">New Project</div>
        <div className="h1">Lock funds,<br />guarantee payment.</div>
        <div className="sub" style={{ marginBottom: 32 }}>Enter the freelancer&apos;s wallet, set milestones, and lock USDC before work begins.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          <div>
            <div className="card">
              <div className="clabel">Project Details</div>
              <div className="frow">
                <div className="fg">
                  <label className="fl">Project Name</label>
                  <input className="fi" type="text" placeholder="e.g. Brand Identity Redesign"
                    value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl">Your Wallet (Client)</label>
                  <input className="fi" type="text" placeholder={user.wallet || 'Your Stellar wallet address'}
                    value={formClientWallet} onChange={e => setFormClientWallet(e.target.value)} />
                </div>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Freelancer&apos;s Wallet Address</label>
                <input className="fi" type="text" placeholder="Ask your freelancer for their Stellar wallet"
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
                  <option value={10}>10 seconds (demo mode)</option>
                </select>
                <div className="fhint">You have this window to approve, request revision, or dispute before auto-release</div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={lockProject} disabled={loading}>
              {loading ? <><span className="spinner" /> Locking...</> : <>🔒 Lock ${buildTotal} USDC into Escrow</>}
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
            <div className="srow"><span className="slbl">Mode</span><span className="sval" style={{ color: IS_DEMO ? 'var(--amber)' : 'var(--green)' }}>{IS_DEMO ? 'Demo' : 'On-chain'}</span></div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Project ───────────────────────────────────────────────────────────
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
            <div className="sub">Freelancer: {short(p.freelancerWallet, 8, 4)} · {p.milestones.length} milestones · ${total} USDC</div>
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

  // ── Render: Milestone Detail ──────────────────────────────────────────────────
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
          {/* Left */}
          <div>
            <div className="eyebrow">Milestone {String(idx + 1).padStart(2, '0')} · {p.name}</div>
            <div className="h1">{m.name}</div>
            <div className="sub" style={{ marginBottom: 20 }}>{m.desc || 'No description provided.'}</div>
            <div className="card">
              <div className="clabel">Actions</div>

              {m.status === 'created' && (
                <>
                  <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--ink3)', marginBottom: 14 }}>
                    Status: <strong style={{ color: 'var(--blue)' }}>Created &amp; Funded</strong> — Freelancer can begin work.
                  </div>
                  <div className="action-row">
                    <button className="btn btn-outline btn-sm" onClick={freelancerStartWork}>▶ Freelancer: Start Work</button>
                  </div>
                </>
              )}

              {m.status === 'progress' && (
                <>
                  <div style={{ background: 'var(--purpledim)', border: '1px solid var(--purple)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 13, color: 'var(--purple)', marginBottom: 14 }}>
                    Status: <strong>In Progress</strong> — Freelancer is working on this milestone.
                  </div>
                  <div className="action-row">
                    <button className="btn btn-amber btn-sm" onClick={() => setModalSubmit(true)}>📤 Freelancer: Submit for Review</button>
                  </div>
                </>
              )}

              {m.status === 'review' && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.6 }}>
                    Freelancer has submitted work. Review and decide — or do nothing and funds auto-release after the deadline.
                  </div>
                  {m.proofLink && (
                    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--blue)', marginBottom: 12 }}>
                      📎 Proof: {m.proofLink}
                    </div>
                  )}
                  <div className="timer-block" style={timerExpired ? { borderColor: 'var(--green)' } : {}}>
                    <div>
                      <div className="timer-lbl" style={{ color: timerExpired ? 'var(--green)' : 'var(--amber)' }}>
                        {timerExpired ? 'DEADLINE REACHED' : 'AUTO-RELEASE IN'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {timerExpired ? 'Freelancer can now claim' : 'Client has not responded'}
                      </div>
                    </div>
                    <div className="timer-val" style={{ color: timerExpired ? 'var(--green)' : 'var(--amber)' }}>
                      {timerExpired ? '00:00:00' : fmt(m.timerSecs)}
                    </div>
                  </div>
                  <div className="timer-bar-wrap">
                    <div className="timer-bar" style={{ width: `${timerPct}%`, background: timerExpired ? 'var(--green)' : 'var(--amber)' }} />
                  </div>
                  <div className="action-row" style={{ marginTop: 14 }}>
                    <button className="btn btn-green btn-sm" onClick={approveMs}>✓ Approve &amp; Release</button>
                    <button className="btn btn-amber btn-sm" onClick={() => setModalRevision(true)}>🔁 Request Revision</button>
                    <button className="btn btn-red btn-sm" onClick={() => setModalDispute(true)}>⚠ Dispute</button>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink3)' }}>
                    Or wait — funds auto-release when timer reaches 00:00:00.
                    <button className="btn btn-outline btn-sm"
                      style={{ marginTop: 10, width: '100%' }}
                      onClick={claimMs} disabled={!canClaim}>
                      ↓ Claim Payment (after deadline)
                    </button>
                  </div>
                </>
              )}

              {m.status === 'revision' && (
                <>
                  <div className="rev-block">
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Revision in Progress</div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{m.revFeedback || 'Client requested changes.'}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--purple)', fontFamily: 'var(--mono)' }}>
                      Fee paid: ${(m.amount * m.revFee / 100).toFixed(2)} USDC
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-amber btn-sm" onClick={() => setModalSubmit(true)}>📤 Freelancer: Re-submit for Review</button>
                  </div>
                </>
              )}

              {m.status === 'released' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', fontSize: 14, color: 'var(--green)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', flexShrink: 0 }} />
                  ${m.amount} USDC has been released to the freelancer&apos;s wallet.
                </div>
              )}

              {m.status === 'disputed' && (
                <div style={{ background: 'var(--reddim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, fontSize: 13, color: 'var(--red)' }}>
                  ⚠ Dispute active — funds frozen, timer stopped. Admin notified. Awaiting resolution.
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
            <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(p.freelancerWallet, 8, 4)}</span></div>
            <div className="srow"><span className="slbl">Review window</span><span className="sval">{DL_LABEL[p.deadline] ?? `${p.deadline}s`}</span></div>
            {m.proofLink && <div className="srow"><span className="slbl">Proof</span><span className="sval" style={{ color: 'var(--blue)' }}>Link submitted</span></div>}
            {m.revFee > 0 && <div className="srow"><span className="slbl">Revision fee</span><span className="sval" style={{ color: 'var(--purple)' }}>${(m.amount * m.revFee / 100).toFixed(2)} USDC</span></div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Status ────────────────────────────────────────────────────────────
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
        <div className="sub" style={{ marginBottom: 28 }}>Freelancer: {short(p.freelancerWallet, 8, 4)} · ${total} USDC total</div>

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
                  {(m.status === 'created' || m.status === 'progress') && <span style={{ color: 'var(--ink3)' }}>{STATUS_LABEL[m.status]}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          <div className="card">
            <div className="clabel">On-Chain Activity</div>
            <div className="tl">
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
              <div className="srow"><span className="slbl">Freelancer</span><span className="sval">{short(p.freelancerWallet, 8, 4)}</span></div>
              <div className="srow"><span className="slbl">Disputes</span><span className="sval">{disputes > 0 ? `${disputes} active` : 'None'}</span></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 14px', marginTop: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>TX</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tx}</div>
              <button onClick={() => { navigator.clipboard?.writeText(p.tx); showToast('Transaction hash copied', '⎘'); }}
                style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12 }}>⎘</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Modals ────────────────────────────────────────────────────────────
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
          <div className="proof-area" onClick={() => setProofFileAttached(true)}>
            <div className="proof-icon">📎</div>
            <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{proofFileAttached ? '✅ deliverables.zip attached' : 'Click to attach a file (optional)'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, fontFamily: 'var(--mono)' }}>PNG, PDF, ZIP · max 20MB</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalSubmit(false)}>Cancel</button>
            <button className="btn btn-amber" style={{ flex: 2 }} onClick={confirmSubmit}>Submit for Review →</button>
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
            A revision fee is required to prevent abuse. This amount is paid to the freelancer regardless of outcome.
          </div>
          <div className="fg">
            <label className="fl">Revision Feedback</label>
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
          <div className="rev-block" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--purple)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Revision Rules</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.8 }}>
              <div>· Only 1 active revision per milestone</div>
              <div>· Fee is paid to freelancer upfront</div>
              <div>· If freelancer delivers → goes back to review</div>
              <div>· If client ghosts → freelancer keeps milestone + fee</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalRevision(false)}>Cancel</button>
            <button className="btn btn-purple" style={{ flex: 2 }} onClick={confirmRevision}>Pay Fee &amp; Request Revision</button>
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
            Funds will be <strong style={{ color: 'var(--amber)' }}>frozen</strong> and the timer stopped. An admin will review and release funds to the correct party.
          </div>
          <div className="fg">
            <label className="fl">Reason</label>
            <select className="fi">
              <option>Client requesting unpaid revisions</option>
              <option>Delivered work doesn&apos;t match scope</option>
              <option>Client unresponsive after delivery</option>
              <option>Scope changed without agreement</option>
              <option>Other</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Evidence Link (optional)</label>
            <input className="fi" type="text" placeholder="Screenshot URL, Drive link, chat log..." />
          </div>
          <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: 12, margin: '14px 0' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>3-Step Resolution</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.8 }}>
              <div>1. raise_dispute() — funds frozen, timer stopped</div>
              <div>2. Both parties submit evidence within 72h</div>
              <div>3. Admin calls resolve_dispute(winner)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalDispute(false)}>Cancel</button>
            <button className="btn btn-red-solid" style={{ flex: 2 }} onClick={confirmDispute}>⚠ Raise Dispute On-Chain</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────────
  if (page === 'login') {
    return (
      <>
        {renderLogin()}
        <div className={`toast${toast.show ? ' show' : ''}`}>
          <span className="t-icon">{toast.icon}</span>
          <div dangerouslySetInnerHTML={{ __html: toast.msg }} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* App shell */}
      <div className="wrap">
        {/* Topbar */}
        <header className="topbar">
          <div className="logo" onClick={() => go('dashboard')}>
            <div className="logo-mark">M</div>
            <div>
              <div className="logo-name">MilestonePay</div>
              <div className="logo-tag">anti-ghosting payments</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="balance-chip">
              <span>⬡</span>
              <span>{user.balance.toFixed(2)}</span>
              <span style={{ color: 'var(--ink3)' }}>USDC</span>
            </div>
            <div className="wallet-chip">
              <div className="wdot" />
              <span>{short(user.wallet)}</span>
            </div>
          </div>
        </header>

        {/* Pages */}
        {page === 'dashboard' && renderDashboard()}
        {page === 'create' && renderCreate()}
        {page === 'project' && renderProject()}
        {page === 'milestone' && renderMilestone()}
        {page === 'status' && renderStatus()}
      </div>

      {/* Toast */}
      <div className={`toast${toast.show ? ' show' : ''}`}>
        <span className="t-icon">{toast.icon}</span>
        <div dangerouslySetInnerHTML={{ __html: toast.msg }} />
      </div>

      {/* Modals */}
      {renderModalSubmit()}
      {renderModalRevision()}
      {renderModalDispute()}

      {/* Onboarding banner */}
      <div className={`ob${obVisible ? ' visible' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, background: 'var(--bluedim)', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 16 }}>👛</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>New to Stellar?</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Install Freighter to lock and receive USDC payments.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="https://freighter.app" target="_blank" rel="noreferrer"
            style={{ padding: '8px 14px', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
            Install Freighter →
          </a>
          <button onClick={() => setObVisible(false)}
            style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>×</button>
        </div>
      </div>
    </>
  );
}
