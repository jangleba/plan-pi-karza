/**
 * planRules — centralny, rule-based config silnika planowania Loadwise.
 *
 * To jest jedno źródło prawdy dla reguł składania tygodnia. Generator (planEngine)
 * NIE używa gotowych szablonów tygodnia ani copy-paste układów — składa plan z
 * warstw reguł zdefiniowanych tutaj:
 *
 *   clubSchedule → matchSchedule → mainGoalRules → limitationRules →
 *   positionRules → trainingLevelRules → seasonRules → competitionLevelRules →
 *   gymAccessRules → conflictRules → progressionRules → validationRules
 *
 * NAJWAŻNIEJSZA ZASADA:
 *   mainGoal ZAWSZE definiuje obowiązkowy bodziec treningowy tygodnia.
 *   limitation NIE może nadpisać celu głównego — może tylko dodać mały bodziec
 *   wspierający albo zmniejszyć ryzyko.
 */

import type {
  Goal,
  Position,
  Level,
  SeasonPhase,
  CompetitionLevel,
  SecondaryLimiter,
  Intensity,
  SessionCategory,
  SessionDay,
} from "./types";

// ---------------------------------------------------------------------------
// 1–2. clubSchedule / matchSchedule — obsługiwane w planEngine (kalendarz).
//      Tu trzymamy tylko reguły, które od nich zależą.
// ---------------------------------------------------------------------------

/** Bezpieczny domyślny bodziec dla celu — używany zamiast fallbacku "regeneracja". */
export interface SafeDefaultSession {
  subcategory: string;
  label: string;
  intensity: Intensity;
}

/** 3. mainGoalRules — cel główny definiuje obowiązkowy bodziec tygodnia. */
export interface MainGoalRule {
  /** Kategorie sesji, które realizują cel główny (obowiązkowe). */
  mandatoryCategories: SessionCategory[];
  /** Minimalna liczba obowiązkowych bodźców celu w pełnym tygodniu. */
  mandatoryCount: number;
  /** Opis bodźca głównego (mainGoalFocus). */
  focusLabel: string;
  /**
   * Najbezpieczniejsza sensowna jednostka zgodna z celem — używana, gdy
   * generator nie wie, co zaplanować (ZAMIAST "Regeneracja i prehab").
   */
  safeDefault: SafeDefaultSession;
}

export const MAIN_GOAL_RULES: Record<Goal, MainGoalRule> = {
  speed: {
    mandatoryCategories: ["speed_sprint"],
    mandatoryCount: 2,
    focusLabel: "Szybkość i przyspieszenie",
    safeDefault: {
      subcategory: "sprint_mechanics",
      label: "Mechanika sprintu (mała objętość)",
      intensity: "umiarkowana",
    },
  },
  agility: {
    mandatoryCategories: ["speed_sprint"],
    mandatoryCount: 2,
    focusLabel: "Zwinność i zmiana kierunku (COD)",
    safeDefault: {
      subcategory: "deceleration",
      label: "Technika hamowania (niska intensywność)",
      intensity: "niska",
    },
  },
  strength: {
    mandatoryCategories: ["gym_strength"],
    mandatoryCount: 2,
    focusLabel: "Siła",
    safeDefault: {
      subcategory: "strength_maintenance",
      label: "Siła podtrzymująca / prewencja",
      intensity: "umiarkowana",
    },
  },
  power: {
    mandatoryCategories: ["gym_strength"],
    mandatoryCount: 2,
    focusLabel: "Moc",
    safeDefault: {
      subcategory: "power_maintenance",
      label: "Primer mocy (mała objętość)",
      intensity: "umiarkowana",
    },
  },
  endurance: {
    mandatoryCategories: ["endurance_conditioning"],
    mandatoryCount: 2,
    focusLabel: "Wydolność",
    safeDefault: {
      subcategory: "easy_aerobic",
      label: "Lekkie aerobowe / tempo / interwały piłkarskie",
      intensity: "umiarkowana",
    },
  },
  mobility: {
    mandatoryCategories: ["mobility"],
    mandatoryCount: 2,
    focusLabel: "Mobilność i jakość ruchu",
    safeDefault: {
      subcategory: "mobility",
      label: "Mobilność ukierunkowana",
      intensity: "niska",
    },
  },
  general: {
    mandatoryCategories: ["gym_strength", "speed_sprint", "endurance_conditioning"],
    mandatoryCount: 3,
    focusLabel: "Rozwój ogólny (siła + szybkość + wydolność)",
    safeDefault: {
      subcategory: "easy_aerobic",
      label: "Lekkie aerobowe / tempo",
      intensity: "umiarkowana",
    },
  },
  matchready: {
    mandatoryCategories: ["speed_sprint"],
    mandatoryCount: 1,
    focusLabel: "Gotowość meczowa (świeżość + ostrość)",
    safeDefault: {
      subcategory: "speed_microdose",
      label: "Mikrodawka szybkości",
      intensity: "umiarkowana",
    },
  },
  return: {
    mandatoryCategories: ["endurance_conditioning"],
    mandatoryCount: 1,
    focusLabel: "Powrót do treningu (kontrolowany, bez bólu)",
    safeDefault: {
      subcategory: "low_impact_conditioning",
      label: "Low-impact aerobowe (rower/basen)",
      intensity: "niska",
    },
  },
};

