import { describe, expect, it } from "vitest";
import { createRampBlock } from "./rampProtocol";
import { upgradeSprintSession } from "./sessionUpgrade";
import type { SprintSession } from "./types";

describe("RAMP protocol", () => {
  it("contains six guided steps and fits a small space", () => {
    const block = createRampBlock();
    expect(block.exercises).toHaveLength(6);
    expect(block.exercises.at(-1)?.prescription).toContain("5–10 m");
  });

  it("replaces only a legacy one-item RAMP block", () => {
    const session: SprintSession = {
      id: "test",
      title: "Sprint: akceleracja",
      estimatedMinutes: 50,
      blocks: [{ id: "ramp", number: "01", title: "Przygotowanie RAMP", estimatedMinutes: 8, exercises: [{ id: "legacy", title: "RAMP", prescription: "8–10 min" }] }],
    };
    expect(upgradeSprintSession(session).blocks[0].exercises).toHaveLength(6);
  });
});

