// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseQuickGuide } from "@/components/loadwise/session/ExerciseQuickGuide";
import { resolveExerciseSheetViewModel } from "@/components/loadwise/ExerciseDetailSheet";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import type { TrainingExercise } from "./types";
import { getExerciseDefinition } from "./exerciseLibrary";
import { getExerciseTechniqueImage } from "./exerciseTechniqueImages";
import { getSkipGuide, SKIP_LANDING } from "./skipGuides";

function exercise(exerciseId: string): TrainingExercise {
  return {
    id: `session-${exerciseId}`,
    exerciseId,
    name: getExerciseDefinition(exerciseId)?.displayNamePl ?? exerciseId,
    setup: "STARE USTAWIENIE",
    commonMistake: "STARY BŁĄD",
    instructionSteps: [{ title: "Stara technika", description: "STARY OPIS" }],
  };
}

describe("skip guide integration", () => {
  it.each(["a_skip", "b_skip", "c_skip", "d_skip"])(
    "shows the approved image and all steps immediately for %s, including saved sessions",
    (id) => {
      const e = exercise(id);
      const markup = renderToStaticMarkup(<ExerciseQuickGuide exercise={e} />);
      const host = document.createElement("div");
      host.innerHTML = markup;
      expect(host.querySelectorAll("li")).toHaveLength(3);
      expect(host.querySelector("img")?.getAttribute("src")).toBe(`/sprint/small/${id}.png`);
      expect(host.querySelector("details")).toBeNull();
      expect(host.textContent).toContain(SKIP_LANDING);
      expect(host.textContent).not.toContain("STARY OPIS");
      expect(getExerciseTechniqueImage(id)?.alt).toContain("z boku");

      const details = resolveExerciseSheetViewModel(e);
      expect(details.steps).toHaveLength(3);
      expect(details.steps.map((step) => step.description)).toEqual(getSkipGuide(id)?.steps);
      expect(details.cues).toContain(SKIP_LANDING);
      expect(details.setup).not.toContain("STARE");
      expect(resolveQuickGuide(e).error).not.toContain("STARY BŁĄD");
      expect(getExerciseDefinition(id)?.instructionsPl).toContain(SKIP_LANDING);
    },
  );

  it("preserves the special rhythm and session-specific steps of A-skip variants", () => {
    const variant = exercise("a_skip_add_step");
    expect(getSkipGuide(variant.exerciseId)).toBeNull();
    expect(getExerciseTechniqueImage(variant.exerciseId)).toBeNull();
    expect(resolveQuickGuide(variant).setup).toBe("STARE USTAWIENIE");
    expect(resolveExerciseSheetViewModel(variant).steps[0].description).toBe("STARY OPIS");
  });

  it("keeps the existing guide and image for non-skip exercises", () => {
    const e = exercise("goblet_squat");
    const markup = renderToStaticMarkup(<ExerciseQuickGuide exercise={e} />);
    expect(markup).toContain("<details");
    expect(markup).toContain("STARE USTAWIENIE");
    expect(markup).toContain("STARY BŁĄD");
    expect(getExerciseTechniqueImage(e.exerciseId)?.category).toBe("strength");
    expect(getSkipGuide("skip_a_to_d")).toBeNull();
  });
});
