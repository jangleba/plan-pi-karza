import { expect, it } from "vitest";
import { buildProfile } from "./store/model";
import { trainingProfileRevision, trainingSetupRevision } from "./planIdentity";

it("separates derived running results from training choices without weakening the full identity", () => {
  const p = buildProfile({ full_name: "Test" }, { age: 23, position: "midfielder" }, null)!;
  const result = {
    ...p,
    fieldMasKmh: 19,
    fieldMasTestedAt: "2026-11-13",
    fieldMasSourceSessionId: "measured-run",
    runningProgressionLevel: 3,
  };
  expect(trainingProfileRevision(result)).not.toBe(trainingProfileRevision(p));
  expect(trainingSetupRevision(result)).toBe(trainingSetupRevision(p));
  for (const next of [
    { ...p, goal: "speed" as const },
    { ...p, equipment: ["dumbbell"] },
    { ...p, painInjury: !p.painInjury },
  ])
    expect(trainingSetupRevision(next)).not.toBe(trainingSetupRevision(p));
});
