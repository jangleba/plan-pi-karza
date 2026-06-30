// ============================================================================
// Loadwise — Centralny profil treningowy zawodnika (athlete training profile)
// ----------------------------------------------------------------------------
// Jedno źródło prawdy o tym, KIM jest zawodnik, wyliczone z danych onboardingu.
// Cały silnik (siłownia, szybkość, wydolność, walidator planu) dobiera i
// filtruje ćwiczenia na podstawie tego profilu — nigdy globalnie tak samo.
//
// Reguła bezpieczeństwa: gdy brakuje danych, wybieramy BEZPIECZNIEJSZY wariant
// (młodszy / początkujący / bez sprzętu / z ostrożnością wobec kontuzji).
// ============================================================================

import type { Profile, ExerciseItem, TrainingExercise, PainLocation } from "./types";

// ---------------------------------------------------------------------------
// Typy profilu
// ---------------------------------------------------------------------------

export type DevelopmentStage =
  | "child_foundation" // <= 12
  | "early_youth" // 13–15
  | "late_youth" // 16–17
  | "adult"; // >= 18

export type GymExperienceLevel = "none" | "beginner" | "intermediate" | "advanced";
export type CompetenceLevel = "low" | "medium" | "high";
export type SupervisionLevel = "none" | "some" | "full";

/** Kategorie typów ćwiczeń używane przez allow/block list. */
export type ExerciseType =
  | "heavy_barbell_deadlift"
  | "barbell_deadlift"
  | "heavy_back_squat"
  | "heavy_front_squat"
  | "heavy_bench"
  | "max_effort" // 1RM/3RM/5RM, max lifting
  | "olympic_lift" // clean / jerk / snatch
  | "advanced_plyometrics"
  | "depth_jump"
  | "ballistic_advanced"
  | "high_volume_max_sprint"
  | "aggressive_anaerobic"
  | "loaded_hip_hinge"
  | "machine_strength"
  | "barbell_any"
  | "bodyweight_strength"
  | "band_strength"
  | "light_dumbbell"
  | "light_kettlebell"
  | "med_ball_light"
  | "core_stability"
  | "landing_mechanics"
  | "coordination"
  | "mobility"
  | "low_impact_conditioning"
  | "easy_aerobic"
  | "technical_speed"
  | "low_volume_sprint";

export interface ExerciseSafetyProfile {
  /** Czy wolno używać sztangi / dużych obciążeń osiowych. */
  allowBarbell: boolean;
  allowHeavyCompounds: boolean;
  allowMaxEffort: boolean;
  allowOlympicLifts: boolean;
  allowAdvancedPlyometrics: boolean;
  allowDepthJumps: boolean;
  allowHighVolumeSprint: boolean;
  allowAggressiveIntervals: boolean;
  /** Maksymalny dopuszczalny poziom plyo (1–4). */
  maxPlyoLevel: number;
  /** Górny pułap obciążenia względnego (% 1RM) — null = brak limitu. */
  maxRelativeLoadPct: number | null;
  notes: string[];
}

export interface InjuryConstraints {
  painLocations: PainLocation[];
  injuryHistory: PainLocation[];
  hasAnyPain: boolean;
  /** Wzorce ruchowe, których należy unikać. */
  avoidPatterns: string[];
  contraindications: string[];
}

export interface AthleteTrainingProfile {
  age: number | null;
  developmentStage: DevelopmentStage;
  trainingAge: number; // lata ogólnego treningu sportowego
  strengthTrainingAge: number; // miesiące doświadczenia siłowego
  gymExperienceLevel: GymExperienceLevel;
  sportExperienceLevel: GymExperienceLevel;
  movementCompetenceLevel: CompetenceLevel;
  coordinationLevel: CompetenceLevel;
  currentFitnessLevel: CompetenceLevel;
  athleteGoal: Profile["goal"];
  sport: "football";
  position: Profile["position"];
  seasonPhase: Profile["seasonPhase"];
  clubTrainingCount: number;
  matchCount: number;
  maxSessionsPerDay: number;
  availableTrainingDays: number[];
  availableTimePerSession: number; // minuty (heurystyka)
  equipmentAccess: string[];
  gymAccess: boolean;
  homeEquipment: string[];
  injuryHistory: PainLocation[];
  currentPain: PainLocation[];
  contraindications: string[];
  readiness: number; // 1–10
  fatigue: number; // 1–10
  sleepQuality: number; // 1–10
  recoveryStatus: "good" | "moderate" | "poor";
  supervisionLevel: SupervisionLevel;
  exerciseSafetyProfile: ExerciseSafetyProfile;
  allowedExerciseTypes: ExerciseType[];
  blockedExerciseTypes: ExerciseType[];
  injuryConstraints: InjuryConstraints;
  preferredTrainingStyle: "foundation" | "development" | "performance";
  onboardingWarnings: string[];
}

