import { describe, expect, it } from "vitest";
import type { TrainingSection } from "./types";
import { flatToStructured, structuredToFlat } from "./strengthBlocks";
import { resolveExerciseAnimation } from "@/lib/trainingCoach/animationCatalog";

describe("persisted animation rhythm", () => {
  it("retains continuous and step-in rhythms through flat persistence and legacy reconstruction", () => {
    const structured: TrainingSection[] = [{
      id: "technical", title: "Technika", type: "main",
      blocks: [{
        id: "skips", title: "Skipy", blockType: "single", intent: "power",
        exercises: [
          { id: "continuous", exerciseId: "a_skip", name: "Skip A — seria 2", animationVariant: "continuous", reps: "15 m" },
          { id: "step-in", exerciseId: "b_skip", name: "Skip B — seria 1", animationVariant: "step_in", reps: "15 m" },
        ],
      }],
    }];

    const persisted = structuredToFlat(structured);
    expect(persisted.main.map(item => item.animationVariant)).toEqual(["continuous", "step_in"]);

    const restored = flatToStructured(persisted).flatMap(section => section.blocks.flatMap(block => block.exercises));
    expect(restored.map(item => item.animationVariant)).toEqual(["continuous", "step_in"]);
    expect(restored.map(item => item.exerciseId)).toEqual(["a_skip", "b_skip"]);
    expect(resolveExerciseAnimation(restored[0])?.id).toBe("review:a_skip:continuous");
  });
});
