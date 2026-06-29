export type Position = "goalkeeper" | "defender" | "midfielder" | "forward";
export type Level = "beginner" | "intermediate" | "advanced" | "elite";

/** Okres sezonu — steruje intensywnością i kompletnością tygodnia. */
export type SeasonPhase =
  | "offseason" // poza sezonem
  | "preseason" // przedsezon
  | "inseason" // w sezonie
  | "transition" // okres przejściowy / roztrenowanie
  | "return_injury"; // powrót po kontuzji

/** Etap w sezonie — pokazywany tylko, gdy ma znaczenie. */
export type SeasonStage =
  | "season_start"
  | "season_mid"
  | "season_end"
  | "winter_break"
  | "between_rounds"
  | "no_match_week"
  | "match_week";

/** Poziom rozgrywkowy — wyższy poziom = bardziej zorganizowany i intensywny plan. */
export type CompetitionLevel =
  | "academy" // akademia / junior
  | "b_klasa"
  | "a_klasa"
  | "okregowka"
  | "iv_liga"
  | "iii_liga"
  | "ii_liga_plus" // II liga lub wyżej
  | "semi_pro" // półprofesjonalny
  | "pro"; // profesjonalny

export type Goal =
  | "speed"
  | "strength"
  | "endurance"
  | "power"
  | "agility"
  | "general"
  | "mobility"
  | "return"
  | "matchready";

/** Co najbardziej ogranicza zawodnika — dodatkowe wsparcie, nie zastępuje celu głównego. */
export type SecondaryLimiter =
  | "speed"
  | "strength"
  | "endurance"
  | "cod"
  | "power"
  | "ball"
  | "fatigue"
  | "return";

export type DoubleSessions = "no" | "light_only" | "yes_if_safe";

export type UsualMatchDay = number | "no_fixed_day" | null; // 1=Mon ... 7=Sun

export interface Profile {
  name: string;
  age: number;
  position: Position;
  level: Level;
  goal: Goal;
  secondaryLimiter: SecondaryLimiter | null;
  clubTrainingDays: number[]; // 1=Mon ... 7=Sun
  individualTrainingDays: number[]; // 1=Mon ... 7=Sun — Loadwise own sessions
  usualMatchDay: UsualMatchDay; // weekday usually played, or no fixed day
  matchDate: string | null; // yyyy-MM-dd
  equipment: string[];
  painInjury: boolean;
  doubleSessionsAllowed: DoubleSessions;
  guardianConsent: boolean;
  onboardingComplete: boolean;
  createdAt: string;
  // --- Kontekst sezonu i rozgrywek (steruje generatorem) ---
  seasonPhase: SeasonPhase;
  seasonStage: SeasonStage | null;
  competitionLevel: CompetitionLevel;
  weeklyMatches: boolean; // czy mecze są co tydzień
  /** Świadomy tryb niestandardowego sezonu — wyłącza walidację kalendarzową. */
  seasonPhaseOverride?: boolean;
  /** Status walidacji spójności stanu sezonu (ok/invalid/incomplete/override). */
  seasonValidationStatus?: "ok" | "invalid" | "incomplete" | "override";
  hasGym: boolean; // dostęp do siłowni
  hasPitch: boolean; // dostęp do boiska
  hasSprintSpace: boolean; // miejsce do sprintu
}

export interface Readiness {
  date: string; // yyyy-MM-dd
  sleep: number;
  energy: number;
  fatigue: number;
  soreness: number;
  jointPain: number;
  stress: number;
  motivation: number;
  overall: number;
}

export interface ExerciseItem {
  name: string;
  prescription: string;
  rest?: string;
  cue?: string;
  easier?: string;
  harder?: string;
}

export type Intensity = "niska" | "umiarkowana" | "wysoka";

// ---------- Strukturalny model treningu (bloki) ----------

export type BlockType =
  | "single"
  | "superset"
  | "contrast"
  | "complex"
  | "rfd"
  | "stiffness"
  | "deceleration"
  | "accessory";

export type BlockIntent =
  | "strength"
  | "power"
  | "braking"
  | "stiffness"
  | "rfd"
  | "stability"
  | "mobility";

export type SectionType =
  | "warmup"
  | "prep"
  | "main"
  | "accessory"
  | "cooldown"
  | "log";

export type AgeSafetyLevel = "all" | "youth_ok" | "advanced_only";

export interface TrainingExercise {
  id: string;
  label?: string; // A1 | A2 | B1 | B2 ...
  name: string;
  sets?: string;
  reps?: string;
  duration?: string;
  restAfterExercise?: string;
  restAfterPair?: string;
  tempo?: string;
  rpe?: string;
  rir?: string;
  loadTarget?: string; // %1RM lub RPE docelowe
  loadGuidance?: string; // jak dobrać ciężar
  loadReduceWhen?: string; // kiedy zmniejszyć obciążenie
  plyoLevel?: number; // 1–4 poziom progresji plyometrycznej
  groundContacts?: number;
  equipment?: string;
  cue?: string;
  technique?: string;
  regression?: string;
  progression?: string;
  commonMistake?: string;
  contraindications?: string;
  ageSafetyLevel?: AgeSafetyLevel;
  matchDayRestriction?: string;
  completed?: boolean;
}

