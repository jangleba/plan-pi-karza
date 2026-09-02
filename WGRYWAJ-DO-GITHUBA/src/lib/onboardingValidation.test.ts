import { describe, expect, it } from "vitest";
import { isScheduleStepComplete } from "./onboardingValidation";

describe("isScheduleStepComplete", () => {
  it("pozwala przejść dalej bez daty meczu", () => {
    expect(
      isScheduleStepComplete({ doubleSessions: "no", matchDate: null }),
    ).toBe(true);
  });

  it("nadal wymaga odpowiedzi o podwójnych sesjach", () => {
    expect(
      isScheduleStepComplete({ doubleSessions: null, matchDate: "2026-09-12" }),
    ).toBe(false);
  });
});
