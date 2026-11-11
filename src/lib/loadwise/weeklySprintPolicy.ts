import type { SessionDay } from "./types";
import { addDays, isoDate, isoDayOfWeek, parseIso } from "./labels";
import { classifySession } from "./sessionClassification";
import { estimateLimitedSprintMeters } from "./speedLoad";

import { MAX_DEDICATED_SPRINT_SESSIONS_PER_WEEK, MAX_WEEKLY_SPRINT_METERS } from "./sprintLimits";

export { MAX_DEDICATED_SPRINT_SESSIONS_PER_WEEK, MAX_WEEKLY_SPRINT_METERS };

// Club training and matches are calendar facts: never counted or removed here.

export type WeeklySprintIssueCode = "extra-sprint-session" | "weekly-sprint-meters";

export interface WeeklySprintIssue {
  code: WeeklySprintIssueCode;
  /** The date whose own session exceeds the weekly limit. */
  date: string;
  week: string;
  message: string;
}

export function calendarMonday(date: string): string {
  const parsed = parseIso(date);
  return isoDate(addDays(parsed, 1 - isoDayOfWeek(parsed)));
}

function external(session: SessionDay): boolean {
  return (
    session.dayType === "club" || session.dayType === "match" || Boolean(session.externalCommitment)
  );
}

function hasOwnWork(session: SessionDay | null | undefined): session is SessionDay {
  return (
    !!session &&
    !session.isUnavailable &&
    session.dayType !== "rest" &&
    session.durationMin > 0 &&
    !external(session)
  );
}

/** A whole session built around sprinting (not a microdose inside another session). */
export function isDedicatedSprintSession(session: SessionDay | null | undefined): boolean {
  return hasOwnWork(session) && classifySession(session).category === "speed_sprint";
}

/** Counted sprint metres of one own session (≥90%; run-ins, drills, braking and submaximal work excluded). */
export function ownSprintMeters(session: SessionDay | null | undefined): number {
  return hasOwnWork(session) ? estimateLimitedSprintMeters({ ...session, secondSession: null }) : 0;
}

function slots(day: SessionDay): SessionDay[] {
  return [day, day.secondSession].filter(Boolean) as SessionDay[];
}

export function weekSprintSummary(week: SessionDay[]) {
  const sessions = week.flatMap(slots);
  return {
    dedicatedSessions: sessions.filter(isDedicatedSprintSession).length,
    meters: sessions.reduce((total, session) => total + ownSprintMeters(session), 0),
  };
}

/** Calendar weeks (Monday–Sunday), including partial weeks at the plan edges. */
export function weeklySprintIssues(plan: SessionDay[]): WeeklySprintIssue[] {
  const weeks = new Map<string, SessionDay[]>();
  for (const day of [...plan].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = calendarMonday(day.date);
    weeks.set(key, [...(weeks.get(key) ?? []), day]);
  }
  const issues: WeeklySprintIssue[] = [];
  for (const [week, days] of weeks) {
    let dedicated = 0;
    let meters = 0;
    let reportedMeters = false;
    for (const day of days)
      for (const session of slots(day)) {
        if (isDedicatedSprintSession(session)) {
          dedicated += 1;
          if (dedicated > MAX_DEDICATED_SPRINT_SESSIONS_PER_WEEK)
            issues.push({
              code: "extra-sprint-session",
              date: day.date,
              week,
              message: "Tydzień ma już dedykowaną sesję sprintu. Limit to jedna sesja tygodniowo.",
            });
        }
        meters += ownSprintMeters(session);
        if (!reportedMeters && meters > MAX_WEEKLY_SPRINT_METERS) {
          reportedMeters = true;
          issues.push({
            code: "weekly-sprint-meters",
            date: day.date,
            week,
            message: `Tydzień przekracza limit ${MAX_WEEKLY_SPRINT_METERS} m sprintu.`,
          });
        }
      }
  }
  return issues;
}
