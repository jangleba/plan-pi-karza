import { describe, expect, it } from "vitest";
import { withCoachNotesOnly } from "./gymNotesOnly";
import { advancedIneligibility } from "./engineV2/advancedSessions";
import { gymAthlete } from "./engineV2/testFixtures";
import { buildProfile } from "./store/model";
import { encodeStrengthExperience } from "./strengthExperience";
import type { Profile } from "./types";

const choices = {
  gymTemplate: "athletic_ab",
  gymExercises: { hinge: "trap_bar_deadlift" },
  upperBodyContrast: true,
  strength: "M09",
  coachedIsometricPrimer: true,
  declaredEquipment: ["trap_bar"],
  gymEquipmentMode: "selected",
  coachedOlympicLifts: true,
  sprintFocus: "acceleration",
} as const;

describe("the coach's notes are the only gym sessions", () => {
  const profile = (extra: Partial<Profile>): Profile =>
    ({ ...gymAthlete, age: 24, trainingMethodPreferences: choices, ...extra }) as Profile;

  it("drops the layout, exercise, contrast and method choices of a gym player, keeps the rest", () => {
    const clean = withCoachNotesOnly(profile({ hasGym: true })).trainingMethodPreferences!;
    expect(clean).toEqual({
      declaredEquipment: ["trap_bar"],
      gymEquipmentMode: "selected",
      coachedOlympicLifts: true,
      sprintFocus: "acceleration",
    });
  });

  it("leaves a player without a gym untouched", () => {
    const home = profile({ hasGym: false });
    expect(withCoachNotesOnly(home)).toBe(home);
  });

  it("makes a saved layout choice no reason to leave the notes", () => {
    expect(advancedIneligibility(profile({ hasGym: true }))?.code).toBe("LAYOUT_CHOSEN");
    expect(advancedIneligibility(withCoachNotesOnly(profile({ hasGym: true })))).toBeNull();
  });

  it("is applied to a profile read from the account, so a saved choice no longer diverts the plan", () => {
    const stored = encodeStrengthExperience({
      gymExperienceLevel: "advanced",
      trainingMethodPreferences: { gymTemplate: "athletic_ab", strength: "M09" },
    });
    const loaded = buildProfile(
      { full_name: "Test" },
      { age: 24, position: "midfielder", has_gym: true, training_experience: stored },
      null,
    )!;
    expect(loaded.hasGym).toBe(true);
    expect(loaded.trainingMethodPreferences?.gymTemplate).toBeUndefined();
    expect(loaded.trainingMethodPreferences?.strength).toBeUndefined();
    expect(advancedIneligibility(loaded)?.code).not.toBe("LAYOUT_CHOSEN");
  });
});
