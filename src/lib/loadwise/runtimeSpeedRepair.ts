import type { Profile, SessionCompletion, SessionDay, SessionModification } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
  type FootballSpeedFamily,
  type SpeedExternalExposure,
} from "./footballSpeedSessionEngine";
import { getExerciseDefinition } from "./exerciseLibrary";
import { addDays, isoDate, isoDayOfWeek, parseIso } from "./labels";
import { classifySession, normalizeSessionCategory } from "./sessionClassification";

const REQUIRED_SPEED_ROLE_COUNTS = {
  preparation: 1,
  primer: 8,
  technical: 3,
  secondary: 1,
  resisted: 1,
  primary: 1,
  terminal: 1,
  cooldown: 1,
} as const;

export interface RuntimeSpeedRepairContext {
  today?: string;
  completions?: Record<string, SessionCompletion>;
  modifications?: Record<string, SessionModification[]>;
  plan?: SessionDay[];
}

function isCompleted(
  session: SessionDay,
  completions: Record<string, SessionCompletion> | undefined,
): boolean {
  if (!completions) return false;
  return [session.dbId, session.sessionId]
    .filter((id): id is string => Boolean(id))
    .some((id) => completions[id]?.completed === true);
}

function familyFor(session: SessionDay): FootballSpeedFamily {
  const subcategory = classifySession(session).subcategory;
  if (
    subcategory === "change_of_direction" ||
    subcategory === "deceleration" ||
    subcategory === "braking" ||
    subcategory === "acceleration_deceleration"
  ) {
    return "deceleration_cod";
  }
  if (
    subcategory === "max_velocity" ||
    subcategory === "max_velocity_cod" ||
    subcategory === "flying_sprints"
  ) {
    return "maximum_velocity";
  }
  if (/łuk|curved/i.test(`${session.title} ${session.sessionType}`)) {
    return "curved_sprinting";
  }
  if (subcategory === "agility_speed" || /reakcj/i.test(session.title)) {
    return "reactive_agility_reacceleration";
  }
  return "acceleration";
}

function exposureSessions(root: SessionDay, includeSecondSession: boolean): SessionDay[] {
  const hidden = root.readinessOriginalSession;
  return [
    root,
    hidden,
    ...(includeSecondSession ? [root.secondSession, hidden?.secondSession] : []),
  ].filter((candidate): candidate is SessionDay => Boolean(candidate));
}

function externalExposures(
  profile: Profile,
  date: string,
  context: RuntimeSpeedRepairContext,
): SpeedExternalExposure[] {
  const current = parseIso(date);
  const exposures: SpeedExternalExposure[] = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    const candidate = addDays(current, offset);
    const candidateDate = isoDate(candidate);
    if (profile.matchDate === candidateDate) {
      exposures.push({ date: candidateDate, kind: "match", hard: true });
    }
    if (profile.clubTrainingDays.includes(isoDayOfWeek(candidate))) {
      exposures.push({ date: candidateDate, kind: "club", hard: true });
    }
  }
  const relevantDates = new Set([
    date,
    isoDate(addDays(current, -1)),
    isoDate(addDays(current, 1)),
  ]);
  for (const day of context.plan ?? []) {
    if (!relevantDates.has(day.date)) continue;
    const modifications = context.modifications?.[day.date] ?? [];
    // Zastąpiona sesja bazowa nie jest już częścią efektywnego grafiku.
    if (modifications.some((modification) => modification.type === "swap")) continue;
    const sessions = exposureSessions(day, day.date !== date);
    if (
      sessions.some((candidate) => {
        const classification = classifySession(candidate);
        return (
          classification.countsAsSpeed ||
          classification.countsAsClub ||
          classification.countsAsMatch ||
          candidate.externalCommitment === true
        );
      })
    ) {
      exposures.push({ date: day.date, kind: "training", hard: true });
    }
  }
  for (const relevantDate of relevantDates) {
    const modifiedSessions = (context.modifications?.[relevantDate] ?? []).flatMap((modification) =>
      exposureSessions(modification.session, true),
    );
    if (
      modifiedSessions.some((candidate) => {
        const classification = classifySession(candidate);
        return (
          classification.countsAsSpeed ||
          classification.countsAsClub ||
          classification.countsAsMatch ||
          candidate.externalCommitment === true
        );
      })
    ) {
      exposures.push({ date: relevantDate, kind: "training", hard: true });
    }
  }
  return exposures;
}

function isRepairableEngineSpeed(session: SessionDay): boolean {
  // Stare rekordy potrafią mieć częściowe `classification` (np. wyłącznie
  // `generatedBy`). Zawsze odbudowujemy pełną klasyfikację z treści sesji.
  const classification = classifySession(session);
  if (!classification.isSpeed) return false;
  if (
    session.isClubSession ||
    session.externalCommitment ||
    session.dayType === "club" ||
    session.dayType === "match" ||
    classification.countsAsClub ||
    classification.countsAsMatch ||
    classification.generatedBy === "user_added" ||
    classification.generatedBy === "user_swapped"
  ) {
    return false;
  }
  if (session.classification?.generatedBy === "engine") return true;
  return session.isOwnSession === true && Boolean(session.speedGeneratorVersion);
}

