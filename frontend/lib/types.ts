export type PageName = 'connect' | 'name' | 'role' | 'dashboard' | 'create' | 'project' | 'milestone' | 'status' | 'admin';
export type UserRole = 'client' | 'freelancer';
export type MsStatus = 'created' | 'progress' | 'review' | 'revision' | 'released' | 'disputed';

export interface BuildMs {
  id: number;
  title: string;
  desc: string;
  amount: number;
}

export interface MilestoneData {
  id: number;
  projId: number;
  name: string;
  desc: string;
  amount: number;
  status: MsStatus;
  timerSecs: number;
  timerMax: number;
  proofLink: string;
  proofFileUrl: string;
  revFee: number;
  revFeedback: string;
}

export interface Project {
  id: number;
  name: string;
  clientWallet: string;
  freelancerWallet: string;
  deadline: number;
  projectDeadline?: string | null;
  tx: string;
  milestones: MilestoneData[];
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  dot: 'done' | 'act';
  time: string;
  text: string;
}

export interface AdminDispute {
  id: number;
  milestone_id: number;
  project_id: number;
  raised_by: string;
  raised_by_role: string;
  reason: string;
  file_link: string | null;
  design_link: string | null;
  repo_link: string | null;
  created_at: string;
  milestones: {
    id: number;
    name: string;
    amount: number;
    status: string;
    proof_link: string | null;
    proof_file_url: string | null;
    projects: {
      id: number;
      name: string;
      client_wallet: string;
      freelancer_wallet: string;
    };
  };
}

export interface OnChainMilestone {
  client: string;
  freelancer: string;
  amount: bigint;
  token: string;
  deadline: bigint;
  completed: boolean;
  released: boolean;
  disputed: boolean;
}
