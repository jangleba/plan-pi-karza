import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { getApprovedExerciseDefinitions } from "@/lib/loadwise/exerciseLibrary";
import { resolveExerciseAnimation } from "./animationCatalog";
import library from "./movement-library.json";

type Point = [number, number];
interface Leg {
  knee: Point;
  ankle: Point;
  contact: boolean;
  footAngle?: number;
  contactSurface?: string;
}
interface Pose {
  hip: Point;
  right: Leg;
  left: Leg;
  torsoAngle?: number;
  view?: string;
  phase: string;
  extras?: string;
  frontExtras?: string;
  breath?: number;
  arms?: unknown;
  handTargets?: unknown;
}
interface Runtime {
  BWAnim: {
    models: Record<string, { sample(p: number): Pose; durationMs: number; sequence?: string[] }>;
  };
  BWMotionLibrary: { register(records: unknown[]): void };
  BWDrawHuman: {
    style: string;
    points(scene: Pose): Point[];
    armPoints(scene: Pose, side: string, angle: number, front: boolean): { wrist: Point };
  };
  drawBallwiseAthlete(scene: Pose): string;
}
const folder = new URL("../../../public/technique/animations/", import.meta.url);
const runtime = vm.createContext({}) as unknown as Runtime;
for (const file of ["engine", "human", "movements"])
  vm.runInContext(
    readFileSync(new URL(`${file}.js`, folder), "utf8"),
    runtime as unknown as vm.Context,
  );