export interface WeekContext {
  readiness?: number;
  fatigue?: number;
  sleepQuality?: number;
}

// ---------------------------------------------------------------------------
// Rozpoznawanie wieku i poziomu
// ---------------------------------------------------------------------------

export function getDevelopmentStage(age: number | null | undefined): DevelopmentStage {
  // Brak wieku → traktuj jak młodzież (bezpieczniejszy wariant).
  if (age == null || Number.isNaN(age)) return "early_youth";
  if (age <= 12) return "child_foundation";
  if (age <= 15) return "early_youth";
  if (age <= 17) return "late_youth";
  return "adult";
}

/** Lata ogólnego treningu — wyliczane z poziomu zawodnika. */
export function getTrainingAge(p: Partial<Profile>): number {
  switch (p.level) {
    case "elite":
      return 8;
    case "advanced":
      return 5;
    case "intermediate":
      return 2;
    case "beginner":
    default:
      return 0;
  }
}

/** Doświadczenie siłowe (none/beginner/intermediate/advanced). */
export function getStrengthExperienceLevel(p: Partial<Profile>): GymExperienceLevel {
  // Jeśli onboarding poda to jawnie — użyj tego.
  if (p.gymExperienceLevel) return p.gymExperienceLevel;
  // Brak dostępu do siłowni → najwyżej beginner.
  const stage = getDevelopmentStage(p.age);
  // Mapowanie z ogólnego poziomu + wieku, zawsze bezpieczniej w dół.
  if (stage === "child_foundation" || stage === "early_youth") {
    // Młodzi: nawet "advanced" w piłce nie znaczy advanced na siłowni.
    if (p.level === "elite" || p.level === "advanced") return "beginner";
    return "none";
  }
  if (stage === "late_youth") {
    if (p.level === "elite") return "intermediate";
    if (p.level === "advanced") return "beginner";
    return "beginner";
  }
  // Dorosły
  switch (p.level) {
    case "elite":
      return "advanced";
    case "advanced":
      return "intermediate";
    case "intermediate":
      return "beginner";
    case "beginner":
    default:
      return "beginner";
  }
}

export function getMovementCompetenceLevel(p: Partial<Profile>): CompetenceLevel {
  if (p.movementCompetence) return p.movementCompetence;
  const stage = getDevelopmentStage(p.age);
  if (stage === "child_foundation") return "low";
  if (p.level === "elite" || p.level === "advanced") return "high";
  if (p.level === "intermediate") return "medium";
  return "low";
}

export function getCoordinationLevel(p: Partial<Profile>): CompetenceLevel {
  // Koordynacja śledzi kompetencję ruchową, ale dzieci mają niższy pułap.
  const mc = getMovementCompetenceLevel(p);
  if (getDevelopmentStage(p.age) === "child_foundation") return "low";
  return mc;
}

function strengthTrainingMonths(p: Partial<Profile>): number {
  if (typeof p.strengthTrainingMonths === "number") return p.strengthTrainingMonths;
  const lvl = getStrengthExperienceLevel(p);
  switch (lvl) {
    case "advanced":
      return 36;
    case "intermediate":
      return 18;
    case "beginner":
      return 3;
    case "none":
    default:
      return 0;
  }
}

function supervisionOf(p: Partial<Profile>): SupervisionLevel {
  if (p.supervisionLevel) return p.supervisionLevel;
  // Domyślnie zakładamy brak nadzoru (bezpieczniej).
  return "none";
}

// ---------------------------------------------------------------------------
// Profil bezpieczeństwa ćwiczeń + allow/block listy
// ---------------------------------------------------------------------------

