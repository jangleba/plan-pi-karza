export type Team = "home" | "away";
export type Phase =
  | "intro"
  | "countdown"
  | "observe"
  | "plan"
  | "playback"
  | "feedback"
  | "compare";

export type TacticalIntent = "switch" | "progress" | "retain" | "secure";
export type EvaluationLevel = "strong" | "conditional" | "risky";

export type Point = { x: number; y: number };

export type MatchPlayer = Point & {
  id: string;
  team: Team;
  number: number;
  role: string;
  controlled?: boolean;
  goalkeeper?: boolean;
  from?: Point;
};

export type BallState = Point & { carrierId?: string };

export type PlannedMove = {
  playerId: string;
  from: Point;
  to: Point;
};

export type PlannedMovementAction = {
  id: string;
  type: "run";
  order: number;
  moves: PlannedMove[];
};

export type PlannedPassAction = {
  id: string;
  type: "pass";
  order: number;
  from: Point;
  to: Point;
  passerId?: string;
  receiverId?: string;
};

export type PlannedAction = PlannedMovementAction | PlannedPassAction;

export type UserPlan = {
  actions: PlannedAction[];
};

export type Scenario = {
  id: string;
  title: string;
  focus: string;
  prompt: string;
  cue: string;
  controlledPlayerId: string;
  players: MatchPlayer[];
  ball: BallState;
  observationMs: number;
  decisionSeconds: number;
  playbackMs: number;
  preferredRunZones: Point[];
  preferredPassZones: Point[];
  acceptedIntents: TacticalIntent[];
  reactionSummary: string;
  coachPrinciple: string;
  goodFeedback: string;
  improveFeedback: string;
};

export type EvaluationMetric = {
  level: EvaluationLevel;
  label: string;
  detail: string;
};

export type EvaluationMetrics = {
  timing: EvaluationMetric;
  spatialDecision: EvaluationMetric;
  consequence: EvaluationMetric;
};

export type Evaluation = {
  verdict: EvaluationLevel;
  verdictLabel: string;
  title: string;
  summary: string;
  strengths: string[];
  issues: string[];
  recommendation: string;
  metrics: EvaluationMetrics;
  reaction: string;
  tags: string[];
};
