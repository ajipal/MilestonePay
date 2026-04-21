import { supabase } from './supabase';
import type { MilestoneData, Project, UserRole } from './types';

export async function getUserProfile(wallet: string): Promise<{ role: UserRole | null; name: string | null } | null> {
  const { data } = await supabase
    .from('users')
    .select('role, name')
    .eq('wallet', wallet)
    .single();
  if (!data) return null;
  return { role: (data.role as UserRole) ?? null, name: data.name ?? null };
}

export async function getUserRole(wallet: string): Promise<UserRole | null> {
  const profile = await getUserProfile(wallet);
  return profile?.role ?? null;
}

export async function saveUserRole(wallet: string, role: UserRole) {
  const { error } = await supabase.from('users').upsert({ wallet, role });
  if (error) throw new Error(error.message);
}

export async function saveUserName(wallet: string, name: string) {
  const { error } = await supabase.from('users').upsert({ wallet, name });
  if (error) throw new Error(error.message);
}

export async function loadProjects(wallet: string, role: UserRole): Promise<Project[]> {
  const col = role === 'client' ? 'client_wallet' : 'freelancer_wallet';
  const { data, error } = await supabase
    .from('projects')
    .select('*, milestones(*), timeline(*)')
    .eq(col, wallet)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  const now = Date.now();
  return data.map(p => ({
    id: p.id,
    name: p.name,
    clientWallet: p.client_wallet,
    freelancerWallet: p.freelancer_wallet,
    deadline: p.deadline,
    projectDeadline: p.project_deadline ?? null,
    tx: p.tx_hash ?? '',
    milestones: ((p.milestones ?? []) as any[])
      .sort((a, b) => a.id - b.id)
      .map((m): MilestoneData => {
        const expiresAt = m.review_expires_at ? new Date(m.review_expires_at).getTime() : null;
        const timerSecs = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
        return {
          id: m.id,
          projId: p.id,
          name: m.name,
          desc: m.description ?? '',
          amount: Number(m.amount),
          status: m.status,
          timerSecs,
          timerMax: p.deadline,
          proofLink: m.proof_link ?? '',
          proofFileUrl: m.proof_file_url ?? '',
          revFee: m.rev_fee ?? 0,
          revFeedback: m.rev_feedback ?? '',
        };
      }),
    timeline: ((p.timeline ?? []) as any[])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(t => ({ dot: t.dot as 'done' | 'act', time: t.time, text: t.text })),
  }));
}

export async function createProject(
  name: string,
  clientWallet: string,
  freelancerWallet: string,
  deadline: number,
  milestones: { name: string; desc: string; amount: number }[],
  projectDeadline?: string,
): Promise<{ projectId: number; milestoneIds: number[] }> {
  const { data: proj, error: projErr } = await supabase
    .from('projects')
    .insert({ name, client_wallet: clientWallet, freelancer_wallet: freelancerWallet, deadline, project_deadline: projectDeadline || null })
    .select('id')
    .single();
  if (projErr || !proj) throw new Error(projErr?.message ?? 'Failed to create project');

  const { data: msData, error: msErr } = await supabase.from('milestones').insert(
    milestones.map(m => ({
      project_id: proj.id,
      name: m.name,
      description: m.desc,
      amount: m.amount,
      status: 'created',
    }))
  ).select('id');
  if (msErr) throw new Error(msErr.message);

  return { projectId: proj.id, milestoneIds: (msData ?? []).map((m: { id: number }) => m.id) };
}

export async function updateProjectTx(projectId: number, txHash: string) {
  await supabase.from('projects').update({ tx_hash: txHash }).eq('id', projectId);
}

export async function updateMsStatus(
  milestoneId: number,
  patch: {
    status?: string;
    review_expires_at?: string | null;
    proof_link?: string;
    proof_file_url?: string;
    rev_fee?: number;
    rev_feedback?: string;
    amount?: number;
  }
) {
  const { error } = await supabase.from('milestones').update(patch).eq('id', milestoneId);
  if (error) throw new Error(error.message);
}

export async function loadProjectMilestones(projectId: number): Promise<{ id: number; status: string; amount: number }[]> {
  const { data } = await supabase
    .from('milestones')
    .select('id, status, amount')
    .eq('project_id', projectId)
    .order('id', { ascending: true });
  return (data ?? []) as { id: number; status: string; amount: number }[];
}

export async function deleteProject(projectId: number) {
  await supabase.from('timeline').delete().eq('project_id', projectId);
  await supabase.from('milestones').delete().eq('project_id', projectId);
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw new Error(error.message);
}

export async function addTimeline(projectId: number, dot: 'done' | 'act', text: string) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await supabase.from('timeline').insert({ project_id: projectId, dot, time, text });
}

export async function createDispute(
  milestoneId: number,
  projectId: number,
  raisedBy: string,
  raisedByRole: string,
  reason: string,
  fileLink?: string,
  designLink?: string,
  repoLink?: string,
) {
  const { error } = await supabase.from('disputes').insert({
    milestone_id: milestoneId,
    project_id: projectId,
    raised_by: raisedBy,
    raised_by_role: raisedByRole,
    reason,
    file_link: fileLink || null,
    design_link: designLink || null,
    repo_link: repoLink || null,
  });
  if (error) throw new Error(error.message);
}

export async function loadAdminDisputes() {
  const { data, error } = await supabase
    .from('disputes')
    .select('*, milestones(*, projects(*))')
    .is('resolution', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function resolveDisputeDb(
  milestoneId: number,
  resolution: 'freelancer' | 'client',
  newStatus: 'released' | 'created',
) {
  const now = new Date().toISOString();
  await supabase.from('disputes')
    .update({ resolution, resolved_at: now })
    .eq('milestone_id', milestoneId)
    .is('resolution', null);
  await supabase.from('milestones')
    .update({ status: newStatus })
    .eq('id', milestoneId);
}

export async function uploadProofFile(file: File, milestoneId: number): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `proofs/${milestoneId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('proof-files').upload(path, file);
  if (error) throw new Error('Upload failed: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('proof-files').getPublicUrl(path);
  return publicUrl;
}
