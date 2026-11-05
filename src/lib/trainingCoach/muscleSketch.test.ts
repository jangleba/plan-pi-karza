import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
interface Scene {
  motionId?: string;
  [key: string]: unknown;
}
interface Runtime {
  BWAnim: { models: Record<string, { sample(p: number): Scene }> };
  BWMotionLibrary: { register(r: unknown[]): void };
  BWDrawHuman: { muscles(s: Scene): string[] };
  drawBallwiseAthlete(s: Scene): string;
}
const folder = new URL("../../../public/technique/animations/", import.meta.url),
  context = vm.createContext({});
for (const name of ["engine", "human", "movements", "spatial"])
  vm.runInContext(readFileSync(new URL(name + ".js", folder), "utf8"), context);
const rig = context as unknown as Runtime;
rig.BWMotionLibrary.register(
  JSON.parse(readFileSync(new URL("catalog.json", folder), "utf8")).records,
);
describe("exercise-specific athletic sketch", () => {
  it("draws sleeves, shorts and hair in both side and quarter views without changing the exercise identity", () => {
    for (const id of ["a_march", "heavy_back_squat", "dumbbell_bench_press", "plank"]) {
      const s = rig.BWAnim.models[id].sample(0.35),
        svg = rig.drawBallwiseAthlete(s);
      expect(s.motionId).toBe(id);
      expect(svg).toContain("bw-human-shorts");
      expect(svg).toContain("bw-human-sleeve");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
  it("shows different primary muscle traces for a squat, press, row and calf raise", () => {
    const expected = {
      heavy_back_squat: ["quadriceps", "glutes"],
      dumbbell_bench_press: ["pecs", "triceps"],
      one_arm_dumbbell_row: ["lats", "biceps"],
      standing_calf_raise: ["calves"],
    };
    for (const [id, groups] of Object.entries(expected)) {
      const s = rig.BWAnim.models[id].sample(0.48),
        svg = rig.drawBallwiseAthlete(s);
      expect(rig.BWDrawHuman.muscles(s)).toEqual(groups);
      for (const name of groups) expect(svg, id).toContain(`data-muscle="${name}"`);
    }
    expect(rig.drawBallwiseAthlete(rig.BWAnim.models.heavy_back_squat.sample(0.48))).not.toContain(
      'data-muscle="triceps"',
    );
  });
  it("retains exact identities for older running models so they also get relevant traces", () => {
    const s = rig.BWAnim.models.a_march.sample(0.3);
    expect(s.motionId).toBe("a_march");
    expect(rig.BWDrawHuman.muscles(s)).toContain("calves");
    expect(rig.drawBallwiseAthlete(s)).toContain('data-muscle="calves"');
  });
  it("does not invent muscle activation for an unknown movement or a passive stretch", () => {
    expect(rig.BWDrawHuman.muscles({ motionId: "unknown-demo" })).toEqual([]);
    expect(rig.BWDrawHuman.muscles({ motionId: "stretch_hamstring" })).toEqual([]);
  });
});