export interface TrainingBlock {
  id: string;
  title: string;
  blockType: BlockType;
  intent: BlockIntent;
  exercises: TrainingExercise[];
  restAfterBlock?: string;
  eligibilityLevel?: AgeSafetyLevel;
  safetyNotes?: string;
}

export interface TrainingSection {
  id: string;
  title: string;
  type: SectionType;
  blocks: TrainingBlock[];
}

export type DayType =
  | "match" // mecz
  | "md-1" // dzień przed meczem
  | "club" // trening klubowy (monitoring)
  | "training" // własny trening
  | "recovery" // regeneracja
  | "rest"; // dzień wolny

export type PlanSessionType =
  | "strength_power"
  | "sprint_acceleration"
  | "endurance_running"
  | "football_technical"
  | "cod_agility"
  | "testing"
  | "club_training"
  | "match"
  | "activation"
  | "recovery"
  | "prehab_mobility"
  | "rest";

export interface PlanSession {
  id: string;
  type: PlanSessionType;
  title: string;
  intensity: Intensity;
  durationMin: number;
  isClubSession: boolean;
  isOwnSession: boolean;
  isRecoveryOrPrehab: boolean;
  isSupplemental: boolean;
  exercises: ExerciseItem[];
  source: SessionDay;
}

export interface PlanDay {
  date: string;
  dayOfWeek: number;
  mdRelation: string | null;
  sessions: PlanSession[];
  outsideActivePlan?: boolean;
  source: SessionDay;
}

export interface PlanWeek {
  weekId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  days: PlanDay[];
  matchDate: string | null;
  matchDates: string[];
  focus: string;
  loadLevel: Intensity;
  reasons: string[];
}

export interface WeekStats {
  ownTrainingCount: number;
  clubTrainingCount: number;
  recoveryPrehabCount: number;
  doubleDayCount: number;
  hasMatch: boolean;
  matchDateLabel: string;
  weeklyLoadLabel: Intensity;
}

/**
 * Tagi obciążenia sesji — używane przez scheduler do ochrony następstwa dni
 * (np. brak dwóch ciężkich dolnych dni z rzędu) i do opisu bodźca.
 */
export type LoadTag =
  | "neural_high"
  | "lower_body_high"
  | "axial_load"
  | "squat_quad_dominant"
  | "hinge_posterior_chain"
  | "hamstring_eccentric"
  | "calf_achilles_stiffness"
  | "plyometric_contacts"
  | "adductor_lateral"
  | "upper_body"
  | "core"
  | "recovery_low"
  | "technical_low";

/**
 * Mezocykl / blok treningowy (4–5 tygodni). Trzyma zablokowane główne
 * ćwiczenia i tematy, tak by w obrębie bloku progresować dawką, a nie losową
 * rotacją ćwiczeń.
 */
export interface Mesocycle {
  blockId: string;
  blockWeekNumber: number; // 1-based numer tygodnia w bloku
  blockLengthWeeks: number; // 4 lub 5
  mainGoal: Profile["goal"];
  lockedMainExercises: Record<string, string>; // np. { main, powerA, hamB1, powerPair, core }
  lockedTrainingThemes: string[]; // role/tematy slotów gym
  progressionRules: string; // krótki opis logiki progresji dawką
  deloadWeek: number; // który tydzień bloku jest deloadem
  allowedSubstitutions: string[]; // dozwolone zamiany przy bólu/zmęczeniu
}

/**
 * Centralna kategoria treningu — jednoznacznie rozpoznawana przez silnik.
 * To jedyne źródło prawdy dla reguł typu "2 siłownie", wydolność, szybkość,
 * klub i mecz.
 */
export type SessionCategory =
  | "club"
  | "gym_strength"
  | "endurance_conditioning"
  | "speed_sprint"
  | "match"
  | "recovery_prehab"
  | "mobility"
  | "rest"
  | "other";

export type SessionSubcategory =
  // gym_strength
  | "lower_strength"
  | "upper_strength"
  | "full_body_strength"
  | "power_maintenance"
  | "strength_maintenance"
  // endurance_conditioning
  | "easy_run"
  | "tempo_aerobic"
  | "extensive_intervals"
  | "aerobic_intervals"
  | "bike_conditioning"
  | "pool_conditioning"
  | "low_impact_conditioning"
  | "repeated_tempo"
  | "zone2_aerobic"
  | "recovery_run"
  | "short_aerobic_block"
  // speed_sprint
  | "acceleration"
  | "deceleration"
  | "braking"
  | "first_step"
  | "max_velocity"
  | "flying_sprints"
  | "sprint_mechanics"
  | "change_of_direction"
  | "agility_speed"
  // club
  | "club_general"
  | "club_speed_focus"
  // other
  | "match"
  | "recovery"
  | "prehab"
  | "mobility"
  | "rest"
  | "ball_technical"
  | "unknown";