export function getExerciseSafetyProfile(
  a: Pick<
    AthleteTrainingProfile,
    | "age"
    | "developmentStage"
    | "gymExperienceLevel"
    | "strengthTrainingAge"
    | "movementCompetenceLevel"
    | "supervisionLevel"
    | "readiness"
    | "currentPain"
    | "gymAccess"
  >,
): ExerciseSafetyProfile {
  const notes: string[] = [];

  const isYouth =
    a.age == null ||
    a.age <= 14 ||
    a.developmentStage === "child_foundation" ||
    a.developmentStage === "early_youth";

  const lowExp =
    a.gymExperienceLevel === "none" ||
    a.gymExperienceLevel === "beginner" ||
    a.strengthTrainingAge < 6 ||
    a.movementCompetenceLevel === "low" ||
    // Brak nadzoru ogranicza tylko zawodników niedorosłych (dorosły z
    // doświadczeniem może trenować bez trenera).
    (a.supervisionLevel === "none" && a.developmentStage !== "adult");

  const restrict = isYouth || lowExp;

  if (isYouth) notes.push("Zawodnik młodzieżowy — priorytet techniki i rozwoju.");
  if (lowExp) notes.push("Niskie doświadczenie siłowe / brak nadzoru — bez ciężkich bojów.");

  const advancedOk =
    !restrict &&
    a.developmentStage === "adult" &&
    (a.gymExperienceLevel === "intermediate" || a.gymExperienceLevel === "advanced");

  // Plyo
  let maxPlyoLevel = 1;
  if (!restrict) {
    if (a.gymExperienceLevel === "advanced") maxPlyoLevel = 4;
    else if (a.gymExperienceLevel === "intermediate") maxPlyoLevel = 3;
    else maxPlyoLevel = 2;
  } else {
    maxPlyoLevel = a.developmentStage === "child_foundation" ? 1 : 2;
  }
  // Niska gotowość obcina intensywność.
  if (a.readiness <= 4) {
    maxPlyoLevel = Math.min(maxPlyoLevel, 1);
    notes.push("Niska gotowość — ograniczona plyometria i obciążenie.");
  }

  const maxRelativeLoadPct = restrict
    ? a.developmentStage === "child_foundation"
      ? 0 // tylko masa ciała / minimalne obciążenie
      : 60
    : advancedOk
      ? null
      : 80;

  return {
    allowBarbell: a.gymAccess && advancedOk,
    allowHeavyCompounds: advancedOk,
    allowMaxEffort: advancedOk && a.readiness >= 7,
    allowOlympicLifts: false, // nigdy automatycznie w tym silniku
    allowAdvancedPlyometrics: !restrict && a.gymExperienceLevel === "advanced",
    allowDepthJumps: advancedOk && a.gymExperienceLevel === "advanced" && a.readiness >= 7,
    allowHighVolumeSprint: !restrict,
    allowAggressiveIntervals: !restrict && a.developmentStage !== "child_foundation",
    maxPlyoLevel,
    maxRelativeLoadPct,
    notes,
  };
}

export function getBlockedExerciseTypes(a: AthleteTrainingProfile): ExerciseType[] {
  const sp = a.exerciseSafetyProfile;
  const blocked = new Set<ExerciseType>();

  if (!sp.allowHeavyCompounds) {
    blocked.add("heavy_barbell_deadlift");
    blocked.add("heavy_back_squat");
    blocked.add("heavy_front_squat");
    blocked.add("heavy_bench");
    blocked.add("loaded_hip_hinge");
  }
  if (!sp.allowBarbell) {
    blocked.add("barbell_deadlift");
    blocked.add("barbell_any");
    blocked.add("machine_strength");
  }
  if (!sp.allowMaxEffort) blocked.add("max_effort");
  if (!sp.allowOlympicLifts) blocked.add("olympic_lift");
  if (!sp.allowAdvancedPlyometrics) blocked.add("advanced_plyometrics");
  if (!sp.allowDepthJumps) blocked.add("depth_jump");
  blocked.add("ballistic_advanced"); // wymaga zaawansowania + nadzoru
  if (!sp.allowHighVolumeSprint) blocked.add("high_volume_max_sprint");
  if (!sp.allowAggressiveIntervals) blocked.add("aggressive_anaerobic");

  // Brak dostępu do siłowni → bez sztangi i maszyn niezależnie od poziomu.
  if (!a.gymAccess) {
    blocked.add("barbell_any");
    blocked.add("barbell_deadlift");
    blocked.add("heavy_barbell_deadlift");
    blocked.add("heavy_back_squat");
    blocked.add("heavy_front_squat");
    blocked.add("heavy_bench");
    blocked.add("machine_strength");
  }

  return [...blocked];
}

