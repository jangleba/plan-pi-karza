import type { Profile, SessionDay } from "./types";
import { addDays, isoDate, isoDayOfWeek, parseIso } from "./labels";
import {
  classifySession,
  isEnduranceSession,
  isMainGymSession,
  normalizeSessionCategory,
} from "./sessionClassification";
import { assessDaySpeedLoad } from "./speedLoad";
import { isProfileMatchDate } from "./matchSchedule";

type Slot = { index: number; second: boolean };
export type GymSpacingIssue = {
  code: "duplicate-gym-same-day" | "adjacent-gym-days";
  date: string;
};

export function dayHasGym(day: SessionDay): boolean {
  return isMainGymSession(day) || Boolean(day.secondSession && isMainGymSession(day.secondSession));
}

/** Calendar days, both slots, including partial weeks and Sunday–Monday. */
export function gymSpacingIssues(plan: SessionDay[]): GymSpacingIssue[] {
  const issues: GymSpacingIssue[] = [];
  const gymDates = new Set(plan.filter(dayHasGym).map((day) => day.date));
  for (const day of plan) {
    if (isMainGymSession(day) && day.secondSession && isMainGymSession(day.secondSession)) {
      issues.push({ code: "duplicate-gym-same-day", date: day.date });
    }
    if (dayHasGym(day) && gymDates.has(isoDate(addDays(parseIso(day.date), -1)))) {
      issues.push({ code: "adjacent-gym-days", date: day.date });
    }
  }
  return issues;
}

/** Validate the effective replacement/addition before any database write. */
export function gymChangeBlockReason(
  plan: SessionDay[],
  date: string,
  changedDay: SessionDay,
): string | null {
  if (!dayHasGym(changedDay)) return null;
  const candidate = plan.map((day) => (day.date === date ? changedDay : day));
  const adjacent = new Set([date, isoDate(addDays(parseIso(date), 1))]);
  const issue = gymSpacingIssues(candidate).find((item) => adjacent.has(item.date));
  if (issue)
    return issue.code === "duplicate-gym-same-day"
      ? "Tego dnia jest już siłownia. Nie dodajemy drugiej sesji siłowej."
      : "Zachowaj co najmniej jeden pełny dzień bez siłowni między sesjami. Przysiad i martwy ciąg nie mogą wypaść dzień po dniu.";
  const weeklyGym = candidate
    .filter((day) => monday(day.date) === monday(date))
    .flatMap((day) => [day, day.secondSession])
    .filter((session) => session && isMainGymSession(session));
  if (weeklyGym.length > 2)
    return "Ten tydzień ma już dwie sesje siłowe. Wybierz inny rodzaj treningu.";
  return null;
}

function monday(date: string): string {
  const parsed = parseIso(date);
  return isoDate(addDays(parsed, 1 - isoDayOfWeek(parsed)));
}

function sessionAt(plan: SessionDay[], slot: Slot): SessionDay | null {
  return slot.second ? (plan[slot.index].secondSession ?? null) : plan[slot.index];
}

/** Move prescription only. The destination keeps its calendar and slot IDs. */
function atDestination(session: SessionDay, destination: SessionDay, second: boolean): SessionDay {
  return {
    ...session,
    date: destination.date,
    dayOfWeek: destination.dayOfWeek,
    dayName: destination.dayName,
    mdLabel: destination.mdLabel,
    mdRelation: destination.mdRelation,
    blockWeekNumber: destination.blockWeekNumber,
    blockPhaseLabel: destination.blockPhaseLabel,
    weekMeta: destination.weekMeta,
    dayDbId: destination.dayDbId,
    dbId: second ? destination.secondSession?.dbId : destination.dbId,
    sessionId: second ? destination.secondSession?.sessionId : destination.sessionId,
    slotLabel: second ? "Sesja 2" : destination.slotLabel,
    secondSession: null,
  };
}

