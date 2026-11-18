import { historyCategoryOf } from "./store/model";
import { historyLoad, isValidMatchMinutes } from "./sessionFeedback";
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

/** Club and match slots of the plan: not the athlete's own goals, but part of the week's load. */
export interface PlannedExternalSession {
  key: string | null;
  date: string;
  kind: "club" | "match";
}

/** Club and matches of the cycle, kept apart from the athlete's own goals. */
export interface ExternalLoadSummary {
  clubPlanned: number;
  clubDone: number;
  matchPlanned: number;
  matchDone: number;
  /** Minutes actually played (matches only); 0 is a known value. */
  matchMinutesPlayed: number;
  /** Sum of minutes × RPE of the completed club/match entries that have a usable load. */
  loadAu: number;
  /** True when part of that sum uses the 90-minute club assumption, not a recorded time. */
  loadUsesAssumedMinutes: boolean;
  /** Completed club/match entries without a usable load (no RPE, or no minutes played). */
  withoutLoad: number;
}

export interface StrengthSetEntry {
  exerciseKey: string;
  /** Proven by the completed execution snapshot; unknown legacy rows cannot prove a trend. */
  prescriptionKey?: string;
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
  /** Planned club and match slots; optional for callers that only know the athlete's own goals. */
  plannedExternal?: PlannedExternalSession[];
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
  /** Execution of the athlete's own goals is `planned`/`done`; this is the rest of the week's load. */
  /** Absent in reviews saved before club and matches were included. */
  external?: ExternalLoadSummary;
  /** Mean RPE over the whole week's recorded sessions (own, club, matches actually played). */
  weekAvgRpe?: number | null;
}