/** 4. limitationRules — limiter dodaje wsparcie lub zmniejsza ryzyko, NIE nadpisuje celu. */
export interface LimitationRule {
  /** Mały bodziec wspierający dokładany do tygodnia (nie zastępuje celu). */
  supportCategory: SessionCategory | null;
  /** Krótki opis modyfikacji ryzyka. */
  riskNote: string;
  /** Czy limiter wymusza warianty low-impact / ostrożne. */
  forcesLowImpact: boolean;
}

export const LIMITATION_RULES: Record<SecondaryLimiter, LimitationRule> = {
  speed: { supportCategory: "speed_sprint", riskNote: "Dodaj mikrodawkę szybkości.", forcesLowImpact: false },
  strength: { supportCategory: "gym_strength", riskNote: "Dodaj krótki blok siły podtrzymującej.", forcesLowImpact: false },
  endurance: { supportCategory: "endurance_conditioning", riskNote: "Dodaj lekką jednostkę aerobową.", forcesLowImpact: false },
  cod: { supportCategory: "speed_sprint", riskNote: "Dodaj technikę hamowania / COD.", forcesLowImpact: false },
  power: { supportCategory: "gym_strength", riskNote: "Dodaj krótki primer mocy.", forcesLowImpact: false },
  ball: { supportCategory: "other", riskNote: "Dodaj lekką technikę z piłką.", forcesLowImpact: false },
  fatigue: { supportCategory: null, riskNote: "Zmniejsz objętość, chroń następstwo ciężkich dni.", forcesLowImpact: true },
  return: { supportCategory: null, riskNote: "Warianty low-impact, progresja jedną zmienną naraz.", forcesLowImpact: true },
};

/** 5. positionRules — akcent pozycyjny (nie zmienia celu głównego). */
export const POSITION_RULES: Record<Position, { accent: string }> = {
  goalkeeper: { accent: "Reakcja 1–5 m, praca nóg, lateralne odepchnięcia." },
  defender: { accent: "Bieg wsteczny→sprint, biegi ratunkowe, pierwsze podanie." },
  midfielder: { accent: "Reakcja 5–15 m, skanowanie, wytrzymałość powtarzalnego wysiłku." },
  forward: { accent: "Pierwszy krok, biegi po łuku, wykończenie po sprincie." },
};

