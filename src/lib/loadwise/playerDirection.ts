import type { CurrentPitchFeeling, DesiredPitchFeeling, Profile } from "./types";

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
  "slow_to_turn",
  "feeling_stiff",
];

export const DESIRED_PITCH_FEELINGS: DesiredPitchFeeling[] = [
  "confident_in_decisions",
  "fast_and_light",
  "strong_in_duels",
  "calm_under_pressure",
  "ready_full_match",
  "prepared_for_higher_level",
  "explosive_first_steps",
  "agile_in_turns",
  "loose_in_movement",
];

export const CURRENT_PITCH_FEELING_LABELS: Record<CurrentPitchFeeling, string> = {
  lacking_confidence: "Brakuje mi pewności",
  stagnating: "Czuję, że stoję w miejscu",
  lacking_speed: "Brakuje mi szybkości",
  lacking_duel_strength: "Brakuje mi siły w pojedynkach",
  fading_late_in_match: "Tracę jakość pod koniec meczu",
  returning_after_break: "Wracam po przerwie",
  training_without_direction: "Trenuję bez konkretnego kierunku",
  slow_to_turn: "Wolno hamuję i zmieniam kierunek",
  feeling_stiff: "Czuję się sztywny",
};

export const DESIRED_PITCH_FEELING_LABELS: Record<DesiredPitchFeeling, string> = {
  confident_in_decisions: "Pewnie w swoich decyzjach",
  fast_and_light: "Szybko i lekko w ruchu",
  strong_in_duels: "Mocno w pojedynkach",
  calm_under_pressure: "Spokojnie pod presją",
  ready_full_match: "Gotowy przez cały mecz",
  prepared_for_higher_level: "Przygotowany na wyższy poziom",
  explosive_first_steps: "Wybuchowo na pierwszych metrach",
  agile_in_turns: "Zwinnie przy zmianie kierunku",
  loose_in_movement: "Swobodnie, bez sztywności",
};

/** Answers offered in onboarding (each points to one quality of the plan). */
export const ONBOARDING_CURRENT_FEELINGS: CurrentPitchFeeling[] = [
  "lacking_speed",
  "lacking_duel_strength",
  "fading_late_in_match",
  "slow_to_turn",
  "feeling_stiff",
  "lacking_confidence",
];

export const ONBOARDING_DESIRED_FEELINGS: DesiredPitchFeeling[] = [
  "fast_and_light",
  "strong_in_duels",
  "explosive_first_steps",
  "agile_in_turns",
  "ready_full_match",
  "loose_in_movement",
  "confident_in_decisions",
];

/** Short labels for the onboarding cards. */
export const CURRENT_FEELING_SHORT: Partial<Record<CurrentPitchFeeling, string>> = {
  lacking_speed: "Brakuje mi szybkości",
  lacking_duel_strength: "Przegrywam pojedynki",
  fading_late_in_match: "Słabnę pod koniec meczu",
  slow_to_turn: "Wolno zmieniam kierunek",
  feeling_stiff: "Czuję się sztywny",
  lacking_confidence: "Brakuje mi pewności z piłką",
};

export const DESIRED_FEELING_SHORT: Partial<Record<DesiredPitchFeeling, string>> = {
  fast_and_light: "Szybki i lekki",
  strong_in_duels: "Mocny w pojedynkach",
  explosive_first_steps: "Wybuchowy na starcie",
  agile_in_turns: "Zwinny w zwrotach",
  ready_full_match: "Świeży cały mecz",
  loose_in_movement: "Swobodny w ruchu",
  confident_in_decisions: "Pewny przy piłce",
};

/** Quality of the plan an answer asks for. */
export type DirectionQuality =
  | "strength"
  | "speed"
  | "agility"
  | "endurance"
  | "mobility"
  | "ball";

export const DESIRED_FEELING_QUALITY: Record<DesiredPitchFeeling, DirectionQuality | null> = {
  fast_and_light: "speed",
  strong_in_duels: "strength",
  explosive_first_steps: "speed",
  agile_in_turns: "agility",
  ready_full_match: "endurance",
  loose_in_movement: "mobility",
  confident_in_decisions: "ball",
  calm_under_pressure: "ball",
  prepared_for_higher_level: null,
};

export const CURRENT_FEELING_QUALITY: Record<CurrentPitchFeeling, DirectionQuality | null> = {
  lacking_speed: "speed",
  lacking_duel_strength: "strength",
  fading_late_in_match: "endurance",
  slow_to_turn: "agility",
  feeling_stiff: "mobility",
  lacking_confidence: "ball",
  stagnating: null,
  returning_after_break: null,
  training_without_direction: null,
};

export const DIRECTION_QUALITY_LABELS: Record<DirectionQuality, string> = {
  strength: "siła",
  speed: "szybkość",
  agility: "zwinność i hamowanie",
  endurance: "wytrzymałość tlenowa",
  mobility: "mobilność",
  ball: "piłka",
};

/**
 * Qualities the athlete's answers point to, in priority order: how they want
 * to feel first, then what they miss now. The plan engine adds one session
 * accent from this list (see `directionAccentStimulus` in planEngine.ts).
 */
export function directionQualities(
  profile: Pick<Profile, "currentPitchFeelings" | "desiredPitchFeelings">,
): DirectionQuality[] {
  const out: DirectionQuality[] = [];
  for (const id of normalizeDesiredPitchFeelings(profile.desiredPitchFeelings)) {
    const quality = DESIRED_FEELING_QUALITY[id];
    if (quality && !out.includes(quality)) out.push(quality);
  }
  for (const id of normalizeCurrentPitchFeelings(profile.currentPitchFeelings)) {
    const quality = CURRENT_FEELING_QUALITY[id];
    if (quality && !out.includes(quality)) out.push(quality);
  }
  return out;
}

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
