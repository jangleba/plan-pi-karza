import { describe, expect, it } from "vitest";
import { buildProfile } from "../store/model";
import { trainingProfileRevision, trainingSetupRevision } from "../planIdentity";
import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { ENGINE_VERSION } from "./model";
import { getPlanStatus, sessionStartIssue, todayTrainingState } from "./planStatus";

const profile: Profile = {
  ...buildProfile({ full_name: "Plan lifecycle" }, { age: 24, position: "midfielder" }, null)!,
  age: 24,
  level: "advanced",
  goal: "strength",
  seasonPhase: "preseason",
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  clubTrainingDays: [],
  unavailableDays: [],
  weeklyMatches: false,
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  painInjury: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: ["dumbbell", "band", "barbell", "rack", "bench"],
  healthPersonalizationEnabled: true,
};
const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
const main = { ...plan.find((d) => d.engineV2)!, dbId: "main-session" };
const started = { completed: false, status: "started" } as SessionCompletion;
const finished = { completed: true, status: "completed" } as SessionCompletion;
const readiness = {
  date: main.date,
  overall: 9,
  jointPain: 0,
  redFlags: [],
} as unknown as Readiness;

describe("read-only plan lifecycle", () => {
  it("distinguishes an empty plan, active window and expired cycle without modifying history", () => {
    const original = structuredClone(plan);
    expect(getPlanStatus({ plan: [], profile, todayIso: "2026-11-02" }).kind).toBe("empty");
    expect(getPlanStatus({ plan, profile, todayIso: "2026-11-04" }).kind).toBe("active");
    expect(
      getPlanStatus({ plan, profile: { ...profile, goal: "speed" }, todayIso: "2026-11-09" }),
    ).toMatchObject({ kind: "expired", endDate: "2026-11-08" });
    expect(plan).toEqual(original);
  });
  it("invalidates a future prescription after a version or actual generator input changes", () => {
    expect(
      getPlanStatus({ plan, profile: { ...profile, goal: "speed" }, todayIso: "2026-11-02" }),
    ).toMatchObject({ kind: "stale", staleReason: "profile" });
    expect(
      getPlanStatus({
        plan: [{ ...main, generatorVersion: "ballwise-v2.2" }],
        profile,
        todayIso: main.date,
      }),
    ).toMatchObject({ kind: "stale", staleReason: "version" });
    expect(
      getPlanStatus({ plan, profile: { ...profile, name: "New name" }, todayIso: "2026-11-02" })
        .kind,
    ).toBe("active");
  });
  it("keeps saved recipes after derived running results while changes to training choices still invalidate them", () => {
    const next = {
      ...profile,
      fieldMasKmh: 18,
      fieldMasTestedAt: "2026-11-02",
      fieldMasSourceSessionId: "run-result",
      runningProgressionLevel: 2,
    };
    expect(trainingProfileRevision(next)).not.toBe(trainingProfileRevision(profile));
    expect(getPlanStatus({ plan, profile: next, todayIso: "2026-11-02" }).kind).toBe("active");
    expect(sessionStartIssue({ session: main, profile: next, todayIso: main.date })).toBeNull();
    for (const changed of [
      { ...next, goal: "speed" as const },
      { ...next, equipment: [] },
      { ...next, painInjury: true },
    ]) {
      expect(getPlanStatus({ plan, profile: changed, todayIso: "2026-11-02" }).kind).toBe("stale");
      expect(
        sessionStartIssue({ session: main, profile: changed, todayIso: main.date }),
      ).not.toBeNull();
    }
    const legacy = { ...main, trainingSetupRevision: undefined };
    expect(sessionStartIssue({ session: legacy, profile: next, todayIso: main.date })).toContain(
      "Profil zmienił się",
    );
  });
  it("ignores past prescriptions and an actual started snapshot, but not its unstarted second slot", () => {
    const old = {
      ...main,
      canonicalRevision: "old",
      generatorVersion: "ballwise-v2.2",
      executionProtected: true,
    };
    expect(
      getPlanStatus({
        plan: [old],
        profile,
        todayIso: main.date,
        completions: { [main.dbId]: started },
      }).kind,
    ).toBe("active");
    expect(
      getPlanStatus({
        plan: [{ ...old, secondSession: { ...old, dbId: "pending-second" } }],
        profile,
        todayIso: main.date,
        completions: { [main.dbId]: started },
      }).kind,
    ).toBe("stale");
  });
  it("refreshes a neutral first-slot shell while retaining the executed second prescription", () => {
    const old = {
      ...main,
      generatorVersion: "ballwise-v2.2",
      canonicalRevision: "old",
      trainingSetupRevision: "old",
    };
    const shell: SessionDay = {
      ...old,
      dbId: undefined,
      dayType: "rest",
      durationMin: 0,
      engineV2: undefined,
      secondSession: old,
    };
    const next = { ...profile, goal: "speed" as const };
    const rebuilt = generateTrainingPlan(next, {
      startDate: main.date,
      weeks: 1,
      lockedDays: [shell],
    }).plan;
    expect(rebuilt[0].trainingSetupRevision).toBe(trainingSetupRevision(next));
    expect(rebuilt[0].secondSession).toEqual(old);
    expect(
      getPlanStatus({
        plan: rebuilt,
        profile: next,
        todayIso: main.date,
        completions: { [main.dbId]: started },
      }).kind,
    ).toBe("active");
  });
  it("detects calendar changes in external or rest-only plans without applying recipe version gates", () => {
    const club: SessionDay = {
      ...main,
      generatorVersion: "ballwise-v2.2",
      engineV2: undefined,
      dayType: "club",
      externalCommitment: true,
    };
    expect(getPlanStatus({ plan: [club], profile, todayIso: main.date }).kind).toBe("active");
    for (const session of [club, { ...club, dayType: "rest" as const, externalCommitment: false }])
      expect(
        getPlanStatus({
          plan: [session],
          profile: { ...profile, clubTrainingDays: [1] },
          todayIso: main.date,
        }).kind,
      ).toBe("stale");
  });
  it("refreshes pending external metadata around an executed second slot, never an executed primary", () => {
    const second = { ...main, dbId: "executed-second", executionProtected: true };
    const club: SessionDay = {
      ...main,
      dayType: "club",
      engineV2: undefined,
      externalCommitment: true,
      executionProtected: false,
      secondSession: second,
    };
    const next = { ...profile, goal: "speed" as const };
    const rebuild = (locked: SessionDay) =>
      generateTrainingPlan(next, { startDate: main.date, weeks: 1, lockedDays: [locked] }).plan[0];
    const pending = rebuild(club);
    expect(pending.trainingSetupRevision).toBe(trainingSetupRevision(next));
    expect(pending.secondSession).toEqual(second);
    const executed = rebuild({ ...club, executionProtected: true });
    expect(executed.trainingSetupRevision).toBe(club.trainingSetupRevision);
    expect(executed.canonicalRevision).toBe(club.canonicalRevision);
  });
});

