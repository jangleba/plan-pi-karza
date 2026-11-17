import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { readinessScore as readinessScoreOf } from "../readinessModel";
import { scheduledMatchDates } from "../matchSchedule";
import {
  preparationProfile,
  hasVerifiedAdvancedStrength,
  hasValidStrengthMonths,
} from "./preparation";
import { resolveGoalPolicy } from "./goalPolicy";
import { getExerciseDefinition } from "../exerciseLibrary";
import { estimateSessionSeconds } from "./exercises";
import { cycleStartEffect } from "./cycle";
import { strengthLandingCount } from "./gymPower";
import { isStrengthSession, strengthPreference } from "../strengthCheckIn";
import { dayDistance, plusDays, type EngineOptions, type EngineSession } from "./model";
import { removeClusterProtocol } from "./strengthProtocols";
import { strengthPreparationOverhead } from "./strengthPreparation";

/** SP1 is product policy informed by literature, not a diagnosis or measured strength deficit. */
export type StrengthMode =
  | "foundation"
  | "strength_build"
  | "max_strength"
  | "power_support"
  | "maintenance"
  | "deload"
  | "reentry";
export interface StrengthFocus {
  version: "strength-policy-1";
  mode: StrengthMode;
  priority: "development" | "support" | "maintenance" | "recovery";
  label: string;
  reason: string;
  /** No body mass, estimated 1RM or football position is used to invent a strength deficit. */
  basis: "declared_goal_and_preparation" | "calendar_and_execution" | "foundation";
}
export interface StrengthWeekContext {
  date: string;
  asOfDate: string;
  matches7d: number;
  nearestMatchDays: number;
  hardDays7d: number;
  unknownPastExternalLoad: boolean;
  repeatedHard: boolean;
  strengthGapDays: number | null;
  readinessScore?: number;
  /** Explicit preferences in the last three completed strength sessions, within 14 days. */
  lighterRequests?: number;
  /** The cycle recommendation "consistency"/"maintain" is in force: hold the dose, no strength emphasis. */
  cycleHold?: boolean;
}
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && plusDays(s, 0) === s;
const done = (c: SessionCompletion) =>
  c.completed && c.status !== "started" && c.status !== "missed";
const slots = (s: SessionDay) => [s, ...(s.secondSession ? [s.secondSession] : [])];

