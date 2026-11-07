import type { MatchPlayer, Point, Scenario, EvaluationLevel } from "./types";
import type { BallDelivery } from "./ballFlight";

export type IQRole =
  "gk" | "cb" | "fb" | "six" | "eight" | "ten" | "wing" | "nine";
export type IQPosition = "goalkeeper" | "defender" | "midfielder" | "forward";
export type JourneyMode = "learn" | "challenge";
export type JourneyPattern =
  | "build"
  | "third"
  | "wide"
  | "counter"
  | "receive"
  | "finish"
  | "cover"
  | "press"
  | "recover"
  | "keeper-build"
  | "keeper-sweep"
  | "switch-air"
  | "chip-line"
  | "wide-cross"
  | "air-control"
  | "third-air"
  | "defend-air"
  | "wide-return";
export type JourneyAction =
  | "pass"
  | "move"
  | "carry"
  | "cover"
  | "press"
  | "mark"
  | "finish"
  | "transition"
  | "play"
  | "wait";
export type TacticalIntent =
  | "pass"
  | "carry"
  | "move"
  | "decoy"
  | "cover"
  | "press"
  | "mark"
  | "hold"
  | "wait"
  | "shoot";
export type DribbleStyle =
  "direct" | "cut-left" | "cut-right" | "stop-go" | "turn-back" | "shield";
export type ActionTiming = "now" | "delay";
export type JourneyQuality = "good" | "possible" | "error";
export type JourneyOutcome =
  | "progress"
  | "retained"
  | "chance"
  | "blocked"
  | "loss"
  | "recovered"
  | "contained";
export type JourneyDefinition = {
  id: string;
  topicId: string;
  title: string;
  role: IQRole;
  pattern: JourneyPattern;
  focus: string;
  context: 0 | 1 | 2;
  contextLabel: string;
  ordinal: number;
  steps: JourneyAction[];
  revision?: 2 | 3;
  concept?: "third-player" | "overload-switch" | "press-cover";
  delivery?: Exclude<BallDelivery, "ground">;
};
export type JourneyWorld = {
  looseBall?: Point;
  positions: Record<string, Point>;
  carrierId: string;
  headings: Record<string, number>;
  distances: Record<string, number>;
};
export type JourneyChoice = {
  id: string;
  label: string;
  point: Point;
  targetId?: string;
  quality: JourneyQuality;
  why: string;
  delivery?: BallDelivery;
  intent?: TacticalIntent;
  style?: DribbleStyle;
  timing?: ActionTiming;
};
export type JourneyStep = {
  kind: JourneyAction;
  prompt: string;
  instruction: string;
  cue: string;
  choices: JourneyChoice[];
};
export type JourneyBeat = {
  /** Version 8: simultaneous, deterministic simulation samples; never used by old replays. */
  live?: {
    time: number;
    world: JourneyWorld;
    ball: Point;
    height: number;
    inFlight: boolean;
    kicker?: string;
    kickTime?: number;
  }[];
  events?: { time: number; text: string }[];
  revision?: 2;
  id: string;
  before: JourneyWorld;
  after: JourneyWorld;
  kind: "pass" | "move" | "hold";
  actorId: string;
  receiverId?: string;
  duration: number;
  from: Point;
  to: Point;
  text: string;
  loft?: boolean;
  shot?: boolean;
  delivery?: BallDelivery;
  flightSeconds?: number;
  controlSeconds?: number;
  flightEnd?: number;
  landingHeight?: number;
  flightDistance?: number;
  receiveAt?: Point;
  autonomous?: {
    intent: TacticalIntent;
    reason: string;
    team: "home" | "away";
  };
};
export type JourneyDecision = {
  index: number;
  action: JourneyAction;
  choiceId: string;
  label: string;
  quality: JourneyQuality;
  why: string;
  before: JourneyWorld;
  after: JourneyWorld;
  alternative: JourneyChoice | null;
  firstBeat: number;
  lastBeat: number;
  decisionSeconds: number;
  actorId?: string;
};
export type TacticalForecast = {
  decisionIndex: number;
  rivalId: string;
  predicted: "ball" | "follow" | "cover";
  actual: "ball" | "follow" | "cover" | "mixed";
  plan: "support" | "protect" | "scan";
};
export type JourneySession = {
  forecasts?: TacticalForecast[];
  /** Absent in saved pre-22 engines; their replays retain the original rules. */
  rulesVersion?: 4 | 5 | 6 | 7 | 8 | 9;
  attack?: {
    elapsed: number;
    home: number;
    away: number;
    shots: number;
    finish?: "goal" | "miss" | "offside" | "stopped";
  };
  controlledId?: string;
  finishTeam?: "home" | "away";
  definition: JourneyDefinition;
  scenario: Scenario;
  players: MatchPlayer[];
  initial: JourneyWorld;
  world: JourneyWorld;
  step: number;
  decisions: JourneyDecision[];
  beats: JourneyBeat[];
  outcome: JourneyOutcome | null;
  transition?: "choose" | "done";
};
export type JourneyAttempt = {
  forecasts?: TacticalForecast[];
  version: 1;
  bankVersion: string;
  id: string;
  scenarioId: string;
  role: IQRole;
  mode: JourneyMode;
  createdAt: string;
  choices: { id: string; seconds: number }[];
  outcome: JourneyOutcome;
  verdict: EvaluationLevel;
};
