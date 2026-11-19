const ymd = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Ukończone lata w dniu `asOf` dla ustalonej daty urodzin w danym roku. W dniu urodzin wiek już się zwiększa. */
function completedYears(b: { y: number }, asOf: { y: number; m: number; d: number }, bm: number, bd: number): number {
  const before = asOf.m < bm || (asOf.m === bm && asOf.d < bd);
  return asOf.y - b.y - (before ? 1 : 0);
}

/**
 * Zakres możliwych ukończonych lat [min, max] w dniu `asOfISO`:
 *  – znana pełna data: jedna wartość (dla 29.02 w roku niewysokosowym liczymy obie konwencje: 28.02 i 1.03),
 *  – znany tylko rok: od 1 stycznia do 31 grudnia, więc zwykle dwie wartości,
 *  – brak danych: null.
 */
export function ageRangeOn(facts: { birthDate?: string | null; birthYear?: number | null }, asOfISO: string): [number, number] | null {
  const a = ymd(asOfISO);
  if (facts.birthDate) {
    const b = ymd(facts.birthDate);
    const variants = b.m === 2 && b.d === 29 && !isLeap(a.y) ? [[2, 28], [3, 1]] : [[b.m, b.d]];
    const ages = variants.map(([bm, bd]) => completedYears(b, a, bm!, bd!));
    return [Math.min(...ages), Math.max(...ages)];
  }
  if (facts.birthYear) {
    const jan = completedYears({ y: facts.birthYear }, a, 1, 1);
    const dec = completedYears({ y: facts.birthYear }, a, 12, 31);
    return [Math.min(jan, dec), Math.max(jan, dec)];
  }
  return null;
}

/**
 * JEDNA funkcja kwalifikacji wieku dla całej aplikacji (onboarding, zmiana danych, odczyt zapisanego profilu).
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
