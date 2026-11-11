import { describe, expect, it, vi } from "vitest";
import { chooseMd1Variant } from "./md1Activation";
import { generatePlan } from "./planEngine";
import type { Goal, Profile, SessionDay } from "./types";

const base = (over: Partial<Profile> = {}): Profile =>
  ({
    name: "MD-1",
    age: 22,
    healthPersonalizationEnabled: false,
    position: "midfielder",
    level: "advanced",
    goal: "speed" as Goal,
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: "2026-11-14",
    equipment: ["dumbbells", "barbell"],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "pro",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 36,
    ...over,
  }) as unknown as Profile;

const md1Of = (profile: Profile): SessionDay => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  const day = generatePlan(profile, new Date("2026-11-09T00:00:00"), 14).find(
    (d) => d.mdLabel === "MD-1",
  );
  if (!day) throw new Error("brak dnia MD-1 w planie");
  return day;
};
const text = (day: SessionDay) =>
  JSON.stringify([day.title, day.sections.main, day.sections.accessory]).toLowerCase();

describe("wybór aktywacji MD-1 przez silnik", () => {
  it.each([
    ["siła z siłownią i historią", { goal: "strength" as Goal }, "gym"],
    ["moc z siłownią i historią", { goal: "power" as Goal }, "gym"],
    ["szybkość z boiskiem i siłownią", { goal: "speed" as Goal }, "pitch"],
    ["zwinność z boiskiem", { goal: "agility" as Goal }, "pitch"],
    [
      "siła bez historii treningowej",
      {
        goal: "strength" as Goal,
        strengthTrainingMonths: 2,
        gymExperienceLevel: "beginner" as const,
      },
      "pitch",
    ],
    ["siła bez siłowni", { goal: "strength" as Goal, hasGym: false }, "pitch"],
    ["siła z bólem", { goal: "strength" as Goal, painInjury: true }, "pitch"],
    ["bez boiska i siłowni", { hasGym: false, hasPitch: false }, "home"],
  ])("%s → %s", (_name, over, expected) => {
    expect(chooseMd1Variant(base(over as Partial<Profile>))).toBe(expected);
  });
});

describe("dzień MD-1 w wygenerowanym planie", () => {
  // Before this change the athlete got the pitch primer whatever the goal or gym access.
  it("siła z siłownią i historią: aktywacja siłowa bez piłki i sprintu", () => {
    const day = md1Of(base({ goal: "strength" }));
    expect(day.title).toMatch(/siłowni/);
    expect(text(day)).not.toMatch(/piłk|sprint|zryw|przyspiesz/);
    expect(day.intensity).toBe("niska");
  });

  it("szybkość z boiskiem: aktywacja boiskowa z submaksymalnymi zrywami", () => {
    const day = md1Of(base({ goal: "speed" }));
    expect(day.title).toMatch(/MD-1/);
    expect(text(day)).toMatch(/80%/);
    expect(JSON.stringify(day.sections.main)).not.toMatch(/90%|95%|100%|maksymal(?!ne)/);
  });

  it("bez boiska i siłowni: aktywacja bez sprzętu i bez sprintu", () => {
    const day = md1Of(base({ hasGym: false, hasPitch: false, goal: "speed" }));
    expect(day.title).toMatch(/bez sprzętu/);
    expect(text(day)).not.toMatch(/piłk|sprint|zryw|skok/);
  });
});

describe("MD-1 jest aktywacją we wszystkich kombinacjach celu i dostępu", () => {
  // Before this change 462 of 576 seeded combinations ended the day before the match as rest.
  it("cel × siłownia × boisko: dzień MD-1 ma wariant aktywacji", () => {
    const goals: Goal[] = [
      "speed",
      "strength",
      "power",
      "endurance",
      "agility",
      "general",
      "matchready",
      "mobility",
    ];
    const problems: string[] = [];
    for (const goal of goals)
      for (const hasGym of [true, false])
        for (const hasPitch of [true, false])
          for (const level of ["beginner", "intermediate", "advanced"] as const) {
            const day = md1Of(base({ goal, hasGym, hasPitch, level }));
            if (day.dayType !== "md-1")
              problems.push(`${goal} gym=${hasGym} pitch=${hasPitch} ${level}: ${day.dayType}`);
          }
    expect(problems).toEqual([]);
  }, 120000);
});
