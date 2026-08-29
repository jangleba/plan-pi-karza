import type { Profile, SessionCompletion, SessionDay, SessionModification } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
  persistedFootballSpeedFamily,
  type FootballSpeedFamily,
} from "./footballSpeedSessionEngine";
import { PLAN_ENGINE_VERSION } from "./planEngine";
import { classifySession } from "./sessionClassification";
import {
  nearestFutureValidFootballSpeedDate,
  validateFootballSpeedDate,
} from "./footballSpeedScheduling";

function familyFor(session: SessionDay): FootballSpeedFamily {
  const persisted = persistedFootballSpeedFamily(session);
  if (persisted) return persisted;
  const subcategory = session.classification?.subcategory ?? classifySession(session).subcategory;
  if (subcategory === "change_of_direction" || subcategory === "deceleration") {
    return "deceleration_cod";
  }
  if (subcategory === "max_velocity" || subcategory === "flying_sprints") {
    return "maximum_velocity";
  }
  if (/łuk|curved/i.test(`${session.title} ${session.sessionType}`)) return "curved_sprinting";
  if (subcategory === "agility_speed") return "reactive_agility_reacceleration";
  return "acceleration";
}

function isAppGeneratedSpeed(session: SessionDay): boolean {
  if (!session.isOwnSession || session.isClubSession || session.externalCommitment) return false;
  const generatedBy = session.classification?.generatedBy;
  return generatedBy !== "user_added" && generatedBy !== "user_swapped";
}

function isSpeed(session: SessionDay): boolean {
  return session.classification?.isSpeed ?? classifySession(session).isSpeed;
}

function migrateSession(session: SessionDay, profile: Profile): SessionDay | null {
  const generated = generateFootballSpeedSession({
    profile,
    date: session.date,
    family: familyFor(session),
    progressionWeek: session.blockWeekNumber ?? session.weekMeta?.blockWeek,
  }).session;
  if (!generated) return null;
  return {
    ...generated,
    dbId: session.dbId,
    sessionId: session.sessionId,
    dayDbId: session.dayDbId,
    canonicalRevision: session.canonicalRevision,
    canonicalSchemaVersion: session.canonicalSchemaVersion,
    generatorVersion: PLAN_ENGINE_VERSION,
    readinessAdjustedDate: session.readinessAdjustedDate,
    readinessOriginalSession: session.readinessOriginalSession,
  };
}

function relocateInvalidGeneratedSpeedSessions(
  plan: SessionDay[],
  profile: Profile,
  today: string,
  completions: Record<string, SessionCompletion>,
  modifications: Record<string, SessionModification[]>,
): { plan: SessionDay[]; migratedDates: string[] } {
  const migratedDates: string[] = [];
  const planDates = new Set(plan.map((day) => day.date));
  const occupiedSpeedDates = new Set(plan.filter((day) => isSpeed(day)).map((day) => day.date));
  const acceptedSpeedDates = new Set<string>();
  const next = [...plan];

  for (let index = 0; index < next.length; index += 1) {
    const day = next[index];
    const eligible =
      day.date <= today ||
      !isSpeed(day) ||
      !isAppGeneratedSpeed(day) ||
      ((day.dbId || day.sessionId) && completions[day.dbId ?? day.sessionId ?? ""]?.completed) ||
      (modifications[day.date] ?? []).some((mod) => mod.type === "swap");
    if (eligible) {
      if (isSpeed(day)) acceptedSpeedDates.add(day.date);
      continue;
    }

    const validation = validateFootballSpeedDate(day.date, {
      matchDate: profile.matchDate,
      speedDates: acceptedSpeedDates,
    });
    occupiedSpeedDates.delete(day.date);
    if (validation.valid) {
      acceptedSpeedDates.add(day.date);
      occupiedSpeedDates.add(day.date);
      continue;
    }

    const target = nearestFutureValidFootballSpeedDate(
      day.date,
      [...planDates].filter((candidateDate) => {
        if (candidateDate <= day.date) return false;
        const candidate = next.find((item) => item.date === candidateDate);
        return (
          candidate &&
          candidate.isOwnSession !== true &&
          candidate.dayType !== "club" &&
          candidate.dayType !== "match"
        );
      }),
      {
        matchDate: profile.matchDate,
        speedDates: new Set([...acceptedSpeedDates, ...occupiedSpeedDates]),
      },
    );

    if (!target) {
      next.splice(index, 1);
      index -= 1;
      migratedDates.push(day.date);
      continue;
    }

    const migrated = migrateSession({ ...day, date: target }, profile);
    if (!migrated) {
      next.splice(index, 1);
      index -= 1;
      migratedDates.push(day.date);
      continue;
    }
    next.splice(index, 1);
    const targetIndex = next.findIndex((candidate) => candidate.date === target);
    if (targetIndex < 0) {
      migratedDates.push(day.date);
      index -= 1;
      continue;
    }
    next[targetIndex] = migrated;
    acceptedSpeedDates.add(target);
    occupiedSpeedDates.add(target);
    migratedDates.push(day.date);
  }

  return { plan: migratedDates.length ? next : plan, migratedDates };
}

export interface SpeedMigrationResult {
  plan: SessionDay[];
  migratedDates: string[];
}

export function migratePersistedSpeedSessions(
  plan: SessionDay[],
  profile: Profile,
  today: string,
  completions: Record<string, SessionCompletion>,
  modifications: Record<string, SessionModification[]> = {},
): SpeedMigrationResult {
  const migratedDates: string[] = [];
  const next = plan.map((day) => {
    if (
      day.date < today ||
      day.speedGeneratorVersion === FOOTBALL_SPEED_GENERATOR_VERSION ||
      !isSpeed(day) ||
      !isAppGeneratedSpeed(day) ||
      ((day.dbId || day.sessionId) && completions[day.dbId ?? day.sessionId ?? ""]?.completed) ||
      (modifications[day.date] ?? []).some((mod) => mod.type === "swap")
    ) {
      return day;
    }
    const migrated = migrateSession(day, profile);
    if (!migrated) return day;
    migratedDates.push(day.date);
    return migrated;
  });
  const relocated = relocateInvalidGeneratedSpeedSessions(
    next,
    profile,
    today,
    completions,
    modifications,
  );
  return {
    plan: relocated.migratedDates.length || migratedDates.length ? relocated.plan : plan,
    migratedDates: [...migratedDates, ...relocated.migratedDates],
  };
}
