import type { ExerciseItem, SessionDay, TrainingExercise, TrainingSection } from "./types";
import { reduceDailySessionDose } from "./dailyDose";
import { estimateStrengthMinutes } from "./strengthProgramming";

/**
 * „Mam mniej czasu”: shorter variants of today's own work.
 *
 * - Only the work part shrinks: optional accessory work first, then fewer
 *   work sets or intervals. Warm-up, preparation, cool-down, load,
 *   intensity, distance per repetition and every programmed rest stay.
 * - A variant is shown only when it really saves time (≥ 5 min) and still
 *   contains main work. Club training and matches are never shortened here.
 * - Variants are always computed from the day as planned before today's
 *   check-in, so choosing the same option again gives the same result.
 * - The share of sets kept is a time-window choice, not a scientific dose
 *   or fatigue model; the athlete chooses it explicitly.
 */

const MIN_SAVING_MIN = 5;

type Level = "keep" | "no_accessory" | "fewer_sets" | "half_sets" | "remove";

const LEVEL_COST: Record<Level, number> = {
  keep: 0,
  no_accessory: 1,
  fewer_sets: 2,
  half_sets: 3,
  remove: 5,
};

export interface TimeVariant {
  id: string;
  minutes: number;
  label: string;
  detail: string;
  day: SessionDay;
}

function external(session: SessionDay): boolean {
  return (
    session.dayType === "club" || session.dayType === "match" || Boolean(session.externalCommitment)
  );
}

function ownWork(session: SessionDay | null | undefined): session is SessionDay {
  return (
    !!session &&
    !session.isUnavailable &&
    session.dayType !== "rest" &&
    session.durationMin > 0 &&
    !external(session)
  );
}

const WORK_SECTIONS = new Set(["main", "accessory"]);

function hasMainWork(session: SessionDay): boolean {
  if (session.structuredSections?.length)
    return session.structuredSections.some(
      (section) =>
        section.type === "main" && section.blocks.some((block) => block.exercises.length > 0),
    );
  return session.sections.main.length > 0;
}

/** Planning estimate (work + programmed rests); never a stopwatch measurement. */
function workEstimate(session: SessionDay): number {
  if (session.structuredSections?.length)
    return estimateStrengthMinutes(session.structuredSections);
  const items = [
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
  ];
  return items.reduce((total, item) => {
    const count = Number(item.prescription.match(/^\s*(\d+)/)?.[1] ?? 1);
    return total + Math.max(1, count);
  }, 0);
}

function prepEstimate(session: SessionDay): number {
  if (!session.structuredSections?.length) return 0;
  const prep = session.structuredSections.filter((section) => !WORK_SECTIONS.has(section.type));
  return prep.length ? estimateStrengthMinutes(prep) : 0;
}

function withoutAccessory(session: SessionDay): SessionDay | null {
  const structured = session.structuredSections;
  const hasStructuredAccessory = structured?.some(
    (section) => section.type === "accessory" && section.blocks.length > 0,
  );
  const hasFlatAccessory =
    session.sections.accessory.length > 0 || session.sections.footballTransfer.length > 0;
  if (!hasStructuredAccessory && !hasFlatAccessory) return null;
  return {
    ...session,
    structuredSections: structured?.filter(
      (section: TrainingSection) => section.type !== "accessory",
    ),
    sections: { ...session.sections, accessory: [], footballTransfer: [] },
  };
}

function seconds(text: string | undefined): number | null {
  const match = text?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(min|s|sek)\b/i);
  if (!match) return null;
  return Number(match[1].replace(",", ".")) * (/min/i.test(match[2]) ? 60 : 1);
}

function leadingCount(text: string | undefined): number | null {
  const match = text?.match(/^\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:akcj\w*|seri\w*)?\s*[×x]/i);
  return match ? Number(match[2] ?? match[1]) : null;
}

