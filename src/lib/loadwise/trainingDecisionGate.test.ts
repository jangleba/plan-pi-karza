import { describe, expect, it } from "vitest";
import { canOpenTrainingSession, resolveTrainingDecisionMode } from "./trainingDecisionGate";

describe("training decision gate", () => {
  it("otwiera dzisiejszą sesję bez obowiązkowego check-inu", () => {
    const mode = resolveTrainingDecisionMode({
      isToday: true,
      hasTodayCheckin: false,
    });

    expect(mode).toBe("planned");
    expect(canOpenTrainingSession(mode)).toBe(true);
  });

  it("otwiera sesję po potwierdzeniu dzisiejszego planu", () => {
    const mode = resolveTrainingDecisionMode({
      isToday: true,
      hasTodayCheckin: true,
    });

    expect(mode).toBe("confirmed");
    expect(canOpenTrainingSession(mode)).toBe(true);
  });

  it("nie wymaga dzisiejszego check-inu przy podglądzie innej daty", () => {
    expect(
      resolveTrainingDecisionMode({
        isToday: false,
        hasTodayCheckin: false,
      }),
    ).toBe("other_day");
  });
});
