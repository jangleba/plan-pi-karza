import type { Profile, Readiness, SessionDay } from "../types";
import { preparationProfile } from "./preparation";

export const ENGINE_VERSION = "ballwise-v2.18";
export type Tier = "foundation" | "development" | "performance";
export type Role =
  | "knee_strength"
  | "hip_strength"
  | "unilateral_strength"
  | "knee_flexion"
  | "hamstring_iso"
  | "hamstring_dynamic_support"
  | "quad_iso"
  | "iso_primer"
  | "adductor"
  | "calf_straight"
  | "calf_bent"
  | "push"
  | "pull"
  | "trunk"
  | "power"
  | "upper_power"
  | "landing"
  | "speed"
  | "endurance"
  | "warmup"
  | "mobility"
  | "breathing"
  | "ball_skill";
export type SupportRole = "activation" | "recovery" | "mobility" | "skills";
export interface Dose {
  /** Planned seconds per repetition for a controlled tempo; never a measured velocity. */
  tempo?: { eccentricSeconds: number; pauseSeconds: number; concentricSeconds: number };
  gymBandSelectionId?: string;
  /** Measured setup identity; never a colour-derived or estimated band load. */
  gymBandSetup?: import("./gymProgression").GymBandSetup;
  sequence?: { distanceM: number; runOutM: number; instruction: string }[];
  sequenceStep?: { round: number; rounds: number; attempt: number; attempts: number };
  speedStage?:
    "preparation" | "technical" | "buildup" | "resisted" | "main" | "addition" | "cooldown";
  circuit?: {
    id: string;
    roundRestSeconds: number;
    round?: number;
    rounds?: number;
    task?: number;
  };
  fastMetres?: number;
  runOutM?: number;
  contactsPerRep?: number;
  /** Intra-set rest is additional to the ordinary between-set rest. */
  cluster?: { repGroups: number[]; intraRestSeconds: number };
  sets: number;
  reps?: number;
  seconds?: number;
  restSeconds: number;
  postRestSeconds?: number;
  /**
   * Repetitions of a short isometric hold (“5 × 1 s”): the coach's note counts holds, not a
   * continuous time. With `seconds` it is the length of each hold; without it the repetitions
   * are the dose itself (“iso switch 5/leg”).
   */
  holdReps?: number;
  /**
   * In a note group whose exercises have different numbers of sets: how many of this exercise's
   * sets have a partner in the round; the remaining sets are done alone and rest `soloRestSeconds`.
   */
  pairedSets?: number;
  soloRestSeconds?: number;
  perSide?: boolean;
  rir?: number;
  distanceM?: number;
  runInM?: number;
  jointAngleDegrees?: number;
  assistance?: string;
  intent: "controlled" | "explosive" | "hold" | "easy";
}
export const ROLE_NAMES: Record<Role, string> = {
  knee_strength: "siła nóg w przysiadzie",
  hip_strength: "siła wyprostu biodra",
  unilateral_strength: "siła jednonóż",
  knee_flexion: "siła zgięcia kolana",
  hamstring_iso: "izometria tyłu uda",
  hamstring_dynamic_support: "krótka dynamiczna praca tyłu uda",
  quad_iso: "izometria przodu uda",
  iso_primer: "nadzorowany blok izometryczny przed częścią główną",
  adductor: "siła przywodzicieli",
  calf_straight: "łydka z prostym kolanem",
  calf_bent: "łydka ze zgiętym kolanem",
  push: "pchanie góry ciała",
  pull: "przyciąganie góry ciała",
  trunk: "kontrola tułowia",
  power: "moc",
  upper_power: "szybki rzut piłką lekarską",
  landing: "kontrola lądowania i zatrzymania",
  speed: "szybkość",
  endurance: "wydolność tlenowa",
  warmup: "przygotowanie do treningu",
  mobility: "kontrolowany zakres ruchu",
  breathing: "spokojny oddech",
  ball_skill: "technika z piłką",
};
export type SprintGoal =
  "acceleration" | "max_velocity" | "curve" | "braking" | "planned_cod" | "reactive";
