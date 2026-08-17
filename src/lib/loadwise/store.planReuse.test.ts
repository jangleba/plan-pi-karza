import { describe, expect, it } from "vitest";
import { PLAN_ENGINE_VERSION } from "./planEngine";
import { shouldReusePersistedPlan } from "./store";
import type { Profile, SessionDay } from "./types";

function makeDay(date: string): SessionDay {
  return {
    date,
    dayName: "Poniedziałek",
    dayType: "rest",
    title: "Rest",
    goalLabel: "",
    intensity: "niska",
    durationMin: 20,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Regeneracja",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    generatorVersion: PLAN_ENGINE_VERSION,
  } as SessionDay;
}

describe("persisted plan reuse", () => {
  it("does not require dbId to reuse valid persisted monthly plan", () => {
    const plan = Array.from({ length: 14 }, (_, i) =>
      makeDay(`2026-08-${String(i + 1).padStart(2, "0")}`),
    );
    const profile = {
      clubTrainingDays: [],
    } as unknown as Profile;

    expect(shouldReusePersistedPlan(plan, profile)).toBe(true);
  });
});
