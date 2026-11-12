import { classifySession } from "./sessionClassification";
import type { SessionDay } from "./types";

/**
 * Rodzaj obciążenia sesji. Sprint, wydolność, lekki bieg, ciężkie nogi i góra
 * ciała to różne bodźce: inaczej męczą, inaczej się łączą w jednym dniu i
 * wymagają innego odstępu. Silnik nie traktuje ich jak jednakowej „sesji”.
 */
export type SessionLoadKind =
  | "sprint" // szybkość, akceleracja, zmiana kierunku — wymaga świeżości
  | "heavy_legs" // siła całego ciała / dolnych partii, moc
  | "upper" // góra ciała i tułów — nie obciąża nóg
  | "hard_endurance" // interwały, tempo, wytrzymałość specjalna
  | "easy_run" // spokojny bieg tlenowy, regeneracyjny
  | "ball" // piłka / technika
  | "support" // prehab, mobilność, aktywacja, regeneracja
  | "club"
  | "match"
  | "rest";

const UPPER_SUBCATEGORIES = new Set(["upper_strength", "core_strength", "stability_coordination"]);
const EASY_RUN_SUBCATEGORIES = new Set([
  "easy_run",
  "easy_aerobic",
  "zone2_aerobic",
  "recovery_run",
  "short_aerobic_block",
  "low_impact_conditioning",
]);

export function sessionLoadKind(session: SessionDay): SessionLoadKind {
  const { category, subcategory } = classifySession(session);
  switch (category) {
    case "club":
      return "club";
    case "match":
      return "match";
    case "rest":
      return "rest";
    case "speed_sprint":
      return "sprint";
    case "gym_strength":
      return UPPER_SUBCATEGORIES.has(subcategory) ? "upper" : "heavy_legs";
    case "endurance_conditioning":
      return EASY_RUN_SUBCATEGORIES.has(subcategory) || session.intensity === "niska"
        ? "easy_run"
        : "hard_endurance";
    case "recovery_prehab":
    case "mobility":
      return "support";
    default:
      return subcategory === "ball_technical" ? "ball" : "support";
  }
}

/**
 * Kolejność w jednym dniu: najpierw to, co wymaga świeżości układu nerwowego
 * (sprint), potem siła, potem wydolność, na końcu lekkie i wspierające.
 */
const DAY_ORDER: Record<SessionLoadKind, number> = {
  sprint: 0,
  heavy_legs: 1,
  upper: 2,
  hard_endurance: 3,
  ball: 4,
  easy_run: 5,
  support: 6,
  club: 9,
  match: 9,
  rest: 9,
};

export function dayOrderRank(session: SessionDay): number {
  return DAY_ORDER[sessionLoadKind(session)];
}

/** Rodzaje, które mocno obciążają nogi — nie stawiamy ich dzień po dniu bez potrzeby. */
export function loadsLegsHard(kind: SessionLoadKind): boolean {
  return kind === "sprint" || kind === "heavy_legs" || kind === "hard_endurance";
}

/**
 * Ustawia dwie własne sesje dnia w kolejności obciążenia (sprint przed siłą,
 * siła przed wydolnością, lekki bieg na końcu). Dni z klubem lub meczem mają
 * stałą godzinę zajęć i zostają bez zmian.
 */
export function orderDaySessionsByLoad(day: SessionDay): SessionDay {
  const second = day.secondSession;
  if (!second) return day;
  if (day.executionProtected || second.executionProtected) return day;
  const primaryKind = sessionLoadKind(day);
  if (primaryKind === "club" || primaryKind === "match" || primaryKind === "rest") return day;
  if (dayOrderRank(second) >= dayOrderRank(day)) return day;
  const { secondSession: _ignored, ...primaryOnly } = day;
  const promoted: SessionDay = {
    ...second,
    date: day.date,
    dayName: day.dayName,
    dayOfWeek: day.dayOfWeek,
    mdLabel: day.mdLabel,
    mdRelation: day.mdRelation,
    dayDbId: day.dayDbId,
    planDbId: day.planDbId,
    cycleId: day.cycleId,
    weekMeta: day.weekMeta,
    slotLabel: day.slotLabel,
    isSupplemental: false,
    sessionId: day.sessionId,
    dbId: day.dbId,
  };
  const demoted: SessionDay = {
    ...primaryOnly,
    slotLabel: second.slotLabel,
    isSupplemental: true,
    sessionId: second.sessionId,
    dbId: second.dbId,
    secondSession: null,
  };
  return { ...promoted, secondSession: demoted };
}