export function getAllowedExerciseTypes(a: AthleteTrainingProfile): ExerciseType[] {
  const blocked = new Set(a.blockedExerciseTypes);
  const base: ExerciseType[] = [
    "bodyweight_strength",
    "band_strength",
    "light_dumbbell",
    "light_kettlebell",
    "med_ball_light",
    "core_stability",
    "landing_mechanics",
    "coordination",
    "mobility",
    "low_impact_conditioning",
    "easy_aerobic",
    "technical_speed",
    "low_volume_sprint",
    "heavy_barbell_deadlift",
    "barbell_deadlift",
    "heavy_back_squat",
    "heavy_front_squat",
    "heavy_bench",
    "max_effort",
    "olympic_lift",
    "advanced_plyometrics",
    "depth_jump",
    "ballistic_advanced",
    "high_volume_max_sprint",
    "aggressive_anaerobic",
    "loaded_hip_hinge",
    "machine_strength",
    "barbell_any",
  ];
  return base.filter((t) => !blocked.has(t));
}

// ---------------------------------------------------------------------------
// Kontuzje i ból
// ---------------------------------------------------------------------------

export function getPainConstraints(p: Partial<Profile>): PainLocation[] {
  if (p.painLocations && p.painLocations.length) return p.painLocations;
  // Mamy tylko flagę painInjury → traktujemy jako ogólne ostrzeżenie ("other").
  if (p.painInjury) return ["other"];
  return [];
}

export function getInjuryConstraints(p: Partial<Profile>): InjuryConstraints {
  const painLocations = getPainConstraints(p);
  const injuryHistory = p.injuryHistory ?? [];
  const all = new Set<PainLocation>([...painLocations, ...injuryHistory]);
  const avoidPatterns: string[] = [];
  const contraindications: string[] = [];

  if (all.has("knee")) {
    avoidPatterns.push("aggressive_jumps", "high_volume_landings", "heavy_squat");
    contraindications.push("Ból kolana — unikaj agresywnych skoków i ciężkich przysiadów.");
  }
  if (all.has("back")) {
    avoidPatterns.push("deadlift", "heavy_hip_hinge", "axial_load");
    contraindications.push("Ból pleców — unikaj martwego ciągu i dużego obciążenia osiowego.");
  }
  if (all.has("ankle")) {
    avoidPatterns.push("plyometrics", "sprint", "cod");
    contraindications.push("Ból kostki — ogranicz plyometrię, sprinty i zmiany kierunku.");
  }
  if (all.has("hamstring")) {
    avoidPatterns.push("max_velocity", "aggressive_eccentric");
    contraindications.push("Historia dwugłowego — ostrożnie z max velocity, progresuj posterior chain.");
  }
  if (all.has("groin")) {
    avoidPatterns.push("aggressive_cod", "wide_adduction");
    contraindications.push("Ból pachwiny — ostrożnie z COD i obciążonymi przywodzicielami.");
  }
  if (all.has("hip")) {
    avoidPatterns.push("deep_loaded_flexion");
  }
  if (all.has("shoulder")) {
    avoidPatterns.push("overhead_press", "heavy_bench");
  }
  if (all.has("other") && all.size === 1) {
    // Tylko ogólna flaga bólu — konserwatywnie ograniczamy obciążenia osiowe.
    avoidPatterns.push("heavy_axial_load");
    contraindications.push("Zgłoszony ogólny ból/uraz — wybrano bezpieczniejszy wariant.");
  }

  return {
    painLocations,
    injuryHistory,
    hasAnyPain: painLocations.length > 0,
    avoidPatterns,
    contraindications,
  };
}

// ---------------------------------------------------------------------------
// buildAthleteTrainingProfile — główny wpis
// ---------------------------------------------------------------------------

