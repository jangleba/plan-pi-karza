import { describe, expect, it } from "vitest";

import { SIM_SCENARIOS } from "@/lib/football-iq/simulation/scenarios";
import { IQ_PITCH_VIEWBOX, projectPitchPoint, unprojectPitchPoint } from "./SimPitch25D";

describe("BallWise IQ — mobilny kadr boiska 2.5D", () => {
  it("ma szeroki format, który wykorzystuje kartę na telefonie", () => {
    expect(IQ_PITCH_VIEWBOX.width / IQ_PITCH_VIEWBOX.height).toBeGreaterThanOrEqual(1.2);
  });

  it("utrzymuje wszystkie klatki zawodników i reakcje w widocznym kadrze", () => {
    for (const scenario of SIM_SCENARIOS) {
      const points = [
        ...scenario.actors.flatMap((actor) => actor.path),
        ...scenario.reactions.flatMap((reaction) => reaction.moves),
      ];

      for (const point of points) {
        const projected = projectPitchPoint(point.x, point.y);
        expect(projected.x, `${scenario.id}: x`).toBeGreaterThanOrEqual(0);
        expect(projected.x, `${scenario.id}: x`).toBeLessThanOrEqual(IQ_PITCH_VIEWBOX.width);
        expect(projected.y, `${scenario.id}: y`).toBeGreaterThanOrEqual(0);
        expect(projected.y, `${scenario.id}: y`).toBeLessThanOrEqual(IQ_PITCH_VIEWBOX.height);
      }
    }
  });

  it("zamienia dotyk ekranu z powrotem na dokładny punkt boiska", () => {
    for (const point of [
      { x: 8, y: 12 },
      { x: 50, y: 70 },
      { x: 91, y: 126 },
    ]) {
      const projected = projectPitchPoint(point.x, point.y);
      const restored = unprojectPitchPoint(projected.x, projected.y);
      expect(restored.x).toBeCloseTo(point.x, 5);
      expect(restored.y).toBeCloseTo(point.y, 5);
    }
  });
});
