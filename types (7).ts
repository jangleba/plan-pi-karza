export type ReactiveMode =
  | "directions"
  | "colors"
  | "opponent"
  | "combo"
  | "flash"
  | "sequence"
  | "custom";

export type ReactiveLevel = "basic" | "intermediate" | "advanced";
export type ReactiveDirection = "left" | "right" | "forward" | "back";
export type ReactiveColor = "blue" | "green" | "yellow" | "red";

export interface ReactiveCustomAction {
  id: string;
  label: string;
  direction?: ReactiveDirection | null;
  color?: ReactiveColor | null;
}

export interface ReactiveCustomSet {
  id: string;
  name: string;
  actions: ReactiveCustomAction[];
  createdAt: string;
}

export interface ReactiveSettings {
  mode: ReactiveMode;
  level: ReactiveLevel;
  intervalSec: number;
  randomTiming: boolean;
  durationMin: number | null;
  vibration: boolean;
  flashDurationMs: number;
  activeDirections: ReactiveDirection[];
  activeColors: ReactiveColor[];
  sequenceLength: number;
  customSetId: string | null;
}

export interface ReactiveCue {
  id: string;
  mode: ReactiveMode;
  direction: ReactiveDirection | null;
  color: ReactiveColor | null;
  blockedDirection: ReactiveDirection | null;
  sequence: ReactiveDirection[];
  customAction: ReactiveCustomAction | null;
  isDecisionChange: boolean;
}

export interface ReactiveSessionStats {
  startedAt: string;
  endedAt: string | null;
  elapsedSec: number;
  cueCount: number;
  decisionChanges: number;
  directionCounts: Record<ReactiveDirection, number>;
  colorCounts: Record<ReactiveColor, number>;
  mode: ReactiveMode;
  intervalSec: number;
  randomTiming: boolean;
}