function put(plan: SessionDay[], slot: Slot, session: SessionDay | null): void {
  const day = plan[slot.index];
  if (slot.second) {
    plan[slot.index] = {
      ...day,
      secondSession: session ? atDestination(session, day, true) : null,
      slotLabel: session ? "Sesja 1" : null,
    };
  } else if (session) {
    plan[slot.index] = { ...atDestination(session, day, false), secondSession: day.secondSession };
  }
}

function canHostGym(day: SessionDay, profile: Profile): boolean {
  if (
    day.isUnavailable ||
    day.externalCommitment ||
    day.dayType === "match" ||
    day.dayType === "md-1"
  )
    return false;
  if (["MD-1", "MD-2", "MD+1"].includes(day.mdLabel ?? "")) return false;
  if (
    profile.individualTrainingDays?.length &&
    day.dayType !== "club" &&
    !profile.individualTrainingDays.includes(isoDayOfWeek(parseIso(day.date)))
  )
    return false;
  for (let offset = -1; offset <= 2; offset++) {
    const date = addDays(parseIso(day.date), offset);
    if (isProfileMatchDate(profile, isoDate(date))) return false;
    if (
      profile.weeklyMatches &&
      typeof profile.usualMatchDay === "number" &&
      isoDayOfWeek(date) === profile.usualMatchDay
    )
      return false;
  }
  return true;
}

function compatibleDay(day: SessionDay, profile: Profile): boolean {
  const second = day.secondSession;
  if (!second) return true;
  const mainCategory = classifySession(day).category;
  if (mainCategory === classifySession(second).category) return false;
  if ((profile.age < 16 || profile.level === "beginner") && second.intensity !== "niska")
    return false;
  if (day.dayType === "club" && isMainGymSession(second) && second.intensity === "wysoka")
    return false;
  if (
    isMainGymSession(second) &&
    day.classification?.subcategory === "field_mas_test" &&
    classifySession(second).isHeavyLegs
  )
    return false;
  if (
    (isEnduranceSession(day) || isEnduranceSession(second)) &&
    (isMainGymSession(day) || isMainGymSession(second)) &&
    day.intensity === "wysoka" &&
    second.intensity === "wysoka"
  )
    return false;
  return true;
}

function otherPlacementConflicts(plan: SessionDay[]): Set<string> {
  const conflicts = new Set<string>();
  const byDate = new Map(plan.map((day) => [day.date, day]));
  for (const day of plan) {
    const speed = assessDaySpeedLoad(day);
    if (speed.hasDuplicateRealSpeedExposures) conflicts.add(`speed-duplicate:${day.date}`);
    const previous = byDate.get(isoDate(addDays(parseIso(day.date), -1)));
    if (previous && assessDaySpeedLoad(previous).blocksAdjacentSpeedDay && speed.realExposureCount)
      conflicts.add(`speed-adjacent:${day.date}`);
    const endurance =
      isEnduranceSession(day) ||
      Boolean(day.secondSession && isEnduranceSession(day.secondSession));
    if (isEnduranceSession(day) && day.secondSession && isEnduranceSession(day.secondSession))
      conflicts.add(`endurance-duplicate:${day.date}`);
    if (
      endurance &&
      previous &&
      (isEnduranceSession(previous) ||
        Boolean(previous.secondSession && isEnduranceSession(previous.secondSession)))
    )
      conflicts.add(`endurance-adjacent:${day.date}`);
  }
  return conflicts;
}

