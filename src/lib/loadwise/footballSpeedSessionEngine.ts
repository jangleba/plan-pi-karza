import {
  getExerciseDefinition,
  getFootballSpeedCatalog,
  type ExerciseDefinition,
  type FootballSpeedQuality,
} from "./exerciseLibrary";
import type { PainLocation, Profile, SessionDay } from "./types";
import { validateFootballSpeedDate } from "./footballSpeedScheduling";

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
  /** Poprzednie trzy drille techniczne — używane do deterministycznej rotacji. */
  recentPostSkipExerciseIds?: string[];
  progressionWeek?: number;
}

export interface SpeedEquipmentStatus {
  requiredEquipment: string[];
  unavailableEquipment: string[];
  replacementStatus: "available" | "blocked";
}

/**
 * Rola wiersza w kanonicznej jednostce szybkościowej.
 *  Dokładnie: 1 × warmup, 3 × drill, 1 × primary, 1 × terminal, 0–1 × optional.
 */
export type FootballSpeedRole =
  | "preparation"
  | "technical"
  | "primer"
  | "primary"
  | "terminal"
  | "secondary"
  | "conditioning"
  | "cooldown";

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
  pass?: number;
  sets?: string;
  reps?: string;
  distanceOrDuration?: string;
  restBetweenReps?: string;
  restBetweenSets?: string;
  variant?: string;
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
export const FOOTBALL_SPEED_GENERATOR_VERSION = "football-speed-v2";

