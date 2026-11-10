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

  it("needs an explicit pair: labels with a pair rest, never a copied set rest", () => {
    const pair: TrainingBlock = { ...contrast, blockType: "accessory" };
    expect(blockMethod(pair)?.name).toBe("Superseria");
    expect(linkedLabel(pair, pair.exercises[1])).toBe("A2");
    // Older speed sessions copied the set rest into restAfterPair on single rows.
    const legacySingles: TrainingBlock = {
      ...contrast,
      blockType: "single",
      exercises: contrast.exercises.map((e) => ({
        ...e,
        label: undefined,
        restAfterPair: "Przerwa 30 s",
      })),
    };
    expect(blockMethod(legacySingles)).toBeNull();
    const single = {
      ...contrast,
      blockType: "single" as const,
      exercises: [contrast.exercises[0]],
    };
    expect(blockMethod(single)).toBeNull();
    expect(linkedNextStep(single, single.exercises[0])).toBeNull();
  });
});
