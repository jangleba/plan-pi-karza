import { describe, expect, it } from "vitest";
import { sessionFixture, sectionFixture } from "@/components/loadwise/session/testFixtures";
import { enforceSprintOnlyContent, isBallExercise } from "./sprintContentPolicy";
import { resolveEffectivePlan } from "./effectivePlan";

describe("sprint sessions stay separate from ball practice", () => {
  it("recognizes football and medicine-ball work without treating football sprint as ball work", () => {
    expect(isBallExercise({ name: "Prowadzenie piłki" })).toBe(true);
    expect(isBallExercise({ name: "Medicine ball throw" })).toBe(true);
    expect(isBallExercise({ name: "Sprint bez piłki", exerciseId: "football_curved_sprint" })).toBe(false);
  });
  it("removes ball work from both the persisted list and structured runner", () => {
    const session = sessionFixture({ title: "Sprint", speedGeneratorVersion: "legacy",
      sections: { warmup: [], main: [{ name: "Sprint 20 m", prescription: "3 x 20 m" },
        { name: "Sprint z piłką", prescription: "3 x 20 m" }], accessory: [],
        footballTransfer: [{ name: "Podanie", prescription: "10" }], cooldown: [] },
      structuredSections: [sectionFixture("main", [{ id: "run", name: "Sprint 20 m" },
        { id: "ball", name: "Drybling z piłką" }])],
    });
    const result = enforceSprintOnlyContent(session);
    expect(result.sections.main.map(x => x.name)).toEqual(["Sprint 20 m"]);
    expect(result.sections.footballTransfer).toEqual([]);
    expect(result.structuredSections?.[0].blocks[0].exercises.map(x => x.id)).toEqual(["run"]);
    expect(session.sections.main).toHaveLength(2);
  });
  it("does not erase a football session or an executed historical prescription", () => {
    const ball = sessionFixture({ title: "Technika z piłką", sections: { warmup: [],
      main: [{ name: "Prowadzenie piłki", prescription: "20 s" }], accessory: [], footballTransfer: [], cooldown: [] } });
    expect(enforceSprintOnlyContent(ball).sections.main).toHaveLength(1);
    expect(enforceSprintOnlyContent({ ...ball, speedGeneratorVersion: "old", executionProtected: true }).sections.main).toHaveLength(1);
  });
  it("blocks a legacy speed prescription made entirely of ball work through the shared selector", () => {
    const day = sessionFixture({ title: "Sprint", speedGeneratorVersion: "old", sections: {
      warmup: [], main: [{ name: "Bieg z piłką", prescription: "20 m" }], accessory: [], footballTransfer: [], cooldown: [] } });
    const [result] = resolveEffectivePlan([day]);
    expect(result.durationMin).toBe(0);
    expect(result.dayType).toBe("recovery");
    expect(result.sections.main).toEqual([]);
  });
  it("cleans the legacy exercises fallback too", () => {
    const day = sessionFixture({ speedGeneratorVersion: "old", exercises: [
      { name: "Sprint 20 m", prescription: "3 x 20 m" },
      { name: "Bieg z piłką", prescription: "20 m" },
    ] });
    expect(enforceSprintOnlyContent(day).exercises?.map(ex => ex.name)).toEqual(["Sprint 20 m"]);
  });
  it("preserves a legal flat sprint when the optional structured list is empty", () => {
    const day = sessionFixture({ speedGeneratorVersion: "old", structuredSections: [],
      sections: { warmup: [], main: [{ name: "Sprint 20 m", prescription: "3 x 20 m" }],
        accessory: [], footballTransfer: [], cooldown: [] } });
    expect(enforceSprintOnlyContent(day).durationMin).toBe(day.durationMin);
  });
});
