import { expect, it } from "vitest";
import { runningCalibrationMessage } from "./runningCalibrationStatus";
import { generateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";
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
it("does not claim success while saved recipes still use the prior measurement", () =>
  expect(runningCalibrationMessage(base)).toContain("nie zostały jeszcze zastosowane"));
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
