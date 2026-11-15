import { describe, expect, it } from "vitest";
import { drillBoard, FIELD_TARGETS } from "./drillBoard";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "../loadwise/individualFootballDrills";

describe("Canonical football instructions → pitch board", () => {
  it.each(INDIVIDUAL_FOOTBALL_DRILLS.map((d) => [d.id]))(
    "covers %s without inventing a different drill",
    (id) => {
      const board = drillBoard(id)!;
      const original = INDIVIDUAL_FOOTBALL_DRILLS.find((d) => d.id === id)!;
      expect(board.area).toBe(original.steps[0]);
      expect(board.path.length).toBeGreaterThan(1);
      for (const point of [...board.markers, ...board.path])
        for (const n of point) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(100);
        }
    },
  );
  it("never presents a generic geometry for an unknown exercise", () => {
    expect(drillBoard("squat")).toBeNull();
    expect(drillBoard(undefined)).toBeNull();
  });
  it("keeps spatial cues unambiguous and reserves reactive variations for suitable drills", () => {
    expect(new Set(FIELD_TARGETS.map((t) => t.color)).size).toBe(4);
    expect(new Set(FIELD_TARGETS.map((t) => t.direction)).size).toBe(4);
    expect(drillBoard("football_slalom_time")?.reactive).toBe(false);
    expect(drillBoard("football_scan_control")?.reactive).toBe(true);
  });
});
