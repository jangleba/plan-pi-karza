import type {
  CurrentPitchFeeling,
  DesiredPitchFeeling,
} from "./types";

/** Maksymalna liczba odpowiedzi na jedno pytanie „Twój kierunek”. */
export const MAX_PITCH_FEELINGS = 2;

export const CURRENT_PITCH_FEELINGS: CurrentPitchFeeling[] = [
  "lacking_confidence",
  "stagnating",
  "lacking_speed",
  "lacking_duel_strength",
  "fading_late_in_match",
  "returning_after_break",
  "training_without_direction",
];

export const DESIRED_PITCH_FEELINGS: DesiredPitchFeeling[] = [
  "confident_in_decisions",
  "fast_and_light",
  "strong_in_duels",
  "calm_under_pressure",
  "ready_full_match",
  "prepared_for_higher_level",
];

export const CURRENT_PITCH_FEELING_LABELS: Record<CurrentPitchFeeling, string> = {
  lacking_confidence: "Brakuje mi pewności",
  stagnating: "Czuję, że stoję w miejscu",
  lacking_speed: "Brakuje mi szybkości",
  lacking_duel_strength: "Brakuje mi siły w pojedynkach",
  fading_late_in_match: "Tracę jakość pod koniec meczu",
  returning_after_break: "Wracam po przerwie",
  training_without_direction: "Trenuję bez konkretnego kierunku",
};

export const DESIRED_PITCH_FEELING_LABELS: Record<DesiredPitchFeeling, string> = {
  confident_in_decisions: "Pewnie w swoich decyzjach",
  fast_and_light: "Szybko i lekko w ruchu",
  strong_in_duels: "Mocno w pojedynkach",
  calm_under_pressure: "Spokojnie pod presją",
  ready_full_match: "Gotowy przez cały mecz",
  prepared_for_higher_level: "Przygotowany na wyższy poziom",
};

function normalize<T extends string>(allowed: readonly T[], value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const id = raw.trim() as T;
    if (!allowed.includes(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_PITCH_FEELINGS) break;
  }
  return out;
}

/** Czyści i ogranicza listę obecnych odczuć do maks. 2 unikalnych, prawidłowych wartości. */
export function normalizeCurrentPitchFeelings(value: unknown): CurrentPitchFeeling[] {
  return normalize(CURRENT_PITCH_FEELINGS, value);
}

/** Czyści i ogranicza listę docelowych odczuć do maks. 2 unikalnych, prawidłowych wartości. */
export function normalizeDesiredPitchFeelings(value: unknown): DesiredPitchFeeling[] {
  return normalize(DESIRED_PITCH_FEELINGS, value);
}

/**
 * Przełącza wybór: zaznaczone usuwa, nowe dodaje.
 * Zwraca `limitReached: true`, gdy próbowano wybrać trzecią odpowiedź.
 */
export function togglePitchFeeling<T extends string>(
  selected: readonly T[],
  id: T,
): { value: T[]; limitReached: boolean } {
  if (selected.includes(id)) {
    return { value: selected.filter((x) => x !== id), limitReached: false };
  }
  if (selected.length >= MAX_PITCH_FEELINGS) {
    return { value: [...selected], limitReached: true };
  }
  return { value: [...selected, id], limitReached: false };
}

export function currentPitchFeelingLabels(ids: readonly CurrentPitchFeeling[]): string[] {
  return ids.map((id) => CURRENT_PITCH_FEELING_LABELS[id]);
}

export function desiredPitchFeelingLabels(ids: readonly DesiredPitchFeeling[]): string[] {
  return ids.map((id) => DESIRED_PITCH_FEELING_LABELS[id]);
}
