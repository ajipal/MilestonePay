export type MilestoneStatus = 'locked' | 'waiting' | 'released' | 'disputed';

export interface MilestoneState {
  id: number;
  name: string;
  amount: number;
  status: MilestoneStatus;
  timerSecs: number;
  timerMax: number;
}

export interface MsInput {
  id: number;
  name: string;
  amount: number;
}

export interface TimelineEntry {
  dot: 'done' | 'active';
  time: string;
  text: string;
}

export interface ProjectConfig {
  name: string;
  clientWallet: string;
  freelancerWallet: string;
  deadline: string;
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