/** The runner executes `methodExecution`; keep its clock equal to the shown dose. */
function syncExecution(before: TrainingExercise, after: TrainingExercise): TrainingExercise {
  const execution = after.methodExecution;
  if (!execution) return after;
  if (execution.mode === "continuous") {
    const was = seconds(before.duration),
      now = seconds(after.duration);
    if (was && now && was !== now && execution.workSeconds)
      return {
        ...after,
        methodExecution: {
          ...execution,
          workSeconds: Math.max(1, Math.round((execution.workSeconds * now) / was)),
        },
      };
    return after;
  }
  const wasCount = leadingCount(before.reps) ?? Number(before.sets ?? NaN);
  const nowCount = leadingCount(after.reps) ?? Number(after.sets ?? NaN);
  if (!Number.isFinite(wasCount) || !Number.isFinite(nowCount) || wasCount === nowCount)
    return after;
  const ratio = nowCount / wasCount;
  return {
    ...after,
    methodExecution:
      execution.rounds > 1
        ? { ...execution, rounds: Math.max(1, Math.floor(execution.rounds * ratio)) }
        : {
            ...execution,
            repetitions: Math.max(1, Math.floor(execution.repetitions * ratio)),
          },
  };
}

/** Same text format as the structured → flat projection used for saved rows. */
function flatPrescription(exercise: TrainingExercise): string {
  return (
    [
      exercise.sets && exercise.reps
        ? `${exercise.sets} × ${exercise.reps}`
        : exercise.reps || exercise.sets,
      exercise.duration,
      exercise.rpe,
      exercise.loadTarget,
    ]
      .filter(Boolean)
      .join(", ") || "wg techniki"
  );
}

/** Structured work drives execution; mirror each changed exercise in the flat/saved view. */
function syncStructured(original: SessionDay, changed: SessionDay): SessionDay {
  if (!original.structuredSections?.length || !changed.structuredSections?.length) return changed;
  const before = new Map(
    original.structuredSections
      .flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises)
      .map((exercise) => [exercise.id, exercise]),
  );
  const updates = new Map<string, TrainingExercise>();
  const structuredSections = changed.structuredSections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) => {
        const old = before.get(exercise.id);
        if (!old) return exercise;
        const synced = syncExecution(old, exercise);
        if (JSON.stringify(old) !== JSON.stringify(synced))
          updates.set(old.exerciseId ?? old.name, synced);
        return synced;
      }),
    })),
  }));
  const flat = (item: ExerciseItem): ExerciseItem => {
    const update =
      (item.exerciseId && updates.get(item.exerciseId)) ||
      [...updates.values()].find((exercise) => item.name.endsWith(exercise.name));
    return update
      ? {
          ...item,
          prescription: flatPrescription(update),
          displayPrescription: update.displayPrescription ?? item.displayPrescription,
        }
      : item;
  };
  return {
    ...changed,
    structuredSections,
    sections: {
      ...changed.sections,
      main: original.sections.main.map(flat),
      accessory: changed.sections.accessory.length ? original.sections.accessory.map(flat) : [],
      footballTransfer: changed.sections.footballTransfer.length
        ? original.sections.footballTransfer.map(flat)
        : [],
    },
  };
}

function shortened(session: SessionDay, level: Level): SessionDay | null {
  if (level === "keep") return session;
  if (level === "remove") return null;
  const lighter = withoutAccessory(session) ?? session;
  let result: SessionDay;
  if (level === "no_accessory") {
    if (lighter === session) return null;
    result = lighter;
  } else {
    try {
      result = syncStructured(
        lighter,
        reduceDailySessionDose(lighter, level === "fewer_sets" ? 0.75 : 0.5),
      );
    } catch {
      return null;
    }
  }
  return hasMainWork(result) ? result : null;
}

/** Minutes of the athlete's own work for a session after a change. */
function plannedMinutes(original: SessionDay, changed: SessionDay | null): number {
  if (!changed) return 0;
  if (changed === original) return original.durationMin;
  const before = workEstimate(original);
  const after = workEstimate(changed);
  if (before <= 0) return original.durationMin;
  const prepShare = original.structuredSections?.length
    ? Math.min(
        0.9,
        prepEstimate(original) / Math.max(1, estimateStrengthMinutes(original.structuredSections)),
      )
    : 0.25;
  const fixed = original.durationMin * prepShare;
  const variable = original.durationMin - fixed;
  return Math.max(1, Math.round(fixed + variable * (after / before)));
}

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

