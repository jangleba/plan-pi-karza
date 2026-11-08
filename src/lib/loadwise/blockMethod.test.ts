import { describe, expect, it } from "vitest";
import { blockMethod, linkedLabel, linkedNextStep } from "./blockMethod";
import type { TrainingBlock } from "./types";

const contrast: TrainingBlock = {
  id: "a",
  title: "BLOK A — KONTRAST",
  blockType: "contrast",
  intent: "power",
  restAfterBlock: "Przerwa po bloku: 2–3 min",
  exercises: [
    {
      id: "a1",
      label: "A1",
      name: "Przysiad",
      sets: "3",
      reps: "4",
      restAfterExercise: "60 s do A2",
    },
    {
      id: "a2",
      label: "A2",
      name: "Skok pionowy",
      sets: "3",
      reps: "3",
      restAfterPair: "2–4 min po parze",
    },
  ],
};

describe("exercises done together", () => {
  it("names the method and says what follows each exercise", () => {
    expect(blockMethod(contrast)?.name).toBe("Seria kontrastowa");
    expect(linkedLabel(contrast, contrast.exercises[1])).toBe("A2");
    expect(linkedNextStep(contrast, contrast.exercises[0])).toBe("Potem A2 po 60 s.");
    expect(linkedNextStep(contrast, contrast.exercises[1])).toBe(
      "Przerwa 2–4 min, potem znowu A1.",
    );
  });

  it("treats an unlabelled pair with a pair rest as a superset and a single exercise as plain", () => {
    const pair: TrainingBlock = {
      ...contrast,
      blockType: "accessory",
      exercises: contrast.exercises.map((e) => ({ ...e, label: undefined })),
    };
    expect(blockMethod(pair)?.name).toBe("Superseria");
    expect(linkedLabel(pair, pair.exercises[1])).toBe("A2");
    const single = {
      ...contrast,
      blockType: "single" as const,
      exercises: [contrast.exercises[0]],
    };
    expect(blockMethod(single)).toBeNull();
    expect(linkedNextStep(single, single.exercises[0])).toBeNull();
  });
});
