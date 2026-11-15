import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { GYM_EXERCISE_RULES } from "../gymStrengthExercises";
import { scheduledMatchDates } from "../matchSchedule";
import { calculateOverallReadiness } from "../readinessModel";
import { dayDistance, plusDays, trainingTier, weekday } from "./model";
import type { Dose, EngineOptions, EngineSession, ExerciseDecision } from "./model";
import { gymPowerDose, strengthLandingCount } from "./gymPower";
import { eligibleExercise, estimateSessionSeconds } from "./exercises";

/** GP1 thresholds are conservative PRODUCT policy, not validated physiological cut-offs.
 * Evidence and limitations: docs/SILOWNIA-V28-PROGRESJA.md. */
export const GYM_PROGRESSION_POLICY = {
  version: "gym-progression-1",
  adultSuccesses: 2,
  youthSuccesses: 3,
  maxHistoryAgeDays: 14,
  maxExposureGapDays: 14,
  calibrationAgeDays: 30,
  maxBandStep: 0.05,
  minimumPerformanceRatio: 0.95,
  congestedDemandingDays: 4,
} as const;

export interface GymBandSetup {
  id: string;
  exerciseId: string;
  bandId: string;
  stationId: string;
  direction: "assistance" | "resistance";
  measuredOn: string;
  /** Same two defined movement positions across calibrations. */
  positions: [string, string];
  lengthsCm: [number, number];
  forceNewtons: [number, number];
}
export interface GymSetObservation {
  setNumber: number;
  side: "both" | "left" | "right";
  /** Repetitions on this side, or actual seconds for timed work. */
  completed: number;
  control: "stable" | "lost" | "unknown";
  /** Optional lowest measured performance in the set; never derived from a timer. */
  metric?: {
    kind: "jump_height_cm" | "cycles_per_second";
    method: "video_reviewed" | "device";
    value: number;
  };
}
export interface GymObservation {
  /** Explicit interruption report; no made-up repetitions are stored for an unfinished set. */
  controlLossReported?: true;
  /** Explicitly reported minimum across ALL working sets, not a copied per-set result. */
  minimumMetric?: NonNullable<GymSetObservation["metric"]>;
  sessionId: string;
  exerciseId: string;
  source: "athlete_observed" | "video_reviewed";
  sets: GymSetObservation[];
}
export interface GymProgressionInput {
  selectedBandSetups?: Record<string, string | null>;
  /** Only for an explicit, reviewable plan proposal. It never manufactures a readiness score. */
  proposalOnly?: boolean;
  /** Must be scoped to the authenticated athlete, like EngineOptions.completions. */
  observations: GymObservation[];
  bandSetups?: GymBandSetup[];
}
export type GymProgressionAction = "hold" | "progress" | "regress" | "deload" | "omit";
export interface GymProgressionDecision {
  action: GymProgressionAction;
  exerciseId: string;
  dose: Dose | null;
  reason: string;
  evidenceSessionIds: string[];
}
export interface GymWeekContext {
  asOfDate: string;
  date: string;
  readiness?: Readiness;
  nearestMatchDays: number;
  demandingDays7d: number;
  knownLandingsOther7d: number;
  /** Missing external load is unknown, never a zero. */
  unknownExternalLoad: boolean;
  repeatedHard: boolean;
  phase: EngineSession["phase"];
}
interface Exposure {
  sessionId: string;
  date: string;
  row: ExerciseDecision;
  phase: EngineSession["phase"];
  observation?: GymObservation;
}
const finitePositive = (n: number) => Number.isFinite(n) && n > 0;
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && plusDays(s, 0) === s;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const bandIds = new Set(["gym_cmj_assisted", "gym_cmj_resisted", "gym_fast_band_curl"]);
const jumpLadder = [
  [1, 2],
  [2, 2],
  [2, 3],
  [3, 3],
] as const;
const fallbackId = (id: string) =>
  id === "gym_cmj_assisted" || id === "gym_cmj_resisted"
    ? "gym_cmj"
    : id === "gym_lateral_bound"
      ? "gym_lateral_jump"
      : id;

