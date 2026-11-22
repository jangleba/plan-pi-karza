import type { Drill } from "../drill";
import type { Position } from "../profile";
import type { CheckIn } from "../adapt";
import type { Level, Phase } from "../types";

export type TechnicalRole = "goalkeeper" | "centreback" | "fullback" | "six" | "eight" | "ten" | "winger" | "striker";
export const ROLE_LABEL: Record<TechnicalRole, string> = {
  goalkeeper: "Bramkarz", centreback: "Środkowy obrońca", fullback: "Boczny obrońca / wahadłowy",
  six: "Pomocnik 6", eight: "Pomocnik 8", ten: "Pomocnik 10", winger: "Skrzydłowy", striker: "Napastnik",
};
export const POSITION_ROLES: Record<Position, TechnicalRole[]> = {
  bramkarz: ["goalkeeper"], obronca: ["centreback", "fullback"], pomocnik: ["six", "eight", "ten"], skrzydlowy: ["winger"], napastnik: ["striker"],
};
export type TechnicalFocus = "control" | "receiving" | "passing" | "carrying" | "finishing" | "delivery";
export const FOCUS_LABEL: Record<TechnicalFocus, string> = {
  control: "Kontrola i zwroty", receiving: "Pierwszy kontakt", passing: "Podania", carrying: "Prowadzenie i zwody", finishing: "Wykończenie", delivery: "Dośrodkowania i długie podania",
};
export type PracticeMode = "solo" | "wall" | "rebounder" | "partner";
export const MODE_LABEL: Record<PracticeMode, string> = { solo: "Solo", wall: "Ściana", rebounder: "Rebounder", partner: "Z partnerem" };
export type PracticeSide = "left" | "right";
export type PreferredFoot = "left" | "right" | "both" | "unknown";
export type Stage = 0 | 1 | 2;

/** Wyłącznie ustawienia techniki; nie rozszerzają medycznego ani siłowego profilu. */
export interface TechnicalSettings {
  role?: TechnicalRole;
  level: Level;
  foot: PreferredFoot;
  side: PracticeSide;
  focus?: TechnicalFocus;
  minutes: number;
  space: { width: number; height: number };
  resources: { balls: number; cones: number; goal: boolean; wall: boolean; rebounder: boolean; partners: number };
}
export const DEFAULT_TECHNICAL_SETTINGS: TechnicalSettings = {
  level: "beginner", foot: "unknown", side: "right", minutes: 25,
  space: { width: 30, height: 22 },
  resources: { balls: 1, cones: 4, goal: false, wall: false, rebounder: false, partners: 0 },
};
export interface TechnicalSource { id: string; title: string; url: string }
export interface TechnicalFamily {
  id: string;
  title: string;
  roles: TechnicalRole[];
  focus: TechnicalFocus;
  /** Wspólny wzorzec zapobiega wybieraniu kilku podobnych ćwiczeń w jednej sesji. */
  pattern: string;
  minLevel: Level;
  intensity: "low" | "moderate" | "high";
  modes: PracticeMode[];
  minPartners?: number;
  live?: boolean;
  cones: number;
  goal: boolean;
  field: Drill["field"];
  objective: string;
  success: string;
  cues: [string, string, ...string[]];
  alternatives: [string, string];
  sourceIds: string[];
}
export interface TechnicalDose {
  sets: number; reps: number; actionS: number; resetS: number; restS: number; setupS: number; totalS: number;
}
export interface TechnicalExercise {
  familyId: string;
  progressionKey: string;
  mode: PracticeMode;
  side: PracticeSide;
  foot: PreferredFoot;
  route: 0 | 1;
  stage: Stage;
  stageReason: string;
  adapted: boolean;
  focus: TechnicalFocus;
  roleRelevant: boolean;
  intensity: TechnicalFamily["intensity"];
  success: string;
  constraint: string;
  alternatives: [string, string];
  sources: TechnicalSource[];
  dose: TechnicalDose;
  drill: Drill;
}
export interface TechnicalResult {
  v: 1;
  sessionId: string;
  familyId: string;
  progressionKey: string;
  date: string;
  stage: Stage;
  attempts: number;
  successes: number;
  /** Mała próba, przerwana sesja i brak wyniku nigdy nie zwiększają trudności. */
  plannedAttempts: number;
  difficulty: "easy" | "right" | "hard";
  /** Lżejszy dzień: wynik informacyjny, bez zmiany wypracowanej progresji. */
  adapted?: boolean;
}
export interface TechnicalRequest {
  position: Position;
  age: number;
  date: string;
  phase?: Phase;
  checkIn?: CheckIn;
  light?: boolean;
  settings: TechnicalSettings;
  history?: TechnicalResult[];
  routes?: Record<string, 0 | 1>;
}
export interface TechnicalSession {
  id: string;
  date: string;
  roleLabel: string;
  status: "ready" | "blocked" | "unavailable";
  budgetS: number;
  totalS: number;
  warmupS: number;
  warmup: string[];
  exercises: TechnicalExercise[];
  notes: string[];
  /** Przejrzysta przyczyna odrzucenia każdej niedostępnej rodziny. */
  exclusions: Array<{ familyId: string; reasons: string[] }>;
}
