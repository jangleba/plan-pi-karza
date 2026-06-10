export type Position = "goalkeeper" | "defender" | "midfielder" | "forward";
export type Level = "beginner" | "intermediate" | "advanced";
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

export type DoubleSessions = "no" | "light_only" | "yes_if_safe";

export type UsualMatchDay = number | "no_fixed_day" | null; // 1=Mon ... 7=Sun

export interface Profile {
  name: string;
  age: number;
  position: Position;
  level: Level;
  goal: Goal;
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

export type DayType =
  | "match" // mecz
  | "md-1" // dzień przed meczem
  | "club" // trening klubowy (monitoring)
  | "training" // własny trening
  | "recovery" // regeneracja
  | "rest"; // dzień wolny

export interface SessionDay {
  dbId?: string; // id wiersza training_sessions (po zapisie do bazy)
  dayDbId?: string; // id wiersza training_days (po zapisie do bazy)
  date: string; // yyyy-MM-dd
  dayName: string;
  dayType: DayType;
  title: string;
  goalLabel: string;
  intensity: Intensity;
  durationMin: number;
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
