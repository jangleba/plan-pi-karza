import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getExerciseDefinition } from "./exerciseLibrary";
import { EXERCISE_TECHNIQUE_IMAGES, getExerciseTechniqueImage } from "./exerciseTechniqueImages";

describe("exercise technique images", () => {
  it("maps exactly 71 unique canonical exercise ids", () => {
    const ids = EXERCISE_TECHNIQUE_IMAGES.map((image) => image.exerciseId);
    expect(ids).toHaveLength(71);
    expect(new Set(ids).size).toBe(71);

    for (const id of ids) {
      expect(getExerciseDefinition(id)?.id).toBe(id);
    }
  });

  it("contains 44 strength, 16 plyometric and 11 power images", () => {
    const count = (category: string) =>
      EXERCISE_TECHNIQUE_IMAGES.filter((image) => image.category === category).length;

    expect(count("strength")).toBe(44);
    expect(count("plyometric")).toBe(16);
    expect(count("power")).toBe(11);
  });

  it("points every entry to an existing public PNG", () => {
    for (const image of EXERCISE_TECHNIQUE_IMAGES) {
      expect(image.src).toBe(`/${image.category}/small/${image.exerciseId}.png`);
      expect(existsSync(join(process.cwd(), "public", image.src.slice(1)))).toBe(true);
    }
  });

  it("does not guess unknown or similar ids", () => {
    expect(getExerciseTechniqueImage("goblet_squat")?.exerciseId).toBe("goblet_squat");
    expect(getExerciseTechniqueImage("Goblet squat")).toBeNull();
    expect(getExerciseTechniqueImage("squat")).toBeNull();
    expect(getExerciseTechniqueImage(undefined)).toBeNull();
  });
});
