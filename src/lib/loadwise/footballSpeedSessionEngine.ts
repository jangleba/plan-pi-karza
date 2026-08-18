import {
  getExerciseDefinition,
  getFootballSpeedCatalog,
  type ExerciseDefinition,
  type FootballSpeedQuality,
} from "./exerciseLibrary";
import type { PainLocation, Profile, SessionDay } from "./types";

export type FootballSpeedFamily =
  | "acceleration"
  | "maximum_velocity"
  | "curved_sprinting"
  | "deceleration_cod"
  | "reactive_agility_reacceleration";

export interface SpeedExternalExposure {
  date: string;
  kind: "club" | "match" | "rest" | "training";
  hard?: boolean;
}

export interface FootballSpeedEngineInput {
  profile: Profile;
  date: string;
  family: FootballSpeedFamily;
  readiness?: number;
  fatigue?: number;
  pain?: boolean | PainLocation[];
  partnerAvailable?: boolean;
  externalSessions?: SpeedExternalExposure[];
  recentHighSpeedExposure?: boolean;
}

export interface SpeedEquipmentStatus {
  requiredEquipment: string[];
  unavailableEquipment: string[];
  replacementStatus: "not_required" | "blocked";
}

export interface FootballSpeedExercise {
  order: number;
  role: "preparation" | "technical" | "primer" | "primary" | "secondary";
  exerciseId: string;
  name: string;
  purpose: string;
  sets: string;
  reps: string;
  distanceOrDuration: string;
  intensity: string;
  restBetweenReps: string;
  restBetweenSets: string;
  coachingCuesPl: string[];
  safetyStopRule: string;
  equipment: SpeedEquipmentStatus;
  pass?: "controlled" | "faster";
  direction?: "left" | "right" | "left/right";
}

export interface FootballSpeedSession {
  status: "generated" | "activation" | "blocked";
  date: string;
  family: FootballSpeedFamily;
  title: string;
  session: SessionDay | null;
  exercises: FootballSpeedExercise[];
  primaryExerciseId?: string;
  secondaryExerciseId?: string;
  excludedExerciseIds: string[];
  safetyNote: string;
}

const SKIP_FLOW = ["a_skip", "c_skip", "b_skip", "d_skip"] as const;
const REPEATED_SPRINT = "repeated_sprint";
const ACCELERATION_CUES = [
  "Pchaj podłoże do tyłu.",
  "Przykładaj siłę w dół i do tyłu.",
  "Utrzymuj pochylenie całego ciała, bez zginania w talii.",
  "Nie sięgaj stopą do przodu.",
  "Wraz ze wzrostem prędkości unoś się stopniowo.",
];

const FAMILY_QUALITIES: Record<FootballSpeedFamily, FootballSpeedQuality[]> = {
  acceleration: ["acceleration"],
  maximum_velocity: ["maximum_velocity_exposure"],
  curved_sprinting: ["curved_sprint"],
  deceleration_cod: ["deceleration", "planned_change_of_direction"],
  reactive_agility_reacceleration: ["reactive_agility", "reacceleration"],
};

const FAMILY_PRIMARY: Record<FootballSpeedFamily, string[]> = {
  acceleration: ["free_acceleration_sprint", "falling_start", "split_stance_start"],
  maximum_velocity: ["flying_sprint", "upright_football_sprint"],
  curved_sprinting: ["football_curved_sprint", "reactive_curved_sprint"],
  deceleration_cod: ["progressive_deceleration_5_10_15", "planned_cut", "planned_505"],
  reactive_agility_reacceleration: [
    "app_audio_forward_left_right",
    "app_visual_colour_cue_cod",
    "reactive_180_turn",
  ],
};

const FAMILY_SECONDARY: Record<FootballSpeedFamily, string[]> = {
  acceleration: ["progressive_deceleration_5_10_15", "accel_decel_reaccel"],
  maximum_velocity: ["football_curved_sprint", "progressive_build_up_sprint"],
  curved_sprinting: ["reactive_curved_sprint", "football_curved_sprint"],
  deceleration_cod: ["cut_and_reaccelerate", "deceleration_lateral_exit"],
  reactive_agility_reacceleration: ["accel_decel_reaccel", "cut_and_reaccelerate"],
};

function approved(id: string): ExerciseDefinition | undefined {
  const exercise = getExerciseDefinition(id);
  return exercise?.approved === true && exercise.draft === false ? exercise : undefined;
}

