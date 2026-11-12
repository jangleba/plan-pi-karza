import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { secondSessionPolicyViolation } from "./finalPlanPolicy";
import { classifySession, isMainGymSession } from "./sessionClassification";
import { dayOrderRank, orderDaySessionsByLoad, sessionLoadKind } from "./sessionLoadKind";
import { trainingProfileRevision } from "./planIdentity";
import {
  countFocusSessions,
  isDevelopmentStrengthSession,
  unmetFocusTargets,
} from "./trainingFocus";
import { isPreparedYouthLifter } from "./youthReadiness";
import type { Profile, SessionDay } from "./types";

/**
 * A club day is not a closed day, the strength goal means real resistance
 * training, and younger athletes are dosed by their experience, technique and
 * supervision, not by age alone. Every plan here goes through generatePlan
 * with the final policy.
 */

const NOV = new Date(2026, 10, 16); // Monday, in season; match Saturday 21.11

const athlete = (patch: Partial<Profile> = {}): Profile =>
  ({
    name: "Test",
    age: 22,
    position: "midfielder",
    level: "intermediate",
    goal: "strength",
    secondaryLimiter: null,
    clubTrainingDays: [1, 2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21"],
    weeklyMatches: true,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
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

/** Declared strength background of a trained younger athlete. */
const trained = {
  gymExperienceLevel: "intermediate",
  strengthTrainingMonths: 18,
  movementCompetence: "high",
  supervisionLevel: "full",
} as const;

const slots = (days: SessionDay[]) =>
  days.flatMap((day) => [day, day.secondSession]).filter((s): s is SessionDay => !!s);
const weekday = (day: SessionDay) => new Date(`${day.date}T12:00:00Z`).getUTCDay() || 7;
const week = (profile: Profile) => generatePlan(profile, NOV, 7);
/** A hand-built own session on the same date, with no content left from the base. */
const own = (base: SessionDay, patch: Partial<SessionDay>): SessionDay =>
  ({
    ...base,
    dayType: "training",
    type: undefined,
    goalOfSession: "",
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    structuredSections: undefined,
    exercises: undefined,
    trainingMethods: undefined,
    secondSession: null,
    ...patch,
  }) as SessionDay;
const exercises = (session: SessionDay) =>
  (session.structuredSections ?? []).flatMap((section) =>
    section.blocks.flatMap((block) => block.exercises),
  );

beforeAll(() => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterAll(() => vi.restoreAllMocks());

describe("goal change: „Siła” means resistance training, not warm-ups", () => {
  it("strength goal: two development strength sessions in a match week, gym included", () => {
    const plan = week(athlete());
    const development = slots(plan).filter(isDevelopmentStrengthSession);
    expect(development.length).toBeGreaterThanOrEqual(2);
    expect(development.every((s) => classifySession(s).category === "gym_strength")).toBe(true);
    expect(unmetFocusTargets(plan, athlete())).toEqual([]);
  }, 60_000);

  it("activation, core and light sessions never count as strength development", () => {
    const plan = week(athlete());
    for (const session of slots(plan)) {
      if (session.mdLabel === "MD-1" || session.intensity === "niska")
        expect(isDevelopmentStrengthSession(session)).toBe(false);
    }
  }, 60_000);

  it("changing the goal changes the week: speed has fewer strength sessions than strength", () => {
    const strength = week(athlete({ goal: "strength" }));
    const speed = week(athlete({ goal: "speed" }));
    expect(countFocusSessions(strength, "strength")).toBeGreaterThan(
      countFocusSessions(speed, "strength"),
    );
    // A goal that is not chosen is not a ban: the speed week still trains strength.
    expect(slots(speed).some((s) => isMainGymSession(s))).toBe(true);
  }, 60_000);
});

describe("club strength blocks count and are not duplicated", () => {
  it("no own strength on the club's strength day, and the club block counts toward the goal", () => {
    const profile = athlete({ clubStrengthDays: [2] });
    const plan = week(profile);
    const tuesday = plan.find((day) => weekday(day) === 2)!;
    expect(tuesday.dayType).toBe("club");
    expect(slots([tuesday]).some((s) => isMainGymSession(s))).toBe(false);
    const own = slots(plan).filter(isDevelopmentStrengthSession).length;
    // One own session is replaced by the club block; the goal still holds.
    expect(own).toBeGreaterThanOrEqual(1);
    expect(countFocusSessions(plan, "strength", profile)).toBe(own + 1);
    expect(unmetFocusTargets(plan, profile)).toEqual([]);
  }, 60_000);

  it("speed goal: the club block covers the strength minimum without a missing-strength note", () => {
    const profile = athlete({ goal: "speed", clubStrengthDays: [2] });
    const plan = week(profile);
    const notes = JSON.stringify(plan[0].weekMeta?.planningNotes ?? []);
    expect(notes).not.toMatch(/minimum tygodnia: siła/);
    const tuesday = plan.find((day) => weekday(day) === 2)!;
    expect(slots([tuesday]).some((s) => isMainGymSession(s))).toBe(false);
  }, 60_000);

  it("a club strength day change triggers a plan rebuild", () => {
    expect(trainingProfileRevision(athlete({ clubStrengthDays: [2] }))).not.toBe(
      trainingProfileRevision(athlete()),
    );
  });
});

describe("club day + one extra session (max two per day, club included)", () => {
  it("senior: club + gym on the same day, never a third session", () => {
    const plan = week(athlete());
    const clubPlusGym = plan.filter(
      (day) => day.dayType === "club" && day.secondSession && isMainGymSession(day.secondSession),
    );
    expect(clubPlusGym.length).toBeGreaterThanOrEqual(1);
    for (const day of plan) expect(slots([day]).length).toBeLessThanOrEqual(2);
  }, 60_000);

  it("prepared 16-year-old: club + gym is allowed and passes the final policy", () => {
    const profile = athlete({ age: 16, ...trained });
    const plan = week(profile);
    const day = plan.find(
      (d) => d.dayType === "club" && d.secondSession && isMainGymSession(d.secondSession),
    );
    expect(day).toBeDefined();
    expect(secondSessionPolicyViolation(day!, profile)).toBeNull();
  }, 60_000);

  it("endurance goal with four club days: an easy run is added after a club session", () => {
    const profile = athlete({ goal: "endurance", clubTrainingDays: [1, 2, 3, 4] });
    const plan = week(profile);
    const clubRun = plan.find(
      (d) =>
        d.dayType === "club" && d.secondSession && sessionLoadKind(d.secondSession) === "easy_run",
    );
    expect(clubRun).toBeDefined();
    expect(secondSessionPolicyViolation(clubRun!, profile)).toBeNull();
    // The rest of the goal that does not fit is named, not silently dropped.
    if (unmetFocusTargets(plan, profile).length)
      expect((plan[0].weekMeta?.planningNotes ?? []).join(" ")).toMatch(
        /Nie zmieszczono: wydolność/,
      );
  }, 60_000);

  it("club + an easy run is a valid pair; club + a hard interval run is not for a 15-year-old beginner", () => {
    const plan = week(athlete({ goal: "endurance", clubTrainingDays: [2, 4] }));
    const club = plan.find((d) => d.dayType === "club")!;
    const easyRun = own(club, {
      title: "Spokojny bieg ciągły",
      sessionType: "Wydolność — spokojny bieg",
      intensity: "niska",
      durationMin: 30,
    });
    expect(sessionLoadKind(easyRun)).toBe("easy_run");
    const pair = { ...club, secondSession: easyRun };
    expect(secondSessionPolicyViolation(pair, athlete())).toBeNull();
    const hard = { ...easyRun, title: "Interwały biegowe", intensity: "wysoka" as const };
    const young = athlete({ age: 15, level: "beginner" });
    expect(secondSessionPolicyViolation({ ...club, secondSession: hard }, young)).toBe(
      "invalid-beginner-double",
    );
  }, 60_000);

  it("the club's strength day takes an easy run or nothing, never a second gym", () => {
    const profile = athlete({ clubStrengthDays: [1, 2, 4] });
    const plan = week(profile);
    for (const day of plan.filter((d) => d.dayType === "club"))
      expect(day.secondSession && isMainGymSession(day.secondSession)).toBeFalsy();
  }, 60_000);
});

describe("load kinds are not one generic session", () => {
  it("sprint, heavy legs, upper body, hard endurance and easy run are told apart", () => {
    const plan = generatePlan(athlete({ goal: "speed" }), NOV, 28);
    const kinds = new Set(slots(plan).map(sessionLoadKind));
    expect(kinds.has("sprint")).toBe(true);
    expect(kinds.has("heavy_legs")).toBe(true);
    const sprint = own(plan[0], {
      title: "Sprint: akceleracja",
      sessionType: "Szybkość",
      intensity: "wysoka",
    });
    const upper = own(plan[0], {
      title: "Siła: góra ciała",
      sessionType: "Siła — góra ciała i tułów",
    });
    const run = own(plan[0], {
      title: "Spokojny bieg ciągły",
      sessionType: "Wydolność",
      intensity: "niska",
    });
    expect(sessionLoadKind(sprint)).toBe("sprint");
    expect(sessionLoadKind(upper)).toBe("upper");
    expect(sessionLoadKind(run)).toBe("easy_run");
    expect(dayOrderRank(sprint)).toBeLessThan(dayOrderRank(upper));
    expect(dayOrderRank(upper)).toBeLessThan(dayOrderRank(run));
  }, 60_000);

  it("on a day with two own sessions the sprint comes first, the easy run last", () => {
    for (const goal of ["speed", "strength", "endurance", "power"] as const) {
      const plan = generatePlan(athlete({ goal }), NOV, 28);
      for (const day of plan.filter((d) => d.secondSession && d.dayType !== "club"))
        expect(dayOrderRank(day)).toBeLessThanOrEqual(dayOrderRank(day.secondSession!));
    }
  }, 120_000);

  it("ordering swaps the sessions but keeps the day's identity", () => {
    const plan = week(athlete());
    const base = plan.find((d) => d.dayType !== "club" && d.dayType !== "match")!;
    const run = own(base, {
      title: "Spokojny bieg ciągły",
      sessionType: "Wydolność — spokojny bieg",
      intensity: "niska",
      sessionId: `${base.date}-1`,
    });
    const sprint = own(base, {
      title: "Sprint: akceleracja",
      sessionType: "Szybkość",
      intensity: "wysoka",
      sessionId: `${base.date}-2`,
    });
    const ordered = orderDaySessionsByLoad({ ...run, secondSession: sprint });
    expect(ordered.title).toBe("Sprint: akceleracja");
    expect(ordered.secondSession?.title).toBe("Spokojny bieg ciągły");
    expect(ordered.date).toBe(base.date);
    expect(ordered.sessionId).toBe(`${base.date}-1`);
  }, 60_000);
});

describe("younger athletes: dose from experience, technique and supervision", () => {
  it("a trained 14-year-old is not treated like an untrained one", () => {
    expect(isPreparedYouthLifter(athlete({ age: 14, ...trained }))).toBe(true);
    expect(isPreparedYouthLifter(athlete({ age: 14 }))).toBe(false);
    // Children and missing answers stay on the technical variant.
    expect(isPreparedYouthLifter(athlete({ age: 12, ...trained }))).toBe(false);
    expect(isPreparedYouthLifter(athlete({ age: 14, ...trained, supervisionLevel: "none" }))).toBe(
      false,
    );
    expect(isPreparedYouthLifter(athlete({ age: 14, ...trained, movementCompetence: "low" }))).toBe(
      false,
    );
    expect(isPreparedYouthLifter(athlete({ age: 14, ...trained, painInjury: true }))).toBe(false);
  });

  it("trained 14-year-old: moderate external load and machines, still no heavy lifts or max tests", () => {
    const safety = buildAthleteTrainingProfile(
      athlete({ age: 14, ...trained }),
    ).exerciseSafetyProfile;
    expect(safety.allowMachines).toBe(true);
    expect(safety.maxRelativeLoadPct).toBe(70);
    expect(safety.allowHeavyCompounds).toBe(false);
    expect(safety.allowMaxEffort).toBe(false);
    expect(safety.allowDepthJumps).toBe(false);
    expect(safety.maxPlyoLevel).toBeLessThanOrEqual(2);
    const untrained = buildAthleteTrainingProfile(athlete({ age: 14 })).exerciseSafetyProfile;
    expect(untrained.allowMachines).toBe(false);
    expect(untrained.maxRelativeLoadPct).toBe(60);
  });

  it("trained 14-year-old with the strength goal gets club + gym and a structured, sub-maximal dose", () => {
    const profile = athlete({ age: 14, ...trained });
    const plan = week(profile);
    const gym = slots(plan).filter(isDevelopmentStrengthSession);
    expect(gym.length).toBeGreaterThanOrEqual(2);
    expect(
      plan.some(
        (d) => d.dayType === "club" && d.secondSession && isMainGymSession(d.secondSession),
      ),
    ).toBe(true);
    for (const day of plan) expect(secondSessionPolicyViolation(day, profile)).toBeNull();
    const main = gym.flatMap(exercises).filter((e) => e.label === "A1");
    expect(main.length).toBeGreaterThan(0);
    for (const e of main) {
      expect(e.rpe ?? "").toMatch(/RIR/);
      expect(e.rpe ?? "").not.toMatch(/technika/);
      expect(e.loadTarget ?? "").not.toMatch(/%|1RM/i);
    }
  }, 60_000);

  it("untrained 14-year-old: technical variant and only a light second session", () => {
    const profile = athlete({ age: 14 });
    const plan = week(profile);
    for (const day of plan) {
      expect(secondSessionPolicyViolation(day, profile)).toBeNull();
      if (day.secondSession && day.secondSession.durationMin > 0 && day.dayType !== "rest")
        expect(day.secondSession.intensity).toBe("niska");
    }
    const main = slots(plan)
      .filter((s) => classifySession(s).category === "gym_strength")
      .flatMap(exercises)
      .filter((e) => e.label === "A1");
    for (const e of main) expect(e.loadTarget ?? "").not.toMatch(/%|1RM/i);
  }, 60_000);

  it("the strength goal that does not fit gives a concrete reason instead of a silent drop", () => {
    const plan = week(athlete({ age: 14 }));
    const notes = (plan[0].weekMeta?.planningNotes ?? []).join(" ");
    if (unmetFocusTargets(plan, athlete({ age: 14 })).length)
      expect(notes).toMatch(/Nie zmieszczono: siła.*W tym tygodniu/);
  }, 60_000);
});

describe("exclusions and a week without a match", () => {
  it("unavailable day stays empty, missing gym means no gym equipment", () => {
    const profile = athlete({ unavailableDays: [3], hasGym: false });
    const plan = week(profile);
    const wednesday = plan.find((day) => weekday(day) === 3)!;
    expect(slots([wednesday]).every((s) => s.dayType === "rest" || s.durationMin === 0)).toBe(true);
    for (const session of slots(plan))
      expect(`${session.title} ${session.sessionType}`).not.toMatch(/siłowni|sztang|maszyn/i);
  }, 60_000);

  it("no saved fixture and no fixed day: no invented match, still a full training week", () => {
    const profile = athlete({
      usualMatchDay: null,
      matchDate: null,
      matchDates: [],
      weeklyMatches: false,
    });
    const plan = week(profile);
    expect(plan.some((day) => day.dayType === "match")).toBe(false);
    expect(plan.some((day) => weekday(day) === 7 && day.dayType === "match")).toBe(false);
    expect(slots(plan).filter(isDevelopmentStrengthSession).length).toBeGreaterThanOrEqual(2);
    for (const day of plan) expect(slots([day]).length).toBeLessThanOrEqual(2);
  }, 60_000);
});
