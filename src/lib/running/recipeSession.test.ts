import { describe, expect, it } from "vitest";
import { recipeSections, recipeToProtocol } from "./recipeSession";
import { HIIT_RECIPE } from "./testRecipes";

describe("numeric running instructions", () => {
  it("retains the real fifteen-second recipe instead of replacing every HIIT with one minute", () => {
    const main = recipeSections(HIIT_RECIPE).main[0];
    expect(main.technique).toContain("Odcinek pracy: 15 s");
    expect(main.technique).toContain("Między odcinkami: 15 s stania");
    const work = recipeToProtocol(HIIT_RECIPE).steps.filter((step) => step.kind === "work");
    expect(work).toHaveLength(36);
    expect(work.every((step) => step.target.value === 15)).toBe(true);
  });
});
