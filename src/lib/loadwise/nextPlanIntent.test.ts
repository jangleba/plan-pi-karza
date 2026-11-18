import { describe, expect, it } from "vitest";
import { parseNextPlanIntent } from "./nextPlanIntent";

const intent = { planId: "previous-plan", minutes: 45, createdAt: "2026-11-17T10:00:00Z" };

describe("next plan duration intent", () => {
  it("keeps an already pending legacy numeric choice as an explicit limit", () => {
    expect(parseNextPlanIntent(intent)).toEqual({ ...intent, sessionDurationMode: "limited" });
  });

  it("normalizes legacy null minutes as full sessions", () => {
    expect(parseNextPlanIntent({ ...intent, minutes: null })).toEqual({
      ...intent,
      minutes: null,
      sessionDurationMode: "full",
    });
  });

  it("preserves explicit full mode even with a compatibility numeric field", () => {
    expect(parseNextPlanIntent({ ...intent, sessionDurationMode: "full" })).toEqual({
      ...intent,
      sessionDurationMode: "full",
    });
    expect(
      parseNextPlanIntent({ ...intent, minutes: null, sessionDurationMode: "full" }),
    ).toMatchObject({ minutes: null, sessionDurationMode: "full" });
  });

  it.each([
    { ...intent, sessionDurationMode: "unknown" },
    { ...intent, sessionDurationMode: "limited", minutes: null },
    { ...intent, minutes: Number.POSITIVE_INFINITY },
    { ...intent, minutes: 45.5 },
    { ...intent, minutes: 0 },
    { ...intent, minutes: undefined },
  ])("rejects invalid duration choices: %j", (value) => {
    expect(parseNextPlanIntent(value)).toBeUndefined();
  });
});
