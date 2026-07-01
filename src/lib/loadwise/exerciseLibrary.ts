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
  | "strength"
  | "power"
  | "plyometric"
  | "speed"
  | "endurance"
  | "mobility"
  | "core"
  | "prehab";

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

export interface ExerciseDefinition {
  id: string;
  name: string;
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
  equipmentRequired: string[];
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
}

// ---------------------------------------------------------------------------
// Biblioteka ćwiczeń
// ---------------------------------------------------------------------------

const LIBRARY: ExerciseDefinition[] = [
  // ---- REGRESJE / FUNDAMENT (dozwolone dla młodych/początkujących) ----
  {
    id: "bodyweight_split_squat",
    name: "Bodyweight split squat",
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
    safeAlternativeIds: ["bodyweight_squat", "glute_bridge"],
    coachingCues: ["Tułów pionowo", "Kolano nad stopą", "Kontrolowane tempo"],
    commonErrors: ["Kolano ucieka do środka", "Za duży krok w przód"],
  },
  {
    id: "bodyweight_squat",
    name: "Bodyweight squat",
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
    safeAlternativeIds: ["bodyweight_split_squat"],
    coachingCues: ["Klatka wysoko", "Biodra w tył", "Pełny zakres bez bólu"],
    commonErrors: ["Zaokrąglone plecy", "Pięty odrywają się od podłoża"],
  },
  {
    id: "glute_bridge",
    name: "Glute bridge",
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
    safeAlternativeIds: ["dead_bug", "bird_dog"],
    coachingCues: ["Neutralny kręgosłup", "Napięty brzuch i pośladki"],
    commonErrors: ["Zapadnięte biodra", "Wygięte lędźwie"],
  },
  {
    id: "dead_bug",
    name: "Dead bug",
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
    safeAlternativeIds: ["bird_dog", "plank"],
    coachingCues: ["Dociśnij lędźwie do podłogi", "Powolny, kontrolowany ruch"],
    commonErrors: ["Odrywanie lędźwi", "Wstrzymywanie oddechu"],
  },
  {
    id: "bird_dog",
    name: "Bird dog",
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
    safeAlternativeIds: ["dead_bug", "plank"],
    coachingCues: ["Neutralny kręgosłup", "Wydłuż przeciwną rękę i nogę", "Bez rotacji bioder"],
    commonErrors: ["Rotacja miednicy", "Zapadanie w lędźwiach"],
  },
  {
    id: "acceleration_mechanics",
    name: "Mechanika akceleracji (niska objętość)",
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
    safeAlternativeIds: ["bodyweight_squat"],
    coachingCues: ["Niska objętość, wysoka jakość", "Pełny rest między biegami", "Napęd z bioder"],
    commonErrors: ["Za duża objętość", "Bieg na zmęczeniu"],
  },
  // ---- ŚREDNIOZAAWANSOWANE ----
  {
    id: "goblet_squat",
    name: "Goblet squat",
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
    equipmentRequired: ["bench"],
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
    coachingCues: ["Napięty core", "Sztanga blisko goleni", "Neutralny kręgosłup"],
    commonErrors: ["Zaokrąglone plecy", "Sztanga daleko od ciała", "Szarpanie z dołu"],
  },
  {
    id: "power_clean",
    name: "Power clean (zarzut)",
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
    regressionIds: ["med_ball_throw"],
    safeAlternativeIds: ["med_ball_throw"],
    coachingCues: ["Wyprost bioder eksplozywnie", "Łokcie szybko w przód", "Sztanga blisko ciała"],
    commonErrors: ["Wczesne zgięcie ramion", "Sztanga daleko od ciała"],
  },
  {
    id: "depth_jump",
    name: "Depth jump (skok w głąb)",
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
    injuryCautions: ["Wysoka intensywność plyometryczna — tylko przy dobrej kompetencji lądowania i świeżości."],
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
    safeAlternativeIds: ["snap_down"],
    coachingCues: ["Miękkie, ciche lądowanie", "Krótki kontakt z podłożem", "Kolana stabilne"],
    commonErrors: ["Głośne lądowanie", "Kolana do środka", "Za wysoka skrzynia"],
  },
  {
    id: "max_velocity_high_volume",
    name: "Max velocity — wysoka objętość",
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
  },
  {
    id: "snap_down",
    name: "Snap-down / niskie pogo",
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
    safeAlternativeIds: ["snap_down"],
    coachingCues: ["Szybko i technicznie", "Lekki ciężar", "Jakość przed ilością"],
    commonErrors: ["Za ciężka piłka", "Wolny ruch"],
  },
];