export function buildAthleteTrainingProfile(
  onboardingData: Partial<Profile>,
  userSettings: Partial<Profile> = {},
  weekContext: WeekContext = {},
): AthleteTrainingProfile {
  const p: Partial<Profile> = { ...onboardingData, ...userSettings };
  const warnings: string[] = [];

  const age = typeof p.age === "number" && !Number.isNaN(p.age) ? p.age : null;
  if (age == null) warnings.push("Brak wieku — przyjęto profil młodzieżowy (bez skrajnych ćwiczeń).");

  const developmentStage = getDevelopmentStage(age);
  const gymExperienceLevel = getStrengthExperienceLevel(p);
  if (!p.gymExperienceLevel && !p.level)
    warnings.push("Brak doświadczenia siłowego — przyjęto poziom początkujący.");

  const movementCompetenceLevel = getMovementCompetenceLevel(p);
  const coordinationLevel = getCoordinationLevel(p);
  const strengthTrainingAge = strengthTrainingMonths(p);
  const supervisionLevel = supervisionOf(p);

  const gymAccess = p.hasGym ?? false;
  if (p.hasGym == null) warnings.push("Brak informacji o siłowni — nie zakładamy dostępu do sztangi.");

  const readiness = weekContext.readiness ?? 6;
  const fatigue = weekContext.fatigue ?? 5;
  const sleepQuality = weekContext.sleepQuality ?? 6;

  const injuryConstraints = getInjuryConstraints(p);
  if (injuryConstraints.contraindications.length)
    warnings.push(...injuryConstraints.contraindications);

  const partialForSafety = {
    age,
    developmentStage,
    gymExperienceLevel,
    strengthTrainingAge,
    movementCompetenceLevel,
    supervisionLevel,
    readiness,
    currentPain: injuryConstraints.painLocations,
    gymAccess,
  };
  const exerciseSafetyProfile = getExerciseSafetyProfile(partialForSafety);

  const recoveryStatus: AthleteTrainingProfile["recoveryStatus"] =
    fatigue >= 7 || readiness <= 4 ? "poor" : fatigue >= 5 || readiness <= 6 ? "moderate" : "good";

  const currentFitnessLevel: CompetenceLevel =
    p.level === "elite" || p.level === "advanced"
      ? "high"
      : p.level === "intermediate"
        ? "medium"
        : "low";

  const preferredTrainingStyle: AthleteTrainingProfile["preferredTrainingStyle"] =
    developmentStage === "adult" && (gymExperienceLevel === "intermediate" || gymExperienceLevel === "advanced")
      ? "performance"
      : gymExperienceLevel === "none" || developmentStage === "child_foundation"
        ? "foundation"
        : "development";

  const partial: AthleteTrainingProfile = {
    age,
    developmentStage,
    trainingAge: getTrainingAge(p),
    strengthTrainingAge,
    gymExperienceLevel,
    sportExperienceLevel: gymExperienceLevel,
    movementCompetenceLevel,
    coordinationLevel,
    currentFitnessLevel,
    athleteGoal: p.goal ?? "general",
    sport: "football",
    position: p.position ?? "midfielder",
    seasonPhase: p.seasonPhase ?? "inseason",
    clubTrainingCount: p.clubTrainingDays?.length ?? 0,
    matchCount: p.matchDate ? 1 : 0,
    maxSessionsPerDay: p.doubleSessionsAllowed && p.doubleSessionsAllowed !== "no" ? 2 : 1,
    availableTrainingDays: p.individualTrainingDays ?? [],
    availableTimePerSession: developmentStage === "child_foundation" ? 40 : 60,
    equipmentAccess: p.equipment ?? [],
    gymAccess,
    homeEquipment: p.homeEquipment ?? [],
    injuryHistory: injuryConstraints.injuryHistory,
    currentPain: injuryConstraints.painLocations,
    contraindications: injuryConstraints.contraindications,
    readiness,
    fatigue,
    sleepQuality,
    recoveryStatus,
    supervisionLevel,
    exerciseSafetyProfile,
    allowedExerciseTypes: [],
    blockedExerciseTypes: [],
    injuryConstraints,
    preferredTrainingStyle,
    onboardingWarnings: warnings,
  };

  partial.blockedExerciseTypes = getBlockedExerciseTypes(partial);
  partial.allowedExerciseTypes = getAllowedExerciseTypes(partial);
  return partial;
}

// ---------------------------------------------------------------------------
// Klasyfikacja ćwiczeń po nazwie → typ ćwiczenia
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return (s || "").toLowerCase();
}

const HEAVY_WORD = /(ciężk|heavy|max|ciezk|1\s?rm|3\s?rm|5\s?rm)/i;