function describe(first: Level, second: Level | null, hasSecond: boolean): string {
  const parts: string[] = [];
  const one = (level: Level, label: string) => {
    if (level === "no_accessory") parts.push(`${label}: bez ćwiczeń uzupełniających`);
    if (level === "fewer_sets") parts.push(`${label}: mniej serii, odcinków lub minut pracy`);
    if (level === "half_sets") parts.push(`${label}: około połowy pracy`);
    if (level === "remove") parts.push(`${label}: pominięta`);
  };
  one(first, hasSecond ? "Sesja 1" : "Sesja");
  if (second) one(second, "Sesja 2");
  return `${parts.join(" · ")}. Rozgrzewka i pełne przerwy bez zmian.`;
}

/**
 * Feasible shorter variants for the whole day (both sessions). `locked`
 * marks a started or completed session, which is never changed here.
 */
export function buildTimeVariants(
  day: SessionDay,
  locked: (session: SessionDay) => boolean = (session) => Boolean(session.executionProtected),
): TimeVariant[] {
  const base = day.checkinBaseSession ?? day;
  const first = base;
  const second = base.secondSession ?? null;
  const firstEditable = ownWork(first) && !locked(first);
  const secondEditable = ownWork(second) && !locked(second);
  const firstLevels: Level[] = firstEditable
    ? ["keep", "no_accessory", "fewer_sets", "half_sets"]
    : ["keep"];
  const secondLevels: Level[] = secondEditable
    ? ["keep", "no_accessory", "fewer_sets", "half_sets", "remove"]
    : ["keep"];
  const firstOwn = ownWork(first) ? first.durationMin : 0;
  const secondOwn = ownWork(second) ? second.durationMin : 0;
  const fullMinutes = firstOwn + secondOwn;

  const best = new Map<number, { cost: number; variant: TimeVariant }>();
  for (const firstLevel of firstLevels) {
    const changedFirst = shortened(first, firstLevel);
    if (!changedFirst) continue;
    for (const secondLevel of second ? secondLevels : (["keep"] as Level[])) {
      if (firstLevel === "keep" && secondLevel === "keep") continue;
      const changedSecond = second ? shortened(second, secondLevel) : null;
      if (second && secondLevel !== "remove" && !changedSecond) continue;
      const minutes =
        (ownWork(first) ? plannedMinutes(first, changedFirst) : 0) +
        (ownWork(second) ? plannedMinutes(second, changedSecond) : 0);
      if (minutes > fullMinutes - MIN_SAVING_MIN || minutes <= 0) continue;
      const rounded = roundTo5(minutes);
      const cost = LEVEL_COST[firstLevel] + (second ? LEVEL_COST[secondLevel] : 0);
      const previous = best.get(rounded);
      if (previous && previous.cost <= cost) continue;
      const nextSecond = changedSecond
        ? {
            ...changedSecond,
            durationMin: ownWork(second)
              ? plannedMinutes(second!, changedSecond)
              : changedSecond.durationMin,
            slotLabel: "Sesja 2",
            secondSession: null,
          }
        : null;
      const nextDay: SessionDay = {
        ...changedFirst,
        durationMin:
          ownWork(first) && changedFirst !== first
            ? plannedMinutes(first, changedFirst)
            : changedFirst.durationMin,
        secondSession: nextSecond,
        slotLabel: nextSecond ? "Sesja 1" : null,
        checkinBaseSession: base,
        checkinTimeBudgetMin: rounded,
        loadLabelOverride: firstLevel === "keep" ? first.loadLabelOverride : "Krótszy wariant",
        classification: firstLevel === "keep" ? first.classification : undefined,
      };
      best.set(rounded, {
        cost,
        variant: {
          id: `${firstLevel}:${second ? secondLevel : "none"}`,
          minutes: rounded,
          label: `ok. ${rounded} min`,
          detail: describe(firstLevel, second ? secondLevel : null, Boolean(second)),
          day: nextDay,
        },
      });
    }
  }
  return [...best.values()]
    .map((entry) => entry.variant)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 4);
}

/** Planned own minutes of the day as currently shown (for the check-in header). */
export function ownDayMinutes(day: SessionDay): number {
  return [day, day.secondSession].reduce(
    (total, session) => total + (ownWork(session) ? session.durationMin : 0),
    0,
  );
}
