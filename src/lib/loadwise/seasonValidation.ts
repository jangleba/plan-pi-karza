import type { SeasonPhase, SeasonStage, Profile } from "./types";
import { localToday, parseIso } from "./labels";

/** Status spójności stanu sezonu z kalendarzem. */
export type SeasonValidationStatus = "ok" | "invalid" | "incomplete" | "override";

export interface SeasonStateInput {
  seasonPhase: SeasonPhase | null;
  seasonStage: SeasonStage | null;
  nextMatchDate: string | null;
  weeklyMatches: boolean;
  seasonPhaseOverride?: boolean;
  /** Domyślnie dzisiejsza data w lokalnej strefie użytkownika. */
  today?: Date;
}

export interface SeasonValidationResult {
  status: SeasonValidationStatus;
  /** Komunikat po polsku do pokazania użytkownikowi (lub null). */
  message: string | null;
  /** Sugerowany okres sezonu wynikający z kalendarza i daty meczu. */
  suggestion: SeasonPhase | null;
  /** Czy wymagane jest potwierdzenie trybu niestandardowego sezonu. */
  needsConfirm: boolean;
}

export const SEASON_MISMATCH_MESSAGE =
  "Wybrany okres sezonu nie pasuje do aktualnej daty i fazy rozgrywek. " +
  "Popraw okres albo wybierz tryb niestandardowego sezonu.";

/**
 * Okresy sezonu sensowne dla danego miesiąca (kalendarz polski/europejski).
 * 1 = styczeń ... 12 = grudzień. "return_injury" jest zawsze dopuszczalny
 * (zależy od kontuzji, nie od kalendarza).
 */
const PLAUSIBLE_BY_MONTH: Record<number, SeasonPhase[]> = {
  1: ["preseason", "transition"], // przygotowanie zimowe / przerwa
  2: ["preseason", "inseason"], // koniec przygotowań / start rundy
  3: ["inseason"],
  4: ["inseason"],
  5: ["inseason"],
  6: ["offseason", "transition", "preseason"], // koniec sezonu / start letnich przygotowań
  7: ["preseason", "offseason"],
  8: ["inseason", "preseason"],
  9: ["inseason"],
  10: ["inseason"],
  11: ["inseason"],
  12: ["inseason", "transition"],
};

const WINTER_MONTHS = [12, 1, 2];

function daysUntil(today: Date, iso: string | null): number | null {
  if (!iso) return null;
  const d = parseIso(iso);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Sugeruje okres sezonu na podstawie kalendarza i daty meczu.
 * Data meczu i kontekst rozgrywkowy mają pierwszeństwo nad domyślnym miesiącem.
 */
export function suggestSeasonPhase(today: Date, nextMatchDate: string | null): SeasonPhase {
  const month = today.getMonth() + 1;
  const dToMatch = daysUntil(today, nextMatchDate);
  const matchSoon = dToMatch != null && dToMatch >= 0 && dToMatch <= 14;

  if (WINTER_MONTHS.includes(month)) {
    // Grudzień/styczeń/luty: przerwa lub przygotowanie zimowe,
    // chyba że mecz jest blisko -> runda trwa.
    return matchSoon ? "inseason" : "preseason";
  }
  if (month === 6 || month === 7) {
    // Lato: poza sezonem / przejściowy, ale bliski mecz = letni przedsezon.
    if (dToMatch != null && dToMatch >= 0 && dToMatch <= 28) return "preseason";
    return "offseason";
  }
  // Marzec–maj oraz sierpień–listopad: zwykle w sezonie.
  return "inseason";
}

/**
 * Sprawdza spójność stanu sezonu z kalendarzem i datą meczu.
 * Blokuje niemożliwe kombinacje, prosi o brakujące dane, sugeruje poprawkę.
 */
export function validateSeason(input: SeasonStateInput): SeasonValidationResult {
  const today = input.today ?? localToday();
  const suggestion = suggestSeasonPhase(today, input.nextMatchDate);

  // Tryb niestandardowego sezonu wybrany świadomie — ufamy użytkownikowi.
  if (input.seasonPhaseOverride) {
    return { status: "override", message: null, suggestion, needsConfirm: false };
  }

  if (!input.seasonPhase) {
    return {
      status: "incomplete",
      message: "Wybierz okres sezonu.",
      suggestion,
      needsConfirm: false,
    };
  }

  // Powrót po kontuzji zależy od stanu zdrowia, nie kalendarza.
  if (input.seasonPhase === "return_injury") {
    return { status: "ok", message: null, suggestion, needsConfirm: false };
  }

  const month = today.getMonth() + 1;
  const dToMatch = daysUntil(today, input.nextMatchDate);
  const plausible = PLAUSIBLE_BY_MONTH[month] ?? ["inseason"];

  let invalid = !plausible.includes(input.seasonPhase);

  // "Środek rundy" tylko gdy faktycznie trwa runda (w sezonie).
  if (input.seasonStage === "season_mid" && input.seasonPhase !== "inseason") {
    invalid = true;
  }

  // Przerwa zimowa tylko w miesiącach zimowych.
  if (input.seasonStage === "winter_break" && !WINTER_MONTHS.includes(month)) {
    invalid = true;
  }

  // Poza sezonem / przejściowy + cotygodniowe mecze albo bliski mecz = sprzeczność.
  if (
    (input.seasonPhase === "offseason" || input.seasonPhase === "transition") &&
    (input.weeklyMatches || (dToMatch != null && dToMatch >= 0 && dToMatch <= 10))
  ) {
    invalid = true;
  }

  if (invalid) {
    return {
      status: "invalid",
      message: SEASON_MISMATCH_MESSAGE,
      suggestion,
      needsConfirm: true,
    };
  }

  // W sezonie / środek rundy bez daty meczu — plan jest niekompletny.
  if (input.seasonPhase === "inseason" && !input.nextMatchDate) {
    return {
      status: "incomplete",
      message: "Wybrano grę w sezonie — podaj datę najbliższego meczu, aby plan był wiarygodny.",
      suggestion,
      needsConfirm: false,
    };
  }

  return { status: "ok", message: null, suggestion, needsConfirm: false };
}

/**
 * Zwraca okres sezonu, którego MA użyć silnik treningowy.
 * Jeśli użytkownik nie włączył trybu niestandardowego, a zapisany okres jest
 * sprzeczny z kalendarzem, silnik korzysta z sugestii kalendarzowej.
 */
export function effectiveSeasonPhase(profile: Profile, today?: Date): SeasonPhase {
  if (profile.seasonPhaseOverride) return profile.seasonPhase;
  const result = validateSeason({
    seasonPhase: profile.seasonPhase,
    seasonStage: profile.seasonStage,
    nextMatchDate: profile.matchDate,
    weeklyMatches: profile.weeklyMatches,
    seasonPhaseOverride: profile.seasonPhaseOverride,
    today,
  });
  if (result.status === "invalid" && result.suggestion) {
    return result.suggestion;
  }
  return profile.seasonPhase;
}
