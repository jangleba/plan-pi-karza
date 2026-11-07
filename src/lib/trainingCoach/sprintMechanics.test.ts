import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type P = [number, number];
interface Leg {
  knee: P;
  ankle: P;
  contact: boolean;
  footAngle: number;
}
interface Scene {
  hip: P;
  right: Leg;
  left: Leg;
  torsoAngle: number;
}
interface Runtime {
  BWAnim: { runningSample(p: number, lean: number): Scene };
  BWDrawHuman: {
    armPoints(s: Scene, side: string, angle: number, front: boolean): Record<string, P>;
  };
}
const folder = new URL("../../../public/technique/animations/", import.meta.url),
  context = vm.createContext({});
for (const name of ["engine", "human"])
  vm.runInContext(readFileSync(new URL(name + ".js", folder), "utf8"), context);
const rig = context as unknown as Runtime;
const deg = (r: number) => (r * 180) / Math.PI;
// Thigh angle from vertical, positive in front of the hip.
const thigh = (s: Scene) => deg(Math.atan2(s.right.knee[0] - s.hip[0], s.right.knee[1] - s.hip[1]));
const kneeFlexion = (s: Scene) =>
  thigh(s) -
  deg(Math.atan2(s.right.ankle[0] - s.right.knee[0], s.right.ankle[1] - s.right.knee[1]));

function cycle(lean: number) {
  const frames = Array.from({ length: 1001 }, (_, i) => rig.BWAnim.runningSample(i / 1000, lean));
  const toeOff = frames.find((s, i) => s.right.contact && !frames[i + 1]?.right.contact)!;
  const touchdown = frames.find(
    (s, i) => i > 0 && s.right.contact && !frames[i - 1].right.contact,
  )!;
  const peak = Math.max(...frames.filter((s) => !s.right.contact).map(thigh));
  return { frames, toeOff, touchdown, peak };
}

describe("sprint technique teaching targets", () => {
  it("extends hip, knee and ankle at toe-off in acceleration", () => {
    const { toeOff, peak } = cycle(30);
    expect(thigh(toeOff)).toBeLessThan(-15);
    expect(kneeFlexion(toeOff)).toBeLessThan(25);
    expect(toeOff.right.footAngle).toBeGreaterThanOrEqual(35);
    expect(peak).toBeGreaterThan(55);
    expect(peak).toBeLessThan(75);
  });
  it("lands ahead of the hip, extends behind and keeps the knee below horizontal at max velocity", () => {
    const { toeOff, touchdown, peak } = cycle(4);
    expect(touchdown.right.ankle[0] - touchdown.hip[0]).toBeGreaterThan(15);
    expect(thigh(toeOff)).toBeLessThan(-5);
    expect(peak).toBeGreaterThan(65);
    expect(peak).toBeLessThan(80);
  });
  it("swings the arms opposite to the legs with a changing elbow angle", () => {
    const { frames } = cycle(4);
    const elbows: number[] = [];
    for (const s of frames.filter((_, i) => i % 50 === 0)) {
      const a = rig.BWDrawHuman.armPoints(s, "right", s.torsoAngle, false);
      const upper = deg(Math.atan2(a.elbow[0] - a.shoulder[0], a.elbow[1] - a.shoulder[1]));
      const u = [a.elbow[0] - a.shoulder[0], a.elbow[1] - a.shoulder[1]],
        f = [a.wrist[0] - a.elbow[0], a.wrist[1] - a.elbow[1]];
      elbows.push(
        180 - deg(Math.acos((u[0] * f[0] + u[1] * f[1]) / Math.hypot(...u) / Math.hypot(...f))),
      );
      // Contralateral: the right arm is forward while the left thigh leads.
      const left = deg(Math.atan2(s.left.knee[0] - s.hip[0], s.left.knee[1] - s.hip[1]));
      if (Math.abs(left - thigh(s)) > 20 && Math.abs(upper + s.torsoAngle) > 15)
        expect(Math.sign(upper + s.torsoAngle)).toBe(Math.sign(left - thigh(s)));
    }
    expect(Math.max(...elbows) - Math.min(...elbows)).toBeGreaterThan(25);
  });
});
