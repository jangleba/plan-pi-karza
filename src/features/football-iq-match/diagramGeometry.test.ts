import { describe, expect, it } from "vitest";
import { diagramView, pickDiagram, placeDiagramLabels, projectDiagram } from "./diagramGeometry";
import { journeyBank } from "./journeyBank";
import { createJourney, journeyCameraPoints, journeyFrame, journeyStep } from "./journeyEngine";
import type { DiagramLabel } from "./diagramGeometry";

describe("tactical diagram geometry", () => {
  it("preserves both axes and maps touches back through a crop after resize", () => {
    for (const size of [
      { width: 296, height: 220 },
      { width: 366, height: 380 },
      { width: 520, height: 240 },
    ]) {
      const view = diagramView(
        [
          { x: 20, y: 48 },
          { x: 90, y: 12 },
        ],
        size,
      );
      const p = { x: 43.25, y: 38.125 },
        origin = projectDiagram(p, view);
      const dx = projectDiagram({ x: p.x + 5, y: p.y }, view).x - origin.x;
      const dy = projectDiagram({ x: p.x, y: p.y + 5 }, view).y - origin.y;
      expect(dx).toBeCloseTo(dy, 8);
      expect(pickDiagram(origin, view)?.x).toBeCloseTo(p.x, 8);
      expect(pickDiagram(origin, view)?.y).toBeCloseTo(p.y, 8);
      expect(pickDiagram(projectDiagram({ x: -1, y: 40 }, view), view)).toBeNull();
      expect(pickDiagram(projectDiagram({ x: 50, y: 141 }, view), view)).toBeNull();
    }
  });
  it("moves only badges, keeping close opponents and the ball at their real anchors", () => {
    const size = { width: 296, height: 220 };
    const items: DiagramLabel[] = [
      { id: "you", anchor: { x: 130, y: 120 }, kind: "player", priority: 1, interactive: false },
      {
        id: "opponent",
        anchor: { x: 132, y: 123 },
        kind: "player",
        priority: 3,
        interactive: false,
      },
      {
        id: "target",
        anchor: { x: 133, y: 122 },
        kind: "destination",
        priority: 0,
        interactive: true,
      },
    ];
    const original = JSON.stringify(items);
    const placed = [...placeDiagramLabels(items, size, { x: 131, y: 125 }).values()];
    for (const a of placed) {
      expect(a.anchor).toEqual(items.find((item) => item.id === a.id)!.anchor);
      for (const b of placed)
        if (a.id !== b.id) {
          expect(
            Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y),
          ).toBeGreaterThanOrEqual(a.radius + b.radius);
        }
    }
    expect(JSON.stringify(items)).toBe(original);
  });
  it("frames all 480 starting situations and keeps visible numbers and choices apart on phones", () => {
    expect(journeyBank).toHaveLength(480);
    for (const size of [
      { width: 296, height: 114 },
      { width: 296, height: 200 },
      { width: 366, height: 300 },
      { width: 456, height: 420 },
    ]) {
      for (const definition of journeyBank) {
        const session = createJourney(definition),
          frame = journeyFrame(session.world, session.players);
        const step = journeyStep(session);
        const destinations = ["pass", "finish", "transition"].includes(step.kind)
          ? []
          : step.choices;
        const view = diagramView([...journeyCameraPoints(session), frame.ballVisual], size);
        const targets = step.choices.flatMap((c) => (c.targetId ? [c.targetId] : []));
        const players = session.players.filter((p) => {
          const anchor = projectDiagram(frame.positions.get(p.id)!, view);
          return (
            anchor.x >= 0 && anchor.x <= size.width && anchor.y >= 0 && anchor.y <= size.height
          );
        });
        const items: DiagramLabel[] = players.map((p) => ({
          id: p.id,
          anchor: projectDiagram(frame.positions.get(p.id)!, view),
          kind: "player",
          priority: p.controlled ? 1 : targets.includes(p.id) ? 2 : 3,
          interactive: targets.includes(p.id),
        }));
        items.push(
          ...destinations.map((d) => ({
            id: d.id,
            anchor: projectDiagram(d.point, view),
            kind: "destination" as const,
            priority: 0,
            interactive: true,
          })),
        );
        const placed = [
          ...placeDiagramLabels(items, size, projectDiagram(frame.ballVisual, view)).values(),
        ];
        for (const a of placed) {
          expect(a.center.x, definition.id).toBeGreaterThanOrEqual(a.radius);
          expect(a.center.x + a.radius, definition.id).toBeLessThanOrEqual(size.width);
          expect(a.center.y, definition.id).toBeGreaterThanOrEqual(a.radius);
          expect(a.center.y + a.radius, definition.id).toBeLessThanOrEqual(size.height);
          for (const b of placed)
            if (a.id !== b.id) {
              const drawnRadiusA = a.kind === "destination" ? 22 : a.id === "you" ? 16 : 14;
              const drawnRadiusB = b.kind === "destination" ? 22 : b.id === "you" ? 16 : 14;
              expect(
                Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y),
                `${definition.id}: ${a.id}/${b.id}`,
              ).toBeGreaterThanOrEqual(drawnRadiusA + drawnRadiusB);
            }
        }
      }
    }
  });
});