const LIBRARY_INDEX = new Map<string, ExerciseDefinition>(LIBRARY.map((e) => [e.id, e]));

export function getAllExerciseDefinitions(): ExerciseDefinition[] {
  return LIBRARY;
}

export function getExerciseDefinition(exerciseId: string): ExerciseDefinition | undefined {
  return LIBRARY_INDEX.get(exerciseId);
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
  return (
    a.developmentStage === "child_foundation" || a.developmentStage === "early_youth"
  );
}

function isBeginnerProfile(a: AthleteTrainingProfile): boolean {
  return a.gymExperienceLevel === "none" || a.gymExperienceLevel === "beginner";
}

function hasEquipment(def: ExerciseDefinition, a: AthleteTrainingProfile): boolean {
  if (def.equipmentRequired.length === 0) return true;
  const owned = [
    ...a.equipmentAccess,
    ...a.homeEquipment,
    ...(a.gymAccess ? ["barbell", "rack", "bench", "dumbbell", "kettlebell", "box", "platform", "med_ball", "machine"] : []),
  ].map((s) => s.toLowerCase());
  return def.equipmentRequired.every((req) => {
    const r = req.toLowerCase();
    return owned.some((o) => o.includes(r) || r.includes(o));
  });
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
  const def =
    typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;

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

  const candidates = [...def.regressionIds, ...def.safeAlternativeIds];
  for (const id of candidates) {
    if (visited.has(id)) continue;
    const cand = getExerciseDefinition(id);
    if (!cand) continue;
    if (isExerciseAllowedForProfile(cand, a).ok) return cand;
  }
  // Głębsza regresja — spróbuj regresji regresji.
  for (const id of candidates) {
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
}

/**
 * replaceExerciseWithSafeAlternative — zwraca bezpieczny zamiennik.
 * Reguła 2: regresja/alternatywa. Reguła 3: jeśli brak — unresolved=true.
 */
export function replaceExerciseWithSafeAlternative(
  exercise: ExerciseDefinition | string,
  a: AthleteTrainingProfile,
): SafeAlternativeResult {
  const def = typeof exercise === "string" ? getExerciseDefinition(exercise) : exercise;
  const original = def?.name ?? String(exercise);

  const allowed = isExerciseAllowedForProfile(def, a);
  if (allowed.ok && def)
    return { exercise: def, reason: "Ćwiczenie dozwolone.", unresolved: false };

  const regression = def ? getExerciseRegression(def, a) : undefined;
  if (regression)
    return {
      exercise: regression,
      reason: `„${original}" zamieniono na „${regression.name}" (${allowed.reasons.join(" ")}).`,
      unresolved: false,
    };

  return {
    exercise: null,
    reason: `Brak bezpiecznej alternatywy dla „${original}" (${allowed.reasons.join(" ")}).`,
    unresolved: true,
  };
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
];

export interface LibraryCompletenessReport {
  ok: boolean;
  totalExercises: number;
  issues: { id: string; problem: string }[];
}

export function validateExerciseLibraryCompleteness(): LibraryCompletenessReport {
  const issues: { id: string; problem: string }[] = [];
  const seenIds = new Set<string>();

  for (const def of LIBRARY) {
    if (seenIds.has(def.id)) issues.push({ id: def.id, problem: "Zduplikowane id." });
    seenIds.add(def.id);

    for (const field of REQUIRED_FIELDS) {
      const v = def[field];
      if (v === undefined || v === null) {
        issues.push({ id: def.id, problem: `Brak pola: ${String(field)}.` });
      }
    }
    if (!def.coachingCues.length) issues.push({ id: def.id, problem: "Brak coachingCues." });
    // Referencje muszą istnieć.
    for (const ref of [...def.progressionIds, ...def.regressionIds, ...def.safeAlternativeIds]) {
      if (!LIBRARY_INDEX.has(ref))
        issues.push({ id: def.id, problem: `Nieistniejąca referencja: ${ref}.` });
    }
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
    const def = item.exerciseId ? getExerciseDefinition(item.exerciseId) : undefined;
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
  };
}
