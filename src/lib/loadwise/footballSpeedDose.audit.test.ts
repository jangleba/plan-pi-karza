import { describe, expect, it } from "vitest";
import { generateFootballSpeedSession, speedDoseFields } from "./footballSpeedSessionEngine";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "./exerciseLibrary";
import type { Profile } from "./types";
describe("speed dose and athlete gate audit", () => {
  it("does not multiply the complete displayed dose by another set count", () => {
    expect(speedDoseFields("4 × 20 m")).toEqual({
      sets: "4",
      reps: "20 m",
      distanceOrDuration: undefined,
      groundContacts: undefined,
    });
    expect(speedDoseFields("2–3 × 4 kontakty na stronę", true)).toMatchObject({
      sets: "2–3",
      reps: "4 kontakty na stronę",
      groundContacts: 8,
    });
    expect(speedDoseFields("3 × 5 na stronę").groundContacts).toBeUndefined();
  });
  for (const age of [12, 14, 16, 18, 25])
    for (const level of ["beginner", "intermediate", "advanced"] as const)
      it(`keeps every exercise within the central profile gate at age ${age}, level ${level}`, () => {
        const profile = {
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
        const athlete = buildAthleteTrainingProfile(profile);
        for (const family of [
          "acceleration",
          "maximum_velocity",
          "curved_sprinting",
          "deceleration_cod",
          "reactive_agility_reacceleration",
        ] as const) {
          const session = generateFootballSpeedSession({
            profile,
            date: "2026-11-05",
            family,
          }).session!;
          for (const e of session.structuredSections!.flatMap((s) =>
            s.blocks.flatMap((b) => b.exercises),
          ))
            expect(
              isExerciseAllowedForProfile(getExerciseDefinition(e.exerciseId!), athlete).reasons,
              `${family}: ${e.exerciseId}`,
            ).toEqual([]);
        }
      });
});
