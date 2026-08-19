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

/**
 * Rola wiersza w kanonicznej jednostce szybkościowej.
 * Dokładnie: 1 × warmup, 3 × drill, 1–2 × main, 0–1 × cooldown.
 */
export type FootballSpeedRole = "warmup" | "drill" | "primary" | "secondary" | "cooldown";

export interface FootballSpeedExercise {
  order: number;
  role: FootballSpeedRole;
  exerciseId: string;
  name: string;
  purpose: string;
  /** Jedna zwięzła linia dawki widoczna w zwiniętym wierszu. */
  dose: string;
  /** Jedna zwięzła linia przerwy widoczna w zwiniętym wierszu. */
  rest: string;
  intensity: string;
  coachingCuesPl: string[];
  safetyStopRule: string;
  equipment: SpeedEquipmentStatus;
  direction?: "left" | "right" | "left/right";
}

export interface FootballSpeedSession {
  status: "generated" | "activation" | "blocked";
  date: string;
  family: FootballSpeedFamily;
  title: string;
  /** Krótka etykieta do zakładek / kart (np. „Akceleracja”). */
  shortTitle: string;
  session: SessionDay | null;
  exercises: FootballSpeedExercise[];
  primaryExerciseId?: string;
  secondaryExerciseId?: string;
  excludedExerciseIds: string[];
  safetyNote: string;
}

const REPEATED_SPRINT: FootballSpeedQuality = "repeated_sprint";

const ACCELERATION_CUES = [
  "Pchaj podłoże do tyłu.",
  "Utrzymuj pochylenie całego ciała, bez zginania w talii.",
  "Nie sięgaj stopą do przodu.",
];

interface RowSpec {
  id: string;
  name: string;
  purpose: string;
  dose: string;
  lowDose?: string;
  rest: string;
  intensity?: string;
  direction?: "left" | "right" | "left/right";
}

interface FamilySpec {
  shortTitle: string;
  title: string;
  goal: string;
  drills: [RowSpec, RowSpec, RowSpec];
  primary: RowSpec;
  secondary?: RowSpec;
}

const WARMUP: RowSpec = {
  id: "a_march",
  name: "Rozgrzewka biegowa",
  purpose:
    "Podniesienie temperatury, mobilizacja bioder i kostek oraz przygotowanie mechaniki biegu do pracy z wysoką prędkością.",
  dose: "8–10 min: trucht, mobilizacja bioder, marsz A, ankling",
  rest: "Bez przerw — płynne przejście do drilli",
  intensity: "niska, narastająca",
};

const COOLDOWN: RowSpec = {
  id: "a_march",
  name: "Wyciszenie",
  purpose: "Powrót tętna i oddechu do spoczynku oraz rozluźnienie mięśni po pracy szybkościowej.",
  dose: "5 min: bardzo lekki trucht + spokojny oddech",
  rest: "—",
  intensity: "bardzo niska",
};