export function hasCompleteRuntimeSpeedPayload(session: SessionDay): boolean {
  if (session.speedGeneratorVersion !== FOOTBALL_SPEED_GENERATOR_VERSION) return false;
  const blocks = session.structuredSections?.flatMap((section) => section.blocks) ?? [];
  if (blocks.length !== 17) return false;
  if (blocks.some((block) => block.exercises.length !== 1)) return false;
  const exercises = blocks.map((block) => block.exercises[0]);
  if (new Set(exercises.map((exercise) => exercise.id)).size !== 17) return false;
  if (
    exercises.some((exercise) => {
      const definition = exercise.exerciseId
        ? getExerciseDefinition(exercise.exerciseId)
        : undefined;
      const hasDose = Boolean(
        exercise.displayPrescription?.trim() || exercise.reps?.trim() || exercise.duration?.trim(),
      );
      return !definition || definition.approved !== true || definition.draft !== false || !hasDose;
    })
  ) {
    return false;
  }
  const roleCounts = blocks.reduce<Record<string, number>>((counts, block) => {
    const role = block.exercises[0]?.speedRole;
    if (role) counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {});
  const hasRequiredRoleCounts = Object.entries(REQUIRED_SPEED_ROLE_COUNTS).every(
    ([role, count]) => roleCounts[role] === count,
  );
  if (!hasRequiredRoleCounts) return false;
  const primerIds = blocks
    .map((block) => block.exercises[0])
    .filter((exercise) => exercise?.speedRole === "primer")
    .map((exercise) => exercise.exerciseId);
  return ["a_skip", "c_skip", "b_skip", "d_skip"].every(
    (exerciseId) => primerIds.filter((candidate) => candidate === exerciseId).length === 2,
  );
}

function repairSupplementalSession(
  session: SessionDay,
  profile: Profile,
  context: RuntimeSpeedRepairContext,
): SessionDay | null {
  if (isCompleted(session, context.completions) || !isRepairableEngineSpeed(session)) {
    return session;
  }

  const generated = generateFootballSpeedSession({
    profile,
    date: session.date,
    family: familyFor(session),
    readiness: 7,
    externalSessions: externalExposures(profile, session.date, context),
  }).session;
  if (!generated) return null;

  const requiresRepair =
    !hasCompleteRuntimeSpeedPayload(session) ||
    session.isSupplemental !== true ||
    session.intensity !== "umiarkowana" ||
    session.classification?.canBeSecondSession !== true;
  if (!requiresRepair) return session;

  const normalized = normalizeSessionCategory({
    ...generated,
    dbId: session.dbId,
    sessionId: session.sessionId,
    dayDbId: session.dayDbId,
    canonicalRevision: session.canonicalRevision,
    canonicalSchemaVersion: session.canonicalSchemaVersion,
    generatorVersion: session.generatorVersion,
    dayName: session.dayName,
    dayOfWeek: session.dayOfWeek,
    mdRelation: session.mdRelation,
    mdLabel: session.mdLabel,
    slotLabel: session.slotLabel,
    weekMeta: session.weekMeta,
    blockWeekNumber: session.blockWeekNumber,
    blockPhaseLabel: session.blockPhaseLabel,
    readinessAdjustedDate: session.readinessAdjustedDate,
    readinessOriginalSession: session.readinessOriginalSession,
    isSupplemental: true,
    intensity: "umiarkowana",
    secondSession: session.secondSession,
  });
  return {
    ...normalized,
    classification: {
      ...normalized.classification!,
      canBeSecondSession: true,
    },
  };
}

function repairDaySlot2(
  day: SessionDay,
  profile: Profile,
  context: RuntimeSpeedRepairContext,
): SessionDay {
  const repairedSecond = day.secondSession
    ? repairSupplementalSession(day.secondSession, profile, context)
    : null;
  const repairedOriginal = day.readinessOriginalSession
    ? repairDaySlot2(day.readinessOriginalSession, profile, context)
    : day.readinessOriginalSession;
  if (repairedSecond === day.secondSession && repairedOriginal === day.readinessOriginalSession) {
    return day;
  }
  return {
    ...day,
    secondSession: repairedSecond,
    readinessOriginalSession: repairedOriginal,
  };
}

/**
 * Ostatni bezpiecznik odczytu: naprawia sprint w slocie 2 tuż przed pokazaniem
 * ekranu sesji, także gdy stary zapis ominął migrację bazy.
 */
export function repairRuntimeSpeedDay(
  day: SessionDay,
  profile: Profile,
  context: RuntimeSpeedRepairContext = {},
): SessionDay {
  if (context.today && day.date < context.today) return day;
  if (context.modifications?.[day.date]?.some((modification) => modification.type === "swap")) {
    return day;
  }
  return repairDaySlot2(day, profile, context);
}
