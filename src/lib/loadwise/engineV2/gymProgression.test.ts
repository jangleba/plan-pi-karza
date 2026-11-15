import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, Readiness, SessionCompletion } from "../types";
import type { Dose, ExerciseDecision } from "./model";
import { buildStrength } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymPowerDose, gymHamstringSupportDose, strengthLandingCount } from "./gymPower";
import {
  applyGymProgression,
  decideGymProgression,
  gymDoseKey,
  gymDoseWithinBounds,
  gymWeekContext,
  type GymBandSetup,
  type GymObservation,
  type GymProgressionInput,
  type GymWeekContext,
} from "./gymProgression";

const player: Profile = {
  name: "GP1",
  age: 20,
  position: "midfielder",
  level: "advanced",
  goal: "power",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["overhead_band_station", "low_band_station", "gym_jump_lane"],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: false,
  hasSprintSpace: false,
};
const ready: Readiness = {
  date: "2026-11-15",
  sleep: 8,
  energy: 8,
  fatigue: 2,
  soreness: 2,
  jointPain: 0,
  stress: 2,
  motivation: 8,
  overall: 8,
};
const context: GymWeekContext = {
  date: "2026-11-15",
  asOfDate: "2026-11-15",
  readiness: ready,
  phase: "development",
  nearestMatchDays: 99,
  demandingDays7d: 2,
  knownLandingsOther7d: 0,
  unknownExternalLoad: false,
  repeatedHard: false,
};
const row = (id = "gym_cmj", patch: Partial<Dose> = {}): ExerciseDecision => ({
  exerciseId: id,
  role:
    id === "gym_fast_band_curl" || id === "gym_bridge_pulses"
      ? "hamstring_dynamic_support"
      : "power",
  dose: {
    ...(id === "gym_fast_band_curl" || id === "gym_bridge_pulses"
      ? gymHamstringSupportDose(id, "development")
      : gymPowerDose(id, player, "development")),
    ...patch,
  },
  reason: "Test",
});
function history(exercise: ExerciseDecision, count = 2, metric = false) {
  const completions: Record<string, SessionCompletion> = {};
  const input: GymProgressionInput = { observations: [] };
  for (let i = 0; i < count; i++) {
    const sessionId = `s${i}`,
      date = `2026-11-${String(12 - i * 4).padStart(2, "0")}`;
    const recipe = buildStrength(player, "A", "development");
    recipe.exercises = recipe.exercises.filter((e) => e.role !== exercise.role);
    recipe.exercises.push(structuredClone(exercise));
    completions[sessionId] = {
      completed: true,
      status: "completed",
      rpe: 6,
      notes: "",
      executionSnapshot: sessionFixture({ dbId: sessionId, date, engineV2: recipe }),
    };
    const sides = exercise.dose.perSide ? (["left", "right"] as const) : (["both"] as const);
    const observation: GymObservation = {
      sessionId,
      exerciseId: exercise.exerciseId,
      source: "athlete_observed",
      sets: Array.from({ length: exercise.dose.sets }, (_, n) =>
        sides.map((side) => ({
          setNumber: n + 1,
          side,
          completed: exercise.dose.seconds ?? exercise.dose.reps!,
          control: "stable" as const,
          ...(metric
            ? {
                metric: {
                  kind:
                    exercise.exerciseId === "gym_fast_band_curl"
                      ? ("cycles_per_second" as const)
                      : ("jump_height_cm" as const),
                  method: "video_reviewed" as const,
                  value: exercise.exerciseId === "gym_fast_band_curl" ? 4 : 30,
                },
              }
            : {}),
        })),
      ).flat(),
    };
    input.observations.push(observation);
  }
  return { completions, input };
}
function decide(
  current = row(),
  h = history(row("gym_cmj", { sets: 2, reps: 2 })),
  ctx: Partial<GymWeekContext> = {},
  p = player,
) {
  return decideGymProgression(
    current,
    p,
    "strengthA",
    { ...context, ...ctx },
    h.completions,
    h.input,
  );
}
const setup = (patch: Partial<GymBandSetup> = {}): GymBandSetup => ({
  id: "band-1-position-1",
  exerciseId: "gym_cmj_resisted",
  bandId: "physical-pair-1",
  stationId: "rack-1",
  direction: "resistance",
  measuredOn: "2026-11-01",
  positions: ["bottom", "standing"],
  lengthsCm: [100, 140],
  forceNewtons: [50, 100],
  ...patch,
});

