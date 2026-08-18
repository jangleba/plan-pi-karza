import { describe, it, expect } from "vitest";
import type { Profile } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getAllExerciseDefinitions,
  getExerciseDefinition,
  isExerciseAllowedForProfile,
  getExerciseRegression,
  replaceExerciseWithSafeAlternative,
  validateExerciseLibraryCompleteness,
  validateWorkoutExercises,
  normalizeExerciseName,
  resolveExerciseId,
  resolveExerciseByName,
  validateExerciseDefinition,
  getAllEquipmentDefinitions,
  resolveEquipmentId,
  selectEquipmentAwareReplacement,
  type ExerciseDefinition,
} from "./exerciseLibrary";

function makeProfile(over: Partial<Profile>): Profile {
  return {
    name: "Test",
    age: 14,
    position: "midfielder",
    level: "beginner",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 6],
    usualMatchDay: 7,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-06-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "academy",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...over,
  };
}

const youthBeginner = () =>
  buildAthleteTrainingProfile(makeProfile({ age: 14, level: "beginner" }));
const adultAdvanced = () =>
  buildAthleteTrainingProfile(
    makeProfile({
      age: 25,
      level: "advanced",
      gymExperienceLevel: "advanced",
      movementCompetence: "high",
      supervisionLevel: "full",
    }),
    {},
    { readiness: 8 },
  );

describe("exercise library completeness", () => {
  it("every exercise has required fields and valid references", () => {
    const report = validateExerciseLibraryCompleteness();
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.totalExercises).toBeGreaterThan(0);
  });

  it("all definitions expose the ExerciseDefinition shape", () => {
    for (const def of getAllExerciseDefinitions()) {
      const d: ExerciseDefinition = def;
      expect(typeof d.id).toBe("string");
      expect(Array.isArray(d.coachingCues)).toBe(true);
      expect(Array.isArray(d.commonErrors)).toBe(true);
    }
  });
});

describe("blocking rules", () => {
  it("blocks barbell deadlift for 14yo beginner", () => {
    const r = isExerciseAllowedForProfile("barbell_deadlift", youthBeginner());
    expect(r.ok).toBe(false);
  });

  it("blocks heavy back squat for 14yo beginner", () => {
    const r = isExerciseAllowedForProfile("heavy_back_squat", youthBeginner());
    expect(r.ok).toBe(false);
  });

  it("blocks clean/snatch for beginner without supervision", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 20, level: "beginner", supervisionLevel: "none" }),
    );
    expect(isExerciseAllowedForProfile("power_clean", a).ok).toBe(false);
  });

  it("blocks depth jump for low movement competence", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 22, level: "advanced", movementCompetence: "low" }),
    );
    expect(isExerciseAllowedForProfile("depth_jump", a).ok).toBe(false);
  });

  it("blocks max velocity high volume for beginner youth", () => {
    expect(isExerciseAllowedForProfile("max_velocity_high_volume", youthBeginner()).ok).toBe(false);
  });
});

describe("allowed for youth beginner", () => {
  it("allows bodyweight split squat", () => {
    expect(isExerciseAllowedForProfile("bodyweight_split_squat", youthBeginner()).ok).toBe(true);
  });
  it("allows glute bridge", () => {
    expect(isExerciseAllowedForProfile("glute_bridge", youthBeginner()).ok).toBe(true);
  });
  it("allows plank / dead bug / bird dog", () => {
    const a = youthBeginner();
    expect(isExerciseAllowedForProfile("plank", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("dead_bug", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("bird_dog", a).ok).toBe(true);
  });
  it("allows low-volume acceleration mechanics for youth", () => {
    expect(isExerciseAllowedForProfile("acceleration_mechanics", youthBeginner()).ok).toBe(true);
  });
});

describe("regression and replacement", () => {
  it("provides an allowed regression for a blocked lift", () => {
    const a = youthBeginner();
    const reg = getExerciseRegression("barbell_deadlift", a);
    expect(reg).toBeTruthy();
    expect(isExerciseAllowedForProfile(reg!, a).ok).toBe(true);
  });

  it("generator swaps a blocked exercise for a safe alternative", () => {
    const a = youthBeginner();
    const res = replaceExerciseWithSafeAlternative("heavy_back_squat", a);
    expect(res.unresolved).toBe(false);
    expect(res.exercise).toBeTruthy();
    expect(isExerciseAllowedForProfile(res.exercise!, a).ok).toBe(true);
  });

  it("treats unavailable equipment as user-scoped and chooses only available equipment", () => {
    const first = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        unavailableEquipmentIds: ["barbell"],
      }),
    );
    const second = adultAdvanced();
    expect(isExerciseAllowedForProfile("barbell_deadlift", first).ok).toBe(false);
    expect(isExerciseAllowedForProfile("barbell_deadlift", second).ok).toBe(true);
    const result = selectEquipmentAwareReplacement("barbell_deadlift", first);
    expect(result.exercise).toBeTruthy();
    expect(result.exercise?.equipmentRequired).not.toContain("barbell");
  });

  it("is idempotent when the selected replacement is checked again", () => {
    const athlete = buildAthleteTrainingProfile(
      makeProfile({ unavailableEquipmentIds: ["barbell"] }),
    );
    const first = selectEquipmentAwareReplacement("barbell_deadlift", athlete);
    const second = selectEquipmentAwareReplacement(first.exercise!, athlete);
    expect(second.exercise?.id).toBe(first.exercise?.id);
  });
});