export interface SprintVariantRef {
  goal: SprintGoal;
  mainVariantId: string;
  drillSetId: string;
  /** Optional small addition used in this session (null when none). */
  addition: string | null;
  /** Short, human-readable reasons for the choice (rotation, level, space, equipment). */
  why: string[];
  /** The goal the player or the cycle asked for, when it differs from `goal`. */
  requestedGoal?: SprintGoal;
  /** Why the requested goal was replaced by an alternative (never an unexplained swap). */
  goalChange?: { code: string; reason: string };
  /** The plyometric block of this session (null when none), for rotation and weekly load. */
  plyometric?: string | null;
}
export interface ExerciseDecision {
  exerciseId: string;
  role: Role;
  dose: Dose;
  reason: string;
  /** Explicit stage for the adaptive sports days; never implies a superset. */
  strengthStage?: "prep" | "main" | "accessory" | "cooldown";
}
export interface EngineSession {
  /** Adaptive two-day sports structure; exercise eligibility and dose remain individual. */
  strengthStructure?: "athletic_ab";
  /** Optional rows omitted for time, distinct from functions unavailable with the declared equipment. */
  strengthTimeOmissions?: { exerciseId: string; role: Role }[];
  /** Stable within a cycle: which equivalent eligible strength exercises were chosen (cycle recommendation "vary"). */
  exerciseRotation?: number;
  gymFeedbackRevision?: string;
  strengthFocus?: import("./strengthPolicy").StrengthFocus;
  upperContrast?: {
    exerciseIds: [string, string];
    transitionSeconds: number;
    roundRestSeconds: number;
    originalPushDose: Dose;
    originalPushReason: string;
    originalPullDose?: Dose;
    originalUpperPair?: NonNullable<EngineSession["strengthPairs"]>[number];
  };
  /** Noncompeting accessory pairs; distinct from a heavy strength/power contrast. */
  strengthPairs?: {
    roles: [Role, Role];
    label: string;
    transitionSeconds: number;
    roundRestSeconds: number;
  }[];
  gymProgressionDecisions?: import("./gymProgression").GymProgressionDecision[];
  runningCalibrationKey?: string;
  sprintRecipeVersion?: 1;
  /** Version 1 stores the existing strength preparation as explicit exercise rows. */
  strengthPreparationVersion?: 1;
  sprintGoal?: SprintGoal;
  /** Which qualified variant and drill set were chosen when the plan was saved, and why. */
  sprintVariant?: SprintVariantRef;
  /** Known prescribed landing events in explicitly counted jump tasks, not estimated drill contacts. */
  plyometricContacts?: number;
  cycle?: CycleContext;
  variant?: "full" | "compact";
  runningRecipe?: import("@/lib/running/recipe").RunningRecipe;
  roles: ("strengthA" | "strengthB" | "speed" | "endurance" | SupportRole)[];
  organization?: "straight" | "power_first" | "contrast" | "complex";
  /**
   * A strength session on the day after a match (MD+1), used only when the week has no other
   * date for it: "full" for advanced/elite players, "upper" (upper body + trunk) for the rest.
   */
  postMatch?: "full" | "upper";
  /**
   * Why a strength session is not the first-choice coaching-note session (advancedSessions.ts):
   * a concrete, structured cause. Absent when the requested note was used unchanged.
   */
  strengthPath?: StrengthPathNote;
  /** Advanced 16+ session following the athlete's coaching notes (advancedSessions.ts). */
  advancedTemplate?: import("./advancedSessions").AdvancedTemplateId;
  /** Pairs of an advanced session: first exercise, 30 s transition, second, then the round rest. */
  /** Groups of a note session (1a → 1b → 1c): 30 s transitions, then the round rest. */
  complexPairs?: {
    label: string;
    kind: import("./advancedSessions").PairKind;
    exerciseIds: string[];
    transitionSeconds: number;
    roundRestSeconds: number;
  }[];
  /** Exercises left out within two days of a match. */
  skipNearMatch?: string[];
  /** Exercises that may be left out to fit a shorter time budget. */
  optionalExercises?: string[];
  tier: Tier;
  highLower: boolean;
  exercises: ExerciseDecision[];
  missing: Role[];
  minutes: number;
  sprintMetres: number;
  phase: "adaptation" | "development" | "peak" | "deload";
}
export interface CycleContext {
  anchorDate: string;
  weekIndex: number;
  state: "build" | "review" | "deload" | "reentry";
  reason: string;
}
/** Why a stimulus is limited or missing; the five causes are never mixed. */
export type LimitationCause = "recipe" | "equipment" | "preparation" | "time" | "calendar";
export interface StrengthPathNote {
  /** "note": a coaching-note template (maybe another than first choice); "standard": usual A/B. */
  path: "note" | "standard";
  code: string;
  /** Absent when the cause is the player's own layout choice, not a limitation. */
  cause?: LimitationCause;
  message: string;
  /** The note that was first choice but could not be used. */
  requestedTemplate?: string;
}
export interface Issue {
  code: string;
  date?: string;
  message: string;
  /** Structural cause of a limitation; absent for older saved plans and neutral diagnostics. */
  cause?: LimitationCause;
  /** Weekly target a diagnostic refers to; absent for older saved plans. */
  target?: "strengthA" | "strengthB" | "speed" | "endurance" | "mobility";
  /** Placement gates that prevented an explicitly requested extra session. */
  reasonCodes?: string[];
}
/** Explicit weekly requests remain subject to calendar, preparation and load gates. */
export interface WeeklyTargets {
  strength: 2;
  speed: 1 | 2;
  endurance: 1 | 2;
}
export interface EngineOptions {
  weeklyTargets?: WeeklyTargets;
  /** Offer existing light technique/mobility recipes on otherwise unused days. */
  fillRestDays?: boolean;
  /** Whole physical days without training; assigned sessions never consume this reserve. */
  minFullRestDays?: 0 | 1 | 2;
  strengthLoadResponses?: import("../gymEvidence").GymLoadResponse[];
  /** Optional observations from real execution, scoped to the current athlete.
   * Legacy completions/timers alone never imply movement quality. */
  gymProgression?: import("./gymProgression").GymProgressionInput;
  /**
   * Recommendation from the review of the cycle that just ended. It is decided before the plan is
   * generated and shapes its first weeks; when absent it is read from the saved plan's own record.
   */
  cycleStart?: import("../types").CycleStartRecord | null;
  /** Continue the existing cycle when rebuilding or extending a plan. */
  cycleAnchorDate?: string;
  previousPlan?: SessionDay[];
  completions?: Record<string, import("../types").SessionCompletion>;
  expectedPlanId?: string | null;
  startDate: string;
  /** Actual decision date when recalibrating an existing window without moving its boundaries. */
  asOfDate?: string;
  weeks?: number;
  minutesPerSession?: number;
  readiness?: Record<string, Readiness>;
  /** Last committed plan is used only for cross-boundary load validation. */
  precedingDays?: SessionDay[];
  lockedDays?: SessionDay[];
}
export interface EngineResult {
  minutesPerSession: number;
  expectedPlanId: string | null;
  version: string;
  plan: SessionDay[];
  issues: Issue[];
  tier: Tier;
}
export function trainingTier(p: Profile): Tier {
  return preparationProfile(p).tier;
}
export const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
export const dayDistance = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
