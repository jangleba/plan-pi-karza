import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ANIMATION_CATALOG } from "./animationCatalog";

type Point = [number, number];
interface Leg { knee: Point; ankle: Point; contact: boolean; footAngle?: number }
interface Scene { hip: Point; right: Leg; left: Leg; view?: string; projection?: string }
interface Runtime {
  BWAnim: { models: Record<string, { durationMs: number; sequence?: string[]; sample: (p: number) => Scene }> };
  drawBallwiseAthlete: (scene: Scene) => string;
  BWCoaching: {
    forModel: (id: string) => { focus: string[]; tempo: { verified: boolean } } | null;
    describe: (id: string, scene: Scene) => { markers: Array<{ joint: string; side: string; point: Point }> };
    overlay: (scene: Scene, id: string) => string;
  };
}
const folder = new URL("../../../public/technique/animations/", import.meta.url);
const data = JSON.parse(readFileSync(new URL("catalog.json", folder), "utf8")) as {
  count: number; gallery: string[]; records: Array<{ id: string; choices?: Array<{ id: string }> }>;
};
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("engine.js", folder), "utf8"), context);
const runtime = context as unknown as Runtime;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("packaged animation assets", () => {
  it("ships every catalog identity and every explicit variant as a runnable model", () => {
    expect(data.count).toBe(88);
    expect(new Set(data.gallery)).toEqual(new Set(ANIMATION_CATALOG.map(r => r.id)));
    for (const record of data.records) {
      expect(runtime.BWAnim.models[record.id], record.id).toBeDefined();
      for (const choice of record.choices ?? []) expect(runtime.BWAnim.models[choice.id], choice.id).toBeDefined();
    }
  });
  it("keeps all supplied poses finite, shoes above the floor, and contact soles on it", () => {
    for (const [id, model] of Object.entries(runtime.BWAnim.models)) for (let i = 0; i < 120; i++) {
      const scene = model.sample(i / 120);
      const front = scene.view === "front" || scene.projection === "frontal";
      expect(scene.hip.every(Number.isFinite), id).toBe(true);
      for (const leg of [scene.right, scene.left]) {
        expect([...leg.knee, ...leg.ankle].every(Number.isFinite), id).toBe(true);
        const thigh = distance(scene.hip, leg.knee), shin = distance(leg.knee, leg.ankle);
        if (front) { expect(thigh, id).toBeLessThanOrEqual(57.001); expect(shin, id).toBeLessThanOrEqual(56.001); }
        else { expect(thigh, id).toBeCloseTo(57, 4); expect(shin, id).toBeCloseTo(56, 4); }
        const angle = (leg.footAngle ?? 0) * Math.PI / 180;
        const bottom = leg.ankle[1] + Math.max(-7 * Math.sin(angle) + 11 * Math.cos(angle), 16 * Math.sin(angle) + 11 * Math.cos(angle));
        expect(bottom, id).toBeLessThanOrEqual(264.001);
        if (leg.contact) expect(bottom, id).toBeCloseTo(264, 4);
      }
      const svg = runtime.drawBallwiseAthlete(scene);
      expect(svg, id).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg, id).toContain("bw-human-outline");
      expect(svg, id).not.toContain("<circle");
    }
  });
  it("ships anatomical snapshots for phase diagrams", () => {
    for (const name of ["standing", "a-position", "a-contact", "b-open", "c-fold", "straight-leg", "squat", "hinge", "split", "acceleration", "upright", "landing"]) {
      const file = new URL(`snapshots/${name}.svg`, folder);
      expect(existsSync(file), name).toBe(true);
      expect(readFileSync(file, "utf8"), name).toContain("bw-human-outline");
    }
  });
  it("gives every model an exercise-specific emphasis without claiming source certification", () => {
    for (const [id, model] of Object.entries(runtime.BWAnim.models)) {
      const coaching = runtime.BWCoaching.forModel(id);
      expect(coaching, id).not.toBeNull();
      expect(coaching?.focus.length, id).toBeGreaterThan(0);
      expect(coaching?.tempo.verified, id).toBe(false);
      const scene = model.sample(.37), before = JSON.stringify(scene);
      const detail = runtime.BWCoaching.describe(id, scene);
      expect(detail.markers.length, id).toBeGreaterThan(0);
      expect(runtime.BWCoaching.overlay(scene, id), id).not.toMatch(/NaN|Infinity|undefined/);
      expect(JSON.stringify(scene), id).toBe(before);
    }
    expect(runtime.BWCoaching.forModel("unknown")).toBeNull();
    const hop = runtime.BWAnim.models.single_leg_hops.sample(.7);
    expect(runtime.BWCoaching.describe("single_leg_hops", hop).markers.map(m => m.side)).toEqual(["right"]);
  });
  it("preserves child durations in composed sequences and shows actual ankle movement in pogo", () => {
    for (const [id, model] of Object.entries(runtime.BWAnim.models)) if (model.sequence) {
      expect(model.durationMs, id).toBeCloseTo(model.sequence.reduce((sum, child) => sum + runtime.BWAnim.models[child].durationMs, 0), 4);
    }
    const pogo = runtime.BWAnim.models.bilateral_pogo;
    const angles = Array.from({ length: 100 }, (_, i) => pogo.sample(i / 100).right.footAngle ?? 0);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(10);
    expect(pogo.durationMs).toBeLessThan(600);
    expect(runtime.BWCoaching.forModel("bilateral_pogo")?.focus).toEqual(["ankle"]);
    for (let i = 0; i < 20; i++) {
      const mobilization = runtime.BWAnim.models["bwprep:ankle"].sample(i / 20);
      expect(mobilization.right.footAngle).toBe(0);
      expect(mobilization.right.contact).toBe(true);
    }
  });
});