function relocateGym(plan: SessionDay[], source: Slot, profile: Profile): boolean {
  const session = sessionAt(plan, source);
  if (!session) return false;
  const before = gymSpacingIssues(plan).length;
  const otherBefore = otherPlacementConflicts(plan);
  const candidates: Slot[] = [];
  plan.forEach((day, index) => {
    if (
      index === source.index ||
      monday(day.date) !== monday(session.date) ||
      !canHostGym(day, profile)
    )
      return;
    if (day.dayType === "training" || day.dayType === "recovery" || day.dayType === "rest") {
      if (!isMainGymSession(day)) candidates.push({ index, second: false });
    }
    // Move an existing second gym to another complementary second slot.
    if (
      source.second &&
      day.dayType !== "rest" &&
      (!day.secondSession || !isMainGymSession(day.secondSession))
    ) {
      candidates.push({ index, second: true });
    }
  });
  candidates.sort(
    (a, b) =>
      Number(a.second) - Number(b.second) ||
      Math.abs(a.index - source.index) - Math.abs(b.index - source.index),
  );
  for (const target of candidates) {
    const displaced = sessionAt(plan, target);
    // An empty slot can receive only a second session; a main slot must stay a day.
    if (!displaced && !source.second) continue;
    const trial = plan.slice();
    put(trial, source, displaced);
    put(trial, target, session);
    if (
      gymSpacingIssues(trial).length >= before ||
      [...otherPlacementConflicts(trial)].some((issue) => !otherBefore.has(issue)) ||
      !compatibleDay(trial[source.index], profile) ||
      !compatibleDay(trial[target.index], profile)
    )
      continue;
    const moved = sessionAt(trial, target)!;
    moved.reason =
      "Przeniesiono siłownię, aby zachować co najmniej jeden pełny dzień bez siłowni między sesjami.";
    moved.whyToday = moved.reason;
    plan[source.index] = trial[source.index];
    plan[target.index] = trial[target.index];
    return true;
  }
  return false;
}

function removeConflictingGym(plan: SessionDay[], slot: Slot): void {
  const day = plan[slot.index];
  if (slot.second) {
    put(plan, slot, null);
    return;
  }
  const reason =
    "Brak bezpiecznego terminu siłowni z dniem przerwy. Nie dokładamy drugiej siłowni dzień po dniu.";
  if (day.secondSession) {
    plan[slot.index] = { ...atDestination(day.secondSession, day, false), slotLabel: null, reason };
    return;
  }
  plan[slot.index] = normalizeSessionCategory({
    ...day,
    dayType: "recovery",
    type: "recovery",
    title: "Regeneracja",
    sessionType: "Regeneracja",
    goalLabel: "Regeneracja",
    intensity: "niska",
    durationMin: 0,
    goalOfSession: "Odpoczynek między sesjami siłowymi.",
    reason,
    whyToday: reason,
    riskManaged: "Zachowujemy odstęp między sesjami siłowymi.",
    avoidToday: "Bez dodatkowej siłowni.",
    structuredSections: undefined,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    loadTags: ["recovery_low"],
    classification: undefined,
    secondSession: null,
    slotLabel: null,
  });
}

/** Preserve prescriptions and weekly counts by moving first; safety wins if no slot exists. */
export function repairGymSpacing(plan: SessionDay[], profile: Profile): void {
  for (let pass = 0; pass < plan.length * 2; pass++) {
    const issue = gymSpacingIssues(plan)[0];
    if (!issue) {
      // Two gym sessions per calendar week; extra sessions never repair a quota.
      const weeks = new Map<string, Slot[]>();
      plan.forEach((day, index) => {
        const slots = weeks.get(monday(day.date)) ?? [];
        if (isMainGymSession(day)) slots.push({ index, second: false });
        if (day.secondSession && isMainGymSession(day.secondSession))
          slots.push({ index, second: true });
        weeks.set(monday(day.date), slots);
      });
      for (const slots of weeks.values()) {
        for (const slot of slots.slice(2).reverse()) removeConflictingGym(plan, slot);
      }
      return;
    }
    const index = plan.findIndex((day) => day.date === issue.date);
    const day = plan[index];
    const source = {
      index,
      second: Boolean(day.secondSession && isMainGymSession(day.secondSession)),
    };
    if (!relocateGym(plan, source, profile)) removeConflictingGym(plan, source);
  }
}