describe("new session start eligibility", () => {
  const issue = (
    session: SessionDay = main,
    p: Profile = profile,
    r = readiness,
    completion?: SessionCompletion,
    todayIso = main.date,
  ) => sessionStartIssue({ session, profile: p, readiness: r, completion, todayIso });
  it("accepts the current prescription but blocks a stale version, changed profile and other date", () => {
    expect(issue()).toBeNull();
    expect(issue({ ...main, generatorVersion: "ballwise-v2.2" })).toContain("starszej wersji");
    expect(issue(main, { ...profile, goal: "speed" })).toContain("Profil zmienił się");
    expect(issue(main, profile, readiness, undefined, "2026-11-09")).toContain("tylko w dniu");
  });
  it("stops new own work for pain or explicit warning symptoms even with a high cached aggregate", () => {
    expect(issue(main, { ...profile, painInjury: true })).toContain("wstrzymany");
    for (const r of [
      { ...readiness, redFlags: ["chest_pain"] },
      { ...readiness, altersMovement: true },
      { ...readiness, jointPain: 1 },
    ]) {
      expect(issue(main, profile, r)).toContain("wstrzymuje");
    }
    const p = { ...profile, healthPersonalizationEnabled: false };
    expect(
      issue(
        {
          ...main,
          canonicalRevision: trainingProfileRevision(p),
          trainingSetupRevision: trainingSetupRevision(p),
        },
        p,
        {
          ...readiness,
          redFlags: ["chest_pain"],
        },
      ),
    ).toBeNull();
  });
  it("allows a low-readiness gentle support session but blocks main work and jumping activation", () => {
    const low = { ...readiness, overall: 3 };
    expect(issue(main, profile, low)).toContain("lżejszego planu");
    const support: SessionDay = {
      ...main,
      engineV2: { ...main.engineV2!, roles: ["activation"], exercises: [] },
    };
    expect(issue(support, profile, low)).toBeNull();
    support.engineV2!.exercises = [
      {
        exerciseId: "countermovement_jump",
        role: "power",
        dose: { sets: 2, reps: 2, restSeconds: 60, intent: "controlled" },
        reason: "activation",
      },
    ];
    expect(issue(support, profile, low)).toContain("lżejszego planu");
  });
  it("preserves started/completed logging after a profile change and cycle rollover", () => {
    const stale = { ...main, generatorVersion: "ballwise-v2.2", canonicalRevision: "old" };
    for (const completion of [started, finished])
      expect(
        issue(
          stale,
          { ...profile, painInjury: true },
          { ...readiness, redFlags: ["chest_pain"] },
          completion,
          "2026-12-01",
        ),
      ).toBeNull();
  });
  it("keeps club and match monitoring separate from own prescription revisions", () => {
    expect(
      issue(
        {
          ...main,
          engineV2: undefined,
          externalCommitment: true,
          dayType: "club",
          generatorVersion: ENGINE_VERSION,
          canonicalRevision: "old",
        },
        { ...profile, painInjury: true },
      ),
    ).toBeNull();
  });
});

