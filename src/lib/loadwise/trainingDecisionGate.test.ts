import { describe, expect, it } from "vitest";
import {
  canOpenTrainingSession,
  resolveTrainingDecisionMode,
} from "./trainingDecisionGate";

describe("training decision gate", () => {
  it("wymaga codziennego check-inu przed dzisiejszą sesją", () => {
    const mode = resolveTrainingDecisionMode({
      isToday: true,
      hasTodayCheckin: false,
    });

    expect(mode).toBe("checkin_required");
    expect(canOpenTrainingSession(mode)).toBe(false);
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
