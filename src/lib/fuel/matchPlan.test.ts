import { describe, expect, it } from "vitest";
import { kickoffFrom, matchFuelPlan, type MatchFuelInput } from "./matchPlan";

const kickoff = kickoffFrom("2026-11-15", "16:00")!;
const H = 3_600_000;
const plan = (o: Partial<MatchFuelInput> = {}) =>
  matchFuelPlan({
    kickoff,
    participation: "full",
    lastMealAt: null,
    tolerance: "good",
    now: kickoff - 5 * H,
    weightKg: 70,
    age: 22,
    ...o,
  });
const step = (p: ReturnType<typeof plan>, id: string) => p.steps.find((s) => s.id === id)!;

describe("match-day fuelling plan", () => {
  it("lays out the meal 3–4 h before, a top-up, optional fuel during play and recovery", () => {
    const p = plan();
    expect(p.steps.map((s) => s.id)).toEqual([
      "pre_meal",
      "pre_snack",
      "during",
      "post_snack",
      "post_meal",
    ]);
    expect(step(p, "pre_meal").when).toMatch(/^12:30/);
    expect(step(p, "pre_meal").portion).toBe("70–140 g węglowodanów");
    expect(step(p, "during").optional).toBe(true);
    expect(step(p, "post_snack").portion).toContain("g białka");
    expect(p.current?.id).toBe("pre_meal");
    expect(p.current?.status).toBe("next");
  });

  it("follows the clock: now is the step whose window is open", () => {
    expect(plan({ now: kickoff - 3 * H }).current?.id).toBe("pre_meal");
    expect(plan({ now: kickoff - 60 * 60_000 }).current?.id).toBe("pre_snack");
    expect(plan({ now: kickoff + 30 * 60_000 }).current?.id).toBe("during");
    expect(plan({ now: kickoff + 2 * H }).current?.id).toBe("post_snack");
  });

  it("uses the time since the last meal", () => {
    const hungry = plan({ now: kickoff - 2 * H, lastMealAt: kickoff - 7 * H });
    expect(step(hungry, "pre_snack").optional).toBe(false);
    expect(step(hungry, "pre_snack").why).toContain("5 h");
    const fed = plan({ now: kickoff - 3 * H, lastMealAt: kickoff - 3.5 * H });
    expect(step(fed, "pre_meal").optional).toBe(true);
  });

  it("food tolerance: earlier meal, no solid snack, nothing new during the match", () => {
    const p = plan({ tolerance: "sensitive" });
    expect(step(p, "pre_meal").when).toMatch(/^12:00/);
    expect(step(p, "pre_snack").portion).toContain("napoju");
    expect(step(p, "during").why).toContain("treningu");
  });

  it("expected participation: the bench still fuels before, smaller recovery after", () => {
    const p = plan({ participation: "bench" });
    expect(step(p, "pre_meal").why).toContain("wejść");
    expect(step(p, "during").portion).toContain("Woda");
    expect(step(p, "post_snack").why).toContain("Mniej minut");
  });

  it("no kick-off time or body mass: portions and a clear note", () => {
    const p = plan({ kickoff: null, weightKg: null, participation: null, tolerance: null });
    expect(p.precision).toBe("portions");
    expect(step(p, "pre_meal").portion).toContain("talerza");
    expect(p.notes.join(" ")).toContain("godzinę meczu");
    expect(p.notes.join(" ")).toContain("pełny udział");
  });

  it("under 16: portions even with a body mass", () => {
    expect(plan({ age: 15 }).precision).toBe("portions");
  });

  it("a moved kick-off moves every step", () => {
    const later = plan({ kickoff: kickoff + 2 * H });
    expect(step(later, "pre_meal").when).toMatch(/^14:30/);
  });
});
