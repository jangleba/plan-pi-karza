import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import library from "./movement-library.json";
import { GYM_STRENGTH_EXERCISES } from "../loadwise/gymStrengthExercises";
import { resolveExerciseAnimation } from "./animationCatalog";

interface Scene {
  hip: number[];
  right: { ankle: number[]; contact: boolean };
  left: { ankle: number[]; contact: boolean };
  props: { points: number[][] };
}
const folder = new URL("../../../public/technique/animations/", import.meta.url);
const ctx = vm.createContext({});
for (const script of ["engine", "human", "movements", "spatial"])
  vm.runInContext(readFileSync(new URL(`${script}.js`, folder), "utf8"), ctx);
const runtime = ctx as unknown as {
  BWMotionLibrary: { register(records: unknown[]): void };
  BWAnim: { models: Record<string, { sample(p: number): Scene; sourceVerified: boolean }> };
};
runtime.BWMotionLibrary.register(library.records);
const sample = (id: string, p: number) => runtime.BWAnim.models[id].sample(p);

describe("the exact gym variant demonstration", () => {
  it("resolves every new identity and keeps the app and player instructions identical", () => {
    for (const definition of GYM_STRENGTH_EXERCISES) {
      expect(
        resolveExerciseAnimation({
          id: definition.id,
          exerciseId: definition.id,
          name: definition.displayNamePl,
        })?.id,
      ).toBe(definition.id);
      expect(library.records.find((record) => record.id === definition.id)?.instructions).toEqual(
        definition.instructionsPl,
      );
      expect(runtime.BWAnim.models[definition.id].sourceVerified).toBe(false);
    }
  });
  it("keeps assistance anchors above the athlete and resistance anchors fixed at floor level", () => {
    for (const phase of [0.1, 0.4, 0.7]) {
      const assisted = sample("gym_cmj_assisted", phase);
      expect(assisted.props.points[0]).toEqual([160, 5]);
      expect(assisted.props.points[2]).toEqual([155, 5]);
      expect(assisted.props.points[1][1]).toBeGreaterThan(5);
      const resisted = sample("gym_cmj_resisted", phase);
      expect(resisted.props.points[0]).toEqual([105, 264]);
      expect(resisted.props.points[2]).toEqual([215, 264]);
      expect(Math.abs(resisted.props.points[1][1] - resisted.hip[1])).toBeLessThan(5);
    }
  });
  it("distinguishes two-foot lateral landings from landings onto the opposite leg", () => {
    const both = sample("gym_lateral_jump", 0.75);
    expect(both.right.contact && both.left.contact).toBe(true);
    const start = sample("gym_lateral_bound", 0.1),
      end = sample("gym_lateral_bound", 0.75);
    expect(start.right.contact).toBe(true);
    expect(start.left.contact).toBe(false);
    expect(end.right.contact).toBe(false);
    expect(end.left.contact).toBe(true);
    expect(sample("gym_lateral_jump", 0.3).right.contact).toBe(false);
  });
  it("shows a walking stop without any flight phase", () => {
    for (let i = 0; i < 100; i++) {
      const pose = sample("gym_step_brake", i / 100);
      expect(pose.right.contact || pose.left.contact).toBe(true);
    }
    expect(sample("gym_step_brake", 0.75).hip).toEqual(sample("gym_step_brake", 0.9).hip);
  });
  it("shows alternating knee flexion and short bridge pulses instead of a bilateral curl or full bridge", () => {
    const first = sample("gym_fast_band_curl", 0),
      opposite = sample("gym_fast_band_curl", 0.5);
    expect(first.right.ankle).toEqual(opposite.left.ankle);
    expect(first.left.ankle).toEqual(opposite.right.ankle);
    expect(first.hip).toEqual(opposite.hip);
    const phases = Array.from({ length: 80 }, (_, i) => sample("gym_bridge_pulses", i / 80));
    const heights = phases.map((pose) => pose.hip[1]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(4.001);
    for (const pose of phases) expect(pose.right.ankle).toEqual(phases[0].right.ankle);
  });
});
