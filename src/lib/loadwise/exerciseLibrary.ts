// ============================================================================
// Loadwise — Centralna biblioteka ćwiczeń z metadanymi bezpieczeństwa
// ----------------------------------------------------------------------------
// Jedno źródło prawdy o KAŻDYM ćwiczeniu: wymagania wieku, doświadczenia,
// sprzętu, kompetencji ruchowej, nadzoru, przeciwwskazań kontuzyjnych oraz
// progresji/regresji. Generator NIE może wstawić ćwiczenia do treningu bez
// sprawdzenia isExerciseAllowedForProfile().
//
// Reguła bezpieczeństwa: brak metadanych = ćwiczenie NIEPEWNE → nie podajemy
// go zawodnikom młodym/początkującym.
// ============================================================================

import type { PainLocation } from "./types";
import type {
  AthleteTrainingProfile,
  DevelopmentStage,
  GymExperienceLevel,
  CompetenceLevel,
  SupervisionLevel,
} from "./athleteProfile";

// ---------------------------------------------------------------------------
// Typy metadanych
// ---------------------------------------------------------------------------

export type ExerciseCategory =
  "strength" | "power" | "plyometric" | "speed" | "endurance" | "mobility" | "core" | "prehab";
export type CanonicalExerciseFamily =
  | "strength"
  | "power"
  | "plyometric"
  | "speed"
  | "tendon_isometric"
  | "mobility"
  | "recovery"
  | "conditioning"
  | "trunk";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push"
  | "pull"
  | "carry"
  | "jump"
  | "sprint"
  | "brace"
  | "rotation"
  | "gait"
  | "olympic"
  | "isometric";

export type PrimaryAdaptation =
  | "max_strength"
  | "hypertrophy"
  | "power"
  | "rfd"
  | "speed"
  | "acceleration"
  | "max_velocity"
  | "endurance"
  | "stability"
  | "mobility"
  | "coordination"
  | "technique";

export type LoadLevel = "none" | "low" | "moderate" | "high" | "very_high";

/** Ocena złożoności/ryzyka w skali 1–5. */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

/** Kategoria sesji, do której ćwiczenie może trafić. */
export type SessionCategory =
  | "strength_gym"
  | "power_plyo"
  | "speed_sprint"
  | "endurance_conditioning"
  | "football_ball_work"
  | "core_robustness"
  | "mobility_prehab";

export const SESSION_CATEGORIES: SessionCategory[] = [
  "strength_gym",
  "power_plyo",
  "speed_sprint",
  "endurance_conditioning",
  "football_ball_work",
  "core_robustness",
  "mobility_prehab",
];

/** Tryb uczestników wymagany do wykonania ćwiczenia. */
export type ParticipantMode = "solo" | "partner" | "small_group" | "team";

/** Wymagany rodzaj przestrzeni. */
export type SpaceRequirement = "home_small" | "indoor_gym" | "pitch" | "sprint_lane" | "open_field";

export type EquipmentId =
  | "barbell"
  | "trap_bar"
  | "rack"
  | "dumbbell"
  | "kettlebell"
  | "bench"
  | "box"
  | "platform"
  | "med_ball"
  | "sled"
  | "sliders"
  | "nordic_setup"
  | "machine"
  | "none";

export interface EquipmentDefinition {
  id: EquipmentId;
  displayName: string;
  aliases: string[];
}

export const EQUIPMENT_REGISTRY: readonly EquipmentDefinition[] = [
  { id: "none", displayName: "Masa ciała", aliases: ["bodyweight", "brak"] },
  { id: "barbell", displayName: "Sztanga", aliases: ["bar", "sztanga"] },
  { id: "trap_bar", displayName: "Trap bar", aliases: ["hex bar", "trap-bar"] },
  { id: "rack", displayName: "Stojak", aliases: ["rack", "squat rack"] },
  { id: "dumbbell", displayName: "Hantle", aliases: ["hantel", "hantle", "dumbbells"] },
  { id: "kettlebell", displayName: "Kettlebell", aliases: ["kettle", "odważnik"] },
  { id: "bench", displayName: "Ławka", aliases: ["bench", "ławka"] },
  { id: "box", displayName: "Skrzynia plyometryczna", aliases: ["box", "skrzynia"] },
  { id: "platform", displayName: "Podest", aliases: ["platform", "podest"] },
  {
    id: "med_ball",
    displayName: "Piłka lekarska",
    aliases: ["med ball", "medicine ball", "piłka lekarska"],
  },
  { id: "sled", displayName: "Sanie", aliases: ["sled", "sanki"] },
  { id: "sliders", displayName: "Ślizgi", aliases: ["slider", "sliders", "ślizgi"] },
  { id: "nordic_setup", displayName: "Stanowisko nordic", aliases: ["nordic", "nordic setup"] },
  { id: "machine", displayName: "Maszyna", aliases: ["machine", "maszyna"] },
];

const EQUIPMENT_INDEX = new Map<string, EquipmentId>(
  EQUIPMENT_REGISTRY.flatMap((equipment) =>
    [equipment.id, equipment.displayName, ...equipment.aliases].map(
      (value) => [normalizeExerciseName(value), equipment.id] as const,
    ),
  ),
);

export function resolveEquipmentId(value: string): EquipmentId | undefined {
  return EQUIPMENT_INDEX.get(normalizeExerciseName(value));
}

export function getAllEquipmentDefinitions(): readonly EquipmentDefinition[] {
  return EQUIPMENT_REGISTRY;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  /** Polska nazwa wyświetlana w UI. */
  displayNamePl: string;
  /** Aliasy starych/alternatywnych nazw (do migracji). */
  aliases: string[];
  /** Czy wymaga piłki futbolowej. */
  requiresBall: boolean;
  /** Kategorie sesji, w których ćwiczenie może wystąpić. */
  allowedSessionCategories: SessionCategory[];
  participantMode: ParticipantMode;
  minParticipants: number;
  spaceRequirement: SpaceRequirement;

  category: ExerciseCategory;
  movementPattern: MovementPattern;
  primaryAdaptation: PrimaryAdaptation;
  /** Ogólna trudność 1–5. */
  difficultyLevel: DifficultyLevel;
  /** Techniczna złożoność 1–5 (ryzyko przy złej technice). */
  technicalComplexity: DifficultyLevel;
  /** Minimalny wiek. */
  minAge: number;
  /** Najwcześniejszy etap rozwoju, na którym ćwiczenie jest sensowne. */
  recommendedDevelopmentStage: DevelopmentStage;
  requiredGymExperienceLevel: GymExperienceLevel;
  requiredMovementCompetenceLevel: CompetenceLevel;
  requiredSupervisionLevel: SupervisionLevel;
  /** Lista wymaganego sprzętu (puste = masa ciała). */
  equipmentRequired: EquipmentId[];
  /** Twarde przeciwwskazania (lokalizacje bólu/kontuzji). */
  contraindications: PainLocation[];
  /** Miękkie ostrożności — opis. */
  injuryCautions: string[];
  loadingType: "bodyweight" | "external" | "axial" | "ballistic" | "impact" | "none";
  impactLevel: LoadLevel;
  spinalLoadLevel: LoadLevel;
  kneeLoadLevel: LoadLevel;
  ankleLoadLevel: LoadLevel;
  hamstringLoadLevel: LoadLevel;
  plyometricIntensity: LoadLevel;
  speedIntensity: LoadLevel;
  enduranceIntensity: LoadLevel;
  allowedForYouth: boolean;
  allowedForBeginner: boolean;
  progressionIds: string[];
  regressionIds: string[];
  safeAlternativeIds: string[];
  coachingCues: string[];
  commonErrors: string[];
  /** Deterministyczna, uporządkowana lista uczciwych zamienników. */
  replacementIds?: string[];
  /** Football speed taxonomy and prescription metadata (Phase 3B). */
  speedQualities?: FootballSpeedQuality[];
  sessionRoles?: FootballSessionRole[];
  instructionsPl?: string[];
  objective?: string;
  footballRelevance?: string[];
  defaultPrescription?: FootballPrescription;
  variants?: FootballSpeedVariant[];
  approved?: boolean;
  draft?: boolean;
  /** Canonical family used by production plan generators. */
  family?: CanonicalExerciseFamily;
  /** Primary stimulus, kept distinct from the display name. */
  stimulus?: string;
  requiresPartner?: boolean;
  isSharpChangeOfDirection?: boolean;
}

export type FootballSpeedQuality =
  | "sprint_technique"
  | "acceleration"
  | "maximum_velocity_exposure"
  | "curved_sprint"
  | "deceleration"
  | "planned_change_of_direction"
  | "reactive_agility"
  | "reacceleration"
  | "repeated_sprint";

export type FootballSessionRole =
  "preparation" | "technical" | "primer" | "primary" | "secondary" | "conditioning";

export interface FootballPrescription {
  distanceM?: { min: number; max: number };
  sets?: { min: number; max: number };
  repetitions?: { min: number; max: number };
  workSeconds?: { min: number; max: number };
  restSeconds?: { min: number; max: number };
  intensity?: "controlled" | "fast" | "high" | "maximum";
}

