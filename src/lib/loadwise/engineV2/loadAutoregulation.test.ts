import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../types";
import {
  exercisePrescriptionKey,
  strengthMovementKey,
  type ExerciseSessionLog,
} from "../setLogHistory";
import {
  contextualStrengthAdvice,
  observedLoadReductions,
  nextSetLoadAdvice,
  type StrengthLoadContext,
} from "./loadAutoregulation";
const e: TrainingExercise = {
  id: "main",
  exerciseId: "goblet_squat",
  name: "Przysiad goblet",
  sets: "3",
  reps: "4",
  rir: "2",
  engineDose: { sets: 3, reps: 4, rir: 2, restSeconds: 180, intent: "controlled" },
};
const ctx: StrengthLoadContext = {
  age: 20,
  mode: "max_strength",
  date: "2026-11-15",
  asOfDate: "2026-11-15",
  matches7d: 0,
  nearestMatchDays: 99,
  hardDays7d: 0,
  unknownPastExternalLoad: false,
  repeatedHard: false,
  strengthGapDays: null,
};
function history(n = 2, exercise = e): ExerciseSessionLog[] {
  return Array.from({ length: n }, (_, i) => ({
    sessionKey: `s${i}`,
    performedAt: `2026-11-${12 - i * 4}`,
    sets: [1, 2, 3]
      .slice(0, Number(exercise.sets))
      .map((setNumber) => ({ setNumber, weightKg: 80, reps: 4, rir: 3 })),
    verification: {
      expectedSets: Number(exercise.sets),
      prescriptionKey: exercisePrescriptionKey(exercise),
      movementKey: strengthMovementKey(exercise),
      targetReps: { min: 4, max: 4 },
      targetRir: 2,
      phase: "normal",
      sessionDate: `2026-11-${String(12 - i * 4).padStart(2, "0")}`,
    },
  }));
}
const run = (h = history(), patch: Partial<StrengthLoadContext> = {}, exercise = e) =>
  contextualStrengthAdvice(exercise, h, { ...ctx, ...patch });

