import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Profile, SessionCompletion, SessionDay } from "./types";
import { repairSegmentBoundaries } from "./segmentBoundary";

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
    "trainingMethodPreferences",
    "currentPitchFeelings",
    "desiredPitchFeelings",
  ] as const;
  const arrayKeys = new Set<string>([
    "clubTrainingDays",
    "individualTrainingDays",
    "unavailableDays",
    "matchDates",
    "equipment",
    "painLocations",
    "unavailableEquipmentIds",
    "currentPitchFeelings",
    "desiredPitchFeelings",
  ]);
  // The first pitch feeling decides the plan accent, so their order counts.
  const orderedKeys = new Set<string>(["currentPitchFeelings", "desiredPitchFeelings"]);
  // Defaults mirror what buildProfile reads back from the database, so a profile
  // straight from the onboarding form and the same profile after a reload hash
  // identically (otherwise every save triggers a second full plan rebuild).
  const readBack: Partial<Record<(typeof keys)[number], unknown>> = {
    seasonPhaseOverride: profile.seasonPhaseOverride === true ? true : null,
    runningProgressionLevel: profile.runningProgressionLevel ?? 0,
  };
  const values = keys.map((key) => {
    const value =
      (key in readBack ? readBack[key] : (profile as unknown as Record<string, unknown>)[key]) ??
      (arrayKeys.has(key) ? [] : null);
    if (!Array.isArray(value)) return [key, value];
    const unique = [...new Set(value)];
    return [key, orderedKeys.has(key) ? unique : unique.sort()];
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
    session.trainingMethods ?? null,
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
  const reconciled = next.map((candidate) => {
    const old = byDate.get(candidate.date);
    const primary = preserve(candidate, old);
    const oldSecond = old?.secondSession;
    const secondLog = oldSecond?.dbId ? completions[oldSecond.dbId] : undefined;
    const oldSecondProtected =
      !!oldSecond &&
      (oldSecond.date < today || secondLog?.completed || secondLog?.status === "started");
    // A past day is history: a regenerated plan must not attach new work to it.
    const pastDay = !!old && old.date < today;
    const second = oldSecondProtected
      ? { ...oldSecond, executionProtected: true }
      : candidate.secondSession && !pastDay
        ? preserve(candidate.secondSession, oldSecond)
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
  // Preserved history and the new future can share one calendar week or meet
  // at a week boundary. Weekly limits are resolved on future, unstarted days only.
  return repairSegmentBoundaries(
    reconciled,
    reconciled.filter((day) => day.date >= today && !day.executionProtected).map((day) => day.date),
  );
}
