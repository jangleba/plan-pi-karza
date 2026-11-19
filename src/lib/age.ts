import { ageRangeOn } from "../../supabase/functions/_shared/radar/eligibility";
import { isISODate } from "../../supabase/functions/_shared/radar/time";

/**
 * JEDNA funkcja kwalifikacji wieku dla całej aplikacji (onboarding, zmiana danych, odczyt zapisanego profilu, radar).
 * Zasady:
 *  – pełna data urodzenia rozstrzyga i ma pierwszeństwo przed deklaracją (sprzeczność jest zgłaszana),
 *  – sam rocznik NIE jest dowodem ukończenia 16 lat, jeśli wynik zależy od dnia urodzin (nie podstawiamy 1 stycznia),
 *  – deklarowany wiek „starzeje się” z czasem (dolne ograniczenie), nigdy nie młodnieje,
 *  – to samodeklaracja, a nie weryfikacja tożsamości.
 */
export const MIN_AGE = 16;
export const ADULT_AGE = 18;

export interface AgeInput {
  birthDate?: string | null;
  birthYear?: number | null;
  /** Wiek zapisany w profilu (deklarowany) i data, na którą go podano. */
  declaredAge?: number | null;
  declaredOn?: string | null;
}

export type AgeStatus = "ok" | "under_min" | "needs_birth_date" | "unknown";
export type AgeBand = "16-17" | "18+";
export type AgeContradiction =
  | "birth_date_invalid" | "birth_year_invalid" | "birth_year_mismatch" | "declared_age_mismatch" | "declared_age_invalid";

export interface AgeAssessment {
  status: AgeStatus;
  /** Grupa wiekowa; przy niejednoznaczności (np. 17–18) przyjmujemy ostrożnie „16-17”. */
  band: AgeBand | null;
  /** Najmniejszy możliwy wiek dziś (bezpieczny do zapisu w profilu jako dolne ograniczenie). */
  currentAge: number | null;
  min: number | null;
  max: number | null;
  source: "birthDate" | "birthYear" | "declared" | "none";
  contradictions: AgeContradiction[];
}

const yearOf = (iso: string) => Number(iso.slice(0, 4));

function yearsBetween(fromISO: string, toISO: string): number {
  const f = new Date(`${fromISO}T00:00:00Z`), t = new Date(`${toISO}T00:00:00Z`);
  let y = t.getUTCFullYear() - f.getUTCFullYear();
  if (t.getUTCMonth() < f.getUTCMonth() || (t.getUTCMonth() === f.getUTCMonth() && t.getUTCDate() < f.getUTCDate())) y--;
  return Math.max(0, y);
}

export function assessAge(input: AgeInput, todayISO: string): AgeAssessment {
  const contradictions: AgeContradiction[] = [];
  const thisYear = yearOf(todayISO);

  let birthDate = input.birthDate ?? null;
  if (birthDate !== null && (!isISODate(birthDate) || birthDate > todayISO || yearOf(birthDate) < 1900)) { contradictions.push("birth_date_invalid"); birthDate = null; }
  let birthYear = input.birthYear ?? null;
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > thisYear)) { contradictions.push("birth_year_invalid"); birthYear = null; }
  if (birthDate && birthYear !== null && yearOf(birthDate) !== birthYear) contradictions.push("birth_year_mismatch");

  let declared = input.declaredAge ?? null;
  if (declared !== null && (!Number.isInteger(declared) || declared < 0 || declared > 110)) { contradictions.push("declared_age_invalid"); declared = null; }

  let range: [number, number] | null = null;
  let source: AgeAssessment["source"] = "none";
  if (birthDate) { range = ageRangeOn({ birthDate }, todayISO); source = "birthDate"; }
  else if (birthYear !== null) { range = ageRangeOn({ birthYear }, todayISO); source = "birthYear"; }

  // sprzeczność z deklaracją: sprawdzamy ją na dzień, na który wiek podano
  if (declared !== null && (birthDate || birthYear !== null)) {
    const on = input.declaredOn && isISODate(input.declaredOn) && input.declaredOn <= todayISO ? input.declaredOn : todayISO;
    const r = ageRangeOn(birthDate ? { birthDate } : { birthYear: birthYear! }, on);
    if (r && (declared < r[0] || declared > r[1])) contradictions.push("declared_age_mismatch");
  }

  if (!range && declared !== null) {
    const elapsed = input.declaredOn && isISODate(input.declaredOn) && input.declaredOn <= todayISO ? yearsBetween(input.declaredOn, todayISO) : 0;
    const lower = declared + elapsed;
    return { status: lower >= MIN_AGE ? "ok" : "under_min", band: lower >= ADULT_AGE ? "18+" : lower >= MIN_AGE ? "16-17" : null, currentAge: lower, min: lower, max: null, source: "declared", contradictions };
  }
  if (!range) return { status: "unknown", band: null, currentAge: null, min: null, max: null, source: "none", contradictions };

  const [min, max] = range;
  const status: AgeStatus = max < MIN_AGE ? "under_min" : min >= MIN_AGE ? "ok" : "needs_birth_date";
  const band: AgeBand | null = status !== "ok" ? null : min >= ADULT_AGE ? "18+" : "16-17";
  return { status, band, currentAge: min, min, max, source, contradictions };
}

/** Czy wolno korzystać z aplikacji (tylko jednoznaczne ukończenie 16 lat). */
export const mayUseApp = (a: AgeAssessment): boolean => a.status === "ok";

export const AGE_BLOCK_MESSAGE: Record<Exclude<AgeStatus, "ok">, string> = {
  under_min: `Aplikacja jest przeznaczona dla osób, które ukończyły ${MIN_AGE} lat.`,
  needs_birth_date: "Sam rocznik nie wystarcza, by potwierdzić wiek – podaj pełną datę urodzenia (zostaje na tym urządzeniu).",
  unknown: "Podaj wiek, aby korzystać z aplikacji.",
};
