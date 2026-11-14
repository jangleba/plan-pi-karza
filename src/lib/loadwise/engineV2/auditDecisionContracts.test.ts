import { describe, it, expect } from "vitest";
import type { Profile, SessionCompletion, SessionHistoryRecord } from "../types";
import {
  buildCycleReview,
  cycleStartRecord,
  plannedOwnSessions,
  stampCycleStart,
} from "../cycleReview";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

const profile = {
  name: "Decision audit",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "trap_bar",
    "machine",
    "band",
    "bench",
    "nordic_setup",
  ],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-10-01",
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
const own = (days: ReturnType<typeof generateTrainingPlan>["plan"]) =>
  days.flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])]).filter((s) => s.engineV2);

describe("independent decision contracts", () => {
  it("reserves a session for the explicit mobility goal when a feasible slot exists", () => {
    const r = generateTrainingPlan(
      {
        ...profile,
        goal: "mobility",
        individualTrainingDays: [2, 5],
        doubleSessionsAllowed: "no",
      } as Profile,
      { startDate: "2026-11-02", weeks: 1 },
    );
    expect(own(r.plan).some((s) => s.engineV2!.roles.includes("mobility"))).toBe(true);
  });

  it("makes the reviewed deload recommendation affect the next plan's actual strength dose", () => {
    const previousPlan = generateTrainingPlan(profile, { startDate: "2026-10-26", weeks: 1 }).plan;
    const completions: Record<string, SessionCompletion> = {};
    const history: SessionHistoryRecord[] = [];
    for (const [i, s] of own(previousPlan).entries()) {
      s.dbId = `previous-${i}`;
      completions[s.dbId] = {
        completed: true,
        status: "completed",
        rpe: 8,
        notes: "",
        executionSnapshot: structuredClone(s),
      };
      history.push({
        key: s.dbId,
        date: s.date,
        title: s.title,
        category: s.engineV2!.roles[0].startsWith("strength")
          ? "gym"
          : s.engineV2!.roles[0] === "speed"
            ? "speed"
            : "endurance",
        durationMin: s.durationMin,
        rpe: 8,
        notes: "",
      });
    }
    const review = buildCycleReview({
      startDate: "2026-10-26",
      endDate: "2026-11-01",
      planned: plannedOwnSessions(previousPlan),
      history,
      readiness: [],
      strengthSets: [],
      tests: { improved: 0, declined: 0, flat: 0 },
      age: profile.age,
      phaseNext: profile.seasonPhase,
    })!;
    expect(review.recommendation).toBe("deload");
    const record = cycleStartRecord(review, "previous-cycle");
    const generated = generateTrainingPlan(profile, {
      startDate: "2026-11-02",
      weeks: 4,
      previousPlan,
      completions,
      cycleStart: record,
    });
    const next = stampCycleStart(generated.plan, record);
    const firstStrength = own(next).find((s) => s.engineV2!.roles[0].startsWith("strength"))!;
    expect(firstStrength.cycleStart?.kind).toBe("deload");
    expect(firstStrength.engineV2!.phase).toBe("deload");
    expect(
      firstStrength.engineV2!.exercises.find((e) => e.role === "knee_strength")!.dose.sets,
    ).toBe(2);
  });
});

const slotsOf = (d: ReturnType<typeof generateTrainingPlan>["plan"][number]) => [
  d,
  ...(d.secondSession ? [d.secondSession] : []),
];
const rolesOfWeek = (plan: ReturnType<typeof generateTrainingPlan>["plan"], from: number) =>
  plan
    .slice(from * 7, from * 7 + 7)
    .flatMap(slotsOf)
    .filter((s) => s.engineV2)
    .flatMap((s) => s.engineV2!.roles);

