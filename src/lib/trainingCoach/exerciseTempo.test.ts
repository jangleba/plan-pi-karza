import { describe, expect, it } from "vitest";
import {
  boxTouchVariant,
  createTempoPlan,
  parseExerciseTempo,
  parseHoldSeconds,
  tempoFrameAt,
  type TempoProfile,
} from "./exerciseTempo";
const squat: TempoProfile = {
  kind: "rep",
  eccentric: [0, 0.44],
  concentric: [0.56, 1],
  bottom: 0.5,
  top: 0,
  eccentricLabel: "Zejście",
  concentricLabel: "Wstawanie",
};
describe("prescribed exercise cadence", () => {
  it("reads 3/4 phases, decimal seconds, unicode dashes and X without adding a pause", () => {
    expect(parseExerciseTempo("3–0–1")?.values).toEqual([3, 0, 1, 0]);
    expect(parseExerciseTempo("Tempo: 2,5-0-X-0")?.values).toEqual([2.5, 0, "X", 0]);
    const fractional = createTempoPlan({ tempoProfile: squat }, "2,5-0-1-0")!;
    expect(tempoFrameAt(fractional, 0).count).toBe(2.5);
    for (const value of [
      "3-1",
      "3-X-1-0",
      "3-0-0-0",
      "0-0-1-0",
      "99-0-1-0",
      "3-0-1-0-1",
      "<script>",
      "Infinity-0-1-0",
    ])
      expect(parseExerciseTempo(value), value).toBeNull();
  });
  it("counts 3 seconds down and 1 up, with an immediate transition at the bottom", () => {
    const plan = createTempoPlan({ tempoProfile: squat }, "3-0-1-0")!;
    expect(plan.totalMs).toBe(4000);
    expect(plan.segments.map((s) => s.key)).toEqual(["eccentric", "concentric"]);
    expect(tempoFrameAt(plan, 0)).toMatchObject({ key: "eccentric", count: 3, modelPhase: 0 });
    expect(tempoFrameAt(plan, 0.25)).toMatchObject({ key: "eccentric", count: 2 });
    expect(tempoFrameAt(plan, 0.5)).toMatchObject({ key: "eccentric", count: 1 });
    expect(tempoFrameAt(plan, 0.75)).toMatchObject({
      key: "concentric",
      count: 1,
      modelPhase: 0.56,
    });
  });
  it("honours both explicitly prescribed pauses", () => {
    const plan = createTempoPlan({ tempoProfile: squat }, "3-1-1-2")!;
    expect(plan.totalMs).toBe(7000);
    expect(tempoFrameAt(plan, 3.2 / 7)).toMatchObject({ key: "bottom", count: 1, modelPhase: 0.5 });
    expect(tempoFrameAt(plan, 5.2 / 7)).toMatchObject({ key: "top", count: 2, modelPhase: 0 });
  });
  it("does not turn an explosive intention into a mandatory second", () => {
    const plan = createTempoPlan({ tempoProfile: squat }, "3-0-X-0")!;
    const frame = tempoFrameAt(plan, 3.1 / (plan.totalMs / 1000));
    expect(frame).toMatchObject({ key: "concentric", count: null, dynamic: true });
    expect(plan.phases.find((p) => p.key === "concentric")?.value).toBe("X");
  });
  it("maps the eccentric phase correctly when the animation begins with lifting", () => {
    const profile = {
      ...squat,
      startWith: "concentric" as const,
      eccentric: [0.56, 1] as [number, number],
      concentric: [0, 0.44] as [number, number],
      bottom: 0,
      top: 0.5,
    };
    const plan = createTempoPlan({ tempoProfile: profile }, "3-0-1")!;
    expect(tempoFrameAt(plan, 0)).toMatchObject({ key: "concentric", modelPhase: 0, count: 1 });
    expect(tempoFrameAt(plan, 0.25)).toMatchObject({
      key: "eccentric",
      modelPhase: 0.56,
      count: 3,
    });
  });
  it("counts a clear hold once, ending at zero without pretending a repetition occurred", () => {
    expect(parseHoldSeconds("30 s / stronę")).toBe(30);
    expect(parseHoldSeconds("1,5 min")).toBe(90);
    for (const value of ["30", "30 m", "20–30 s", "3 × 30 s", "0 s", "301 s"])
      expect(parseHoldSeconds(value), value).toBeNull();
    const plan = createTempoPlan({ tempoProfile: { kind: "hold" } }, null, { holdSeconds: 30 })!;
    expect(tempoFrameAt(plan, 0.5)).toMatchObject({ count: 15, complete: false, modelPhase: 0.5 });
    expect(tempoFrameAt(plan, 1)).toMatchObject({ count: 0, complete: true, modelPhase: 0.5 });
  });
  it("keeps lunge setup separate from timed lowering and rising", () => {
    const plan = createTempoPlan(
      {
        tempoProfile: {
          ...squat,
          eccentric: [0.2, 0.5],
          concentric: [0.5, 0.8],
          setup: [0, 0.2],
          finish: [0.8, 0.999],
        },
      },
      "3-0-1",
    )!;
    expect(plan.totalMs).toBe(5600);
    expect(tempoFrameAt(plan, 0.4 / 5.6)).toMatchObject({
      key: "setup",
      count: null,
      dynamic: false,
    });
    expect(tempoFrameAt(plan, 0.8 / 5.6)).toMatchObject({ key: "eccentric", count: 3 });
  });
  it("does not time an unsupported drill or invent missing tempo", () => {
    expect(createTempoPlan({}, "3-0-1")).toBeNull();
    expect(createTempoPlan({ tempoProfile: squat }, null)).toBeNull();
    expect(createTempoPlan({ tempoProfile: { kind: "hold" } }, "3-0-1")).toBeNull();
  });
  it("keeps the return of an eccentric-only Nordic explicitly assisted", () => {
    const plan = createTempoPlan(
      { tempoProfile: { kind: "eccentric-only", eccentric: [0, 0.6], bottom: 0.6 } },
      "3-0-1",
    )!;
    expect(plan.segments.map((s) => s.key)).toEqual(["eccentric", "assisted-return"]);
    expect(tempoFrameAt(plan, 0.85)).toMatchObject({
      key: "assisted-return",
      count: null,
      dynamic: false,
    });
  });
  it("does not confuse an alternative with the box variant actually chosen", () => {
    expect(boxTouchVariant("Przysiad ze sztangą do skrzyni")).toBe("box_touch");
    expect(boxTouchVariant("Goblet squat / przysiad do skrzyni")).toBeNull();
    expect(boxTouchVariant("Przysiad", "box_touch")).toBe("box_touch");
  });
});