/** 6. trainingLevelRules — poziom steruje złożonością i intensywnością. */
export const LEVEL_RULES: Record<Level, { maxHighDays: number; allowsMaxVelocity: boolean; allowsHIIT: boolean }> = {
  beginner: { maxHighDays: 1, allowsMaxVelocity: false, allowsHIIT: false },
  intermediate: { maxHighDays: 2, allowsMaxVelocity: true, allowsHIIT: true },
  advanced: { maxHighDays: 3, allowsMaxVelocity: true, allowsHIIT: true },
  elite: { maxHighDays: 3, allowsMaxVelocity: true, allowsHIIT: true },
};

/** 7. seasonRules — okres sezonu steruje kompletnością/intensywnością tygodnia. */
export const SEASON_RULES: Record<SeasonPhase, { loadFactor: number; note: string }> = {
  offseason: { loadFactor: 1.05, note: "Poza sezonem: pełny rozwój." },
  preseason: { loadFactor: 1.1, note: "Przedsezon: budowanie bazy i intensywności." },
  inseason: { loadFactor: 0.9, note: "W sezonie: freshness, ostrość, utrzymanie." },
  transition: { loadFactor: 0.7, note: "Okres przejściowy: lżej, mobilność." },
  return_injury: { loadFactor: 0.6, note: "Powrót po kontuzji: ostrożna progresja." },
};

/** 8. competitionLevelRules — wyższy poziom rozgrywkowy = bardziej zorganizowany plan. */
export const COMPETITION_LEVEL_RULES: Record<CompetitionLevel, { loadFactor: number }> = {
  academy: { loadFactor: 0.9 },
  b_klasa: { loadFactor: 0.9 },
  a_klasa: { loadFactor: 0.95 },
  okregowka: { loadFactor: 1.0 },
  iv_liga: { loadFactor: 1.0 },
  iii_liga: { loadFactor: 1.05 },
  ii_liga_plus: { loadFactor: 1.1 },
  semi_pro: { loadFactor: 1.1 },
  pro: { loadFactor: 1.15 },
};

/** 9. gymAccessRules — brak siłowni ⇒ wzorce z masą ciała / sprzętem domowym. */
export const GYM_ACCESS_RULES = {
  requiresGymForHeavyStrength: true,
  fallbackWhenNoGym: {
    subcategory: "bodyweight_strength",
    label: "Siła z masą ciała / sprzęt domowy",
  },
} as const;

/** 10. conflictRules — twarde zakazy kombinacji. */
export const CONFLICT_RULES = {
  noSpeedDayAfterSpeedDay: true,
  minGapDaysBetweenSpeed: 1,
  noDuplicateSpeedSameDay: true,
  noEnduranceOnClubDay: true,
  noHardConditioningMDminus1: true,
  noHeavyLowerBodyMDminus1: true,
} as const;

/** 11. progressionRules — 4-tygodniowy blok z rosnącym obciążeniem i deloadem. */
export const PROGRESSION_RULES = {
  blockLength: 4,
  deloadWeek: 4,
  weekThemes: [
    "Wejście w rytm",
    "Budowanie obciążenia",
    "Najmocniejszy tydzień",
    "Deload / świeżość",
  ] as const,
  /**
   * Względne cele obciążenia w bloku. Muszą spełniać:
   *   w1 < w2 < w3 oraz w4 < w3, a jednocześnie w4 > 0 (deload nie jest pusty).
   */
  loadMultipliers: [0.82, 0.93, 1.08, 0.74] as const,
};

/** 12. validationRules — twarde minima, których tydzień musi dopilnować. */
export const VALIDATION_RULES = {
  minEndurancePerFullWeek: 1,
  /** Regeneracja/prehab nie może dominować bez powodu. */
  recoveryMustNotDominate: true,
  /** Wynik obciążenia musi rosnąć w1<w2<w3 i maleć w4<w3. */
  enforceBlockProgression: true,
} as const;

// ---------------------------------------------------------------------------
// Load scoring — jednolity, deterministyczny wynik obciążenia.
// ---------------------------------------------------------------------------

