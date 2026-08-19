import type { Profile, SessionCompletion, SessionDay, SessionModification } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
  type FootballSpeedFamily,
} from "./footballSpeedSessionEngine";
import { classifySession } from "./sessionClassification";

function familyFor(session: SessionDay): FootballSpeedFamily {
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

function migrateSession(session: SessionDay, profile: Profile): SessionDay {
  const generated = generateFootballSpeedSession({
    profile,
    date: session.date,
    family: familyFor(session),
  }).session;
  if (!generated) return session;
  return {
    ...generated,
    dbId: session.dbId,
    sessionId: session.sessionId,
    dayDbId: session.dayDbId,
    canonicalRevision: session.canonicalRevision,
    canonicalSchemaVersion: session.canonicalSchemaVersion,
    readinessAdjustedDate: session.readinessAdjustedDate,
    readinessOriginalSession: session.readinessOriginalSession,
  };
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isMatchProtectedDate(date: string, profile: Profile): boolean {
  return (
    profile.matchDate === date ||
    profile.matchDate === dateOffset(date, 1) ||
    profile.matchDate === dateOffset(date, -1)
  );
}

function isEligibleForRelocation(
  date: string,
  speedDates: Set<string>,
  planDates: Set<string>,
  profile: Profile,
): boolean {
  if (!planDates.has(date) || isMatchProtectedDate(date, profile) || speedDates.has(date)) {
    return false;
  }
  return !speedDates.has(dateOffset(date, -1)) && !speedDates.has(dateOffset(date, 1));
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
  const speedDates = new Set(
    plan.filter((day) => isSpeed(day)).map((day) => day.date),
  );
  const next = [...plan];

  for (let index = 0; index < next.length; index += 1) {
    const day = next[index];
    if (
      day.date <= today ||
      !isSpeed(day) ||
      !isAppGeneratedSpeed(day) ||
      ((day.dbId || day.sessionId) && completions[day.dbId ?? day.sessionId ?? ""]?.completed) ||
      (modifications[day.date] ?? []).some((mod) => mod.type === "swap")
    ) {
      continue;
    }

    const duplicate = next.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index && candidate.date === day.date && isSpeed(candidate),
    );
    const previous = index > 0 ? next[index - 1] : undefined;
    const nextDay = index + 1 < next.length ? next[index + 1] : undefined;
    const consecutive =
      (previous && previous.date === dateOffset(day.date, -1) && isSpeed(previous)) ||
      (nextDay && nextDay.date === dateOffset(day.date, 1) && isSpeed(nextDay));
    const invalid = duplicate || isMatchProtectedDate(day.date, profile) || Boolean(consecutive);
    if (!invalid) continue;

    speedDates.delete(day.date);
    const target = next
      .slice(index + 1)
      .map((candidate) => candidate.date)
      .find((candidateDate) =>
        isEligibleForRelocation(candidateDate, speedDates, planDates, profile),
      );

    if (!target) {
      next.splice(index, 1);
      index -= 1;
      migratedDates.push(day.date);
      continue;
    }

    const migrated = migrateSession({ ...day, date: target }, profile);
    if (migrated === day) {
      next.splice(index, 1);
      index -= 1;
      migratedDates.push(day.date);
      continue;
    }
    next[index] = migrated;
    speedDates.add(target);
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
      day.date <= today ||
      day.speedGeneratorVersion === FOOTBALL_SPEED_GENERATOR_VERSION ||
      !isSpeed(day) ||
      !isAppGeneratedSpeed(day) ||
      ((day.dbId || day.sessionId) && completions[day.dbId ?? day.sessionId ?? ""]?.completed) ||
      (modifications[day.date] ?? []).some((mod) => mod.type === "swap")
    ) {
      return day;
    }
    const migrated = migrateSession(day, profile);
    if (migrated === day) return day;
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