const FAMILY_SPECS: Record<FootballSpeedFamily, FamilySpec> = {
  acceleration: {
    shortTitle: "Akceleracja",
    title: "Sprint: akceleracja",
    goal: "Rozwój pierwszych kroków i zdolności przyspieszania na krótkim dystansie.",
    drills: [
      {
        id: "a_switch_progression",
        name: "Zmiany A: pojedyncza → podwójna → potrójna",
        purpose:
          "Nauka mocnego pchnięcia podłoża i szybkiej zmiany nogi w pozycji akceleracyjnej.",
        dose: "2–3 rundy × 3 na stronę",
        lowDose: "2 rundy × 3 na stronę",
        rest: "Przerwa 30–45 s",
      },
      {
        id: "a_skip",
        name: "Przejście A-skip → A-skip ciągły",
        purpose: "Rytm i aktywna stopa — przejście z pracy segmentowej do ciągłego rytmu biegu.",
        dose: "2 × 15–20 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "scissor_bounds",
        name: "Naprzemienne wyskoki nożycowe",
        purpose: "Elastyczność i przekazanie siły w kierunku poziomym przed sprintem.",
        dose: "2 × 5 na stronę",
        rest: "Przerwa 60–90 s",
      },
    ],
    primary: {
      id: "free_acceleration_sprint",
      name: "Przyspieszenia",
      purpose: "Główny bodziec: maksymalne przyspieszenie z pełną jakością każdego powtórzenia.",
      dose: "4–6 × 10–20 m",
      lowDose: "3 × 10–15 m",
      rest: "Pełna przerwa 90–150 s",
      intensity: "maksymalna jakość",
    },
  },
  maximum_velocity: {
    shortTitle: "Prędkość maks.",
    title: "Sprint: prędkość maksymalna",
    goal: "Ekspozycja na prędkość maksymalną przy pełnym odpoczynku i zachowanej mechanice.",
    drills: [
      {
        id: "a_skip",
        name: "Przejście A-skip → A-skip ciągły",
        purpose: "Rytm, wysoka pozycja miednicy i aktywna stopa przed pracą z wysoką prędkością.",
        dose: "2 × 20 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "straight_leg_run_bound",
        name: "Bieg z prostą nogą",
        purpose: "Praca nad zamachem i kontaktem stopy pod środkiem masy.",
        dose: "2 × 20 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "progressive_build_up_sprint",
        name: "Bieg narastający do 90%",
        purpose: "Stopniowe wejście w wysoką prędkość bez gwałtownego skoku obciążenia.",
        dose: "2 × 30 m",
        rest: "Przerwa 90 s",
      },
    ],
    primary: {
      id: "flying_sprint",
      name: "Sprint lotny",
      purpose: "Główny bodziec: 2–3 s pracy przy prędkości bliskiej maksymalnej.",
      dose: "4 × 20 m z najazdu 15 m",
      lowDose: "2 × 20 m z najazdu 15 m",
      rest: "Pełna przerwa 3–4 min",
      intensity: "maksymalna jakość",
    },
  },
  curved_sprinting: {
    shortTitle: "Sprint po łuku",
    title: "Sprint po łuku",
    goal: "Prędkość w biegu po łuku — najczęstsza forma sprintu w meczu.",
    drills: [
      {
        id: "a_skip",
        name: "Przejście A-skip → A-skip ciągły",
        purpose: "Rytm i aktywna stopa przed pracą po łuku.",
        dose: "2 × 20 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "ankling",
        name: "Ankling po łuku",
        purpose: "Ustawienie stopy i kostki przy biegu z nachyleniem ciała do środka łuku.",
        dose: "2 × 15 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "progressive_build_up_sprint",
        name: "Bieg narastający po łuku",
        purpose: "Kontrolowane wejście w prędkość przy nachyleniu tułowia.",
        dose: "2 × 30 m",
        rest: "Przerwa 90 s",
      },
    ],
    primary: {
      id: "football_curved_sprint",
      name: "Sprint po łuku",
      purpose: "Główny bodziec: sprint po łuku w obie strony z pełną jakością.",
      dose: "4 × 25 m (2 w lewo, 2 w prawo)",
      lowDose: "2 × 25 m (1 w lewo, 1 w prawo)",
      rest: "Pełna przerwa 2–3 min",
      intensity: "maksymalna jakość",
      direction: "left/right",
    },
  },
  deceleration_cod: {
    shortTitle: "Hamowanie i zwroty",
    title: "Hamowanie i zmiana kierunku",
    goal: "Kontrola hamowania i bezpieczna, szybka zmiana kierunku.",
    drills: [
      {
        id: "a_skip",
        name: "Przejście A-skip → A-skip ciągły",
        purpose: "Rytm i aktywna stopa przed pracą z hamowaniem.",
        dose: "2 × 15 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "run_two_step_stop",
        name: "Bieg i zatrzymanie w dwóch krokach",
        purpose: "Nauka przyjmowania sił hamowania w stabilnej pozycji.",
        dose: "3 × 10 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "progressive_run_three_step_stop",
        name: "Bieg i zatrzymanie w trzech krokach",
        purpose: "Kontrola zatrzymania z wyższej prędkości wejściowej.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
    ],
    primary: {
      id: "progressive_deceleration_5_10_15",
      name: "Progresywne hamowanie 5 → 10 → 15 m",
      purpose: "Główny bodziec: hamowanie z rosnącej prędkości wejściowej.",
      dose: "3 serie × (5 / 10 / 15 m)",
      lowDose: "2 serie × (5 / 10 m)",
      rest: "Pełna przerwa 2 min",
      intensity: "wysoka, z pełną kontrolą",
    },
    secondary: {
      id: "planned_cut",
      name: "Zaplanowane cięcie",
      purpose: "Przeniesienie hamowania w zmianę kierunku i ponowne przyspieszenie.",
      dose: "4 powtórzenia (2 w lewo, 2 w prawo)",
      rest: "Pełna przerwa 2 min",
      intensity: "wysoka",
      direction: "left/right",
    },
  },
  reactive_agility_reacceleration: {
    shortTitle: "Reakcja i zwroty",
    title: "Reakcja i ponowne przyspieszenie",
    goal: "Szybkość decyzji ruchowej i ponowne przyspieszenie po zatrzymaniu.",
    drills: [
      {
        id: "a_skip",
        name: "Przejście A-skip → A-skip ciągły",
        purpose: "Rytm i aktywna stopa przed pracą reaktywną.",
        dose: "2 × 15 m",
        rest: "Przerwa 45 s",
      },
      {
        id: "run_two_step_stop",
        name: "Bieg i zatrzymanie w dwóch krokach",
        purpose: "Stabilne zatrzymanie jako baza ponownego przyspieszenia.",
        dose: "3 × 10 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "a_switch_progression",
        name: "Zmiany A: pojedyncza → podwójna",
        purpose: "Szybka zmiana nogi i mocne pchnięcie przy ponownym starcie.",
        dose: "2 rundy × 3 na stronę",
        rest: "Przerwa 30–45 s",
      },
    ],
    primary: {
      id: "app_audio_forward_left_right",
      name: "Start na sygnał: przód / lewo / prawo",
      purpose: "Główny bodziec: reakcja na sygnał i natychmiastowe przyspieszenie.",
      dose: "6 akcji × 10 m",
      lowDose: "4 akcje × 10 m",
      rest: "Pełna przerwa 90 s",
      intensity: "maksymalna jakość",
    },
    secondary: {
      id: "accel_decel_reaccel",
      name: "Przyspieszenie–hamowanie–ponowne przyspieszenie",
      purpose: "Połączenie hamowania z ponownym startem w jednej akcji.",
      dose: "4 × (10 m + 10 m)",
      rest: "Pełna przerwa 2 min",
      intensity: "wysoka",
    },
  },
};

function approved(id: string): ExerciseDefinition | undefined {
  const exercise = getExerciseDefinition(id);
  return exercise?.approved === true && exercise.draft === false ? exercise : undefined;
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

function buildRow(
  spec: RowSpec,
  order: number,
  role: FootballSpeedRole,
  input: FootballSpeedEngineInput,
  low: boolean,
): FootballSpeedExercise {
  const def = approved(spec.id);
  if (!def) throw new Error(`Brak zatwierdzonego ćwiczenia ${spec.id}.`);
  const unavailable = input.profile.unavailableEquipmentIds ?? [];
  const isAcceleration = def.speedQualities?.includes("acceleration") === true;
  const cues = [...(def.coachingCues ?? []), ...(isAcceleration ? ACCELERATION_CUES : [])];
  return {
    order,
    role,
    exerciseId: spec.id,
    name: spec.name,
    purpose: spec.purpose,
    dose: (low && spec.lowDose) || spec.dose,
    rest: spec.rest,
    intensity: low
      ? "kontrolowana (60–75%)"
      : (spec.intensity ?? (role === "drill" ? "techniczna, bez zmęczenia" : "wysoka")),
    coachingCuesPl: Array.from(new Set(cues)).slice(0, 5),
    safetyStopRule:
      "Natychmiast przerwij przy bólu, pogorszeniu kontroli lub wyraźnym spadku jakości.",
    equipment: {
      requiredEquipment: def.equipmentRequired.map(String),
      unavailableEquipment: unavailable,
      replacementStatus: def.equipmentRequired.some((equipment) => unavailable.includes(equipment))
        ? "blocked"
        : "available",
    },
    direction: spec.direction,
  };
}

function buildSessionDay(
  input: FootballSpeedEngineInput,
  spec: FamilySpec,
  exercises: FootballSpeedExercise[],
  title: string,
  low: boolean,
): SessionDay {
  const toItem = (exercise: FootballSpeedExercise) => ({
    name: exercise.name,
    exerciseId: exercise.exerciseId,
    purpose: exercise.purpose,
    prescription: exercise.dose,
    rest: exercise.rest,
    cue: exercise.coachingCuesPl.join(" "),
  });
  return {
    date: input.date,
    dayName: input.date,
    dayType: "training",
    title,
    goalLabel: "Szybkość piłkarska",
    intensity: low ? "umiarkowana" : "wysoka",
    durationMin: low ? 35 : 50,
    isOwnSession: true,
    isClubSession: false,
    isRecoveryOrPrehab: false,
    isSupplemental: false,
    reason: "Kanoniczna jednostka szybkościowa: rozgrzewka, 3 drille, sprint główny.",
    safetyNote: "Ból lub spadek jakości kończy serię.",
    whyToday: "Świeża ekspozycja szybkościowa z pełnym odpoczynkiem.",
    sessionType: "Szybkość piłkarska",
    goalOfSession: spec.goal,
    riskManaged: "Niska objętość, pełne przerwy i ochrona dni okołomeczowych.",
    avoidToday: "Bez pracy kondycyjnej i bez ćwiczeń z piłką w tej jednostce.",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: exercises.filter((e) => e.role === "warmup").map(toItem),
      main: exercises.filter((e) => e.role === "drill" || e.role === "primary" || e.role === "secondary").map(toItem),
      accessory: [],
      footballTransfer: [],
      cooldown: exercises.filter((e) => e.role === "cooldown").map(toItem),
    },
    secondSession: null,
  };
}

export function generateFootballSpeedSession(
  input: FootballSpeedEngineInput,
): FootballSpeedSession {
  const catalog = getFootballSpeedCatalog();
  const spec = FAMILY_SPECS[input.family];
  // Repeated sprint to praca kondycyjna — nigdy nie trafia do jednostki szybkościowej.
  const excludedExerciseIds = catalog
    .filter((exercise) => exercise.speedQualities?.includes(REPEATED_SPRINT))
    .map((exercise) => exercise.id);

  if (hasPain(input)) {
    return {
      status: "blocked",
      date: input.date,
      family: input.family,
      title: "Szybkość wstrzymana",
      shortTitle: "Wstrzymane",
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
      shortTitle: "Przełożone",
      session: null,
      exercises: [],
      excludedExerciseIds,
      safetyNote: "Dzień meczu lub twarda sąsiednia ekspozycja — brak hard speed.",
    };
  }

  const activation = isMatchMinusOne(input) || input.recentHighSpeedExposure === true;
  const low = activation || readiness(input) <= 5 || (input.fatigue ?? 0) >= 8;

  const exercises: FootballSpeedExercise[] = [];
  let order = 1;
  exercises.push(buildRow(WARMUP, order++, "warmup", input, low));
  for (const drill of spec.drills) {
    exercises.push(buildRow(drill, order++, "drill", input, low));
  }
  exercises.push(buildRow(spec.primary, order++, "primary", input, low));
  if (spec.secondary && !low) {
    exercises.push(buildRow(spec.secondary, order++, "secondary", input, low));
  }
  exercises.push(buildRow(COOLDOWN, order++, "cooldown", input, low));

  const title = activation ? `${spec.title} — aktywacja` : spec.title;
  const shortTitle = activation ? `${spec.shortTitle} (aktywacja)` : spec.shortTitle;

  return {
    status: activation ? "activation" : "generated",
    date: input.date,
    family: input.family,
    title,
    shortTitle,
    session: buildSessionDay(input, spec, exercises, title, low),
    exercises,
    primaryExerciseId: spec.primary.id,
    secondaryExerciseId: !low ? spec.secondary?.id : undefined,
    excludedExerciseIds,
    safetyNote:
      "Pełny odpoczynek między powtórzeniami; zatrzymaj serię przy bólu lub spadku jakości.",
  };
}

/** Backward-compatible descriptive alias for the engine entry point. */
export const buildFootballSpeedSession = generateFootballSpeedSession;