/** Wykrywa typy ćwiczenia, których dotyczą reguły bezpieczeństwa. */
export function classifyExerciseTypes(name: string): ExerciseType[] {
  const n = norm(name);
  const out = new Set<ExerciseType>();

  const isBarbell = /(sztang|barbell|back squat|front squat|bench press)/i.test(n);
  const isDeadlift = /(martwy ciąg|martwy ciag|deadlift)/i.test(n) && !/(trap|romanian|rdl|hantl|kettle|dumbbell|db )/i.test(n);
  const isRDL = /(romanian|rdl)/i.test(n);
  const heavy = HEAVY_WORD.test(n);

  if (/(1\s?rm|3\s?rm|5\s?rm|max effort|maksymaln.*(ciężar|próba|prob)|test siły|1rm)/i.test(n))
    out.add("max_effort");
  if (/(clean|jerk|snatch|rwanie|podrzut|zarzut|olimpijsk)/i.test(n)) out.add("olympic_lift");

  if (isDeadlift) {
    out.add("barbell_deadlift");
    if (heavy) out.add("heavy_barbell_deadlift");
  }
  if (/(back squat|przysiad ze sztang|przysiad -? ?sztang|barbell squat)/i.test(n) && (heavy || isBarbell))
    out.add("heavy_back_squat");
  if (/(front squat|przysiad przedni)/i.test(n)) out.add("heavy_front_squat");
  if (/(bench press|wyciskanie.*ławce|wyciskanie sztangi)/i.test(n)) out.add("heavy_bench");
  if (isRDL && (heavy || isBarbell)) out.add("loaded_hip_hinge");
  if (isBarbell) out.add("barbell_any");
  if (/(maszyn|machine|smith)/i.test(n)) out.add("machine_strength");

  if (/(depth jump|skok w głąb|skok w glab)/i.test(n)) {
    out.add("depth_jump");
    out.add("advanced_plyometrics");
  }
  if (/(reaktywn|reactive|bounding|wieloskok|drop jump|shock)/i.test(n)) out.add("advanced_plyometrics");
  if (/(ballistic|balistyczn)/i.test(n)) out.add("ballistic_advanced");

  return [...out];
}

// ---------------------------------------------------------------------------
// Walidacja pojedynczego ćwiczenia
// ---------------------------------------------------------------------------

export interface ExerciseValidation {
  ok: boolean;
  blockedTypes: ExerciseType[];
  reason: string | null;
}

export function validateExerciseForAthleteProfile(
  name: string,
  a: AthleteTrainingProfile,
): ExerciseValidation {
  const types = classifyExerciseTypes(name);
  const blockedSet = new Set(a.blockedExerciseTypes);
  const hit = types.filter((t) => blockedSet.has(t));
  if (hit.length === 0) return { ok: true, blockedTypes: [], reason: null };
  return {
    ok: false,
    blockedTypes: hit,
    reason: blockReasonFor(hit, a),
  };
}

function blockReasonFor(types: ExerciseType[], a: AthleteTrainingProfile): string {
  const youth = a.developmentStage === "early_youth" || a.developmentStage === "child_foundation";
  const who = youth
    ? "zawodnik młodzieżowy/początkujący"
    : a.gymExperienceLevel === "beginner" || a.gymExperienceLevel === "none"
      ? "zawodnik początkujący"
      : !a.gymAccess
        ? "brak dostępu do siłowni"
        : "profil zawodnika";
  if (types.includes("olympic_lift"))
    return `Zablokowano podnoszenie olimpijskie — ${who}.`;
  if (types.includes("max_effort")) return `Zablokowano próby maksymalne (1RM/3RM/5RM) — ${who}.`;
  if (types.includes("heavy_barbell_deadlift") || types.includes("barbell_deadlift"))
    return `Zamieniono ciężki martwy ciąg — ${who}.`;
  if (types.includes("heavy_back_squat") || types.includes("heavy_front_squat"))
    return `Zamieniono ciężki przysiad ze sztangą — ${who}.`;
  if (types.includes("heavy_bench")) return `Zamieniono ciężkie wyciskanie — ${who}.`;
  if (types.includes("depth_jump") || types.includes("advanced_plyometrics"))
    return `Zablokowano zaawansowaną plyometrię — ${who}.`;
  return `Ćwiczenie niedostosowane do profilu — ${who}.`;
}

