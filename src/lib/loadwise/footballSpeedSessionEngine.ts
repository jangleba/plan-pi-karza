import {
  getExerciseDefinition,
  getFootballSpeedCatalog,
  type ExerciseDefinition,
  type FootballSpeedQuality,
} from "./exerciseLibrary";
import type {
  PainLocation,
  Profile,
  SessionDay,
  TrainingBlock,
  TrainingExercise,
  TrainingSection,
} from "./types";
import { validateFootballSpeedDate } from "./footballSpeedScheduling";

export type FootballSpeedFamily =
  | "acceleration"
  | "maximum_velocity"
  | "curved_sprinting"
  | "deceleration_cod"
  | "reactive_agility_reacceleration";

const FOOTBALL_SPEED_FAMILIES: readonly FootballSpeedFamily[] = [
  "acceleration",
  "maximum_velocity",
  "curved_sprinting",
  "deceleration_cod",
  "reactive_agility_reacceleration",
];

export function persistedFootballSpeedFamily(session: SessionDay): FootballSpeedFamily | undefined {
  return FOOTBALL_SPEED_FAMILIES.includes(session.speedFamily as FootballSpeedFamily)
    ? (session.speedFamily as FootballSpeedFamily)
    : undefined;
}

/** Drille z poprzedniej sesji, których kolejny plan powinien unikać. */
export function postSkipExerciseIdsFromSession(session: SessionDay): string[] {
  return (
    session.structuredSections
      ?.flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises)
      .filter((exercise) => exercise.speedRole === "technical")
      .map((exercise) => exercise.exerciseId)
      .filter((id): id is string => Boolean(id)) ?? []
  );
}

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
 * Dokładnie: przygotowanie, skipy, 3 drille, plyo, opór/zamiana,
 * sprint główny, element końcowy i wyciszenie.
 */
export type FootballSpeedRole =
  | "preparation"
  | "technical"
  | "primer"
  | "resisted"
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
  groundContacts?: number;
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
export const FOOTBALL_SPEED_GENERATOR_VERSION = "football-speed-v5-guided-main-flow";

type DoseMode = "full" | "reduced" | "activation";

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
  id: "sprint_ramp_warmup",
  name: "Przygotowanie RAMP do sprintu",
  purpose:
    "Podniesienie temperatury, mobilizacja bioder i kostek oraz przygotowanie mechaniki biegu do pracy z wysoką prędkością.",
  dose: "8–10 min: Raise → Activate/Mobilise → Potentiate",
  rest: "Bez przerw — płynne przejście do drilli",
  intensity: "niska, narastająca",
};

const COOLDOWN: RowSpec = {
  id: "sprint_cooldown_walk",
  name: "Marsz i uspokojenie oddechu",
  purpose: "Powrót tętna i oddechu do spoczynku oraz rozluźnienie mięśni po pracy szybkościowej.",
  dose: "3–4 min spokojnego marszu i długiego wydechu",
  rest: "—",
  intensity: "bardzo niska",
};

