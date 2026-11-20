import { PASTEL, type Pastel } from "../lib/pastel";

/**
 * Stonowane pastelowe kolory kroków onboardingu: po jednym odcieniu na krok (bez emoji i kolorowych kropek).
 * Indeks = numer kroku; 0 to ekran powitalny.
 */
export type Tone = Pastel;
export const STEP_TONES: Tone[] = [PASTEL.blue, PASTEL.blue, PASTEL.mint, PASTEL.peach, PASTEL.lavender, PASTEL.aqua, PASTEL.rose];
