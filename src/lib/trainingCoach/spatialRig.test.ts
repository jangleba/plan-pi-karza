import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
type P = number[];
interface Joints {
  hip: P;
  knee: P;
  ankle: P;
  shoulder: P;
  elbow: P;
  wrist: P;
  footAngle: number;
  contact: boolean;
  surface: string;
}
interface Gear {
  kind: string;
  at: P;
  axis?: P;
  min?: P;
  max?: P;
}
interface Spatial {
  camera: { yaw: number; elevation: number; view: string };
  joints: Record<string, Joints>;
  gear: Gear[];
  grips: Record<string, { target: P; error: number }>;
  support?: { kind: string; at: P; local: P };
  hip: P;
}
interface Scene {
  spatial: Spatial;
  hip: P;
  torsoAngle: number;
  phase: string;
}
interface Runtime {
  BWAnim: { models: Record<string, { sample(p: number): Scene; spatialVersion?: number }> };
  BWMotionLibrary: {
    register(r: unknown[]): void;
    withVariant(id: string, v: string): { sample(p: number): Scene };
  };
  BWSpatial: { project(p: P, c: Spatial["camera"]): P; local(s: Scene, p: P): P };
  BWDrawHuman: { points(s: Scene): P[] };
  drawBallwiseAthlete(s: Scene): string;
}
const folder = new URL("../../../public/technique/animations/", import.meta.url),
  context = vm.createContext({});
for (const file of ["engine", "human", "movements", "spatial"])
  vm.runInContext(readFileSync(new URL(file + ".js", folder), "utf8"), context);
