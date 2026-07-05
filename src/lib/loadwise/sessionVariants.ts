// ============================================================================
// Loadwise — Generatory konkretnych jednostek treningowych.
// ----------------------------------------------------------------------------
// Silnik NIE dodaje pustej kategorii. Buduje sensowne treningi gym_strength,
// endurance_conditioning i speed_sprint dopasowane do profilu zawodnika
// (wiek, etap rozwoju, doświadczenie, cel, sezon, mecz, klub, readiness,
// sprzęt, kontuzje, obciążenie tygodnia).
//
// Każda wygenerowana sesja przechodzi przez normalizeGeneratedSession(),
// który wylicza countsAs* i tagi w spójny sposób, oraz może być sprawdzona
// przez validateWorkoutForAthleteProfile().
// ============================================================================

import type {
  Intensity,
  SessionCategory,
  SessionGeneratedBy,
  SessionSubcategory,
} from "./types";
import type { SchedLoadLevel } from "./dailyScheduling";
import type { AthleteTrainingProfile } from "./athleteProfile";
import { classifyExerciseTypes } from "./athleteProfile";
import { getAthleteGoalRules } from "./weeklyRequirements";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface GeneratedSessionBlock {
  label?: string;
  name: string;
  detail?: string;
}

export interface GeneratedSession {
  category: SessionCategory;
  subcategory: SessionSubcategory;
  title: string;
  description: string;
  durationMinutes: number;
  intensity: Intensity;
  loadLevel: SchedLoadLevel;
  tags: string[];
  blocks: GeneratedSessionBlock[];
  countsAsStrength: boolean;
  countsAsEndurance: boolean;
  countsAsSpeed: boolean;
  generatedBy: SessionGeneratedBy;
  placementReason: string;
  sourceRule: string;
  athleteProfileApplied: boolean;
  safetyProfileApplied: boolean;
  /** Ustawiane, gdy sesja nie mogła powstać w danym miejscu (np. dzień klubowy). */
  blockReason?: string;
}

/** Kontekst umiejscowienia sesji — steruje adaptacją treści. */
export interface SessionGenContext {
  /** Dzień ma już trening klubowy. */
  hasClub?: boolean;
  /** Dni do meczu: 0 = mecz, 1 = MD-1, null/undefined = brak meczu. */
  toMatch?: number | null;
  /** Dzień bezpośrednio po meczu. */
  isDayAfterMatch?: boolean;
  /** Readiness 1–10 (override profilu). */
  readiness?: number;
  /** Tydzień o wysokim obciążeniu (dużo klubowych / congested). */
  weekLoadHigh?: boolean;
  /** Cel zawodnika (override profilu). */
  goal?: string;
  /** Który slot szybkości: 1 = accel/decel, 2 = max velocity / COD. */
  speedSlot?: 1 | 2;
  /** Wymuszony wariant siłowni. */
  gymVariant?: "lower" | "upper" | "full_body" | "power";
  /** Powód umiejscowienia z scoringu dnia. */
  placementReason?: string;
}

// ---------------------------------------------------------------------------
// Helpery
// ---------------------------------------------------------------------------

const LOW_READINESS_THRESHOLD = 5;

export function isYouthOrBeginnerAthlete(
  a: AthleteTrainingProfile | null | undefined,
): boolean {
  if (!a) return true; // brak danych → bezpieczniejszy wariant
  const youthStage =
    a.developmentStage === "child_foundation" || a.developmentStage === "early_youth";
  const beginner =
    a.gymExperienceLevel === "none" || a.gymExperienceLevel === "beginner";
  return youthStage || beginner || a.preferredTrainingStyle === "foundation";
}

function resolveReadiness(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): number {
  if (typeof ctx.readiness === "number") return ctx.readiness;
  if (a && typeof a.readiness === "number") return a.readiness;
  return 6;
}

function isLowReadiness(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): boolean {
  return resolveReadiness(ctx, a) <= LOW_READINESS_THRESHOLD;
}

function isDayBeforeMatch(ctx: SessionGenContext): boolean {
  return ctx.toMatch === 1;
}

function isMatchDay(ctx: SessionGenContext): boolean {
  return ctx.toMatch === 0;
}

