import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { ANIMATION_CATALOG, resolveExerciseAnimation } from "./animationCatalog";

const exercise = (exerciseId: string, rest: Partial<TrainingExercise> = {}): TrainingExercise => ({
  id: "session-instance", exerciseId, name: exerciseId, ...rest,
});

describe("exercise animation identity and session rhythm", () => {
  it("covers all88 distinct catalog entries without importing the renderer", () => {
    expect(ANIMATION_CATALOG).toHaveLength(88);
    expect(new Set(ANIMATION_CATALOG.map(entry => entry.id)).size).toBe(88);
    for (const entry of ANIMATION_CATALOG) {
      const result = resolveExerciseAnimation(exercise(entry.id));
      expect(result).not.toBeNull();
      expect(ANIMATION_CATALOG.some(item => item.id === result!.id)).toBe(true);
    }
  });

  it("keeps exact known exercise identities ahead of generic names and drawings", () => {
    expect(resolveExerciseAnimation(exercise("skip_b_alternate_bounds", {
      name: "Wieloskok", visualId: "bounds",
    }))?.id).toBe("skip_b_alternate_bounds");
    expect(resolveExerciseAnimation(exercise("b_skip", { name: "Skip A" }))?.id).toBe("b_skip");
    expect(resolveExerciseAnimation(exercise("wall_triple_switch"))?.id).toBe("wall_triple_switch");
    expect(resolveExerciseAnimation(exercise("run_two_step_stop"))?.id).toBe("run_two_step_stop");
  });

  it("uses the explicit displayed rhythm and does not infer all conditional technique alternatives", () => {
    expect(resolveExerciseAnimation(exercise("a_skip", {
      displayPrescription: "2 × 15 m · z dostawieniem",
      technique: "Bez przejścia zmień nogę. Z przejściem zrób odbicie. Z dostawieniem połącz stopy.",
    }))?.id).toBe("review:a_skip:gather");
    expect(resolveExerciseAnimation(exercise("c_skip", {
      displayPrescription: "15 m — Z PRZEJŚCIEM",
    }))?.id).toBe("review:c_skip:extra_bounce");
    expect(resolveExerciseAnimation(exercise("d_skip", {
      displayPrescription: "ciągły · 15 m",
    }))?.id).toBe("review:d_skip:continuous");
  });

  it("presents both actual session variants instead of silently choosing one", () => {
    const result = resolveExerciseAnimation(exercise("a_skip", {
      displayPrescription: "2 × 15 m · z przejściem + ciągły",
    }));
    expect(result?.needsChoice).toBe(true);
    expect(result?.choices?.map(item => item.id)).toEqual([
      "review:a_skip:extra_bounce", "review:a_skip:continuous",
    ]);
  });

  it("retains ambiguity of add-step until this session specifies a rhythm", () => {
    const ambiguous = resolveExerciseAnimation(exercise("a_skip_add_step"));
    expect(ambiguous?.needsChoice).toBe(true);
    expect(ambiguous?.choices?.map(item => item.id)).toEqual([
      "review:a_skip:gather", "review:a_skip:extra_bounce",
    ]);
    expect(resolveExerciseAnimation(exercise("a_skip_add_step", {
      instructionSteps: [{ title: "Pozycja", description: "Dostaw stopy pod biodrami i unieś drugą nogę." }],
    }))?.id).toBe("review:a_skip:gather");
    expect(resolveExerciseAnimation(exercise("a_skip_add_step", {
      cue: "Dodatkowe odbicie na tej samej nodze podporowej.",
    }))?.id).toBe("review:a_skip:extra_bounce");
  });

  it("distinguishes negated rhythm words from additional bounces or gathers", () => {
    expect(resolveExerciseAnimation(exercise("a_skip", {
      name: "Skip A bez dodatkowego odbicia",
    }))?.id).toBe("review:a_skip:continuous");
    expect(resolveExerciseAnimation(exercise("a_skip", {
      displayPrescription: "bez dostawienia, płynnie na zmianę",
    }))?.id).toBe("review:a_skip:continuous");
    expect(resolveExerciseAnimation(exercise("a_skip_no_add_step"))?.id).toBe("review:a_skip:continuous");
  });

  it("supports carried variant data but never equates step-in with a single Polish rhythm", () => {
    const continuous = { ...exercise("b_skip"), animationVariant: "continuous" };
    expect(resolveExerciseAnimation(continuous)?.id).toBe("review:b_skip:continuous");
    const stepIn = { ...exercise("a_skip"), animationVariant: "step_in" };
    expect(resolveExerciseAnimation(stepIn)?.needsChoice).toBe(true);
    expect(resolveExerciseAnimation(stepIn)?.choices).toHaveLength(2);
  });

  it("resolves Polish accents, saved names and specific legacy visual IDs", () => {
    expect(resolveExerciseAnimation({ id: "saved-uuid", name: "SKOK BOCZNY Z ZATRZYMANIEM" })?.id).toBe("lateral_bound_to_stick");
    expect(resolveExerciseAnimation({ id: "saved-uuid", name: "Przyspieszenie z oporem sań" })?.id).toBe("resisted_sled_acceleration");
    expect(resolveExerciseAnimation({ id: "saved-uuid", name: "Sprint A-Skip", displayPrescription: "z dostawieniem + ciągły" })?.choices).toHaveLength(2);
    expect(resolveExerciseAnimation({ id: "old", name: "", visualId: "sprint_b_skip_3" })?.id).toBe("b_skip");
    expect(resolveExerciseAnimation({ id: "old", name: "", visualId: "bwprep:ankle" })?.id).toBe("bwprep:ankle");
  });

  it("resolves complete legacy sequences rather than one component", () => {
    expect(resolveExerciseAnimation({ id: "old", name: "Ankling + niskie dribbles" })?.id).toBe("legacy:6");
    expect(resolveExerciseAnimation({ id: "old", name: "Single-leg hops + broad jump" })?.id).toBe("legacy:11");
    expect(resolveExerciseAnimation({ id: "legacy:14", name: "" })?.id).toBe("legacy:14");
    expect(resolveExerciseAnimation({ id: "old", name: "Narastające przebieżki (build-up)", visualId: "max_velocity_sprint" })?.id).toBe("progressive_build_up_sprint");
  });

  it("returns null for unknown drills, strength exercises and ambiguous generic drawings", () => {
    for (const value of [
      exercise("custom_technical", { name: "Skip B i zmiana kierunku" }),
      exercise("goblet_squat", { name: "Goblet squat" }),
      exercise("custom_drill", { name: "Nowy drill sprinterski", visualId: "sprint_acceleration" }),
      exercise("custom_bounds", { name: "Nowa kombinacja", visualId: "bounds" }),
      exercise("custom_speed", { name: "Bieg", visualId: "max_velocity_sprint" }),
    ]) expect(resolveExerciseAnimation(value)).toBeNull();
  });

  it("requires the straight-leg run or bound subtype instead of auto-playing a combined sequence", () => {
    const result = resolveExerciseAnimation(exercise("straight_leg_run_bound"));
    expect(result?.needsChoice).toBe(true);
    expect(result?.choices).toEqual([
      { id: "straight_leg_run_bound:run", title: "Bieg z prawie prostymi nogami" },
      { id: "straight_leg_run_bound:bound", title: "Odbicia z prawie prostymi nogami" },
    ]);
  });

  it("labels cut-angle and direction variants as a general detail rather than an exact selected movement", () => {
    const angled = { ...exercise("planned_cut"), animationVariant: "left_135" };
    const result = resolveExerciseAnimation(angled);
    expect(result?.needsChoice).toBe(true);
    expect(result?.choices).toEqual([{ id: "planned_cut", title: "Ogólny schemat ustawienia przy cięciu" }]);
    expect(result?.notes?.[0]).toContain("kąt i kierunek");
    expect(resolveExerciseAnimation(exercise("planned_cut", { displayPrescription: "3 × cięcie 45°" }))?.needsChoice).toBe(true);
    const radial = { ...exercise("planned_cut"), radius: 3 };
    expect(resolveExerciseAnimation(radial)?.needsChoice).toBe(true);
    expect(resolveExerciseAnimation(exercise("planned_505"))?.id).toBe("planned_505");
    expect(resolveExerciseAnimation(exercise("planned_505"))?.needsChoice).not.toBe(true);
  });

  it("always identifies curved sprint animations as partial stride-and-route schematics", () => {
    for (const id of ["football_curved_sprint", "reactive_curved_sprint"]) {
      const result = resolveExerciseAnimation(exercise(id));
      expect(result?.needsChoice).toBe(true);
      expect(result?.choices).toEqual([{ id, title: "Schemat kroku i toru łuku" }]);
      expect(result?.notes?.[0]).toContain("Nie odtwarza pełnego przechylenia");
    }
    expect(resolveExerciseAnimation(exercise("a_skip"))?.sourceUrl).toBe("https://lran.org.uk/technique-drills-2");
  });
});
