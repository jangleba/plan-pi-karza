import { describe, expect, it } from "vitest";
import {
  generateFootballSpeedSession,
  type FootballSpeedFamily,
} from "./footballSpeedSessionEngine";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getExerciseDefinition,
  getFootballSpeedCatalog,
  isExerciseAllowedForProfile,
} from "./exerciseLibrary";
import type { Profile } from "./types";

const FAMILIES: FootballSpeedFamily[] = [
  "acceleration",
  "maximum_velocity",
  "curved_sprinting",
  "deceleration_cod",
  "reactive_agility_reacceleration",
];
const SKIP_IDS = ["a_skip", "b_skip", "c_skip", "d_skip"];
const PLYO_RANK = { none: 0, low: 1, moderate: 2, high: 3, very_high: 4 } as const;

function profile(age: number, level: "beginner" | "intermediate" | "advanced"): Profile {
  return {
    age,
    level,
    goal: "speed",
    clubTrainingDays: [],
    hasGym: false,
    equipment: [],
    homeEquipment: [],
    hasSprintSpace: true,
    hasPitch: true,
    painInjury: false,
  } as unknown as Profile;
}

function technicalDrills(
  p: Profile,
  family: FootballSpeedFamily,
  extra: { readiness?: number; progressionWeek?: number } = {},
) {
  return generateFootballSpeedSession({
    profile: p,
    date: "2026-11-05",
    family,
    ...extra,
  }).exercises.filter((e) => e.role === "technical");
}

describe("sprint technical drills audit", () => {
  for (const age of [10, 12, 13, 14, 16, 18, 25])
    for (const level of ["beginner", "intermediate", "advanced"] as const)
      for (const readiness of [undefined, 5, 7])
        it(`gates every drill by profile (age ${age}, ${level}, readiness ${readiness ?? "-"})`, () => {
          const p = profile(age, level);
          const athlete = buildAthleteTrainingProfile(p, {}, { readiness });
          for (const family of FAMILIES)
            for (const week of [1, 2]) {
              const drills = technicalDrills(p, family, { readiness, progressionWeek: week });
              const ids = drills.map((d) => d.exerciseId);
              expect(new Set(ids).size, `${family}: ${ids}`).toBe(ids.length);
              for (const drill of drills) {
                const def = getExerciseDefinition(drill.exerciseId)!;
                expect(SKIP_IDS, `${family}: ${drill.exerciseId}`).not.toContain(def.id);
                expect(
                  isExerciseAllowedForProfile(def, athlete).reasons,
                  `${family}: ${drill.exerciseId}`,
                ).toEqual([]);
                if (readiness === 5)
                  expect(PLYO_RANK[def.plyometricIntensity], drill.exerciseId).toBeLessThan(2);
                if (age < 15 || level === "beginner" || (readiness ?? 10) <= 7)
                  expect(drill.dose, drill.exerciseId).not.toMatch(/^2\s*[–-]\s*3\s*×/);
              }
            }
        });

  it("keeps bounds for an adult advanced player and regresses them for a 13-year-old", () => {
    const adult = technicalDrills(profile(22, "advanced"), "acceleration", {
      progressionWeek: 2,
    }).map((d) => d.exerciseId);
    const youth = technicalDrills(profile(13, "intermediate"), "acceleration", {
      progressionWeek: 2,
    }).map((d) => d.exerciseId);
    expect(adult).toContain("alternate_leg_bounds");
    expect(youth).not.toContain("alternate_leg_bounds");
    expect(youth).toHaveLength(3);
  });

  it("classifies bounds and scissor jumps like the matching plyometric exercises", () => {
    const rank = (id: string) => PLYO_RANK[getExerciseDefinition(id)!.plyometricIntensity];
    expect(rank("scissor_bounds")).toBe(rank("split_squat_jump"));
    expect(rank("scissor_exchange_jump")).toBe(rank("split_squat_jump"));
    expect(rank("alternate_leg_bounds")).toBeGreaterThanOrEqual(rank("lateral_bound_to_stick"));
    expect(rank("skip_b_alternate_bounds")).toBeGreaterThanOrEqual(rank("lateral_bound_to_stick"));
    for (const id of ["alternate_leg_bounds", "skip_b_alternate_bounds", "scissor_bounds"]) {
      expect(getExerciseDefinition(id)!.allowedForYouth, id).toBe(false);
      expect(getExerciseDefinition(id)!.regressionIds.length, id).toBeGreaterThan(0);
    }
  });

  it("gives every technique drill its own instructions and a Polish name", () => {
    const placeholders = [
      "Wykonuj ruch rytmicznie i naturalnie",
      "Wykonaj ruch rytmicznie, zachowując wysokie",
      "Projekuj ciało do przodu i twórz jedną linię",
    ];
    for (const def of getFootballSpeedCatalog().filter((e) =>
      e.speedQualities?.includes("sprint_technique"),
    )) {
      if (def.sessionRoles?.includes("preparation") && def.id.startsWith("sprint_")) continue;
      const text = def.instructionsPl?.join(" ") ?? "";
      expect(def.instructionsPl?.length ?? 0, def.id).toBeGreaterThanOrEqual(3);
      for (const placeholder of placeholders) expect(text, def.id).not.toContain(placeholder);
      expect(def.displayNamePl, def.id).not.toMatch(/add-step|switch|accent|power skip|dribble/i);
    }
  });
});