export function strengthWeekContext(
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[] = [],
): StrengthWeekContext {
  const asOfDate = options.asOfDate ?? options.startDate;
  const matches = scheduledMatchDates(p, plusDays(date, -6), 13);
  const completions = Object.values(options.completions ?? {}).filter(
    (c) =>
      done(c) &&
      c.executionSnapshot &&
      validDate(c.executionSnapshot.date) &&
      c.executionSnapshot.date <= asOfDate,
  );
  const recent = completions.filter(
    (c) =>
      dayDistance(date, c.executionSnapshot!.date) > 0 &&
      dayDistance(date, c.executionSnapshot!.date) < 7,
  );
  const hardDays = new Set(
    recent
      .filter(
        (c) =>
          (c.executionSnapshot!.dayType === "match" && c.matchMinutesPlayed !== 0) ||
          c.executionSnapshot!.engineV2?.highLower ||
          (c.rpe !== null && c.rpe >= 8),
      )
      .map((c) => c.executionSnapshot!.date),
  );
  const known = new Map<string, SessionDay>();
  for (const s of [
    ...(options.previousPlan ?? []),
    ...(options.precedingDays ?? []),
    ...days,
  ].flatMap(slots))
    known.set(`${s.date}:${s.dayType}`, s);
  for (const c of completions)
    known.set(`${c.executionSnapshot!.date}:${c.executionSnapshot!.dayType}`, c.executionSnapshot!);
  let unknownPastExternalLoad = false;
  for (let i = 1; i < 7; i++) {
    const past = plusDays(date, -i);
    if (past >= asOfDate) continue;
    const weekday = new Date(`${past}T12:00:00Z`).getUTCDay() || 7;
    const expected = matches.includes(past)
      ? "match"
      : p.clubTrainingDays.includes(weekday)
        ? "club"
        : null;
    if (!expected) continue;
    const s = known.get(`${past}:${expected}`);
    const c = s?.dbId ? options.completions?.[s.dbId] : undefined;
    if (c?.status === "missed") continue;
    if (
      !c ||
      !done(c) ||
      typeof c.rpe !== "number" ||
      !Number.isFinite(c.rpe) ||
      c.rpe < 1 ||
      c.rpe > 10
    )
      unknownPastExternalLoad = true;
  }
  const strengthDates = completions
    .filter((c) => c.executionSnapshot!.engineV2?.roles.some((r) => r.startsWith("strength")))
    .map((c) => c.executionSnapshot!.date)
    .sort()
    .reverse();
  const readiness: Readiness | undefined =
    p.healthPersonalizationEnabled === true ? options.readiness?.[date] : undefined;
  const strengthRecent = [
    ...new Map(
      completions
        .filter(
          (c) =>
            isStrengthSession(c.executionSnapshot!) &&
            dayDistance(asOfDate, c.executionSnapshot!.date) >= 0 &&
            dayDistance(asOfDate, c.executionSnapshot!.date) <= 14,
        )
        .sort((a, b) => b.executionSnapshot!.date.localeCompare(a.executionSnapshot!.date))
        .map(
          (c) =>
            [
              c.executionSnapshot!.dbId ??
                `${c.executionSnapshot!.date}:${c.executionSnapshot!.engineV2!.roles.join(",")}`,
              c,
            ] as const,
        ),
    ).values(),
  ].slice(0, 3);
  const readinessScore = readiness?.date === date ? readinessScoreOf(readiness) : undefined;
  return {
    date,
    asOfDate,
    matches7d: matches.filter((m) => m >= date && dayDistance(m, date) < 7).length,
    nearestMatchDays: Math.min(99, ...matches.map((m) => Math.abs(dayDistance(m, date)))),
    hardDays7d: hardDays.size,
    unknownPastExternalLoad,
    repeatedHard:
      dayDistance(date, asOfDate) < 7 &&
      new Set(
        recent
          .filter((c) => c.rpe !== null && c.rpe >= 9 && c.rpe <= 10)
          .map((c) => c.executionSnapshot!.date),
      ).size >= 2,
    strengthGapDays: strengthDates[0] ? dayDistance(asOfDate, strengthDates[0]) : null,
    readinessScore,
    cycleHold: cycleStartEffect(options).hold,
    lighterRequests: strengthRecent.filter(
      (c) =>
        strengthPreference(c.executionSnapshot!) === "lighter" ||
        options.strengthLoadResponses?.some(
          (r) =>
            r.sessionId === c.executionSnapshot!.dbId &&
            r.decision === "lighter" &&
            c.executionSnapshot!.engineV2?.exercises.some(
              (e) =>
                e.exerciseId === r.exerciseId && ["knee_strength", "hip_strength"].includes(e.role),
            ),
        ),
    ).length,
  };
}

/** Chronological thresholds and supervision gate are explicit product choices, not biological cut-offs. */
export function maximalStrengthEligible(p: Profile): boolean {
  if (!p.hasGym) return false;
  if (hasVerifiedAdvancedStrength(p)) return true;
  return (
    p.age >= 16 &&
    ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
    hasValidStrengthMonths(p, 12) &&
    p.movementCompetence === "high" &&
    p.supervisionLevel === "full"
  );
}

