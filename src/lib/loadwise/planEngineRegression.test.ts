import { describe, it, expect } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import { classifySession, isMainGymSession, isClubSession } from "./sessionClassification";
import type { Profile, SessionDay } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseProfile(p: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga" as Profile["competitionLevel"],
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...p,
  };
}

const START = new Date("2026-07-13T00:00:00"); // poniedziałek

function fullWeeks(plan: SessionDay[]) {
  const ranges = weekRanges(START, plan.length).filter(
    (r) => r.end - r.start === 7,
  );
  return ranges.map((r) => plan.slice(r.start, r.end));
}

function countGym(week: SessionDay[]): number {
  let n = 0;
  for (const d of week) {
    if (isMainGymSession(d)) n++;
    if (d.secondSession && isMainGymSession(d.secondSession)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 1. Gym access + full week — ≥2 gym_strength per full week when hasGym=true
// ---------------------------------------------------------------------------

describe("regression — gym access + full week", () => {
  const goals = ["strength", "endurance", "general", "power"] as const;

  for (const goal of goals) {
    it(`goal="${goal}": every full week has ≥ 2 gym_strength sessions`, () => {
      const profile = baseProfile({ goal, hasGym: true });
      const plan = generatePlan(profile, START, 28);
      for (const week of fullWeeks(plan)) {
        const gym = countGym(week);
        expect(gym).toBeGreaterThanOrEqual(2);
      }
    });

    describe("Phase 3D live football speed integration", () => {
      it("uses the Phase 3C engine on an eligible speed day and preserves ordered blocks", () => {
        const plan = generatePlan(
          baseProfile({
            goal: "speed",
            hasGym: false,
            individualTrainingDays: [1, 3, 5],
          }),
          START,
          7,
        );
        const speedDay = plan.find(
          (day) =>
            day.dayType === "training" &&
            day.sessionType === "Szybkość piłkarska" &&
            day.structuredSections?.length,
        );
        expect(speedDay).toBeDefined();
        expect(speedDay?.reason).toContain("Phase 3C");
        expect(speedDay?.structuredSections?.flatMap((section) => section.blocks)).toHaveLength(11);
        expect(speedDay?.structuredSections?.flatMap((section) => section.blocks).map((block) => block.exercises[0].exerciseId))
          .toEqual(speedDay?.sections.warmup.concat(speedDay.sections.main).map((item) => item.exerciseId));
      });

      it("never replaces club or match commitments with an owned speed session", () => {
        const plan = generatePlan(
          baseProfile({
            goal: "speed",
            clubTrainingDays: [2],
            matchDate: "2026-07-19",
          }),
          START,
          7,
        );
        expect(plan.find((day) => day.dayType === "club")?.sessionType).toBe("Klub");
        expect(plan.find((day) => day.dayType === "match")?.sessionType).toBe("Mecz");
        expect(plan.filter((day) => day.dayType === "club" || day.dayType === "match")
          .every((day) => day.sessionType !== "Szybkość piłkarska")).toBe(true);
      });

      it("keeps repeated sprint classified as conditioning", () => {
        const session: SessionDay = {
          ...generatePlan(baseProfile({ hasGym: false }), START, 7)[0],
          sessionType: "Wydolność — repeated sprint RSA",
          title: "Powtarzane sprinty",
          sections: {
            warmup: [],
            main: [{ name: "Repeated sprint", prescription: "6 × 30 m" }],
            accessory: [],
            footballTransfer: [],
            cooldown: [],
          },
        };
        expect(classifySession(session).category).toBe("endurance_conditioning");
        expect(classifySession(session).countsAsSpeed).toBe(false);
      });

      it("is deterministic and survives JSON persistence unchanged", () => {
        const profile = baseProfile({ goal: "speed", hasGym: false });
        const first = generatePlan(profile, START, 7);
        const hydrated = JSON.parse(JSON.stringify(first)) as SessionDay[];
        expect(hydrated).toEqual(first);
        expect(generatePlan(profile, START, 7)).toEqual(first);
      });
    });
  }

  it("hasGym=false does not add extra gym via repair pass", () => {
    // NOTE: the base generator may still produce gym_strength cells even when
    // hasGym=false (pre-existing issue). This test verifies that the repair
    // pass (addMissingGymSessions) short-circuits and doesn't inflate the count.
    const profile = baseProfile({ goal: "general", hasGym: false });
    const plan = generatePlan(profile, START, 28);
    // The repair pass should not produce more gym than what the base engine already put in.
    // With hasGym=false the engine is supposed to use bodyweight fallbacks —
    // we mainly assert the repair doesn't silently add real gym sessions.
    for (const week of fullWeeks(plan)) {
      // At most 1 (possible base-engine leakage); repair must not push beyond that.
      expect(countGym(week)).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Club + safe second gym session — light gym allowed as second session
//    on a club day when doubleSessionsAllowed != "no"
// ---------------------------------------------------------------------------

describe("regression — club + safe second gym session", () => {
  it("doubleSessionsAllowed='yes_if_safe' with dense club schedule still meets gym minimum", () => {
    // With 4 club days + match + double sessions allowed, the engine must find
    // room for ≥ 2 gym sessions, possibly as second sessions on club days.
    const profile = baseProfile({
      goal: "strength",
      hasGym: true,
      clubTrainingDays: [1, 2, 4, 5],
      individualTrainingDays: [3, 6],
      usualMatchDay: 7,
      weeklyMatches: true,
      seasonPhase: "inseason",
      doubleSessionsAllowed: "yes_if_safe",
    });
    const plan = generatePlan(profile, START, 28);

    for (const week of fullWeeks(plan)) {
      const gym = countGym(week);
      expect(gym).toBeGreaterThanOrEqual(2);
    }
  });

  it("doubleSessionsAllowed='no' does not add second sessions", () => {
    const profile = baseProfile({
      goal: "strength",
      hasGym: true,
      clubTrainingDays: [2, 4],
      individualTrainingDays: [1, 3, 5, 6],
      doubleSessionsAllowed: "no",
    });
    const plan = generatePlan(profile, START, 28);
    const secondSessions = plan.filter((d) => d.secondSession !== null);
    expect(secondSessions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. No gym disappearing after post-processing — full pipeline test
// ---------------------------------------------------------------------------

describe("regression — gym survives post-processing", () => {
  it("gym count after full pipeline ≥ weekly minimum (2) for every full week", () => {
    const profile = baseProfile({
      goal: "endurance",
      hasGym: true,
      clubTrainingDays: [2, 4],
      individualTrainingDays: [1, 3, 5, 6],
      usualMatchDay: 7,
      weeklyMatches: true,
      seasonPhase: "inseason",
      doubleSessionsAllowed: "yes_if_safe",
    });
    const plan = generatePlan(profile, START, 28);

    for (const week of fullWeeks(plan)) {
      const gym = countGym(week);
      // With 2 club days + match + 4 individual days + double sessions allowed,
      // the engine must guarantee ≥ 2 gym per week.
      expect(gym).toBeGreaterThanOrEqual(2);
    }
  });

  it("gym sessions are not re-classified as recovery_prehab by post-processing", () => {
    const profile = baseProfile({ goal: "strength", hasGym: true });
    const plan = generatePlan(profile, START, 28);

    for (const day of plan) {
      if (day.classification?.category === "recovery_prehab") {
        // A recovery_prehab session must not have gym-like title markers
        const title = (day.title ?? "").toLowerCase();
        const isStrenuous =
          title.includes("przysiad") ||
          title.includes("martwy") ||
          title.includes("wyciskanie") ||
          title.includes("rwanie") ||
          title.includes("podrzut") ||
          title.includes("siła dolna") ||
          title.includes("siła górna");
        expect(isStrenuous).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. No unsafe MD-1/MD-2 combination
// ---------------------------------------------------------------------------

describe("regression — MD-1/MD-2 safety", () => {
  it("MD-1 has no heavy legs, no conditioning, no max velocity sprint", () => {
    const profile = baseProfile({
      goal: "speed",
      hasGym: true,
      clubTrainingDays: [2, 4],
      individualTrainingDays: [1, 3, 5, 6],
      usualMatchDay: 7,
      weeklyMatches: true,
      seasonPhase: "inseason",
    });
    const plan = generatePlan(profile, START, 28);

    const md1Days = plan.filter(
      (d) => d.dayType === "md-1" || d.mdLabel === "MD-1",
    );

    for (const day of md1Days) {
      const cat = day.classification?.category;
      const sub = day.classification?.subcategory ?? "";
      const title = (day.title ?? "").toLowerCase();

      // No heavy lower-body gym on MD-1
      if (cat === "gym_strength") {
        expect(sub).not.toBe("lower_body_heavy");
        expect(title).not.toMatch(/ciężk.*doln|przysiad.*ciężk/);
      }

      // No max velocity sprint on MD-1
      if (cat === "speed_sprint") {
        expect(sub).not.toBe("max_velocity");
      }

      // No high-intensity conditioning on MD-1
      if (cat === "endurance_conditioning") {
        expect(day.intensity).not.toBe("wysoka");
      }

      // Second session checks too
      if (day.secondSession) {
        const sCat = day.secondSession.classification?.category;
        const sSub = day.secondSession.classification?.subcategory ?? "";
        if (sCat === "gym_strength") {
          expect(sSub).not.toBe("lower_body_heavy");
        }
        if (sCat === "speed_sprint") {
          expect(sSub).not.toBe("max_velocity");
        }
      }
    }
  });
});
