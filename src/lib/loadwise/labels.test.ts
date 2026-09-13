import { describe, expect, it } from "vitest";
import { isoDate, localToday, professionalSessionTitle, warsawToday } from "./labels";

describe("local day resolution", () => {
  it("normalizes any timestamp to local YYYY-MM-DD midnight", () => {
    const noon = new Date(2026, 7, 17, 12, 45, 0);
    const localMidnight = localToday(noon);
    expect(isoDate(localMidnight)).toBe("2026-08-17");
    expect(localMidnight.getHours()).toBe(0);
    expect(localMidnight.getMinutes()).toBe(0);
  });

  it("keeps dedicated Europe/Warsaw helper for backwards compatibility", () => {
    const atUtcLateEvening = new Date("2026-08-17T22:30:00.000Z");
    expect(isoDate(warsawToday(atUtcLateEvening))).toBe("2026-08-18");
  });
});

describe("professional session titles", () => {
  it("replaces shorthand strength labels with professional Polish names", () => {
    expect(professionalSessionTitle("Siła nóg")).toBe("Trening siłowy kończyn dolnych");
    expect(professionalSessionTitle("Siła górnej części ciała")).toBe(
      "Trening siłowy górnej części ciała",
    );
  });

  it("keeps an already specific title unchanged", () => {
    expect(professionalSessionTitle("Przyspieszenie 10–20 m")).toBe("Przyspieszenie 10–20 m");
  });
});
