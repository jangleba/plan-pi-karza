import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { createJourney, createJourneyForRules, chooseJourney } from "./journeyEngine";
import { makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { spatialPlayerChoice, spatialPointChoice, changeSpatialChoice } from "./spatialDecision";
import { landscapeDiagramView, projectDiagram, pickDiagram } from "./diagramGeometry";

describe("decisions drawn on the pitch", () => {
  it("records a player-selected point in guided mode and restores it exactly", () => {
    const s = createJourney(advancedJourneyBank[0]);
    const p = { x: s.world.positions.you.x + 8.73, y: s.world.positions.you.y - 6.19 };
    const choice = spatialPointChoice(s, p);
    expect(choice.point.x).toBeCloseTo(p.x, 6);
    expect(choice.point.y).toBeCloseTo(p.y, 6);
    expect(choice.id).toContain("free6:");
    const next = chooseJourney(s, choice.id, 2),
      draft = makeJourneyDraft(next, "learn", "free-guided");
    expect(restoreJourney(draft)).toEqual(next);
  });
  it("keeps shielding available as a deliberate alternative to the planned dribble", () => {
    const s = createJourney(advancedJourneyBank[0]),
      carry = spatialPointChoice(s, {
        x: s.world.positions.you.x + 8,
        y: s.world.positions.you.y - 6,
      });
    const shield = changeSpatialChoice(s, carry, "now", "shield");
    expect(shield.style).toBe("shield");
    expect(shield.id).toContain("hold:protect");
    expect(
      restoreJourney(makeJourneyDraft(chooseJourney(s, shield.id), "learn", "shield")),
    ).toEqual(chooseJourney(s, shield.id));
  });
  it("keeps older banks' guided-mode free-choice restrictions unchanged", () => {
    const s = createJourneyForRules(advancedJourneyBank[0], 6),
      choice = spatialPointChoice(s, {
        x: s.world.positions.you.x + 8,
        y: s.world.positions.you.y - 6,
      });
    const draft = makeJourneyDraft(chooseJourney(s, choice.id), "learn", "old-free");
    expect(() => restoreJourney(draft)).toThrow();
  });
  it("uses the touched teammate, and changes timing and delivery without changing the receiver", () => {
    const s = createJourney(advancedJourneyBank[0]),
      pass = spatialPlayerChoice(s, "support");
    expect(pass.targetId).toBe("support");
    expect(pass.delivery).toBe("ground");
    const delayed = changeSpatialChoice(s, pass, "delay", undefined, s.definition.delivery);
    expect(delayed.targetId).toBe("support");
    expect(delayed.timing).toBe("delay");
    expect(delayed.delivery).toBe(s.definition.delivery);
  });
  it("maps defensive touches to the actual carrier or marked opponent", () => {
    const s = createJourney(
      advancedJourneyBank.find((d) => d.role === "wing" && d.concept === "press-cover")!,
    );
    s.world.positions.you = { x: 50, y: 70 };
    s.world.positions[s.world.carrierId] = { x: 50, y: 60 };
    expect(spatialPlayerChoice(s, s.world.carrierId).intent).toBe("press");
    const other = s.players.find(
      (p) => p.team === "away" && !p.goalkeeper && p.id !== s.world.carrierId,
    )!;
    s.world.positions[other.id] = { x: 55, y: 65 };
    expect(spatialPlayerChoice(s, other.id).intent).toBe("mark");
    expect(spatialPointChoice(s, { x: 48, y: 76 }).intent).toBe("cover");
  });
  it.each([
    { width: 304, height: 280 },
    { width: 374, height: 310 },
    { width: 574, height: 210 },
  ])("uses identical rotated geometry for drawing and hit testing: %j", (size) => {
    const view = landscapeDiagramView(size);
    for (const p of [
      { x: 0, y: 0 },
      { x: 99, y: 139 },
      { x: 50, y: 70 },
      { x: 17.29, y: 64.73 },
    ]) {
      const restored = pickDiagram(projectDiagram(p, view), view)!;
      expect(restored.x).toBeCloseTo(p.x, 7);
      expect(restored.y).toBeCloseTo(p.y, 7);
    }
    expect(projectDiagram({ x: 50, y: 0 }, view).x).toBeGreaterThan(
      projectDiagram({ x: 50, y: 140 }, view).x,
    );
  });
});
