import { PASTEL, type Pastel } from "../lib/pastel";

/**
 * Onboarding w dwóch pasujących do siebie pastelach: błękit (główny: wybór, postęp) i brzoskwinia (dopełniający:
 * drugi cel, dni klubowe, plakietka wieku). Reszta to neutralne szarości.
 */
export type Tone = Pastel;
export const PRIMARY: Tone = PASTEL.blue;
export const SECONDARY: Tone = PASTEL.peach;
/** Indeks = numer kroku; wszystkie kroki w kolorze głównym (0 to ekran powitalny). */
export const STEP_TONES: Tone[] = Array.from({ length: 7 }, () => PRIMARY);
/** Zmienne CSS koloru dla elementu (`--tone` itd.), np. kafel drugiego celu w kolorze dopełniającym. */
export const toneVars = (t: Tone) => ({ "--tone": t.c, "--tone-soft": t.s, "--tone-ink": t.i, "--tone-solid": t.solid }) as Record<string, string>;
