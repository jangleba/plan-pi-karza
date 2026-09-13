import { describe, expect, it } from "vitest";
import { isProfileMatchDate, normalizeMatchDates, profileMatchDates } from "./matchSchedule";

describe("match schedule", () => {
  it("normalizes, sorts and deduplicates at most two exact dates", () => {
    expect(normalizeMatchDates(["2026-09-20", "bad", "2026-09-16", "2026-09-20"])).toEqual([
      "2026-09-16",
      "2026-09-20",
    ]);
  });

  it("keeps the legacy single date as a compatible source", () => {
    const profile = { matchDate: "2026-09-20", matchDates: ["2026-09-16"] };
    expect(profileMatchDates(profile)).toEqual(["2026-09-16", "2026-09-20"]);
    expect(isProfileMatchDate(profile, "2026-09-16")).toBe(true);
  });
});