export function validateExerciseAgainstInjuries(
  name: string,
  a: AthleteTrainingProfile,
): ExerciseValidation {
  const n = norm(name);
  const avoid = a.injuryConstraints.avoidPatterns;
  const hits: string[] = [];

  const matchers: Record<string, RegExp> = {
    deadlift: /(martwy ciąg|deadlift)/i,
    heavy_hip_hinge: /(romanian|rdl|hip hinge|good morning)/i,
    axial_load: /(sztang|przysiad ze sztang|back squat)/i,
    heavy_axial_load: HEAVY_WORD,
    heavy_squat: /(przysiad ze sztang|back squat|ciężki przysiad)/i,
    aggressive_jumps: /(depth jump|skok w głąb|drop jump|reaktywn|wieloskok|bounding)/i,
    high_volume_landings: /(plyo|skok|jump|lądowani)/i,
    plyometrics: /(plyo|skok|jump|pogo|bounding)/i,
    sprint: /(sprint|max velocity|max prędko)/i,
    cod: /(zmiana kierunku|cod|change of direction|cięcie|agility)/i,
    aggressive_cod: /(zmiana kierunku|cod|cięcie)/i,
    max_velocity: /(max velocity|max prędko|latając|flying)/i,
    aggressive_eccentric: /(nordic|ekscentr|eccentric)/i,
    overhead_press: /(overhead|nad głow|ohp|wyciskanie nad)/i,
    heavy_bench: /(bench press|wyciskanie.*ławce)/i,
    wide_adduction: /(przywodzic|adduct|copenhagen.*ciężk)/i,
    deep_loaded_flexion: /(głęboki przysiad|deep squat)/i,
  };

  for (const pattern of avoid) {
    const re = matchers[pattern];
    if (re && re.test(n)) hits.push(pattern);
  }
  if (hits.length === 0) return { ok: true, blockedTypes: [], reason: null };
  const loc = a.injuryConstraints.painLocations.join(", ") || "zgłoszony ból";
  return {
    ok: false,
    blockedTypes: [],
    reason: `Zamieniono ze względu na ból/kontuzję (${loc}).`,
  };
}

// ---------------------------------------------------------------------------
// Bezpieczne zamienniki (regresje)
// ---------------------------------------------------------------------------

interface Replacement {
  name: string;
  prescription: string;
  cue: string;
}

function pickStrengthReplacement(
  blockedTypes: ExerciseType[],
  a: AthleteTrainingProfile,
): Replacement {
  const youth = a.developmentStage === "early_youth" || a.developmentStage === "child_foundation";
  const veryBasic = youth || a.gymExperienceLevel === "none" || a.movementCompetenceLevel === "low";
  const hasDumbbell =
    a.gymAccess ||
    a.equipmentAccess.some((e) => /hantl|dumbbell|kettle|kettlebell/i.test(e)) ||
    a.homeEquipment.some((e) => /hantl|dumbbell|kettle|kettlebell/i.test(e));

  // Hinge / deadlift
  if (
    blockedTypes.includes("heavy_barbell_deadlift") ||
    blockedTypes.includes("barbell_deadlift") ||
    blockedTypes.includes("loaded_hip_hinge")
  ) {
    if (veryBasic)
      return {
        name: "Hip hinge drill (bez ciężaru) → Glute bridge",
        prescription: "3 × 8–10",
        cue: "Biodra w tył, plecy proste, napnij pośladki na górze.",
      };
    if (hasDumbbell)
      return {
        name: "Romanian deadlift z hantlami (lekko)",
        prescription: "3 × 8 @ RPE 6–7",
        cue: "Lekki ciężar, kontrola, biodra w tył — bez zaokrąglania pleców.",
      };
    return {
      name: "Glute bridge / hip thrust z masą ciała",
      prescription: "3 × 10",
      cue: "Pełne wyprosty bioder, napięty brzuch.",
    };
  }

  // Squat
  if (blockedTypes.includes("heavy_back_squat") || blockedTypes.includes("heavy_front_squat")) {
    if (veryBasic)
      return {
        name: "Bodyweight squat → Split squat",
        prescription: "3 × 8–10 / nogę",
        cue: "Kontroluj kolano nad stopą, pełen zakres bez bólu.",
      };
    return {
      name: "Goblet squat (lekko)",
      prescription: "3 × 8 @ RPE 6–7",
      cue: "Klatka wysoko, kolana na zewnątrz, kontrola.",
    };
  }

  // Bench
  if (blockedTypes.includes("heavy_bench")) {
    return {
      name: hasDumbbell ? "Wyciskanie hantli (lekko) / Push-up progression" : "Push-up progression",
      prescription: "3 × 8–10",
      cue: "Łopatki ściągnięte, pełen kontrolowany zakres.",
    };
  }

  // Olympic / max effort / ballistic → power techniczny
  if (
    blockedTypes.includes("olympic_lift") ||
    blockedTypes.includes("max_effort") ||
    blockedTypes.includes("ballistic_advanced")
  ) {
    return {
      name: "Med ball throw (lekka) / Snap-down",
      prescription: "4 × 3–4",
      cue: "Szybko i technicznie, lekki ciężar, jakość przed ilością.",
    };
  }

  // Plyo
  if (blockedTypes.includes("depth_jump") || blockedTypes.includes("advanced_plyometrics")) {
    return {
      name: "Snap-down landing → niskie pogo",
      prescription: "4 × 4",
      cue: "Miękkie, ciche lądowanie, kontrola kolan i stóp.",
    };
  }

  // Maszyny / sztanga ogólnie (np. brak siłowni)
  return {
    name: "Wariant z masą ciała / gumą oporową",
    prescription: "3 × 10",
    cue: "Kontrola tempa, pełen zakres bez bólu.",
  };
}

