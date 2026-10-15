import type { MatchPlayer, Point, Scenario, EvaluationLevel } from "./types";

export type IQRole = "gk" | "cb" | "fb" | "six" | "eight" | "ten" | "wing" | "nine";
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
  | "keeper-sweep";
export type JourneyAction = "pass" | "move" | "carry" | "cover" | "press" | "mark" | "finish";
export type JourneyQuality = "good" | "possible" | "error";
export type JourneyOutcome = "progress" | "retained" | "chance" | "blocked" | "loss" | "recovered";
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
};
export type JourneyWorld = {
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
};
export type JourneyStep = {
  kind: JourneyAction;
  prompt: string;
  instruction: string;
  cue: string;
  choices: JourneyChoice[];
};
export type JourneyBeat = {
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
};
export type JourneySession = {
  definition: JourneyDefinition;
  scenario: Scenario;
  players: MatchPlayer[];
  initial: JourneyWorld;
  world: JourneyWorld;
  step: number;
  decisions: JourneyDecision[];
  beats: JourneyBeat[];
  outcome: JourneyOutcome | null;
};
export type JourneyAttempt = {
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
