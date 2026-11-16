import { expect, it } from "vitest";
import { runningCalibrationMessage } from "./runningCalibrationStatus";
import { generateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";
import { proposeRunningCalibration } from "./runningCalibration";
const profile = { ...gymAthlete, goal: "endurance" as const };
const plan = generateTrainingPlan(profile, { startDate: "2026-11-15", weeks: 1 }).plan;
const measured = {
  ...profile,
  fieldMasKmh: 16,
  fieldMasTestedAt: "2026-11-15",
  fieldMasSourceSessionId: "test-1",
};
const base = {
  profile: measured,
  plan,
  completions: {},
  todayIso: "2026-11-15",
  gym: { loading: false, available: true, records: [] },
  unresolvedWrites: false,
  online: true,
};
it("leaves ready proposal actions to the actual proposal card", () =>
  expect(runningCalibrationMessage(base)).toBeNull());
it("explains why calibration is waiting", () => {
  expect(runningCalibrationMessage({ ...base, online: false })).toContain(
    "połączenie z internetem",
  );
  expect(runningCalibrationMessage({ ...base, gym: { ...base.gym, loading: true } })).toContain(
    "wczytanie zapisów",
  );
  expect(runningCalibrationMessage({ ...base, gym: { ...base.gym, available: false } })).toContain(
    "Nie udało się wczytać",
  );
  expect(runningCalibrationMessage({ ...base, unresolvedWrites: true })).toContain(
    "synchronizację",
  );
});
it("stays quiet for current recipes or when there are no pending running sessions", () => {
  expect(runningCalibrationMessage({ ...base, profile })).toBeNull();
  expect(runningCalibrationMessage({ ...base, plan: [] })).toBeNull();
});

it("does not advertise a proposal when a new MAS leaves effort-based runs unchanged", () => {
  const effortProfile = { ...measured, level: "beginner" as const };
  const effortPlan = generateTrainingPlan(effortProfile, {
    startDate: base.todayIso,
    weeks: 1,
  }).plan;
  const updated = { ...effortProfile, fieldMasKmh: 17, fieldMasSourceSessionId: "test-2" };
  const input = { ...base, profile: updated, plan: effortPlan };
  expect(
    proposeRunningCalibration({
      profile: updated,
      plan: effortPlan,
      completions: {},
      todayIso: base.todayIso,
      planId: "effort-plan",
    }),
  ).toBeNull();
  expect(runningCalibrationMessage(input)).toBeNull();
});
