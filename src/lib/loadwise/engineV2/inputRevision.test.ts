import { describe, expect, it } from "vitest";
import { trainingProfileRevision } from "../planIdentity";
import { buildProfile } from "../store/model";

const athlete = buildProfile(
  { full_name: "Revision test" },
  { age: 20, position: "midfielder" },
  null,
)!;

describe("generator input revision", () => {
  it("invalidates a preview when the source of the running measurement changes", () => {
    expect(trainingProfileRevision({ ...athlete, fieldMasSourceSessionId: "test-a" })).not.toBe(
      trainingProfileRevision({ ...athlete, fieldMasSourceSessionId: "test-b" }),
    );
  });
  it("keeps the same revision after JSONB reorders preference object keys", () => {
    const first = {
      ...athlete,
      trainingMethodPreferences: { strength: "M13" as const, mobilityFocus: "hip" as const },
    };
    const second = {
      ...athlete,
      trainingMethodPreferences: { mobilityFocus: "hip" as const, strength: "M13" as const },
    };
    expect(trainingProfileRevision(first)).toBe(trainingProfileRevision(second));
  });
});
