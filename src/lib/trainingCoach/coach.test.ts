import { describe, expect, it } from "vitest";
import { coachRequest, localCoachReply, techniqueHint } from "./coach";
import type { TrainingExercise } from "@/lib/loadwise/types";

const squat: TrainingExercise = { id: "sq", name: "Goblet squat", exerciseId: "goblet_squat", sets: "3", reps: "6", tempo: "3–0–X–0", restAfterExercise: "90 s" };
describe("exercise coaching", () => {
  it("uses the session tempo and rest rather than inventing generic numbers", () => {
    expect(localCoachReply("Jakie tempo?", squat)?.text).toContain("3–0–X–0");
    expect(localCoachReply("Ile przerwy?", squat)?.text).toContain("90 s");
    expect(localCoachReply("Jakie tempo?", { ...squat, tempo: undefined })?.text).toContain("nie zapisano");
  });
  it("does not advise through pain or approve suitability", () => {
    expect(localCoachReply("Boli kolano przy ćwiczeniu", squat)?.needsTrainer).toBe(true);
    expect(localCoachReply("Czy to dla mnie bezpieczne?", squat)?.needsTrainer).toBe(true);
    expect(localCoachReply("opowiedz o ekonomii", squat)).toBeNull();
  });
  it("separates eccentric/full Nordic, isometrics and reactive landings", () => {
    const hint = (id: string, name = id) => techniqueHint({ id, name, exerciseId: id });
    expect(hint("eccentric_nordic_hamstring").action).toContain("z pomocą");
    expect(hint("full_nordic_hamstring").action).toContain("powrotu");
    expect(hint("depth_jump").intent).toContain("sprężyście");
    expect(hint("drop_landing").intent).toContain("zatrzymaj");
    expect(hint("split_iso", "Split squat iso").intent).toContain("Utrzymuj napięcie");
    expect(techniqueHint({ ...squat, tempo: "3-1-3-0" }).intent).toContain("3-1-3-0");
  });
  it("sends no account, identity, health history or video in AI context", () => {
    const body = coachRequest("Co to znaczy?", squat);
    expect(Object.keys(body)).toEqual(["question", "exercise"]);
    expect(body.exercise.tempo).toBe(squat.tempo);
    expect(JSON.stringify(body)).not.toMatch(/userId|guardian|health|video|pain/);
  });
});
