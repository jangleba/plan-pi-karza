import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { createJourney, journeyStep, chooseJourney } from "./journeyEngine";
import {
  lessonFocus,
  lessonInstruction,
  lessonOption,
  lessonPreviewAction,
  lessonPlaybackPoints,
} from "./lessonPresentation";
import { diagramView, projectDiagram, pickDiagram } from "./diagramGeometry";
describe("readable guided lesson", () => {
  it("describes every offered initial variant without declaring a right answer or mutating the match", () => {
    for (const definition of advancedJourneyBank) {
      const session = createJourney(definition),
        before = JSON.stringify(session),
        step = journeyStep(session);
      expect(lessonInstruction(session, step).situation).toContain("TY");
      for (const choice of step.choices) {
        const option = lessonOption(session, step, choice),
          focus = lessonFocus(session, choice),
          arrow = lessonPreviewAction(session, choice);
        expect(option.title).not.toMatch(/Miejsce|Korytarz|dobr|błęd|najlepsz/i);
        expect(option.detail.length).toBeGreaterThan(20);
        expect(focus.labelIds.length).toBeLessThanOrEqual(3);
        expect(arrow.to).toEqual(choice.point);
        expect(arrow.from).toEqual(session.world.positions.you);
      }
      expect(JSON.stringify(session)).toBe(before);
    }
  });
  it("makes a focused fallback view larger and keeps its touch projection accurate", () => {
    const points = [
        { x: 25, y: 50 },
        { x: 35, y: 40 },
        { x: 42, y: 55 },
      ],
      size = { width: 366, height: 300 };
    const wide = diagramView(points, size),
      close = diagramView(points, size, true);
    expect(close.scale).toBeGreaterThan(wide.scale);
    for (const p of points) {
      const mapped = pickDiagram(projectDiagram(p, close), close)!;
      expect(mapped.x).toBeCloseTo(p.x, 8);
      expect(mapped.y).toBeCloseTo(p.y, 8);
    }
  });
  it("frames the current recorded action instead of its entire earlier history", () => {
    const session = createJourney(advancedJourneyBank[0]),
      choice = journeyStep(session).choices.find((c) => c.quality === "good")!;
    const next = chooseJourney(session, choice.id);
    const points = lessonPlaybackPoints(next, 0, next.beats[0].duration);
    expect(points).toContainEqual(next.beats[0].from);
    expect(points).toContainEqual(next.beats[0].to);
    expect(lessonPlaybackPoints(next, 9999, 10000)).toEqual([]);
  });
});