describe("GP1 verified progression", () => {
  it("preserves a progressed physical setup while its original selection is unchanged", () => {
    const original = setup(),
      advanced = setup({ id: "advanced-position", forceNewtons: [52, 104] });
    const request = row("gym_cmj_resisted", {
      gymBandSetup: original,
      gymBandSelectionId: original.id,
    });
    const h = history(
      row("gym_cmj_resisted", { gymBandSetup: advanced, gymBandSelectionId: original.id }),
    );
    h.input.selectedBandSetups = { gym_cmj_resisted: original.id };
    const result = decide(request, h);
    expect(result.action).toBe("hold");
    expect(result.dose?.gymBandSetup?.id).toBe(advanced.id);
  });
  it("rebaselines an explicitly changed physical setup without reusing old successes", () => {
    const original = setup(),
      changed = setup({ id: "other-station", stationId: "rack-2" });
    const request = row("gym_cmj_resisted", {
      gymBandSetup: changed,
      gymBandSelectionId: changed.id,
    });
    const h = history(
      row("gym_cmj_resisted", {
        sets: 2,
        reps: 2,
        gymBandSetup: original,
        gymBandSelectionId: original.id,
      }),
    );
    h.input.selectedBandSetups = { gym_cmj_resisted: changed.id };
    const result = decide(request, h);
    expect(result.action).toBe("hold");
    expect(result.dose?.gymBandSetup?.stationId).toBe("rack-2");
    expect(result.evidenceSessionIds).toEqual([]);
  });
  it("allows a review-only proposal without pretending a missing readiness score is high", () => {
    const h = history(row("gym_cmj", { sets: 2, reps: 2 }));
    expect(decide(row(), h, { readiness: undefined, date: "2026-11-18" }).action).toBe("hold");
    h.input.proposalOnly = true;
    expect(decide(row(), h, { readiness: undefined, date: "2026-11-18" }).action).toBe("progress");
    expect(decide(row(), h, { readiness: { ...ready, overall: 3 } }).action).toBe("deload");
  });
  it("regresses from an explicit interrupted-control report without inventing repetitions", () => {
    const h = history(row());
    h.input.observations[0].sets = [];
    h.input.observations[0].controlLossReported = true;
    expect(decide(row(), h).action).toBe("regress");
  });
  it("accepts an explicitly measured whole-exercise minimum without duplicating it into every set", () => {
    const h = history(row("gym_cmj", { sets: 2, reps: 2 }));
    h.input.observations.forEach(
      (o) => (o.minimumMetric = { kind: "jump_height_cm", method: "device", value: 30 }),
    );
    expect(decide(row(), h).action).toBe("progress");
  });
  it("progresses only one volume dimension after two comparable adult exposures", () => {
    const d = decide();
    expect(d.action).toBe("progress");
    expect(d.dose).toMatchObject({ sets: 2, reps: 3, restSeconds: 90 });
    expect(d.evidenceSessionIds).toEqual(["s0", "s1"]);
  });
  it.each([13, 15, 16, 17])("requires three observed exposures at age %i", (age) => {
    expect(
      decide(row(), history(row("gym_cmj", { sets: 2, reps: 2 })), {}, { ...player, age }).action,
    ).toBe("hold");
    expect(
      decide(row(), history(row("gym_cmj", { sets: 2, reps: 2 }), 3), {}, { ...player, age })
        .action,
    ).toBe("progress");
  });
  it.each(["gym_cmj", "gym_broad_jump", "gym_lateral_jump", "gym_lateral_bound"])(
    "caps %s at V2.8 volume",
    (id) => {
      const e = row(id);
      expect(decide(e, history(e)).action).toBe("hold");
    },
  );
  it("counts both directions without doubling bilateral landings by the number of feet", () => {
    const d = decide(
      row("gym_lateral_jump"),
      history(row("gym_lateral_jump", { sets: 2, reps: 2 })),
    );
    expect(strengthLandingCount([{ ...row("gym_lateral_jump"), dose: d.dose! }])).toBe(12);
    expect(strengthLandingCount([row()])).toBe(9);
  });
  it("does not turn a timer into quality evidence", () => {
    const h = history(row("gym_fast_band_curl"));
    h.input.observations = [];
    expect(decide(row("gym_fast_band_curl"), h).action).toBe("hold");
  });
  it.each(["gym_fast_band_curl", "gym_bridge_pulses"])(
    "restores the second short %s attempt without extending work",
    (id) => {
      const h = history(row(id, { sets: 1 }));
      const d = decide(row(id), h);
      expect(d.action).toBe("progress");
      expect(d.dose).toMatchObject({
        sets: 2,
        seconds: id === "gym_fast_band_curl" ? 4 : 8,
        restSeconds: id === "gym_fast_band_curl" ? 300 : 60,
      });
      expect(decide(row(id), history(row(id))).action).toBe("hold");
    },
  );
  it("does not claim the rhythm of a partial timed attempt was preserved", () => {
    const h = history(row("gym_fast_band_curl", { sets: 1 }));
    h.input.observations[0].sets[0].completed = 3;
    expect(decide(row("gym_fast_band_curl"), h).action).toBe("hold");
  });
  it("uses a measured <=5% same-band step only at the volume ceiling", () => {
    const e = row("gym_cmj_resisted", { gymBandSetup: setup() }),
      h = history(e, 2, true);
    h.input.bandSetups = [
      setup({ id: "position-2", forceNewtons: [52, 104], lengthsCm: [102, 142] }),
    ];
    const d = decide(e, h);
    expect(d.action).toBe("progress");
    expect(d.dose?.gymBandSetup?.id).toBe("position-2");
    expect(d.dose?.sets).toBe(3);
    expect(d.dose?.reps).toBe(3);
  });
  it.each([
    { bandId: "another-physical-band" },
    { stationId: "another-rack" },
    { forceNewtons: [60, 120] as [number, number] },
    { forceNewtons: [49, 104] as [number, number] },
    { positions: ["unknown", "standing"] as [string, string] },
    { measuredOn: "2026-11-16" },
    { measuredOn: "2026-09-01" },
    { direction: "assistance" as const },
  ])("rejects a noncomparable force step: %j", (patch) => {
    const e = row("gym_cmj_resisted", { gymBandSetup: setup() }),
      h = history(e, 2, true);
    h.input.bandSetups = [setup({ id: "position-2", forceNewtons: [52, 104], ...patch })];
    expect(decide(e, h).action).toBe("hold");
  });
  it("never escalates assistance as though it were resistance", () => {
    const s = setup({ exerciseId: "gym_cmj_assisted", direction: "assistance" });
    const e = row("gym_cmj_assisted", { gymBandSetup: s }),
      h = history(e, 2, true);
    h.input.bandSetups = [{ ...s, id: "more-assistance", forceNewtons: [52, 104] }];
    expect(decide(e, h).action).toBe("hold");
  });
  it("requires real comparable velocity/frequency measurements for increasing curl band resistance", () => {
    const s = setup({ exerciseId: "gym_fast_band_curl" }),
      e = row("gym_fast_band_curl", { gymBandSetup: s });
    for (const measured of [false, true]) {
      const h = history(e, 2, measured);
      if (measured)
        h.input.observations[0].sets.forEach((s) => {
          s.metric!.value = 4.5;
        });
      h.input.bandSetups = [{ ...s, id: "curl-2", forceNewtons: [52, 104] }];
      const d = decide(e, h);
      expect(d.action).toBe(measured ? "progress" : "hold");
      expect(d.dose?.seconds).toBe(4);
    }
  });
  it("holds band force if measurements used a different method", () => {
    const e = row("gym_cmj_resisted", { gymBandSetup: setup() }),
      h = history(e, 2, true);
    h.input.observations[0].sets.forEach((s) => (s.metric!.method = "device"));
    h.input.bandSetups = [setup({ id: "position-2", forceNewtons: [52, 104] })];
    expect(decide(e, h).action).toBe("hold");
  });
  it("does not increase band force without baseline calibration", () => {
    const e = row("gym_cmj_resisted"),
      h = history(e, 2, true);
    h.input.bandSetups = [setup()];
    expect(decide(e, h).action).toBe("hold");
  });
  it("holds curl resistance when rhythm merely stays constant", () => {
    const s = setup({ exerciseId: "gym_fast_band_curl" }),
      e = row("gym_fast_band_curl", { gymBandSetup: s });
    const h = history(e, 2, true);
    h.input.bandSetups = [{ ...s, id: "curl-2", forceNewtons: [52, 104] }];
    expect(decide(e, h).action).toBe("hold");
  });
});

