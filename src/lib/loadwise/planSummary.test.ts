import { describe, expect, it } from "vitest";
import { buildPlanSummary } from "./planSummary";
import { generateTrainingPlan } from "./engineV2/planner";
import { proposeFeedbackAdjustment } from "./engineV2/feedbackAdjustment";
import type { Profile, SessionCompletion, SessionDay } from "./types";

const profile = {
  name: "Summary athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
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
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
function plan() {
  const result = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 2 });
  for (const d of result.plan) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "plan-1";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return result.plan;
}
const done = (rpe: number | null, extra: Partial<SessionCompletion> = {}): SessionCompletion => ({
  completed: true,
  status: "completed",
  rpe,
  notes: "",
  ...extra,
});
const build = (p: SessionDay[], completions: Record<string, SessionCompletion>) =>
  buildPlanSummary({
    profile,
    plan: p,
    completions,
    history: [],
    readiness: {},
    todayIso: "2026-11-20",
  })!;

describe("plan summary", () => {
  it("is empty without a plan", () => {
    expect(
      buildPlanSummary({
        profile,
        plan: [],
        completions: {},
        history: [],
        readiness: {},
        todayIso: "2026-11-20",
      }),
    ).toBeNull();
  });

  it("separates done, skipped execution and not-plannable stimuli", () => {
    const p = plan();
    const own = p.flatMap(slots).filter((s) => s.engineV2);
    const first = own[0];
    const summary = build(p, { [first.dbId!]: done(7, { durationMin: 50 }) });
    expect(summary.own.planned).toBe(
      own.filter((s) =>
        s.engineV2!.roles.some((r) => ["strengthA", "strengthB", "speed", "endurance"].includes(r)),
      ).length,
    );
    expect(summary.own.done).toBe(1);
    expect(summary.own.missed).toBe(summary.own.planned - 1);
    const target = summary.targets.find((t) => t.done === 1)!;
    expect(target.missed).toBe(target.planned - 1);
    // a stimulus the generator could not schedule is a different column from a skipped session
    const withIssue = structuredClone(p);
    withIssue[0].enginePlanIssues = [
      {
        code: "UNMET_WEEKLY_TARGET",
        target: "speed",
        date: "2026-11-02",
        message: "Tydzień 1: nie znaleziono terminu na sprint.",
      },
      {
        code: "UNMET_WEEKLY_TARGET",
        date: "2026-11-09",
        message: "Tydzień 2: nie znaleziono terminu na siłę B. Brak.",
      },
    ];
    const unmet = build(withIssue, {});
    expect(unmet.targets.find((t) => t.target === "speed")!.notPlanned).toBe(1);
    expect(unmet.targets.find((t) => t.target === "strengthB")!.notPlanned).toBe(1);
    expect(unmet.targets.find((t) => t.target === "speed")!.external).toBe(0);
  });

  it("does not count sessions still ahead as skipped", () => {
    const p = plan();
    const early = buildPlanSummary({
      profile,
      plan: p,
      completions: {},
      history: [],
      readiness: {},
      todayIso: "2026-11-02",
    })!;
    expect(early.own.missed).toBe(0);
  });

  it("counts club load with the 90-minute assumption flagged, and unanswered RPE as no number", () => {
    const p = plan();
    const clubs = p.filter((d) => d.dayType === "club");
    expect(clubs.length).toBe(2);
    clubs[0].dbId = "club-1";
    clubs[1].dbId = "club-2";
    const summary = build(p, {
      "club-1": done(7, {
        durationMin: 90,
        durationSource: "club_default",
        activityTags: ["technical"],
      }),
      "club-2": done(null, { durationMin: 90, durationSource: "club_default" }),
    });
    expect(summary.club).toMatchObject({
      sessions: 2,
      completed: 2,
      loadAu: 630,
      loadUsesAssumedMinutes: true,
      withoutLoad: 1,
    });
  });

  it("match load uses played minutes only; zero minutes is a real zero", () => {
    const p = plan();
    const match = {
      ...p.find((d) => d.dayType === "rest")!,
      dayType: "match" as const,
      dbId: "m1",
    };
    p[p.indexOf(p.find((d) => d.dayType === "rest")!)] = match;
    const summary = build(p, { m1: done(8, { durationMin: 115, matchMinutesPlayed: 25 }) });
    expect(summary.club).toMatchObject({
      matches: 1,
      matchesCompleted: 1,
      matchMinutesPlayed: 25,
      loadAu: 200,
    });
    const zero = build(p, { m1: done(8, { durationMin: 115, matchMinutesPlayed: 0 }) });
    expect(zero.club.loadAu).toBe(0);
    expect(zero.club.withoutLoad).toBe(0);
    const unknown = build(p, { m1: done(8, { durationMin: 115 }) });
    expect(unknown.club.withoutLoad).toBe(1);
  });

  it("shows a goal covered by reported club work separately from a completed session", () => {
    const p = plan();
    const completions: Record<string, SessionCompletion> = {
      "s-2026-11-02-0": done(6, {
        durationMin: 90,
        durationSource: "club_default",
        activityTags: ["running_endurance"],
        feedbackVersion: 1,
        endedAt: "2026-11-02T19:00:00Z",
      }),
    };
    const proposal = proposeFeedbackAdjustment({
      profile,
      plan: p,
      completions,
      todayIso: "2026-11-03",
      planId: "plan-1",
    })!;
    const applied = [...p.filter((d) => d.date < "2026-11-03"), ...proposal.candidatePlan];
    const summary = build(applied, completions);
    const endurance = summary.targets.find((t) => t.target === "endurance")!;
    expect(endurance.external).toBe(1);
    expect(endurance.done).toBe(0);
    expect(summary.credits[0]).toMatchObject({ status: "external_reported", goal: "endurance" });
    expect(summary.own.done).toBe(0);
  });

  it("does not claim improvement from attendance alone", () => {
    const p = plan();
    const summary = build(p, {});
    expect(summary.comparable.join(" ")).toContain("Sama frekwencja nie oznacza poprawy");
  });
});

describe("strength comparison from real set logs", () => {
  const sets = (key: string, a: [string, number, number], b: [string, number, number]) => [
    { exerciseKey: key, date: a[0], weightKg: a[1], reps: a[2] },
    { exerciseKey: key, date: b[0], weightKg: b[1], reps: b[2] },
  ];
  it("reports improvement, flat and decline from comparable sets, never from attendance", () => {
    const p = plan();
    const summary = buildPlanSummary({
      profile,
      plan: p,
      completions: {},
      history: [],
      readiness: {},
      todayIso: "2026-11-20",
      strengthSets: [
        ...sets("squat", ["2026-11-03", 80, 6], ["2026-11-10", 90, 6]), // up
        ...sets("rdl", ["2026-11-03", 100, 6], ["2026-11-10", 100, 6]), // flat
        ...sets("bench", ["2026-11-03", 70, 6], ["2026-11-10", 60, 6]), // down
        { exerciseKey: "row", date: "2026-11-10", weightKg: 50, reps: 8 }, // one day only: not compared
      ],
    })!;
    expect(summary.comparable.join(" ")).toContain("poprawa 1, bez zmiany 1, spadek 1 z 3");
    expect(summary.comparable.join(" ")).not.toContain("Brak porównywalnych");
  });
  it("keeps the honest 'no data' line when there are no sets", () => {
    expect(build(plan(), {}).comparable.join(" ")).toContain("Brak porównywalnych pomiarów");
  });
});
