export type Team = "home" | "away";
export type Phase = "intro" | "countdown" | "observe" | "plan" | "playback" | "feedback";

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

export type PlannedRun = {
  playerId: string;
  from: Point;
  to: Point;
};

export type PlannedPass = {
  from: Point;
  to: Point;
  receiverId?: string;
};

export type UserPlan = {
  runs: PlannedRun[];
  pass?: PlannedPass;
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
  goodFeedback: string;
  improveFeedback: string;
};

export type Evaluation = {
  score: number;
  title: string;
  message: string;
  tags: string[];
};
