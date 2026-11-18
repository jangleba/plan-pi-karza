import { describe, expect, it } from "vitest";
import { imageryFor, totalSeconds } from "./imagery";
import type { Position } from "./profile";

const ALL: Position[] = ["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik"];

describe("Mecz w głowie", () => {
  it("każda pozycja ma oddech, 4 sytuacje i słowo na mecz, ok. 3 minut", () => {
    for (const p of ALL) {
      const s = imageryFor(p);
      expect(s).toHaveLength(6);
      expect(s[0]!.title).toBe("Oddech");
      expect(s[5]!.title).toBe("Słowo na mecz");
      expect(totalSeconds(s)).toBeGreaterThanOrEqual(150);
      expect(totalSeconds(s)).toBeLessThanOrEqual(210);
    }
  });
  it("punkty na tablicy leżą na boisku", () => {
    for (const p of ALL)
      for (const st of imageryFor(p))
        for (const v of [...(st.path ?? []), ...(st.ball ?? [])]) {
          expect(v.x).toBeGreaterThanOrEqual(0);
          expect(v.x).toBeLessThanOrEqual(105);
          expect(v.y).toBeGreaterThanOrEqual(0);
          expect(v.y).toBeLessThanOrEqual(68);
        }
  });
});