describe("SP1 numeric load recommendations", () => {
  it("honours today's explicit lighter choice despite earlier successful sessions", () => {
    expect(run(history(), { loadPreference: "lighter" })).toMatchObject({
      action: "reduce",
      weightKg: 75,
    });
    expect(run(history(), { loadPreference: "as_planned" })).toMatchObject({
      action: "increase",
      weightKg: 82.5,
    });
    expect(
      run(history(), { loadPreference: "lighter" }, { ...e, reps: "8" })?.weightKg,
    ).toBeUndefined();
    expect(run(history(), { loadPreference: "lighter", mode: "deload" })).toMatchObject({
      action: "deload",
      weightKg: 70,
    });
  });
  it("counts explicit repeated choices separately from kilograms", () => {
    const result = run(history(), { lighterRequests: 2 });
    expect(result).toMatchObject({ action: "hold", weightKg: 80 });
    expect(result?.reason).toContain("W 2 z ostatnich trzech");
    expect(observedLoadReductions(e, history(), ctx)).toBe(0);
  });
  it("uses the last supported smaller load from descending working sets without penalising the earlier failure twice", () => {
    const h = history();
    h[0].sets[0].rir = 0;
    h[0].sets[1].weightKg = 75;
    h[0].sets[2].weightKg = 75;
    expect(run(h)).toMatchObject({ action: "hold", weightKg: 75 });
    expect(observedLoadReductions(e, h, ctx)).toBe(1);
  });
  it("still reduces when the smaller last set also failed", () => {
    const h = history();
    h[0].sets[1].weightKg = 75;
    h[0].sets[2].weightKg = 75;
    h[0].sets[2].rir = 0;
    expect(run(h)).toMatchObject({ action: "reduce", weightKg: 70 });
  });
  it("counts repeated decreases between comparable normal sessions without calling them preferences", () => {
    const h = history(3);
    h.forEach((s, i) => s.sets.forEach((x) => (x.weightKg = 75 + i * 5)));
    expect(observedLoadReductions(e, h, ctx)).toBe(2);
    expect(run(h)).toMatchObject({ action: "hold", weightKg: 75 });
    expect(run(h)?.reason).toContain("Obniżenie ciężaru w 2");
  });
  it("does not count deloads, changing prescriptions, ascending warm-ups or duplicates as repeated decreases", () => {
    const h = history(3);
    h.forEach((s, i) => s.sets.forEach((x) => (x.weightKg = 75 + i * 5)));
    h[1].verification!.phase = "reduced";
    expect(observedLoadReductions(e, h, ctx)).toBe(0);
    h[1].verification!.phase = "normal";
    h[1].verification!.prescriptionKey = "changed";
    expect(observedLoadReductions(e, h, ctx)).toBe(0);
    h[0].sets.forEach((x, i) => (x.weightKg = 30 + i * 10));
    expect(run(h)?.action).toBe("calibrate");
  });
  it("does not resume a heavier pre-deload load over repeated lighter choices", () => {
    const h = history(3);
    h[0].verification!.phase = "reduced";
    h[0].sets.forEach((x) => (x.weightKg = 70));
    expect(run(h, { lighterRequests: 2 })?.weightKg).toBeUndefined();
    expect(run(h, { loadPreference: "lighter" })).toMatchObject({ action: "reduce", weightKg: 65 });
  });
  it("increases by one available equipment step only after repeatable extra reserve", () =>
    expect(run()).toMatchObject({ action: "increase", weightKg: 82.5 }));
  it("keeps a successfully challenging load at the prescribed RIR", () => {
    const h = history();
    h.forEach((s) => s.sets.forEach((x) => (x.rir = 2)));
    expect(run(h)).toMatchObject({ action: "hold", weightKg: 80 });
  });
  it("requires three exposures for minors and respects the smaller step ceiling", () => {
    expect(run(history(), { age: 17, incrementKg: 0.5 })).toMatchObject({ action: "hold" });
    expect(run(history(3), { age: 17, incrementKg: 0.5 })).toMatchObject({
      action: "increase",
      weightKg: 80.5,
    });
    expect(run(history(3), { age: 17 })).toMatchObject({ action: "hold", weightKg: 80 });
  });
  it("uses explicit available weights and rejects a large jump", () => {
    expect(run(history(), { availableWeightsKg: [80, 81, 85] })).toMatchObject({
      action: "increase",
      weightKg: 81,
    });
    expect(run(history(), { availableWeightsKg: [80, 90] })).toMatchObject({
      action: "hold",
      weightKg: 80,
    });
  });
  it("reacts to one failed exposure instead of waiting for two failures", () => {
    const h = history();
    h[0].sets[0].rir = 0;
    expect(run(h)).toMatchObject({ action: "reduce", weightKg: 75 });
  });
  it("reduces more after repeated failure without pretending the step is physiologically exact", () => {
    const h = history();
    h.forEach((s) => (s.sets[0].reps = 2));
    expect(run(h)).toMatchObject({ action: "reduce", weightKg: 72.5 });
  });
  it.each([
    { mode: "maintenance" as const },
    { matches7d: 2 },
    { nearestMatchDays: 2 },
    { hardDays7d: 4 },
    { unknownPastExternalLoad: true },
    { readinessScore: 6 },
  ])("holds despite success under %j", (patch) =>
    expect(run(history(), patch)).toMatchObject({ action: "hold", weightKg: 80 }),
  );
  it("does not reduce merely at MD-3", () =>
    expect(run(history(), { nearestMatchDays: 3 })?.action).toBe("increase"));
  it("reduces deload load when the new reserve cannot be supported", () => {
    const reduced = { ...e, rir: "4", progressionPhase: "reduced" as const };
    expect(run(history(), { mode: "deload" }, reduced)).toMatchObject({
      action: "deload",
      weightKg: 70,
    });
  });
  it("can keep kilograms during deload when the larger reserve is already recorded", () => {
    const h = history();
    h.forEach((s) => s.sets.forEach((x) => (x.rir = 5)));
    expect(run(h, { mode: "deload" }, { ...e, rir: "4" })).toMatchObject({
      action: "deload",
      weightKg: 80,
    });
  });
  it("returns conservatively after a long gap, not a fabricated strength loss diagnosis", () =>
    expect(run(history(), { asOfDate: "2026-12-01", date: "2026-12-01" })).toMatchObject({
      action: "resume",
      weightKg: 70,
    }));
  it("does not give exact kg from very old logs", () => {
    const r = run(history(), { asOfDate: "2027-01-15", date: "2027-01-15" });
    expect(r?.action).toBe("calibrate");
    expect(r?.weightKg).toBeUndefined();
  });
  it.each([
    "unverified",
    "partial",
    "wrong-angle",
    "future",
    "duplicate",
    "missing-rir",
    "negative-rir",
    "nan-weight",
  ])("never increases from %s records", (failure) => {
    const h = history();
    if (failure === "unverified") h[0].verification = undefined;
    if (failure === "partial") h[0].sets.pop();
    if (failure === "wrong-angle") h[0].verification!.movementKey = "different";
    if (failure === "future") h[0].verification!.sessionDate = "2026-11-16";
    if (failure === "duplicate") h[1].sessionKey = h[0].sessionKey;
    if (failure === "missing-rir") h[0].sets[0].rir = null;
    if (failure === "negative-rir") h[0].sets[0].rir = -1;
    if (failure === "nan-weight") h[0].sets[0].weightKg = NaN;
    expect(run(h)?.action).not.toBe("increase");
  });
  it("does not count a reduced week as another success", () => {
    const h = history(3);
    h[0].verification!.phase = "reduced";
    expect(run(h)).toMatchObject({ action: "resume", weightKg: 80 });
  });
  it("returns to a normal reference after lower-set maintenance without authorizing a load increase", () => {
    const exercise = { ...e, sets: "2", engineDose: { ...e.engineDose!, sets: 2 } };
    expect(run(history(), { mode: "maintenance" }, exercise)).toMatchObject({
      action: "hold",
      weightKg: 80,
    });
  });
  it("does not carry a fixed load to a higher repetition target", () =>
    expect(run(history(), {}, { ...e, reps: "8" })).toMatchObject({ action: "calibrate" }));
  it.each([
    { duration: "20 s" },
    { engineDose: { ...e.engineDose!, intent: "explosive" as const } },
    { engineDose: { ...e.engineDose!, cluster: { repGroups: [2, 2], intraRestSeconds: 20 } } },
  ])("does not apply kg/RIR progression to %j", (patch) =>
    expect(run(history(), {}, { ...e, ...patch })).toBeNull(),
  );
  it("does not plan exact increases for a future training date", () => {
    const r = run(history(), { date: "2026-11-16" });
    expect(r?.action).toBe("hold");
    expect(r?.weightKg).toBeUndefined();
  });
  it("does not mutate history", () => {
    const h = history(),
      before = JSON.stringify(h);
    run(h);
    expect(JSON.stringify(h)).toBe(before);
  });
});

