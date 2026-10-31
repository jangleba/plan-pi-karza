import { describe, expect, it } from "vitest";
import { jointPositionReply, resolveTechniqueLesson } from "./biomechanics";
import { localCoachReply } from "./coach";
import type { TrainingExercise } from "@/lib/loadwise/types";

const exercise = (exerciseId: string): TrainingExercise => ({ id: `session-${exerciseId}`, name: exerciseId, exerciseId });

describe("phase-specific training technique", () => {
  it("uses approximately 90 degrees only for the lifted A position, not ground contact", () => {
    const a = resolveTechniqueLesson(exercise("a_skip"))!;
    expect(a.phases[0].angleLabel).toBe("≈90°");
    expect(a.phases[1].angleLabel).toBeUndefined();
    expect(a.phases[1].knee).toContain("nie próbuj utrzymać 90°");
  });
  it("distinguishes B opening, C heel recovery and soft straight-leg D", () => {
    expect(resolveTechniqueLesson(exercise("b_skip"))?.phases.map(p => p.title)).toContain("Otwarcie");
    expect(resolveTechniqueLesson(exercise("c_skip"))?.phases[0].knee).toContain("nie wymuszaj");
    expect(resolveTechniqueLesson(exercise("d_skip"))?.phases[0].knee).toContain("przeprost");
  });
  it("does not turn a complex drill into a different movement by matching its name", () => {
    expect(resolveTechniqueLesson({ id: "unknown", exerciseId: "custom_technical", name: "Skip B i zmiana kierunku" })).toBeNull();
    expect(resolveTechniqueLesson(exercise("a_skip_add_step"))?.id).toBe("a");
    expect(resolveTechniqueLesson(exercise("skip_a_to_d"))?.id).toBe("aToD");
    expect(resolveTechniqueLesson(exercise("skip_b_alternate_bounds"))?.id).toBe("bToBounds");
  });
  it("distinguishes squat depth from the stable slight knee flexion in RDL", () => {
    const squat = resolveTechniqueLesson(exercise("goblet_squat"))!;
    expect(squat.phases.some(p => p.knee.includes("Nie ma jednego"))).toBe(true);
    expect(squat.phases.every(p => !p.angleLabel)).toBe(true);
    const rdl = resolveTechniqueLesson(exercise("dumbbell_rdl"))!;
    expect(rdl.id).toBe("rdl");
    expect(rdl.phases[0].knee).toContain("zbliżone ugięcie");
  });
  it("answers knee-angle questions locally with the current exercise phases", () => {
    expect(localCoachReply("Jaki kąt w kolanie?", exercise("a_skip"))?.text).toContain("około 90°");
    expect(jointPositionReply("Jak ustawić kolano?", exercise("goblet_squat"))).toContain("Nie ma jednego obowiązkowego kąta");
    expect(jointPositionReply("Jak ustawić stopę?", exercise("a_skip"))).toContain("Palce uniesione");
    expect(jointPositionReply("Ile przerwy?", exercise("a_skip"))).toBeNull();
  });
  it("keeps symptom handling ahead of educational joint-angle answers", () => {
    expect(localCoachReply("Boli kolano, jaki kąt ustawić?", exercise("goblet_squat"))?.needsTrainer).toBe(true);
  });
  it("keeps acceleration and upright sprint support distinct without fixed degree targets", () => {
    const start = resolveTechniqueLesson(exercise("free_acceleration_sprint"))!;
    const flying = resolveTechniqueLesson(exercise("flying_sprint"))!;
    expect(start.id).toBe("acceleration");
    expect(flying.id).toBe("maxSpeed");
    expect(flying.phases[1].foot).toContain("nieco przed środkiem masy");
    expect([...start.phases, ...flying.phases].every(p => !p.angleLabel)).toBe(true);
  });
  it("does not show a two-leg RDL or ground-supported lunge diagram for specialised variants", () => {
    expect(resolveTechniqueLesson(exercise("single_leg_rdl"))?.phases.every(p => !p.pose)).toBe(true);
    expect(resolveTechniqueLesson(exercise("bulgarian_split_squat"))?.phases.every(p => !p.pose)).toBe(true);
    expect(resolveTechniqueLesson(exercise("full_nordic_hamstring"))?.phases[1].knee).not.toContain("wróć z pomocą");
    expect(resolveTechniqueLesson(exercise("eccentric_nordic_hamstring"))?.phases[1].knee).toContain("wróć z pomocą");
  });
});
