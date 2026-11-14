import { describe, expect, it } from "vitest";
import { isoDate, localToday, warsawToday } from "./labels";

const inWarsaw = Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Warsaw";

describe("the athlete's day around midnight and daylight saving time", () => {
  it("Europe/Warsaw day is computed from the Warsaw wall clock, never from UTC", () => {
    // 23:30 Warsaw winter time (UTC+1) and summer time (UTC+2) is still the same Warsaw day
    expect(isoDate(warsawToday(new Date("2026-10-25T22:30:00Z")))).toBe("2026-10-25");
    expect(isoDate(warsawToday(new Date("2027-03-28T21:30:00Z")))).toBe("2027-03-28");
    // 00:30 the next Warsaw day is already the next day although UTC is still the old date
    expect(isoDate(warsawToday(new Date("2026-10-25T23:30:00Z")))).toBe("2026-10-26");
    expect(isoDate(warsawToday(new Date("2027-03-28T22:30:00Z")))).toBe("2027-03-29");
  });

  it("the 25-hour and 23-hour days still have one date each", () => {
    // 2026-10-25 has 25 hours in Warsaw: every hour of it maps to that single date
    for (let h = 0; h < 25; h++) {
      const t = new Date(Date.parse("2026-10-24T22:00:00Z") + h * 3_600_000);
      expect(isoDate(warsawToday(t))).toBe("2026-10-25");
    }
    for (let h = 0; h < 23; h++) {
      const t = new Date(Date.parse("2027-03-27T23:00:00Z") + h * 3_600_000);
      expect(isoDate(warsawToday(t))).toBe("2027-03-28");
    }
  });

  it.skipIf(!inWarsaw)("on a Warsaw device the app's shared day equals the Warsaw day", () => {
    for (const iso of [
      "2026-10-25T22:30:00Z",
      "2026-10-25T23:30:00Z",
      "2027-03-28T21:30:00Z",
      "2027-03-28T22:30:00Z",
    ])
      expect(isoDate(localToday(new Date(iso)))).toBe(isoDate(warsawToday(new Date(iso))));
  });
});
