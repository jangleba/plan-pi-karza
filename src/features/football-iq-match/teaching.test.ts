import { describe, it, expect } from "vitest";
import { scenarios, scenarioVariant } from "./scenarios";
import { lessons, teachingMarkers } from "./teaching";
import { evaluateDecision } from "./engine";
import { insidePitch } from "./simulation";

describe("IQ learning objectives", () => {
  it("teaches every situation without requiring a shot or a goal", () => {
    for (const s of scenarios) {
      expect(lessons[s.id], s.id).toBeDefined();
      expect(
        s.referenceActions.some((a) => a.type === "shot"),
        s.id,
      ).toBe(false);
      expect(
        s.goals?.some((g) => g.type === "shot"),
        s.id,
      ).toBe(false);
      expect(evaluateDecision(s, s.referenceActions).level, s.id).toBe("strong");
    }
  });
  it("places teaching cues on the mirrored situation rather than the original side", () => {
    for (const s of scenarios) {
      const original = teachingMarkers(s);
      const mirrored = teachingMarkers(scenarioVariant(s, 1));
      expect(original.length, s.id).toBeGreaterThan(0);
      for (let i = 0; i < original.length; i++) {
        expect(mirrored[i].point.x).toBeCloseTo(100 - original[i].point.x);
        expect(mirrored[i].point.y).toBe(original[i].point.y);
        expect(insidePitch(mirrored[i].point)).toBe(true);
      }
    }
  });
});