const ACCELERATION_CUES = [
  "Pchaj podłoże do tyłu i w dół.",
  "Utrzymuj pochylenie całego ciała, bez zginania w talii.",
  "Odzyskuj nogę nisko, blisko podłoża.",
  "Palce stóp uniesione; stopa atakuje pod lub lekko za ciałem.",
  "Wstawaj stopniowo, nigdy nie prostuj się od razu.",
];
const MAX_VELOCITY_CUES = [
  "Utrzymuj wysokie biodra.",
  "Kontakt stopy pod środkiem masy.",
  "Nie sięgaj i nie ląduj daleko przed ciałem.",
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
  variant?: string;
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

const SKIP_TRANSITIONS: RowSpec[] = [
  {
    id: "a_skip",
    name: "Skip A — seria 1",
    purpose: "Kontrolowana technika, rytm i aktywna stopa przed sprintem.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "controlled_pass",
  },
  {
    id: "c_skip",
    name: "Skip C — seria 1",
    purpose: "Kontrolowana praca cykliczna i stabilna miednica.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "controlled_pass",
  },
  {
    id: "b_skip",
    name: "Skip B — seria 1",
    purpose: "Kontrola kolana i stopy w rytmie biegowym.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "controlled_pass",
  },
  {
    id: "d_skip",
    name: "Skip D — seria 1",
    purpose: "Aktywna stopa i sprężystość bez utraty pozycji.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 45 s",
    variant: "controlled_pass",
  },
  {
    id: "a_skip",
    name: "Skip A — seria 2",
    purpose: "Szybszy, dynamiczny strike pod biodrem bez utraty postawy.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "fast_pass",
  },
  {
    id: "c_skip",
    name: "Skip C — seria 2",
    purpose: "Szybsza praca cykliczna z aktywną stopą pod biodrem.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "fast_pass",
  },
  {
    id: "b_skip",
    name: "Skip B — seria 2",
    purpose: "Dynamiczny rytm i skoordynowane ramiona bez ruchu bocznego.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "fast_pass",
  },
  {
    id: "d_skip",
    name: "Skip D — seria 2",
    purpose: "Najszybszy jakościowy strike pod biodrem przed drillami.",
    dose: "2 × 15–20 m",
    rest: "Przerwa 45 s",
    variant: "fast_pass",
  },
];

const TERMINAL_BY_FAMILY: Record<FootballSpeedFamily, RowSpec> = {
  acceleration: {
    id: "progressive_deceleration_5_10_15",
    name: "Hamowanie po sprincie",
    purpose: "Bezpieczne wytracenie prędkości po głównym bodźcu.",
    dose: "2 serie × 5–10 m",
    rest: "Pełna przerwa 90 s",
  },
  maximum_velocity: {
    id: "progressive_deceleration_5_10_15",
    name: "Hamowanie po sprincie",
    purpose: "Kontrolowane wytracenie prędkości po ekspozycji maksymalnej.",
    dose: "2 serie × 5–10 m",
    rest: "Pełna przerwa 90 s",
  },
  curved_sprinting: {
    id: "football_curved_sprint",
    name: "Kontrolowany łuk",
    purpose: "Utrzymanie mechaniki i bezpieczne wyjście z biegu po łuku.",
    dose: "2 × 20 m",
    rest: "Pełna przerwa 90 s",
  },
  deceleration_cod: {
    id: "planned_cut",
    name: "Kontrolowana zmiana kierunku",
    purpose: "Zakończenie sesji hamowaniem i kontrolowanym wyjściem.",
    dose: "2 powtórzenia na stronę",
    rest: "Pełna przerwa 90 s",
  },
  reactive_agility_reacceleration: {
    id: "accel_decel_reaccel",
    name: "Hamowanie i ponowne przyspieszenie",
    purpose: "Zakończenie sesji kontrolą hamowania i ponownym startem.",
    dose: "2 × 10 m",
    rest: "Pełna przerwa 90 s",
  },
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
        purpose: "Nauka mocnego pchnięcia podłoża i szybkiej zmiany nogi w pozycji akceleracyjnej.",
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

const POST_SKIP_POOLS: Record<FootballSpeedFamily, RowSpec[][]> = {
  acceleration: [
    [
      { id: "a_switch_progression", name: "A-switch: pojedyncza → podwójna → potrójna", purpose: "Szybka zmiana nogi i mocne pchnięcie w akceleracji.", dose: "2–3 × 3 na stronę", rest: "Przerwa 60 s" },
      { id: "a_accent", name: "A-accent", purpose: "Akcent mocy po trzech luźnych krokach.", dose: "2–3 × 10–15 m", rest: "Przerwa 60 s" },
      { id: "alternate_leg_bounds", name: "Wieloskok naprzemienny", purpose: "Przeniesienie siły poziomo przed sprintem.", dose: "2 × 5 na stronę", rest: "Przerwa 90 s" },
    ],
    [
      { id: "a_skip_add_step", name: "Skip A z add-step", purpose: "Rytm i aktywna stopa w pozycji startowej.", dose: "2–3 × 15–20 m", rest: "Przerwa 60 s" },
      { id: "switch_skip_a", name: "Switch → Skip A", purpose: "Połączenie szybkiej zmiany z rytmem A.", dose: "2–3 × 15 m", rest: "Przerwa 60 s" },
      { id: "power_skip_distance", name: "Power skip na odległość", purpose: "Mocne pchnięcie podłoża do tyłu.", dose: "2 × 15 m", rest: "Przerwa 90 s" },
    ],
  ],
  maximum_velocity: [
    [
      { id: "c_accent", name: "C-accent", purpose: "Akcent cyklu pod biodrem po luźnych krokach.", dose: "2–3 × 10–15 m", rest: "Przerwa 60 s" },
      { id: "a_skip_no_add_step", name: "Skip A bez add-step", purpose: "Wysokie biodra i kontakt pod środkiem masy.", dose: "2–3 × 15–20 m", rest: "Przerwa 60 s" },
      { id: "scissor_exchange_jump", name: "Naprzemienny skok nożycowy z wymianą", purpose: "Sprężysta wymiana nogi przed maksymalną prędkością.", dose: "2 × 4 na stronę", rest: "Przerwa 90 s" },
    ],
    [
      { id: "skip_a_to_d", name: "Skip A → Skip D", purpose: "Płynne przejście do szybkiego cyklu biegowego.", dose: "2–3 × 15 m", rest: "Przerwa 60 s" },
      { id: "c_skip", name: "Skip C", purpose: "Aktywna stopa bez sięgania i overstridingu.", dose: "2–3 × 15–20 m", rest: "Przerwa 60 s" },
      { id: "power_skip_height", name: "Power skip na wysokość", purpose: "Sprężystość i rytm przy wysokich biodrach.", dose: "2 × 4 na stronę", rest: "Przerwa 90 s" },
    ],
  ],
  curved_sprinting: [
    [
      { id: "a_accent", name: "A-accent", purpose: "Przygotowanie aktywnej stopy do wejścia w łuk.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "skip_b_alternate_bounds", name: "Skip B → wieloskok naprzemienny", purpose: "Rytm i kontrola wymiany nogi.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "alternate_leg_bounds", name: "Wieloskok naprzemienny", purpose: "Sprężysta projekcja w kierunku biegu.", dose: "2 × 5 na stronę", rest: "Przerwa 90 s" },
    ],
    [
      { id: "switch_skip_a", name: "Switch → Skip A", purpose: "Szybka zmiana nogi przy stabilnych biodrach.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "c_accent", name: "C-accent", purpose: "Kontakt pod biodrem przed biegiem po łuku.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "power_skip_distance", name: "Power skip na odległość", purpose: "Kontrolowana siła pozioma bez zmęczenia.", dose: "2 × 15 m", rest: "Przerwa 90 s" },
    ],
  ],
  deceleration_cod: [
    [
      { id: "a_skip_no_add_step", name: "Skip A bez add-step", purpose: "Ustawienie stopy i bioder przed hamowaniem.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "c_skip", name: "Skip C", purpose: "Rytm i kontrola środka masy przed zmianą kierunku.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "skip_b_alternate_bounds", name: "Skip B → wieloskok naprzemienny", purpose: "Kontrolowana absorpcja i ponowne wybicie.", dose: "2 × 15 m", rest: "Przerwa 90 s" },
    ],
  ],
  reactive_agility_reacceleration: [
    [
      { id: "double_switch_skip_a", name: "Double switch → Skip A", purpose: "Szybka zmiana nogi przed reaktywnym startem.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "a_accent", name: "A-accent", purpose: "Krótki akcent mocy i koordynacji ramion.", dose: "2 × 15 m", rest: "Przerwa 60 s" },
      { id: "scissor_exchange_jump", name: "Naprzemienny skok nożycowy z wymianą", purpose: "Reaktywna wymiana podporu.", dose: "2 × 4 na stronę", rest: "Przerwa 90 s" },
    ],
  ],
};

function selectPostSkipDrills(input: FootballSpeedEngineInput, fallback: FamilySpec): RowSpec[] {
  const pools = POST_SKIP_POOLS[input.family] ?? [fallback.drills];
  const recent = new Set(input.recentPostSkipExerciseIds ?? []);
  const seed = (input.progressionWeek ?? 1) + Math.max(0, Math.round((input.readiness ?? 6) - 6));
  const preferred = pools[Math.abs(seed) % pools.length];
  const alternative = pools.find((pool) => pool.every((drill) => !recent.has(drill.id))) ?? preferred;
  return alternative.map((drill) => ({ ...drill }));
}

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

function isMatchPlusOne(input: FootballSpeedEngineInput): boolean {
  const value = new Date(`${input.date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return input.profile.matchDate === value.toISOString().slice(0, 10);
}

function buildRow(
  spec: RowSpec,
  order: number,
  role: FootballSpeedRole,
  input: FootballSpeedEngineInput,
  low: boolean,
  pass?: number,
  variant?: string,
): FootballSpeedExercise {
  const def = approved(spec.id);
  if (!def) throw new Error(`Brak zatwierdzonego ćwiczenia ${spec.id}.`);
  const unavailable = input.profile.unavailableEquipmentIds ?? [];
  const isAcceleration = def.speedQualities?.includes("acceleration") === true;
  const isMaxVelocity = def.speedQualities?.includes("maximum_velocity_exposure") === true;
  const cues = [
    ...(def.coachingCues ?? []),
    ...(isAcceleration ? ACCELERATION_CUES : []),
    ...(isMaxVelocity ? MAX_VELOCITY_CUES : []),
  ];
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
      : (spec.intensity ?? (role === "technical" ? "techniczna, bez zmęczenia" : "wysoka")),
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
    pass,
    variant,
    sets: "1",
    reps: (low && spec.lowDose) || spec.dose,
    distanceOrDuration: (low && spec.lowDose) || spec.dose,
    restBetweenReps: spec.rest,
    restBetweenSets: spec.rest,
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
    goalLabel: "Szybkość",
    intensity: low ? "umiarkowana" : "wysoka",
    durationMin: low ? 35 : 50,
    isOwnSession: true,
    isClubSession: false,
    isRecoveryOrPrehab: false,
    isSupplemental: false,
    reason: "Kanoniczna jednostka szybkościowa: rozgrzewka, 3 drille, sprint główny.",
    safetyNote: "Ból lub spadek jakości kończy serię.",
    whyToday: "Świeża ekspozycja szybkościowa z pełnym odpoczynkiem.",
    sessionType: "Szybkość",
    goalOfSession: spec.goal,
    riskManaged: "Niska objętość, pełne przerwy i ochrona dni okołomeczowych.",
    avoidToday: "Bez pracy kondycyjnej i dodatkowych ćwiczeń poza sesją.",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: exercises.filter((e) => e.role === "preparation" || e.role === "primer").map(toItem),
      main: exercises
        .filter(
          (e) =>
            e.role !== "preparation" &&
            e.role !== "primer" &&
            e.role !== "conditioning" &&
            e.role !== "cooldown",
        )
        .map(toItem),
      accessory: [],
      footballTransfer: [],
      cooldown: exercises.filter((e) => e.role === "cooldown").map(toItem),
    },
    secondSession: null,
    speedGeneratorVersion: FOOTBALL_SPEED_GENERATOR_VERSION,
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
  // MD-1 is a protected date as well: activation is not a speed-session
  // replacement and must not be emitted by this engine.
  if (
    isMatchDay(input) ||
    validateFootballSpeedDate(input.date, { matchDate: input.profile.matchDate }).issues.includes(
      "match_minus_one",
    ) ||
    isMatchPlusOne(input) ||
    hasHardConflict(input)
  ) {
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

  const activation = input.recentHighSpeedExposure === true;
  const low = activation || readiness(input) <= 5 || (input.fatigue ?? 0) >= 8;

  const exercises: FootballSpeedExercise[] = [];
  let order = 1;
  exercises.push(buildRow(WARMUP, order++, "preparation", input, low));
  for (const transition of SKIP_TRANSITIONS) {
    exercises.push(buildRow(transition, order++, "primer", input, true));
  }
  for (const [index, drill] of selectPostSkipDrills(input, spec).entries()) {
    const row = buildRow(drill, order++, "technical", input, low, index + 1);
    row.sets = "2";
    exercises.push(row);
  }
  const plyo = buildRow(
    {
      id: "scissor_bounds",
      name: "Niskie wyskoki nożycowe",
      purpose: "Krótki blok plyometryczny: sprężystość bez zmęczenia.",
      dose: low ? "2 × 3 kontakty na stronę" : "2–3 × 4 kontakty na stronę",
      rest: "Przerwa 60–90 s",
    },
    order++,
    "secondary",
    input,
    low,
  );
  plyo.sets = low ? "2" : "2–3";
  plyo.groundContacts = low ? 3 : 4;
  exercises.push(plyo);
  const primary = buildRow(spec.primary, order++, "primary", input, low);
  primary.sets = "4–6";
  exercises.push(primary);
  exercises.push(buildRow(TERMINAL_BY_FAMILY[input.family], order++, "terminal", input, low));
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
