import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { classifySession } from "./sessionClassification";
import { reduceSessionDose } from "./doseAdjustment";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import { isTrackableEnduranceRun } from "@/lib/running/session";
import type { Profile, SessionDay } from "./types";

/**
 * Każdy bieg w planie ma jedną recepturę, z której powstają opis i licznik.
 * Metoda zależy od tygodnia (klub, mecz, siła, sprint), nie od numeru sesji,
 * a test 5 min nigdy nie pojawia się sam.
 */

const MONDAY = new Date(2026, 10, 16);

const athlete = (patch: Partial<Profile> = {}): Profile =>
  ({
    name: "T",
    age: 22,
    position: "midfielder",
    level: "intermediate",
    goal: "endurance",
    secondaryLimiter: null,
    clubTrainingDays: [1, 3, 5],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21"],
    weeklyMatches: true,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...patch,
  }) as Profile;

const offseason: Partial<Profile> = {
  weeklyMatches: false,
  usualMatchDay: "no_fixed_day",
  matchDate: null,
  matchDates: [],
  seasonPhase: "offseason",
};

const PROFILES: Array<[string, Partial<Profile>]> = [
  ["dorosły, wydolność, sezon", {}],
  ["dorosły, wydolność, okres bazowy", offseason],
  ["dorosły bez siłowni, baza", { ...offseason, hasGym: false, clubTrainingDays: [2, 4] }],
  [
    "dorosły zaawansowany, gotowość meczowa",
    { goal: "matchready", level: "advanced", clubTrainingDays: [2, 4] },
  ],
  ["16 lat, wydolność", { age: 16, clubTrainingDays: [2, 4] }],
  ["14 lat, szybkość", { age: 14, goal: "speed" }],
  ["11 lat, ogólny, początkujący", { age: 11, goal: "general", level: "beginner" }],
  [
    "dorosły, przedsezon",
    {
      ...offseason,
      matchDates: ["2026-12-10"],
      matchDate: "2026-12-10",
      seasonPhase: "preseason",
      goal: "matchready",
      level: "advanced",
      age: 25,
    },
  ],
  ["dorosły z bólem kolana", { painLocations: ["knee"] }],
];

const runs = (plan: SessionDay[]) =>
  plan.flatMap((day) =>
    ([day, day.secondSession].filter(Boolean) as SessionDay[])
      .filter(
        (s) =>
          isTrackableEnduranceRun(s) && classifySession(s).category === "endurance_conditioning",
      )
      .filter((s) => !/rower|basen|bike|pool/i.test(s.title))
      .map((session) => ({ day, session })),
  );

describe.each(PROFILES)("receptury biegu — %s", (_name, patch) => {
  const plan = generatePlan(athlete(patch), MONDAY, 14);
  const list = runs(plan);

  it("każdy bieg ma recepturę; opis, czas i licznik pochodzą z tych samych liczb", () => {
    for (const { session } of list) {
      const recipe = session.runningRecipe!;
      expect(recipe, `${session.date} ${session.title}`).toBeDefined();
      expect(session.durationMin).toBe(Math.ceil(recipeTotalSeconds(recipe) / 60));
      const protocol = deriveRunningIntervalProtocol(session)!;
      expect(protocol.recipeId).toBe(recipe.id);
      const timed = protocol.steps.reduce((sum, step) => sum + (step.target.value ?? 0), 0);
      expect(timed).toBe(recipeTotalSeconds(recipe));
      expect(session.sections.warmup.length).toBeGreaterThan(0);
      expect(session.sections.cooldown.length).toBeGreaterThan(0);
    }
  });

  it("test 5 min nigdy nie jest planowany automatycznie", () => {
    for (const { session } of list) {
      expect(session.runningRecipe?.method).not.toBe("field_mas_test");
      expect(classifySession(session).subcategory).not.toBe("field_mas_test");
    }
  });

  it("bez wyniku testu sesje są prowadzone czasem i odczuciem, bez tempa min/km", () => {
    for (const { session } of list) {
      expect(session.runningRecipe?.paceSource).toBe("effort");
      expect(session.sections.main.map((e) => e.prescription).join(" ")).not.toMatch(/\/km/);
    }
  });

  it("mocny bieg nigdy dzień przed meczem ani dzień po meczu", () => {
    for (const { day, session } of list) {
      if (day.mdLabel === "MD-1" || day.mdLabel === "MD+1")
        expect(session.runningRecipe?.loadLevel, session.date).not.toBe("high");
    }
  });

  it("dzień ma najwyżej dwie sesje", () => {
    for (const day of plan)
      expect([day, day.secondSession].filter(Boolean).length).toBeLessThanOrEqual(2);
  });
});

describe("receptury biegu — zależności", () => {
  it("ból kolana daje tylko spokojny bieg", () => {
    for (const { session } of runs(generatePlan(athlete({ painLocations: ["knee"] }), MONDAY, 14)))
      expect(session.runningRecipe?.method).toBe("easy_continuous");
  });

  it("aktualny test 5 min daje tempo dla mierzalnych odcinków", () => {
    const plan = generatePlan(
      athlete({
        ...offseason,
        hasGym: false,
        clubTrainingDays: [2, 4],
        fieldMasKmh: 15,
        fieldMasTestedAt: "2026-11-10",
      }),
      MONDAY,
      14,
    );
    const paced = runs(plan).filter(
      ({ session }) => session.runningRecipe?.paceSource === "field_mas",
    );
    expect(paced.length).toBeGreaterThan(0);
    for (const { session } of paced)
      expect(session.sections.main.map((e) => e.prescription).join(" ")).toMatch(/\/km/);
  });

  it("w tygodniu nie ma sztywnej rotacji: kolejne mocne biegi to różne metody", () => {
    const plan = generatePlan(
      athlete({ ...offseason, hasGym: false, clubTrainingDays: [2, 4] }),
      MONDAY,
      7,
    );
    const hard = runs(plan)
      .map(({ session }) => session.runningRecipe!)
      .filter((r) => r.loadLevel === "high");
    expect(new Set(hard.map((r) => r.method)).size).toBe(hard.length);
  });

  it("„mam mniej czasu” skraca bieg przez recepturę — licznik i opis zgadzają się dalej", () => {
    const [{ session }] = runs(generatePlan(athlete(offseason), MONDAY, 14));
    const reduced = reduceSessionDose(session, 0.6);
    expect(reduced.runningRecipe!.id).not.toBe(session.runningRecipe!.id);
    const protocol = deriveRunningIntervalProtocol(reduced)!;
    expect(protocol.steps.reduce((sum, s) => sum + (s.target.value ?? 0), 0)).toBe(
      recipeTotalSeconds(reduced.runningRecipe!),
    );
    expect(reduced.durationMin).toBeLessThan(session.durationMin);
  });
});
