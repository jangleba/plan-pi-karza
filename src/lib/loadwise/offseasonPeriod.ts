import { profileMatchDates } from "./matchSchedule";
import type { Profile, SeasonPhase } from "./types";

/**
 * Okres bez meczów ligowych dzieli się na trzy etapy:
 *  - roztrenowanie: 2–3 tygodnie po ostatnim meczu, lekko, bez dni podwójnych;
 *  - baza: pełny rozwój (siła, szybkość, tlen, piłka);
 *  - przedsezon: ostatnie ~5 tygodni przed pierwszym meczem, więcej
 *    intensywności i specyficznej wytrzymałości, mniej objętości.
 * Etap wynika z dat meczów (ostatni / najbliższy), a gdy ich brak — z okresu
 * wybranego w profilu.
 */
export type OffseasonStage = "transition" | "base" | "preseason";

/** Ile dni po ostatnim meczu trwa roztrenowanie. */
export const TRANSITION_DAYS = 21;
/** Na ile dni przed pierwszym meczem zaczyna się przedsezon. */
export const PRESEASON_DAYS = 35;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000,
  );
}

export function stageOfPhase(phase: SeasonPhase): OffseasonStage | null {
  if (phase === "transition") return "transition";
  if (phase === "offseason") return "base";
  if (phase === "preseason") return "preseason";
  return null;
}

export function phaseOfStage(stage: OffseasonStage): SeasonPhase {
  return stage === "transition" ? "transition" : stage === "base" ? "offseason" : "preseason";
}

/** Poniedziałek tygodnia, do którego należy data (etap liczymy od poniedziałku). */
export function mondayOf(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

type StageProfile = Pick<
  Profile,
  "seasonPhase" | "matchDate" | "matchDates" | "weeklyMatches" | "usualMatchDay"
>;

/**
 * Etap okresu bez meczów z profilu. Zawodnik z cotygodniowymi meczami gra w
 * sezonie, nawet gdy kalendarz podpowiada przerwę — wtedy etapów nie ma.
 */
export function offseasonStageOf(
  profile: Pick<Profile, "seasonPhase" | "weeklyMatches" | "usualMatchDay">,
): OffseasonStage | null {
  if (profile.weeklyMatches || typeof profile.usualMatchDay === "number") return null;
  return stageOfPhase(profile.seasonPhase);
}

/** Etap okresu bez meczów dla tygodnia, do którego należy `dateIso`. */
export function offseasonStageForWeek(
  profile: StageProfile,
  dateIso: string,
): OffseasonStage | null {
  const chosen = offseasonStageOf(profile);
  if (!chosen) return null;
  const weekStartIso = mondayOf(dateIso);
  const dates = profileMatchDates(profile);
  const next = dates.find((date) => date >= weekStartIso);
  const last = dates.filter((date) => date < weekStartIso).at(-1);
  if (next && daysBetween(weekStartIso, next) <= PRESEASON_DAYS) return "preseason";
  if (last && chosen !== "preseason") {
    return daysBetween(last, weekStartIso) < TRANSITION_DAYS ? "transition" : "base";
  }
  return chosen;
}

/** Okres sezonu, którego silnik używa dla danego tygodnia. */
export function seasonPhaseForWeek(profile: StageProfile, dateIso: string): SeasonPhase {
  const stage = offseasonStageForWeek(profile, dateIso);
  return stage ? phaseOfStage(stage) : profile.seasonPhase;
}

/** Grupa rozwojowa: młodsi (do 15 lat) i początkujący dostają prostszy, lżejszy tydzień. */
export type OffseasonGroup = "u14" | "developing" | "intermediate" | "advanced" | "elite";

export function offseasonGroup(profile: Pick<Profile, "age" | "level">): OffseasonGroup {
  if (profile.age < 14) return "u14";
  if (profile.age < 16 || profile.level === "beginner") return "developing";
  return profile.level;
}

/**
 * Liczba własnych sesji i dni podwójnych w tygodniu bez meczów — według wieku
 * i poziomu zawodnika (nie poziomu ligi, bo poza sezonem liga nie gra).
 */
export function offseasonWeekLoad(
  profile: Pick<Profile, "age" | "level">,
  stage: OffseasonStage,
): { cap: number; maxDoubles: number } {
  const group = offseasonGroup(profile);
  if (stage === "transition") {
    return { cap: group === "u14" || group === "developing" ? 2 : 3, maxDoubles: 0 };
  }
  // Minimum każdego pełnego tygodnia to siła, szybkość, wytrzymałość i piłka,
  // więc młodsi i początkujący mają 4 sesje (siła raz w tygodniu).
  const cap = { u14: 4, developing: 4, intermediate: 5, advanced: 6, elite: 6 }[group];
  const doubles = { u14: 0, developing: 0, intermediate: 2, advanced: 3, elite: 4 }[group];
  // Przedsezon: intensywność rośnie, więc objętość (dni podwójne) maleje.
  return { cap, maxDoubles: stage === "preseason" ? Math.max(0, doubles - 1) : doubles };
}

/**
 * Doświadczenie siłowe do reguł tygodnia: jawna odpowiedź z profilu, a bez niej
 * poziom piłkarski „początkujący” (tak jak wyprowadza je silnik siłowy).
 */
export function requirementGymExperience(
  profile: Pick<Profile, "gymExperienceLevel" | "level">,
): Profile["gymExperienceLevel"] {
  return profile.gymExperienceLevel ?? (profile.level === "beginner" ? "beginner" : undefined);
}
