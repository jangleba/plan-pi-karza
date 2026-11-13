import { describe, it, expect } from "vitest";
import { recommendStrengthLoad } from "./progression";
import { exercisePrescriptionKey, type ExerciseSessionLog } from "../setLogHistory";
const exercise = { id: "squat", name: "Przysiad", sets: "3", reps: "4", rir: "2" };
function history(): ExerciseSessionLog[] {
  return [1, 2].map((n) => ({
    sessionKey: String(n),
    performedAt: `2026-11-0${n}`,
    verification: { expectedSets: 3, prescriptionKey: exercisePrescriptionKey(exercise) },
    sets: [1, 2, 3].map((setNumber) => ({ setNumber, weightKg: 80, reps: 4, rir: 2 })),
  }));
}
describe("evidence-based load advice", () => {
  it("suggests a small weight step only after two complete comparable exposures", () => {
    expect(recommendStrengthLoad(exercise, history())?.weightKg).toBe(82);
  });
  it("does not increase from unfinished, unverified, mixed or stale histories", () => {
    const a = history();
    a[0].verification = undefined;
    expect(recommendStrengthLoad(exercise, a)).toBeNull();
    const b = history();
    b[0].sets.pop();
    expect(recommendStrengthLoad(exercise, b)).toBeNull();
    const c = history();
    c[0].sets[0].weightKg = 90;
    expect(recommendStrengthLoad(exercise, c)).toBeNull();
    const d = history();
    d.unshift({ ...d[0], sessionKey: "new", verification: undefined });
    expect(recommendStrengthLoad(exercise, d)).toBeNull();
  });
  it("does not treat holds, jumps or one hard session as evidence for a load increase", () => {
    expect(recommendStrengthLoad({ ...exercise, duration: "20 s" }, history())).toBeNull();
    const a = history();
    a[0].sets[0].rir = 0;
    expect(recommendStrengthLoad(exercise, a)).toBeNull();
  });
  it("reduces the proposal if both exposures reached failure", () => {
    const a = history();
    for (const s of a) s.sets[0].rir = 0;
    expect(recommendStrengthLoad(exercise, a)?.weightKg).toBe(78);
  });
  it("finishes the repetition range before suggesting more weight", () => {
    const ranged = { ...exercise, reps: "4–6" };
    const sessions = history().map((s) => ({
      ...s,
      verification: { expectedSets: 3, prescriptionKey: exercisePrescriptionKey(ranged) },
    }));
    expect(recommendStrengthLoad(ranged, sessions)).toBeNull();
    for (const s of sessions) for (const set of s.sets) set.reps = 6;
    expect(recommendStrengthLoad(ranged, sessions)?.weightKg).toBe(82);
  });
  it("can reduce a failed dose with fewer repetitions and rejects impossible logs", () => {
    const sessions = history();
    for (const s of sessions) s.sets[0].reps = 2;
    expect(recommendStrengthLoad(exercise, sessions)?.weightKg).toBe(78);
    sessions[0].sets[0].rir = -1;
    expect(recommendStrengthLoad(exercise, sessions)).toBeNull();
  });
});
