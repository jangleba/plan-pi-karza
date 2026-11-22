import { describe, expect, it } from "vitest";
import { DEFAULT_CHECK_IN, checkInFor, strainOf } from "./adapt";

describe("check-in dotyczy tylko dzisiaj", () => {
  const bad = { recovery: 1 as const, feeling: 1 as const, less: true };
  it("dziś: obowiązuje wpisany check-in", () => {
    const r = checkInFor("2026-11-22", "2026-11-22", bad, true);
    expect(r.checkIn).toEqual(bad); expect(strainOf(r.checkIn)).toBe("heavy"); expect(r.checkedIn).toBe(true);
  });
  it("jutro i wczoraj: zwykła wersja treningu i bez przypominania o check-inie", () => {
    for (const d of ["2026-11-23", "2026-11-21"]) {
      const r = checkInFor(d, "2026-11-22", bad, false);
      expect(r.checkIn).toEqual(DEFAULT_CHECK_IN); expect(strainOf(r.checkIn)).toBe("none"); expect(r.checkedIn).toBe(true);
    }
  });
  it("dziś bez check-inu: przypomnienie zostaje", () => {
    expect(checkInFor("2026-11-22", "2026-11-22", DEFAULT_CHECK_IN, false).checkedIn).toBe(false);
  });
});
