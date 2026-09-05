import { describe, expect, it } from "vitest";
import { recommendNextLoad } from "./strengthProgression";
import type { SetLog } from "./setLogs";

const set = (setNumber: number, weightKg: number, reps: number, rir: number): SetLog => ({
  setNumber,
  weightKg,
  reps,
  rir,
});

describe("progresja ciężaru bez 1RM", () => {
  it("kalibruje pierwszą sesję zamiast zgadywać maksymalny ciężar", () => {
    expect(recommendNextLoad([], "6–8", "2–3 RIR")).toMatchObject({
      decision: "calibrate",
      weightKg: null,
    });
  });

  it("zwiększa ciężar dopiero po wykonaniu górnego zakresu we wszystkich seriach", () => {
    const result = recommendNextLoad(
      [set(1, 80, 8, 2), set(2, 80, 8, 2), set(3, 80, 8, 2)],
      "6–8",
      "2–3 RIR",
    );
    expect(result).toMatchObject({ decision: "increase", weightKg: 82.5 });
  });

  it("powtarza ciężar, gdy cel jest wykonany, ale zakres nie został jeszcze domknięty", () => {
    const result = recommendNextLoad(
      [set(1, 80, 7, 2), set(2, 80, 6, 2), set(3, 80, 6, 2)],
      "6–8",
      "2–3 RIR",
    );
    expect(result).toMatchObject({ decision: "repeat", weightKg: 80 });
  });

  it("zmniejsza ciężar po braku wymaganych powtórzeń lub zapasu", () => {
    const result = recommendNextLoad([set(1, 80, 6, 2), set(2, 80, 5, 0)], "6–8", "2–3 RIR");
    expect(result).toMatchObject({ decision: "reduce", weightKg: 75 });
  });
});
