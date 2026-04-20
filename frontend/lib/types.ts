export type PageName = 'connect' | 'role' | 'dashboard' | 'create' | 'project' | 'milestone' | 'status';
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
  tx: string;
  milestones: MilestoneData[];
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  dot: 'done' | 'act';
  time: string;
  text: string;
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