export function chooseStrengthFocus(
  p: Profile,
  phase: EngineSession["phase"],
  ctx: StrengthWeekContext,
): StrengthFocus {
  const result = (
    mode: StrengthMode,
    priority: StrengthFocus["priority"],
    label: string,
    reason: string,
    basis: StrengthFocus["basis"],
  ): StrengthFocus => ({ version: "strength-policy-1", mode, priority, label, reason, basis });
  if (ctx.strengthGapDays !== null && ctx.strengthGapDays >= 14)
    return result(
      "reentry",
      "recovery",
      "Powrót do obciążeń",
      "Przerwa od potwierdzonej siłowni: mniej serii, większy zapas i dobór ciężaru w rozgrzewce; bez odrabiania sesji.",
      "calendar_and_execution",
    );
  if (
    phase === "deload" ||
    ctx.repeatedHard ||
    (ctx.readinessScore !== undefined && ctx.readinessScore <= 4) ||
    resolveGoalPolicy(p).reduced ||
    p.seasonPhase === "transition"
  )
    return result(
      "deload",
      "recovery",
      "Lżejszy tydzień",
      "Zmniejsz stres treningowy; najpierw objętość, a ciężar także wtedy, gdy wykonanie lub zapas wskazują na potrzebę redukcji.",
      "calendar_and_execution",
    );
  if (
    phase === "peak" ||
    ctx.matches7d >= 2 ||
    ctx.nearestMatchDays <= 2 ||
    (p.clubStrengthDays?.length ?? 0) >= 2 ||
    ctx.hardDays7d >= 4 ||
    (ctx.lighterRequests ?? 0) >= 2 ||
    ctx.cycleHold
  )
    return result(
      "maintenance",
      "maintenance",
      "Utrzymanie siły",
      ctx.cycleHold && (ctx.lighterRequests ?? 0) < 2
        ? "Podsumowanie poprzedniego cyklu zaleciło utrzymanie: główne ćwiczenie w dawce utrzymaniowej (do 2 serii, zapas co najmniej 3), bez akcentu siły maksymalnej. Kolejny tydzień sam nie zwiększa dawki."
        : (ctx.lighterRequests ?? 0) >= 2
          ? "W co najmniej dwóch z trzech ostatnich siłowni wybrano mniejszy ciężar: utrzymaj mniejszą dawkę i sprawdź wykonanie. Sama preferencja nie rozpoznaje zmęczenia ani utraty siły."
          : "Kalendarz lub faza przemawiają za mniejszą liczbą serii. Nie obniżaj ciężaru tylko dlatego, że celem jest utrzymanie; zachowaj wymagany zapas.",
      "calendar_and_execution",
    );
  const priority =
    p.goal === "strength" ||
    p.secondaryLimiter === "strength" ||
    resolveGoalPolicy(p).firstAccent === "strength";
  const prep = preparationProfile(p);
  if (prep.tier === "foundation" || prep.provisional || phase === "adaptation")
    return result(
      "foundation",
      "development",
      "Podstawy siły",
      "Utrwalaj wykonanie i regularność. Poziom piłkarski nie potwierdza przygotowania do ciężkich niskich zakresów powtórzeń.",
      "foundation",
    );
  if (priority && maximalStrengthEligible(p))
    return result(
      "max_strength",
      "development",
      "Akcent siły maksymalnej",
      "Priorytet siły wynika z celu i zadeklarowanego przygotowania, nie z wykrytego deficytu. Ciężkie serie z zapasem, bez prób 1RM; przegląd po bloku.",
      "declared_goal_and_preparation",
    );
  if (priority)
    return result(
      "strength_build",
      "development",
      "Budowanie siły",
      "Buduj siłę w umiarkowanym zakresie powtórzeń i zwiększaj obciążenie po powtarzalnym wykonaniu. Nie odblokowano ciężkiego niskiego zakresu.",
      "declared_goal_and_preparation",
    );
  return result(
    "power_support",
    "support",
    "Siła wspierająca grę",
    "Utrzymuj i stopniowo rozwijaj bazę siłową obok mocy i szybkości. Brak pomiaru nie pozwala stwierdzić, że potrzebujesz coraz większego akcentu siły maksymalnej.",
    "declared_goal_and_preparation",
  );
}