const INTENSITY_WEIGHT: Record<Intensity, number> = {
  niska: 1,
  umiarkowana: 2,
  wysoka: 3.2,
};

function categoryWeight(cat: SessionCategory | undefined): number {
  switch (cat) {
    case "match":
      return 1.5;
    case "club":
      return 1.25;
    case "gym_strength":
    case "speed_sprint":
      return 1.15;
    case "endurance_conditioning":
      return 1.0;
    case "recovery_prehab":
    case "mobility":
      return 0.35;
    case "rest":
      return 0;
    default:
      return 0.9;
  }
}

/** Wynik obciążenia pojedynczej sesji (wraz z drugą sesją dnia). */
export function computeSessionLoad(session: SessionDay): number {
  const cat = session.classification?.category;
  const base =
    INTENSITY_WEIGHT[session.intensity] * (session.durationMin / 30) * categoryWeight(cat) * 10;
  const second = session.secondSession ? computeSessionLoad(session.secondSession) : 0;
  return base + second;
}

/** Sumaryczny wynik obciążenia tygodnia (zaokrąglony). */
export function computeWeeklyLoadScore(sessions: SessionDay[]): number {
  return Math.round(sessions.reduce((sum, s) => sum + computeSessionLoad(s), 0));
}

// ---------------------------------------------------------------------------
// Klasyfikacja sesji względem celu głównego.
// ---------------------------------------------------------------------------

export type SessionRole = "mandatory" | "support" | "recovery";

/** Rola sesji w tygodniu względem celu głównego. */
export function sessionRoleForGoal(session: SessionDay, goal: Goal): SessionRole {
  const cat = session.classification?.category;
  // Cel główny ma priorytet: sesja realizująca mainGoal zawsze liczy się jako
  // obowiązkowy bodziec — nawet jeśli jej kategoria (np. mobility) byłaby inaczej
  // traktowana jako regeneracja.
  if (cat && MAIN_GOAL_RULES[goal].mandatoryCategories.includes(cat)) return "mandatory";
  if (cat === "rest") return "recovery";
  if (cat === "recovery_prehab" || cat === "mobility") return "recovery";
  return "support";
}

export interface WeekRoleCounts {
  mandatory: number;
  support: number;
  recovery: number;
  endurance: number;
}

/** Zlicza role sesji w tygodniu. Sesje klubowe/mecz liczą się jako support/mandatory wg kategorii. */
export function countWeekRoles(sessions: SessionDay[], goal: Goal): WeekRoleCounts {
  const counts: WeekRoleCounts = { mandatory: 0, support: 0, recovery: 0, endurance: 0 };
  for (const s of sessions) {
    if (s.dayType === "rest" && s.durationMin === 0) continue; // czysty dzień wolny nie liczy się
    const role = sessionRoleForGoal(s, goal);
    counts[role]++;
    if (s.classification?.category === "endurance_conditioning") counts.endurance++;
  }
  return counts;
}

/**
 * Kategoria sesji, która realizuje ograniczenie (limitation/secondaryLimiter).
 * null = limiter nie wymaga dodatkowego bodźca (np. zmęczenie / powrót po urazie).
 */
export function limitationSupportCategory(
  limitation: SecondaryLimiter | null,
): SessionCategory | null {
  if (!limitation) return null;
  return LIMITATION_RULES[limitation].supportCategory;
}

/** Ile sesji w tygodniu realizuje kategorię ograniczenia. */
export function countLimitationSessions(
  sessions: SessionDay[],
  limitation: SecondaryLimiter | null,
): number {
  const cat = limitationSupportCategory(limitation);
  if (!cat) return 0;
  let n = 0;
  for (const s of sessions) {
    if (s.dayType === "rest" && s.durationMin === 0) continue;
    if (s.classification?.category === cat) n++;
    if (s.secondSession?.classification?.category === cat) n++;
  }
  return n;
}

