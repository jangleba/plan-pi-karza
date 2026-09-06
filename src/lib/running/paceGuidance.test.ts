import { describe, expect, it } from "vitest";
import { classifyPace, vibrationForPace } from "./paceGuidance";

describe("prowadzenie tempem", () => {
  it("daje dwa krótkie impulsy, gdy zawodnik ma przyspieszyć", () => {
    expect(classifyPace(285, 250, 270)).toBe("speed_up");
    expect(vibrationForPace("speed_up")).toEqual([90, 70, 90]);
  });

  it("daje jeden długi impuls, gdy zawodnik ma zwolnić", () => {
    expect(classifyPace(235, 250, 270)).toBe("slow_down");
    expect(vibrationForPace("slow_down")).toEqual([650]);
  });

  it("nie wibruje w zakresie ani przy braku wiarygodnego tempa", () => {
    expect(classifyPace(260, 250, 270)).toBe("on_target");
    expect(classifyPace(null, 250, 270)).toBe("unavailable");
    expect(vibrationForPace("on_target")).toBeNull();
  });
});