describe("goal completeness in a tight or repeated week", () => {
  it("mobility keeps a strength session beside it and never loses mobility when days allow", () => {
    const tight = generateTrainingPlan(
      {
        ...profile,
        goal: "mobility",
        individualTrainingDays: [2, 5],
        doubleSessionsAllowed: "no",
      } as Profile,
      { startDate: "2026-11-02", weeks: 1 },
    );
    const roles = tight.plan
      .flatMap(slotsOf)
      .filter((s) => s.engineV2)
      .flatMap((s) => s.engineV2!.roles);
    expect(roles).toContain("mobility");
    expect(roles).toContain("strengthA");
    const roomy = generateTrainingPlan({ ...profile, goal: "mobility" } as Profile, {
      startDate: "2026-11-02",
      weeks: 1,
    });
    const all = roomy.plan
      .flatMap(slotsOf)
      .filter((s) => s.engineV2)
      .flatMap((s) => s.engineV2!.roles);
    for (const r of ["mobility", "strengthA", "strengthB", "speed", "endurance"])
      expect(all).toContain(r);
  });

  it("speed + club Tue/Thu + Sunday match: strength A and B alternate across four weeks, never merged", () => {
    const p = {
      ...profile,
      goal: "speed",
      clubTrainingDays: [2, 4],
      matchDates: ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"],
    } as Profile;
    const r = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 4 });
    const perWeek = [0, 1, 2, 3].map((w) => rolesOfWeek(r.plan, w));
    const all = perWeek.flat();
    expect(all).toContain("strengthA");
    expect(all).toContain("strengthB"); // compensated across weeks, not stuck on A
    for (const d of r.plan) {
      const roles = slotsOf(d)
        .filter((s) => s.engineV2)
        .flatMap((s) => s.engineV2!.roles);
      expect(roles.filter((x) => x.startsWith("strength")).length).toBeLessThanOrEqual(1);
    }
    expect(r.plan[0].enginePlanIssues?.some((i) => i.code === "UNMET_WEEKLY_TARGET")).toBe(true); // the limit stays visible
  });
});

describe("recommendation from the review shapes the plan it was decided for", () => {
  const rec = (kind: "deload" | "health" | "transition" | "progress" | "maintain") =>
    ({
      kind,
      youth: false,
      reviewedCycleId: "c",
      review: { startDate: "2026-10-05", endDate: "2026-11-01", recommendation: kind },
    }) as never;
  const phases = (record: unknown, extra = {}) =>
    generateTrainingPlan(profile, {
      startDate: "2026-11-02",
      weeks: 4,
      cycleStart: record as never,
      ...extra,
    })
      .plan.flatMap(slotsOf)
      .filter((s) => s.engineV2?.roles[0].startsWith("strength"))
      .map(
        (s) =>
          `${Math.floor((Date.parse(`${s.date}T12:00:00Z`) - Date.parse("2026-11-02T12:00:00Z")) / 86400000 / 7)}:${s.engineV2!.phase}`,
      );
  it("deload lightens only the first week; health the first two; others change nothing", () => {
    const weeks = (r: string[]) => [
      ...new Set(
        r.map((x) => x.split(":")[0] + ":" + (x.endsWith("deload") ? "deload" : "normal")),
      ),
    ];
    expect(weeks(phases(rec("deload")))).toEqual(["0:deload", "1:normal", "2:normal", "3:normal"]);
    expect(weeks(phases(rec("health")))).toEqual(["0:deload", "1:deload", "2:normal", "3:normal"]);
    expect(weeks(phases(rec("transition")))).toEqual([
      "0:deload",
      "1:normal",
      "2:normal",
      "3:normal",
    ]);
    const none = phases(null);
    expect(phases(rec("progress"))).toEqual(none);
    expect(phases(rec("maintain"))).toEqual(none);
  }, 60000);
  it("is kept when the saved plan is rebuilt later, without lighting the light start up again", () => {
    const record = rec("deload");
    const saved = generateTrainingPlan(profile, {
      startDate: "2026-11-02",
      weeks: 4,
      cycleStart: record,
    }).plan.map((d) => ({ ...d, cycleStart: record }));
    // a mid-cycle rebuild from 9 Nov reads the stamped record: week 1 of the cycle stays normal
    const rebuilt = generateTrainingPlan(profile, {
      startDate: "2026-11-09",
      weeks: 2,
      previousPlan: saved,
      precedingDays: saved.filter((d) => d.date < "2026-11-09"),
    });
    const first = rebuilt.plan
      .flatMap(slotsOf)
      .find((s) => s.engineV2?.roles[0].startsWith("strength"))!;
    expect(first.engineV2!.phase).not.toBe("deload");
    // and a rebuild inside the light week keeps it light
    const inside = generateTrainingPlan(profile, {
      startDate: "2026-11-04",
      weeks: 1,
      previousPlan: saved,
      precedingDays: saved.filter((d) => d.date < "2026-11-04"),
    });
    const light = inside.plan
      .flatMap(slotsOf)
      .find((s) => s.engineV2?.roles[0].startsWith("strength"));
    if (light) expect(light.engineV2!.phase).toBe("deload");
  });
});