const rig = context as unknown as Runtime;
rig.BWMotionLibrary.register(
  JSON.parse(readFileSync(new URL("catalog.json", folder), "utf8")).records,
);
const models = Object.entries(rig.BWAnim.models).filter(([, m]) => m.spatialVersion === 53);
const dist = (a: P, b: P) => Math.hypot(...a.map((v, i) => v - b[i]));
const flex = (a: P, b: P, c: P) => {
  const u = a.map((v, i) => v - b[i]),
    v = c.map((x, i) => x - b[i]);
  return (
    180 -
    (Math.acos(
      Math.max(
        -1,
        Math.min(1, u.reduce((n, x, i) => n + x * v[i], 0) / Math.hypot(...u) / Math.hypot(...v)),
      ),
    ) *
      180) /
      Math.PI
  );
};
describe("coherent body and equipment teaching views", () => {
  it("keeps physical bone lengths, anatomical bends and exact grips across all authored phases", () => {
    expect(models).toHaveLength(38);
    expect(models.map(([id]) => id)).toEqual(
      expect.arrayContaining(["split_squat_iso_hold", "overcoming_pin_squat_primer"]),
    );
    for (const [id, m] of models)
      for (let i = 0; i < 120; i++) {
        const s = m.sample(i / 120),
          sp = s.spatial;
        for (const [side, j] of Object.entries(sp.joints)) {
          for (const [a, b, L] of [
            ["hip", "knee", 57],
            ["knee", "ankle", 56],
            ["shoulder", "elbow", 36],
            ["elbow", "wrist", 32],
          ] as const)
            expect(dist(j[a], j[b]), id + ":" + a).toBeCloseTo(L, 1);
          expect(flex(j.hip, j.knee, j.ankle), id + ":knee").toBeLessThanOrEqual(160.1);
          expect(flex(j.shoulder, j.elbow, j.wrist), id + ":elbow").toBeLessThanOrEqual(155.1);
          if (sp.grips[side])
            expect(dist(j.wrist, sp.grips[side].target), id + ":grip").toBeLessThan(0.05);
        }
      }
  });
  it("uses a transverse bar axis and different upper-back/front-rack supports, fixed through a rep", () => {
    for (const [id, view, kind] of [
      ["heavy_back_squat", "rear-quarter", "upper-back"],
      ["front_squat", "front-quarter", "front-rack"],
    ] as const) {
      for (const p of [0, 0.2, 0.48, 0.7, 0.99]) {
        const s = rig.BWAnim.models[id].sample(p),
          sp = s.spatial,
          bar = sp.gear.find((g) => g.kind === "barbell")!;
        expect(bar.axis).toEqual([0, 0, 1]);
        expect(sp.camera.view).toBe(view);
        expect(sp.support?.kind).toBe(kind);
        expect(dist(bar.at, rig.BWSpatial.local(s, sp.support!.local))).toBeLessThan(0.001);
        expect(sp.support!.local[0] > 0).toBe(kind === "front-rack");
        expect(sp.support!.local[1]).toBeGreaterThan(-64);
        const ends = [-108, 108].map((z) =>
          rig.BWSpatial.project([bar.at[0], bar.at[1], z], sp.camera),
        );
        expect(Math.abs(ends[0][0] - ends[1][0])).toBeGreaterThan(100);
      }
    }
  });
  it("keeps the pulldown handle free of plates and the trap-bar handles beside the athlete", () => {
    for (const p of [0, 0.48, 0.99]) {
      const pull = rig.BWAnim.models.lat_pulldown.sample(p).spatial;
      expect(pull.gear.some((g) => g.kind === "pulldown")).toBe(true);
      expect(pull.gear.some((g) => g.kind === "cable")).toBe(true);
      expect(pull.gear.some((g) => g.kind === "barbell")).toBe(false);
      const trap = rig.BWAnim.models.trap_bar_deadlift.sample(p).spatial;
      expect(trap.grips.left.target[2]).toBe(-30);
      expect(trap.grips.right.target[2]).toBe(30);
      expect(trap.joints.left.ankle[2]).toBeGreaterThan(-30);
      expect(trap.joints.right.ankle[2]).toBeLessThan(30);
    }
  });
  it("keeps shoes on their named support and deadlift plates on the floor at setup", () => {
    for (const [id, m] of models)
      for (let i = 0; i < 60; i++) {
        const s = m.sample(i / 60);
        for (const j of Object.values(s.spatial.joints))
          if (j.contact && j.surface === "floor") {
            const a = (j.footAngle * Math.PI) / 180,
              maxY = Math.max(
                ...[
                  [-7, 11],
                  [16, 11],
                ].map(([x, y]) => j.ankle[1] + x * Math.sin(a) + y * Math.cos(a)),
              );
            expect(maxY, id + ":sole").toBeCloseTo(264, 4);
          }
      }
    const bar = rig.BWAnim.models.barbell_deadlift
      .sample(0)
      .spatial.gear.find((g) => g.kind === "barbell")!;
    expect(bar.at[1] + 27).toBeCloseTo(264, 0);
  });
  it("draws finite shared white sketches and keeps the camera fixed through the entire movement", () => {
    for (const [id, m] of models) {
      const camera = m.sample(0).spatial.camera;
      for (const p of [0, 0.17, 0.37, 0.5, 0.73, 0.98]) {
        const s = m.sample(p),
          svg = rig.drawBallwiseAthlete(s);
        expect(s.spatial.camera, id).toEqual(camera);
        expect(svg).toContain("bw-human-spatial");
        expect(svg).not.toMatch(/NaN|Infinity|undefined|<circle/);
        expect(rig.BWDrawHuman.points(s).every((p) => p.every(Number.isFinite))).toBe(true);
      }
    }
  });
  it("projects the optional box in the same space as the back-squat and preserves its tempo phase", () => {
    const model = rig.BWMotionLibrary.withVariant("heavy_back_squat", "box_touch"),
      s = model.sample(0.48);
    expect(s.spatial.gear.some((g) => g.kind === "box" && g.min?.[1] === 203)).toBe(true);
    expect(s.phase).toBe(rig.BWAnim.models.heavy_back_squat.sample(0.48).phase);
  });
});
