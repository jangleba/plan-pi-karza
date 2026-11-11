import type { SessionDay } from "./types";
import { addDays, isoDate, parseIso } from "./labels";
import { isMainGymSession, normalizeSessionCategory } from "./sessionClassification";
import { assessDaySpeedLoad, assessSpeedLoad } from "./speedLoad";
import { gymSpacingIssues, hasHighGymToSpeedConflict, isHighLowerGym } from "./strengthScheduling";
import {
  calendarMonday,
  isDedicatedSprintSession,
  ownSprintMeters,
  weeklySprintIssues,
} from "./weeklySprintPolicy";

type Matcher = (session: SessionDay) => boolean;

interface Conflict {
  /** Dates that may be changed, in order of preference. */
  dates: string[];
  matches: Matcher;
  reason: string;
}

const previousDate = (date: string) => isoDate(addDays(parseIso(date), -1));

function external(session: SessionDay): boolean {
  return (
    session.dayType === "club" || session.dayType === "match" || Boolean(session.externalCommitment)
  );
}

function restDay(day: SessionDay, reason: string): SessionDay {
  return normalizeSessionCategory({
    ...day,
    dayType: "rest",
    type: "rest",
    title: "Odpoczynek",
    sessionType: "Odpoczynek",
    goalLabel: "Regeneracja",
    intensity: "niska",
    durationMin: 0,
    goalOfSession: "Dzień bez własnego treningu.",
    reason,
    whyToday: reason,
    riskManaged: reason,
    avoidToday: "Bez dodatkowej pracy w tym dniu.",
    structuredSections: undefined,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    exercises: undefined,
    trainingMethods: undefined,
    speedGeneratorVersion: undefined,
    loadTags: ["recovery_low"],
    classification: undefined,
    secondSession: null,
    slotLabel: null,
  });
}

function conflicts(plan: SessionDay[]): Conflict[] {
  const found: Conflict[] = [];
  const byDate = new Map(plan.map((day) => [day.date, day]));
  for (const issue of gymSpacingIssues(plan))
    found.push({
      dates:
        issue.code === "adjacent-gym-days" ? [issue.date, previousDate(issue.date)] : [issue.date],
      matches: isMainGymSession,
      reason:
        "Zachowano dzień bez siłowni między sesjami, także na granicy tygodni. Dwa ciężkie treningi nóg nie wypadają dzień po dniu.",
    });
  for (const issue of weeklySprintIssues(plan)) {
    const weekDates = plan
      .filter((day) => calendarMonday(day.date) === issue.week)
      .map((day) => day.date)
      .reverse();
    found.push({
      dates: [issue.date, ...weekDates.filter((date) => date !== issue.date)],
      matches:
        issue.code === "extra-sprint-session"
          ? isDedicatedSprintSession
          : (session) => ownSprintMeters(session) > 0,
      reason:
        issue.code === "extra-sprint-session"
          ? "Limit tygodnia: najwyżej jedna dedykowana sesja sprintu."
          : "Limit tygodnia: najwyżej 240 m sprintu.",
    });
  }
  for (const day of plan) {
    const prior = byDate.get(previousDate(day.date));
    if (!prior) continue;
    if (hasHighGymToSpeedConflict(prior, day))
      found.push({
        dates: [day.date, prior.date],
        matches: (session) =>
          session.date === day.date
            ? assessSpeedLoad(session).countsAsSpeedExposure
            : isHighLowerGym(session),
        reason: "Pełny sprint nie wypada dzień po ciężkim treningu nóg, także na granicy tygodni.",
      });
    if (
      assessDaySpeedLoad(prior).blocksAdjacentSpeedDay &&
      assessDaySpeedLoad(day).realExposureCount > 0
    )
      found.push({
        dates: [day.date, prior.date],
        matches: (session) => assessSpeedLoad(session).countsAsSpeedExposure,
        reason: "Zachowano odstęp między ekspozycjami szybkościowymi na granicy tygodni.",
      });
  }
  return found;
}

/**
 * A regenerated week or a plan extension is built without the neighbouring
 * days. After it is spliced in, resolve conflicts with the neighbours by
 * changing ONLY days of the new segment. Executed, started or external
 * sessions and every day outside the segment stay untouched.
 */
export function repairSegmentBoundaries(
  plan: SessionDay[],
  segmentDates: Iterable<string>,
): SessionDay[] {
  const editable = new Set(segmentDates);
  const next = plan.slice();
  const changeable = (session: SessionDay | null | undefined, day: SessionDay) =>
    !!session &&
    !session.executionProtected &&
    !day.executionProtected &&
    !external(session) &&
    session.dayType !== "rest" &&
    session.durationMin > 0;
  for (let pass = 0; pass < next.length * 3; pass++) {
    let changed = false;
    for (const conflict of conflicts(next)) {
      for (const date of conflict.dates) {
        if (!editable.has(date)) continue;
        const index = next.findIndex((day) => day.date === date);
        if (index < 0) continue;
        const day = next[index];
        if (changeable(day.secondSession, day) && conflict.matches(day.secondSession!)) {
          next[index] = { ...day, secondSession: null, slotLabel: null };
          changed = true;
        } else if (changeable(day, day) && conflict.matches(day)) {
          next[index] = day.secondSession
            ? normalizeSessionCategory({
                ...day.secondSession,
                date: day.date,
                dayName: day.dayName,
                dayOfWeek: day.dayOfWeek,
                mdLabel: day.mdLabel,
                mdRelation: day.mdRelation,
                dayDbId: day.dayDbId,
                planDbId: day.planDbId,
                cycleId: day.cycleId,
                weekMeta: day.weekMeta,
                secondSession: null,
                slotLabel: null,
                reason: conflict.reason,
              })
            : restDay(day, conflict.reason);
          changed = true;
        }
        if (changed) break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return next;
}
