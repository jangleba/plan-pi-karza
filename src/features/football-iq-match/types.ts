export type Team = "home" | "away";
export type Phase =
  | "intro"
  | "countdown"
  | "observe"
  | "plan"
  | "intent"
  | "playback"
  | "feedback"
  | "compare";

export type ActionMode = "run" | "pass" | "group";
export type TacticalIntent = "switch" | "progress" | "retain" | "secure";

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
  type: "run" | "group";
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
  intent?: TacticalIntent;
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

export type EvaluationMetrics = {
  space: number;
  timing: number;
  passing: number;
  risk: number;
  structure: number;
};

export type Evaluation = {
  score: number;
  title: string;
  summary: string;
  strengths: string[];
  issues: string[];
  recommendation: string;
  metrics: EvaluationMetrics;
  reaction: string;
  tags: string[];
};