it("blocks main and support placement for explicit symptoms despite a high aggregate score", () => {
  const p = { ...profile, matchDate: "2026-11-08", matchDates: ["2026-11-08"] };
  const baseline = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
  const warnings = Object.fromEntries(
    baseline.plan.map((d) => [
      d.date,
      { ...readiness, date: d.date, overall: 9, redFlags: ["chest_pain"] },
    ]),
  );
  const options = { startDate: "2026-11-02", weeks: 1, readiness: warnings };
  const guarded = generateTrainingPlan(p, options);
  expect(guarded.plan.flatMap((d) => [d, d.secondSession]).filter((s) => s?.engineV2)).toHaveLength(
    0,
  );
  const activation = baseline.plan.find((d) =>
    [d, d.secondSession].some((s) => s?.engineV2?.roles.includes("activation")),
  )!;
  expect(activation).toBeTruthy();
  expect(
    validateTrainingPlan([activation], p, options).some((x) => x.code === "READINESS_CONFLICT"),
  ).toBe(true);
});

describe("today's next real slot", () => {
  it("moves from a completed first slot to the second then reports the day completed", () => {
    const second = { ...main, dbId: "second", title: "Druga sesja" };
    const day = { ...main, secondSession: second };
    expect(todayTrainingState([day], {}, main.date)).toMatchObject({
      session: { dbId: main.dbId },
      slot: 1,
      complete: false,
    });
    expect(todayTrainingState([day], { [main.dbId]: finished }, main.date)).toMatchObject({
      session: { dbId: "second" },
      slot: 2,
      complete: false,
    });
    expect(
      todayTrainingState([day], { [main.dbId]: finished, second: finished }, main.date),
    ).toEqual({ session: null, slot: 1, complete: true });
  });
  it("does not count a rest placeholder or missing day as a completed workout", () => {
    expect(todayTrainingState([{ ...main, dayType: "rest" }], {}, main.date).complete).toBe(false);
    expect(todayTrainingState([], {}, main.date).session).toBeNull();
  });
});