describe("SP1 within-session corrections", () => {
  it("lets fresh high session loads override an older stronger prescription", () =>
    expect(run(history(), { repeatedHard: true })).toMatchObject({
      action: "deload",
      weightKg: 70,
    }));
  it("treats a two-repetition reserve deficit as a meaningful reduction signal", () =>
    expect(
      nextSetLoadAdvice({ ...e, rir: "3" }, { setNumber: 1, weightKg: 80, reps: 4, rir: 1 }, ctx),
    ).toMatchObject({ action: "reduce", weightKg: 75 }));
  const set = { setNumber: 1, weightKg: 80, reps: 4, rir: 0 };
  it("lowers the next working set after failure with a prescribed reserve", () =>
    expect(nextSetLoadAdvice(e, set, ctx)).toMatchObject({ action: "reduce", weightKg: 75 }));
  it("lowers after too few reps even when RIR was not supplied", () =>
    expect(nextSetLoadAdvice(e, { ...set, reps: 2, rir: null }, ctx)).toMatchObject({
      action: "reduce",
      weightKg: 75,
    }));
  it.each([2, 3, 5])("does not increase within a session from one set with RIR %i", (rir) =>
    expect(nextSetLoadAdvice(e, { ...set, rir }, ctx)).toBeNull(),
  );
});
