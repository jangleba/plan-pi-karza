import type { Profile, Readiness, SessionDay } from "../types";
import { preparationProfile } from "./preparation";

export const ENGINE_VERSION = "ballwise-v2.3";
export type Tier = "foundation" | "development" | "performance";
export type Role =
  | "knee_strength"
  | "hip_strength"
  | "unilateral_strength"
  | "knee_flexion"
  | "hamstring_iso"
  | "quad_iso"
  | "iso_primer"
  | "adductor"
  | "calf_straight"
  | "calf_bent"
  | "push"
  | "pull"
  | "trunk"
  | "power"
  | "landing"
  | "speed"
  | "endurance"
  | "warmup"
  | "mobility"
  | "breathing"
  | "ball_skill";
export type SupportRole = "activation" | "recovery" | "mobility" | "skills";
export interface Dose {
  sets: number;
  reps?: number;
  seconds?: number;
  restSeconds: number;
  postRestSeconds?: number;
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
  quad_iso: "izometria przodu uda",
  iso_primer: "nadzorowany blok izometryczny przed częścią główną",
  adductor: "siła przywodzicieli",
  calf_straight: "łydka z prostym kolanem",
  calf_bent: "łydka ze zgiętym kolanem",
  push: "pchanie góry ciała",
  pull: "przyciąganie góry ciała",
  trunk: "kontrola tułowia",
  power: "moc",
  landing: "kontrola lądowania i zatrzymania",
  speed: "szybkość",
  endurance: "wydolność tlenowa",
  warmup: "przygotowanie do treningu",
  mobility: "kontrolowany zakres ruchu",
  breathing: "spokojny oddech",
  ball_skill: "technika z piłką",
};
export interface ExerciseDecision {
  exerciseId: string;
  role: Role;
  dose: Dose;
  reason: string;
}
export interface EngineSession {
  runningRecipe?: import("@/lib/running/recipe").RunningRecipe;
  roles: ("strengthA" | "strengthB" | "speed" | "endurance" | SupportRole)[];
  organization?: "straight" | "power_first" | "contrast";
  tier: Tier;
  highLower: boolean;
  exercises: ExerciseDecision[];
  missing: Role[];
  minutes: number;
  sprintMetres: number;
  phase: "adaptation" | "development" | "peak" | "deload";
}
export interface Issue {
  code: string;
  date?: string;
  message: string;
}
export interface EngineOptions {
  expectedPlanId?: string | null;
  startDate: string;
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
