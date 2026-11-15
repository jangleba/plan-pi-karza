import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { manualFuelContext, planFuelContexts } from "./experience";
import { fuelDayPriority, sessionRecipeScore } from "./guidance";
import { sessionKindFrom } from "./planAdapter";

describe("Match preparation independent of today's activity", () => {
  it("retains a match with no entered duration, without inventing minutes", () => {
    const day = sessionFixture({ dayType: "match", durationMin: 0 });
    expect(sessionKindFrom(day)).toBe("match");
    expect(planFuelContexts([day], day.date, {})).toEqual([
      expect.objectContaining({ kind: "match", durationMin: null }),
    ]);
  });
  it.each(["none", "recovery", "strength"] as const)(
    "keeps tomorrow's match visible on a %s day",
    (kind) => {
      const context = {
        ...manualFuelContext("2026-11-15", kind, null, "low"),
        tomorrowMatch: true,
      };
      expect(fuelDayPriority(context, { phase: "ordinary", startsAt: null }).title).toContain(
        "Jutro mecz",
      );
      expect(
        sessionRecipeScore(context, { phase: "ordinary", startsAt: null }, [
          { foodId: "bread", grams: 100 },
        ]),
      ).toBeGreaterThan(
        sessionRecipeScore(context, { phase: "ordinary", startsAt: null }, [
          { foodId: "eggs", grams: 100 },
        ]),
      );
    },
  );
  it("does not replace immediate during-session guidance with a large meal", () => {
    const context = {
      ...manualFuelContext("2026-11-15", "football", 60, "moderate"),
      tomorrowMatch: true,
    };
    expect(fuelDayPriority(context, { phase: "training", startsAt: null }).title).toBe(
      "W trakcie wysiłku",
    );
  });
});
