import { describe, expect, it } from "vitest";
import { isoDate, warsawToday } from "./labels";

describe("local day resolution", () => {
  it("normalizes any timestamp to local YYYY-MM-DD midnight", () => {
    const noon = new Date(2026, 7, 17, 12, 45, 0);
    const localMidnight = warsawToday(noon);
    expect(isoDate(localMidnight)).toBe("2026-08-17");
    expect(localMidnight.getHours()).toBe(0);
    expect(localMidnight.getMinutes()).toBe(0);
  });
});