/** Progi reguł — jedno miejsce, opisane źródłami w CYCLE_REVIEW_SOURCES. */
const CYCLE_RULES = {
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

/** Club and match slots in the plan (not the athlete's own goals; they count as load, not as goals). */
export function plannedExternalSessions(plan: readonly SessionDay[]): PlannedExternalSession[] {
  const out: PlannedExternalSession[] = [];
  for (const day of plan) {
    if (day.isUnavailable) continue;
    for (const session of [day, day.secondSession]) {
      if (!session || session.isUnavailable) continue;
      const kind =
        session.dayType === "match"
          ? "match"
          : session.dayType === "club" || session.isClubSession
            ? "club"
            : null;
      if (kind) out.push({ key: session.dbId ?? null, date: session.date ?? day.date, kind });
    }
  }
  return out;
}

/**
 * Ile zaplanowanych sesji zostało zrobionych: po id, a gdy go brak — ten sam dzień i ta sama
 * kategoria celu. Inna aktywność (np. trening z piłką zamiast siłowni) nadal jest obciążeniem,
 * ale nie zalicza celu, którego nie wykonano.
 */
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
  const pending: PlannedOwnSession[] = [];
  for (const item of planned) {
    const exact = item.key ? own.find((row) => row.key === item.key && !used.has(row.key)) : null;
    if (exact) {
      used.add(exact.key);
      done += 1;
    } else pending.push(item);
  }
  for (const item of pending) {
    const sameGoal = own.find(
      (row) => !used.has(row.key) && row.date === item.date && row.category === item.category,
    );
    if (sameGoal) {
      used.add(sameGoal.key);
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
    if (!set.prescriptionKey) continue;
    if (!set.weightKg || set.weightKg <= 0 || !set.reps || set.reps < 1 || set.reps > 12) continue;
    const key = `${set.exerciseKey}|${set.prescriptionKey}`;
    const days = byExercise.get(key) ?? new Map<string, number>();
    days.set(set.date, Math.max(days.get(set.date) ?? 0, e1rm(set.weightKg, set.reps)));
    byExercise.set(key, days);
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

/** Whole-week load: own sessions, club, and matches the athlete actually played. */
const countsForWeek = (row: SessionHistoryRecord) =>
  OWN_CATEGORIES.has(row.category) ||
  row.category === "club" ||
  (row.category === "match" &&
    isValidMatchMinutes(row.matchMinutesPlayed) &&
    row.matchMinutesPlayed > 0);

function rpeStats(
  history: readonly SessionHistoryRecord[],
  start: string,
  end: string,
  counts: (row: SessionHistoryRecord) => boolean = (row) => OWN_CATEGORIES.has(row.category),
): { avg: number | null; rise: number | null; late: number | null } {
  const rows = history
    .filter(
      (row) =>
        inRange(row.date, start, end) && counts(row) && typeof row.rpe === "number" && row.rpe > 0,
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

function summariseExternal(
  planned: readonly PlannedExternalSession[],
  history: readonly SessionHistoryRecord[],
  start: string,
  end: string,
): ExternalLoadSummary {
  const out: ExternalLoadSummary = {
    clubPlanned: planned.filter((p) => p.kind === "club" && inRange(p.date, start, end)).length,
    clubDone: 0,
    matchPlanned: planned.filter((p) => p.kind === "match" && inRange(p.date, start, end)).length,
    matchDone: 0,
    matchMinutesPlayed: 0,
    loadAu: 0,
    loadUsesAssumedMinutes: false,
    withoutLoad: 0,
  };
  for (const row of history) {
    if (!inRange(row.date, start, end) || (row.category !== "club" && row.category !== "match"))
      continue;
    if (row.category === "club") out.clubDone += 1;
    else {
      out.matchDone += 1;
      if (isValidMatchMinutes(row.matchMinutesPlayed))
        out.matchMinutesPlayed += row.matchMinutesPlayed;
    }
    const load = historyLoad(row);
    if (load.value === null) out.withoutLoad += 1;
    else {
      out.loadAu += load.value;
      out.loadUsesAssumedMinutes ||= load.minutesAssumed;
    }
  }
  // A done entry never exceeds what was planned in the numbers shown to the athlete.
  out.clubPlanned = Math.max(out.clubPlanned, out.clubDone);
  out.matchPlanned = Math.max(out.matchPlanned, out.matchDone);
  return out;
}

export function buildCycleReview(input: CycleReviewInput): CycleReview | null {
  const { startDate, endDate } = input;
  const planned = input.planned.filter((item) => inRange(item.date, startDate, endDate));
  if (planned.length === 0) return null;
  const done = countDone(planned, input.history, startDate, endDate);
  const adherence = Math.min(1, done / planned.length);
  const rpe = rpeStats(input.history, startDate, endDate);
  const week = rpeStats(input.history, startDate, endDate, countsForWeek);
  const externalRpe = rpeStats(
    input.history,
    startDate,
    endDate,
    (row) => countsForWeek(row) && !OWN_CATEGORIES.has(row.category),
  );
  const external = summariseExternal(
    input.plannedExternal ?? [],
    input.history,
    startDate,
    endDate,
  );
  const readiness = input.readiness.filter((r) => inRange(r.date, startDate, endDate));
  const { feeling, healthFlag } = feelingOf(readiness);
  const strength = strengthChanges(input.strengthSets, startDate, endDate);
  const improved = strength.improved + input.tests.improved;
  const declined = strength.declined + input.tests.declined;
  const measured = improved + declined + strength.flat + input.tests.flat;
  const progress: ProgressVerdict =
    measured === 0 ? "unknown" : improved > declined ? "up" : declined > improved ? "down" : "flat";
  // The same published thresholds, read over the whole week: club and matches are load too.
  // One RPE does not diagnose fatigue; only the mean/rise over the cycle does, as before.
  const heavyIn = (s: { avg: number | null; rise: number | null; late: number | null }) =>
    (s.avg !== null && s.avg >= CYCLE_RULES.heavyRpe) ||
    (s.rise !== null &&
      s.rise >= CYCLE_RULES.rpeRise &&
      s.late !== null &&
      s.late >= CYCLE_RULES.rpeRiseFloor);
  // Easy own sessions must not dilute a hard club/match stream: the same rule reads it on its own.
  const heavy = heavyIn(rpe) || heavyIn(week) || heavyIn(externalRpe) || feeling === "heavy";

  let recommendation: CycleRecommendationKind;
  if (healthFlag) recommendation = "health";
  else if (input.phaseNext === "transition" || input.phaseNext === "return_injury")
    recommendation = "transition";
  else if (heavy) recommendation = "deload";
  else if (adherence < CYCLE_RULES.lowAdherence) recommendation = "consistency";
  else if (adherence < CYCLE_RULES.goodAdherence) recommendation = "maintain";
  else if ((progress === "flat" || progress === "down") && measured >= 2) recommendation = "vary";
  else if (input.phaseNext === "inseason") recommendation = "maintain";
  // Club or match work that was done but has no usable load is unknown load, not zero: hold.
  else if (external.withoutLoad > 0) recommendation = "maintain";
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
    external,
    weekAvgRpe: week.avg,
  };
}

const PHASE_LABEL: Record<SeasonPhase, string> = {
  inseason: "w sezonie",
  preseason: "przygotowania do sezonu",
  offseason: "okres bez meczów",
  transition: "roztrenowanie",
  return_injury: "powrót po kontuzji",
};

interface CycleReviewCopy {
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

/** Club and matches are shown next to, never inside, the execution of the athlete's own goals. */
function externalFact(review: CycleReview): string | null {
  const e = review.external;
  if (!e || e.clubPlanned + e.matchPlanned + e.clubDone + e.matchDone === 0) return null;
  const parts = [
    e.clubPlanned > 0 ? `klub ${e.clubDone} z ${e.clubPlanned}` : null,
    e.matchPlanned > 0
      ? `mecze ${e.matchDone} z ${e.matchPlanned}${e.matchDone > 0 ? ` (${e.matchMinutesPlayed} min gry)` : ""}`
      : null,
  ].filter(Boolean);
  return parts.length ? `Poza własnymi celami: ${parts.join(", ")}` : null;
}
function externalLoadFact(review: CycleReview): string | null {
  const e = review.external;
  if (!e || (e.loadAu === 0 && e.withoutLoad === 0)) return null;
  const load = e.loadAu > 0 ? `${e.loadAu} j.` : null;
  const note = [
    e.loadUsesAssumedMinutes ? "czas klubu 90 min to założenie" : null,
    e.withoutLoad > 0 ? `brak RPE lub minut w ${e.withoutLoad} wpisach` : null,
  ].filter(Boolean);
  return `Obciążenie klubu i meczów: ${[load, ...note].filter(Boolean).join("; ")}`;
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
    externalFact(review),
    externalLoadFact(review),
    rpeFact(review),
    feelingFact(review),
    progressFact(review),
  ].filter((fact): fact is string => Boolean(fact));
  const next = PHASE_LABEL[review.phaseNext];
  const weeks = Math.max(1, Math.round((daysBetween(review.startDate, review.endDate) + 1) / 7));
  const weeklyTarget = Math.max(1, Math.ceil((review.planned / weeks) * CYCLE_RULES.goodAdherence));
  // Opis tego, co silnik naprawdę robi z nowym cyklem (cyclePolicy.ts, engineV2/cycleEffects.test.ts).
  const unknownExternal = (review.external?.withoutLoad ?? 0) > 0;
  const copy: Record<CycleRecommendationKind, [string, string]> = {
    health: [
      "Najpierw zdrowie",
      "Nowy plan: 2 lżejsze tygodnie na start (mniej serii). Zgłoś ból trenerowi lub fizjoterapeucie.",
    ],
    transition: ["Roztrenowanie", "Nowy plan: lżejszy pierwszy tydzień (mniej serii)."],
    deload: [
      "Lżejszy start",
      "Nowy plan: pierwszy tydzień lżejszy (mniej serii), potem zwykła dawka.",
    ],
    consistency: [
      "Najpierw regularność",
      `Nowy plan: główne ćwiczenie siłowe w dawce utrzymaniowej (do 2 serii, zapas co najmniej 3), bez akcentu siły maksymalnej. Celuj w ${trainingsLabel(weeklyTarget)} w tygodniu.`,
    ],
    maintain: [
      review.phaseNext === "inseason" ? "Utrzymanie formy w sezonie" : "Utrzymanie poziomu",
      `Nowy plan utrzymuje dawkę: główne ćwiczenie siłowe w dawce utrzymaniowej, bez akcentu siły maksymalnej i bez podwyżki skoków z siłowni.${
        unknownExternal
          ? " Brakuje RPE lub minut z klubu lub meczu; uzupełnij je, żeby ocena cyklu była pełna."
          : ""
      }`,
    ],
    vary: [
      "Zmiana bodźca",
      "Nowy plan: inne ćwiczenia siłowe z tych samych grup (zmiana bodźca, nie większa dawka). Ciężary porównujemy od nowa.",
    ],
    progress: [
      "Dalej według planu",
      "Nowy plan: zwykły blok, bez zmiany dawki. Dawka rośnie tylko po potwierdzonych zapisach serii; sam upływ czasu jej nie zwiększa.",
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