/** Applies only to the existing main loaded lift; no new sessions, primary lifts or maximal tests. */
export function applyStrengthFocus(
  recipe: EngineSession,
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[],
): EngineSession {
  const variant = recipe.roles.includes("strengthA")
    ? "A"
    : recipe.roles.includes("strengthB")
      ? "B"
      : null;
  if (!variant) return recipe;
  const copy = structuredClone(recipe);
  const focus = chooseStrengthFocus(p, recipe.phase, strengthWeekContext(p, date, options, days));
  copy.strengthFocus = focus;
  const primary = copy.exercises.find(
    (e) => e.role === (variant === "A" ? "knee_strength" : "hip_strength"),
  );
  // Feedback can re-place an already-finalized recipe. Replace its old focus
  // explanation rather than appending the same paragraph on every recalculation.
  const oldReason = recipe.strengthFocus?.reason;
  if (primary && oldReason && primary.reason.endsWith(` ${oldReason}`))
    primary.reason = primary.reason.slice(0, -(oldReason.length + 1));
  const recovery = ["deload", "reentry"].includes(focus.mode);
  if (
    focus.mode === "max_strength" &&
    (!primary ||
      recipe.variant === "compact" ||
      primary.dose.cluster ||
      recipe.organization === "contrast" ||
      !["external", "axial"].includes(getExerciseDefinition(primary.exerciseId)?.loadingType ?? ""))
  )
    copy.strengthFocus = {
      ...focus,
      mode: "strength_build",
      label: "Siła w wybranym wariancie",
      reason:
        "Bieżąca metoda, dostępne ćwiczenie lub krótki wariant zachowują własną dawkę; nie oznaczamy ich jako nowego akcentu siły maksymalnej.",
    };
  if (recovery) {
    copy.exercises = copy.exercises.filter((e) => e.role !== "iso_primer");
    for (const e of copy.exercises) {
      removeClusterProtocol(e);
      if (e.role === "power") e.dose.sets = Math.min(1, e.dose.sets);
    }
    if (copy.organization === "contrast") {
      copy.organization = "power_first";
      const powerIndex = copy.exercises.findIndex((e) => e.role === "power");
      const mainIndex = copy.exercises.findIndex((e) => e === primary);
      if (powerIndex > mainIndex && mainIndex >= 0) {
        const [power] = copy.exercises.splice(powerIndex, 1);
        copy.exercises.splice(mainIndex, 0, power);
      }
    }
  }
  // Explicit specialist methods retain their reviewed dose, rounds and rests.
  if (
    !primary ||
    (recipe.variant === "compact" &&
      !(
        recipe.strengthStructure === "athletic_ab" &&
        ["maintenance", "power_support", "deload", "reentry"].includes(focus.mode)
      )) ||
    (!recovery && primary.dose.cluster) ||
    (!recovery && recipe.organization === "contrast") ||
    !["external", "axial"].includes(getExerciseDefinition(primary.exerciseId)?.loadingType ?? "") ||
    focus.mode === "foundation"
  ) {
    copy.minutes =
      Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + strengthPreparationOverhead(copy);
    copy.plyometricContacts = strengthLandingCount(copy.exercises);
    return copy;
  }
  const base = primary.dose;
  if (focus.mode === "max_strength")
    primary.dose = {
      ...base,
      sets: 3,
      reps: hasVerifiedAdvancedStrength(p) ? 4 : 5,
      rir: hasVerifiedAdvancedStrength(p) ? 2 : 3,
      restSeconds: Math.max(180, base.restSeconds),
    };
  else if (focus.mode === "strength_build")
    primary.dose = {
      ...base,
      sets: 3,
      reps: 6,
      rir: 3,
      restSeconds: Math.max(150, base.restSeconds),
    };
  else if (["maintenance", "power_support"].includes(focus.mode))
    primary.dose = {
      ...base,
      sets: Math.min(2, base.sets),
      rir: Math.max(3, base.rir ?? 3),
      restSeconds: Math.max(150, base.restSeconds),
    };
  else
    primary.dose = {
      ...base,
      sets: Math.min(
        p.goal === "strength" ||
          p.secondaryLimiter === "strength" ||
          resolveGoalPolicy(p).firstAccent === "strength"
          ? 2
          : 1,
        base.sets,
      ),
      rir: 4,
      restSeconds: Math.max(150, base.restSeconds),
    };
  primary.reason += ` ${copy.strengthFocus.reason}`;
  copy.plyometricContacts = strengthLandingCount(copy.exercises);
  copy.minutes =
    Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + strengthPreparationOverhead(copy);
  return copy;
}
