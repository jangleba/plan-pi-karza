import { describe, expect, it } from "vitest";
import { getExerciseDefinition } from "./exerciseLibrary";
import {
  buildStrengthLibraryTrainingExercise,
  filterStrengthLibraryExercises,
  getStrengthLibraryExercises,
  movementLabelForStrengthExercise,
} from "./strengthExerciseLibrary";

describe("strength exercise library", () => {
  it("covers the full strength-domain catalogue size target", () => {
    const exercises = getStrengthLibraryExercises();
    expect(exercises.length).toBeGreaterThanOrEqual(70);
    expect(exercises.length).toBeLessThanOrEqual(90);
  });

  it("includes the required hamstring canonical records", () => {
    const ids = new Set(getStrengthLibraryExercises().map((exercise) => exercise.id));
    for (const id of [
      "assisted_nordic_hamstring",
      "eccentric_nordic_hamstring",
      "full_nordic_hamstring",
      "razor_curl",
      "seated_leg_curl",
      "lying_leg_curl",
      "bilateral_slider_leg_curl",
      "single_leg_slider_leg_curl",
      "bilateral_swiss_ball_leg_curl",
      "single_leg_swiss_ball_leg_curl",
      "prone_band_leg_curl",
      "bridge_walkout",
      "long_lever_hamstring_iso",
      "single_leg_long_lever_hamstring_iso",
      "heel_dig_hamstring_iso_30",
      "heel_dig_hamstring_iso_90",
      "oscillatory_long_lever_bridge",
      "hamstring_45_back_extension",
      "romanian_deadlift_db",
      "kickstand_romanian_deadlift",
      "single_leg_romanian_deadlift",
      "hip_thrust",
      "glute_bridge",
      "glute_bridge_march",
      "single_leg_glute_bridge",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("searches by polish name and aliases", () => {
    expect(filterStrengthLibraryExercises({ query: "Przysiad goblet" }).map((exercise) => exercise.id)).toContain(
      "goblet_squat",
    );
    expect(filterStrengthLibraryExercises({ query: "RDL jednonóż" }).map((exercise) => exercise.id)).toContain(
      "single_leg_romanian_deadlift",
    );
  });

  it("filters hamstrings without machines to nordic, slider, bridge, band and hinge options", () => {
    const filtered = filterStrengthLibraryExercises({
      muscle: "dwugłowe uda",
      equipment: "Bez maszyny",
    });
    const ids = new Set(filtered.map((exercise) => exercise.id));
    expect(ids.has("assisted_nordic_hamstring")).toBe(true);
    expect(ids.has("bilateral_slider_leg_curl")).toBe(true);
    expect(ids.has("bridge_walkout")).toBe(true);
    expect(ids.has("prone_band_leg_curl")).toBe(true);
    expect(ids.has("kickstand_romanian_deadlift")).toBe(true);
    expect(ids.has("seated_leg_curl")).toBe(false);
    expect(ids.has("lying_leg_curl")).toBe(false);
  });

  it("derives mobile-ready strength details for the athlete-visible library", () => {
    const goblet = buildStrengthLibraryTrainingExercise(getExerciseDefinition("goblet_squat")!);
    expect(goblet.name).toBe("Przysiad goblet");
    expect(goblet.setup).toMatch(/hantel|klatk/i);
    expect(goblet.displayPrescription).toBeTruthy();
    expect(goblet.restAfterExercise).toBeTruthy();
    expect(goblet.tempo).toBeTruthy();
    expect(goblet.loadTarget).toBeTruthy();
    expect(goblet.instructionSteps?.length).toBeGreaterThanOrEqual(3);
  });

  it("covers the required movement buckets for the strength category", () => {
    const movements = new Set(getStrengthLibraryExercises().map(movementLabelForStrengthExercise));
    for (const movement of [
      "Bilateral squat",
      "Unilateral squat",
      "Unilateral lunge",
      "Step-up",
      "Hip hinge / deadlift",
      "Hamstring curl",
      "Hamstring isometric",
      "Calves / tibialis",
      "Adductors / groin",
      "Horizontal push",
      "Horizontal pull",
      "Vertical push",
      "Vertical pull",
      "Shoulder / scapular support",
      "Anti-extension core",
      "Anti-rotation core",
      "Anti-lateral-flexion core",
      "Loaded carry",
    ]) {
      expect(movements.has(movement), movement).toBe(true);
    }
  });
});
