import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Profile, SessionCompletion, SessionDay } from "./types";

/** Only actual generator inputs invalidate a plan; timestamps and Fuel do not. */
export function trainingProfileRevision(profile: Profile): string {
  const keys = [
    "age",
    "position",
    "level",
    "goal",
    "secondaryLimiter",
    "clubTrainingDays",
    "individualTrainingDays",
    "unavailableDays",
    "usualMatchDay",
    "matchDate",
    "matchDates",
    "equipment",
    "painInjury",
    "painLocations",
    "doubleSessionsAllowed",
    "seasonPhase",
    "seasonStage",
    "seasonPhaseOverride",
    "competitionLevel",
    "weeklyMatches",
    "hasGym",
    "hasPitch",
    "hasSprintSpace",
    "unavailableEquipmentIds",
    "healthPersonalizationEnabled",
    "fieldMasKmh",
    "fieldMasTestedAt",
    "runningProgressionLevel",
    "gymExperienceLevel",
    "strengthTrainingMonths",
    "movementCompetence",
    "supervisionLevel",
  ] as const;
  const arrayKeys = new Set<string>([
    "clubTrainingDays",
    "individualTrainingDays",
    "unavailableDays",
    "matchDates",
    "equipment",
    "painLocations",
    "unavailableEquipmentIds",
  ]);
  const values = keys.map((key) => {
    const value =
      (profile as unknown as Record<string, unknown>)[key] ?? (arrayKeys.has(key) ? [] : null);
    return [key, Array.isArray(value) ? [...new Set(value)].sort() : value];
  });
  // Keep private inputs out of plan metadata and compact boot caches.
  return `training-inputs:v1:${bytesToHex(sha256(JSON.stringify(values)))}`;
}

export function sessionPrescription(session: SessionDay): string {
  return JSON.stringify([
    session.dayType,
    session.type,
    session.sessionType,
    session.title,
    session.intensity,
    session.durationMin,
    session.goalOfSession,
    session.safetyNote,
    session.sections,
    session.structuredSections ?? null,
  ]);
}

/** Preserve executed/in-flight prescriptions, reuse IDs only for identical future work. */
export function reconcilePlanIdentity(
  next: SessionDay[],
  previous: SessionDay[],
  completions: Record<string, SessionCompletion>,
  today: string,
): SessionDay[] {
  const byDate = new Map(previous.map((day) => [day.date, day]));
  const preserve = (candidate: SessionDay, old: SessionDay | null | undefined): SessionDay => {
    if (!old) return { ...candidate, dbId: undefined, sessionId: undefined };
    const log = old.dbId ? completions[old.dbId] : undefined;
    if (old.date < today || log?.completed || log?.status === "started")
      return { ...old, executionProtected: true };
    if (sessionPrescription(candidate) === sessionPrescription(old))
      return { ...candidate, dbId: old.dbId, sessionId: old.sessionId };
    return { ...candidate, dbId: undefined, sessionId: undefined };
  };
  return next.map((candidate) => {
    const old = byDate.get(candidate.date);
    const primary = preserve(candidate, old);
    const oldSecond = old?.secondSession;
    const secondLog = oldSecond?.dbId ? completions[oldSecond.dbId] : undefined;
    const second = candidate.secondSession
      ? preserve(candidate.secondSession, oldSecond)
      : oldSecond &&
          (oldSecond.date < today || secondLog?.completed || secondLog?.status === "started")
        ? { ...oldSecond, executionProtected: true }
        : null;
    return {
      ...primary,
      dayDbId: old?.dayDbId,
      planDbId: old?.planDbId ?? previous[0]?.planDbId,
      cycleId: old?.cycleId ?? candidate.cycleId,
      secondSession: second,
      slotLabel: second ? "Sesja 1" : null,
    };
  });
}
