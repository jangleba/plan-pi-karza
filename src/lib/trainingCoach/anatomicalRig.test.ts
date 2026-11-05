import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
type P = [number, number];
interface Scene {
  hip: P;
  right: { knee: P; ankle: P };
  left: { knee: P; ankle: P };
  view?: string;
  projection?: string;
  opacity?: number;
  torsoAngle?: number;
}
interface Rig {
  BWAnim: { models: Record<string, { sample(p: number): Scene }> };
  BWMotionLibrary: { register(records: unknown[]): void };
  BWDrawHuman: {
    armPoints(
      s: Scene,
      side: string,
      angle: number,
      front: boolean,
    ): { shoulder: P; elbow: P; wrist: P };
  };
  drawBallwiseAthlete(s: Scene): string;
}
const root = new URL("../../../public/technique/animations/", import.meta.url),
  context = vm.createContext({});
for (const file of ["engine", "human", "movements"])
  vm.runInContext(readFileSync(new URL(file + ".js", root), "utf8"), context);
const rig = context as unknown as Rig;
rig.BWMotionLibrary.register(
  JSON.parse(readFileSync(new URL("catalog.json", root), "utf8")).records,
);
const flex = (a: P, b: P, c: P) => {
  const x = [a[0] - b[0], a[1] - b[1]],
    y = [c[0] - b[0], c[1] - b[1]];
  return (
    180 -
    (Math.acos(
      Math.max(
        -1,
        Math.min(1, (x[0] * y[0] + x[1] * y[1]) / (Math.hypot(...x) * Math.hypot(...y))),
      ),
    ) *
      180) /
      Math.PI
  );
};
describe("anatomical teaching sketch", () => {
  it("avoids folded-through elbows and reversed knees in every visible phase", () => {
    // Conservative drawing constraints, not a prescribed personal range of motion.
    for (const [id, model] of Object.entries(rig.BWAnim.models))
      for (let i = 0; i < 120; i++) {
        const s = model.sample(i / 120);
        if ((s.opacity ?? 1) < 0.2) continue;
        for (const side of ["right", "left"] as const) {
          const a = rig.BWDrawHuman.armPoints(s, side, s.torsoAngle ?? 0, s.view === "front"),
            l = s[side];
          expect(flex(a.shoulder, a.elbow, a.wrist), id + ":elbow").toBeLessThanOrEqual(155.1);
          expect(flex(s.hip, l.knee, l.ankle), id + ":knee").toBeLessThanOrEqual(160.1);
          if (s.view !== "front" && s.projection !== "frontal") {
            const thigh = [l.knee[0] - s.hip[0], l.knee[1] - s.hip[1]],
              shin = [l.ankle[0] - l.knee[0], l.ankle[1] - l.knee[1]];
            expect(
              thigh[0] * shin[1] - thigh[1] * shin[0],
              id + ":knee-direction",
            ).toBeGreaterThanOrEqual(-3);
          }
        }
      }
  });
  it("uses white interiors and fine muscle traces, without coloured panels or joint rings", () => {
    for (const id of ["heavy_back_squat", "push_up", "a_skip", "plank", "bwprep:adductor"]) {
      const svg = rig.drawBallwiseAthlete(rig.BWAnim.models[id].sample(0.4));
      expect(svg).toContain("bw-human-sketch");
      expect(svg).toContain("bw-muscle-traces");
      expect(svg).not.toContain("<circle");
      for (const match of svg.matchAll(/fill="([^"]+)"/g))
        expect(["#fff", "none"]).toContain(match[1]);
    }
  });
});
