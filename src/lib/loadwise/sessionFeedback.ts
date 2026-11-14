import type { ActivityTag, DurationSource, SessionCompletion } from "./types";

/** Wersja formularza feedbacku po sesji (RPE 1–10, tagi, minuty meczu). */
export const FEEDBACK_VERSION = 1;
/** Jawne założenie produktu dla nowego ukończonego treningu klubowego; nie jest pomiarem. */
export const CLUB_DEFAULT_MINUTES = 90;
export const MATCH_MINUTES_MAX = 180;
export const ACTIVITY_TAGS: readonly ActivityTag[] = [
  "running_endurance",
  "technical",
  "tactical_game",
];
export const ACTIVITY_TAG_LABELS: Record<ActivityTag, string> = {
  running_endurance: "Biegowy / wydolnościowy",
  technical: "Techniczny",
  tactical_game: "Taktyka / gra z piłką",
};

type TagSource = Pick<SessionCompletion, "activityTags" | "activityType">;

export function normalizeActivityTags(value: unknown): ActivityTag[] | null {
  if (!Array.isArray(value)) return null;
  const set = new Set<ActivityTag>();
  for (const item of value) {
    if ((ACTIVITY_TAGS as readonly unknown[]).includes(item)) set.add(item as ActivityTag);
  }
  return ACTIVITY_TAGS.filter((tag) => set.has(tag));
}

/** Zgodność wsteczna: stary activity_type zawsze zapisywany obok typowanych tagów. */
export function activityTypeFromTags(
  tags: readonly ActivityTag[],
): NonNullable<SessionCompletion["activityType"]> | null {
  if (tags.length === 0) return null;
  if (tags.length === 1 && tags[0] === "running_endurance") return "running_endurance";
  if (tags.includes("running_endurance")) return "mixed";
  return "technical";
}

/**
 * Charakter wysiłku z nowych tagów albo ze starego activityType.
 * running_endurance → praca biegowa, technical → praca z piłką; mixed niczego nie potwierdza.
 */
export function effectiveActivityTags(source: TagSource): ActivityTag[] {
  if (source.activityTags != null) return normalizeActivityTags(source.activityTags) ?? [];
  if (source.activityType === "running_endurance") return ["running_endurance"];
  if (source.activityType === "technical") return ["technical"];
  return [];
}

export function hasRunningWork(source: TagSource): boolean {
  return effectiveActivityTags(source).includes("running_endurance");
}

export function isValidMatchMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MATCH_MINUTES_MAX
  );
}

/** Nowe odpowiedzi to 1–10. Stare rekordy z 0 pozostają czytelne, ale nie są zapisywane ponownie. */
export function isNewRpe(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}
export function isStoredRpe(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10;
}

export interface EstimatedLoad {
  /** null = brak danych (np. brak RPE, brak minut gry); nigdy 0 z braku odpowiedzi. */
  value: number | null;
  minutes: number | null;
  basis: "session_minutes" | "club_default_minutes" | "match_minutes_played" | "none";
  /** true, gdy czas pochodzi z założenia produktu, a nie z pomiaru lub wpisu. */
  minutesAssumed: boolean;
}

/**
 * sRPE-like szacunek: minuty × RPE. Dla klubu minuty to założenie 90, dla meczu — minuty gry
 * (bez rozgrzewki). To oszacowanie, nie pomiar pełnego kosztu sesji.
 */
export function estimatedSessionLoad(
  completion: Pick<
    SessionCompletion,
    "completed" | "rpe" | "durationMin" | "durationSource" | "matchMinutesPlayed"
  >,
  dayType: string | undefined,
): EstimatedLoad {
  const none: EstimatedLoad = { value: null, minutes: null, basis: "none", minutesAssumed: false };
  if (!completion.completed || !isStoredRpe(completion.rpe)) return none;
  if (dayType === "match") {
    const minutes = completion.matchMinutesPlayed;
    if (!isValidMatchMinutes(minutes)) return none;
    return {
      value: minutes * completion.rpe,
      minutes,
      basis: "match_minutes_played",
      minutesAssumed: false,
    };
  }
  const minutes = completion.durationMin;
  if (typeof minutes !== "number" || !(minutes > 0)) return none;
  const assumed = completion.durationSource === "club_default";
  return {
    value: minutes * completion.rpe,
    minutes,
    basis: assumed ? "club_default_minutes" : "session_minutes",
    minutesAssumed: assumed,
  };
}

/** Czas klubu: zachowuje rzeczywisty historyczny wpis; domyślne 90 min tylko dla nowego ukończenia. */
export function clubDuration(
  existing: Pick<SessionCompletion, "durationMin" | "durationSource"> | undefined,
): { durationMin: number; durationSource: DurationSource } {
  if (existing?.durationMin != null && existing.durationSource !== "club_default")
    return {
      durationMin: existing.durationMin,
      durationSource: existing.durationSource ?? "user",
    };
  return { durationMin: CLUB_DEFAULT_MINUTES, durationSource: "club_default" };
}
