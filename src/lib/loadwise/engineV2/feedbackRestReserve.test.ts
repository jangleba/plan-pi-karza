import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import { proposeFeedbackAdjustment } from "./feedbackAdjustment";
import { generateTrainingPlan } from "./planner";
import { plusDays, type WeeklyTargets } from "./model";
import { weeklyTargetCoverage } from "./weeklyTargets";
import { preservesWeeklyRestReserve } from "./weeklyRestReserve";

const profile: Profile = {
  name: "Feedback rest reserve",
  age: 21,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [1, 2, 3, 4, 5],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "bench", "ball"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 48,
  movementCompetence: "high",
  supervisionLevel: "full",
};
const targets: WeeklyTargets = { strength: 2, speed: 2, endurance: 1 };
const start = "2026-11-02";
const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const savedPlan = () => {
  const plan = generateTrainingPlan(profile, {
    startDate: start,
    weeks: 1,
    weeklyTargets: targets,
    fillRestDays: true,
    minFullRestDays: 1,
  }).plan;
  for (const day of plan) {
    day.dayDbId = `day-${day.date}`;
    day.planDbId = "plan-rest";
    slots(day).forEach((session, index) => {
      if (session.dayType !== "rest") session.dbId = `s-${session.date}-${index}`;
    });
  }
  return plan;
};
const feedback = (plan: SessionDay[], eventDate: string, todayIso: string) => {
  const event = plan.find((day) => day.date === eventDate)!;
  const completed: SessionCompletion = {
    completed: true,
    status: "completed",
    writeVersion: 1,
    rpe: 9,
    notes: "",
    activityTags: ["technical"],
    feedbackVersion: 1,
    endedAt: `${eventDate}T20:00:00Z`,
  };
  return proposeFeedbackAdjustment({
    profile,
    plan,
    completions: { [event.dbId!]: completed },
    todayIso,
    planId: "plan-rest",
  });
};
const fullRest = (plan: SessionDay[]) => weeklyTargetCoverage(plan, targets)[0].fullRestDays;

describe("feedback keeps the saved weekly rest reserve", () => {
  it("does not move one session of a double day onto the week's last full rest day", () => {
    const plan = savedPlan();
    const index = plan.findIndex((day) => day.date === "2026-11-07");
    const original = plan[index];
    expect(original.engineV2?.roles).toEqual(["speed"]);
    expect(original.secondSession?.engineV2?.roles).toEqual(["endurance"]);
    // The saved slot order does not turn removing the sprint into a whole day off.
    plan[index] = {
      ...original.secondSession!,
      dayDbId: original.dayDbId,
      planDbId: original.planDbId,
      secondSession: { ...original, secondSession: null },
    };
    const source = plan[index].secondSession!;
    expect(source.engineV2?.roles).toEqual(["speed"]);
    expect(fullRest(plan)).toBe(1);

    const proposal = feedback(plan, "2026-11-05", "2026-11-06");
    expect(proposal).toBeTruthy();
    expect(proposal!.changes).not.toContainEqual(
      expect.objectContaining({
        kind: "reschedule",
        sessionId: source.dbId,
        after: expect.objectContaining({ date: "2026-11-08" }),
      }),
    );
    const combined = [...plan.filter((day) => day.date < "2026-11-06"), ...proposal!.candidatePlan];
    expect(fullRest(combined)).toBe(1);
    expect(proposal!.candidatePlan[0].planInputs).toMatchObject({
      weeklyTargets: targets,
      fillRestDays: true,
      minFullRestDays: 1,
    });
  });

  it("still permits moving a second slot to an occupied day when the full rest day remains", () => {
    const plan = savedPlan();
    const source = plan.find((day) => day.date === "2026-11-04")!.secondSession!;
    expect(source.engineV2?.roles).toEqual(["strengthB"]);
    expect(plan.find((day) => day.date === "2026-11-05")?.dayType).toBe("club");
    const proposal = feedback(plan, start, "2026-11-03");
    expect(proposal?.changes).toContainEqual(
      expect.objectContaining({
        kind: "reschedule",
        sessionId: source.dbId,
        after: expect.objectContaining({ date: "2026-11-05" }),
      }),
    );
    expect(fullRest([plan[0], ...proposal!.candidatePlan])).toBe(1);
  });
});

const rest = (offset: number): SessionDay =>
  sessionFixture({
    date: plusDays(start, offset),
    dayType: "rest",
    durationMin: 0,
    secondSession: null,
  });
const occupied = (offset: number): SessionDay => ({ ...rest(offset), dayType: "club" });
const withReserve = (plan: SessionDay[], value: 0 | 1 | 2 = 1) => {
  plan[0].planInputs = {
    matchDates: [],
    individualTrainingDays: [...profile.individualTrainingDays],
    unavailableDays: [],
    clubTrainingDays: [...profile.clubTrainingDays],
    unavailableEquipmentIds: [],
    equipment: [...profile.equipment],
    minutesPerSession: 75,
    minFullRestDays: value,
  };
  return plan;
};

describe("weekly rest reserve comparison", () => {
  it("checks each original rolling week rather than pooling rest days across the full plan", () => {
    const before = withReserve([rest(0), rest(7)]);
    const after = [occupied(0), rest(7)];
    expect(preservesWeeklyRestReserve(before, after)).toBe(false);
    expect(preservesWeeklyRestReserve(before, [rest(0), occupied(7)])).toBe(false);
  });

  it("does not invent rest for missing dates or permit removing the one recorded rest day", () => {
    const before = withReserve([occupied(0), rest(3)]);
    expect(preservesWeeklyRestReserve(before, [occupied(0)])).toBe(false);
  });

  it("preserves the existing reserve without demanding repair of an already impossible week", () => {
    const impossible = withReserve([occupied(0)]);
    expect(preservesWeeklyRestReserve(impossible, structuredClone(impossible))).toBe(true);
    const short = withReserve([occupied(0), rest(3)], 2);
    expect(preservesWeeklyRestReserve(short, structuredClone(short))).toBe(true);
    expect(preservesWeeklyRestReserve(short, [occupied(0), occupied(3)])).toBe(false);
  });

  it("uses the fill-rest default, while plans without saved preferences retain previous behavior", () => {
    const before = withReserve([rest(0)]);
    delete before[0].planInputs!.minFullRestDays;
    before[0].planInputs!.fillRestDays = true;
    expect(preservesWeeklyRestReserve(before, [occupied(0)])).toBe(false);
    delete before[0].planInputs;
    expect(preservesWeeklyRestReserve(before, [occupied(0)])).toBe(true);
  });

  it("does not mutate either supplied plan", () => {
    const before = withReserve([rest(0), rest(7)]);
    const after = [rest(0), occupied(7)];
    const original = structuredClone([before, after]);
    preservesWeeklyRestReserve(before, after);
    expect([before, after]).toEqual(original);
  });

  it("rejects malformed saved preferences rather than treating them as an absent request", () => {
    const before = withReserve([rest(0)]);
    Object.assign(before[0].planInputs!, { minFullRestDays: null });
    expect(preservesWeeklyRestReserve(before, [occupied(0)])).toBe(false);
    delete before[0].planInputs!.minFullRestDays;
    Object.assign(before[0].planInputs!, { fillRestDays: "false" });
    expect(preservesWeeklyRestReserve(before, [occupied(0)])).toBe(false);
  });
});
