import { describe, expect, it } from "vitest";

import { SIM_SCENARIOS } from "@/lib/football-iq/simulation/scenarios";
import { IQ_PITCH_VIEWBOX, projectPitchPoint } from "./SimPitch25D";

describe("BallWise IQ — mobilny kadr boiska 2.5D", () => {
  it("ma szeroki format, który wykorzystuje kartę na telefonie", () => {
    expect(IQ_PITCH_VIEWBOX.width / IQ_PITCH_VIEWBOX.height).toBeGreaterThanOrEqual(
      1.2,
    );
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
        expect(projected.x, `${scenario.id}: x`).toBeLessThanOrEqual(
          IQ_PITCH_VIEWBOX.width,
        );
        expect(projected.y, `${scenario.id}: y`).toBeGreaterThanOrEqual(0);
        expect(projected.y, `${scenario.id}: y`).toBeLessThanOrEqual(
          IQ_PITCH_VIEWBOX.height,
        );
      }
    }
  });
});
