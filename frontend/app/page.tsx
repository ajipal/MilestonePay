'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MilestoneState, MsInput, TimelineEntry, ProjectConfig } from '@/lib/types';

// ── Constants ──────────────────────────────────────────────────────────────
const DL_LABEL: Record<string, string> = {
  '48h': '48 hours', '24h': '24 hours', '72h': '72 hours', '10s': '10 seconds (demo)',
};
const DL_SECS: Record<string, number> = {
  '48h': 172800, '24h': 86400, '72h': 259200, '10s': 10,
};
const USDC_TOKEN = process.env.NEXT_PUBLIC_USDC_TOKEN ?? '';
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const IS_DEMO = !CONTRACT_ID;

// ── Helpers ────────────────────────────────────────────────────────────────
function shorten(addr: string, front = 6, back = 4) {
  if (!addr) return '—';
  return addr.length > front + back + 3 ? `${addr.slice(0, front)}...${addr.slice(-back)}` : addr;
}
function fmt(secs: number) {
  return [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60]
    .map(n => String(n).padStart(2, '0')).join(':');
}
let msUID = 2;

// ── Main Component ─────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<'create' | 'dashboard' | 'status'>('create');
  const [wallet, setWallet] = useState('');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<ProjectConfig>({ name: '', clientWallet: '', freelancerWallet: '', deadline: '48h' });
  const [msInputs, setMsInputs] = useState<MsInput[]>([
    { id: 1, name: 'Initial Wireframes', amount: 50 },
    { id: 2, name: 'Final Deliverables', amount: 50 },
  ]);
  const [milestones, setMilestones] = useState<MilestoneState[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [tx, setTx] = useState('');
  const [toast, setToast] = useState({ show: false, msg: '', icon: '✅' });
  const [dispModal, setDispModal] = useState({ open: false, msId: -1 });
  const [bannerHidden, setBannerHidden] = useState(false);
  const timerRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Show onboarding banner after 1.8s
  useEffect(() => {
    const t = setTimeout(() => setBannerHidden(false), 1800);
    setBannerHidden(true);
    return () => clearTimeout(t);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => () => { Object.values(timerRefs.current).forEach(clearInterval); }, []);

  const showToast = useCallback((msg: string, icon = '✅') => {
    setToast({ show: true, msg, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3200);
  }, []);

  // ── Timer logic ─────────────────────────────────────────────────────────
  const startTimer = useCallback((idx: number) => {
    if (timerRefs.current[idx]) return;
    timerRefs.current[idx] = setInterval(() => {
      setMilestones(prev => {
        const ms = prev[idx];
        if (!ms || ms.status !== 'waiting') {
          clearInterval(timerRefs.current[idx]);
          delete timerRefs.current[idx];
          return prev;
        }
        if (ms.timerSecs <= 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...ms, timerSecs: ms.timerSecs - 1 };
        return updated;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    milestones.forEach((m, i) => { if (m.status === 'waiting' && m.timerSecs > 0) startTimer(i); });
  }, [milestones, startTimer]);

  // ── Wallet connection ────────────────────────────────────────────────────
  async function connectWallet() {
    try {
      const { connectWallet: cw } = await import('@/lib/wallet');
      const addr = await cw();
      setWallet(addr);
      showToast(`Wallet connected: ${shorten(addr)}`, '👛');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    }
  }

  // ── Form helpers ─────────────────────────────────────────────────────────
  const total = msInputs.reduce((s, m) => s + m.amount, 0);
  const addMs = () => {
    msUID++;
    setMsInputs(prev => [...prev, { id: msUID, name: '', amount: 50 }]);
  };
  const removeMs = (id: number) => {
    if (msInputs.length <= 1) return;
    setMsInputs(prev => prev.filter(m => m.id !== id));
  };

  // ── Lock (create project) ────────────────────────────────────────────────
  async function lock() {
    if (!project.name) return showToast('Please enter a project name', '⚠');
    if (!project.freelancerWallet) return showToast("Enter the freelancer's wallet address", '⚠');
    if (msInputs.some(m => m.amount <= 0)) return showToast('All amounts must be > 0', '⚠');

    const secs = DL_SECS[project.deadline] ?? 172800;
    const clientAddr = wallet || project.clientWallet || 'GBCLIENT_DEMO';

    if (!IS_DEMO && !wallet) return showToast('Connect your Freighter wallet first', '⚠');

    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { createMilestone } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        const deadlineUnix = Math.floor(Date.now() / 1000) + secs;
        // Create one on-chain milestone per project (using project index 0)
        await createMilestone(wallet, 1, project.freelancerWallet, USDC_TOKEN, total, deadlineUnix, signTx);
      }

      const fakeTx = `${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
      setTx(fakeTx);
      setMilestones(msInputs.map((m, i) => ({
        id: i, name: m.name, amount: m.amount,
        status: 'locked', timerSecs: secs, timerMax: secs,
      })));
      setTimeline([{
        dot: 'done', time: 'Just now',
        text: `<strong>$${total} USDC locked</strong> by client — ${msInputs.length} milestone${msInputs.length > 1 ? 's' : ''} initialized`,
      }]);
      setLocked(true);
      if (clientAddr) setWallet(w => w || clientAddr);
      showToast(`<strong>$${total} USDC locked</strong> — contract deployed to Stellar testnet`, '🔒');
      setTimeout(() => setScreen('dashboard'), 1600);
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Dashboard actions ────────────────────────────────────────────────────
  async function markComplete(idx: number) {
    if (!IS_DEMO && !wallet) return showToast('Connect wallet first', '⚠');
    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { markComplete: mc } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        await mc(wallet, idx + 1, signTx);
      }
      setMilestones(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: 'waiting' };
        return updated;
      });
      setTimeline(prev => [{
        dot: 'active', time: 'Just now',
        text: `<strong>Milestone ${idx + 1} marked complete</strong> — "${milestones[idx].name}" delivered. Client review window opened.`,
      }, ...prev]);
      showToast(`<strong>${milestones[idx].name}</strong> marked complete`, '⏳');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function approveDelivery(idx: number) {
    if (!IS_DEMO && !wallet) return showToast('Connect wallet first', '⚠');
    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { confirmDelivery } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        await confirmDelivery(wallet, idx + 1, signTx);
      }
      clearInterval(timerRefs.current[idx]);
      delete timerRefs.current[idx];
      setMilestones(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: 'released' };
        return updated;
      });
      setTimeline(prev => [{
        dot: 'done', time: 'Just now',
        text: `<strong>$${milestones[idx].amount} USDC released</strong> — client approved "${milestones[idx].name}" instantly.`,
      }, ...prev]);
      showToast(`Client approved — $${milestones[idx].amount} USDC released`, '✅');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function claimPay(idx: number) {
    if (!IS_DEMO && !wallet) return showToast('Connect wallet first', '⚠');
    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { claimPayment } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        await claimPayment(wallet, idx + 1, signTx);
      }
      clearInterval(timerRefs.current[idx]);
      delete timerRefs.current[idx];
      setMilestones(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: 'released' };
        return updated;
      });
      setTimeline(prev => [{
        dot: 'done', time: 'Just now',
        text: `<strong>$${milestones[idx].amount} USDC auto-released</strong> — deadline passed, claim_payment() executed.`,
      }, ...prev]);
      showToast(`$${milestones[idx].amount} USDC released to your wallet`, '💸');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  async function submitDispute() {
    const idx = dispModal.msId;
    if (!IS_DEMO && !wallet) { setDispModal({ open: false, msId: -1 }); return showToast('Connect wallet first', '⚠'); }
    setLoading(true);
    try {
      if (!IS_DEMO) {
        const { raiseDispute } = await import('@/lib/contract');
        const { signTx } = await import('@/lib/wallet');
        await raiseDispute(wallet, idx + 1, signTx);
      }
      clearInterval(timerRefs.current[idx]);
      delete timerRefs.current[idx];
      setMilestones(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: 'disputed' };
        return updated;
      });
      setTimeline(prev => [{
        dot: 'active', time: 'Just now',
        text: `<strong>Dispute raised</strong> on "${milestones[idx].name}" — auto-release paused.`,
      }, ...prev]);
      setDispModal({ open: false, msId: -1 });
      showToast('Dispute raised on-chain — auto-release paused', '⚠');
    } catch (e: unknown) {
      showToast((e as Error).message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderBadge(status: string) {
    return (
      <span className={`badge ${status}`}>
        <span className="badge-dot" />{status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  function renderMilestoneCard(m: MilestoneState, idx: number) {
    const pct = Math.max(0, (m.timerSecs / m.timerMax) * 100);
    const canClaim = m.status === 'waiting' && m.timerSecs <= 0;
    return (
      <div className="mc" key={m.id}>
        <div className="mc-top">
          <div>
            <div className="mc-index">MILESTONE {String(idx + 1).padStart(2, '0')}</div>
            <div className="mc-name">{m.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mc-amount">{m.amount}<span>USDC</span></div>
            <div style={{ marginTop: 6 }}>{renderBadge(m.status)}</div>
          </div>
        </div>

        {m.status === 'locked' && (
          <>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', margin: '14px 0', fontSize: 13, color: 'var(--ink-3)' }}>
              Ready. Click &quot;Mark Complete&quot; once you&apos;ve delivered this milestone.
            </div>
            <div className="mc-actions">
              <button className="btn-secondary" style={{ flex: 2 }} onClick={() => markComplete(idx)} disabled={loading}>
                ✓ Mark Milestone Complete
              </button>
            </div>
          </>
        )}

        {m.status === 'waiting' && (
          <>
            <div className="review-panel">
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 8 }}>Client Review Window</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, lineHeight: 1.6 }}>
                Milestone delivered. Client can approve, dispute, or wait for auto-release.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => approveDelivery(idx)} disabled={loading} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ✓ Approve &amp; Release
                </button>
                <button onClick={() => setDispModal({ open: true, msId: idx })} disabled={loading} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  ✕ Dispute Work
                </button>
              </div>
            </div>
            <div className="timer-block">
              <div>
                <div className="timer-label">{canClaim ? 'READY TO CLAIM' : 'AUTO-RELEASE IN'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {canClaim ? 'Deadline passed' : 'Client has not responded'}
                </div>
              </div>
              <div className="timer-value" style={{ color: canClaim ? 'var(--green)' : 'var(--amber)' }}>
                {canClaim ? '00:00:00' : fmt(m.timerSecs)}
              </div>
            </div>
            <div className="timer-bar-wrap">
              <div className="timer-bar" style={{ width: `${pct}%`, background: canClaim ? 'var(--green)' : 'var(--amber)' }} />
            </div>
            <div className="mc-actions">
              <button className="btn-claim" onClick={() => claimPay(idx)} disabled={!canClaim || loading}>
                ↓ Claim ${m.amount} USDC
              </button>
            </div>
          </>
        )}

        {m.status === 'released' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', fontSize: 13, color: 'var(--green)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
            ${m.amount} USDC released to freelancer wallet
          </div>
        )}

        {m.status === 'disputed' && (
          <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '12px 14px', margin: '14px 0', fontSize: 13, color: 'var(--red)' }}>
            ⚠ Dispute active — auto-release paused. Admin notified. Awaiting resolution.
          </div>
        )}
      </div>
    );
  }

  // ── Screen 1: Create Project ─────────────────────────────────────────────
  const screenCreate = (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Screen 01 / Create Project — Client View</div>
        <h1 className="page-title">Lock funds,<br />guarantee payment.</h1>
        <p className="page-sub">Enter the freelancer&apos;s wallet, set milestones, and lock USDC before work begins.</p>
      </div>
      {IS_DEMO && (
        <div className="demo-banner">⚡ Demo mode — no contract deployed. Set NEXT_PUBLIC_CONTRACT_ID to enable real on-chain calls.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="card-label">Project Details</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input className="form-input" type="text" placeholder="e.g. Brand Identity Redesign"
                  value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Your Wallet Address (Client)</label>
                <input className="form-input" type="text" placeholder={wallet || 'Your Stellar wallet address'}
                  value={project.clientWallet} onChange={e => setProject(p => ({ ...p, clientWallet: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Freelancer&apos;s Wallet Address</label>
              <input className="form-input" type="text" placeholder="Ask your freelancer for their Stellar wallet"
                value={project.freelancerWallet} onChange={e => setProject(p => ({ ...p, freelancerWallet: e.target.value }))} />
              <div className="form-hint">Funds will be released here upon approval or deadline</div>
            </div>
          </div>

          <div className="card">
            <div className="card-label">Milestones</div>
            <div className="milestone-list">
              {msInputs.map(m => (
                <div className="milestone-item" key={m.id}>
                  <input type="text" className="ms-name" placeholder="Milestone name..." value={m.name}
                    onChange={e => setMsInputs(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} />
                  <div className="amount-wrap">
                    <span className="amount-prefix">USDC</span>
                    <input type="number" className="amount-input" value={m.amount} min={1}
                      onChange={e => setMsInputs(prev => prev.map(x => x.id === m.id ? { ...x, amount: Number(e.target.value) } : x))} />
                  </div>
                  <button className="remove-btn" onClick={() => removeMs(m.id)}>×</button>
                </div>
              ))}
            </div>
            <button className="add-ms-btn" onClick={addMs}>+ Add milestone</button>
            <div className="total-strip">
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Total to lock in escrow</span>
              <div><span className="total-amount">{total}</span><span className="total-currency">USDC</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-label">Client Review Window</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Auto-release after freelancer marks milestone complete</label>
              <select className="form-input" value={project.deadline} onChange={e => setProject(p => ({ ...p, deadline: e.target.value }))}>
                <option value="48h">48 hours (recommended)</option>
                <option value="24h">24 hours</option>
                <option value="72h">72 hours</option>
                <option value="10s">10 seconds (demo mode)</option>
              </select>
              <div className="form-hint">You have this window to approve or dispute before funds auto-release</div>
            </div>
          </div>

          <button className="btn-primary" onClick={lock} disabled={loading}>
            {loading ? <><span className="loading-spinner" /> Locking...</> : <><span>🔒</span><span>Lock ${total} USDC into Escrow</span></>}
          </button>
        </div>

        {/* Preview Sidebar */}
        <div className="sidebar-card">
          <div className="card-label">Contract Preview</div>
          <div className="escrow-display">
            <div className="escrow-label">Funds to Lock</div>
            <div><span className="escrow-amount">{total}</span><span className="escrow-unit">USDC</span></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', marginTop: 4 }}>⬡ Stellar Testnet</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Milestone Breakdown</div>
          {msInputs.map(m => (
            <div className="s-row" key={m.id}>
              <span className="s-label">{m.name || 'Untitled'}</span>
              <span className="s-val">{m.amount} USDC</span>
            </div>
          ))}
          <div className="divider" />
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Contract Terms</div>
          <div className="s-row"><span className="s-label">Network</span><span className="s-val">Stellar Testnet</span></div>
          <div className="s-row"><span className="s-label">Asset</span><span className="s-val">USDC</span></div>
          <div className="s-row"><span className="s-label">Freelancer wallet</span><span className="s-val">{shorten(project.freelancerWallet)}</span></div>
          <div className="s-row"><span className="s-label">Review window</span><span className="s-val">{DL_LABEL[project.deadline]}</span></div>
          <div className="s-row"><span className="s-label">Wire fee</span><span className="s-val" style={{ color: 'var(--green)' }}>&lt; $0.01</span></div>
          <div className="s-row"><span className="s-label">Mode</span><span className="s-val" style={{ color: IS_DEMO ? 'var(--amber)' : 'var(--green)' }}>{IS_DEMO ? 'Demo' : 'On-chain'}</span></div>
        </div>
      </div>
    </div>
  );

  // ── Screen 2: Dashboard ───────────────────────────────────────────────────
  const totalLocked = milestones.reduce((s, m) => s + m.amount, 0);
  const claimableMs = milestones.filter(m => m.status === 'waiting' && m.timerSecs <= 0);
  const claimableAmt = claimableMs.reduce((s, m) => s + m.amount, 0);

  const screenDashboard = (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Screen 02 / Freelancer Dashboard</div>
        <h1 className="page-title">Your active<br />milestones.</h1>
        <p className="page-sub">Mark milestones complete to open the client review window.</p>
      </div>
      {!locked ? (
        <div className="empty">
          <div className="empty-icon">📭</div>
          <div className="empty-title">No active project yet</div>
          <div>Go to Create Project, fill in the details, and lock funds to get started.</div>
        </div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total Locked</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>${totalLocked}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>USDC in escrow</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Claimable Now</div>
              <div className="stat-value" style={{ color: 'var(--blue)' }}>${claimableAmt}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{claimableMs.length} milestone{claimableMs.length !== 1 ? 's' : ''} ready</div>
            </div>
          </div>
          <div className="project-pill">
            <div className="pill-dot" />
            <span className="pill-name">{project.name}</span>
            <span className="pill-meta">Freelancer: {shorten(project.freelancerWallet, 8, 4)}</span>
          </div>
          {milestones.map((m, i) => renderMilestoneCard(m, i))}
        </>
      )}
    </div>
  );

  // ── Screen 3: Status ──────────────────────────────────────────────────────
  const statusMap: Record<string, { cls: string; icon: string; color: string }> = {
    locked:   { cls: 's-locked',   icon: '🔒', color: 'var(--blue)' },
    waiting:  { cls: 's-waiting',  icon: '⏳', color: 'var(--amber)' },
    released: { cls: 's-released', icon: '✅', color: 'var(--green)' },
    disputed: { cls: 's-waiting',  icon: '⚠',  color: 'var(--amber)' },
  };
  const releasedAmt = milestones.filter(m => m.status === 'released').reduce((s, m) => s + m.amount, 0);
  const disputeCount = milestones.filter(m => m.status === 'disputed').length;

  const screenStatus = (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Screen 03 / Status View</div>
        <h1 className="page-title">Payment status<br />at a glance.</h1>
        <p className="page-sub">Real-time on-chain state for every milestone.</p>
      </div>
      {!locked ? (
        <div className="empty">
          <div className="empty-icon">📊</div>
          <div className="empty-title">No project locked yet</div>
          <div>Lock funds on the Create Project screen to see live status here.</div>
        </div>
      ) : (
        <>
          <div className="status-grid">
            {milestones.map(m => {
              const s = statusMap[m.status] ?? statusMap.locked;
              return (
                <div className={`sc ${s.cls}`} key={m.id}>
                  <div className="sc-icon">{s.icon}</div>
                  <div className="sc-label" style={{ color: s.color }}>{m.status.charAt(0).toUpperCase() + m.status.slice(1)}</div>
                  <div className="sc-name">{m.name}</div>
                  <div className="sc-amt" style={{ color: s.color }}>${m.amount} <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>USDC</span></div>
                  <div className="sc-sub">
                    {m.status === 'waiting' && m.timerSecs > 0 && <span style={{ color: 'var(--amber)' }}>{fmt(m.timerSecs)} remaining</span>}
                    {m.status === 'released' && 'Funds sent'}
                    {m.status === 'disputed' && <span style={{ color: 'var(--red)' }}>Awaiting resolution</span>}
                    {m.status === 'locked' && 'Awaiting completion'}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
            <div className="card">
              <div className="card-label">On-Chain Activity</div>
              <div className="tl">
                {timeline.map((t, i) => (
                  <div className="tl-item" key={i}>
                    <div className={`tl-dot ${t.dot}`} />
                    <div className="tl-time">{t.time}</div>
                    <div className="tl-desc" dangerouslySetInnerHTML={{ __html: t.text }} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="card">
                <div className="card-label">Contract Summary</div>
                <div className="escrow-display" style={{ marginBottom: 14 }}>
                  <div className="escrow-label">Remaining in Escrow</div>
                  <div><span className="escrow-amount" style={{ fontSize: 28 }}>{totalLocked - releasedAmt}</span><span className="escrow-unit">USDC</span></div>
                </div>
                <div className="s-row"><span className="s-label">Project</span><span className="s-val">{project.name}</span></div>
                <div className="s-row"><span className="s-label">Total locked</span><span className="s-val">${totalLocked} USDC</span></div>
                <div className="s-row"><span className="s-label">Released</span><span className="s-val" style={{ color: 'var(--green)' }}>${releasedAmt} USDC</span></div>
                <div className="s-row"><span className="s-label">Milestones</span><span className="s-val">{milestones.length} total</span></div>
                <div className="s-row"><span className="s-label">Freelancer</span><span className="s-val">{shorten(project.freelancerWallet, 8, 4)}</span></div>
                <div className="s-row"><span className="s-label">Disputes</span><span className="s-val">{disputeCount > 0 ? `${disputeCount} active` : 'None'}</span></div>
                <div className="s-row"><span className="s-label">Mode</span><span className="s-val" style={{ color: IS_DEMO ? 'var(--amber)' : 'var(--green)' }}>{IS_DEMO ? 'Demo' : 'On-chain'}</span></div>
              </div>
              <div className="tx-hash">
                <div className="tx-label">TX</div>
                <div className="tx-value">{tx || '—'}</div>
                {tx && <button onClick={() => { navigator.clipboard?.writeText(tx); showToast('TX hash copied', '⎘'); }} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13 }}>⎘</button>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ── Root render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="app">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-brand">
            <div className="brand-mark">M</div>
            <div>
              <div className="brand-name">MilestonePay</div>
              <div className="brand-tagline">anti-ghosting payment system</div>
            </div>
          </div>
          <nav className="topbar-nav">
            {(['create', 'dashboard', 'status'] as const).map(s => (
              <button key={s} className={`nav-tab${screen === s ? ' active' : ''}`} onClick={() => setScreen(s)}>
                {s === 'create' ? 'Create Project' : s === 'dashboard' ? 'Dashboard' : 'Status'}
              </button>
            ))}
          </nav>
          <div className="wallet-group">
            {wallet ? (
              <div className="wallet-badge">
                <div className="wallet-dot" />
                {shorten(wallet)}
              </div>
            ) : (
              <button className="btn-connect" onClick={connectWallet}>Connect Wallet</button>
            )}
          </div>
        </header>

        {/* Screens */}
        <div className={`screen${screen === 'create' ? ' active' : ''}`}>{screenCreate}</div>
        <div className={`screen${screen === 'dashboard' ? ' active' : ''}`}>{screenDashboard}</div>
        <div className={`screen${screen === 'status' ? ' active' : ''}`}>{screenStatus}</div>
      </div>

      {/* Toast */}
      <div className={`toast${toast.show ? ' show' : ''}`}>
        <span className="toast-icon">{toast.icon}</span>
        <div dangerouslySetInnerHTML={{ __html: toast.msg }} />
      </div>

      {/* Dispute Modal */}
      {dispModal.open && (
        <div onClick={e => { if (e.target === e.currentTarget) setDispModal({ open: false, msId: -1 }); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-med)', borderRadius: 'var(--radius-xl)', padding: 32, maxWidth: 440, width: '90%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--red)', borderRadius: '24px 24px 0 0' }} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 10 }}>Dispute Resolution</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Flag a Dispute</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 24, lineHeight: 1.6 }}>
              Auto-release will be <strong style={{ color: 'var(--amber)' }}>paused</strong>. Both parties have 72 hours to resolve.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Reason</label>
              <select className="form-input">
                <option>Client requesting unpaid revisions</option>
                <option>Client unresponsive after delivery</option>
                <option>Scope changed without agreement</option>
                <option>Other</option>
              </select>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>3-Step Resolution</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                <div>1. raise_dispute() — auto-release paused</div>
                <div>2. Both parties submit evidence within 72h</div>
                <div>3. Admin calls resolve_dispute(winner)</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setDispModal({ open: false, msId: -1 })}>Cancel</button>
              <button onClick={submitDispute} disabled={loading} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? <><span className="loading-spinner" /> Submitting...</> : '⚠ Raise Dispute On-Chain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Banner */}
      <div className={`ob-banner${bannerHidden ? ' hidden' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, background: 'var(--blue-dim)', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 18 }}>👛</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>New to Stellar wallets?</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>You&apos;ll need Freighter to lock and receive USDC. Takes 2 minutes.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="https://freighter.app" target="_blank" rel="noreferrer" style={{ padding: '9px 16px', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            Install Freighter →
          </a>
          <button onClick={() => setBannerHidden(true)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 20, padding: '4px 8px' }}>×</button>
        </div>
      </div>
    </>
  );
}