describe("GP1 missing, stale and negative evidence", () => {
  it.each(["missing", "duplicate", "partial", "wrong-side", "duplicate-set", "nan"])(
    "blocks progression with %s evidence",
    (failure) => {
      const h = history(row("gym_cmj", { sets: 2, reps: 2 }));
      const o = h.input.observations[0];
      if (failure === "missing") h.input.observations.shift();
      if (failure === "duplicate") h.input.observations.push(structuredClone(o));
      if (failure === "partial") o.sets.pop();
      if (failure === "wrong-side") o.sets[0].side = "left";
      if (failure === "duplicate-set") o.sets[1].setNumber = 1;
      if (failure === "nan") o.sets[0].completed = NaN;
      expect(decide(row(), h).action).toBe("hold");
    },
  );
  it("does not bridge over a completed session with an omitted power task", () => {
    const h = history(row("gym_cmj", { sets: 2, reps: 2 }), 3);
    h.completions.s1.executionSnapshot!.engineV2!.exercises = [];
    expect(decide(row(), h).action).toBe("hold");
  });
  it("does not use future completion snapshots or cross A/B evidence", () => {
    const h = history(row("gym_cmj", { sets: 2, reps: 2 }));
    h.completions.s0.executionSnapshot!.date = "2026-11-16";
    expect(decide(row(), h).action).toBe("hold");
    h.completions.s0.executionSnapshot!.date = "2026-11-12";
    h.completions.s0.executionSnapshot!.engineV2!.roles = ["strengthB"];
    expect(decide(row(), h).action).toBe("hold");
  });
  it.each(["started", "missed"] as const)(
    "does not use %s work as completed evidence",
    (status) => {
      const h = history(row("gym_cmj", { sets: 2, reps: 2 }));
      h.completions.s0.completed = false;
      h.completions.s0.status = status;
      expect(decide(row(), h).action).toBe("hold");
    },
  );
  it("regresses immediately after reported control loss despite partial work", () => {
    const e = row("gym_cmj_resisted"),
      h = history(e);
    h.input.observations[0].sets = [{ setNumber: 1, side: "both", completed: 1, control: "lost" }];
    expect(decide(e, h)).toMatchObject({
      action: "regress",
      exerciseId: "gym_cmj",
      dose: { sets: 1, reps: 2, restSeconds: 120 },
    });
  });
  it("returns to the selected advanced jump only after three stable fallback exposures", () => {
    expect(
      decide(row("gym_cmj_resisted"), history(row("gym_cmj", { sets: 1, reps: 2 }))).action,
    ).toBe("hold");
    expect(
      decide(row("gym_cmj_resisted"), history(row("gym_cmj", { sets: 1, reps: 2 }), 3)),
    ).toMatchObject({
      action: "progress",
      exerciseId: "gym_cmj_resisted",
      dose: { sets: 1, reps: 2 },
    });
  });
  it("regresses on a comparable measured performance drop, without a fatigue diagnosis", () => {
    const e = row("gym_cmj_resisted", { gymBandSetup: setup() }),
      h = history(e, 2, true);
    h.input.observations[0].sets.forEach((s) => (s.metric!.value = 27));
    expect(decide(e, h).action).toBe("regress");
  });
  it("reenters after a long gap rather than increasing from old successes", () => {
    expect(decide(row(), undefined, { date: "2026-12-01", asOfDate: "2026-12-01" })).toMatchObject({
      action: "regress",
      dose: { sets: 1, reps: 2 },
    });
  });
  it("a reduced exposure is not evidence for the next increase", () => {
    const h = history(row("gym_cmj", { sets: 1, reps: 2 }));
    h.completions.s0.executionSnapshot!.engineV2!.phase = "deload";
    expect(decide(row(), h).action).toBe("hold");
  });
  it.each([13, 15, 16, 17])("keeps fast curls adult-only at age %i", (age) => {
    expect(
      decide(row("gym_fast_band_curl"), history(row("gym_fast_band_curl")), {}, { ...player, age })
        .action,
    ).toBe("omit");
  });
});

