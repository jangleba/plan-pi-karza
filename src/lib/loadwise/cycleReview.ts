import { historyCategoryOf } from "./store/model";
import type { CycleRecommendationKind } from "./cyclePolicy";
import type {
  CycleStartRecord,
  Readiness,
  SeasonPhase,
  SessionDay,
  SessionHistoryRecord,
} from "./types";

/**
 * Podsumowanie zakończonego cyklu planu i rekomendacja na kolejny.
 *
 * Czyste reguły (bez Reacta i bazy), żeby każdy próg był sprawdzany testem.
 * Reguły w kolejności ważności:
 *  1. zdrowie (ból / niepokojące objawy) — zawsze pierwsze,
 *  2. roztrenowanie po sezonie — odpoczynek aktywny, nie progres,
 *  3. duże zmęczenie (sRPE, samopoczucie) — lżejszy start,
 *  4. mało wykonanych treningów — najpierw regularność, bez dokładania,
 *  5. częściowa realizacja albo sezon — utrzymanie,
 *  6. brak postępu mimo regularności — zmiana bodźca,
 *  7. w pozostałych przypadkach — progres (u młodzieży małym krokiem).
 */

/** Kategorie własnych treningów, które liczymy jako „zaplanowane do zrobienia”. */
const OWN_CATEGORIES = new Set(["gym", "speed", "endurance", "ball"]);

export type { CycleRecommendationKind } from "./cyclePolicy";

export interface PlannedOwnSession {
  /** Id sesji w bazie, jeśli plan był zapisany. */
  key: string | null;
  date: string;
  category: string;
}

export interface StrengthSetEntry {
  exerciseKey: string;
  date: string;
  weightKg: number | null;
  reps: number | null;
}

export interface TestChangeSummary {
  improved: number;
  declined: number;
  flat: number;
}

export interface CycleReviewInput {
  startDate: string;
  endDate: string;
  planned: PlannedOwnSession[];
  /** Ukończone sesje (dowolny zakres dat — filtrujemy do cyklu). */
  history: SessionHistoryRecord[];
  /** Check-iny z okresu cyklu (tylko gdy zawodnik włączył dane zdrowotne). */
  readiness: Readiness[];
  strengthSets: StrengthSetEntry[];
  tests: TestChangeSummary;
  age: number;
  /** Okres, w którym zaczyna się nowy cykl. */
  phaseNext: SeasonPhase;
}

export type Feeling = "good" | "mixed" | "heavy" | "unknown";
export type ProgressVerdict = "up" | "flat" | "down" | "unknown";

export interface CycleReview {
  startDate: string;
  endDate: string;
  planned: number;
  done: number;
  /** 0–100, zaokrąglone; dodatkowe treningi nie podnoszą ponad 100. */
  adherencePct: number;
  avgRpe: number | null;
  rpeRise: number | null;
  feeling: Feeling;
  healthFlag: boolean;
  progress: ProgressVerdict;
  progressImproved: number;
  progressMeasured: number;
  youth: boolean;
  phaseNext: SeasonPhase;
  recommendation: CycleRecommendationKind;
}

