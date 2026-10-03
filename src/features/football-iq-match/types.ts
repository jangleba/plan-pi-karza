export type Point = { x: number; y: number };
export type Team = "home" | "away";
export type ActionMode = "run" | "pass" | "shift";
export type Phase = "intro" | "countdown" | "plan" | "playback" | "feedback";

export type MatchPlayer = Point & {
  id: string;
  team: Team;
  number: number;
  role: string;
  controlled?: boolean;
  goalkeeper?: boolean;
};

export type MovementAction = {
  id: string;
  type: "run" | "shift";
  playerId: string;
  from: Point;
  to: Point;
};

export type PassAction = {
  id: string;
  type: "pass";
  playerId: string;
  targetId: string;
  from: Point;
  to: Point;
};

export type PlannedAction = MovementAction | PassAction;

export type Scenario = {
  id: string;
  title: string;
  question: string;
  focus: string;
  seconds: number;
  controlledPlayerId: string;
  ballCarrierId: string;
  players: MatchPlayer[];
  referenceActions: PlannedAction[];
};

export type EvaluationLevel = "strong" | "conditional" | "risky";

export type Evaluation = {
  level: EvaluationLevel;
  label: string;
  summary: string;
  timing: string;
  space: string;
  consequence: string;
  recommendation: string;
};