describe("unknown / missing metadata", () => {
  it("does not allow exercises without metadata for youth/beginner", () => {
    const a = youthBeginner();
    expect(getExerciseDefinition("mystery_move")).toBeUndefined();
    expect(isExerciseAllowedForProfile("mystery_move", a).ok).toBe(false);
    const report = validateWorkoutExercises(
      { exercises: [{ exerciseId: "mystery_move", name: "Mystery move" }] },
      a,
    );
    expect(report.ok).toBe(false);
    expect(report.unresolvedIssues.length).toBe(1);
  });
});

describe("advanced adult without injuries", () => {
  it("can receive advanced exercises", () => {
    const a = adultAdvanced();
    expect(isExerciseAllowedForProfile("heavy_back_squat", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("barbell_deadlift", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("depth_jump", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("power_clean", a).ok).toBe(true);
  });

  it("still blocks a contraindicated exercise when injured", () => {
    const injured = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        painLocations: ["back"],
      }),
      {},
      { readiness: 8 },
    );
    expect(isExerciseAllowedForProfile("barbell_deadlift", injured).ok).toBe(false);
  });
});

describe("workout validation report", () => {
  it("flags unresolved issue when no safe alternative exists", () => {
    const a = youthBeginner();
    const report = validateWorkoutExercises(
      [{ exerciseId: "bodyweight_squat", name: "Bodyweight squat" }],
      a,
    );
    expect(report.ok).toBe(true);
    expect(report.replacements.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Exercise Library 2.0 — kontrakt danych
// ---------------------------------------------------------------------------

const PHASE_3A_IDS = [
  "heavy_back_squat",
  "front_squat",
  "goblet_squat",
  "trap_bar_deadlift",
  "barbell_deadlift",
  "barbell_romanian_deadlift",
  "romanian_deadlift_db",
  "hip_thrust",
  "bodyweight_split_squat",
  "bulgarian_split_squat",
  "reverse_lunge",
  "lateral_lunge",
  "step_up",
  "single_leg_romanian_deadlift",
  "leg_press",
  "leg_extension",
  "seated_leg_curl",
  "lying_leg_curl",
  "standing_calf_raise",
  "seated_soleus_raise",
  "snap_down",
  "drop_landing",
  "countermovement_jump",
  "squat_jump",
  "broad_jump",
  "repeated_broad_jump",
  "bilateral_pogo",
  "single_leg_pogo",
  "lateral_pogo",
  "split_squat_jump",
  "box_jump",
  "depth_jump",
  "hurdle_hops",
  "lateral_bound_to_stick",
  "single_leg_hop_and_stick",
  "diagonal_bound_to_stick",
  "trap_bar_jump",
  "dumbbell_jump_squat",
  "barbell_jump_squat",
  "kettlebell_swing",
  "push_press",
  "power_clean",
  "med_ball_throw",
  "medicine_ball_overhead_backward_throw",
  "medicine_ball_rotational_scoop_toss",
  "medicine_ball_slam",
  "band_assisted_jump",
];

const EXISTING_IDS = [
  "bodyweight_split_squat",
  "bodyweight_squat",
  "glute_bridge",
  "plank",
  "dead_bug",
  "bird_dog",
  "acceleration_mechanics",
  "goblet_squat",
  "romanian_deadlift_db",
  "hip_thrust",
  "bulgarian_split_squat",
  "heavy_back_squat",
  "barbell_deadlift",
  "power_clean",
  "depth_jump",
  "max_velocity_high_volume",
  "snap_down",
  "med_ball_throw",
];

describe("library contract 2.0", () => {
  it("resolves exactly the approved Phase 3A catalog", () => {
    const resolved = PHASE_3A_IDS.map((id) => resolveExerciseId(id));
    expect(resolved).toEqual(PHASE_3A_IDS);
    expect(new Set(resolved).size).toBe(47);
    expect(
      PHASE_3A_IDS.filter((id) => getExerciseDefinition(id)?.category === "strength").length,
    ).toBe(20);
    expect(
      PHASE_3A_IDS.filter((id) => getExerciseDefinition(id)?.category === "plyometric").length,
    ).toBe(16);
    expect(
      PHASE_3A_IDS.filter((id) => getExerciseDefinition(id)?.category === "power").length,
    ).toBe(11);
  });

  it("preserves all existing stable ids", () => {
    const ids = getAllExerciseDefinitions().map((d) => d.id);
    expect(EXISTING_IDS.every((id) => ids.includes(id))).toBe(true);
  });

  it("ids are unique", () => {
    const ids = getAllExerciseDefinitions().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("aliases do not collide with each other, ids or names", () => {
    const seen = new Map<string, string>();
    const ids = new Set(getAllExerciseDefinitions().map((d) => d.id));
    for (const def of getAllExerciseDefinitions()) {
      for (const key of [def.name, def.displayNamePl, ...def.aliases]) {
        const norm = normalizeExerciseName(key);
        const owner = seen.get(norm);
        expect(owner === undefined || owner === def.id).toBe(true);
        seen.set(norm, def.id);
        if (norm !== def.id) expect(ids.has(norm)).toBe(false);
      }
    }
  });

  it("resolves ids by name, polish name and alias (case/space insensitive)", () => {
    for (const def of getAllExerciseDefinitions()) {
      for (const key of [def.id, def.name, def.displayNamePl, ...def.aliases]) {
        expect(resolveExerciseId(`  ${key.toUpperCase()}  `)).toBe(def.id);
        expect(resolveExerciseByName(key)?.id).toBe(def.id);
      }
    }
    expect(resolveExerciseId("nie istnieje")).toBeUndefined();
  });

  it("every definition has complete required metadata", () => {
    for (const def of getAllExerciseDefinitions()) {
      expect(validateExerciseDefinition(def)).toEqual([]);
      expect(typeof def.displayNamePl).toBe("string");
      expect(def.displayNamePl.length).toBeGreaterThan(0);
      expect(Array.isArray(def.aliases)).toBe(true);
      expect(typeof def.requiresBall).toBe("boolean");
      expect(def.allowedSessionCategories.length).toBeGreaterThan(0);
      expect(["solo", "partner", "small_group", "team"]).toContain(def.participantMode);
      expect(def.minParticipants).toBeGreaterThanOrEqual(1);
      expect(typeof def.spaceRequirement).toBe("string");
    }
  });

  it("all progression/regression/safe-alternative references exist", () => {
    const ids = new Set(getAllExerciseDefinitions().map((d) => d.id));
    for (const def of getAllExerciseDefinitions()) {
      for (const ref of [...def.progressionIds, ...def.regressionIds, ...def.safeAlternativeIds]) {
        expect(ids.has(ref)).toBe(true);
      }
    }
  });

  it("no ball exercise in speed_sprint", () => {
    for (const def of getAllExerciseDefinitions()) {
      if (def.allowedSessionCategories.includes("speed_sprint")) {
        expect(def.requiresBall).toBe(false);
      }
    }
  });

  it("no ball exercise in endurance_conditioning", () => {
    for (const def of getAllExerciseDefinitions()) {
      if (def.allowedSessionCategories.includes("endurance_conditioning")) {
        expect(def.requiresBall).toBe(false);
      }
    }
  });

  it("ball exercises belong only to the football category", () => {
    for (const def of getAllExerciseDefinitions()) {
      if (def.requiresBall) {
        expect(def.allowedSessionCategories).toEqual(["football_ball_work"]);
      }
    }
  });

  it("rejects an invalid definition (ball in sprint category)", () => {
    const base = getAllExerciseDefinitions()[0]!;
    const bad = {
      ...base,
      requiresBall: true,
      allowedSessionCategories: ["speed_sprint"] as typeof base.allowedSessionCategories,
    };
    expect(validateExerciseDefinition(bad).length).toBeGreaterThan(0);
  });

  it("existing safety helpers still behave the same", () => {
    const a = youthBeginner();
    expect(isExerciseAllowedForProfile("barbell_deadlift", a).ok).toBe(false);
    expect(isExerciseAllowedForProfile("bodyweight_squat", a).ok).toBe(true);
    expect(replaceExerciseWithSafeAlternative("heavy_back_squat", a).unresolved).toBe(false);
    expect(validateExerciseLibraryCompleteness().ok).toBe(true);
  });

  it("resolves canonical equipment aliases deterministically", () => {
    expect(resolveEquipmentId("medicine ball")).toBe("med_ball");
    expect(resolveEquipmentId("trap-bar")).toBe("trap_bar");
    expect(getAllEquipmentDefinitions().some((equipment) => equipment.id === "sled")).toBe(true);
  });

  it("marks a block for rebuild when no honest replacement exists", () => {
    const result = selectEquipmentAwareReplacement("mystery_move", youthBeginner());
    expect(result.exercise).toBeNull();
    expect(result.blockRebuildRequired).toBe(true);
  });

  it("has acyclic, equipment-aware Phase 3A replacement behavior", () => {
    const adult = adultAdvanced();
    const noTrapBar = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        unavailableEquipmentIds: ["trap_bar"],
      }),
    );
    expect(selectEquipmentAwareReplacement("trap_bar_jump", noTrapBar).exercise?.id).toBe(
      "dumbbell_jump_squat",
    );
    const noBarbellSetup = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        unavailableEquipmentIds: ["barbell", "rack"],
      }),
    );
    expect(selectEquipmentAwareReplacement("barbell_jump_squat", noBarbellSetup).exercise?.id).toBe(
      "dumbbell_jump_squat",
    );
    expect(selectEquipmentAwareReplacement("trap_bar_deadlift", noTrapBar).exercise?.id).toBe(
      "barbell_deadlift",
    );
    expect(
      selectEquipmentAwareReplacement(
        "trap_bar_deadlift",
        buildAthleteTrainingProfile(
          makeProfile({
            age: 25,
            level: "advanced",
            gymExperienceLevel: "advanced",
            movementCompetence: "high",
            supervisionLevel: "full",
            unavailableEquipmentIds: ["trap_bar", "barbell"],
          }),
        ),
      ).blockRebuildRequired,
    ).toBe(true);
    expect(selectEquipmentAwareReplacement("trap_bar_jump", adult).exercise?.id).toBe(
      "trap_bar_jump",
    );
  });

  it("handles landing, reactive, assisted and medicine-ball replacement rules", () => {
    const adult = adultAdvanced();
    const noBox = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        unavailableEquipmentIds: ["platform"],
      }),
    );
    expect(selectEquipmentAwareReplacement("drop_landing", noBox).exercise?.id).toBe("snap_down");
    const lowReadiness = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
      }),
      {},
      { readiness: 3 },
    );
    expect(selectEquipmentAwareReplacement("hurdle_hops", lowReadiness).exercise?.id).toBe(
      "bilateral_pogo",
    );
    const noAnchorOrBall = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        unavailableEquipmentIds: ["rack", "med_ball"],
      }),
    );
    expect(
      selectEquipmentAwareReplacement("band_assisted_jump", noAnchorOrBall).blockRebuildRequired,
    ).toBe(true);
    expect(
      selectEquipmentAwareReplacement("med_ball_throw", noAnchorOrBall).blockRebuildRequired,
    ).toBe(true);
    expect(
      selectEquipmentAwareReplacement("medicine_ball_slam", noAnchorOrBall).blockRebuildRequired,
    ).toBe(true);
    const lowCompetence = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "low",
        supervisionLevel: "full",
      }),
    );
    expect(selectEquipmentAwareReplacement("hurdle_hops", lowCompetence).blockRebuildRequired).toBe(
      true,
    );
    expect(
      validateExerciseLibraryCompleteness().issues.filter((i) => i.problem.includes("Cykl")).length,
    ).toBe(0);
  });

  it("rejects unavailable equipment in definition metadata", () => {
    const base = getAllExerciseDefinitions()[0]!;
    const invalid = { ...base, equipmentRequired: ["unknown_equipment"] as never };
    expect(
      validateExerciseDefinition(invalid).some((issue) => issue.includes("Nieznany sprzęt")),
    ).toBe(true);
  });
});
