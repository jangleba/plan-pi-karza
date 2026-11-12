import { Object3D, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveResolution, FixedStep, precompileScene } from "./fpScene";

describe("render loop helpers", () => {
  it("runs whole fixed steps and caps a long frame (no spiral after a stall)", () => {
    const step = new FixedStep(1 / 60, 0.1);
    let n = 0;
    step.advance(1 / 30, () => void n++);
    expect(n).toBe(2);
    n = 0;
    step.advance(5, () => void n++); // app was frozen for 5 s
    expect(n).toBe(6);
    n = 0;
    const blend = step.advance(1 / 120, () => void n++);
    expect(blend).toBeGreaterThanOrEqual(0);
    expect(blend).toBeLessThan(1);
  });

  it("lowers the resolution on slow frames and raises it again when there is room", () => {
    const r = new AdaptiveResolution(0.85, 2);
    expect(r.ratio).toBe(2);
    let changed: number | null = null;
    for (let i = 0; i < 120 && changed === null; i++) changed = r.sample(30);
    expect(changed).toBeLessThan(2);
    for (let i = 0; i < 2000; i++) r.sample(30);
    expect(r.ratio).toBe(0.85);
    for (let i = 0; i < 2000; i++) r.sample(8);
    expect(r.ratio).toBe(2);
  });
});

describe("shader precompilation before the first frame", () => {
  const scene = new Object3D(),
    camera = new PerspectiveCamera();
  it("compiles the whole scene once", async () => {
    const compileAsync = vi.fn(() => Promise.resolve());
    await precompileScene({ compileAsync }, scene, camera);
    expect(compileAsync).toHaveBeenCalledWith(scene, camera);
  });
  it("never blocks the scene: errors and old renderers fall back to compiling on first use", async () => {
    await expect(
      precompileScene({ compileAsync: () => Promise.reject(new Error("lost")) }, scene, camera),
    ).resolves.toBeUndefined();
    await expect(precompileScene({}, scene, camera)).resolves.toBeUndefined();
  });
  it("skips the work when the screen was already closed", async () => {
    const compileAsync = vi.fn(() => Promise.resolve());
    const controller = new AbortController();
    controller.abort();
    await precompileScene({ compileAsync }, scene, camera, controller.signal);
    expect(compileAsync).not.toHaveBeenCalled();
  });
});