describe("key endurance session is not silently replaced by calm runs", () => {
  it("adult with a current MAS, endurance goal, club Tue/Thu and a Sunday match keeps the key session and says what was limited", () => {
    const p = {
      ...profile,
      goal: "endurance",
      clubTrainingDays: [2, 4],
      matchDates: ["2026-11-08"],
      fieldMasKmh: 15.5,
      fieldMasTestedAt: "2026-11-01",
      fieldMasSourceSessionId: "src",
    } as Profile;
    const r = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
    const runs = r.plan
      .flatMap(slotsOf)
      .filter((s) => s.engineV2?.roles.includes("endurance"))
      .map((s) => s.runningRecipe?.method);
    expect(runs).toContain("tempo"); // the key unit stays
    expect(r.issues.some((i) => i.code === "UNMET_WEEKLY_TARGET")).toBe(true); // what was limited is named
  });
});

describe("sprint titles describe the actual dose", () => {
  it("a flying-sprint dose is titled as maximum velocity, a plain one as acceleration", () => {
    const flying = generateTrainingPlan({ ...profile, goal: "speed", level: "elite" } as Profile, {
      startDate: "2026-11-02",
      weeks: 1,
    });
    const sprints = flying.plan.flatMap(slotsOf).filter((s) => s.engineV2?.roles.includes("speed"));
    expect(sprints.length).toBeGreaterThan(0);
    for (const s of sprints) {
      const fly = s.engineV2!.exercises.some((e) => e.role === "speed" && (e.dose.runInM ?? 0) > 0);
      expect(s.title).toBe(fly ? "Prędkość maksymalna" : "Przyspieszenie");
    }
    const plain = generateTrainingPlan(
      {
        ...profile,
        goal: "speed",
        age: 15,
        level: "beginner",
        gymExperienceLevel: "beginner",
        strengthTrainingMonths: 0,
      } as Profile,
      { startDate: "2026-11-02", weeks: 1 },
    );
    for (const s of plain.plan.flatMap(slotsOf).filter((x) => x.engineV2?.roles.includes("speed")))
      expect(s.title).toBe("Przyspieszenie");
  });
});

describe("guided ramp-up before the first loaded lift", () => {
  it("is shown once per strength session, is not a work set, and leaves the working dose unchanged", () => {
    const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
    const gym = plan
      .flatMap(slotsOf)
      .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
    expect(gym.length).toBeGreaterThan(0);
    for (const s of gym) {
      const ex = s.structuredSections!.flatMap((x) => x.blocks.flatMap((b) => b.exercises));
      const withRamp = ex.filter((e) => e.cue?.includes("serie wprowadzające"));
      expect(withRamp.length).toBeLessThanOrEqual(1);
      for (const e of withRamp) {
        expect(e.cue).toContain("nie zapisuj ich jako wykonanych");
        const dose = s.engineV2!.exercises.find((d) => d.exerciseId === e.exerciseId)!.dose;
        expect(e.sets).toBe(String(dose.sets)); // working sets are not inflated by the ramp-up
      }
    }
    expect(
      gym.some((s) =>
        s.structuredSections!.some((x) =>
          x.blocks.some((b) => b.exercises.some((e) => e.cue?.includes("serie wprowadzające"))),
        ),
      ),
    ).toBe(true);
  });
});

describe("plans saved before the ramp-up note stay valid", () => {
  it("a stored session without the note passes the dose-consistency check", () => {
    const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
    const old = JSON.parse(
      JSON.stringify(plan, (k, v) =>
        k === "cue" && typeof v === "string" && v.startsWith("Przed pierwszą") ? undefined : v,
      ),
    );
    expect(JSON.stringify(old)).not.toContain("Przed pierwszą serią roboczą");
    expect(
      validateTrainingPlan(old, profile, { startDate: "2026-11-02", minutesPerSession: 75 }),
    ).toEqual([]);
  });
});