function resolveGoal(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): string {
  return ctx.goal ?? a?.athleteGoal ?? "general";
}

function reason(ctx: SessionGenContext, fallback: string): string {
  return ctx.placementReason && ctx.placementReason.length ? ctx.placementReason : fallback;
}

// ---------------------------------------------------------------------------
// SIŁOWNIA
// ---------------------------------------------------------------------------

function youthGymSession(ctx: SessionGenContext): GeneratedSession {
  return normalizeGeneratedSession({
    category: "gym_strength",
    subcategory: "strength_foundation",
    title: "Youth strength foundation: masa ciała + gumy",
    description:
      "Baza siły ogólnej dla młodego zawodnika: kontrola ruchu, technika, " +
      "masa ciała i gumy oporowe. Bez sztangi, bez maksów, bez martwego ciągu.",
    durationMinutes: 40,
    intensity: "umiarkowana",
    loadLevel: "moderate",
    blocks: [
      { label: "A", name: "Przysiad z masą ciała / goblet lekki", detail: "3 x 8–10, technika" },
      { label: "B", name: "Bułgarski przysiad (masa ciała)", detail: "3 x 8 / nogę" },
      { label: "C", name: "Mostek biodrowy", detail: "3 x 12" },
      { label: "D", name: "Pompki / wiosłowanie gumą", detail: "3 x 8–10" },
      { label: "E", name: "Plank + dead bug + bird dog", detail: "2–3 rundy" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Youth-safe siła ogólna zamiast ciężkiej siłowni."),
    sourceRule: "gym/youth_foundation",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

export function createGymSessionVariant(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  // Youth / beginner → zawsze fundament siły (liczy się jako gym_strength).
  if (isYouthOrBeginnerAthlete(a)) {
    return youthGymSession(ctx);
  }

  const low = isLowReadiness(ctx, a);
  const beforeMatch = isDayBeforeMatch(ctx);
  const afterMatch = ctx.isDayAfterMatch === true;

  // Dzień przed meczem lub niski readiness lub dzień po meczu → bez ciężkich nóg.
  if (beforeMatch || low || afterMatch || ctx.weekLoadHigh) {
    const sub: SessionSubcategory = beforeMatch
      ? "upper_strength"
      : low
        ? "strength_maintenance"
        : "upper_strength";
    return normalizeGeneratedSession({
      category: "gym_strength",
      subcategory: sub,
      title: beforeMatch
        ? "Siła: góra + core (MD-1, bez nóg)"
        : low
          ? "Siła podtrzymująca: góra + core"
          : "Siła: góra + core (odciążenie)",
      description:
        "Wariant o niskim obciążeniu nóg: górna część ciała, core i stabilizacja. " +
        "Utrzymuje bodziec siłowy bez zmęczenia układu nerwowego i nóg.",
      durationMinutes: low ? 30 : 40,
      intensity: "niska",
      loadLevel: "low",
      blocks: [
        { label: "A", name: "Wyciskanie hantli / sztangi (kontrolowane)", detail: "3 x 6–8" },
        { label: "B", name: "Wiosłowanie / podciąganie", detail: "3 x 8" },
        { label: "C", name: "Pallof press + anti-rotation", detail: "3 x 10 / stronę" },
        { label: "D", name: "Plank / dead bug", detail: "3 rundy" },
      ],
      generatedBy: "engine",
      placementReason: reason(
        ctx,
        beforeMatch
          ? "MD-1 — brak ciężkiej siły nóg, tylko góra i core."
          : low
            ? "Niski readiness — siłownia zamieniona na wariant podtrzymujący."
            : "Odciążenie — górna część i core zamiast ciężkich nóg.",
      ),
      sourceRule: "gym/reduced_upper_core",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }

  // Warianty normalne.
  const variant = ctx.gymVariant ?? resolveDefaultGymVariant(resolveGoal(ctx, a));
  switch (variant) {
    case "upper":
      return normalizeGeneratedSession({
        category: "gym_strength",
        subcategory: "upper_strength",
        title: "Siła: górna część ciała",
        description: "Wyciskanie, ciągnięcie i core dla zrównoważenia obciążenia tygodnia.",
        durationMinutes: 50,
        intensity: "umiarkowana",
        loadLevel: "moderate",
        blocks: [
          { label: "A", name: "Wyciskanie sztangi / hantli", detail: "4 x 5–6 @ RIR 2" },
          { label: "B", name: "Podciąganie / wiosłowanie", detail: "4 x 6–8" },
          { label: "C", name: "Wyciskanie nad głowę", detail: "3 x 8" },
          { label: "D", name: "Core anti-rotation + carry", detail: "3 rundy" },
        ],
        generatedBy: "engine",
        placementReason: reason(ctx, "Wariant górny — rozłożenie obciążenia nóg w tygodniu."),
        sourceRule: "gym/upper_strength",
        athleteProfileApplied: true,
        safetyProfileApplied: true,
      });
    case "full_body":
      return normalizeGeneratedSession({
        category: "gym_strength",
        subcategory: "full_body_strength",
        title: "Siła: całe ciało",
        description: "Główny wzorzec dolny + push/pull + core w jednej jednostce.",
        durationMinutes: 55,
        intensity: "wysoka",
        loadLevel: "high",
        blocks: [
          { label: "A", name: "Przysiad / trap-bar", detail: "4 x 5 @ RIR 2" },
          { label: "B", name: "Wyciskanie", detail: "3 x 6" },
          { label: "C", name: "RDL / hip hinge", detail: "3 x 6–8" },
          { label: "D", name: "Wiosłowanie + core", detail: "3 rundy" },
        ],
        generatedBy: "engine",
        placementReason: reason(ctx, "Wariant całościowy przy ograniczonej liczbie dni."),
        sourceRule: "gym/full_body_strength",
        athleteProfileApplied: true,
        safetyProfileApplied: true,
      });
    case "power":
      return normalizeGeneratedSession({
        category: "gym_strength",
        subcategory: "power_maintenance",
        title: "Siła + moc: przysiad + skoki",
        description: "Kontrast siła–moc: główny wzorzec siłowy sparowany z akcentem mocy.",
        durationMinutes: 55,
        intensity: "wysoka",
        loadLevel: "high",
        blocks: [
          { label: "A1", name: "Przysiad", detail: "4 x 4 @ RIR 2" },
          { label: "A2", name: "CMJ / skok w dal", detail: "4 x 3, pełna regeneracja" },
          { label: "B", name: "RDL", detail: "3 x 6" },
          { label: "C", name: "Core + łydki", detail: "3 rundy" },
        ],
        generatedBy: "engine",
        placementReason: reason(ctx, "Blok siła + moc dla rozwiniętego zawodnika."),
        sourceRule: "gym/power_strength",
        athleteProfileApplied: true,
        safetyProfileApplied: true,
      });
    case "lower":
    default:
      return normalizeGeneratedSession({
        category: "gym_strength",
        subcategory: "lower_strength",
        title: "Siła: dolna część ciała",
        description: "Główny wzorzec dolny (przysiad/hinge), praca jednonóż, łańcuch tylny i core.",
        durationMinutes: 55,
        intensity: "wysoka",
        loadLevel: "high",
        blocks: [
          { label: "A", name: "Przysiad / trap-bar deadlift", detail: "4 x 5 @ RIR 2" },
          { label: "B", name: "Bułgarski przysiad", detail: "3 x 8 / nogę" },
          { label: "C", name: "RDL / nordic curl", detail: "3 x 6–8" },
          { label: "D", name: "Łydki + przywodziciele + core", detail: "3 rundy" },
        ],
        generatedBy: "engine",
        placementReason: reason(ctx, "Główna siła dolna w dniu oddalonym od meczu."),
        sourceRule: "gym/lower_strength",
        athleteProfileApplied: true,
        safetyProfileApplied: true,
      });
  }
}

function resolveDefaultGymVariant(
  goal: string,
): NonNullable<SessionGenContext["gymVariant"]> {
  const rules = getAthleteGoalRules(goal);
  if (rules.isSpeedGoal) return "power";
  return "lower";
}

// ---------------------------------------------------------------------------
// WYDOLNOŚĆ
// ---------------------------------------------------------------------------

export function createLowImpactEnduranceSession(
  ctx: SessionGenContext,
  _a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  void _a;
  return normalizeGeneratedSession({
    category: "endurance_conditioning",
    subcategory: "low_impact_conditioning",
    title: "Wydolność low-impact: rower / basen",
    description:
      "Praca tlenowa o niskim udarze (rower, basen lub crosstrainer). Buduje bazę " +
      "bez obciążania stawów i ścięgien — bezpieczne przy niskim readiness.",
    durationMinutes: 25,
    intensity: "niska",
    loadLevel: "low",
    blocks: [
      { name: "Rozgrzewka tlenowa", detail: "5 min spokojnie" },
      { name: "Rower / basen ciągły", detail: "15–20 min strefa 1–2" },
      { name: "Schłodzenie + mobilność", detail: "5 min" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Wydolność w wersji low-impact (niski readiness / regeneracja)."),
    sourceRule: "endurance/low_impact",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

export function createShortAerobicBlock(
  ctx: SessionGenContext,
  _a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  void _a;
  return normalizeGeneratedSession({
    category: "endurance_conditioning",
    subcategory: "short_aerobic_block",
    title: "Krótki blok tlenowy 20–30 min",
    description:
      "Krótka, kontrolowana praca tlenowa z lekkimi odcinkami technicznymi. " +
      "Utrzymuje bazę bez agresywnego HIIT.",
    durationMinutes: 25,
    intensity: "niska",
    loadLevel: "low",
    blocks: [
      { name: "Easy aerobic jog", detail: "12–15 min konwersacyjnie" },
      { name: "Krótkie odcinki techniczne z piłką", detail: "4–6 x 30 m spokojnie" },
      { name: "Mobilność + oddech", detail: "5 min" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Krótki blok tlenowy — youth-safe / MD-1 / regeneracja."),
    sourceRule: "endurance/short_aerobic",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

/**
 * Buduje sesję wydolnościową. Zwraca `null`, gdy dzień jest dniem klubowym
 * (endurance na dniu klubowym jest ZABLOKOWane) lub meczowym.
 */
export function createEnduranceSessionVariant(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession | null {
  // Twarda zasada: nie twórz endurance w dniu klubowym ani meczowym.
  if (ctx.hasClub || isMatchDay(ctx)) {
    return null;
  }

  const youth = isYouthOrBeginnerAthlete(a);
  const low = isLowReadiness(ctx, a);
  const beforeMatch = isDayBeforeMatch(ctx);
  const afterMatch = ctx.isDayAfterMatch === true;
  const goal = getAthleteGoalRules(resolveGoal(ctx, a));

  // Niski readiness → low-impact.
  if (low) {
    return createLowImpactEnduranceSession(ctx, a);
  }

  // Dzień po meczu → bieg regeneracyjny / low-impact.
  if (afterMatch) {
    return normalizeGeneratedSession({
      category: "endurance_conditioning",
      subcategory: "recovery_run",
      title: "Bieg regeneracyjny",
      description: "Bardzo spokojny bieg / rower dla zmniejszenia sztywności po meczu.",
      durationMinutes: 20,
      intensity: "niska",
      loadLevel: "low",
      blocks: [{ name: "Recovery jog / rower", detail: "15–20 min strefa 1" }],
      generatedBy: "engine",
      placementReason: reason(ctx, "Dzień po meczu — tylko lekka regeneracja tlenowa."),
      sourceRule: "endurance/recovery_run",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }

  // MD-1 lub youth/beginner → bez agresywnego HIIT.
  if (beforeMatch || youth) {
    return createShortAerobicBlock(ctx, a);
  }

  // Warianty normalne — dobór wg celu i wydolności.
  if (goal.isEnduranceGoal) {
    return normalizeGeneratedSession({
      category: "endurance_conditioning",
      subcategory: "extensive_intervals",
      title: "Wydolność: interwały ekstensywne",
      description:
        "Kontrolowane interwały tlenowe rozwijające bazę wydolnościową. " +
        "Objętość dobrana do świeżości i oddalenia od meczu.",
      durationMinutes: 45,
      intensity: "wysoka",
      loadLevel: "high",
      blocks: [
        { name: "Rozgrzewka", detail: "10 min + drills" },
        { name: "Interwały", detail: "4 x 3 min @ tempo, 2 min przerwy" },
        { name: "Schłodzenie", detail: "5 min" },
      ],
      generatedBy: "engine",
      placementReason: reason(ctx, "Cel wydolność — interwały ekstensywne w świeży dzień."),
      sourceRule: "endurance/extensive_intervals",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }

  return normalizeGeneratedSession({
    category: "endurance_conditioning",
    subcategory: "tempo_aerobic",
    title: "Wydolność: tempo tlenowe",
    description: "Kontrolowany bieg tempo / ciągły w strefie tlenowej dla podtrzymania bazy.",
    durationMinutes: 35,
    intensity: "umiarkowana",
    loadLevel: "moderate",
    blocks: [
      { name: "Rozgrzewka", detail: "8 min" },
      { name: "Tempo ciągłe / 6–8 x 100 m", detail: "kontrolowane, nie na maksa" },
      { name: "Schłodzenie", detail: "5 min" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Podtrzymanie bazy tlenowej — tempo aerobowe."),
    sourceRule: "endurance/tempo_aerobic",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

// ---------------------------------------------------------------------------
// SZYBKOŚĆ
// ---------------------------------------------------------------------------

function youthSpeedSession(ctx: SessionGenContext): GeneratedSession {
  return normalizeGeneratedSession({
    category: "speed_sprint",
    subcategory: "technical_speed",
    title: "Youth speed: technika przyspieszenia + koordynacja",
    description:
      "Szybkość techniczna, niska objętość: mechanika przyspieszenia, pierwszy krok, " +
      "postawa, praca ramion, technika hamowania i zmiany kierunku, gry reakcyjne. " +
      "Krótkie odcinki, pełna regeneracja, bez dużej objętości max velocity.",
    durationMinutes: 30,
    intensity: "umiarkowana",
    loadLevel: "low",
    blocks: [
      { name: "Rozgrzewka + skipy / drills", detail: "10 min" },
      { name: "Mechanika przyspieszenia + first step", detail: "4–6 x 10 m" },
      { name: "Technika hamowania / zmiana kierunku", detail: "4–6 powtórzeń" },
      { name: "Gra reakcyjna / koordynacja", detail: "5–8 min" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Youth-safe szybkość techniczna zamiast objętości max velocity."),
    sourceRule: "speed/youth_technical",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

export function createSpeedMicrodoseSession(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  if (isYouthOrBeginnerAthlete(a)) return youthSpeedSession(ctx);
  return normalizeGeneratedSession({
    category: "speed_sprint",
    subcategory: "speed_microdose",
    title: "Speed microdose: first step + braking",
    description:
      "Krótka dawka szybkości podtrzymująca ekspozycję bez zmęczenia: pierwszy krok, " +
      "krótkie przyspieszenia i technika hamowania.",
    durationMinutes: 20,
    intensity: "umiarkowana",
    loadLevel: "low",
    blocks: [
      { name: "Rozgrzewka", detail: "8 min" },
      { name: "First step / przyspieszenia", detail: "3 x 10 m" },
      { name: "Build-up + hamowanie", detail: "2 x 20 m" },
      { name: "Reakcja", detail: "2 x 15 m" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Microdose szybkości — niski readiness / MD-1 / dzień klubowy."),
    sourceRule: "speed/microdose",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

export function createAccelerationDecelerationSession(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  if (isYouthOrBeginnerAthlete(a)) return youthSpeedSession(ctx);
  return normalizeGeneratedSession({
    category: "speed_sprint",
    subcategory: "acceleration_deceleration",
    title: "Szybkość: przyspieszenie + hamowanie",
    description:
      "Mechanika przyspieszenia, first step z różnych startów oraz kontrolowane " +
      "hamowanie/wytracanie prędkości. Pełna regeneracja między powtórzeniami.",
    durationMinutes: 40,
    intensity: "wysoka",
    loadLevel: "high",
    blocks: [
      { name: "Rozgrzewka + drills", detail: "12 min" },
      { name: "Przyspieszenia", detail: "6 x 10 m / 4 x 15 m, różne starty" },
      { name: "Hamowanie / deceleration", detail: "4–6 x kontrolowane wytracanie" },
      { name: "Transfer z piłką", detail: "przyjęcie + wyjście z piłką" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Slot 1 szybkości — przyspieszenie + hamowanie."),
    sourceRule: "speed/acceleration_deceleration",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

export function createMaxVelocityCODSession(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  if (isYouthOrBeginnerAthlete(a)) return youthSpeedSession(ctx);
  // MD-1 — pełna max velocity zabroniona, degradacja do primer/microdose.
  if (isDayBeforeMatch(ctx)) {
    return normalizeGeneratedSession({
      category: "speed_sprint",
      subcategory: "speed_primer",
      title: "Speed primer: acceleration mechanics",
      description:
        "MD-1 — krótka aktywacja szybkości: 3–5 submaksymalnych przyspieszeń i " +
        "akcje z piłką. Bez pełnej max velocity.",
      durationMinutes: 20,
      intensity: "niska",
      loadLevel: "low",
      blocks: [
        { name: "Mobilność + aktywacja", detail: "8 min" },
        { name: "3–5 submaksymalnych przyspieszeń", detail: "10–20 m" },
        { name: "Akcje z piłką", detail: "pewność, krótkie" },
      ],
      generatedBy: "engine",
      placementReason: reason(ctx, "MD-1 — brak pełnej max velocity, tylko primer."),
      sourceRule: "speed/md1_primer",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }
  return normalizeGeneratedSession({
    category: "speed_sprint",
    subcategory: "max_velocity_cod",
    title: "Szybkość: prędkość max + zmiana kierunku",
    description:
      "Rozbudowana rozgrzewka, build-upy, loty (flying sprints) oraz zmiana kierunku " +
      "wykonywane w pełnej świeżości. Pełny odpoczynek 2–4 min.",
    durationMinutes: 45,
    intensity: "wysoka",
    loadLevel: "high",
    blocks: [
      { name: "Rozgrzewka + build-upy", detail: "15 min" },
      { name: "Flying sprints", detail: "2–4 x lot 20 m, pełna przerwa" },
      { name: "Zmiana kierunku / COD", detail: "4–6 x kontrolowane cięcia" },
      { name: "Transfer z piłką", detail: "sprint + akcja" },
    ],
    generatedBy: "engine",
    placementReason: reason(ctx, "Slot 2 szybkości — prędkość maksymalna + COD."),
    sourceRule: "speed/max_velocity_cod",
    athleteProfileApplied: true,
    safetyProfileApplied: true,
  });
}

/**
 * Główny generator szybkości. Slot decyduje o charakterze sesji:
 * slot 1 = acceleration/deceleration, slot 2 = max velocity/COD.
 * Youth/beginner, niski readiness i MD-1 sprowadzają sesję do bezpiecznego
 * wariantu technicznego / microdose / primer.
 */
export function createSpeedSessionVariant(
  ctx: SessionGenContext,
  a: AthleteTrainingProfile | null | undefined,
): GeneratedSession {
  if (isYouthOrBeginnerAthlete(a)) return youthSpeedSession(ctx);
  if (isLowReadiness(ctx, a)) return createSpeedMicrodoseSession(ctx, a);

  const slot = ctx.speedSlot ?? 1;
  if (slot === 2) return createMaxVelocityCODSession(ctx, a);
  return createAccelerationDecelerationSession(ctx, a);
}

// ---------------------------------------------------------------------------
// normalizeGeneratedSession — spójne countsAs* + tagi + wartości domyślne
// ---------------------------------------------------------------------------

export function normalizeGeneratedSession(
  session: Partial<GeneratedSession> & { category: SessionCategory },
): GeneratedSession {
  const category = session.category;
  const subcategory: SessionSubcategory = session.subcategory ?? "unknown";
  const intensity: Intensity = session.intensity ?? "umiarkowana";
  const loadLevel: SchedLoadLevel = session.loadLevel ?? deriveLoadLevel(category, intensity);

  const isGym = category === "gym_strength";
  const isEndurance = category === "endurance_conditioning";
  const isSpeed = category === "speed_sprint";

  // prehab / mobility / recovery NIE liczą się jako pełna siłownia.
  const countsAsStrength = isGym;
  const countsAsEndurance = isEndurance;
  const countsAsSpeed = isSpeed;

  const tags = new Set<string>(session.tags ?? []);
  tags.add(category);
  tags.add(subcategory);
  if (isGym && (subcategory === "lower_strength" || subcategory === "full_body_strength")) {
    if (intensity !== "niska") tags.add("heavy_legs");
  }
  if (isSpeed && (subcategory === "max_velocity" || subcategory === "max_velocity_cod" || subcategory === "flying_sprints")) {
    tags.add("max_velocity");
  }
  if (loadLevel === "high" || loadLevel === "very_high") tags.add("high_load");

  return {
    category,
    subcategory,
    title: session.title ?? "",
    description: session.description ?? "",
    durationMinutes: session.durationMinutes ?? 0,
    intensity,
    loadLevel,
    tags: [...tags],
    blocks: session.blocks ?? [],
    countsAsStrength,
    countsAsEndurance,
    countsAsSpeed,
    generatedBy: session.generatedBy ?? "engine",
    placementReason: session.placementReason ?? "",
    sourceRule: session.sourceRule ?? "",
    athleteProfileApplied: session.athleteProfileApplied ?? false,
    safetyProfileApplied: session.safetyProfileApplied ?? false,
    blockReason: session.blockReason,
  };
}

function deriveLoadLevel(category: SessionCategory, intensity: Intensity): SchedLoadLevel {
  if (category === "rest") return "none";
  if (category === "recovery_prehab" || category === "mobility") return "low";
  if (intensity === "wysoka") return "high";
  if (intensity === "umiarkowana") return "moderate";
  return "low";
}

// ---------------------------------------------------------------------------
// validateWorkoutForAthleteProfile — kontrola bezpieczeństwa treści sesji
// ---------------------------------------------------------------------------

export interface WorkoutValidationIssue {
  exercise: string;
  reason: string;
  blockedType: string;
}

export interface WorkoutValidationReport {
  ok: boolean;
  issues: WorkoutValidationIssue[];
  warnings: string[];
}

/**
 * Sprawdza, czy treść wygenerowanej sesji jest zgodna z profilem zawodnika:
 * — żadne ćwiczenie nie należy do zablokowanych typów (wiek/doświadczenie/kontuzja),
 * — MD-1 nie zawiera ciężkiej siły nóg, ciężkiego biegania ani pełnej max velocity.
 */
export function validateWorkoutForAthleteProfile(
  workout: GeneratedSession,
  a: AthleteTrainingProfile | null | undefined,
  ctx: SessionGenContext = {},
): WorkoutValidationReport {
  const issues: WorkoutValidationIssue[] = [];
  const warnings: string[] = [];
  const blocked = new Set(a?.blockedExerciseTypes ?? []);

  for (const block of workout.blocks ?? []) {
    const types = classifyExerciseTypes(block.name);
    const hit = types.find((t) => blocked.has(t));
    if (hit) {
      issues.push({
        exercise: block.name,
        blockedType: hit,
        reason: `Ćwiczenie należy do zablokowanego typu "${hit}" dla profilu zawodnika.`,
      });
    }
  }

  // Reguły przy meczu (MD-1).
  if (ctx.toMatch === 1) {
    if (workout.countsAsStrength && workout.tags.includes("heavy_legs")) {
      issues.push({
        exercise: workout.title,
        blockedType: "heavy_legs_md1",
        reason: "MD-1 — ciężka siła nóg jest niedozwolona dzień przed meczem.",
      });
    }
    if (workout.countsAsEndurance && (workout.loadLevel === "high" || workout.loadLevel === "very_high")) {
      issues.push({
        exercise: workout.title,
        blockedType: "heavy_running_md1",
        reason: "MD-1 — ciężkie bieganie jest niedozwolone dzień przed meczem.",
      });
    }
    if (workout.countsAsSpeed && workout.tags.includes("max_velocity")) {
      issues.push({
        exercise: workout.title,
        blockedType: "max_velocity_md1",
        reason: "MD-1 — pełna max velocity jest niedozwolona dzień przed meczem.",
      });
    }
  }

  // Endurance w dniu klubowym nie powinno istnieć.
  if (ctx.hasClub && workout.countsAsEndurance) {
    issues.push({
      exercise: workout.title,
      blockedType: "endurance_on_club_day",
      reason: "Endurance nie może być zaplanowane w dniu klubowym.",
    });
  }

  return { ok: issues.length === 0, issues, warnings };
}