/** Prefer the deterministic ID order, then use an approved primary catalog fallback. */
function choose(
  ids: string[],
  quality: FootballSpeedQuality[],
  catalog: readonly ExerciseDefinition[],
  avoidId?: string,
): ExerciseDefinition {
  for (const id of ids) {
    const exercise = approved(id);
    if (
      exercise &&
      exercise.id !== avoidId &&
      exercise.speedQualities?.some((item) => quality.includes(item))
    )
      return exercise;
  }
  const fallback = catalog.find(
    (exercise) =>
      exercise.approved === true &&
      exercise.draft === false &&
      exercise.id !== avoidId &&
      exercise.sessionRoles?.includes("primary") &&
      exercise.speedQualities?.some((item) => quality.includes(item)),
  );
  if (!fallback) throw new Error(`Brak zatwierdzonego ćwiczenia dla jakości ${quality.join(",")}.`);
  return fallback;
}

function hasPain(input: FootballSpeedEngineInput): boolean {
  if (input.profile.painInjury) return true;
  if (input.pain === true) return true;
  return Array.isArray(input.pain) && input.pain.length > 0;
}

function readiness(input: FootballSpeedEngineInput): number {
  return Math.max(1, Math.min(10, input.readiness ?? 6));
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function hasHardConflict(input: FootballSpeedEngineInput): boolean {
  return (input.externalSessions ?? []).some((exposure) => {
    if (exposure.kind === "match" && exposure.date === input.date) return true;
    if (exposure.date === input.date && (exposure.hard ?? exposure.kind === "club")) return true;
    return (
      exposure.hard === true &&
      [dateOffset(input.date, -1), dateOffset(input.date, 1)].includes(exposure.date)
    );
  });
}

function isMatchDay(input: FootballSpeedEngineInput): boolean {
  return input.profile.matchDate === input.date;
}

function isMatchMinusOne(input: FootballSpeedEngineInput): boolean {
  return input.profile.matchDate === dateOffset(input.date, 1);
}

function isMatchPlusOne(input: FootballSpeedEngineInput): boolean {
  return input.profile.matchDate === dateOffset(input.date, -1);
}

function buildExercise(
  def: ExerciseDefinition,
  order: number,
  input: FootballSpeedEngineInput,
  role: "preparation" | "technical" | "primary" | "secondary" | "primer",
  pass?: "controlled" | "faster",
  direction?: "left" | "right" | "left/right",
): FootballSpeedExercise {
  const low = readiness(input) <= 5;
  const prescription = def.defaultPrescription;
  const reps = low ? "2" : String(prescription?.repetitions?.min ?? 3);
  const sets = low ? "1" : String(prescription?.sets?.min ?? 2);
  const distance = prescription?.distanceM
    ? `${low ? prescription.distanceM.min : prescription.distanceM.max} m`
    : `${prescription?.workSeconds?.min ?? 10}–${prescription?.workSeconds?.max ?? 20} s`;
  const intensity =
    low || pass === "controlled"
      ? "kontrolowana (60–75%)"
      : role === "technical"
        ? "szybka"
        : "wysoka, bez utraty jakości";
  const cues = [
    ...(def.coachingCues ?? []),
    ...(def.speedQualities?.includes("acceleration") ? ACCELERATION_CUES : []),
  ];
  return {
    order,
    role,
    exerciseId: def.id,
    name: def.displayNamePl,
    purpose: def.objective ?? `Rozwój jakości: ${def.speedQualities?.join(", ")}.`,
    sets,
    reps,
    distanceOrDuration: distance,
    intensity,
    restBetweenReps: `${prescription?.restSeconds?.min ?? 60}–${prescription?.restSeconds?.max ?? 180} s, pełny powrót jakości`,
    restBetweenSets: `${Math.max(90, prescription?.restSeconds?.max ?? 120)} s`,
    coachingCuesPl: cues,
    safetyStopRule:
      "Natychmiast przerwij przy bólu, pogorszeniu kontroli lub wyraźnym spadku jakości.",
    equipment: {
      requiredEquipment: def.equipmentRequired.map(String),
      unavailableEquipment: input.profile.unavailableEquipmentIds ?? [],
      replacementStatus: def.equipmentRequired.some((equipment) =>
        (input.profile.unavailableEquipmentIds ?? []).includes(equipment),
      )
        ? "blocked"
        : "not_required",
    },
    pass,
    direction,
  };
}

function buildSessionDay(
  input: FootballSpeedEngineInput,
  exercises: FootballSpeedExercise[],
  title: string,
): SessionDay {
  const toItem = (exercise: FootballSpeedExercise) => ({
    name: exercise.name,
    exerciseId: exercise.exerciseId,
    purpose: exercise.purpose,
    prescription: `${exercise.sets} serie × ${exercise.reps} powt.; ${exercise.distanceOrDuration}; ${exercise.intensity}`,
    rest: `${exercise.restBetweenReps}; serie: ${exercise.restBetweenSets}`,
    cue: exercise.coachingCuesPl.join(" "),
  });
  const warmup = exercises.filter((exercise) => exercise.role === "preparation").map(toItem);
  const main = exercises.filter((exercise) => exercise.role !== "preparation").map(toItem);
  return {
    date: input.date,
    dayName: input.date,
    dayType: "training",
    title,
    goalLabel: "Szybkość piłkarska",
    intensity: readiness(input) <= 5 ? "umiarkowana" : "wysoka",
    durationMin: readiness(input) <= 5 ? 30 : 50,
    isOwnSession: true,
    isClubSession: false,
    isRecoveryOrPrehab: false,
    isSupplemental: false,
    reason: "Deterministyczny silnik Phase 3C.",
    safetyNote: "Ból lub spadek jakości kończy serię.",
    whyToday: "Świeża ekspozycja szybkościowa z pełnym odpoczynkiem.",
    sessionType: "speed_sprint",
    goalOfSession: "Rozwój szybkości piłkarskiej",
    riskManaged: "Objętość, sąsiednie ekspozycje i MD są chronione regułami silnika.",
    avoidToday: "Krótki odpoczynek i praca kondycyjna.",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup, main, accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  };
}

export function generateFootballSpeedSession(
  input: FootballSpeedEngineInput,
): FootballSpeedSession {
  const catalog = getFootballSpeedCatalog();
  const excludedExerciseIds = catalog
    .filter((exercise) => exercise.speedQualities?.includes(REPEATED_SPRINT))
    .map((exercise) => exercise.id);
  if (hasPain(input)) {
    return {
      status: "blocked",
      date: input.date,
      family: input.family,
      title: "Szybkość wstrzymana",
      session: null,
      exercises: [],
      excludedExerciseIds,
      safetyNote:
        "Ból uruchamia istniejącą ścieżkę bezpieczeństwa: nie wykonuj sprintu i skontaktuj się z trenerem/specjalistą.",
    };
  }
  if (isMatchDay(input) || isMatchPlusOne(input) || hasHardConflict(input)) {
    return {
      status: "blocked",
      date: input.date,
      family: input.family,
      title: "Szybkość przełożona",
      session: null,
      exercises: [],
      excludedExerciseIds,
      safetyNote: "Dzień meczu lub twarda sąsiednia ekspozycja — brak hard speed.",
    };
  }
  const activation = isMatchMinusOne(input) || input.recentHighSpeedExposure === true;
  const low = readiness(input) <= 5 || (input.fatigue ?? 0) >= 8;
  const exercises: FootballSpeedExercise[] = [];
  let order = 1;
  const preparation = approved("a_march");
  if (!preparation) throw new Error("Brak zatwierdzonego przygotowania A-march.");
  exercises.push(buildExercise(preparation, order++, input, "preparation"));
  for (const id of SKIP_FLOW) {
    const def = approved(id);
    if (!def) throw new Error(`Brak zatwierdzonego skipu ${id}.`);
    exercises.push(buildExercise(def, order++, input, "technical", "controlled"));
    exercises.push(buildExercise(def, order++, input, "technical", "faster"));
  }
  const primary = choose(FAMILY_PRIMARY[input.family], FAMILY_QUALITIES[input.family], catalog);
  const secondary = choose(
    FAMILY_SECONDARY[input.family],
    FAMILY_QUALITIES[input.family],
    catalog,
    primary.id,
  );
  exercises.push(
    buildExercise(
      primary,
      order++,
      input,
      activation || low ? "primer" : "primary",
      undefined,
      input.family === "curved_sprinting" ? "left" : undefined,
    ),
  );
  exercises.push(
    buildExercise(
      secondary,
      order++,
      input,
      "secondary",
      undefined,
      input.family === "curved_sprinting" ? "right" : undefined,
    ),
  );
  const title = activation
    ? "Aktywacja szybkości piłkarskiej"
    : `Szybkość piłkarska: ${input.family}`;
  return {
    status: activation ? "activation" : "generated",
    date: input.date,
    family: input.family,
    title,
    session: buildSessionDay(input, exercises, title),
    exercises,
    primaryExerciseId: primary.id,
    secondaryExerciseId: secondary.id,
    excludedExerciseIds,
    safetyNote:
      "Pełny odpoczynek między powtórzeniami; zatrzymaj serię przy bólu lub spadku jakości.",
  };
}

/** Backward-compatible descriptive alias for the engine entry point. */
export const buildFootballSpeedSession = generateFootballSpeedSession;
