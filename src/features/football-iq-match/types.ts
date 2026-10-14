export type Point = { x: number; y: number };
export type Team = "home" | "away";
export type ActionMode =
  | "pass"
  | "through"
  | "cross"
  | "shot"
  | "carry"
  | "run"
  | "shift"
  | "hold"
  | "press"
  | "cover"
  | "mark";
export type Phase = "intro" | "plan" | "playback" | "feedback";

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
  type: "run" | "shift" | "carry" | "hold" | "press" | "cover" | "mark";
  playerId: string;
  from: Point;
  to: Point;
  opponentId?: string;
};

export type PassAction = {
  id: string;
  type: "pass";
  playerId: string;
  targetId: string;
  delivery?: "ground" | "through" | "cross";
  from: Point;
  to: Point;
};

export type ShotAction = { id: string; type: "shot"; playerId: string; from: Point; to: Point };
export type PlannedAction = MovementAction | PassAction | ShotAction;
export type DecisionGoal = {
  id: string;
  type: PlannedAction["type"];
  playerIds?: string[];
  targetIds?: string[];
  zone?: { xMin: number; xMax: number; yMin: number; yMax: number };
  requiresBall?: boolean;
  afterGoalId?: string;
  description: string;
};
export type ScenarioCoaching = {
  success: string;
  partial: string;
  risk: string;
  timing: string;
  space: string;
  consequence: string;
  recommendation: string;
};

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
  category?: string;
  goals?: DecisionGoal[];
  coaching?: ScenarioCoaching;
  simulation?: { reaction: number; defenderSpeed: number };
  defensive?: boolean;
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
  highlights?: Point[];
  events?: { text: string; time: number; actionIndex: number }[];
  decisionSeconds?: number;
};
