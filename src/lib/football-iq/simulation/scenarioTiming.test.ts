import { describe, expect, it } from "vitest";

import { ADVANCED_SCENARIOS } from "./library";

describe("BallWise IQ — tempo scenariuszy", () => {
  it("zachowuje czas obserwacji ustawiony przez autora scenariusza", () => {
    const scenario = ADVANCED_SCENARIOS.find(
      (candidate) => candidate.id === "press-manipulation-cb",
    );

    expect(scenario).toBeDefined();
    expect(scenario?.observationMs).toBe(7000);
    expect(scenario?.timingWindows.at(-1)?.toMs).toBe(7000);
  });
});
