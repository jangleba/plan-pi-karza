import { describe, expect, it } from "vitest";
import { resolveExerciseAnimation } from "@/lib/trainingCoach/animationCatalog";
import { getExerciseDefinition } from "./exerciseLibrary";
import {
  generalCooldown,
  gymCooldown,
  mobilityCircuit,
  recoverySessionContent,
  recoveryStretches,
  runningCooldown,
  runningPreparation,
} from "./recoveryContent";
import { recoverySession } from "./sessionRuntime";
import { buildRecoveryPrehab } from "./sessionContent";

const builders = {
  generalCooldown,
  gymCooldown,
  mobilityCircuit: () => mobilityCircuit(2),
  recoveryStretches,
  runningCooldown,
  runningPreparation,
};

describe("concrete recovery and cool-down content", () => {
  it.each(Object.entries(builders))(
    "%s names library exercises with a dose and a demonstration",
    (_, build) => {
      for (const item of build()) {
        const definition = getExerciseDefinition(item.exerciseId ?? "");
        expect(definition, item.name).toBeDefined();
        expect(item.name).toBe(definition!.displayNamePl);
        expect(item.prescription, item.name).toMatch(/\d/);
        expect(
          resolveExerciseAnimation({
            id: item.exerciseId!,
            exerciseId: item.exerciseId,
            name: item.name,
          }),
          item.name,
        ).not.toBeNull();
      }
    },
  );

  it("never prescribes a jog after a run or a generic mobility block", () => {
    for (const item of [...runningCooldown(), ...runningPreparation(), ...generalCooldown()]) {
      expect(item.exerciseId).not.toBe("easy_aerobic_run");
      expect(["hip_mobility_flow", "static_stretch_cooldown", "ankle_mobility_flow"]).not.toContain(
        item.exerciseId,
      );
    }
  });

  it("gives every new stretch its own matching movement drawing", () => {
    const drawings: Record<string, string> = {
      calf_wall_stretch: "bwprep:calf",
      soleus_bent_knee_stretch: "bwprep:soleus",
      half_kneeling_hip_flexor_stretch: "bwprep:hip",
      half_kneeling_hamstring_stretch: "bwprep:hamstring",
      standing_quad_stretch: "bwprep:quad",
      cat_cow: "bwprep:cat",
      quadruped_thoracic_rotation: "bwprep:rotation",
    };
    for (const [id, drawing] of Object.entries(drawings)) {
      const definition = getExerciseDefinition(id)!;
      expect(definition.instructionsPl?.length, id).toBeGreaterThanOrEqual(3);
      expect(
        resolveExerciseAnimation({ id, exerciseId: id, name: definition.displayNamePl })?.id,
      ).toBe(drawing);
    }
  });

  it("builds a recovery session that works on its own: circulation, joints, tissue, stretches, breathing", () => {
    const content = recoverySessionContent();
    expect(content.warmup.map((item) => item.exerciseId)).toEqual(["easy_cycle_recovery"]);
    expect(content.main.map((item) => item.exerciseId)).toEqual([
      "cat_cow",
      "quadruped_thoracic_rotation",
      "ankle_rock_forward",
      "adductor_rockback",
    ]);
    expect(content.accessory.map((item) => item.exerciseId)).toEqual([
      "soleus_iso_hold",
      "long_lever_hamstring_iso",
    ]);
    expect(content.cooldown.at(-1)?.exerciseId).toBe("diaphragmatic_breathing");
    const ids = [...content.warmup, ...content.main, ...content.accessory, ...content.cooldown].map(
      (item) => item.exerciseId,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the same concrete content in both recovery builders", () => {
    const runtime = recoverySession();
    const prehab = buildRecoveryPrehab();
    expect(runtime.main.map((item) => item.exerciseId)).toContain("cat_cow");
    expect(
      runtime.cooldown?.some((item) => item.exerciseId === "half_kneeling_hip_flexor_stretch"),
    ).toBe(true);
    expect(prehab.sections.main.map((item) => item.exerciseId)).toContain("cat_cow");
    for (const item of [...runtime.main, ...prehab.sections.main])
      expect(item.name).not.toMatch(/mobilność całego ciała|prehab tkanek/i);
  });
});