const SKIP_TRANSITIONS: RowSpec[] = [
  {
    id: "a_skip",
    name: "Skip A — seria 1",
    purpose: "Kontrolowana technika, rytm i aktywna stopa przed sprintem.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "step_in",
  },
  {
    id: "c_skip",
    name: "Skip C — seria 1",
    purpose: "Kontrolowana praca cykliczna i stabilna miednica.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "step_in",
  },
  {
    id: "b_skip",
    name: "Skip B — seria 1",
    purpose: "Kontrola kolana i stopy w rytmie biegowym.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "step_in",
  },
  {
    id: "d_skip",
    name: "Skip D — seria 1",
    purpose: "Aktywna stopa i sprężystość bez utraty pozycji.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 45 s",
    variant: "step_in",
  },
  {
    id: "a_skip",
    name: "Skip A — seria 2",
    purpose: "Szybszy, dynamiczny strike pod biodrem bez utraty postawy.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "continuous",
  },
  {
    id: "c_skip",
    name: "Skip C — seria 2",
    purpose: "Szybsza praca cykliczna z aktywną stopą pod biodrem.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "continuous",
  },
  {
    id: "b_skip",
    name: "Skip B — seria 2",
    purpose: "Dynamiczny rytm i skoordynowane ramiona bez ruchu bocznego.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 30 s",
    variant: "continuous",
  },
  {
    id: "d_skip",
    name: "Skip D — seria 2",
    purpose: "Najszybszy jakościowy strike pod biodrem przed drillami.",
    dose: "1 × 15–20 m",
    rest: "Przerwa 45 s",
    variant: "continuous",
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
    id: "progressive_deceleration_5_10_15",
    name: "Kontrolowane wyjście ze sprintu po łuku",
    purpose: "Bezpieczne wytracenie prędkości po głównych biegach po łuku.",
    dose: "2 × 10 m kontrolowanego hamowania",
    rest: "Pełna przerwa 90 s",
  },
  deceleration_cod: {
    id: "planned_cut",
    name: "Zaplanowane cięcie i ponowne przyspieszenie",
    purpose: "Przeniesienie opanowanego hamowania na zmianę kierunku w obie strony.",
    dose: "4 powtórzenia: 2 w lewo + 2 w prawo",
    rest: "Pełna przerwa 2 min",
    direction: "left/right",
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
      {
        id: "a_switch_progression",
        name: "A-switch: pojedyncza → podwójna → potrójna",
        purpose: "Szybka zmiana nogi i mocne pchnięcie w akceleracji.",
        dose: "2–3 × 3 na stronę",
        rest: "Przerwa 60 s",
      },
      {
        id: "a_accent",
        name: "A-accent",
        purpose: "Akcent mocy po trzech luźnych krokach.",
        dose: "2–3 × 10–15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "alternate_leg_bounds",
        name: "Wieloskok naprzemienny",
        purpose: "Przeniesienie siły poziomo przed sprintem.",
        dose: "2 × 5 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
    [
      {
        id: "a_skip_add_step",
        name: "Skip A z add-step",
        purpose: "Rytm i aktywna stopa w pozycji startowej.",
        dose: "2–3 × 15–20 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "switch_skip_a",
        name: "Switch → Skip A",
        purpose: "Połączenie szybkiej zmiany z rytmem A.",
        dose: "2–3 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "power_skip_distance",
        name: "Power skip na odległość",
        purpose: "Mocne pchnięcie podłoża do tyłu.",
        dose: "2 × 15 m",
        rest: "Przerwa 90 s",
      },
    ],
  ],
  maximum_velocity: [
    [
      {
        id: "c_accent",
        name: "C-accent",
        purpose: "Akcent cyklu pod biodrem po luźnych krokach.",
        dose: "2–3 × 10–15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "a_skip_no_add_step",
        name: "Skip A bez add-step",
        purpose: "Wysokie biodra i kontakt pod środkiem masy.",
        dose: "2–3 × 15–20 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "scissor_exchange_jump",
        name: "Naprzemienny skok nożycowy z wymianą",
        purpose: "Sprężysta wymiana nogi przed maksymalną prędkością.",
        dose: "2 × 4 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
    [
      {
        id: "skip_a_to_d",
        name: "Skip A → Skip D",
        purpose: "Płynne przejście do szybkiego cyklu biegowego.",
        dose: "2–3 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "c_skip",
        name: "Skip C",
        purpose: "Aktywna stopa bez sięgania i overstridingu.",
        dose: "2–3 × 15–20 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "power_skip_height",
        name: "Power skip na wysokość",
        purpose: "Sprężystość i rytm przy wysokich biodrach.",
        dose: "2 × 4 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
  ],
  curved_sprinting: [
    [
      {
        id: "a_accent",
        name: "A-accent",
        purpose: "Przygotowanie aktywnej stopy do wejścia w łuk.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "skip_b_alternate_bounds",
        name: "Skip B → wieloskok naprzemienny",
        purpose: "Rytm i kontrola wymiany nogi.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "alternate_leg_bounds",
        name: "Wieloskok naprzemienny",
        purpose: "Sprężysta projekcja w kierunku biegu.",
        dose: "2 × 5 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
    [
      {
        id: "switch_skip_a",
        name: "Switch → Skip A",
        purpose: "Szybka zmiana nogi przy stabilnych biodrach.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "c_accent",
        name: "C-accent",
        purpose: "Kontakt pod biodrem przed biegiem po łuku.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "power_skip_distance",
        name: "Power skip na odległość",
        purpose: "Kontrolowana siła pozioma bez zmęczenia.",
        dose: "2 × 15 m",
        rest: "Przerwa 90 s",
      },
    ],
  ],
  deceleration_cod: [
    [
      {
        id: "a_skip_no_add_step",
        name: "Skip A bez add-step",
        purpose: "Ustawienie stopy i bioder przed hamowaniem.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "run_two_step_stop",
        name: "Bieg i zatrzymanie w dwóch krokach",
        purpose: "Pierwsza kontrolowana ekspozycja na absorpcję siły hamowania.",
        dose: "2 × 10 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "skip_b_alternate_bounds",
        name: "Skip B → wieloskok naprzemienny",
        purpose: "Kontrolowana absorpcja i ponowne wybicie.",
        dose: "2 × 15 m",
        rest: "Przerwa 90 s",
      },
    ],
    [
      {
        id: "double_switch_skip_a",
        name: "Double switch → Skip A",
        purpose: "Szybka wymiana nogi przed wejściem w hamowanie.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "progressive_run_three_step_stop",
        name: "Bieg i zatrzymanie w trzech krokach",
        purpose: "Kontrola środka masy przy rosnącej prędkości wejściowej.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "alternate_leg_bounds",
        name: "Wieloskok naprzemienny",
        purpose: "Sprężysta absorpcja i ponowne wybicie bez utraty osi kolana.",
        dose: "2 × 5 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
  ],
  reactive_agility_reacceleration: [
    [
      {
        id: "double_switch_skip_a",
        name: "Double switch → Skip A",
        purpose: "Szybka zmiana nogi przed reaktywnym startem.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "a_accent",
        name: "A-accent",
        purpose: "Krótki akcent mocy i koordynacji ramion.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "scissor_exchange_jump",
        name: "Naprzemienny skok nożycowy z wymianą",
        purpose: "Reaktywna wymiana podporu.",
        dose: "2 × 4 na stronę",
        rest: "Przerwa 90 s",
      },
    ],
    [
      {
        id: "switch_skip_a",
        name: "Switch → Skip A",
        purpose: "Szybka wymiana nogi przed startem na sygnał.",
        dose: "2 × 15 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "run_two_step_stop",
        name: "Bieg i zatrzymanie w dwóch krokach",
        purpose: "Stabilna baza do natychmiastowego ponownego przyspieszenia.",
        dose: "2 × 10 m",
        rest: "Przerwa 60 s",
      },
      {
        id: "power_skip_distance",
        name: "Power skip na odległość",
        purpose: "Pozioma projekcja siły bez dokładania zmęczenia.",
        dose: "2 × 15 m",
        rest: "Przerwa 90 s",
      },
    ],
  ],
};

const RESISTED_SLED: RowSpec = {
  id: "resisted_sled_acceleration",
  name: "Przyspieszenie z oporem sań",
  purpose: "Wzmocnienie poziomego pchnięcia w pierwszych krokach bez utraty pozycji.",
  dose: "3 × 8–10 m",
  lowDose: "2 × 8 m",
  rest: "Pełna przerwa 90–120 s",
  intensity: "wysoka jakość, lekki–umiarkowany opór",
};

/** Plyometria wspiera konkretny bodziec sprintowy, zamiast powtarzać jeden ruch w każdej sesji. */
const PLYO_BY_FAMILY: Record<FootballSpeedFamily, RowSpec> = {
  acceleration: {
    id: "scissor_bounds",
    name: "Naprzemienne wyskoki nożycowe",
    purpose: "Poziome przekazanie siły i szybka wymiana nogi przed akceleracją.",
    dose: "2–3 × 4 kontakty na stronę",
    lowDose: "2 × 3 kontakty na stronę",
    rest: "Przerwa 60–90 s",
  },
  maximum_velocity: {
    id: "bilateral_pogo",
    name: "Pogo obunóż",
    purpose: "Krótki kontakt z podłożem i sztywność stawu skokowego przed wysoką prędkością.",
    dose: "2–3 × 8 kontaktów",
    lowDose: "2 × 6 kontaktów",
    rest: "Przerwa 60–90 s",
  },
  curved_sprinting: {
    id: "lateral_pogo",
    name: "Pogo boczne",
    purpose: "Boczna sprężystość i kontrola podporu potrzebna podczas sprintu po łuku.",
    dose: "2–3 × 6 kontaktów na stronę",
    lowDose: "2 × 4 kontakty na stronę",
    rest: "Przerwa 60–90 s",
  },
  deceleration_cod: {
    id: "snap_down",
    name: "Lądowanie snap-down",
    purpose: "Kontrolowana absorpcja siły i stabilna pozycja przed hamowaniem.",
    dose: "2–3 × 4 powtórzenia",
    lowDose: "2 × 3 powtórzenia",
    rest: "Przerwa 60–90 s",
  },
  reactive_agility_reacceleration: {
    id: "lateral_bound_to_stick",
    name: "Skok boczny z zatrzymaniem",
    purpose: "Kontrola podporu bocznego przed reaktywną zmianą kierunku i ponownym startem.",
    dose: "2–3 × 3 na stronę",
    lowDose: "2 × 2 na stronę",
    rest: "Przerwa 60–90 s",
  },
};

function plyoSpec(input: FootballSpeedEngineInput): RowSpec {
  const advancedReactive = PLYO_BY_FAMILY.reactive_agility_reacceleration;
  if (
    input.family === "reactive_agility_reacceleration" &&
    (input.profile.age < 16 || input.profile.level !== "advanced")
  ) {
    return PLYO_BY_FAMILY.deceleration_cod;
  }
  if (
    input.family === "curved_sprinting" &&
    (input.profile.age < 15 || input.profile.level === "beginner")
  ) {
    return PLYO_BY_FAMILY.maximum_velocity;
  }
  return input.family === "reactive_agility_reacceleration"
    ? advancedReactive
    : PLYO_BY_FAMILY[input.family];
}

const RESISTED_BODYWEIGHT: RowSpec = {
  id: "wall_march",
  name: "Wall march — pozycja akceleracyjna",
  purpose: "Bezsprzętowe przygotowanie kąta ciała i kierunku pchnięcia przed sprintem.",
  dose: "3 × 5 na stronę",
  lowDose: "2 × 5 na stronę",
  rest: "Przerwa 45–60 s",
  intensity: "techniczna, mocne napięcie",
};

const ACCELERATION_START_VARIANTS: RowSpec[] = [
  {
    id: "falling_start",
    name: "Start z upadku",
    purpose:
      "Nauczyć pierwszego kroku dokładnie w chwili utraty równowagi, bez siadania biodrami przed startem.",
    dose: "2 × 10 m",
    lowDose: "1–2 × 10 m",
    rest: "Pełna przerwa 75–90 s",
    intensity: "maksymalna jakość pierwszych kroków",
  },
  {
    id: "split_stance_start",
    name: "Start z pozycji wykrocznej",
    purpose:
      "Rozwinąć mocne odbicie z nieruchomej pozycji i nauczyć równej jakości startu z obu ustawień nóg.",
    dose: "2 × 10–15 m (po 1 z każdej nogi z przodu)",
    lowDose: "2 × 10 m (po 1 na stronę)",
    rest: "Pełna przerwa 75–90 s",
    intensity: "maksymalna jakość pierwszych kroków",
  },
  {
    id: "push_up_start",
    name: "Start z podporu",
    purpose:
      "Wymusić szybkie ustawienie stóp pod ciałem i agresywne przejście z niskiej pozycji do przyspieszenia.",
    dose: "2 × 10 m",
    lowDose: "1–2 × 10 m",
    rest: "Pełna przerwa 75–90 s",
    intensity: "maksymalna jakość pierwszych kroków",
  },
];

const SECOND_MAIN_BY_FAMILY: Omit<Record<FootballSpeedFamily, RowSpec>, "acceleration"> = {
  maximum_velocity: {
    id: "upright_football_sprint",
    name: "Piłkarski sprint wyprostowany",
    purpose:
      "Przenieść prędkość z odcinka lotnego do dłuższego, swobodnego biegu przypominającego sprint meczowy.",
    dose: "2 × 30 m przy 90–95%",
    lowDose: "1–2 × 25 m przy 85–90%",
    rest: "Pełna przerwa 3 min",
    intensity: "szybko, ale bez zaciskania i walki z techniką",
  },
  curved_sprinting: {
    id: "reactive_curved_sprint",
    name: "Reaktywny sprint po łuku",
    purpose:
      "Dodać decyzję lewo/prawo do opanowanego wcześniej biegu po łuku, bez ostrego cięcia kierunku.",
    dose: "2 × 20–25 m (1 w lewo, 1 w prawo)",
    lowDose: "2 × 15–20 m (1 na stronę)",
    rest: "Pełna przerwa 2–3 min",
    intensity: "maksymalna jakość i płynny łuk",
    direction: "left/right",
  },
  deceleration_cod: {
    id: "deceleration_lateral_exit",
    name: "Hamowanie z wyjściem bocznym",
    purpose:
      "Połączyć kontrolowane obniżenie środka masy z krótkim wyjściem w bok, jak po doskoku do rywala.",
    dose: "4 × 10 m (2 wyjścia w lewo, 2 w prawo)",
    lowDose: "2 × 10 m (1 na stronę)",
    rest: "Pełna przerwa 90–120 s",
    intensity: "wysoka, lecz zawsze pod kontrolą",
    direction: "left/right",
  },
  reactive_agility_reacceleration: {
    id: "app_visual_colour_cue_cod",
    name: "Zmiana kierunku na sygnał wizualny",
    purpose:
      "Zastosować tę samą jakość hamowania i ponownego startu po innym rodzaju bodźca niż dźwięk.",
    dose: "4 akcje × 8–10 m (losowo lewo/prawo)",
    lowDose: "2–3 akcje × 8 m",
    rest: "Pełna przerwa 90 s",
    intensity: "maksymalna jakość reakcji, nie zgadywanie",
    direction: "left/right",
  },
};

function mainSprintRows(input: FootballSpeedEngineInput, spec: FamilySpec): RowSpec[] {
  if (input.family === "acceleration") {
    const index =
      Math.max(0, (input.progressionWeek ?? 1) - 1) % ACCELERATION_START_VARIANTS.length;
    return [ACCELERATION_START_VARIANTS[index], spec.primary];
  }
  return [spec.primary, SECOND_MAIN_BY_FAMILY[input.family]];
}

function hasAvailableSled(profile: Profile): boolean {
  const declared = (profile.equipment ?? []).map((item) => item.toLocaleLowerCase("pl-PL"));
  const unavailable = (profile.unavailableEquipmentIds ?? []).map((item) =>
    item.toLocaleLowerCase("pl-PL"),
  );
  return (
    declared.some((item) => ["sled", "sanie", "sanki"].includes(item)) &&
    !unavailable.some((item) => ["sled", "sanie", "sanki"].includes(item))
  );
}

function resistedSpec(profile: Profile): RowSpec {
  return hasAvailableSled(profile) ? RESISTED_SLED : RESISTED_BODYWEIGHT;
}

function selectPostSkipDrills(input: FootballSpeedEngineInput, fallback: FamilySpec): RowSpec[] {
  const pools = POST_SKIP_POOLS[input.family] ?? [fallback.drills];
  const recent = new Set(input.recentPostSkipExerciseIds ?? []);
  const seed = (input.progressionWeek ?? 1) + Math.max(0, Math.round((input.readiness ?? 6) - 6));
  const preferred = pools[Math.abs(seed) % pools.length];
  const alternative = preferred.every((drill) => !recent.has(drill.id))
    ? preferred
    : (pools.find((pool) => pool.every((drill) => !recent.has(drill.id))) ?? preferred);
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

function resolveDoseMode(input: FootballSpeedEngineInput): DoseMode {
  const hasReadiness = typeof input.readiness === "number";
  const activation =
    input.recentHighSpeedExposure === true ||
    (hasReadiness && readiness(input) <= 5) ||
    (input.fatigue ?? 0) >= 8;
  if (activation) return "activation";

  const reduced =
    input.profile.age < 15 ||
    input.profile.level === "beginner" ||
    (hasReadiness && readiness(input) <= 7) ||
    (input.fatigue ?? 0) >= 7;
  return reduced ? "reduced" : "full";
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
  mode: DoseMode,
  pass?: number,
  variant?: string,
): FootballSpeedExercise {
  const def = approved(spec.id);
  if (!def) throw new Error(`Brak zatwierdzonego ćwiczenia ${spec.id}.`);
  const unavailable = input.profile.unavailableEquipmentIds ?? [];
  const requiredEquipment = def.equipmentRequired.map(String).filter((item) => item !== "none");
  const isAcceleration = def.speedQualities?.includes("acceleration") === true;
  const isMaxVelocity = def.speedQualities?.includes("maximum_velocity_exposure") === true;
  const useReducedDose = mode !== "full" && Boolean(spec.lowDose);
  const dose = useReducedDose ? spec.lowDose! : spec.dose;
  const highQualityRole = role === "resisted" || role === "primary" || role === "terminal";
  const cues = [
    ...(def.coachingCues ?? []),
    ...(isAcceleration ? ACCELERATION_CUES : []),
    ...(isMaxVelocity ? MAX_VELOCITY_CUES : []),
  ];
  return {
    order,
    role,
    exerciseId: spec.id,
    // Jedno źródło nazw widocznych dla zawodnika: zatwierdzona biblioteka.
    // RowSpec opisuje cel i dawkę, ale nie może tworzyć drugiej wersji nazwy.
    name: def.displayNamePl,
    purpose: spec.purpose,
    dose,
    rest: spec.rest,
    intensity:
      mode === "activation" && highQualityRole
        ? "kontrolowana jakość (75–85%)"
        : (spec.intensity ??
          (role === "technical" || role === "primer" ? "techniczna, bez zmęczenia" : "wysoka")),
    coachingCuesPl: Array.from(new Set(cues)).slice(0, 5),
    safetyStopRule:
      "Natychmiast przerwij przy bólu, pogorszeniu kontroli lub wyraźnym spadku jakości.",
    equipment: {
      requiredEquipment,
      unavailableEquipment: unavailable,
      replacementStatus: requiredEquipment.some((equipment) => unavailable.includes(equipment))
        ? "blocked"
        : "available",
    },
    direction: spec.direction,
    pass,
    variant,
    sets: "1",
    reps: dose,
    distanceOrDuration: dose,
    restBetweenReps: spec.rest,
    restBetweenSets: spec.rest,
  };
}

function visualIdForExercise(exerciseId: string): string | undefined {
  const visualByExercise: Partial<Record<string, string>> = {
    free_acceleration_sprint: "sprint_acceleration",
    flying_sprint: "max_velocity_sprint",
    progressive_build_up_sprint: "max_velocity_sprint",
    football_curved_sprint: "sprint_acceleration",
    progressive_deceleration_5_10_15: "deceleration",
    planned_cut: "change_of_direction",
    accel_decel_reaccel: "change_of_direction",
    app_audio_forward_left_right: "change_of_direction",
    alternate_leg_bounds: "bounds",
    skip_b_alternate_bounds: "bounds",
    power_skip_distance: "bounds",
    scissor_bounds: "bounds",
  };
  return visualByExercise[exerciseId];
}

function toTrainingExercise(date: string, exercise: FootballSpeedExercise): TrainingExercise {
  const definition = approved(exercise.exerciseId);
  return {
    id: `${date}-${exercise.order}-${exercise.exerciseId}`,
    exerciseId: exercise.exerciseId,
    speedRole: exercise.role,
    name: exercise.name,
    purpose: exercise.purpose,
    visualId: visualIdForExercise(exercise.exerciseId),
    displayPrescription: exercise.dose,
    instructionSteps: definition?.instructionsPl?.map((description, index) => ({
      title: `Krok ${index + 1}`,
      description,
    })),
    sets: exercise.sets,
    reps: exercise.reps,
    duration: exercise.distanceOrDuration,
    restAfterExercise: exercise.restBetweenReps,
    restAfterPair: exercise.restBetweenSets,
    equipment: exercise.equipment.requiredEquipment.join(", ") || "Masa ciała",
    cue: exercise.coachingCuesPl.join(". "),
    commonMistake: definition?.commonErrors.join(". ") || exercise.safetyStopRule,
    contraindications: exercise.safetyStopRule,
    groundContacts: exercise.groundContacts,
  };
}

function buildStructuredSections(
  input: FootballSpeedEngineInput,
  exercises: FootballSpeedExercise[],
): TrainingSection[] {
  const sectionMeta: Record<"warmup" | "main" | "cooldown", { title: string }> = {
    warmup: { title: "Przygotowanie RAMP, skipy i technika" },
    main: { title: "Plyometria, opór i praca szybkościowa" },
    cooldown: { title: "Wyciszenie" },
  };
  const sections = new Map<"warmup" | "main" | "cooldown", TrainingSection>();

  for (const exercise of exercises) {
    const sectionType =
      exercise.role === "preparation" || exercise.role === "primer"
        ? "warmup"
        : exercise.role === "cooldown"
          ? "cooldown"
          : "main";
    let section = sections.get(sectionType);
    if (!section) {
      section = {
        id: `${input.date}-speed-${sectionType}`,
        title: sectionMeta[sectionType].title,
        type: sectionType,
        blocks: [],
      };
      sections.set(sectionType, section);
    }

    const trainingExercise = toTrainingExercise(input.date, exercise);
    const block: TrainingBlock = {
      id: `${trainingExercise.id}-block`,
      title: exercise.name,
      blockType: "single",
      intent:
        exercise.role === "preparation" || exercise.role === "primer"
          ? "mobility"
          : exercise.role === "terminal" || input.family === "deceleration_cod"
            ? "braking"
            : "power",
      exercises: [trainingExercise],
      restAfterBlock: exercise.restBetweenSets,
      safetyNotes: exercise.safetyStopRule,
    };
    section.blocks.push(block);
  }

  return ["warmup", "main", "cooldown"]
    .map((type) => sections.get(type as "warmup" | "main" | "cooldown"))
    .filter((section): section is TrainingSection => Boolean(section));
}

function buildSessionDay(
  input: FootballSpeedEngineInput,
  spec: FamilySpec,
  exercises: FootballSpeedExercise[],
  title: string,
  mode: DoseMode,
): SessionDay {
  const toItem = (exercise: FootballSpeedExercise) => ({
    name: exercise.name,
    exerciseId: exercise.exerciseId,
    // Rola sprintowa musi przetrwać do widoku (mapowanie bloków 01–07).
    speedRole: exercise.role,
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
    intensity: mode === "activation" ? "umiarkowana" : "wysoka",
    durationMin:
      mode === "activation"
        ? 40
        : mode === "reduced"
          ? 46
          : input.family === "maximum_velocity"
            ? 58
            : 54,
    isOwnSession: true,
    isClubSession: false,
    isRecoveryOrPrehab: false,
    isSupplemental: false,
    reason:
      "Kanoniczna jednostka szybkościowa: RAMP, skipy A–C–B–D, trzy drille, plyometria, opór, sprint i kontrolowane hamowanie.",
    safetyNote:
      "Jakość jest ważniejsza od liczby powtórzeń. Ból, utrata kontroli albo wyraźny spadek prędkości kończy serię.",
    whyToday:
      mode === "activation"
        ? "Krótka ekspozycja techniczna po obniżeniu objętości przez LoadWise."
        : mode === "reduced"
          ? "Dawka szybkości została obniżona do aktualnej gotowości lub etapu rozwoju."
          : "Pełna jakościowa ekspozycja szybkościowa z długim odpoczynkiem.",
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
    structuredSections: buildStructuredSections(input, exercises),
    secondSession: null,
    speedGeneratorVersion: FOOTBALL_SPEED_GENERATOR_VERSION,
    speedFamily: input.family,
    speedProgressionWeek: input.progressionWeek ?? 1,
    speedRecentPostSkipExerciseIds: input.recentPostSkipExerciseIds
      ? [...input.recentPostSkipExerciseIds]
      : [],
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

  const mode = resolveDoseMode(input);
  const activation = mode === "activation";

  const exercises: FootballSpeedExercise[] = [];
  let order = 1;
  exercises.push(buildRow(WARMUP, order++, "preparation", input, mode));
  for (const transition of SKIP_TRANSITIONS) {
    exercises.push(buildRow(transition, order++, "primer", input, mode));
  }
  for (const [index, drill] of selectPostSkipDrills(input, spec).entries()) {
    const row = buildRow(drill, order++, "technical", input, mode, index + 1);
    row.sets = "2";
    exercises.push(row);
  }
  const plyo = buildRow(plyoSpec(input), order++, "secondary", input, mode);
  plyo.sets = mode === "full" ? "2–3" : "2";
  plyo.groundContacts = mode === "full" ? 4 : 3;
  exercises.push(plyo);

  const resisted = buildRow(resistedSpec(input.profile), order++, "resisted", input, mode);
  resisted.sets = mode === "full" ? "3" : "2";
  exercises.push(resisted);

  // Dwa uzupełniające się zadania główne zamiast jednego ogólnego wiersza.
  // Cel sesji pozostaje jeden, lecz zawodnik najpierw uczy się konkretnego
  // rozwiązania, a następnie przenosi je do swobodniejszego sprintu.
  for (const mainRow of mainSprintRows(input, spec)) {
    const primary = buildRow(mainRow, order++, "primary", input, mode);
    primary.sets = mode === "full" ? "2–3" : "1–2";
    exercises.push(primary);
  }
  const terminal = buildRow(TERMINAL_BY_FAMILY[input.family], order++, "terminal", input, mode);
  terminal.sets = "2";
  exercises.push(terminal);
  exercises.push(buildRow(COOLDOWN, order++, "cooldown", input, mode));

  const title = activation ? `${spec.title} — aktywacja` : spec.title;
  const shortTitle = activation ? `${spec.shortTitle} (aktywacja)` : spec.shortTitle;

  return {
    status: activation ? "activation" : "generated",
    date: input.date,
    family: input.family,
    title,
    shortTitle,
    session: buildSessionDay(input, spec, exercises, title, mode),
    exercises,
    primaryExerciseId: mainSprintRows(input, spec)[0].id,
    secondaryExerciseId: terminal.exerciseId,
    excludedExerciseIds,
    safetyNote:
      "Pełny odpoczynek między powtórzeniami; zatrzymaj serię przy bólu lub spadku jakości.",
  };
}

/** Backward-compatible descriptive alias for the engine entry point. */
export const buildFootballSpeedSession = generateFootballSpeedSession;
