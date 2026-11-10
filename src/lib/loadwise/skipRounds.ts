/**
 * Rundy skipów A/C/B/D w sesji szybkości.
 *
 * Silnik planuje każdy skip dwa razy: runda 1 w jednym, jednoznacznym rytmie
 * (z dostawieniem nóg), runda 2 ciągła. Nazwa w bibliotece to tylko „Skip A”,
 * więc bez tej etykiety ekran pokazywał dwie identyczne pozycje.
 */

const SKIP_IDS = new Set(["a_skip", "b_skip", "c_skip", "d_skip"]);

type SkipRound = { round: 1 | 2; rhythm: string | null };

function normaliseVariant(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Runda i rytm wynikają z zapisanego wariantu, więc działają także dla planów
 * odtworzonych z bazy. Stary wariant „step_in” nie mówi, który z dwóch rytmów
 * wybrać — pokazujemy wtedy tylko numer rundy, bez zgadywania techniki.
 */
export function skipRound(
  exerciseId: string | null | undefined,
  variant: string | null | undefined,
): SkipRound | null {
  if (!exerciseId || !SKIP_IDS.has(exerciseId)) return null;
  switch (normaliseVariant(variant)) {
    case "gather":
      return { round: 1, rhythm: "z dostawieniem" };
    case "extra_bounce":
      return { round: 1, rhythm: "z przejściem" };
    case "step_in":
      return { round: 1, rhythm: null };
    case "continuous":
      return { round: 2, rhythm: "ciągły" };
    default:
      return null;
  }
}

/** „runda 1 · z dostawieniem” — dopisek do nazwy skipu na ekranie sesji. */
export function skipRoundLabel(
  exerciseId: string | null | undefined,
  variant: string | null | undefined,
): string | null {
  const round = skipRound(exerciseId, variant);
  if (!round) return null;
  return [`runda ${round.round}`, round.rhythm].filter(Boolean).join(" · ");
}

/** Jedno polecenie techniczne dla rytmu rundy — bez wyboru po stronie zawodnika. */
export function skipRhythmCue(
  exerciseId: string | null | undefined,
  variant: string | null | undefined,
): string | null {
  if (!exerciseId || !SKIP_IDS.has(exerciseId)) return null;
  switch (normaliseVariant(variant)) {
    case "gather":
      return "Z dostawieniem: po ściągnięciu stopy postaw obie stopy pod biodrami, zrób jeden niski kontakt i dopiero zmień nogę.";
    case "continuous":
      return "Ciągły: skip za skipem, nogi zmieniają się płynnie, bez dostawiania.";
    default:
      return null;
  }
}
