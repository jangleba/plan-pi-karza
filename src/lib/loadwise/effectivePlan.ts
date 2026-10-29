import type {
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionModification,
} from "./types";
import { applyReadiness } from "./sessionRuntime";
import { adaptMdPlusOneFromMatchMinutes } from "./adaptiveWeek";

export interface EffectivePlanContext {
  profile?: Profile | null;
  readiness?: Record<string, Readiness>;
  completions?: Record<string, SessionCompletion>;
}

/** Safety is applied to the chosen work; execution is pinned independently of the base plan. */
export function resolveExecutionDay(day: SessionDay, context: EffectivePlanContext): SessionDay {
  const readiness =
    context.profile?.healthPersonalizationEnabled !== false
      ? context.readiness?.[day.date]
      : undefined;
  const readinessKey = readiness ? JSON.stringify(readiness) : undefined;
  const adjusted =
    context.profile && readiness && day.readinessAdjustmentKey !== readinessKey
      ? {
          ...applyReadiness(day.readinessOriginalSession ?? day, readiness, context.profile)
            .session,
          readinessAdjustedDate: readiness.date,
          readinessAdjustmentKey: readinessKey,
          readinessOriginalSession: day.readinessOriginalSession ?? day,
        }
      : day;
  const pin = (session: SessionDay): SessionDay => {
    const completion = session.dbId ? context.completions?.[session.dbId] : undefined;
    const snapshot = completion?.executionSnapshot;
    return snapshot && (completion?.completed || completion?.status === "started")
      ? {
          ...snapshot,
          dbId: session.dbId,
          dayDbId: session.dayDbId,
          planDbId: session.planDbId,
          cycleId: session.cycleId,
          date: session.date,
          secondSession: null,
        }
      : session;
  };
  // An already executed second slot remains visible even if today's safety adaptation
  // removes future work. The safety warning still applies to any further exercise.
  const oldSecondLog = day.secondSession?.dbId
    ? context.completions?.[day.secondSession.dbId]
    : undefined;
  const second =
    adjusted.secondSession ??
    (oldSecondLog?.completed || oldSecondLog?.status === "started" ? day.secondSession : null);
  const primary = pin(adjusted);
  return {
    ...primary,
    secondSession: second ? pin(second) : null,
    slotLabel: second ? "Sesja 1" : null,
    ...(readiness &&
    (readiness.jointPain >= 7 || readiness.altersMovement || readiness.redFlags?.length)
      ? {
          loadLabelOverride: "Wstrzymaj trening",
          safetyNote:
            "Wstrzymaj dalszy wysiłek i ustal postępowanie z lekarzem lub fizjoterapeutą.",
        }
      : {}),
  };
}

const DAILY_SECOND_PREFIX = "[daily-checkin:second-";

function byCreatedAt(a: SessionModification, b: SessionModification): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function cleanSecond(session: SessionDay): SessionDay {
  return {
    ...session,
    slotLabel: "Sesja 2",
    secondSession: null,
  };
}

/**
 * Nakłada aktywne modyfikacje na jeden dzień planu.
 *
 * Reguły są celowo proste:
 * - ostatnia zamiana jest wersją bazową dnia,
 * - dodana jednostka zajmuje wyłącznie wolny drugi slot,
 * - wpis check-inu dotyczący drugiej sesji zastępuje stary drugi slot,
 * - nigdy nie powstaje trzecia sesja.
 */
export function resolveModifiedDay(
  source: SessionDay,
  modifications: SessionModification[] = [],
): SessionDay {
  const ordered = [...modifications].sort(byCreatedAt);
  const swap = ordered.filter((item) => item.type === "swap").at(-1);
  const additions = ordered.filter((item) => item.type === "add");
  const dailySecond = additions
    .filter((item) => item.reason.startsWith(DAILY_SECOND_PREFIX))
    .at(-1);
  const ordinaryAddition = additions
    .filter((item) => !item.reason.startsWith(DAILY_SECOND_PREFIX))
    .at(-1);

  let day: SessionDay = swap ? { ...swap.session } : { ...source };
  const second = dailySecond?.session ?? day.secondSession ?? ordinaryAddition?.session ?? null;

  day = {
    ...day,
    date: source.date,
    dayName: source.dayName,
    dayOfWeek: source.dayOfWeek,
    dayDbId: source.dayDbId,
    slotLabel: second ? "Sesja 1" : null,
    secondSession: second ? cleanSecond({ ...second, date: source.date }) : null,
  };

  return day;
}

/** Jedna skuteczna wersja planu dla Start, Plan, Fuel, Postępu i automatyzacji. */
export function resolveEffectivePlan(
  plan: SessionDay[],
  modifications: Record<string, SessionModification[]> = {},
  context?: EffectivePlanContext,
): SessionDay[] {
  const modified = plan.map((day) => resolveModifiedDay(day, modifications[day.date] ?? []));
  if (!context) return modified;
  const adapted = adaptMdPlusOneFromMatchMinutes(
    modified,
    context.completions ?? {},
    context.readiness ?? {},
  ).plan;
  return adapted.map((day) => resolveExecutionDay(day, context));
}

/** Wszystkie realne sloty planu, maksymalnie dwa na dzień. */
export function effectiveSessions(plan: SessionDay[]): SessionDay[] {
  return plan.flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[]);
}