export type SessionLoadLevel = "none" | "low" | "moderate" | "high";

/** Skąd pochodzi sesja i dlaczego trafiła w to miejsce planu. */
export type SessionGeneratedBy =
  | "engine"
  | "user_added"
  | "user_swapped"
  | "club_external"
  | "match_external";

/**
 * Znormalizowana, jednoznaczna klasyfikacja sesji. Wyliczana przez
 * normalizeSessionCategory() przed zapisaniem sesji do planu.
 */
export interface SessionClassification {
  category: SessionCategory;
  subcategory: SessionSubcategory;
  intensity: Intensity;
  loadLevel: SessionLoadLevel;
  durationMinutes: number;
  tags: string[];

  countsAsStrength: boolean;
  countsAsEndurance: boolean;
  countsAsSpeed: boolean;
  countsAsClub: boolean;
  countsAsMatch: boolean;

  isGym: boolean;
  isClubSession: boolean;
  isEndurance: boolean;
  isSpeed: boolean;
  isMatch: boolean;
  isRecovery: boolean;
  isPrehab: boolean;
  isMobility: boolean;
  isHeavyLegs: boolean;
  isHighImpactRunning: boolean;
  isMaxVelocity: boolean;
  isAcceleration: boolean;
  isDeceleration: boolean;
  isChangeOfDirection: boolean;

  canBeSecondSession: boolean;
  generatedBy: SessionGeneratedBy;
  placementReason: string;
  sourceRule: string;
}

export interface SessionDay {
  generatorVersion?: string;
  dbId?: string; // id wiersza training_sessions (po zapisie do bazy)
  dayDbId?: string; // id wiersza training_days (po zapisie do bazy)
  sessionId?: string;
  date: string; // yyyy-MM-dd
  dayOfWeek?: number;
  mdRelation?: string | null;
  dayName: string;
  dayType: DayType;
  type?: PlanSessionType;
  title: string;
  goalLabel: string;
  intensity: Intensity;
  durationMin: number;
  isClubSession?: boolean;
  isOwnSession?: boolean;
  isRecoveryOrPrehab?: boolean;
  isSupplemental?: boolean;
  exercises?: ExerciseItem[];
  reason: string;
  safetyNote: string | null;
  whyToday: string;
  sessionType: string;
  goalOfSession: string;
  riskManaged: string;
  avoidToday: string;
  mdLabel: string | null;
  slotLabel: string | null;
  sections: {
    warmup: ExerciseItem[];
    main: ExerciseItem[];
    accessory: ExerciseItem[];
    footballTransfer: ExerciseItem[];
    cooldown: ExerciseItem[];
  };
  /** Strukturalne sekcje z blokami (siła→moc itd.). Gdy obecne, ekran szczegółów renderuje bloki. */
  structuredSections?: TrainingSection[];
  /** Tagi obciążenia sesji (scheduler + opis). */
  loadTags?: LoadTag[];
  /** Numer tygodnia w bloku mezocyklu (1-based). */
  blockWeekNumber?: number;
  /** Faza tygodnia w bloku (kalibracja/build/overload/deload). */
  blockPhaseLabel?: string;
  /** Znormalizowana, jednoznaczna klasyfikacja sesji (źródło prawdy). */
  classification?: SessionClassification;
  secondSession: SessionDay | null;
}

export interface TestResult {
  id: string;
  type: "sprint" | "vertical" | "broad" | "technique";
  date: string;
  value: string;
  note: string;
}

export interface ScoutingData {
  strengths: string;
  priorities: string;
  notes: string;
  opportunities: { id: string; title: string; detail: string }[];
}

export interface SessionCompletion {
  completed: boolean;
  rpe: number | null;
  notes: string;
}

export type ModificationType = "add" | "swap";

export type SessionStatus =
  | "planned"
  | "added_by_user"
  | "swapped_by_user"
  | "blocked_by_engine";

export interface SessionModification {
  id: string;
  date: string; // yyyy-MM-dd
  type: ModificationType;
  reason: string;
  safetyStatus: SessionStatus;
  session: SessionDay; // new / added session
  originalSession: SessionDay | null; // for swap
  createdAt: string;
}

export interface WeeklyTransition {
  id: string;
  weekNumber: number; // 1-based index of the week that was just finished
  nextMatchDate: string | null; // yyyy-MM-dd
  noMatchNextWeek: boolean;
  confirmedAt: string;
}

export interface LoadwiseState {
  profile: Profile | null;
  plan: SessionDay[];
  planGeneratedFor: string | null; // date plan starts
  readiness: Record<string, Readiness>;
  completions: Record<string, SessionCompletion>; // keyed by session dbId
  tests: TestResult[];
  scouting: ScoutingData;
  modifications: Record<string, SessionModification[]>; // keyed by date
  transitions: Record<number, WeeklyTransition>; // keyed by week_number
}