/** Progi reguł — jedno miejsce, opisane źródłami w CYCLE_REVIEW_SOURCES. */
export const CYCLE_RULES = {
  /** ≥ 80% zaplanowanych sesji — próg „dobrej realizacji” (adherence) w badaniach programów prewencyjnych. */
  goodAdherence: 0.8,
  /** < 50% — za mało bodźca, by oceniać progres; dokładanie grozi skokiem obciążenia. */
  lowAdherence: 0.5,
  /** Średnie sRPE (CR-10) ≥ 8 przez cały cykl — wysiłek bardzo ciężki. */
  heavyRpe: 8,
  /** Wzrost średniego RPE o ≥ 1,5 pkt między początkiem a końcem cyklu przy końcu ≥ 7. */
  rpeRise: 1.5,
  rpeRiseFloor: 7,
  /** Ocena samopoczucia ≤ 4/10 w ≥ 30% check-inów = przewlekle słabe przygotowanie. */
  poorReadiness: 4,
  poorShare: 0.3,
  /** Ból ≥ 4/10 w ≥ 3 check-inach albo ból zmieniający ruch / objaw alarmowy. */
  painLevel: 4,
  painDays: 3,
  /** Zmiana siły (e1RM) uznawana za realną: ±2,5%. */
  strengthDelta: 0.025,
  minRpeSamples: 3,
  minReadinessSamples: 5,
  adultAge: 18,
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** Własne treningi zaplanowane w cyklu (bez klubu, meczów, regeneracji i dni niedostępnych). */
export function plannedOwnSessions(plan: readonly SessionDay[]): PlannedOwnSession[] {
  const out: PlannedOwnSession[] = [];
  for (const day of plan) {
    if (day.isUnavailable) continue;
    for (const session of [day, day.secondSession]) {
      if (!session || session.isUnavailable) continue;
      if (session.dayType === "rest" || session.isClubSession) continue;
      const category = historyCategoryOf(session.type ?? null, session.dayType);
      if (!category || !OWN_CATEGORIES.has(category)) continue;
      out.push({ key: session.dbId ?? null, date: session.date ?? day.date, category });
    }
  }
  return out;
}

/** Ile zaplanowanych sesji zostało zrobionych: po id, a gdy go brak — ten sam dzień. */
export function countDone(
  planned: readonly PlannedOwnSession[],
  history: readonly SessionHistoryRecord[],
  start: string,
  end: string,
): number {
  const own = history.filter(
    (row) => inRange(row.date, start, end) && OWN_CATEGORIES.has(row.category),
  );
  const used = new Set<string>();
  let done = 0;
  // Najpierw dokładne dopasowania po id, potem zamiany/dodatki tego samego dnia.
  const pending: PlannedOwnSession[] = [];
  for (const item of planned) {
    const exact = item.key ? own.find((row) => row.key === item.key && !used.has(row.key)) : null;
    if (exact) {
      used.add(exact.key);
      done += 1;
    } else pending.push(item);
  }
  for (const item of pending) {
    const sameDay =
      own.find(
        (row) => !used.has(row.key) && row.date === item.date && row.category === item.category,
      ) ?? own.find((row) => !used.has(row.key) && row.date === item.date);
    if (sameDay) {
      used.add(sameDay.key);
      done += 1;
    }
  }
  return done;
}

/** Najlepszy szacowany 1RM (Epley) z serii 1–12 powtórzeń. */
function e1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export function strengthChanges(
  sets: readonly StrengthSetEntry[],
  start: string,
  end: string,
): TestChangeSummary {
  const byExercise = new Map<string, Map<string, number>>();
  for (const set of sets) {
    if (!inRange(set.date, start, end)) continue;
    if (!set.weightKg || set.weightKg <= 0 || !set.reps || set.reps < 1 || set.reps > 12) continue;
    const days = byExercise.get(set.exerciseKey) ?? new Map<string, number>();
    days.set(set.date, Math.max(days.get(set.date) ?? 0, e1rm(set.weightKg, set.reps)));
    byExercise.set(set.exerciseKey, days);
  }
  const result: TestChangeSummary = { improved: 0, declined: 0, flat: 0 };
  for (const days of byExercise.values()) {
    if (days.size < 2) continue;
    const ordered = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const first = ordered[0][1];
    const last = ordered[ordered.length - 1][1];
    const change = (last - first) / first;
    if (change >= CYCLE_RULES.strengthDelta) result.improved += 1;
    else if (change <= -CYCLE_RULES.strengthDelta) result.declined += 1;
    else result.flat += 1;
  }
  return result;
}

function feelingOf(readiness: readonly Readiness[]): { feeling: Feeling; healthFlag: boolean } {
  const painDays = readiness.filter((r) => r.jointPain >= CYCLE_RULES.painLevel).length;
  const healthFlag =
    readiness.some((r) => (r.redFlags?.length ?? 0) > 0 || r.altersMovement) ||
    painDays >= CYCLE_RULES.painDays;
  if (readiness.length < CYCLE_RULES.minReadinessSamples) return { feeling: "unknown", healthFlag };
  const poor = readiness.filter((r) => r.overall <= CYCLE_RULES.poorReadiness).length;
  const share = poor / readiness.length;
  const feeling: Feeling =
    share >= CYCLE_RULES.poorShare ? "heavy" : share > 0.1 ? "mixed" : "good";
  return { feeling, healthFlag };
}

function rpeStats(
  history: readonly SessionHistoryRecord[],
  start: string,
  end: string,
): { avg: number | null; rise: number | null; late: number | null } {
  const rows = history
    .filter(
      (row) =>
        inRange(row.date, start, end) &&
        OWN_CATEGORIES.has(row.category) &&
        typeof row.rpe === "number" &&
        row.rpe > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < CYCLE_RULES.minRpeSamples) return { avg: null, rise: null, late: null };
  const values = rows.map((row) => row.rpe as number);
  const half = Math.floor(values.length / 2);
  const early = mean(values.slice(0, half));
  const late = mean(values.slice(values.length - half));
  return {
    avg: round1(mean(values) as number),
    rise: half >= 2 && early !== null && late !== null ? round1(late - early) : null,
    late: half >= 2 && late !== null ? round1(late) : null,
  };
}

export function buildCycleReview(input: CycleReviewInput): CycleReview | null {
  const { startDate, endDate } = input;
  const planned = input.planned.filter((item) => inRange(item.date, startDate, endDate));
  if (planned.length === 0) return null;
  const done = countDone(planned, input.history, startDate, endDate);
  const adherence = Math.min(1, done / planned.length);
  const rpe = rpeStats(input.history, startDate, endDate);
  const readiness = input.readiness.filter((r) => inRange(r.date, startDate, endDate));
  const { feeling, healthFlag } = feelingOf(readiness);
  const strength = strengthChanges(input.strengthSets, startDate, endDate);
  const improved = strength.improved + input.tests.improved;
  const declined = strength.declined + input.tests.declined;
  const measured = improved + declined + strength.flat + input.tests.flat;
  const progress: ProgressVerdict =
    measured === 0 ? "unknown" : improved > declined ? "up" : declined > improved ? "down" : "flat";
  const heavy =
    (rpe.avg !== null && rpe.avg >= CYCLE_RULES.heavyRpe) ||
    (rpe.rise !== null &&
      rpe.rise >= CYCLE_RULES.rpeRise &&
      rpe.late !== null &&
      rpe.late >= CYCLE_RULES.rpeRiseFloor) ||
    feeling === "heavy";

  let recommendation: CycleRecommendationKind;
  if (healthFlag) recommendation = "health";
  else if (input.phaseNext === "transition" || input.phaseNext === "return_injury")
    recommendation = "transition";
  else if (heavy) recommendation = "deload";
  else if (adherence < CYCLE_RULES.lowAdherence) recommendation = "consistency";
  else if (adherence < CYCLE_RULES.goodAdherence) recommendation = "maintain";
  else if ((progress === "flat" || progress === "down") && measured >= 2) recommendation = "vary";
  else if (input.phaseNext === "inseason") recommendation = "maintain";
  else recommendation = "progress";

  return {
    startDate,
    endDate,
    planned: planned.length,
    done,
    adherencePct: Math.round(adherence * 100),
    avgRpe: rpe.avg,
    rpeRise: rpe.rise,
    feeling,
    healthFlag,
    progress,
    progressImproved: improved,
    progressMeasured: measured,
    youth: input.age < CYCLE_RULES.adultAge,
    phaseNext: input.phaseNext,
    recommendation,
  };
}

const PHASE_LABEL: Record<SeasonPhase, string> = {
  inseason: "w sezonie",
  preseason: "przygotowania do sezonu",
  offseason: "okres bez meczów",
  transition: "roztrenowanie",
  return_injury: "powrót po kontuzji",
};

export interface CycleReviewCopy {
  title: string;
  /** Krótkie fakty: wykonanie, wysiłek, samopoczucie, postęp. */
  facts: string[];
  recommendationTitle: string;
  /** Co robić w nowym cyklu — konkretnie, bez uzasadnienia. */
  recommendationText: string;
  button: string;
}

function rpeFact(review: CycleReview): string | null {
  if (review.avgRpe === null) return null;
  return `Wysiłek: średnio ${String(review.avgRpe).replace(".", ",")}/10`;
}

function feelingFact(review: CycleReview): string | null {
  if (review.healthFlag) return "Samopoczucie: zgłaszany ból";
  switch (review.feeling) {
    case "good":
      return "Samopoczucie: dobre";
    case "mixed":
      return "Samopoczucie: zmienne";
    case "heavy":
      return "Samopoczucie: często zmęczenie";
    default:
      return null;
  }
}

function progressFact(review: CycleReview): string | null {
  switch (review.progress) {
    case "up":
      return `Postęp: lepiej w ${review.progressImproved} z ${review.progressMeasured} pomiarów`;
    case "flat":
      return "Postęp: wyniki bez zmian";
    case "down":
      return "Postęp: wyniki słabsze";
    default:
      return null;
  }
}

function trainingsLabel(count: number): string {
  if (count === 1) return "1 trening";
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? `${count} treningi`
    : `${count} treningów`;
}

export function cycleReviewCopy(review: CycleReview): CycleReviewCopy {
  const facts = [
    `Treningi: ${review.done} z ${review.planned} (${review.adherencePct}%)`,
    rpeFact(review),
    feelingFact(review),
    progressFact(review),
  ].filter((fact): fact is string => Boolean(fact));
  const next = PHASE_LABEL[review.phaseNext];
  const weeks = Math.max(1, Math.round((daysBetween(review.startDate, review.endDate) + 1) / 7));
  const weeklyTarget = Math.max(1, Math.ceil((review.planned / weeks) * CYCLE_RULES.goodAdherence));
  // Opis tego, co silnik zrobił z nowym cyklem (cyclePolicy.ts) — bez uzasadnienia.
  const copy: Record<CycleRecommendationKind, [string, string]> = {
    health: [
      "Najpierw zdrowie",
      "Nowy plan: 2 lżejsze tygodnie na start, bez tygodni przeciążenia. Zgłoś ból trenerowi lub fizjoterapeucie.",
    ],
    transition: [
      "Roztrenowanie",
      "Nowy plan: lżejszy pierwszy tydzień i cykl bez tygodni przeciążenia.",
    ],
    deload: [
      "Lżejszy start",
      "Nowy plan: pierwszy tydzień lżejszy, potem wprowadzenie i normalny blok.",
    ],
    consistency: [
      "Najpierw regularność",
      `Nowy plan nie zwiększa obciążenia. Celuj w ${trainingsLabel(weeklyTarget)} w tygodniu.`,
    ],
    maintain: [
      review.phaseNext === "inseason" ? "Utrzymanie formy w sezonie" : "Utrzymanie poziomu",
      "Nowy plan utrzymuje obciążenie: bez tygodni przeciążenia.",
    ],
    vary: [
      "Zmiana bodźca",
      "Nowy plan zmienia kolejność tygodni: mocniejszy bodziec wcześniej, potem budowanie.",
    ],
    progress: review.youth
      ? ["Mały krok wyżej", "Nowy plan: pełny blok z jednym tygodniem przeciążenia."]
      : [
          "Krok wyżej",
          "Nowy plan: pełny blok z tygodniami przeciążenia. Dokładaj ciężar, gdy zrobisz wszystkie powtórzenia z zapasem.",
        ],
  };
  const [recommendationTitle, recommendationText] = copy[review.recommendation];
  return {
    title: "Koniec cyklu",
    facts: [...facts, `Następny cykl: ${next}`],
    recommendationTitle,
    recommendationText,
    button: "Zaczynam nowy cykl",
  };
}

/** Źródła reguł — pokazywane wyłącznie po rozwinięciu „Więcej”. */
export const CYCLE_REVIEW_SOURCES: readonly string[] = [
  "Foster i in. 2001 — sRPE i monotonia obciążenia (J Strength Cond Res).",
  "Gabbett 2016; Impellizzeri i in. 2020 — skoki obciążenia (ACWR) z ostrożnością.",
  "Steffen i in. 2013; Hägglund i in. 2013 — realizacja ≥ 80% programu i dostępność zawodnika.",
  "Bell i in. 2023 — odciążenie (deload) w treningu siłowym, konsensus.",
  "Rønnestad i in. 2011 — utrzymanie siły w sezonie piłkarskim.",
  "Lloyd i in. 2014; Faigenbaum i in. 2016 — progresja obciążenia u młodzieży.",
  "Silva i in. 2016 — roztrenowanie po sezonie w piłce nożnej.",
];

/** Zapis do planu nowego cyklu: reguła startu dla silnika + podsumowanie do Postępu. */
export function cycleStartRecord(
  review: CycleReview,
  reviewedCycleId: string | null,
): CycleStartRecord {
  return { kind: review.recommendation, youth: review.youth, reviewedCycleId, review };
}

/** Reguła startu zapisana w planie bieżącego cyklu. */
export function cycleStartOf(plan: readonly SessionDay[]): CycleStartRecord | null {
  return plan.find((day) => day.cycleStart)?.cycleStart ?? null;
}

/** Ten sam zapis na każdym dniu — przetrwa przebudowę i zapis planu. */
export function stampCycleStart(
  days: SessionDay[],
  record: CycleStartRecord | null | undefined,
): SessionDay[] {
  return record ? days.map((day) => ({ ...day, cycleStart: record })) : days;
}
