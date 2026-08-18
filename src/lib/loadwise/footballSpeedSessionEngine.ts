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
  replacementStatus: "available" | "blocked";
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
const REPEATED_SPRINT: FootballSpeedQuality = "repeated_sprint";
export const BALL_WORK_PATTERN =
  /\bball\b|piłka\b|passing|pass(?:es|ing)?|receiv(?:e|ing)|dribbl|feint|zwod|przyjęci|podani/i;
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

export function isOffBallSpeedExercise(exercise: ExerciseDefinition): boolean {
  return (
    exercise.requiresBall === false &&
    !exercise.equipmentRequired.includes("med_ball") &&
    !BALL_WORK_PATTERN.test(
      [exercise.id, exercise.name, exercise.displayNamePl, ...exercise.aliases].join(" "),
    )
  );
}

function approved(id: string): ExerciseDefinition | undefined {
  const exercise = getExerciseDefinition(id);
  return exercise?.approved === true && exercise.draft === false && isOffBallSpeedExercise(exercise)
    ? exercise
    : undefined;
}

/** Prefer the deterministic ID order, then use an approved primary catalog fallback. */
function choose(
  ids: string[],
  quality: FootballSpeedQuality[],
  catalog: readonly ExerciseDefinition[],
  unavailableEquipmentIds: string[] = [],
  avoidId?: string,
): ExerciseDefinition {
  const available = (exercise: ExerciseDefinition) =>
    isOffBallSpeedExercise(exercise) &&
    exercise.equipmentRequired.every((equipment) => !unavailableEquipmentIds.includes(equipment));
  for (const id of ids) {
    const exercise = approved(id);
    if (
      exercise &&
      available(exercise) &&
      exercise.id !== avoidId &&
      exercise.speedQualities?.some((item) => quality.includes(item))
    )
      return exercise;
  }
  const fallback = catalog.find(
    (exercise) =>
      exercise.approved === true &&
      exercise.draft === false &&
      available(exercise) &&
      isOffBallSpeedExercise(exercise) &&
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
    if (exposure.date === input.date && (exposure.hard === true || exposure.kind === "club"))
      return true;
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
  overrides: Partial<FootballSpeedExercise> = {},
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
        : "available",
    },
    pass,
    direction,
    ...overrides,
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
  exercises.push(
    buildExercise(preparation, order++, input, "preparation", undefined, undefined, {
      name: "RAMP — przygotowanie atletyczne",
      purpose: "Podnieś temperaturę i przygotuj zakres ruchu bez piłki.",
      sets: "1",
      reps: "ciągłe",
      distanceOrDuration: "8–12 min",
      restBetweenReps: "bez przerwy",
      restBetweenSets: "—",
      coachingCuesPl: [
        "Stopniowo zwiększaj tempo",
        "Tylko przygotowanie ruchowe, bez pracy technicznej",
      ],
    }),
  );
  const flow = SKIP_FLOW.map((id) => approved(id));
  if (flow.some((def) => !def))
    throw new Error("Brak zatwierdzonego ćwiczenia w sekwencji A → C → B → D.");
  exercises.push(
    buildExercise(flow[0]!, order++, input, "technical", undefined, undefined, {
      name: "A → C → B → D — sekwencja techniki biegu",
      purpose: "Dwa przejścia 15–20 m: pierwsze kontrolowane, drugie szybsze.",
      sets: "2",
      reps: "2 przejścia",
      distanceOrDuration: "15–20 m",
      intensity: "1. kontrolowana; 2. szybka",
      restBetweenReps: "30–60 s, pełny powrót",
      restBetweenSets: "60–90 s",
      coachingCuesPl: [
        "Wykonaj kolejno A → C → B → D",
        "Pierwsze przejście kontrolowane, drugie szybsze",
        "Zatrzymaj serię przy utracie rytmu",
      ],
    }),
  );
  const wallSwitch = approved("wall_triple_switch");
  const bounds = approved("straight_leg_run_bound");
  if (!wallSwitch || !bounds) throw new Error("Brak zatwierdzonych ćwiczeń techniki biegu.");
  exercises.push(
    buildExercise(wallSwitch, order++, input, "technical", undefined, undefined, {
      name: "Single → double → triple A-switch → A-skip",
      purpose: "Sekwencja zmian A-switch zakończona A-skip.",
      sets: low ? "2" : "3",
      reps: "1 sekwencja",
      distanceOrDuration: "10–15 s",
      restBetweenReps: "30–45 s",
      restBetweenSets: "60–90 s",
      coachingCuesPl: [
        "Single, double, triple switch",
        "Przejdź płynnie do A-skip",
        "Miednica stabilna",
      ],
    }),
  );
  exercises.push(
    buildExercise(bounds, order++, input, "technical", undefined, undefined, {
      name: "Naprzemienne boundy pionowe",
      purpose:
        "Maksymalny pionowy odbiór, zmiana nóg w locie, lądowanie na jednej nodze i odbicie z drugiej.",
      sets: low ? "2" : "3",
      reps: "4–6",
      distanceOrDuration: "4–6 kontaktów na stronę",
      restBetweenReps: "60–90 s",
      restBetweenSets: "90 s",
      coachingCuesPl: [
        "Maksymalny pionowy take-off",
        "Zmień nogę w locie",
        "Ląduj cicho i odbij się z drugiej nogi",
      ],
    }),
  );
  const unavailableEquipmentIds = input.profile.unavailableEquipmentIds ?? [];
  const primary = choose(
    FAMILY_PRIMARY[input.family],
    FAMILY_QUALITIES[input.family],
    catalog,
    unavailableEquipmentIds,
  );
  if (!activation) {
    exercises.push(
      buildExercise(
        primary,
        order++,
        input,
        low ? "primer" : "primary",
        undefined,
        input.family === "curved_sprinting" ? "left" : undefined,
        input.family === "acceleration"
          ? {
              sets: low ? "3" : "4–6",
              reps: "1",
              distanceOrDuration: "10–20 m",
              restBetweenReps: "90–180 s",
              restBetweenSets: "90–180 s",
              coachingCuesPl: [
                "Pochylenie od kostek",
                "Projekuj ciało do przodu",
                "Uderzaj pod lub lekko za biodrami i unoś się stopniowo",
              ],
            }
          : input.family === "maximum_velocity"
            ? {
                sets: low ? "2" : "3–5",
                reps: "1",
                distanceOrDuration: "20 m lotu + 20–30 m nabiegu",
                restBetweenReps: "3–5 min",
                restBetweenSets: "3–5 min",
              }
            : input.family === "curved_sprinting"
              ? {
                  sets: low ? "2" : "3–4",
                  reps: "1 na stronę",
                  distanceOrDuration: "20–30 m na stronę",
                  restBetweenReps: "2–3 min",
                  restBetweenSets: "2–3 min",
                }
              : {
                  sets: low ? "2" : "3",
                  reps: "1 na stronę",
                  distanceOrDuration: "10–20 m",
                  restBetweenReps: "2–3 min, pełna regeneracja",
                  restBetweenSets: "3 min",
                },
      ),
    );
  }
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
    primaryExerciseId: activation ? undefined : primary.id,
    secondaryExerciseId: undefined,
    excludedExerciseIds,
    safetyNote:
      "Pełny odpoczynek między powtórzeniami; zatrzymaj serię przy bólu lub spadku jakości.",
  };
}

/** Backward-compatible descriptive alias for the engine entry point. */
export const buildFootballSpeedSession = generateFootballSpeedSession;