function injuryReplacement(a: AthleteTrainingProfile): Replacement {
  const loc = a.injuryConstraints.painLocations;
  if (loc.includes("back"))
    return {
      name: "Core stability: Bird dog + Dead bug",
      prescription: "3 × 8 / stronę",
      cue: "Neutralny kręgosłup, napięty brzuch, bez bólu.",
    };
  if (loc.includes("knee"))
    return {
      name: "Kontrola kolana: izometria + biodro/core",
      prescription: "3 × 20–30 s",
      cue: "Bez bólu, kolano stabilne nad stopą.",
    };
  if (loc.includes("ankle"))
    return {
      name: "Calf/foot strength + mobilność kostki",
      prescription: "3 × 12",
      cue: "Powolne, kontrolowane, pełen zakres bez bólu.",
    };
  if (loc.includes("hamstring"))
    return {
      name: "Posterior chain bez agresji: Glute bridge + izometria",
      prescription: "3 × 10",
      cue: "Progresywnie, bez ostrego rozciągania, kontrola.",
    };
  return {
    name: "Bezpieczna alternatywa: core + mobilność",
    prescription: "3 × 10",
    cue: "Ruch bez bólu, kontrolowane tempo.",
  };
}

export function getSafeExerciseAlternatives(
  name: string,
  a: AthleteTrainingProfile,
): Replacement {
  const inj = validateExerciseAgainstInjuries(name, a);
  if (!inj.ok) return injuryReplacement(a);
  const v = validateExerciseForAthleteProfile(name, a);
  return pickStrengthReplacement(v.blockedTypes, a);
}

// ---------------------------------------------------------------------------
// replaceUnsafeExercise — działa na ExerciseItem oraz TrainingExercise
// ---------------------------------------------------------------------------

type AnyExercise = ExerciseItem | TrainingExercise;

/** Zwraca dostosowane ćwiczenie (lub to samo, gdy bezpieczne). */
export function replaceUnsafeExercise<T extends AnyExercise>(
  exercise: T,
  a: AthleteTrainingProfile,
): T {
  const name = exercise.name;
  const inj = validateExerciseAgainstInjuries(name, a);
  const prof = validateExerciseForAthleteProfile(name, a);
  if (inj.ok && prof.ok) return exercise;

  const repl = inj.ok ? pickStrengthReplacement(prof.blockedTypes, a) : injuryReplacement(a);
  const reason = inj.ok ? prof.reason! : inj.reason!;

  const adjusted: T = {
    ...exercise,
    name: repl.name,
    cue: repl.cue,
    wasAdjustedForAthleteProfile: true,
    athleteProfileAdjustmentReason: reason,
    blockedExerciseReason: reason,
    replacementForBlockedExercise: name,
  };
  // ExerciseItem ma prescription, TrainingExercise ma sets/reps.
  if ("prescription" in exercise) {
    (adjusted as ExerciseItem).prescription = repl.prescription;
  } else {
    const te = adjusted as TrainingExercise;
    te.sets = repl.prescription.split("×")[0]?.trim() || te.sets;
    te.reps = repl.prescription.split("×")[1]?.trim() || te.reps;
    te.loadTarget = "RPE 6–7";
  }
  return adjusted;
}

// ---------------------------------------------------------------------------
// Walidacja całego treningu / planu
// ---------------------------------------------------------------------------

export interface WorkoutAdjustment {
  original: string;
  replacement: string;
  reason: string;
}

export interface WorkoutValidationResult {
  adjustments: WorkoutAdjustment[];
  hadIssues: boolean;
}
