import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Profile, SessionDay } from "./types";

function stable(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value;
}

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
    "fieldMasSourceSessionId",
    "runningProgressionLevel",
    "gymExperienceLevel",
    "strengthTrainingMonths",
    "movementCompetence",
    "supervisionLevel",
    "clubStrengthDays",
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
    "clubStrengthDays",
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
  return `training-inputs:v1:${bytesToHex(sha256(JSON.stringify(stable(values))))}`;
}

/** Results inform the next explicit preview; they do not invalidate saved training setup. */
export function trainingSetupRevision(profile: Profile): string {
  return trainingProfileRevision({
    ...profile,
    fieldMasKmh: null,
    fieldMasTestedAt: null,
    fieldMasSourceSessionId: null,
    runningProgressionLevel: 0,
  });
}

export function sessionPrescription(session: SessionDay): string {
  const values: unknown[] = [
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
  ];
  if (session.engineV2)
    values.push({ decision: session.engineV2, runningRecipe: session.runningRecipe ?? null });
  return JSON.stringify(stable(values));
}