/** Identity is the executed dose and setup, not the week number or completed timer. */
export const gymDoseKey = (d: Dose) =>
  JSON.stringify([
    d.sets,
    d.reps ?? null,
    d.seconds ?? null,
    !!d.perSide,
    d.restSeconds,
    d.intent,
    d.contactsPerRep ?? null,
    d.gymBandSetup ?? null,
  ]);

function setupValid(
  s: GymBandSetup | undefined,
  exerciseId: string,
  date: string,
): s is GymBandSetup {
  const expected = exerciseId === "gym_cmj_assisted" ? "assistance" : "resistance";
  return (
    !!s &&
    s.exerciseId === exerciseId &&
    s.direction === expected &&
    Array.isArray(s.positions) &&
    Array.isArray(s.lengthsCm) &&
    Array.isArray(s.forceNewtons) &&
    [s.id, s.bandId, s.stationId, ...s.positions].every(
      (v) => typeof v === "string" && v.length > 0,
    ) &&
    s.positions.length === 2 &&
    s.positions[0] !== s.positions[1] &&
    s.lengthsCm.length === 2 &&
    s.lengthsCm.every(finitePositive) &&
    s.forceNewtons.length === 2 &&
    s.forceNewtons.every(finitePositive) &&
    validDate(s.measuredOn) &&
    dayDistance(date, s.measuredOn) >= 0 &&
    dayDistance(date, s.measuredOn) <= GYM_PROGRESSION_POLICY.calibrationAgeDays
  );
}

