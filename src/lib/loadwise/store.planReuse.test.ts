import { describe, expect, it } from "vitest";
import { PLAN_ENGINE_VERSION } from "./planEngine";
import { shouldReusePersistedPlan } from "./store";
import { addDays, isoDate, localToday } from "./labels";
import type { Profile, SessionDay } from "./types";

function makeDay(date: string, revision: string): SessionDay {
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
    canonicalRevision: revision,
    canonicalSchemaVersion: 1,
  } as SessionDay;
}

describe("persisted plan reuse", () => {
  it("does not require dbId to reuse valid persisted monthly plan", () => {
    const revision = "2026-08-17T10:00:00.000Z";
    const start = addDays(localToday(), -7);
    const plan = Array.from({ length: 21 }, (_, i) =>
      makeDay(isoDate(addDays(start, i)), revision),
    );
    const profile = {
      clubTrainingDays: [],
      onboardingRevision: revision,
    } as unknown as Profile;

    expect(shouldReusePersistedPlan(plan, profile)).toBe(true);
  });

  it("requires regeneration when plan revision differs from profile revision", () => {
    const start = addDays(localToday(), -7);
    const plan = Array.from({ length: 21 }, (_, i) =>
      makeDay(isoDate(addDays(start, i)), "2026-08-17T10:00:00.000Z"),
    );
    const profile = {
      clubTrainingDays: [],
      onboardingRevision: "2026-08-17T12:00:00.000Z",
    } as unknown as Profile;

    expect(shouldReusePersistedPlan(plan, profile)).toBe(false);
  });
});
