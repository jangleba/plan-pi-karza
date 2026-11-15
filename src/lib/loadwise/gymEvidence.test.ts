import { describe, it, expect } from "vitest";
import {
  validGymEquipment,
  validGymRecordData,
  gymRecordKey,
  equipmentHistory,
  gymProgressionInput,
  type GymEquipment,
  type GymRecord,
  type GymRecordData,
} from "./gymEvidence";
import type { ExerciseSessionLog } from "./setLogHistory";
const gear: GymEquipment = {
  kind: "equipment",
  version: 1,
  id: crypto.randomUUID(),
  exerciseId: "goblet_squat",
  label: "Hantla A",
  convention: "per_hand",
  incrementKg: 0.5,
};
const sid = crypto.randomUUID();
const response: GymRecordData = {
  kind: "response",
  version: 1,
  sessionId: sid,
  exerciseId: gear.exerciseId,
  prescriptionKey: "dose",
  suggestionKey: "proposal",
  decision: "hold",
  suggestedKg: 25.5,
  chosenKg: 25,
  equipment: gear,
  reason: "not_ready",
};
const row = (payload: GymRecordData, pending = false): GymRecord => ({
  user_id: "u",
  record_key: gymRecordKey(payload),
  payload,
  revision: 1,
  last_operation_id: crypto.randomUUID(),
  updated_at: "2026-11-15T10:00:00Z",
  pending,
});
describe("gym evidence contracts", () => {
  it("records refusal and chosen load without calling it a failed set", () => {
    expect(validGymRecordData(response)).toBe(true);
    expect(response).not.toHaveProperty("rir");
    expect(response).not.toHaveProperty("failed");
  });
  it.each([0, -1, NaN, Infinity, 200])(
    "rejects an impossible equipment increment %s",
    (incrementKg) => expect(validGymEquipment({ ...gear, incrementKg })).toBe(false),
  );
  it("requires a kg convention and actual equipment information", () => {
    expect(validGymEquipment({ ...gear, convention: "unknown" })).toBe(false);
    expect(validGymEquipment({ ...gear, incrementKg: undefined })).toBe(false);
    expect(
      validGymEquipment({ ...gear, incrementKg: undefined, availableWeightsKg: [10, 12.5, 15] }),
    ).toBe(true);
  });
  it("excludes pending records and old equipment conventions from positive load evidence", () => {
    const h: ExerciseSessionLog[] = [
      {
        sessionKey: sid,
        performedAt: "2026-11-12",
        sets: [],
        verification: { expectedSets: 3, prescriptionKey: "dose" },
      },
    ];
    expect(
      equipmentHistory(h, [row(response)], gear.exerciseId, gear)[0].verification,
    ).toBeDefined();
    expect(
      equipmentHistory(h, [row(response, true)], gear.exerciseId, gear)[0].verification,
    ).toBeUndefined();
    expect(
      equipmentHistory(h, [row(response)], gear.exerciseId, { ...gear, id: crypto.randomUUID() })[0]
        .verification,
    ).toBeUndefined();
    expect(
      equipmentHistory(h, [row(response)], gear.exerciseId, { ...gear, convention: "total" })[0]
        .verification,
    ).toBeUndefined();
  });
  it("passes only synced observations to the planner without deriving quality from a timer", () => {
    const data: GymRecordData = {
      kind: "observation",
      version: 1,
      sessionId: sid,
      exerciseId: "gym_cmj",
      observation: { sessionId: sid, exerciseId: "gym_cmj", source: "athlete_observed", sets: [] },
    };
    expect(gymProgressionInput([row(data, true)]).observations).toEqual([]);
    expect(gymProgressionInput([row(data)]).observations).toEqual([data.observation]);
    expect(
      validGymRecordData({ ...data, observation: { ...data.observation, source: "timer" } }),
    ).toBe(false);
  });
});
