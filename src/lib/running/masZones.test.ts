import { describe, expect, it } from "vitest";
import { buildEnduranceForDate } from "@/lib/loadwise/engineV2/endurance";
import type { Profile } from "@/lib/loadwise/types";
import { calculateFieldMasKmh } from "./engine";
import { MAS_ZONES, masResultSummary, masTrainingPaces } from "./masZones";

const athlete = {
  name: "MAS",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  fieldMasKmh: 14.4,
  fieldMasTestedAt: "2026-11-01",
  fieldMasSourceSessionId: "5f261acf-d1d6-4f50-9513-2fb027932041",
  runningProgressionLevel: 0,
} as unknown as Profile;

describe("training paces from the 5-minute test", () => {
  it("turns the distance of 5 minutes into MAS and its pace", () => {
    const kmh = calculateFieldMasKmh(1200)!;
    expect(kmh).toBe(14.4);
    expect(masResultSummary(1200, kmh)).toEqual({
      distanceM: 1200,
      masKmh: 14.4,
      paceSecPerKm: 250,
    });
    expect(calculateFieldMasKmh(400)).toBeNull(); // too short to be a valid test
  });

  it("derives aerobic, tempo, interval and short high-intensity paces in order of speed", () => {
    const paces = masTrainingPaces(14.4)!;
    expect(paces.map((z) => z.id)).toEqual(["easy", "tempo", "aerobicIntervals", "shortHiit"]);
    for (let i = 1; i < paces.length; i++)
      expect(paces[i].pace.fastestSecPerKm).toBeLessThan(paces[i - 1].pace.fastestSecPerKm);
    expect(paces.find((z) => z.id === "shortHiit")!.pace.label).toBe("3:58–4:10/km");
    expect(masTrainingPaces(null)).toBeNull();
    expect(masTrainingPaces(0)).toBeNull();
  });

  it("the shown paces are exactly the paces written into the plan's runs", () => {
    const paces = masTrainingPaces(athlete.fieldMasKmh)!;
    // One week of each method in the rotation.
    for (const [date, zone] of [
      ["2026-11-16", "tempo"],
      ["2026-11-23", "aerobicIntervals"],
      ["2026-11-09", "shortHiit"],
    ] as const) {
      const recipe = buildEnduranceForDate(athlete, date, "development")!.runningRecipe!;
      const intensity = recipe.blocks[0].intensity;
      expect(intensity.masPercent).toEqual(MAS_ZONES[zone].percent);
      expect(intensity.pace?.label).toBe(paces.find((z) => z.id === zone)!.pace.label);
    }
  });
});