describe("GP1 whole-week and integration contracts", () => {
  it("does not let a favourable cached score hide severe fatigue", () => {
    expect(
      decide(row(), undefined, { readiness: { ...ready, overall: 9, fatigue: 9 } }).action,
    ).toBe("deload");
  });
  it("does not count the same completed snapshot twice through plan and history", () => {
    const h = history(row());
    const snapshot = h.completions.s0.executionSnapshot!;
    const ctx = gymWeekContext(
      player,
      "2026-11-15",
      { startDate: "2026-11-15", previousPlan: [snapshot], completions: h.completions },
      [snapshot],
      "development",
    );
    expect(ctx.knownLandingsOther7d).toBe(9);
  });
  it.each([
    { phase: "peak" as const },
    { phase: "adaptation" as const },
    { readiness: undefined },
    { readiness: { ...ready, overall: 6 } },
    { demandingDays7d: 4 },
    { unknownExternalLoad: true },
    { date: "2026-11-16" },
  ])("maintains dose under %j", (ctx) => expect(decide(row(), undefined, ctx).action).toBe("hold"));
  it.each([1, 2])(
    "reduces jump dose and omits the dynamic add-on at MD +/- %i",
    (nearestMatchDays) => {
      expect(decide(row(), undefined, { nearestMatchDays })).toMatchObject({
        action: "deload",
        dose: { sets: 1, reps: 2 },
      });
      expect(
        decide(row("gym_fast_band_curl"), history(row("gym_fast_band_curl")), { nearestMatchDays })
          .dose,
      ).toBeNull();
    },
  );
  it("does not reduce automatically at MD-3", () =>
    expect(decide(row(), undefined, { nearestMatchDays: 3 }).action).toBe("progress"));
  it.each([
    { phase: "deload" as const },
    { repeatedHard: true },
    { readiness: { ...ready, overall: 4 } },
  ])("reduces during %j", (ctx) => {
    expect(decide(row(), undefined, ctx)).toMatchObject({
      action: "deload",
      dose: { sets: 1, reps: 2 },
    });
  });
  it("counts known contacts before any progression gate and can omit the optional jump", () => {
    expect(decide(row(), undefined, { knownLandingsOther7d: 59 }).action).toBe("omit");
    expect(decide(row(), undefined, { knownLandingsOther7d: 55 })).toMatchObject({
      action: "deload",
    });
  });
  it("detects an upcoming dense club week even with no historic club logs", () => {
    const ctx = gymWeekContext(
      { ...player, clubTrainingDays: [1, 3, 5] },
      "2026-11-15",
      { startDate: "2026-11-15" },
      [],
      "development",
    );
    expect(ctx.demandingDays7d).toBe(4);
  });
  it("treats a missing prior club RPE as unknown external load", () => {
    const club = sessionFixture({ dbId: "club", date: "2026-11-14", dayType: "club" });
    const ctx = gymWeekContext(
      player,
      "2026-11-15",
      { startDate: "2026-11-15" },
      [club],
      "development",
    );
    expect(ctx.unknownExternalLoad).toBe(true);
  });
  it("does not mutate source recipes, snapshots, or observations and does not ratchet on recalculation", () => {
    const recipe = buildStrength(player, "A", "development"),
      h = history(row("gym_cmj_resisted", { sets: 2, reps: 2 }));
    const options = {
      startDate: "2026-11-15",
      completions: h.completions,
      gymProgression: h.input,
      readiness: { "2026-11-15": ready },
    };
    const before = JSON.stringify({ recipe, options });
    const a = applyGymProgression(recipe, player, "2026-11-15", options, []);
    const b = applyGymProgression(recipe, player, "2026-11-15", options, []);
    expect(a).toEqual(b);
    expect(JSON.stringify({ recipe, options })).toBe(before);
    expect(a.roles).toEqual(["strengthA"]);
    expect(a.sprintMetres).toBe(0);
    expect(a.exercises.find((e) => e.role === "power")!.dose).toMatchObject({ sets: 2, reps: 3 });
    expect(a.plyometricContacts).toBe(strengthLandingCount(a.exercises));
  });
  it("integrates into dated placement, renders the same dose, and preserves A/B", () => {
    const h = history(row("gym_cmj_resisted", { sets: 2, reps: 2 }));
    const p = { ...player, individualTrainingDays: [1] };
    const result = generateTrainingPlan(p, {
      startDate: "2026-11-16",
      weeks: 1,
      ...h,
      gymProgression: h.input,
      readiness: { "2026-11-16": { ...ready, date: "2026-11-16" } },
    });
    const own = result.plan
      .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
      .filter((s) => s.engineV2);
    const a = own.find((s) => s.engineV2!.roles.includes("strengthA"))!;
    expect(a).toBeDefined();
    const jump = a.engineV2!.exercises.find((e) => e.role === "power")!;
    expect(jump.dose).toMatchObject({ sets: 2, reps: 3 });
    const rendered = a
      .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
      .find((e) => e.exerciseId === jump.exerciseId)!;
    expect(gymDoseKey(rendered.engineDose!)).toBe(gymDoseKey(jump.dose));
    expect(
      validateTrainingPlan(result.plan, p, { startDate: "2026-11-16" }).filter((i) =>
        i.code.startsWith("GYM_"),
      ),
    ).toEqual([]);
    expect(
      own.every(
        (s) =>
          !s.engineV2!.roles.includes("speed") ||
          !s.engineV2!.roles.some((r) => r.startsWith("strength")),
      ),
    ).toBe(true);
  });
  it("checks malformed setup metadata in saved prescriptions", () => {
    const e = row("gym_cmj_resisted", { gymBandSetup: setup({ forceNewtons: [NaN, 100] }) });
    expect(gymDoseWithinBounds(e.exerciseId, e.dose, player, "development")).toBe(false);
    expect(gymDoseWithinBounds("gym_cmj", { ...row().dose, reps: 20 }, player, "development")).toBe(
      false,
    );
  });
});
