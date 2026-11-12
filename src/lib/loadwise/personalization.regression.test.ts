import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { reconcilePlanIdentity, trainingProfileRevision } from "./planIdentity";
import { rememberedMatchWeekday, scheduledMatchDates } from "./matchSchedule";
import { ownTrainingAllowed } from "./availability";
import { classifySession } from "./sessionClassification";
import {
  countFocusSessions,
  focusTargets,
  isOwnWork,
  unmetFocusNote,
  unmetFocusTargets,
} from "./trainingFocus";
import type { Profile, SessionCompletion, SessionDay } from "./types";

/**
 * The week follows the athlete's own data: what they want to improve, when
 * they can train, what they cannot use, and the matches they really have.
 * Every test generates the full plan (generatePlan, final policy included).
 */

const NOV = new Date(2026, 10, 16); // Monday, in season

const athlete = (patch: Partial<Profile> = {}): Profile =>
  ({
    name: "Test",
    age: 22,
    position: "midfielder",
    level: "intermediate",
    goal: "speed",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: "no_fixed_day",
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21"],
    weeklyMatches: false,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...patch,
  }) as Profile;

const weeks = (plan: SessionDay[]) =>
  [0, 7, 14, 21].map((start) => plan.slice(start, start + 7)).filter((w) => w.length === 7);
const slots = (days: SessionDay[]) =>
  days.flatMap((day) => [day, day.secondSession]).filter((s): s is SessionDay => !!s);
const ownSlots = (days: SessionDay[]) => slots(days).filter((s) => isOwnWork(s));
const weekday = (day: SessionDay) => new Date(`${day.date}T12:00:00Z`).getUTCDay() || 7;