export interface FootballSpeedVariant {
  id: string;
  labelPl: string;
  prescription?: FootballPrescription;
  metadata?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Biblioteka ćwiczeń
// ---------------------------------------------------------------------------

const LIBRARY: ExerciseDefinition[] = [
  // ---- REGRESJE / FUNDAMENT (dozwolone dla młodych/początkujących) ----
  {
    id: "bodyweight_split_squat",
    name: "Bodyweight split squat",
    displayNamePl: "Przysiad wykroczny bez obciążenia",
    aliases: ["Split squat", "Przysiad w wykroku"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "strength",
    movementPattern: "lunge",
    primaryAdaptation: "technique",
    difficultyLevel: 1,
    technicalComplexity: 2,
    minAge: 10,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: ["Przy bólu kolana skróć zakres."],
    loadingType: "bodyweight",
    impactLevel: "low",
    spinalLoadLevel: "none",
    kneeLoadLevel: "low",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "low",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["goblet_squat", "bulgarian_split_squat"],
    regressionIds: ["bodyweight_squat"],
    safeAlternativeIds: ["glute_bridge"],
    coachingCues: ["Tułów pionowo", "Kolano nad stopą", "Kontrolowane tempo"],
    commonErrors: ["Kolano ucieka do środka", "Za duży krok w przód"],
  },
  {
    id: "bodyweight_squat",
    name: "Bodyweight squat",
    displayNamePl: "Przysiad z masą własnego ciała",
    aliases: ["Przysiad", "Air squat"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "strength",
    movementPattern: "squat",
    primaryAdaptation: "technique",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "none",
    kneeLoadLevel: "low",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "low",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["goblet_squat"],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Klatka wysoko", "Biodra w tył", "Pełny zakres bez bólu"],
    commonErrors: ["Zaokrąglone plecy", "Pięty odrywają się od podłoża"],
  },
  {
    id: "glute_bridge",
    name: "Glute bridge",
    displayNamePl: "Most biodrowy",
    aliases: ["Mostek biodrowy", "Bridge"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "strength",
    movementPattern: "hinge",
    primaryAdaptation: "stability",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "none",
    kneeLoadLevel: "none",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "low",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["hip_thrust", "romanian_deadlift_db"],
    regressionIds: [],
    safeAlternativeIds: ["dead_bug"],
    coachingCues: ["Napnij pośladki na górze", "Brzuch napięty", "Bez przeprostu lędźwi"],
    commonErrors: ["Wypychanie z lędźwi", "Niepełny wyprost bioder"],
  },
  {
    id: "plank",
    name: "Plank",
    displayNamePl: "Deska",
    aliases: ["Plank przedni", "Deska przednia"],
    requiresBall: false,
    allowedSessionCategories: ["core_robustness", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "core",
    movementPattern: "brace",
    primaryAdaptation: "stability",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "low",
    kneeLoadLevel: "none",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "none",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["dead_bug"],
    regressionIds: [],
    safeAlternativeIds: ["bodyweight_squat"],
    coachingCues: ["Neutralny kręgosłup", "Napięty brzuch i pośladki"],
    commonErrors: ["Zapadnięte biodra", "Wygięte lędźwie"],
  },
  {
    id: "dead_bug",
    name: "Dead bug",
    displayNamePl: "Martwy robak",
    aliases: ["Dead-bug"],
    requiresBall: false,
    allowedSessionCategories: ["core_robustness", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "core",
    movementPattern: "brace",
    primaryAdaptation: "stability",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "none",
    kneeLoadLevel: "none",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "none",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["plank"],
    regressionIds: [],
    safeAlternativeIds: ["bird_dog"],
    coachingCues: ["Dociśnij lędźwie do podłogi", "Powolny, kontrolowany ruch"],
    commonErrors: ["Odrywanie lędźwi", "Wstrzymywanie oddechu"],
  },
  {
    id: "bird_dog",
    name: "Bird dog",
    displayNamePl: "Ptak-pies",
    aliases: ["Bird-dog", "Wyprost naprzemienny w klęku"],
    requiresBall: false,
    allowedSessionCategories: ["core_robustness", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "core",
    movementPattern: "brace",
    primaryAdaptation: "stability",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "none",
    kneeLoadLevel: "none",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "none",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["dead_bug"],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Neutralny kręgosłup", "Wydłuż przeciwną rękę i nogę", "Bez rotacji bioder"],
    commonErrors: ["Rotacja miednicy", "Zapadanie w lędźwiach"],
  },
  {
    id: "acceleration_mechanics",
    name: "Mechanika akceleracji (niska objętość)",
    displayNamePl: "Mechanika przyspieszenia",
    aliases: ["Akceleracje", "Starty", "Sprinty akceleracyjne"],
    requiresBall: false,
    allowedSessionCategories: ["speed_sprint"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "sprint_lane",
    category: "speed",
    movementPattern: "sprint",
    primaryAdaptation: "acceleration",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 10,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: ["ankle"],
    injuryCautions: ["Przy bólu łydki/ścięgna Achillesa ogranicz objętość."],
    loadingType: "impact",
    impactLevel: "low",
    spinalLoadLevel: "none",
    kneeLoadLevel: "low",
    ankleLoadLevel: "moderate",
    hamstringLoadLevel: "low",
    plyometricIntensity: "low",
    speedIntensity: "moderate",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["max_velocity_high_volume"],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Niska objętość, wysoka jakość", "Pełny rest między biegami", "Napęd z bioder"],
    commonErrors: ["Za duża objętość", "Bieg na zmęczeniu"],
    approved: true,
    draft: false,
  },
  // ---- ŚREDNIOZAAWANSOWANE ----
  {
    id: "goblet_squat",
    name: "Goblet squat",
    displayNamePl: "Przysiad goblet",
    aliases: ["Przysiad z hantlem", "Goblet"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "squat",
    primaryAdaptation: "hypertrophy",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 12,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "beginner",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: ["dumbbell"],
    contraindications: [],
    injuryCautions: ["Przy bólu kolana kontroluj głębokość."],
    loadingType: "external",
    impactLevel: "none",
    spinalLoadLevel: "low",
    kneeLoadLevel: "moderate",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "low",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["heavy_back_squat"],
    regressionIds: ["bodyweight_squat", "bodyweight_split_squat"],
    safeAlternativeIds: ["bodyweight_squat"],
    coachingCues: ["Klatka wysoko", "Łokcie w dół", "Kolana na zewnątrz"],
    commonErrors: ["Zaokrąglenie pleców", "Odrywanie pięt"],
  },
  {
    id: "romanian_deadlift_db",
    name: "Romanian deadlift z hantlami (lekko)",
    displayNamePl: "Martwy ciąg rumuński z hantlami",
    aliases: ["RDL", "Rumuński martwy ciąg"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "hinge",
    primaryAdaptation: "hypertrophy",
    difficultyLevel: 3,
    technicalComplexity: 3,
    minAge: 14,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "beginner",
    requiredMovementCompetenceLevel: "medium",
    requiredSupervisionLevel: "none",
    equipmentRequired: ["dumbbell"],
    contraindications: ["back"],
    injuryCautions: ["Przy bólu pleców zredukuj zakres/obciążenie."],
    loadingType: "external",
    impactLevel: "none",
    spinalLoadLevel: "moderate",
    kneeLoadLevel: "low",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "high",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["barbell_deadlift"],
    regressionIds: ["glute_bridge", "hip_thrust"],
    safeAlternativeIds: ["glute_bridge"],
    coachingCues: ["Biodra w tył", "Plecy proste", "Hantle blisko nóg"],
    commonErrors: ["Zaokrąglenie pleców", "Zbyt duży ciężar"],
  },
  {
    id: "hip_thrust",
    name: "Hip thrust",
    displayNamePl: "Wypychanie bioder ze sztangą",
    aliases: ["Hip thrust", "Hip thrust ze sztangą", "Wypychanie bioder"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "hinge",
    primaryAdaptation: "hypertrophy",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 14,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "beginner",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: ["barbell", "bench"],
    contraindications: [],
    injuryCautions: [],
    loadingType: "external",
    impactLevel: "none",
    spinalLoadLevel: "low",
    kneeLoadLevel: "low",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "moderate",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["romanian_deadlift_db"],
    regressionIds: ["glute_bridge"],
    safeAlternativeIds: ["glute_bridge"],
    coachingCues: ["Broda w dół", "Napnij pośladki", "Pełny wyprost bioder"],
    commonErrors: ["Przeprost lędźwi", "Niepełny zakres"],
  },
  {
    id: "bulgarian_split_squat",
    name: "Bulgarian split squat (obciążony)",
    displayNamePl: "Przysiad bułgarski z obciążeniem",
    aliases: ["Bulgarian split squat", "Przysiad bułgarski"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "lunge",
    primaryAdaptation: "hypertrophy",
    difficultyLevel: 3,
    technicalComplexity: 3,
    minAge: 15,
    recommendedDevelopmentStage: "late_youth",
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "medium",
    requiredSupervisionLevel: "some",
    equipmentRequired: ["dumbbell", "bench"],
    contraindications: ["knee"],
    injuryCautions: ["Przy bólu kolana zmniejsz zakres/obciążenie."],
    loadingType: "external",
    impactLevel: "none",
    spinalLoadLevel: "low",
    kneeLoadLevel: "high",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "moderate",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: false,
    progressionIds: ["heavy_back_squat"],
    regressionIds: ["bodyweight_split_squat", "goblet_squat"],
    safeAlternativeIds: ["bodyweight_split_squat"],
    coachingCues: ["Tułów lekko w przód", "Kolano stabilne", "Kontrola w dole"],
    commonErrors: ["Kolano ucieka do środka", "Utrata równowagi"],
  },
  // ---- ZAAWANSOWANE / OBCIĄŻENIE OSIOWE ----
  {
    id: "heavy_back_squat",
    name: "Ciężki przysiad ze sztangą (back squat)",
    displayNamePl: "Przysiad ze sztangą (back squat)",
    aliases: ["Back squat", "Przysiad ze sztangą"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "squat",
    primaryAdaptation: "max_strength",
    difficultyLevel: 5,
    technicalComplexity: 4,
    minAge: 16,
    recommendedDevelopmentStage: "late_youth",
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "high",
    requiredSupervisionLevel: "some",
    equipmentRequired: ["barbell", "rack"],
    contraindications: ["back", "knee"],
    injuryCautions: ["Duże obciążenie osiowe — wymaga dobrej techniki i nadzoru."],
    loadingType: "axial",
    impactLevel: "none",
    spinalLoadLevel: "very_high",
    kneeLoadLevel: "high",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "moderate",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: ["goblet_squat", "bodyweight_split_squat"],
    safeAlternativeIds: ["goblet_squat", "bodyweight_squat"],
    coachingCues: ["Napnij core", "Kolana za palcami stóp", "Kontrola w dół, moc w górę"],
    commonErrors: ["Zaokrąglenie pleców", "Kolana do środka", "Zbyt duży ciężar"],
  },
  {
    id: "barbell_deadlift",
    name: "Barbell deadlift (martwy ciąg ze sztangą)",
    displayNamePl: "Martwy ciąg klasyczny",
    aliases: ["Deadlift", "Conventional deadlift"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "strength",
    movementPattern: "hinge",
    primaryAdaptation: "max_strength",
    difficultyLevel: 5,
    technicalComplexity: 4,
    minAge: 16,
    recommendedDevelopmentStage: "late_youth",
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "high",
    requiredSupervisionLevel: "some",
    equipmentRequired: ["barbell"],
    contraindications: ["back"],
    injuryCautions: ["Wymaga bardzo dobrej techniki hinge i nadzoru; blokowany dla <=14 beginner."],
    loadingType: "axial",
    impactLevel: "none",
    spinalLoadLevel: "very_high",
    kneeLoadLevel: "moderate",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "very_high",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: ["romanian_deadlift_db", "hip_thrust", "glute_bridge"],
    safeAlternativeIds: ["romanian_deadlift_db", "glute_bridge"],
    replacementIds: ["romanian_deadlift_db", "glute_bridge"],
    coachingCues: ["Napięty core", "Sztanga blisko goleni", "Neutralny kręgosłup"],
    commonErrors: ["Zaokrąglone plecy", "Sztanga daleko od ciała", "Szarpanie z dołu"],
  },
  {
    id: "power_clean",
    name: "Power clean (zarzut)",
    displayNamePl: "Zarzut siłowy z pozycji zwisu",
    aliases: ["Clean", "Zarzut", "Hang power clean"],
    requiresBall: false,
    allowedSessionCategories: ["strength_gym", "power_plyo"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "power",
    movementPattern: "olympic",
    primaryAdaptation: "power",
    difficultyLevel: 5,
    technicalComplexity: 5,
    minAge: 16,
    recommendedDevelopmentStage: "adult",
    requiredGymExperienceLevel: "advanced",
    requiredMovementCompetenceLevel: "high",
    requiredSupervisionLevel: "full",
    equipmentRequired: ["barbell", "platform"],
    contraindications: ["back", "shoulder", "knee"],
    injuryCautions: ["Bardzo wysoka złożoność techniczna — wymaga pełnego nadzoru."],
    loadingType: "ballistic",
    impactLevel: "moderate",
    spinalLoadLevel: "very_high",
    kneeLoadLevel: "moderate",
    ankleLoadLevel: "moderate",
    hamstringLoadLevel: "high",
    plyometricIntensity: "moderate",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Wyprost bioder eksplozywnie", "Łokcie szybko w przód", "Sztanga blisko ciała"],
    commonErrors: ["Wczesne zgięcie ramion", "Sztanga daleko od ciała"],
  },
  {
    id: "depth_jump",
    name: "Depth jump (skok w głąb)",
    displayNamePl: "Drop jump",
    aliases: ["Skok w głąb", "Depth jumps", "Drop jump"],
    requiresBall: false,
    allowedSessionCategories: ["power_plyo"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "indoor_gym",
    category: "plyometric",
    movementPattern: "jump",
    primaryAdaptation: "rfd",
    difficultyLevel: 5,
    technicalComplexity: 4,
    minAge: 16,
    recommendedDevelopmentStage: "adult",
    requiredGymExperienceLevel: "advanced",
    requiredMovementCompetenceLevel: "high",
    requiredSupervisionLevel: "some",
    equipmentRequired: ["box"],
    contraindications: ["knee", "ankle"],
    injuryCautions: [
      "Wysoka intensywność plyometryczna — tylko przy dobrej kompetencji lądowania i świeżości.",
    ],
    loadingType: "impact",
    impactLevel: "very_high",
    spinalLoadLevel: "low",
    kneeLoadLevel: "very_high",
    ankleLoadLevel: "very_high",
    hamstringLoadLevel: "moderate",
    plyometricIntensity: "very_high",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: ["snap_down"],
    safeAlternativeIds: [],
    replacementIds: ["snap_down"],
    coachingCues: ["Miękkie, ciche lądowanie", "Krótki kontakt z podłożem", "Kolana stabilne"],
    commonErrors: ["Głośne lądowanie", "Kolana do środka", "Za wysoka skrzynia"],
  },
  {
    id: "max_velocity_high_volume",
    name: "Max velocity — wysoka objętość",
    displayNamePl: "Prędkość maksymalna — wysoka objętość",
    aliases: ["Max velocity", "Sprinty latające"],
    requiresBall: false,
    allowedSessionCategories: ["speed_sprint"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "sprint_lane",
    category: "speed",
    movementPattern: "sprint",
    primaryAdaptation: "max_velocity",
    difficultyLevel: 4,
    technicalComplexity: 3,
    minAge: 16,
    recommendedDevelopmentStage: "late_youth",
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "medium",
    requiredSupervisionLevel: "some",
    equipmentRequired: [],
    contraindications: ["hamstring", "ankle"],
    injuryCautions: ["Wysoka objętość max velocity — ryzyko dwugłowego u początkujących/młodych."],
    loadingType: "impact",
    impactLevel: "high",
    spinalLoadLevel: "none",
    kneeLoadLevel: "moderate",
    ankleLoadLevel: "high",
    hamstringLoadLevel: "very_high",
    plyometricIntensity: "high",
    speedIntensity: "very_high",
    enduranceIntensity: "low",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: ["acceleration_mechanics"],
    safeAlternativeIds: ["acceleration_mechanics"],
    coachingCues: ["Pełny rest", "Wysoka jakość mechaniki", "Stop przy spadku prędkości"],
    commonErrors: ["Za mały rest", "Bieg na zmęczeniu"],
    approved: true,
    draft: false,
  },
  {
    id: "snap_down",
    name: "Snap-down / niskie pogo",
    displayNamePl: "Lądowanie snap-down",
    aliases: ["Snap down", "Snap-down landing"],
    requiresBall: false,
    allowedSessionCategories: ["power_plyo", "mobility_prehab"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "plyometric",
    movementPattern: "jump",
    primaryAdaptation: "coordination",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 12,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "impact",
    impactLevel: "low",
    spinalLoadLevel: "none",
    kneeLoadLevel: "low",
    ankleLoadLevel: "moderate",
    hamstringLoadLevel: "low",
    plyometricIntensity: "low",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["depth_jump"],
    regressionIds: [],
    safeAlternativeIds: ["bodyweight_squat"],
    coachingCues: ["Ciche, miękkie lądowanie", "Kontrola kolan i stóp"],
    commonErrors: ["Głośne lądowanie", "Kolana do środka"],
  },
  {
    id: "med_ball_throw",
    name: "Med ball throw (lekka piłka)",
    displayNamePl: "Wyrzut piłki lekarskiej sprzed klatki",
    aliases: ["Med ball throw", "Medicine ball chest pass", "Rzut piłką lekarską"],
    requiresBall: false,
    allowedSessionCategories: ["power_plyo", "strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "home_small",
    category: "power",
    movementPattern: "rotation",
    primaryAdaptation: "power",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 12,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: ["med_ball"],
    contraindications: [],
    injuryCautions: [],
    loadingType: "ballistic",
    impactLevel: "low",
    spinalLoadLevel: "low",
    kneeLoadLevel: "low",
    ankleLoadLevel: "low",
    hamstringLoadLevel: "low",
    plyometricIntensity: "low",
    speedIntensity: "none",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: ["power_clean"],
    regressionIds: [],
    safeAlternativeIds: [],
    replacementIds: [],
    coachingCues: ["Szybko i technicznie", "Lekki ciężar", "Jakość przed ilością"],
    commonErrors: ["Za ciężka piłka", "Wolny ruch"],
  },
];

function supportExercise(
  id: string,
  name: string,
  family: CanonicalExerciseFamily,
  stimulus: string,
  overrides: Partial<ExerciseDefinition> = {},
): ExerciseDefinition {
  const category: ExerciseCategory =
    family === "mobility"
      ? "mobility"
      : family === "recovery"
        ? "prehab"
        : family === "conditioning"
          ? "endurance"
          : family === "trunk"
            ? "core"
            : family === "tendon_isometric"
              ? "prehab"
              : family === "power"
                ? "power"
                : "strength";
  const sessionCategory: SessionCategory =
    family === "mobility"
      ? "mobility_prehab"
      : family === "recovery"
        ? "mobility_prehab"
        : family === "conditioning"
          ? "endurance_conditioning"
          : family === "trunk"
            ? "core_robustness"
            : family === "tendon_isometric"
              ? "mobility_prehab"
              : category === "power"
                ? "power_plyo"
                : "strength_gym";
  return {
    id,
    name,
    displayNamePl: name,
    aliases: [],
    requiresBall: false,
    allowedSessionCategories: [sessionCategory],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: family === "conditioning" ? "open_field" : "home_small",
    category,
    movementPattern:
      family === "trunk" ? "brace" : family === "tendon_isometric" ? "isometric" : "gait",
    primaryAdaptation:
      family === "mobility"
        ? "mobility"
        : family === "recovery"
          ? "stability"
          : family === "conditioning"
            ? "endurance"
            : family === "power"
              ? "power"
              : family === "trunk"
                ? "stability"
                : family === "strength"
                  ? "hypertrophy"
                  : family === "tendon_isometric"
                    ? "stability"
                    : "stability",
    difficultyLevel: 1,
    technicalComplexity: 1,
    minAge: 8,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: "bodyweight",
    impactLevel: "none",
    spinalLoadLevel: "none",
    kneeLoadLevel: "none",
    ankleLoadLevel: "none",
    hamstringLoadLevel: "none",
    plyometricIntensity: "none",
    speedIntensity: "none",
    enduranceIntensity: family === "conditioning" ? "moderate" : "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Kontrolowany ruch", "Bez bólu"],
    commonErrors: ["Utrata kontroli"],
    approved: true,
    draft: false,
    family,
    stimulus,
    ...overrides,
  };
}

const REQUIRED_FAMILY_EXERCISES: ExerciseDefinition[] = [
  supportExercise(
    "long_lever_hamstring_iso",
    "Long-lever hamstring bridge iso",
    "tendon_isometric",
    "hamstring isometric",
  ),
  supportExercise(
    "soleus_iso_hold",
    "Soleus isometric hold",
    "tendon_isometric",
    "calf tendon isometric",
  ),
  supportExercise("hip_mobility_flow", "Hip mobility flow", "mobility", "hip range of motion"),
  supportExercise(
    "ankle_mobility_flow",
    "Ankle mobility flow",
    "mobility",
    "ankle range of motion",
  ),
  supportExercise(
    "easy_cycle_recovery",
    "Easy cycle recovery",
    "recovery",
    "low intensity circulation",
  ),
  supportExercise(
    "diaphragmatic_breathing",
    "Diaphragmatic breathing",
    "recovery",
    "parasympathetic recovery",
  ),
  supportExercise("easy_aerobic_run", "Easy aerobic run", "conditioning", "aerobic base"),
  supportExercise(
    "tempo_conditioning_block",
    "Tempo conditioning block",
    "conditioning",
    "tempo aerobic conditioning",
  ),
  supportExercise("pallof_press", "Pallof press", "trunk", "anti-rotation trunk stability"),
  supportExercise("side_plank", "Side plank", "trunk", "lateral trunk stability"),
  supportExercise("copenhagen_plank", "Copenhagen plank", "trunk", "adductor and trunk stability"),
  supportExercise("face_pull_band", "Face pull (guma / wyciąg)", "trunk", "scapular stability"),
  supportExercise("bodyweight_row", "Bodyweight row", "strength", "upper-body pulling strength", {
    movementPattern: "pull",
    allowedSessionCategories: ["strength_gym"],
    spaceRequirement: "indoor_gym",
  }),
  supportExercise("pull_up", "Pull-up", "strength", "vertical pulling strength", {
    movementPattern: "pull",
    allowedSessionCategories: ["strength_gym"],
    spaceRequirement: "indoor_gym",
  }),
];

function phase3AExercise(
  overrides: Partial<ExerciseDefinition> &
    Pick<ExerciseDefinition, "id" | "name" | "displayNamePl">,
): ExerciseDefinition {
  const power = overrides.category === "power" || overrides.category === "plyometric";
  return {
    requiresBall: false,
    aliases: [],
    allowedSessionCategories: power ? ["power_plyo"] : ["strength_gym"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: power ? "open_field" : "indoor_gym",
    category: power ? "power" : "strength",
    movementPattern: power ? "jump" : "squat",
    primaryAdaptation: power ? "power" : "hypertrophy",
    difficultyLevel: 3,
    technicalComplexity: 3,
    minAge: 14,
    recommendedDevelopmentStage: "early_youth",
    requiredGymExperienceLevel: "beginner",
    requiredMovementCompetenceLevel: "medium",
    requiredSupervisionLevel: "some",
    equipmentRequired: [],
    contraindications: [],
    injuryCautions: [],
    loadingType: power ? "ballistic" : "external",
    impactLevel: power ? "moderate" : "none",
    spinalLoadLevel: "low",
    kneeLoadLevel: power ? "moderate" : "low",
    ankleLoadLevel: power ? "moderate" : "low",
    hamstringLoadLevel: "moderate",
    plyometricIntensity: power ? "moderate" : "none",
    speedIntensity: power ? "moderate" : "none",
    enduranceIntensity: "none",
    allowedForYouth: false,
    allowedForBeginner: false,
    progressionIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: ["Kontroluj pozycję wyjściową", "Wykonuj ruch dynamicznie i technicznie"],
    commonErrors: ["Utrata kontroli", "Zbyt duże obciążenie lub objętość"],
    ...overrides,
  };
}

const PHASE_3A_EXERCISES: ExerciseDefinition[] = [
  phase3AExercise({
    id: "front_squat",
    name: "Front squat",
    displayNamePl: "Przysiad przedni",
    aliases: ["Front squat", "Przysiad ze sztangą z przodu"],
    movementPattern: "squat",
    primaryAdaptation: "max_strength",
    difficultyLevel: 4,
    technicalComplexity: 4,
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "high",
    equipmentRequired: ["barbell", "rack"],
    loadingType: "axial",
    spinalLoadLevel: "high",
    kneeLoadLevel: "high",
    allowedForYouth: false,
    replacementIds: ["goblet_squat"],
    regressionIds: ["goblet_squat"],
    safeAlternativeIds: ["goblet_squat"],
  }),
  phase3AExercise({
    id: "trap_bar_deadlift",
    name: "Trap bar deadlift",
    displayNamePl: "Martwy ciąg z trap barem",
    aliases: ["Trap bar deadlift", "Martwy ciąg hex bar"],
    movementPattern: "hinge",
    primaryAdaptation: "max_strength",
    difficultyLevel: 4,
    technicalComplexity: 3,
    requiredGymExperienceLevel: "intermediate",
    requiredMovementCompetenceLevel: "high",
    equipmentRequired: ["trap_bar"],
    loadingType: "axial",
    spinalLoadLevel: "high",
    hamstringLoadLevel: "high",
    allowedForYouth: false,
    replacementIds: ["barbell_deadlift"],
    regressionIds: [],
    safeAlternativeIds: [],
  }),
  phase3AExercise({
    id: "barbell_romanian_deadlift",
    name: "Barbell Romanian deadlift",
    displayNamePl: "Martwy ciąg rumuński ze sztangą",
    aliases: ["Barbell RDL", "Rumuński martwy ciąg ze sztangą"],
    movementPattern: "hinge",
    primaryAdaptation: "hypertrophy",
    equipmentRequired: ["barbell"],
    loadingType: "external",
    spinalLoadLevel: "high",
    hamstringLoadLevel: "high",
    replacementIds: ["romanian_deadlift_db"],
    regressionIds: ["romanian_deadlift_db"],
    safeAlternativeIds: ["romanian_deadlift_db"],
  }),
  phase3AExercise({
    id: "reverse_lunge",
    name: "Reverse lunge",
    displayNamePl: "Wykrok w tył",
    aliases: ["Reverse lunge", "Wykrok wsteczny"],
    movementPattern: "lunge",
    equipmentRequired: ["dumbbell"],
    replacementIds: ["bodyweight_split_squat"],
    regressionIds: ["bodyweight_split_squat"],
    safeAlternativeIds: ["bodyweight_split_squat"],
  }),
  phase3AExercise({
    id: "lateral_lunge",
    name: "Lateral lunge",
    displayNamePl: "Wykrok boczny",
    aliases: ["Lateral lunge", "Wykrok w bok"],
    movementPattern: "lunge",
    equipmentRequired: [],
    loadingType: "bodyweight",
    replacementIds: ["bodyweight_split_squat"],
    regressionIds: ["bodyweight_split_squat"],
    safeAlternativeIds: ["bodyweight_split_squat"],
  }),
  phase3AExercise({
    id: "step_up",
    name: "Step-up",
    displayNamePl: "Wejście na podest",
    aliases: ["Step-up", "Wchodzenie na skrzynię"],
    movementPattern: "lunge",
    equipmentRequired: ["box"],
    replacementIds: ["bodyweight_split_squat"],
    regressionIds: ["bodyweight_split_squat"],
    safeAlternativeIds: ["bodyweight_split_squat"],
  }),
  phase3AExercise({
    id: "single_leg_romanian_deadlift",
    name: "Single-leg Romanian deadlift",
    displayNamePl: "Martwy ciąg rumuński na jednej nodze",
    aliases: ["Single-leg RDL", "Jednonóż RDL"],
    movementPattern: "hinge",
    primaryAdaptation: "stability",
    equipmentRequired: ["dumbbell"],
    replacementIds: ["romanian_deadlift_db"],
    regressionIds: ["romanian_deadlift_db"],
    safeAlternativeIds: ["romanian_deadlift_db"],
  }),
  phase3AExercise({
    id: "leg_press",
    name: "Leg press",
    displayNamePl: "Wypychanie ciężaru na suwnicy",
    aliases: ["Leg press", "Suwnica"],
    movementPattern: "squat",
    equipmentRequired: ["machine"],
    replacementIds: ["goblet_squat"],
    regressionIds: ["goblet_squat"],
    safeAlternativeIds: ["goblet_squat"],
  }),
  phase3AExercise({
    id: "leg_extension",
    name: "Leg extension",
    displayNamePl: "Prostowanie nóg na maszynie",
    aliases: ["Leg extension", "Prostowanie kolan"],
    movementPattern: "squat",
    primaryAdaptation: "hypertrophy",
    equipmentRequired: ["machine"],
    loadingType: "external",
    kneeLoadLevel: "high",
    replacementIds: ["goblet_squat"],
    regressionIds: ["bodyweight_squat"],
    safeAlternativeIds: ["bodyweight_squat"],
  }),
  phase3AExercise({
    id: "seated_leg_curl",
    name: "Seated leg curl",
    displayNamePl: "Uginanie nóg siedząc",
    aliases: ["Seated leg curl", "Uginanie nóg na maszynie siedząc"],
    movementPattern: "hinge",
    equipmentRequired: ["machine"],
    hamstringLoadLevel: "high",
    replacementIds: ["romanian_deadlift_db"],
    regressionIds: ["glute_bridge"],
    safeAlternativeIds: ["glute_bridge"],
  }),
  phase3AExercise({
    id: "lying_leg_curl",
    name: "Lying leg curl",
    displayNamePl: "Uginanie nóg leżąc",
    aliases: ["Lying leg curl", "Uginanie nóg na maszynie leżąc"],
    movementPattern: "hinge",
    equipmentRequired: ["machine"],
    hamstringLoadLevel: "high",
    replacementIds: ["romanian_deadlift_db"],
    regressionIds: ["glute_bridge"],
    safeAlternativeIds: ["glute_bridge"],
  }),
  phase3AExercise({
    id: "standing_calf_raise",
    name: "Standing calf raise",
    displayNamePl: "Wspięcia na palce stojąc",
    aliases: ["Standing calf raise", "Wspięcia stojąc"],
    movementPattern: "gait",
    equipmentRequired: [],
    loadingType: "bodyweight",
    primaryAdaptation: "hypertrophy",
    replacementIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
  }),
  phase3AExercise({
    id: "seated_soleus_raise",
    name: "Seated soleus raise",
    displayNamePl: "Wspięcia na palce siedząc",
    aliases: ["Seated soleus raise", "Wspięcia siedząc"],
    movementPattern: "gait",
    equipmentRequired: ["bench", "dumbbell"],
    loadingType: "external",
    primaryAdaptation: "hypertrophy",
    replacementIds: ["standing_calf_raise"],
    regressionIds: ["standing_calf_raise"],
    safeAlternativeIds: ["standing_calf_raise"],
  }),
  phase3AExercise({
    id: "drop_landing",
    name: "Drop landing",
    displayNamePl: "Lądowanie po zejściu z podestu",
    aliases: ["Drop landing", "Lądowanie z podestu"],
    category: "plyometric",
    movementPattern: "jump",
    primaryAdaptation: "technique",
    difficultyLevel: 2,
    technicalComplexity: 3,
    equipmentRequired: ["platform"],
    loadingType: "impact",
    impactLevel: "moderate",
    plyometricIntensity: "low",
    allowedForYouth: true,
    allowedForBeginner: false,
    replacementIds: ["snap_down"],
    regressionIds: ["snap_down"],
    safeAlternativeIds: ["snap_down"],
  }),
  phase3AExercise({
    id: "countermovement_jump",
    name: "Countermovement jump",
    displayNamePl: "Skok z zamachem",
    aliases: ["CMJ", "Countermovement jump"],
    category: "plyometric",
    movementPattern: "jump",
    primaryAdaptation: "rfd",
    loadingType: "bodyweight",
    equipmentRequired: [],
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["snap_down"],
    regressionIds: ["snap_down"],
    safeAlternativeIds: ["snap_down"],
  }),
  phase3AExercise({
    id: "squat_jump",
    name: "Squat jump",
    displayNamePl: "Wyskocz z przysiadu",
    aliases: ["Squat jump", "Skok z przysiadu"],
    category: "plyometric",
    movementPattern: "jump",
    loadingType: "bodyweight",
    equipmentRequired: [],
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["countermovement_jump", "snap_down"],
    regressionIds: ["snap_down"],
    safeAlternativeIds: ["snap_down"],
  }),
  phase3AExercise({
    id: "broad_jump",
    name: "Broad jump",
    displayNamePl: "Skok w dal z miejsca",
    aliases: ["Broad jump", "Skok poziomy"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    spaceRequirement: "open_field",
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["countermovement_jump"],
    regressionIds: ["countermovement_jump"],
    safeAlternativeIds: ["countermovement_jump"],
  }),
  phase3AExercise({
    id: "repeated_broad_jump",
    name: "Repeated broad jump",
    displayNamePl: "Powtarzane skoki w dal",
    aliases: ["Repeated broad jump", "Seria skoków w dal"],
    category: "plyometric",
    movementPattern: "jump",
    difficultyLevel: 4,
    technicalComplexity: 4,
    plyometricIntensity: "high",
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["broad_jump", "countermovement_jump"],
    regressionIds: ["broad_jump"],
    safeAlternativeIds: ["broad_jump"],
  }),
  phase3AExercise({
    id: "bilateral_pogo",
    name: "Bilateral pogo",
    displayNamePl: "Pogo obunóż",
    aliases: ["Bilateral pogo", "Pogo obunóż"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    requiredMovementCompetenceLevel: "medium",
    loadingType: "impact",
    allowedForYouth: true,
    allowedForBeginner: false,
    replacementIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
  }),
  phase3AExercise({
    id: "single_leg_pogo",
    name: "Single-leg pogo",
    displayNamePl: "Pogo jednonóż",
    aliases: ["Single-leg pogo", "Pogo na jednej nodze"],
    category: "plyometric",
    movementPattern: "jump",
    difficultyLevel: 4,
    technicalComplexity: 4,
    equipmentRequired: [],
    plyometricIntensity: "high",
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "lateral_pogo",
    name: "Lateral pogo",
    displayNamePl: "Pogo boczne",
    aliases: ["Lateral pogo", "Pogo w bok"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    allowedForYouth: true,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "split_squat_jump",
    name: "Split squat jump",
    displayNamePl: "Wyskoki z pozycji wykrocznej",
    aliases: ["Split squat jump", "Skokowy wykrok"],
    category: "plyometric",
    movementPattern: "lunge",
    equipmentRequired: [],
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["squat_jump"],
    regressionIds: ["squat_jump"],
    safeAlternativeIds: ["squat_jump"],
  }),
  phase3AExercise({
    id: "box_jump",
    name: "Box jump",
    displayNamePl: "Wskok na skrzynię",
    aliases: ["Box jump", "Wskok na podest"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: ["box"],
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["countermovement_jump"],
    regressionIds: ["countermovement_jump"],
    safeAlternativeIds: ["countermovement_jump"],
  }),
  phase3AExercise({
    id: "hurdle_hops",
    name: "Hurdle hops",
    displayNamePl: "Przeskoki przez płotki",
    aliases: ["Hurdle hops", "Przeskoki przez przeszkody"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    difficultyLevel: 5,
    technicalComplexity: 5,
    plyometricIntensity: "very_high",
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "lateral_bound_to_stick",
    name: "Lateral bound to stick",
    displayNamePl: "Skok boczny z zatrzymaniem",
    aliases: ["Lateral bound to stick", "Boczny bound i zatrzymanie"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "single_leg_hop_and_stick",
    name: "Single-leg hop and stick",
    displayNamePl: "Skok jednonóż z zatrzymaniem",
    aliases: ["Single-leg hop and stick", "Hop jednonóż i zatrzymanie"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    difficultyLevel: 4,
    technicalComplexity: 4,
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "diagonal_bound_to_stick",
    name: "Diagonal bound to stick",
    displayNamePl: "Skok diagonalny z zatrzymaniem",
    aliases: ["Diagonal bound to stick", "Diagonalny bound i zatrzymanie"],
    category: "plyometric",
    movementPattern: "jump",
    equipmentRequired: [],
    difficultyLevel: 4,
    technicalComplexity: 4,
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["bilateral_pogo"],
    regressionIds: ["bilateral_pogo"],
    safeAlternativeIds: ["bilateral_pogo"],
  }),
  phase3AExercise({
    id: "trap_bar_jump",
    name: "Trap bar jump",
    displayNamePl: "Wyskoki z trap barem",
    aliases: ["Trap bar jump", "Skok z trap barem"],
    category: "power",
    movementPattern: "jump",
    primaryAdaptation: "power",
    equipmentRequired: ["trap_bar"],
    loadingType: "ballistic",
    difficultyLevel: 4,
    technicalComplexity: 4,
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["dumbbell_jump_squat", "countermovement_jump"],
    regressionIds: ["dumbbell_jump_squat", "countermovement_jump"],
    safeAlternativeIds: ["dumbbell_jump_squat", "countermovement_jump"],
  }),
  phase3AExercise({
    id: "dumbbell_jump_squat",
    name: "Dumbbell jump squat",
    displayNamePl: "Wyskoki z hantlami",
    aliases: ["Dumbbell jump squat", "Skok z hantlami"],
    category: "power",
    movementPattern: "jump",
    equipmentRequired: ["dumbbell"],
    loadingType: "ballistic",
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["countermovement_jump"],
    regressionIds: ["countermovement_jump"],
    safeAlternativeIds: ["countermovement_jump"],
  }),
  phase3AExercise({
    id: "barbell_jump_squat",
    name: "Barbell jump squat",
    displayNamePl: "Wyskoki ze sztangą",
    aliases: ["Barbell jump squat", "Skok ze sztangą"],
    category: "power",
    movementPattern: "jump",
    equipmentRequired: ["barbell", "rack"],
    loadingType: "ballistic",
    difficultyLevel: 5,
    technicalComplexity: 5,
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["dumbbell_jump_squat", "countermovement_jump"],
    regressionIds: ["dumbbell_jump_squat"],
    safeAlternativeIds: ["dumbbell_jump_squat", "countermovement_jump"],
  }),
  phase3AExercise({
    id: "kettlebell_swing",
    name: "Kettlebell swing",
    displayNamePl: "Wymach kettlebell",
    aliases: ["Kettlebell swing", "Wymach odważnikiem"],
    category: "power",
    movementPattern: "hinge",
    equipmentRequired: ["kettlebell"],
    loadingType: "ballistic",
    replacementIds: ["romanian_deadlift_db"],
    regressionIds: ["romanian_deadlift_db"],
    safeAlternativeIds: ["romanian_deadlift_db"],
  }),
  phase3AExercise({
    id: "push_press",
    name: "Push press",
    displayNamePl: "Wyciskanie sztangi z wybiciem nóg",
    aliases: ["Push press", "Wyciskopodrzut"],
    category: "power",
    movementPattern: "push",
    equipmentRequired: ["barbell", "rack"],
    loadingType: "ballistic",
    primaryAdaptation: "power",
    allowedForYouth: false,
    allowedForBeginner: false,
    replacementIds: ["med_ball_throw"],
    regressionIds: ["med_ball_throw"],
    safeAlternativeIds: ["med_ball_throw"],
  }),
  phase3AExercise({
    id: "medicine_ball_overhead_backward_throw",
    name: "Medicine ball overhead backward throw",
    displayNamePl: "Wyrzut piłki lekarskiej nad głową w tył",
    aliases: ["Overhead backward throw", "Wyrzut piłki nad głową w tył"],
    category: "power",
    movementPattern: "jump",
    equipmentRequired: ["med_ball"],
    loadingType: "ballistic",
    primaryAdaptation: "power",
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["med_ball_throw"],
    regressionIds: ["med_ball_throw"],
    safeAlternativeIds: ["med_ball_throw"],
  }),
  phase3AExercise({
    id: "medicine_ball_rotational_scoop_toss",
    name: "Medicine ball rotational scoop toss",
    displayNamePl: "Rotacyjny wyrzut piłki lekarskiej z dołu",
    aliases: ["Rotational scoop toss", "Rotacyjny scoop toss"],
    category: "power",
    movementPattern: "rotation",
    equipmentRequired: ["med_ball"],
    loadingType: "ballistic",
    primaryAdaptation: "power",
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["med_ball_throw"],
    regressionIds: ["med_ball_throw"],
    safeAlternativeIds: ["med_ball_throw"],
  }),
  phase3AExercise({
    id: "medicine_ball_slam",
    name: "Medicine ball slam",
    displayNamePl: "Uderzenie piłką lekarską o podłoże",
    aliases: ["Medicine ball slam", "Slam piłką lekarską"],
    category: "power",
    movementPattern: "brace",
    equipmentRequired: ["med_ball"],
    loadingType: "ballistic",
    primaryAdaptation: "power",
    allowedForYouth: true,
    allowedForBeginner: true,
    replacementIds: ["med_ball_throw"],
    regressionIds: ["med_ball_throw"],
    safeAlternativeIds: ["med_ball_throw"],
  }),
  phase3AExercise({
    id: "band_assisted_jump",
    name: "Band-assisted jump",
    displayNamePl: "Skok z odciążeniem gumą",
    aliases: ["Band-assisted jump", "Skok asystowany gumą"],
    category: "power",
    movementPattern: "jump",
    equipmentRequired: ["rack"],
    loadingType: "ballistic",
    difficultyLevel: 5,
    technicalComplexity: 5,
    allowedForYouth: false,
    allowedForBeginner: false,
    injuryCautions: ["Guma wymaga bezpiecznego, stabilnego zakotwiczenia."],
    replacementIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
  }),
];

const ACCELERATION_CUES = [
  "Pchnij boisko za siebie.",
  "Pochyl całe ciało — nie zginaj się w pasie.",
  "Nie sięgaj stopą przed siebie.",
  "Wstawaj stopniowo wraz ze wzrostem prędkości.",
  "Najpierw mocne pchnięcie, później coraz szybszy rytm.",
];

const ACCELERATION_ERRORS = [
  "Natychmiastowe wyprostowanie",
  "Sztucznie przedłużona niska pozycja",
  "Zgięcie w pasie",
  "Sięganie stopą i overstriding",
  "Kontakt stopy daleko przed środkiem masy",
  "Zbyt pionowe pierwsze kroki",
  "Za małe pchanie podłoża do tyłu",
  "Zapadanie tułowia lub miednicy",
  "Kroki skrzyżne",
  "Nadmierny lub asymetryczny ruch miednicy w bok",
];

function footballSpeedExercise(
  overrides: Pick<ExerciseDefinition, "id" | "name" | "displayNamePl"> &
    Partial<ExerciseDefinition>,
): ExerciseDefinition {
  const qualities = overrides.speedQualities ?? ["sprint_technique"];
  const acceleration = qualities.includes("acceleration") || qualities.includes("reacceleration");
  return {
    aliases: [],
    requiresBall: false,
    allowedSessionCategories: ["speed_sprint"],
    participantMode: "solo",
    minParticipants: 1,
    spaceRequirement: "sprint_lane",
    category: "speed",
    movementPattern: "sprint",
    primaryAdaptation: acceleration ? "acceleration" : "speed",
    difficultyLevel: 2,
    technicalComplexity: 2,
    minAge: 10,
    recommendedDevelopmentStage: "child_foundation",
    requiredGymExperienceLevel: "none",
    requiredMovementCompetenceLevel: "low",
    requiredSupervisionLevel: "none",
    equipmentRequired: [],
    contraindications: ["ankle"],
    injuryCautions: ["Przerwij przy bólu; sprint wymaga świeżości i jakości."],
    loadingType: "impact",
    impactLevel: "low",
    spinalLoadLevel: "none",
    kneeLoadLevel: "low",
    ankleLoadLevel: "moderate",
    hamstringLoadLevel: "low",
    plyometricIntensity: "low",
    speedIntensity: "moderate",
    enduranceIntensity: "none",
    allowedForYouth: true,
    allowedForBeginner: true,
    progressionIds: [],
    regressionIds: [],
    safeAlternativeIds: [],
    coachingCues: acceleration
      ? ACCELERATION_CUES
      : ["Naturalna praca ramion", "Jakość przed zmęczeniem"],
    commonErrors: acceleration ? ACCELERATION_ERRORS : ["Utrata rytmu", "Bieg na zmęczeniu"],
    speedQualities: qualities,
    sessionRoles: ["technical"],
    instructionsPl: acceleration
      ? [
          "Projekuj ciało do przodu i twórz jedną linię głowy, tułowia, miednicy i nogi podporowej.",
          "Pchaj podłoże aktywnie do tyłu; stopa ląduje blisko lub lekko za środkiem masy.",
          "Wznoszenie do pozycji wyprostowanej następuje stopniowo wraz ze wzrostem prędkości.",
        ]
      : [
          "Wykonuj ruch rytmicznie i naturalnie, bez sztucznego usztywniania miednicy.",
          "Kończ serię, gdy spada jakość.",
        ],
    objective: "Rozwój szybkości piłkarskiej bez specjalistycznego sprzętu.",
    footballRelevance: ["Pierwszy krok, wyjście do piłki i reakcja na przestrzeń."],
    defaultPrescription: {
      distanceM: { min: 10, max: 20 },
      sets: { min: 2, max: 4 },
      repetitions: { min: 2, max: 4 },
      restSeconds: { min: 60, max: 180 },
      intensity: "controlled",
    },
    approved: true,
    draft: false,
    ...overrides,
  };
}

const FOOTBALL_SPEED_EXERCISES: ExerciseDefinition[] = [
  ["a_march", "A march", "Marsz A", ["sprint_technique"], "preparation"],
  ["a_skip", "A skip", "Skip A", ["sprint_technique"], "technical"],
  ["c_skip", "C skip", "Skip C", ["sprint_technique"], "technical"],
  ["b_skip", "B skip", "Skip B", ["sprint_technique"], "technical"],
  ["d_skip", "D skip", "Skip D", ["sprint_technique"], "technical"],
  ["ankling", "Ankling", "Ankling", ["sprint_technique"], "preparation"],
  ["low_dribble", "Low dribble", "Niski dribble", ["sprint_technique"], "technical"],
  ["high_dribble", "High dribble", "Wysoki dribble", ["sprint_technique"], "technical"],
  [
    "straight_leg_run_bound",
    "Straight-leg run/bound",
    "Bieg z prostą nogą / bound",
    ["sprint_technique"],
    "technical",
  ],
  ["wall_march", "Wall march", "Marsz przy ścianie", ["sprint_technique"], "preparation"],
  [
    "wall_single_switch",
    "Wall single switch",
    "Pojedyncza zmiana przy ścianie",
    ["sprint_technique", "acceleration"],
    "technical",
  ],
  [
    "wall_double_switch",
    "Wall double switch",
    "Podwójna zmiana przy ścianie",
    ["sprint_technique", "acceleration"],
    "technical",
  ],
  [
    "wall_triple_switch",
    "Wall triple switch",
    "Potrójna zmiana przy ścianie",
    ["sprint_technique", "acceleration"],
    "technical",
  ],
  [
    "dribble_to_sprint_transition",
    "Dribble-to-sprint transition",
    "Przejście z dribblingu do sprintu",
    ["sprint_technique", "acceleration"],
    "primer",
  ],
  ["falling_start", "Falling start", "Start z upadku", ["acceleration"], "primary"],
  [
    "split_stance_start",
    "Split-stance start",
    "Start z pozycji wykrocznej",
    ["acceleration"],
    "primary",
  ],
  ["push_up_start", "Push-up start", "Start z podporu", ["acceleration"], "primary"],
  ["half_kneeling_start", "Half-kneeling start", "Start z półklęku", ["acceleration"], "primary"],
  [
    "lateral_start_acceleration",
    "Lateral start into acceleration",
    "Start boczny do przyspieszenia",
    ["acceleration", "reacceleration"],
    "primary",
  ],
  [
    "crossover_start_acceleration",
    "Crossover start into acceleration",
    "Start skrzyżny do przyspieszenia",
    ["acceleration"],
    "primary",
  ],
  [
    "turn_and_go_start",
    "Turn-and-go start",
    "Start obróć się i biegnij",
    ["acceleration", "reactive_agility"],
    "primary",
  ],
  [
    "app_audio_reaction_start",
    "App audio-cue reaction start",
    "Start reakcyjny na sygnał audio aplikacji",
    ["acceleration", "reactive_agility"],
    "primary",
  ],
  [
    "free_acceleration_sprint",
    "Free acceleration sprint",
    "Swobodny sprint akceleracyjny",
    ["acceleration"],
    "primary",
  ],
  [
    "progressive_build_up_sprint",
    "Progressive build-up sprint",
    "Progresywny bieg narastający",
    ["maximum_velocity_exposure"],
    "primer",
  ],
  ["flying_sprint", "Flying sprint", "Sprint lotny", ["maximum_velocity_exposure"], "primary"],
  [
    "upright_football_sprint",
    "Upright 30–40 m football sprint",
    "Piłkarski sprint wyprostowany 30–40 m",
    ["maximum_velocity_exposure"],
    "primary",
  ],
  [
    "fast_relaxed_fast_run",
    "Controlled fast–relaxed–fast run",
    "Kontrolowany bieg szybko–luźno–szybko",
    ["maximum_velocity_exposure"],
    "technical",
  ],
  [
    "football_curved_sprint",
    "Football curved sprint",
    "Piłkarski sprint po łuku",
    ["curved_sprint"],
    "primary",
  ],
  [
    "reactive_curved_sprint",
    "Reactive left/right curved sprint",
    "Reaktywny sprint po łuku lewo/prawo",
    ["curved_sprint", "reactive_agility"],
    "primary",
  ],
  [
    "progressive_run_three_step_stop",
    "Progressive run-to-three-step stop",
    "Progresywny bieg i zatrzymanie w trzech krokach",
    ["deceleration"],
    "technical",
  ],
  [
    "run_two_step_stop",
    "Run-to-two-step stop",
    "Bieg i zatrzymanie w dwóch krokach",
    ["deceleration"],
    "technical",
  ],
  [
    "progressive_deceleration_5_10_15",
    "Progressive 5 m → 10 m → 15 m deceleration",
    "Progresywne hamowanie 5 → 10 → 15 m",
    ["deceleration"],
    "primary",
  ],
  [
    "accel_decel_reaccel",
    "Acceleration–deceleration–reacceleration",
    "Przyspieszenie–hamowanie–ponowne przyspieszenie",
    ["acceleration", "deceleration", "reacceleration"],
    "primary",
  ],
  [
    "deceleration_lateral_exit",
    "Deceleration into lateral exit",
    "Hamowanie z wyjściem bocznym",
    ["deceleration", "reacceleration"],
    "primary",
  ],
  ["planned_cut", "Planned cut", "Zaplanowane cięcie", ["planned_change_of_direction"], "primary"],
  [
    "planned_505",
    "Planned 5-0-5",
    "Zaplanowany test 5-0-5",
    ["planned_change_of_direction"],
    "primary",
  ],
  [
    "cut_and_reaccelerate",
    "Cut-and-reaccelerate",
    "Cięcie i ponowne przyspieszenie",
    ["planned_change_of_direction", "reacceleration"],
    "primary",
  ],
  [
    "app_audio_forward_left_right",
    "App audio cue: forward/left/right",
    "Sygnał audio aplikacji: przód/lewo/prawo",
    ["reactive_agility"],
    "primary",
  ],
  [
    "app_visual_colour_cue_cod",
    "App visual or colour cue change of direction",
    "Zmiana kierunku na sygnał wizualny/kolor",
    ["reactive_agility"],
    "primary",
  ],
  [
    "reactive_180_turn",
    "Reactive 180° turn",
    "Reaktywny obrót 180°",
    ["reactive_agility", "reacceleration"],
    "primary",
  ],
  [
    "repeated_linear_short_sprints",
    "Repeated linear short sprints",
    "Powtarzane krótkie sprinty liniowe",
    ["repeated_sprint"],
    "conditioning",
  ],
  [
    "repeated_curved_sprints",
    "Repeated curved sprints",
    "Powtarzane sprinty po łuku",
    ["repeated_sprint", "curved_sprint"],
    "conditioning",
  ],
  [
    "repeated_shuttle_sprints",
    "Repeated shuttle sprints",
    "Powtarzane sprinty wahadłowe",
    ["repeated_sprint"],
    "conditioning",
  ],
  [
    "a_switch_progression",
    "A-switch single/double/triple",
    "Zmiany A: pojedyncza → podwójna → potrójna",
    ["sprint_technique", "acceleration"],
    "technical",
  ],
  [
    "scissor_bounds",
    "Scissor bounds",
    "Naprzemienne wyskoki nożycowe",
    ["sprint_technique", "acceleration"],
    "technical",
  ],
].map(([id, name, displayNamePl, qualities, role]) =>
  footballSpeedExercise({
    id: id as string,
    name: name as string,
    displayNamePl: displayNamePl as string,
    speedQualities: qualities as FootballSpeedQuality[],
    sessionRoles: [role as FootballSessionRole],
  }),
);

const CURVE_VARIANTS: FootballSpeedVariant[] = [
  {
    id: "wide",
    labelPl: "Szeroki łuk — regresja",
    metadata: { radius: "wide", direction: "left/right", entrySpeed: "controlled" },
  },
  {
    id: "medium",
    labelPl: "Średni łuk",
    metadata: { radius: "medium", direction: "left/right", entrySpeed: "fast" },
  },
  {
    id: "narrow",
    labelPl: "Wąski łuk — progresja",
    metadata: { radius: "narrow", direction: "left/right", entrySpeed: "fast" },
  },
];
for (const id of ["a_march", "a_skip", "c_skip", "b_skip", "d_skip"]) {
  const def = FOOTBALL_SPEED_EXERCISES.find((exercise) => exercise.id === id);
  if (def) {
    def.variants = [
      { id: "step_in", labelPl: "Wariant step-in" },
      { id: "continuous", labelPl: "Wariant ciągły" },
    ];
    def.defaultPrescription = {
      repetitions: { min: 2, max: 4 },
      workSeconds: { min: 10, max: 20 },
      restSeconds: { min: 30, max: 60 },
      intensity: "controlled",
    };
  }
}
for (const id of [
  "a_march",
  "a_skip",
  "c_skip",
  "b_skip",
  "d_skip",
  "wall_march",
  "wall_single_switch",
  "wall_double_switch",
  "wall_triple_switch",
]) {
  const def = FOOTBALL_SPEED_EXERCISES.find((exercise) => exercise.id === id);
  if (def) {
    def.variants = def.variants ?? [];
    def.variants.push({
      id: "controlled_pass",
      labelPl: "Pierwszy przebieg: wolniej, kontrolnie i technicznie",
    });
    def.variants.push({
      id: "fast_pass",
      labelPl: "Drugi przebieg: szybciej, z zachowaniem techniki",
    });
  }
}
for (const id of ["football_curved_sprint", "reactive_curved_sprint"]) {
  const def = FOOTBALL_SPEED_EXERCISES.find((exercise) => exercise.id === id);
  if (def) {
    def.variants = [...CURVE_VARIANTS];
    def.footballRelevance = [
      "Pressing po łuku",
      "Bieg za obrońcę",
      "Bieg za plecy z martwego pola",
      "Obieg i underlap",
      "Powrót i asekuracja",
    ];
    def.commonErrors = [
      "Ostry hamulec i cięcie zamiast ciągłej zmiany kierunku",
      "Zawsze ten sam kierunek",
      "Za mały promień przy zbyt dużej prędkości",
    ];
    def.defaultPrescription = {
      distanceM: { min: 10, max: 20 },
      repetitions: { min: 2, max: 4 },
      restSeconds: { min: 90, max: 180 },
      intensity: "controlled",
    };
    def.isSharpChangeOfDirection = false;
  }
}
const plannedCut = FOOTBALL_SPEED_EXERCISES.find((exercise) => exercise.id === "planned_cut");
if (plannedCut) {
  plannedCut.variants = [45, 90, 135, 180].map((angle) => ({
    id: `${angle}`,
    labelPl: `${angle}°`,
    metadata: { angle },
  }));
  plannedCut.footballRelevance = ["Zmiana kierunku po zaplanowanym bodźcu przestrzennym."];
}
LIBRARY.push(...PHASE_3A_EXERCISES);
LIBRARY.push(...FOOTBALL_SPEED_EXERCISES);
LIBRARY.push(...REQUIRED_FAMILY_EXERCISES);
for (const exercise of LIBRARY) {
  exercise.approved ??= true;
  exercise.draft ??= false;
  exercise.family ??=
    exercise.category === "prehab" && exercise.movementPattern === "isometric"
      ? "tendon_isometric"
      : exercise.category === "prehab"
        ? "recovery"
        : exercise.category === "endurance"
          ? "conditioning"
          : exercise.category === "core"
            ? "trunk"
            : exercise.category;
  exercise.stimulus ??= exercise.primaryAdaptation;
}

const existingAcceleration = LIBRARY.find((exercise) => exercise.id === "acceleration_mechanics");
if (existingAcceleration) {
  existingAcceleration.speedQualities = ["acceleration"];
  existingAcceleration.sessionRoles = ["technical", "primer"];
  existingAcceleration.instructionsPl = [...ACCELERATION_CUES];
  existingAcceleration.objective = "Nauka projekcji i progresywnego wzrostu prędkości.";
}
const existingMaxVelocity = LIBRARY.find((exercise) => exercise.id === "max_velocity_high_volume");
if (existingMaxVelocity) {
  existingMaxVelocity.speedQualities = ["maximum_velocity_exposure"];
  existingMaxVelocity.sessionRoles = ["primary"];
  existingMaxVelocity.defaultPrescription = {
    distanceM: { min: 10, max: 20 },
    intensity: "maximum",
  };
}
const FOOTBALL_SPEED_CATALOG_IDS = new Set<string>([
  ...FOOTBALL_SPEED_EXERCISES.map((exercise) => exercise.id),
  "acceleration_mechanics",
  "max_velocity_high_volume",
]);

const LIBRARY_INDEX = new Map<string, ExerciseDefinition>(LIBRARY.map((e) => [e.id, e]));

export function getAllExerciseDefinitions(): ExerciseDefinition[] {
  return LIBRARY;
}

export function isApprovedCanonicalExercise(
  exercise: ExerciseDefinition | undefined,
): exercise is ExerciseDefinition {
  return exercise?.approved === true && exercise.draft !== true;
}

export function getApprovedExerciseDefinitions(): ExerciseDefinition[] {
  return LIBRARY.filter(isApprovedCanonicalExercise);
}

export function getExerciseDefinition(exerciseId: string): ExerciseDefinition | undefined {
  return LIBRARY_INDEX.get(exerciseId);
}

export interface CanonicalReplacementIssue {
  sourceId: string;
  targetId: string;
  problem: string;
}

export interface CanonicalReplacementValidationReport {
  ok: boolean;
  issues: CanonicalReplacementIssue[];
}

function replacementStimulus(exercise: ExerciseDefinition): string {
  return exercise.stimulus ?? exercise.primaryAdaptation;
}

function hasSharedSessionRole(source: ExerciseDefinition, target: ExerciseDefinition): boolean {
  if (!source.sessionRoles?.length || !target.sessionRoles?.length) return true;
  return source.sessionRoles.some((role) => target.sessionRoles?.includes(role));
}

function isCanonicalReplacementCompatible(
  source: ExerciseDefinition,
  target: ExerciseDefinition,
): boolean {
  const stimulusMatches =
    replacementStimulus(source) === replacementStimulus(target) ||
    source.family === target.family ||
    (source.family === "power" && target.family === "plyometric") ||
    (source.family === "plyometric" && target.family === "power") ||
    source.movementPattern === target.movementPattern;
  return stimulusMatches && hasSharedSessionRole(source, target);
}

/**
 * Validates the ordered, canonical replacement graph. An athlete is optional:
 * when supplied, every target in the chain must also be usable by that athlete.
 */
export function validateCanonicalReplacementChains(
  athlete?: AthleteTrainingProfile,
): CanonicalReplacementValidationReport {
  const issues: CanonicalReplacementIssue[] = [];
  const colors = new Map<string, "gray" | "black">();
  const reported = new Set<string>();

  const addIssue = (sourceId: string, targetId: string, problem: string) => {
    const key = `${sourceId}|${targetId}|${problem}`;
    if (!reported.has(key)) {
      reported.add(key);
      issues.push({ sourceId, targetId, problem });
    }
  };

  const visit = (source: ExerciseDefinition, targetId: string) => {
    const target = getExerciseDefinition(targetId);
    if (!target) {
      addIssue(source.id, targetId, "Brak docelowego ćwiczenia.");
      return;
    }
    if (!isApprovedCanonicalExercise(target))
      addIssue(source.id, target.id, "Cel zamiennika nie jest zatwierdzony.");
    if (!isCanonicalReplacementCompatible(source, target))
      addIssue(source.id, target.id, "Niezgodny bodziec lub rola sesji.");
    if (athlete && !isExerciseAllowedForProfile(target, athlete).ok)
      addIssue(source.id, target.id, "Cel zamiennika niedozwolony dla profilu zawodnika.");

    if (colors.get(target.id) === "gray") {
      addIssue(source.id, target.id, "Cykl zamienników.");
      return;
    }
    if (colors.get(target.id) === "black") return;
    colors.set(target.id, "gray");
    for (const nextId of target.replacementIds ?? []) visit(target, nextId);
    colors.set(target.id, "black");
  };

  for (const source of getApprovedExerciseDefinitions()) {
    if (colors.get(source.id) === "black") continue;
    colors.set(source.id, "gray");
    for (const targetId of source.replacementIds ?? []) visit(source, targetId);
    colors.set(source.id, "black");
  }

  return { ok: issues.length === 0, issues };
}

export interface FoundationalSprintFlowStep {
  order: "A" | "C" | "B" | "D";
  exerciseId: string;
  variants: readonly ["step_in", "continuous"];
}

/** Deterministic teaching sequence; competency selection is intentionally deferred. */
export const FOUNDATIONAL_SPRINT_FLOW: readonly FoundationalSprintFlowStep[] = [
  { order: "A", exerciseId: "a_march", variants: ["step_in", "continuous"] },
  { order: "C", exerciseId: "c_skip", variants: ["step_in", "continuous"] },
  { order: "B", exerciseId: "b_skip", variants: ["step_in", "continuous"] },
  { order: "D", exerciseId: "d_skip", variants: ["step_in", "continuous"] },
];

export function getFoundationalSprintFlow(): readonly FoundationalSprintFlowStep[] {
  return FOUNDATIONAL_SPRINT_FLOW;
}

export function getFootballSpeedCatalog(): readonly ExerciseDefinition[] {
  return LIBRARY.filter((exercise) => FOOTBALL_SPEED_CATALOG_IDS.has(exercise.id));
}

// ---------------------------------------------------------------------------
// Rozwiązywanie nazw i aliasów (deterministyczne, bez efektów ubocznych)
// ---------------------------------------------------------------------------

/** Normalizacja: małe litery, zwinięte spacje, bez spacji brzegowych. */
export function normalizeExerciseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const NAME_INDEX: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of LIBRARY) {
    for (const key of [def.id, def.name, def.displayNamePl, ...def.aliases]) {
      const norm = normalizeExerciseName(key);
      if (!map.has(norm)) map.set(norm, def.id);
    }
  }
  return map;
})();

/** Rozwiązuje id po id, nazwie, polskiej nazwie lub aliasie (case/space-insensitive). */
export function resolveExerciseId(nameOrAlias: string): string | undefined {
  if (!nameOrAlias) return undefined;
  return NAME_INDEX.get(normalizeExerciseName(nameOrAlias));
}

/** Rozwiązuje definicję po id, nazwie lub aliasie. */
export function resolveExerciseByName(nameOrAlias: string): ExerciseDefinition | undefined {
  const id = resolveExerciseId(nameOrAlias);
  return id ? LIBRARY_INDEX.get(id) : undefined;
}

// ---------------------------------------------------------------------------
// Pomocnicze skale
// ---------------------------------------------------------------------------

const EXP_RANK: Record<GymExperienceLevel, number> = {
  none: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};
const COMP_RANK: Record<CompetenceLevel, number> = { low: 0, medium: 1, high: 2 };
const SUP_RANK: Record<SupervisionLevel, number> = { none: 0, some: 1, full: 2 };
const STAGE_RANK: Record<DevelopmentStage, number> = {
  child_foundation: 0,
  early_youth: 1,
  late_youth: 2,
  adult: 3,
};

function isYouthProfile(a: AthleteTrainingProfile): boolean {
  return a.developmentStage === "child_foundation" || a.developmentStage === "early_youth";
}

function isBeginnerProfile(a: AthleteTrainingProfile): boolean {
  return a.gymExperienceLevel === "none" || a.gymExperienceLevel === "beginner";
}

function hasEquipment(def: ExerciseDefinition, a: AthleteTrainingProfile): boolean {
  if (def.equipmentRequired.length === 0) return true;
  const owned = [
    ...a.equipmentAccess,
    ...a.homeEquipment,
    ...(a.gymAccess
      ? [
          "barbell",
          "trap_bar",
          "rack",
          "bench",
          "dumbbell",
          "kettlebell",
          "box",
          "platform",
          "med_ball",
          "sled",
          "sliders",
          "nordic_setup",
          "machine",
        ]
      : []),
  ].flatMap((s) => {
    const id = resolveEquipmentId(s);
    return id ? [id] : [];
  });
  return def.equipmentRequired.every((req) => {
    return owned.includes(req) && !(a.unavailableEquipmentIds ?? []).includes(req);
  });
}

export function specialistEquipmentForExercise(
  exercise: ExerciseDefinition | string | undefined,
): EquipmentId[] {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;
  return (def?.equipmentRequired ?? []).filter((id) => id !== "none");
}

// ---------------------------------------------------------------------------
// isExerciseAllowedForProfile
// ---------------------------------------------------------------------------

export interface ExerciseAllowResult {
  ok: boolean;
  reasons: string[];
}

export function isExerciseAllowedForProfile(
  exercise: ExerciseDefinition | string | undefined,
  a: AthleteTrainingProfile,
): ExerciseAllowResult {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;

  // Reguła 5: brak metadanych = ćwiczenie niepewne.
  if (!def) {
    if (isYouthProfile(a) || isBeginnerProfile(a)) {
      return {
        ok: false,
        reasons: ["Brak metadanych bezpieczeństwa — niedozwolone dla młodych/początkujących."],
      };
    }
    return { ok: false, reasons: ["Brak metadanych bezpieczeństwa — ćwiczenie niepewne."] };
  }

  const reasons: string[] = [];
  if (def.draft === true || def.approved === false)
    reasons.push("Ćwiczenie nie jest zatwierdzone do sesji zawodnika.");
  const youth = isYouthProfile(a);
  const beginner = isBeginnerProfile(a);

  if (a.age != null && a.age < def.minAge)
    reasons.push(`Wiek poniżej minimalnego (${def.minAge}).`);

  if (STAGE_RANK[a.developmentStage] < STAGE_RANK[def.recommendedDevelopmentStage])
    reasons.push("Etap rozwoju zbyt wczesny dla tego ćwiczenia.");

  if (youth && !def.allowedForYouth) reasons.push("Niedozwolone dla zawodnika młodzieżowego.");
  if (beginner && !def.allowedForBeginner) reasons.push("Niedozwolone dla początkującego.");

  if (EXP_RANK[a.gymExperienceLevel] < EXP_RANK[def.requiredGymExperienceLevel])
    reasons.push("Za niskie doświadczenie siłowe.");

  if (COMP_RANK[a.movementCompetenceLevel] < COMP_RANK[def.requiredMovementCompetenceLevel])
    reasons.push("Za niska kompetencja ruchowa.");

  if (SUP_RANK[a.supervisionLevel] < SUP_RANK[def.requiredSupervisionLevel])
    reasons.push("Wymagany wyższy poziom nadzoru trenerskiego.");

  if (!hasEquipment(def, a)) reasons.push("Brak wymaganego sprzętu.");

  // Kontuzje / ból
  const painSet = new Set<PainLocation>([...a.currentPain, ...a.injuryHistory]);
  for (const c of def.contraindications) {
    if (painSet.has(c)) reasons.push(`Przeciwwskazanie kontuzyjne: ${c}.`);
  }

  // Plyometria vs gotowość i kompetencja lądowania (movement competence)
  if (
    (def.plyometricIntensity === "very_high" || def.plyometricIntensity === "high") &&
    (a.movementCompetenceLevel === "low" || a.readiness <= 4)
  ) {
    reasons.push("Zbyt wysoka intensywność plyometryczna dla kompetencji/gotowości.");
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Progresja / regresja / alternatywa
// ---------------------------------------------------------------------------

/** Zwraca najlepszą DOZWOLONĄ regresję (schodząc coraz niżej, jeśli trzeba). */
export function getExerciseRegression(
  exercise: ExerciseDefinition | string,
  a: AthleteTrainingProfile,
  visited: Set<string> = new Set(),
): ExerciseDefinition | undefined {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;
  if (!def) return undefined;
  visited.add(def.id);

  const candidates = [
    ...(def.replacementIds ?? []),
    ...def.regressionIds,
    ...def.safeAlternativeIds,
  ];
  for (const id of candidates) {
    if (visited.has(id)) continue;
    const cand = getExerciseDefinition(id);
    if (!cand) continue;
    if (!isCanonicalReplacementCompatible(def, cand)) continue;
    if (isExerciseAllowedForProfile(cand, a).ok) return cand;
  }
  // Głębsza regresja — spróbuj regresji regresji.
  const deeperCandidates = [...def.regressionIds, ...def.safeAlternativeIds];
  for (const id of deeperCandidates) {
    if (visited.has(id)) continue;
    const deeper = getExerciseRegression(id, a, visited);
    if (deeper) return deeper;
  }
  return undefined;
}

/** Zwraca DOZWOLONĄ progresję, jeśli zawodnik jest gotowy na trudniejszy wariant. */
export function getExerciseProgression(
  exercise: ExerciseDefinition | string,
  a: AthleteTrainingProfile,
): ExerciseDefinition | undefined {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;
  if (!def) return undefined;
  for (const id of def.progressionIds) {
    const cand = getExerciseDefinition(id);
    if (cand && isExerciseAllowedForProfile(cand, a).ok) return cand;
  }
  return undefined;
}

export interface SafeAlternativeResult {
  exercise: ExerciseDefinition | null;
  reason: string;
  unresolved: boolean;
  blockRebuildRequired: boolean;
}

/**
 * selectEquipmentAwareReplacement — zwraca bezpieczny zamiennik.
 * Reguła 2: regresja/alternatywa. Reguła 3: jeśli brak — unresolved=true.
 */
export function selectEquipmentAwareReplacement(
  exercise: ExerciseDefinition | string,
  a: AthleteTrainingProfile,
): SafeAlternativeResult {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;
  const original = def?.name ?? String(exercise);

  const allowed = isExerciseAllowedForProfile(def, a);
  if (allowed.ok && def)
    return {
      exercise: def,
      reason: "Ćwiczenie dozwolone.",
      unresolved: false,
      blockRebuildRequired: false,
    };

  const regression = def ? getExerciseRegression(def, a) : undefined;
  if (regression)
    return {
      exercise: regression,
      reason: `„${original}" zamieniono na „${regression.name}" (${allowed.reasons.join(" ")}).`,
      unresolved: false,
      blockRebuildRequired: false,
    };

  return {
    exercise: null,
    reason: `Brak bezpiecznej alternatywy dla „${original}" (${allowed.reasons.join(" ")}).`,
    unresolved: true,
    blockRebuildRequired: true,
  };
}

/** Zachowana nazwa kompatybilności wstecznej dla istniejących wywołań. */
export function replaceExerciseWithSafeAlternative(
  exercise: ExerciseDefinition | string,
  a: AthleteTrainingProfile,
): SafeAlternativeResult {
  return selectEquipmentAwareReplacement(exercise, a);
}

// ---------------------------------------------------------------------------
// validateExerciseLibraryCompleteness
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: (keyof ExerciseDefinition)[] = [
  "id",
  "name",
  "category",
  "movementPattern",
  "primaryAdaptation",
  "difficultyLevel",
  "technicalComplexity",
  "minAge",
  "recommendedDevelopmentStage",
  "requiredGymExperienceLevel",
  "requiredMovementCompetenceLevel",
  "requiredSupervisionLevel",
  "equipmentRequired",
  "contraindications",
  "injuryCautions",
  "loadingType",
  "impactLevel",
  "spinalLoadLevel",
  "kneeLoadLevel",
  "ankleLoadLevel",
  "hamstringLoadLevel",
  "plyometricIntensity",
  "speedIntensity",
  "enduranceIntensity",
  "allowedForYouth",
  "allowedForBeginner",
  "progressionIds",
  "regressionIds",
  "safeAlternativeIds",
  "coachingCues",
  "commonErrors",
  "displayNamePl",
  "aliases",
  "requiresBall",
  "allowedSessionCategories",
  "participantMode",
  "minParticipants",
  "spaceRequirement",
];

const BALL_FREE_CATEGORIES: SessionCategory[] = ["speed_sprint", "endurance_conditioning"];

/**
 * validateExerciseDefinition — walidacja pojedynczej definicji (czysta funkcja).
 * Sprawdza kompletność metadanych oraz twarde reguły kategorii.
 */
export function validateExerciseDefinition(def: ExerciseDefinition): string[] {
  const problems: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const v = def[field];
    if (v === undefined || v === null) problems.push(`Brak pola: ${String(field)}.`);
  }
  if (!def.coachingCues?.length) problems.push("Brak coachingCues.");
  for (const equipment of def.equipmentRequired ?? []) {
    if (!EQUIPMENT_REGISTRY.some((entry) => entry.id === equipment))
      problems.push(`Nieznany sprzęt: ${equipment}.`);
  }
  if (!def.displayNamePl?.trim()) problems.push("Pusta polska nazwa wyświetlana.");
  if (!Array.isArray(def.aliases)) problems.push("aliases musi być tablicą.");
  if (!def.allowedSessionCategories?.length) problems.push("Brak dozwolonych kategorii sesji.");
  for (const cat of def.allowedSessionCategories ?? []) {
    if (!SESSION_CATEGORIES.includes(cat)) problems.push(`Nieznana kategoria sesji: ${cat}.`);
  }
  if (!Number.isFinite(def.minParticipants) || def.minParticipants < 1)
    problems.push("minParticipants musi wynosić co najmniej 1.");
  if (def.participantMode === "solo" && def.minParticipants !== 1)
    problems.push("Tryb solo wymaga minParticipants = 1.");
  if (def.participantMode === "partner" && def.minParticipants < 2)
    problems.push("Tryb partner wymaga minParticipants >= 2.");

  // Twarde reguły kategorii vs piłka.
  for (const cat of BALL_FREE_CATEGORIES) {
    if (def.allowedSessionCategories?.includes(cat) && def.requiresBall)
      problems.push(`Ćwiczenie z piłką nie może należeć do kategorii ${cat}.`);
  }
  if (def.requiresBall) {
    const nonFootball = (def.allowedSessionCategories ?? []).filter(
      (c) => c !== "football_ball_work",
    );
    if (nonFootball.length)
      problems.push(
        `Ćwiczenie z piłką może należeć wyłącznie do football_ball_work (znaleziono: ${nonFootball.join(", ")}).`,
      );
  }

  return problems;
}

export interface LibraryCompletenessReport {
  ok: boolean;
  totalExercises: number;
  issues: { id: string; problem: string }[];
}

export function validateExerciseLibraryCompleteness(): LibraryCompletenessReport {
  const issues: { id: string; problem: string }[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Map<string, string>();

  for (const def of LIBRARY) {
    if (seenIds.has(def.id)) issues.push({ id: def.id, problem: "Zduplikowane id." });
    seenIds.add(def.id);

    for (const problem of validateExerciseDefinition(def)) issues.push({ id: def.id, problem });

    // Kolizje nazw/aliasów (alias nie może wskazywać na inne id ani cudzą nazwę).
    for (const key of [def.name, def.displayNamePl, ...(def.aliases ?? [])]) {
      const norm = normalizeExerciseName(key);
      const owner = seenNames.get(norm);
      if (owner && owner !== def.id)
        issues.push({ id: def.id, problem: `Kolizja nazwy/aliasu „${key}" z ${owner}.` });
      seenNames.set(norm, def.id);
      if (LIBRARY_INDEX.has(norm) && norm !== def.id)
        issues.push({ id: def.id, problem: `Alias „${key}" koliduje z id innego ćwiczenia.` });
    }

    // Referencje muszą istnieć.
    for (const ref of [
      ...def.progressionIds,
      ...def.regressionIds,
      ...def.safeAlternativeIds,
      ...(def.replacementIds ?? []),
    ]) {
      if (!LIBRARY_INDEX.has(ref))
        issues.push({ id: def.id, problem: `Nieistniejąca referencja: ${ref}.` });
    }
  }

  // Zamienniki tworzą skierowany graf; cykle oznaczają, że silnik może krążyć
  // bez końca zamiast uczciwie zgłosić konieczność przebudowy bloku.
  const colors = new Map<string, "gray" | "black">();
  const reportedCycles = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string) => {
    if (colors.get(id) === "gray") {
      const cycle = stack.slice(stack.indexOf(id)).sort();
      const cycleKey = cycle.join("|");
      if (!reportedCycles.has(cycleKey)) {
        issues.push({ id, problem: `Cykl zamienników obejmujący ${id}.` });
        reportedCycles.add(cycleKey);
      }
      return;
    }
    if (colors.get(id) === "black") return;
    const def = LIBRARY_INDEX.get(id);
    if (!def) return;
    colors.set(id, "gray");
    stack.push(id);
    for (const next of [
      ...(def.replacementIds ?? []),
      ...def.regressionIds,
      ...def.safeAlternativeIds,
    ])
      visit(next);
    stack.pop();
    colors.set(id, "black");
  };
  for (const def of LIBRARY) visit(def.id);

  for (const issue of validateCanonicalReplacementChains().issues) {
    issues.push({
      id: issue.sourceId,
      problem: `${issue.problem} (${issue.targetId}).`,
    });
  }

  return { ok: issues.length === 0, totalExercises: LIBRARY.length, issues };
}

// ---------------------------------------------------------------------------
// validateWorkoutExercises — Reguła 4: każdy trening przez ten walidator
// ---------------------------------------------------------------------------

export interface WorkoutExerciseInput {
  /** id z biblioteki (preferowane) lub sama nazwa. */
  exerciseId?: string;
  name: string;
}

export interface WorkoutValidationReport {
  ok: boolean;
  replacements: { original: string; replacement: string; reason: string }[];
  unresolvedIssues: { exercise: string; reason: string }[];
  blockRebuildRequired: boolean;
}

/**
 * validateWorkoutExercises — sprawdza wszystkie ćwiczenia treningu względem
 * profilu; zwraca listę koniecznych zamian i nierozwiązanych problemów.
 */
export function validateWorkoutExercises(
  workout: { exercises: WorkoutExerciseInput[] } | WorkoutExerciseInput[],
  a: AthleteTrainingProfile,
): WorkoutValidationReport {
  const list = Array.isArray(workout) ? workout : workout.exercises;
  const replacements: WorkoutValidationReport["replacements"] = [];
  const unresolvedIssues: WorkoutValidationReport["unresolvedIssues"] = [];

  for (const item of list) {
    const def = item.exerciseId
      ? getExerciseDefinition(item.exerciseId)
      : resolveExerciseByName(item.name);
    const allowed = isExerciseAllowedForProfile(def, a);
    if (allowed.ok) continue;

    const result = replaceExerciseWithSafeAlternative(def ?? item.exerciseId ?? item.name, a);
    if (result.unresolved || !result.exercise) {
      unresolvedIssues.push({ exercise: item.name, reason: result.reason });
    } else {
      replacements.push({
        original: item.name,
        replacement: result.exercise.name,
        reason: result.reason,
      });
    }
  }

  return {
    ok: unresolvedIssues.length === 0,
    replacements,
    unresolvedIssues,
    blockRebuildRequired: unresolvedIssues.length > 0,
  };
}
