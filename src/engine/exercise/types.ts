import type { Equipment, Position } from "../profile";
import type { Level } from "../types";

/** Warstwa 1–2: definicja i wariant wykonania. Warstwa 3: recepta (Rx). Warstwa 4: wykonanie (ExerciseEvent, history.ts). */
export type Role = "preparation" | "skill" | "main_stimulus" | "accessory" | "conditioning";
export type Contraction = "dynamic" | "eccentric_emphasis" | "yielding_isometric" | "overcoming_isometric" | "ballistic" | "locomotion" | "mixed";
export type Laterality = "bilateral" | "unilateral" | "alternating" | "not_applicable";
export type RxType = "strength" | "isometric" | "plyometric" | "sprint" | "cod" | "conditioning";
export type LoadConvention = "total_kg" | "per_dumbbell_kg" | "added_to_bodyweight_kg" | "machine_setting" | "bodyweight" | "unknown";
export type ReviewStatus = "research_candidate" | "reviewed" | "published" | "retired";

export interface SetupOption { equipmentAllOf: string[]; environmentAllOf: string[]; people: string[] }

export interface ExerciseVariant {
  id: string;
  version: number;
  canonicalId: string;
  nameEn: string;
  namePl: string;
  family: string;
  movementPatterns: string[];
  jointActions: string[];
  primaryGoal: string;
  secondaryGoals: string[];
  /** Funkcje slotu, które wariant może pełnić (zgrubne: „co sesja tu potrzebuje”). */
  functions: string[];
  roles: Role[];
  contraction: Contraction;
  laterality: Laterality;
  minimumAge: number;
  setupOptions: SetupOption[];
  prerequisites: string[];
  supervision: "standard" | "qualified_required";
  familiarityRequired: boolean;
  allowedPrescriptionTypes: RxType[];
  contentStatus: "incomplete" | "complete";
  reviewStatus: ReviewStatus;
  instructionsPl: string[];
  media?: { id: string; version: number; reviewed: boolean };
  evidence: Array<{ sourceId: string; scope: "exact_protocol" | "programme" | "family_inference" | "coaching_practice"; limitations: string[] }>;
  /** Pola pomocnicze silnika. */
  cns: 1 | 2 | 3;
  loaded: boolean;
  loadConvention: LoadConvention;
  /** Kody kompetencji (np. familiar_*), które daje potwierdzone wykonanie tego wariantu w aplikacji. */
  grants?: string[];
}

/* ---------- recepty (rozłączna unia) ---------- */
interface RxBase { sets: number; restS?: number; perSide?: boolean; /** Tekst pokazywany zawodnikowi; jeśli brak, powstaje z pól. */ text?: string }
export type Rx =
  | (RxBase & { type: "strength"; reps: number; load: { convention: LoadConvention; pctRM?: [number, number] }; tempo?: string; rir?: number })
  | (RxBase & { type: "isometric"; mode: "yielding" | "overcoming"; position: string; holdS: number; trials: number; effort: "submax" | "max" })
  | (RxBase & { type: "plyometric"; trials: number; takeoff: "one_leg" | "two_leg" | "alternating"; landing: "stick" | "rebound"; direction: "vertical" | "horizontal" | "lateral"; category: "landing" | "ankle" | "vertical" | "horizontal" | "reactive" })
  | (RxBase & { type: "sprint"; reps: number; runInM: number; workM: number; runOutM: number; intensityBasis: "perceived" | "measured_mss"; resistance?: { method: "band" | "sled" | "hill"; calibrated: false } })
  | (RxBase & { type: "cod"; trials: number; sides: "both" | "one"; entry: "submax" | "near_max"; stopZoneM: number; angleDeg?: number })
  | (RxBase & { type: "conditioning"; workS: number; restWorkS: number; intervals: number; intensityBasis: "perceived" | "measured_mas" });

export type RxPhase = "volume" | "intensity" | "deload";

/* ---------- kontekst zawodnika ---------- */
export type CompetenceSource = "self_assessed" | "previously_trained" | "coach_assessed" | "performed_in_app";
export interface Competence { source: CompetenceSource; date: string }
export type Pref = { mode: "avoid" | "prefer" | "skip_next"; since: string };

export interface AthleteContext {
  age: number;
  level: Level;
  position?: Position;
  equipment: Equipment[];
  /** Dodatkowy sprzęt, środowisko i osoby zadeklarowane przez zawodnika (nic nie jest dopisywane domyślnie). */
  declared: { equipment: string[]; environment: string[]; people: string[] };
  competences: Record<string, Competence>;
  /** Bieżący nadzór specjalisty dla ścieżek `qualified_required`. */
  qualifiedSupervision: boolean;
  /** Warianty wykonane wcześniej (ekspozycje z historii). */
  familiarVariants: string[];
  prefs: Record<string, Pref>;
  /** Ziarno rotacji (stabilne dla zawodnika). */
  seed: string;
  weekInCycle: number;
  minutesAvailable?: number;
}

export interface Slot {
  id: string;
  fn: string;
  role: Role;
  /** Kolejność preferencji (pierwszy = zadanie główne bloku). */
  preferred: string[];
  blockTitle?: string;
  /** Drabinka trudności (kolejne szczeble zastępują się w dół). */
  ladder?: boolean;
}

export interface Selection {
  id: string;
  itemId: string;
  slotId: string;
  variantId: string;
  code: "preferred" | "fallback" | "rotation" | "backfill" | "user_choice" | "user_added";
  reasonPl: string;
  rejected: Array<{ variantId: string; code: string }>;
  policyVersion: number;
  seed: string;
}

export interface PlannedItem {
  itemId: string;
  slot: Slot;
  variantId: string;
  variantVersion: number;
  rx: Rx;
  note?: string;
  selectionId: string;
}
export interface PlannedBlock { title?: string; items: PlannedItem[] }
export interface Omitted { itemId: string; slot: Slot; plannedVariantId: string; code: string; messagePl: string; unlock?: Unlock }
export interface Unlock { kind: "competence" | "gear" | "supervision"; tokens: string[]; variantId: string }

export interface GeneratedSession {
  id: string;
  date: string;
  templateId: string;
  module: "strength" | "sprint";
  /** Wersja planu: rośnie po każdej zmianie; `apply` odrzuca przeterminowany podgląd. */
  version: number;
  blocks: PlannedBlock[];
  omitted: Omitted[];
  selections: Record<string, Selection>;
  notes: string[];
  /** Funkcje slotów, które plan miał pokryć (z szablonu) – do oceny celu po zmianach. */
  requiredFns: string[];
}