beforeAll(() => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterAll(() => vi.restoreAllMocks());

describe("the chosen goal changes what the week contains", () => {
  it("„Gra z piłką” brings own ball sessions; „Szybkość” does not need them", () => {
    const speed = generatePlan(athlete({ goal: "speed" }), NOV, 28);
    const general = generatePlan(athlete({ goal: "general" }), NOV, 28);
    // Weeks 2–4 have no match: room for the choice in every week.
    for (const week of weeks(general).slice(1))
      expect(countFocusSessions(week, "ball")).toBeGreaterThanOrEqual(1);
    expect(countFocusSessions(general, "ball")).toBeGreaterThan(countFocusSessions(speed, "ball"));
    expect(JSON.stringify(general.map((d) => d.title))).not.toBe(
      JSON.stringify(speed.map((d) => d.title)),
    );
  }, 60_000);

  it("„Siła” keeps two strength sessions in a free week, „Wytrzymałość” two runs", () => {
    for (const [goal, quality] of [
      ["strength", "strength"],
      ["endurance", "endurance"],
    ] as const) {
      const plan = generatePlan(athlete({ goal }), NOV, 28);
      for (const week of weeks(plan).slice(1))
        expect(countFocusSessions(week, quality), goal).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);

  it("the limiter adds its quality on top of the goal", () => {
    const without = generatePlan(athlete({ goal: "speed" }), NOV, 28);
    const ball = generatePlan(athlete({ goal: "speed", secondaryLimiter: "ball" }), NOV, 28);
    for (const week of weeks(ball).slice(1))
      expect(countFocusSessions(week, "ball")).toBeGreaterThanOrEqual(1);
    expect(countFocusSessions(ball, "ball")).toBeGreaterThan(countFocusSessions(without, "ball"));
    expect(focusTargets(athlete({ goal: "speed", secondaryLimiter: "ball" }))).toEqual([
      expect.objectContaining({ quality: "speed", source: "goal" }),
      expect.objectContaining({ quality: "ball", source: "limiter" }),
    ]);
  }, 60_000);

  it("safety first: pain or a return gives no minimum for the choices", () => {
    expect(focusTargets(athlete({ goal: "general", painInjury: true }))).toEqual([]);
    expect(focusTargets(athlete({ goal: "return" }))).toEqual([]);
    expect(focusTargets(athlete({ goal: "general", secondaryLimiter: "fatigue" }))).toEqual([]);
  });
});

describe("exclusions are respected", () => {
  it("no own session (either slot) on an unavailable day", () => {
    const profile = athlete({
      unavailableDays: [1, 3],
      individualTrainingDays: [2, 4, 5, 6, 7],
      doubleSessionsAllowed: "yes_if_safe",
    });
    const plan = generatePlan(profile, NOV, 28);
    for (const day of plan.filter((d) => [1, 3].includes(weekday(d))))
      expect(ownSlots([day]), day.date).toEqual([]);
  }, 60_000);

  it("own days restrict own work; club days stay club", () => {
    const profile = athlete({
      individualTrainingDays: [1, 3, 5],
      doubleSessionsAllowed: "yes_if_safe",
    });
    const plan = generatePlan(profile, NOV, 28);
    for (const day of plan) {
      if (ownTrainingAllowed(profile, weekday(day))) continue;
      expect(ownSlots([day]), day.date).toEqual([]);
    }
    expect(plan.filter((d) => d.dayType === "club").map(weekday)).toEqual(
      expect.arrayContaining([2, 4]),
    );
  }, 60_000);

  it("without a gym nothing is planned at a gym", () => {
    const plan = generatePlan(athlete({ goal: "strength", hasGym: false }), NOV, 28);
    for (const slot of ownSlots(plan)) {
      expect(slot.title).not.toMatch(/siłowni/i);
      const ids = (slot.structuredSections ?? [])
        .flatMap((section) => section.blocks.flatMap((block) => block.exercises))
        .map((exercise) => exercise.exerciseId ?? "");
      expect(
        ids.filter((id) => /barbell|machine|leg_press|cable/.test(id)),
        slot.title,
      ).toEqual([]);
    }
    // The goal still shows: strength without a gym.
    for (const week of weeks(plan).slice(1))
      expect(countFocusSessions(week, "strength")).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("one session a day means no second session anywhere", () => {
    const plan = generatePlan(athlete({ goal: "general", doubleSessionsAllowed: "no" }), NOV, 28);
    expect(plan.filter((day) => day.secondSession).map((day) => day.date)).toEqual([]);
  }, 60_000);
});

describe("matches come only from the athlete's fixtures", () => {
  it("no saved match and no fixed day: no match and no pre-match activation", () => {
    const profile = athlete({
      matchDate: null,
      matchDates: [],
      weeklyMatches: false,
      usualMatchDay: "no_fixed_day",
    });
    const plan = generatePlan(profile, NOV, 28);
    expect(plan.filter((d) => d.dayType === "match")).toEqual([]);
    expect(plan.filter((d) => d.dayType === "md-1" || d.mdLabel === "MD-1")).toEqual([]);
  }, 60_000);

  it("a single saved match is the only match; no Sunday is invented", () => {
    const plan = generatePlan(athlete(), NOV, 28);
    expect(plan.filter((d) => d.dayType === "match").map((d) => d.date)).toEqual(["2026-11-21"]);
    expect(plan.filter((d) => d.mdLabel === "MD-1").map((d) => d.date)).toEqual(["2026-11-20"]);
    expect(rememberedMatchWeekday([], "2026-11-23", "no_fixed_day", false)).toBeNull();
    expect(scheduledMatchDates(athlete(), "2026-11-16", 28)).toEqual(["2026-11-21"]);
  }, 60_000);

  it("a deliberately chosen weekly day gives a match every week", () => {
    const profile = athlete({ weeklyMatches: true, usualMatchDay: 6 });
    const plan = generatePlan(profile, NOV, 28);
    expect(plan.filter((d) => d.dayType === "match").map((d) => d.date)).toEqual([
      "2026-11-21",
      "2026-11-28",
      "2026-12-05",
      "2026-12-12",
    ]);
    for (const match of ["2026-11-20", "2026-11-27", "2026-12-04", "2026-12-11"])
      expect(plan.find((d) => d.date === match)?.mdLabel).toBe("MD-1");
  }, 60_000);
});

describe("a settings change recalculates only the future", () => {
  it("moving the match moves MD-1 and the match; past and done sessions stay", () => {
    const before = athlete({ goal: "general" });
    const old = generatePlan(before, NOV, 28).map((day, index) => ({
      ...day,
      dbId: `db-${index}`,
    }));
    const done: Record<string, SessionCompletion> = {
      "db-0": { completed: true, status: "completed", durationMin: 40, rpe: 6, notes: "" },
    };
    const after = { ...before, matchDate: "2026-11-22", matchDates: ["2026-11-22"] };
    expect(trainingProfileRevision(after)).not.toBe(trainingProfileRevision(before));

    const today = "2026-11-18";
    const next = reconcilePlanIdentity(generatePlan(after, NOV, 28), old, done, today);
    // History: Monday (done) and Tuesday (past) are kept exactly as they were.
    for (const date of ["2026-11-16", "2026-11-17"]) {
      const kept = next.find((day) => day.date === date)!;
      const was = old.find((day) => day.date === date)!;
      expect(kept.title).toBe(was.title);
      expect(kept.dbId).toBe(was.dbId);
      expect(kept.executionProtected).toBe(true);
    }
    // Future: the match and its MD-1 follow the new date.
    expect(next.filter((d) => d.dayType === "match").map((d) => d.date)).toEqual(["2026-11-22"]);
    expect(next.find((d) => d.date === "2026-11-21")?.mdLabel).toBe("MD-1");
    expect(next.find((d) => d.date === "2026-11-21")?.dayType).not.toBe("match");
  }, 60_000);
});

describe("days with two sessions count both", () => {
  it("the „+1” session counts towards the choice", () => {
    const day = (patch: Partial<SessionDay>): SessionDay =>
      ({
        date: "2026-11-17",
        dayName: "Wtorek",
        dayType: "training",
        title: "Siła ogólna",
        goalLabel: "Siła",
        intensity: "umiarkowana",
        durationMin: 45,
        reason: "",
        safetyNote: null,
        whyToday: "",
        sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
        secondSession: null,
        ...patch,
      }) as SessionDay;
    const ball = day({
      title: "Własna technika z piłką",
      sessionType: "Technika z piłką — własna sesja",
      goalLabel: "Piłka",
      intensity: "niska",
      durationMin: 30,
    });
    expect(classifySession(ball).subcategory).toBe("ball_technical");
    const club = day({ dayType: "club", title: "Trening klubowy", externalCommitment: true });
    expect(countFocusSessions([club], "ball")).toBe(0);
    expect(countFocusSessions([{ ...club, secondSession: ball }], "ball")).toBe(1);
    expect(countFocusSessions([{ ...ball, secondSession: { ...ball } }], "ball")).toBe(2);
  });

  it("a crowded week names the choice it could not fit and why", () => {
    const profile = athlete({
      goal: "general",
      clubTrainingDays: [1, 2, 3, 4],
      individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
      matchDate: "2026-11-21",
      matchDates: ["2026-11-21"],
    });
    const week = generatePlan(profile, NOV, 7);
    if (unmetFocusTargets(week, profile).length) {
      const note = unmetFocusNote(week, profile)!;
      expect(note).toMatch(/^Nie zmieszczono: piłka \(cel: „Gra z piłką”\)/);
      expect(note).toMatch(/4 treningi klubowe/);
      expect(week[0].weekMeta?.planningNotes ?? []).toContain(
        unmetFocusNote(week, profile, []) ?? "",
      );
    } else {
      expect(countFocusSessions(week, "ball")).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
