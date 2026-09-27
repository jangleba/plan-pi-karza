export type SprintFlowPhase = "idle" | "exercise" | "rest" | "complete";

export interface SprintExercise {
  id: string;
  title: string;
  prescription: string;
  sets?: number;
  restSeconds?: number;
  visualSrc?: string;
  intent?: string;
  howTo?: readonly string[];
  avoid?: string;
  phaseLabels?: readonly string[];
  details?: string;
}

export interface SprintBlock {
  id: string;
  number: string;
  title: string;
  estimatedMinutes: number;
  exercises: readonly SprintExercise[];
}

export interface SprintSession {
  id: string;
  title: string;
  estimatedMinutes: number;
  blocks: readonly SprintBlock[];
}

export type PendingAdvance = "next-set" | "next-exercise" | null;

export interface SprintFlowState {
  version: 1;
  phase: SprintFlowPhase;
  blockIndex: number;
  exerciseIndex: number;
  setIndex: number;
  secondsRemaining: number;
  pendingAdvance: PendingAdvance;
  updatedAt: number;
}

