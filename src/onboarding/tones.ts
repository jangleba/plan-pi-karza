/**
 * Jedna, stonowana pastelowa paleta dla całego onboardingu (minimalistycznie, bez kolorów „na każdy krok”):
 * c – kolor akcentu (obrys wybranego, znacznik, wypełnienie paska), s – jasne tło wybranego, i – ciemny tekst na jasnym tle.
 */
export interface Tone { c: string; s: string; i: string; /** mocniejszy odcień do małych pełnych elementów (znacznik wyboru) */ solid: string }
export const TONE: Tone = { c: "#9db9de", s: "#eff4fa", i: "#2f4d75", solid: "#6f93c6" };
/** Ten sam ton w każdym kroku (indeks = numer kroku; 0 to ekran powitalny). */
export const STEP_TONES: Tone[] = Array.from({ length: 7 }, () => TONE);
