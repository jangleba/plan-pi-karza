import { describe, expect, it } from "vitest";
import { normalizePersistedPainLocations } from "./profilePainPersistence";

describe("profile pain persistence", () => {
  it("restores valid pain locations after hydration", () => {
    expect(normalizePersistedPainLocations(["knee", "hamstring"])).toEqual([
      "knee",
      "hamstring",
    ]);
  });

  it("removes duplicates and rejects unknown or malformed values", () => {
    expect(
      normalizePersistedPainLocations([
        "ankle",
        "ankle",
        "unknown",
        null,
        7,
        "back",
      ]),
    ).toEqual(["ankle", "back"]);
  });

  it("uses an empty safe value for legacy profiles", () => {
    expect(normalizePersistedPainLocations(undefined)).toEqual([]);
    expect(normalizePersistedPainLocations({ knee: true })).toEqual([]);
  });
});
