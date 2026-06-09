export type Position = "goalkeeper" | "defender" | "midfielder" | "forward";
export type Level = "beginner" | "intermediate" | "advanced";
export type Goal =
  | "speed"
  | "strength"
  | "endurance"
  | "mobility"
  | "return"
  | "matchready";

export interface Profile {
  name: string;
  age: number;
  position: Position;
  level: Level;
  goal: Goal;
  clubTrainingDays: number[]; // 1=Mon ... 7=Sun
  matchDate: string | null; // yyyy-MM-dd
  equipment: string[];
  painInjury: boolean;
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
  sections: {
    warmup: ExerciseItem[];
    main: ExerciseItem[];
    accessory: ExerciseItem[];
    cooldown: ExerciseItem[];
  };
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

export interface LoadwiseState {
  profile: Profile | null;
  plan: SessionDay[];
  planGeneratedFor: string | null; // date plan starts
  readiness: Record<string, Readiness>;
  tests: TestResult[];
  scouting: ScoutingData;
}