runtime.BWMotionLibrary.register(library.records);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("complete shared exercise demonstrations", () => {
  it("resolves reviewed demonstrations and explicitly identifies new instruction-only drills", () => {
    const definitions = getApprovedExerciseDefinitions();
    expect(definitions).toHaveLength(207);
    for (const definition of definitions) {
      const selection = resolveExerciseAnimation({
        id: definition.id,
        exerciseId: definition.id,
        name: definition.displayNamePl,
      });
      if (["wicket_run", "resisted_a_march"].includes(definition.id)) {
        expect(selection, definition.id).toBeNull();
        expect(definition.instructionsPl?.length).toBe(3);
        continue;
      }
      expect(selection, definition.id).not.toBeNull();
      expect(runtime.BWAnim.models[selection!.id], definition.id).toBeDefined();
    }
    for (const id of [
      "walk",
      "ankle",
      "calf",
      "soleus",
      "hamstring",
      "quad",
      "hip",
      "adductor",
      "cat",
      "rotation",
      "squat",
      "march",
      "run",
      "bridge",
    ]) {
      expect(runtime.BWAnim.models[`bwprep:${id}`], id).toBeDefined();
      expect(readFileSync(new URL(`thumbs/${id}.svg`, folder), "utf8")).toContain(
        "bw-human-natural",
      );
    }
  });
  it("routes the two new isometrics to distinct static demonstrations with their own instructions", () => {
    for (const id of ["split_squat_iso_hold", "overcoming_pin_squat_primer"]) {
      const definition = getApprovedExerciseDefinitions().find((exercise) => exercise.id === id)!;
      const selection = resolveExerciseAnimation({
        id,
        exerciseId: id,
        name: definition.displayNamePl,
      });
      expect(selection?.id).toBe(id);
      const record = library.records.find((entry) => entry.id === id)!;
      expect(record.instructions).toEqual(definition.instructionsPl);
      const model = runtime.BWAnim.models[id];
      expect(model.sample(0.25).hip).toEqual(model.sample(0.75).hip);
    }
    expect(runtime.BWAnim.models.split_squat_iso_hold.sample(0.25).phase).toContain("bez ruchu");
    const primer = library.records.find((entry) => entry.id === "overcoming_pin_squat_primer")!;
    expect(primer.instructions.join(" ")).toContain("pełne 5 minut");
  });
  it("renders finite poses in the same human style through every phase", () => {
    expect(runtime.BWDrawHuman.style).toBe("anatomical-outline-60");
    for (const [id, model] of Object.entries(runtime.BWAnim.models))
      for (let i = 0; i < 40; i++) {
        const pose = model.sample(i / 40),
          svg = runtime.drawBallwiseAthlete(pose);
        expect(svg, id).toContain("bw-human-natural");
        expect(svg, id).not.toMatch(/NaN|Infinity|undefined|<circle/);
        expect(
          runtime.BWDrawHuman.points(pose).every((point) => point.every(Number.isFinite)),
          id,
        ).toBe(true);
        expect(pose.phase, id).toBeTruthy();
      }
  });
  it("keeps the new limb geometry within the shared rig's dimensions", () => {
    for (const record of library.records)
      for (let i = 0; i < 80; i++) {
        const pose = runtime.BWAnim.models[record.id].sample(i / 80);
        for (const side of ["right", "left"] as const) {
          const leg = pose[side];
          expect(distance(pose.hip, leg.knee), `${record.id}:${side}:thigh`).toBeLessThanOrEqual(
            57.5,
          );
          expect(distance(leg.knee, leg.ankle), `${record.id}:${side}:shin`).toBeLessThanOrEqual(
            56.5,
          );
        }
      }
  });
  it("distinguishes weights, supports, hinges, catch and eccentric-only movements", () => {
    const sample = (id: string, p = 0.5) => runtime.BWAnim.models[id].sample(p);
    expect(sample("bodyweight_squat").frontExtras).toBe("");
    expect(sample("heavy_back_squat").frontExtras).toContain("rect");
    expect(sample("goblet_squat").frontExtras).toContain("circle");
    expect(sample("bulgarian_split_squat").extras).toContain("rect");
    expect(sample("barbell_deadlift", 0).hip[1]).toBeGreaterThan(
      sample("barbell_deadlift", 0.5).hip[1],
    );
    expect(sample("barbell_romanian_deadlift", 0).hip[1]).toBeLessThan(
      sample("barbell_romanian_deadlift", 0.5).hip[1],
    );
    expect(sample("power_clean").arms).toBeTruthy();
    expect(sample("clean_pull_from_hang").arms).toBeUndefined();
    expect(sample("eccentric_nordic_hamstring", 0.9).phase).toContain("pomocą rąk");
  });
  it("shows isometric holding, double-support walking and a separate easy jog", () => {
    for (const record of library.records.filter(
      (r) => "isometric" in r.motion && r.motion.isometric,
    )) {
      const model = runtime.BWAnim.models[record.id];
      expect(model.sample(0.25).hip, record.id).toEqual(model.sample(0.75).hip);
    }
    const walk = runtime.BWAnim.models["bwprep:walk"];
    for (let i = 0; i < 120; i++) {
      const s = walk.sample(i / 120);
      expect(s.right.contact || s.left.contact).toBe(true);
    }
    expect(walk.sample(0.04).right.contact && walk.sample(0.04).left.contact).toBe(true);
    expect(runtime.BWAnim.models.easy_aerobic_run.sample(0.2).hip).not.toEqual(
      walk.sample(0.2).hip,
    );
  });
  it("recomputes composite durations when child preparation motions change", () => {
    for (const [id, model] of Object.entries(runtime.BWAnim.models))
      if (model.sequence) {
        expect(model.durationMs, id).toBeCloseTo(
          model.sequence.reduce((n, id) => n + runtime.BWAnim.models[id].durationMs, 0),
          4,
        );
      }
  });
  it("moves the hands and feet continuously when changing support or catching the bar", () => {
    for (const id of [
      "full_nordic_hamstring",
      "eccentric_nordic_hamstring",
      "razor_curl",
      "football_ball_mastery",
      "power_clean",
      "split_squat_jump",
    ]) {
      let previous: Point[] | null = null;
      for (let frame = 0; frame < 1000; frame++) {
        const s = runtime.BWAnim.models[id].sample(frame / 1000);
        const points = [
          s.hip,
          s.right.ankle,
          s.left.ankle,
          ...["right", "left"].map(
            (side) =>
              runtime.BWDrawHuman.armPoints(s, side, s.torsoAngle ?? 0, s.view === "front").wrist,
          ),
        ];
        if (previous)
          for (let i = 0; i < points.length; i++)
            expect(distance(previous[i], points[i]), `${id}:${frame}:${i}`).toBeLessThan(7);
        previous = points;
      }
    }
  });
});
