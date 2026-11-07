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
  BWDrawHuman: {
    muscles(s: Scene): string[];
    geometry: {
      muscleLines(
        a: number[],
        b: number[],
        c: number[],
        kind: string,
        far: boolean,
        scene: Scene,
      ): string;
    };
  };
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
  it("draws one bare anatomical outline in side and quarter views without changing the exercise identity", () => {
    for (const id of ["a_march", "heavy_back_squat", "dumbbell_bench_press", "plank"]) {
      const s = rig.BWAnim.models[id].sample(0.35),
        svg = rig.drawBallwiseAthlete(s);
      expect(s.motionId).toBe(id);
      expect(svg).not.toContain("bw-human-shorts");
      expect(svg).not.toContain("bw-human-sleeve");
      expect(svg).toContain("bw-silhouette-ink");
      expect(svg).toContain("bw-silhouette-fill");
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
  it("puts front muscles in front and the posterior chain behind on a figure facing forward", () => {
    // Vertical leg of a side-view figure that faces +x: anterior is +x.
    const meanX = (svg: string, name: string) => {
      const d = svg.match(new RegExp(`data-muscle="${name}"><path d="([^"]+)"`))?.[1] ?? "";
      const xs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const leg = (id: string) =>
      rig.BWDrawHuman.geometry.muscleLines([0, 0], [0, 50], [0, 100], "leg", false, {
        motionId: id,
      });
    expect(meanX(leg("heavy_back_squat"), "quadriceps")).toBeGreaterThan(0);
    expect(meanX(leg("eccentric_nordic_hamstring"), "hamstrings")).toBeLessThan(0);
    expect(meanX(leg("standing_calf_raise"), "calves")).toBeLessThan(0);
  });
});
