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
      ((day.dbId || day.sessionId) &&
        completions[day.dbId ?? day.sessionId ?? ""]?.completed) ||
      (modifications[day.date] ?? []).some((mod) => mod.type === "swap")
    ) {
      return day;
    }
    const migrated = migrateSession(day, profile);
    if (migrated === day) return day;
    migratedDates.push(day.date);
    return migrated;
  });
  return { plan: migratedDates.length ? next : plan, migratedDates };
}