/**
 * Wymagana liczba sesji w kategorii ograniczenia.
 * Zasada: mainGoal wymaga min. `mandatoryCount` bodźców głównych, a limiter
 * dokłada MINIMUM 1 sesję PONAD to minimum. Gdy kategoria limitera pokrywa się
 * z kategorią celu głównego, wymagamy `mandatoryCount + 1` sesji tej kategorii.
 */
export function requiredLimitationSessions(goal: Goal, limitation: SecondaryLimiter | null): number {
  const cat = limitationSupportCategory(limitation);
  if (!cat) return 0;
  const rule = MAIN_GOAL_RULES[goal];
  return rule.mandatoryCategories.includes(cat) ? rule.mandatoryCount + 1 : 1;
}

// ---------------------------------------------------------------------------
// validateGeneratedWeek — twarda walidacja tygodnia.
// ---------------------------------------------------------------------------

export interface WeekValidationContext {
  goal: Goal;
  isFullWeek: boolean; // czy tydzień ma 7 dni (pełny)
  hasMatch: boolean;
  blockWeek: number; // 1..4
  /** Ograniczenie zawodnika (secondaryLimiter) — dokłada min. 1 bodziec ponad cel. */
  limitation?: SecondaryLimiter | null;
}

export interface WeekValidationResult {
  status: "valid" | "invalid";
  errors: string[];
}

/**
 * Waliduje wygenerowany tydzień. Tydzień, który nie przejdzie walidacji,
 * NIE może zostać pokazany użytkownikowi — musi zostać przebudowany.
 */
export function validateGeneratedWeek(
  sessions: SessionDay[],
  ctx: WeekValidationContext,
): WeekValidationResult {
  const errors: string[] = [];
  const rule = MAIN_GOAL_RULES[ctx.goal];
  const counts = countWeekRoles(sessions, ctx.goal);

  if (ctx.isFullWeek) {
    // 5. Każdy mainGoal musi mieć min. `mandatoryCount` obowiązkowych bodźców
    //    (dla większości celów = 2 jednostki powiązane z celem).
    if (counts.mandatory < rule.mandatoryCount) {
      errors.push(`missing-mandatory-goal-session (${rule.focusLabel})`);
    }
    // Limiter dokłada MINIMUM 1 sesję ponad minimum celu głównego.
    const reqLimit = requiredLimitationSessions(ctx.goal, ctx.limitation ?? null);
    if (reqLimit > 0 && countLimitationSessions(sessions, ctx.limitation ?? null) < reqLimit) {
      errors.push("missing-limitation-support");
    }
    // Twarde minimum wydolności.
    if (counts.endurance < VALIDATION_RULES.minEndurancePerFullWeek) {
      errors.push("missing-endurance");
    }
    // 2. Recovery/prehab nie może dominować planu bez powodu.
    if (
      VALIDATION_RULES.recoveryMustNotDominate &&
      !ctx.hasMatch &&
      counts.recovery > counts.mandatory + counts.support
    ) {
      errors.push("recovery-dominates");
    }
  }

  return { status: errors.length === 0 ? "valid" : "invalid", errors };
}

// ---------------------------------------------------------------------------
// Tematy i cele tygodnia.
// ---------------------------------------------------------------------------

/** Pozycja tygodnia w 4-tygodniowym bloku (1..4). */
export function blockWeekOf(weekNumberZeroBased: number): number {
  return (weekNumberZeroBased % PROGRESSION_RULES.blockLength) + 1;
}

/** Temat tygodnia wg pozycji w bloku. */
export function weekThemeFor(blockWeek: number): string {
  return PROGRESSION_RULES.weekThemes[blockWeek - 1] ?? PROGRESSION_RULES.weekThemes[0];
}

/** Cel/relatywny mnożnik obciążenia tygodnia w bloku. */
export function loadMultiplierFor(blockWeek: number): number {
  return PROGRESSION_RULES.loadMultipliers[blockWeek - 1] ?? 1;
}