/** Completed snapshots own identity/dose. Missing or duplicate observations break the streak. */
function exposures(
  role: ExerciseDecision["role"],
  variant: "strengthA" | "strengthB",
  ctx: GymWeekContext,
  completions: Record<string, SessionCompletion>,
  input?: GymProgressionInput,
): Exposure[] {
  const seen = new Set<string>();
  return Object.entries(completions)
    .flatMap<Exposure>(([sessionId, c]) => {
      const s = c.executionSnapshot;
      if (
        !c.completed ||
        c.status === "started" ||
        c.status === "missed" ||
        !s?.engineV2 ||
        s.dbId !== sessionId ||
        !validDate(s.date) ||
        s.date > ctx.asOfDate ||
        s.date >= ctx.date ||
        !s.engineV2.roles.includes(variant) ||
        seen.has(`${s.date}:${variant}`)
      )
        return [];
      seen.add(`${s.date}:${variant}`);
      const rows = s.engineV2.exercises.filter((r) => r.role === role);
      // An omitted/ambiguous task interrupts evidence; do not reach behind it for successes.
      if (rows.length !== 1)
        return [
          {
            sessionId,
            date: s.date,
            phase: s.engineV2.phase,
            row: {
              exerciseId: "unknown",
              role,
              dose: { sets: 0, restSeconds: 0, intent: "controlled" as const },
              reason: "",
            },
          },
        ];
      const obs =
        input?.observations.filter(
          (o) => o.sessionId === sessionId && o.exerciseId === rows[0].exerciseId,
        ) ?? [];
      return [
        {
          sessionId,
          date: s.date,
          row: rows[0],
          phase: s.engineV2.phase,
          observation: obs.length === 1 ? obs[0] : undefined,
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function observationStatus(e: Exposure): "stable" | "lost" | "unknown" {
  const o = e.observation,
    d = e.row.dose;
  if (!o || !["athlete_observed", "video_reviewed"].includes(o.source) || !Array.isArray(o.sets))
    return "unknown";
  // A reported loss stops progression even if the athlete stopped before all sets were done.
  if (o.controlLossReported || o.sets.some((s) => s.control === "lost")) return "lost";
  if (
    o.sets.some(
      (s) =>
        s.metric &&
        (!finitePositive(s.metric.value) ||
          !["video_reviewed", "device"].includes(s.metric.method)),
    )
  )
    return "unknown";
  const sides = d.perSide ? ["left", "right"] : ["both"];
  const units = d.seconds ?? d.reps;
  if (!finitePositive(units ?? 0) || o.sets.length !== d.sets * sides.length) return "unknown";
  for (let n = 1; n <= d.sets; n++)
    for (const side of sides) {
      const entries = o.sets.filter((s) => s.setNumber === n && s.side === side);
      if (entries.length !== 1 || entries[0].control !== "stable" || entries[0].completed !== units)
        return "unknown";
    }
  return "stable";
}

function performance(e: Exposure): { value: number; method: string; kind: string } | null {
  if (
    !["gym_cmj", "gym_cmj_assisted", "gym_cmj_resisted", "gym_fast_band_curl"].includes(
      e.row.exerciseId,
    )
  )
    return null;
  const minimum = e.observation?.minimumMetric;
  if (minimum) {
    const expected =
      e.row.exerciseId === "gym_fast_band_curl" ? "cycles_per_second" : "jump_height_cm";
    return observationStatus(e) === "stable" &&
      finitePositive(minimum.value) &&
      minimum.kind === expected &&
      ["video_reviewed", "device"].includes(minimum.method)
      ? minimum
      : null;
  }
  const metrics = e.observation?.sets.map((s) => s.metric);
  if (
    !metrics?.length ||
    metrics.some(
      (m) => !m || !finitePositive(m.value) || !["video_reviewed", "device"].includes(m.method),
    )
  )
    return null;
  const first = metrics[0]!;
  if (metrics.some((m) => m!.kind !== first.kind || m!.method !== first.method)) return null;
  const kind = e.row.exerciseId === "gym_fast_band_curl" ? "cycles_per_second" : "jump_height_cm";
  if (first.kind !== kind) return null;
  return { value: Math.min(...metrics.map((m) => m!.value)), method: first.method, kind };
}

function nextBandSetup(current: GymBandSetup, candidates: GymBandSetup[], date: string) {
  // More assistance is NOT a generic increase in difficulty. Never auto-change it.
  if (current.direction === "assistance") return undefined;
  return candidates
    .filter(
      (s) =>
        setupValid(s, current.exerciseId, date) &&
        s.id !== current.id &&
        s.bandId === current.bandId &&
        s.stationId === current.stationId &&
        same(s.positions, current.positions) &&
        s.forceNewtons.every(
          (force, i) =>
            force >= current.forceNewtons[i] &&
            force <= current.forceNewtons[i] * (1 + GYM_PROGRESSION_POLICY.maxBandStep) + 1e-9,
        ) &&
        s.forceNewtons.some((force, i) => force > current.forceNewtons[i]),
    )
    .sort(
      (a, b) =>
        Math.max(...a.forceNewtons) - Math.max(...b.forceNewtons) || a.id.localeCompare(b.id),
    )[0];
}

/** Bounds are shared with independent saved-plan validation. No extra power session. */
export function gymDoseWithinBounds(
  id: string,
  d: Dose,
  p: Profile,
  phase: EngineSession["phase"],
  date?: string,
) {
  if (
    !GYM_EXERCISE_RULES[id] ||
    !Number.isInteger(d.sets) ||
    d.sets < 1 ||
    !Number.isFinite(d.restSeconds)
  )
    return false;
  if (
    d.gymBandSetup &&
    (!bandIds.has(id) || !setupValid(d.gymBandSetup, id, date ?? d.gymBandSetup.measuredOn))
  )
    return false;
  if (GYM_EXERCISE_RULES[id].timedDynamic)
    return (
      !d.perSide &&
      d.reps === undefined &&
      d.distanceM === undefined &&
      d.rir === undefined &&
      d.intent === "controlled" &&
      d.sets <= (phase === "peak" && id === "gym_bridge_pulses" ? 1 : 2) &&
      d.seconds === (id === "gym_fast_band_curl" ? 4 : 8) &&
      d.restSeconds >= (id === "gym_fast_band_curl" ? 300 : 60)
    );
  if (id === "gym_step_brake")
    return d.sets === 1 && d.reps === 2 && !!d.perSide && d.restSeconds >= 45;
  const cap = gymPowerDose(id, p, phase);
  return (
    !d.seconds &&
    !d.distanceM &&
    d.rir === undefined &&
    d.intent === "explosive" &&
    Number.isInteger(d.reps) &&
    d.reps! >= 2 &&
    d.reps! <= cap.reps! &&
    d.sets <= cap.sets &&
    !!d.perSide === !!cap.perSide &&
    d.contactsPerRep === 1 &&
    d.restSeconds >= cap.restSeconds
  );
}

export function decideGymProgression(
  requested: ExerciseDecision,
  p: Profile,
  variant: "strengthA" | "strengthB",
  ctx: GymWeekContext,
  completions: Record<string, SessionCompletion>,
  input?: GymProgressionInput,
): GymProgressionDecision {
  const evidence = exposures(requested.role, variant, ctx, completions, input);
  const latest = evidence[0];
  const result = (
    action: GymProgressionAction,
    id: string,
    dose: Dose | null,
    reason: string,
    rows: Exposure[] = [],
  ) => ({ action, exerciseId: id, dose, reason, evidenceSessionIds: rows.map((e) => e.sessionId) });
  const hold = (dose: Dose, reason: string, id = requested.exerciseId) =>
    result("hold", id, dose, reason);
  const fallback = fallbackId(requested.exerciseId);
  const historyId =
    latest && [requested.exerciseId, fallback].includes(latest.row.exerciseId)
      ? latest.row.exerciseId
      : requested.exerciseId;
  const usable =
    latest?.row.exerciseId === historyId &&
    gymDoseWithinBounds(historyId, latest.row.dose, p, ctx.phase) &&
    (!input?.selectedBandSetups ||
      !Object.hasOwn(input.selectedBandSetups, requested.exerciseId) ||
      latest.row.exerciseId !== requested.exerciseId ||
      (latest.row.dose.gymBandSelectionId ?? null) === (requested.dose.gymBandSelectionId ?? null));
  const current = { ...(usable ? latest.row.dose : requested.dose) };
  const id = usable ? historyId : requested.exerciseId;
  const timed = !!GYM_EXERCISE_RULES[id]?.timedDynamic;
  const readiness = ctx.readiness;
  const readinessScore =
    readiness &&
    readiness.date === ctx.date &&
    [
      readiness.sleep,
      readiness.fatigue,
      readiness.soreness,
      readiness.stress,
      readiness.overall,
    ].every((n) => Number.isFinite(n) && n >= 1 && n <= 10)
      ? Math.min(readiness.overall, calculateOverallReadiness(readiness))
      : undefined;
  const reduce = (action: "regress" | "deload", why: string) => {
    if (timed) return result("omit", id, null, why, latest ? [latest] : []);
    const reducedId = fallbackId(id);
    const dose = {
      ...gymPowerDose(reducedId, p, "deload"),
      restSeconds: Math.max(current.restSeconds, gymPowerDose(reducedId, p, ctx.phase).restSeconds),
    };
    const cap = p.age < 16 ? 36 : p.age < 18 ? 48 : 60;
    if (ctx.knownLandingsOther7d + 2 * (dose.perSide ? 2 : 1) > cap)
      return result("omit", reducedId, null, why, latest ? [latest] : []);
    return result(action, reducedId, dose, why, latest ? [latest] : []);
  };
  if (id === "gym_step_brake")
    return hold(
      { ...requested.dose },
      "Spokojny krok pozostaje nauką zatrzymania; bez automatycznego przyspieszania.",
    );
  if (!eligibleExercise(requested.exerciseId, p))
    return result(
      "omit",
      requested.exerciseId,
      null,
      "Wiek, poziom lub wyposażenie nie kwalifikują do tego wariantu.",
    );
  if (
    ctx.phase === "deload" ||
    ctx.repeatedHard ||
    (readinessScore !== undefined && readinessScore <= 4)
  )
    return reduce(
      "deload",
      "Lżejsza ekspozycja: znany wariant, mało prób i pełne przerwy; bez odrabiania objętości.",
    );
  const recent =
    latest && dayDistance(ctx.asOfDate, latest.date) <= GYM_PROGRESSION_POLICY.maxHistoryAgeDays;
  if (latest && !recent)
    return reduce(
      "regress",
      "Przerwa ponad 14 dni: powrót od małej dawki bez wnioskowania o utracie siły.",
    );
  if (current.gymBandSetup && !setupValid(current.gymBandSetup, id, ctx.date))
    return reduce(
      "regress",
      "Ustawienie gumy wymaga ponownego pomiaru; nie przedłużamy ważności kalibracji samym ukończeniem sesji.",
    );
  if (recent && observationStatus(latest) === "lost")
    return reduce(
      "regress",
      "Zapisana utrata kontroli: prostszy skok lub pominięcie dynamicznego dodatku.",
    );
  if (ctx.nearestMatchDays <= 2)
    return reduce(
      "deload",
      "Mecz w odległości do dwóch dni: mniejsza dawka skoków, bez dynamicznego dodatku tyłu uda.",
    );
  const cap = p.age < 16 ? 36 : p.age < 18 ? 48 : 60;
  if (
    !timed &&
    ctx.knownLandingsOther7d + current.sets * (current.reps ?? 0) * (current.perSide ? 2 : 1) > cap
  )
    return reduce("deload", "Limit znanych lądowań w 7 dniach: ograniczono dodatek do siły.");
  if (
    ctx.phase === "adaptation" ||
    ctx.phase === "peak" ||
    (ctx.date !== ctx.asOfDate && !input?.proposalOnly) ||
    ctx.unknownExternalLoad ||
    ctx.demandingDays7d >= GYM_PROGRESSION_POLICY.congestedDemandingDays ||
    (readinessScore === undefined && !input?.proposalOnly) ||
    (readinessScore !== undefined && readinessScore < 7)
  )
    return hold(
      current,
      "Bez podwyżki: faza, termin, niepełna gotowość lub obciążenie tygodnia nie pozwalają potwierdzić progresji.",
      id,
    );
  const needed =
    p.age < 18 || trainingTier(p) === "foundation" || id !== requested.exerciseId
      ? GYM_PROGRESSION_POLICY.youthSuccesses
      : GYM_PROGRESSION_POLICY.adultSuccesses;
  const rows = evidence.slice(0, needed);
  if (
    !recent ||
    rows.length !== needed ||
    rows.some(
      (e, i) =>
        e.row.exerciseId !== id ||
        e.phase !== "development" ||
        observationStatus(e) !== "stable" ||
        gymDoseKey(e.row.dose) !== gymDoseKey(current) ||
        (i > 0 &&
          dayDistance(rows[i - 1].date, e.date) > GYM_PROGRESSION_POLICY.maxExposureGapDays),
    )
  )
    return hold(
      current,
      "Utrzymaj dawkę: potrzeba kolejnych porównywalnych ekspozycji z jawną obserwacją kontroli; timer i RPE nie zastępują jakości.",
      id,
    );
  const metrics = rows.map(performance);
  if (
    metrics.every((m) => m !== null) &&
    metrics.every((m) => m!.method === metrics[0]!.method && m!.kind === metrics[0]!.kind) &&
    metrics[0]!.value <
      Math.max(...metrics.map((m) => m!.value)) * GYM_PROGRESSION_POLICY.minimumPerformanceRatio
  )
    return reduce(
      "regress",
      "Porównywalny pomiar pogorszył się o ponad 5%: ostrożna redukcja, nie diagnoza zmęczenia.",
    );
  let next = { ...current },
    nextId = id;
  if (id !== requested.exerciseId) {
    nextId = requested.exerciseId;
    next = { ...requested.dose, sets: 1, reps: 2 };
  } else if (timed) {
    if (current.sets < 2) next.sets = 2;
  } else {
    const contacts = current.sets * (current.reps ?? 0);
    const step = jumpLadder.find(
      ([sets, reps]) =>
        sets * reps > contacts && sets <= requested.dose.sets && reps <= requested.dose.reps!,
    );
    if (step) [next.sets, next.reps] = step;
  }
  // Band intensity changes only at the volume ceiling, using like-for-like measured performance.
  if (
    gymDoseKey(next) === gymDoseKey(current) &&
    setupValid(current.gymBandSetup, id, ctx.asOfDate) &&
    metrics.every((m) => m !== null) &&
    metrics.every((m) => m!.method === metrics[0]!.method && m!.kind === metrics[0]!.kind)
  ) {
    // The 2017 HVT study increased resistance after two extra movements in 4 s.
    // Here the like-for-like minimum set frequency must improve by >=0.5/s first.
    const frequencyReady =
      id !== "gym_fast_band_curl" || metrics[0]!.value - metrics[metrics.length - 1]!.value >= 0.5;
    const setup = frequencyReady
      ? nextBandSetup(current.gymBandSetup, input?.bandSetups ?? [], ctx.asOfDate)
      : undefined;
    if (setup) next.gymBandSetup = structuredClone(setup);
  }
  const contacts = timed ? 0 : next.sets * (next.reps ?? 0) * (next.perSide ? 2 : 1);
  if (ctx.knownLandingsOther7d + contacts > cap)
    return reduce(
      "deload",
      "Limit znanych lądowań w ruchomych 7 dniach: zmniejszono dodatek zamiast dokładać próby.",
    );
  if (gymDoseKey(next) === gymDoseKey(current) && nextId === id)
    return hold(
      current,
      "Osiągnięto małą dawkę docelową. Poprawiaj jakość przy tej dawce; bez automatycznego zwiększania asysty, czasu lub przypadkowej gumy.",
      id,
    );
  return result(
    "progress",
    nextId,
    next,
    "Jeden krok po porównywalnych jakościowych ekspozycjach; bez skracania przerw i jednoczesnej zmiany objętości oraz oporu.",
    rows,
  );
}

const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];

/** Dated context includes club, matches, sprint, strength and hard endurance; no ACWR risk score. */
export function gymWeekContext(
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[],
  phase: EngineSession["phase"],
): GymWeekContext {
  const asOfDate = options.asOfDate ?? options.startDate;
  const unique = new Map<string, SessionDay>();
  const slotKey = (s: SessionDay) => `${s.date}:${s.engineV2?.roles.join() ?? s.dayType}`;
  for (const d of [
    ...(options.previousPlan ?? []),
    ...(options.precedingDays ?? []),
    ...days,
  ].flatMap(slots))
    unique.set(slotKey(d), d);
  for (const c of Object.values(options.completions ?? {})) {
    const s = c.executionSnapshot;
    if (c.completed && s?.dbId) unique.set(slotKey(s), s);
  }
  const window = [...unique.values()].filter(
    (s) =>
      (s.date < date || (s.date === date && ["club", "match"].includes(s.dayType))) &&
      dayDistance(date, s.date) < 7,
  );
  const demanding = new Set<string>();
  let knownLandingsOther7d = 0,
    unknownExternalLoad = false;
  for (const s of window) {
    const c = s.dbId ? options.completions?.[s.dbId] : undefined;
    if (c?.status === "missed") continue;
    const external = s.dayType === "match" || s.dayType === "club";
    if (external) {
      const rpe = c?.rpe;
      if (s.date < asOfDate && (!c?.completed || !Number.isFinite(rpe) || rpe! < 1 || rpe! > 10))
        unknownExternalLoad = true;
      if (s.dayType === "match" || !c?.completed || (rpe ?? 10) >= 7) demanding.add(s.date);
    } else if (s.engineV2?.highLower) demanding.add(s.date);
    // Historical plans are not performed work without a completed log; future placed work is budgeted.
    if (s.engineV2 && (s.date >= asOfDate || c?.completed))
      knownLandingsOther7d += strengthLandingCount(s.engineV2.exercises);
  }
  // An absent calendar row does not prove that a declared club session did not take place.
  const pastMatches = new Set(scheduledMatchDates(p, plusDays(date, -6), 7));
  for (let i = 1; i < 7; i++) {
    const past = plusDays(date, -i);
    if (past >= asOfDate || (!p.clubTrainingDays.includes(weekday(past)) && !pastMatches.has(past)))
      continue;
    const saved = window.find((s) => s.date === past && ["club", "match"].includes(s.dayType));
    if (!saved) {
      unknownExternalLoad = true;
      demanding.add(past);
    }
  }
  // Include the new strength day once; count days rather than treating two slots as independent recovery.
  demanding.add(date);
  // The remaining week matters as well: do not increase Monday's work before a dense club/match week.
  const ahead = new Set<string>([date]);
  const futureMatches = new Set(scheduledMatchDates(p, date, 7));
  for (let i = 0; i < 7; i++) {
    const next = plusDays(date, i);
    if (
      p.clubTrainingDays.includes(weekday(next)) ||
      futureMatches.has(next) ||
      [...unique.values()].some((s) => s.date === next && s.engineV2?.highLower)
    )
      ahead.add(next);
  }
  const hard = Object.values(options.completions ?? {}).filter(
    (c) =>
      c.completed &&
      c.status !== "missed" &&
      c.executionSnapshot?.date &&
      c.executionSnapshot.date < asOfDate &&
      dayDistance(asOfDate, c.executionSnapshot.date) < 7 &&
      typeof c.rpe === "number" &&
      c.rpe >= 9 &&
      c.rpe <= 10,
  );
  return {
    asOfDate,
    date,
    phase,
    readiness: options.readiness?.[date],
    nearestMatchDays: Math.min(
      99,
      ...scheduledMatchDates(p, plusDays(date, -7), 15).map((m) => Math.abs(dayDistance(date, m))),
    ),
    demandingDays7d: Math.max(demanding.size, ahead.size),
    knownLandingsOther7d,
    unknownExternalLoad,
    repeatedHard:
      dayDistance(date, asOfDate) < 7 &&
      new Set(hard.map((c) => c.executionSnapshot!.date)).size >= 2,
  };
}

/** Pure candidate transformation before placement/rendering. Locked execution is handled upstream. */
export function applyGymProgression(
  recipe: EngineSession,
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[],
): EngineSession {
  const variant = recipe.roles.includes("strengthA")
    ? "strengthA"
    : recipe.roles.includes("strengthB")
      ? "strengthB"
      : null;
  if (
    !variant ||
    !recipe.exercises.some((row) => GYM_EXERCISE_RULES[row.exerciseId] && row.role !== "landing")
  )
    return recipe;
  const ctx = gymWeekContext(p, date, options, days, recipe.phase);
  const copy = structuredClone(recipe);
  copy.gymProgressionDecisions = [];
  copy.exercises = copy.exercises.flatMap((row) => {
    if (!GYM_EXERCISE_RULES[row.exerciseId] || row.role === "landing") return [row];
    const selectedId = options.gymProgression?.selectedBandSetups?.[row.exerciseId];
    const setup = options.gymProgression?.bandSetups?.find(
      (s) => s.id === selectedId && setupValid(s, row.exerciseId, date),
    );
    const request = setup
      ? { ...row, dose: { ...row.dose, gymBandSetup: setup, gymBandSelectionId: setup.id } }
      : row;
    const decision = decideGymProgression(
      request,
      p,
      variant,
      ctx,
      options.completions ?? {},
      options.gymProgression,
    );
    copy.gymProgressionDecisions!.push(decision);
    if (!decision.dose || !eligibleExercise(decision.exerciseId, p)) return [];
    const appliedSetup = decision.dose.gymBandSetup;
    return [
      {
        ...row,
        exerciseId: decision.exerciseId,
        dose: decision.dose,
        reason: `${row.reason}${decision.action === "hold" ? "" : ` ${decision.reason}`}${appliedSetup ? ` Ustawienie gumy: ${appliedSetup.id}; pozycje ${appliedSetup.positions.join(" / ")}, długości ${appliedSetup.lengthsCm.join(" / ")} cm, siły ${appliedSetup.forceNewtons.join(" / ")} N.` : ""}`,
      },
    ];
  });
  // Contrast rounds share a set count; do not silently alter only half of a linked pair.
  if (copy.organization === "contrast") {
    const primary = copy.exercises.find((e) => ["knee_strength", "hip_strength"].includes(e.role));
    const power = copy.exercises.find((e) => e.role === "power");
    if (primary && power)
      primary.dose.sets = power.dose.sets = Math.min(primary.dose.sets, power.dose.sets);
    else copy.organization = "straight";
  }
  copy.plyometricContacts = strengthLandingCount(copy.exercises);
  copy.minutes = Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + 8;
  return copy;
}
