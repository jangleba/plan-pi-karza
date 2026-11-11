// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { deviceQuaternion, LookController, pitchOf, yawOf } from "./fpLook";

const DEG = Math.PI / 180;
/** W3C device frame → world (east, north, up), R = Rz(α)·Rx(β)·Ry(γ). */
function deviceAxes(alpha: number, beta: number, gamma: number) {
  const m = new Matrix4()
    .makeRotationZ(alpha * DEG)
    .multiply(new Matrix4().makeRotationX(beta * DEG))
    .multiply(new Matrix4().makeRotationY(gamma * DEG));
  const axis = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
  // three.js world: x = east, y = up, z = south.
  const toThree = (w: Vector3) => new Vector3(w.x, w.z, -w.y);
  return { x: toThree(axis(1, 0, 0)), y: toThree(axis(0, 1, 0)), z: toThree(axis(0, 0, 1)) };
}

describe("device orientation → camera", () => {
  it("looks out of the back of the phone with the screen's up as camera up, in every screen rotation", () => {
    const poses = [
      [0, 90, 0],
      [30, 80, 10],
      [200, 60, -25],
      [90, 10, -80],
      [300, 120, 40],
    ];
    for (const [a, b, g] of poses) {
      const axes = deviceAxes(a!, b!, g!);
      for (const [screen, up] of [
        [0, axes.y],
        [90, axes.x],
        [-90, axes.x.clone().negate()],
        [180, axes.y.clone().negate()],
      ] as const) {
        const q = deviceQuaternion(a!, b!, g!, screen);
        const forward = new Vector3(0, 0, -1).applyQuaternion(q);
        const camUp = new Vector3(0, 1, 0).applyQuaternion(q);
        expect(forward.distanceTo(axes.z.clone().negate())).toBeLessThan(1e-6);
        expect(camUp.distanceTo(up)).toBeLessThan(1e-6);
      }
    }
  });

  it("holding the phone upright looks at the horizon", () => {
    const portrait = deviceQuaternion(0, 90, 0, 0);
    expect(pitchOf(portrait)).toBeCloseTo(0, 6);
    // Landscape, phone turned left (screen angle 90): device upright means gamma ≈ −90.
    const landscape = deviceQuaternion(0, 0, -90, 90);
    expect(Math.abs(pitchOf(landscape))).toBeLessThan(1e-6);
  });
});

describe("LookController", () => {
  afterEach(() => vi.useRealTimers());

  it("calibrates: after recentering the current phone direction looks the chosen way", async () => {
    const host = document.createElement("div");
    const look = new LookController({ target: host, sensorTimeout: 1000 });
    await look.enableMotion();
    look.onOrientation({ alpha: 137, beta: 85, gamma: 3 });
    look.recenter(0.7);
    look.update(1);
    expect(yawOf(look.quaternion)).toBeCloseTo(0.7, 5);
    // Turning the phone 30° to the left turns the view 30° to the left.
    look.onOrientation({ alpha: 167, beta: 85, gamma: 3 });
    look.update(1);
    expect(yawOf(look.quaternion)).toBeCloseTo(0.7 + 30 * DEG, 2);
    look.dispose();
  });

  it("falls back to dragging when no sensor data arrives, and keeps the view", async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const host = document.createElement("div");
    const look = new LookController({
      target: host,
      sensorTimeout: 500,
      onStatus: (s) => statuses.push(s),
    });
    look.recenter(1.2);
    await look.enableMotion();
    vi.advanceTimersByTime(600);
    expect(look.status).toBe("unavailable");
    expect(statuses).toContain("unavailable");
    look.update(1);
    expect(yawOf(look.quaternion)).toBeCloseTo(1.2, 5);
    // Drag left → view turns.
    host.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 100, button: 0 }),
    );
    host.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    host.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 100, clientY: 100 }));
    look.update(1);
    expect(yawOf(look.quaternion)).not.toBeCloseTo(1.2, 2);
    look.dispose();
  });

  it("handles a refused motion permission (iOS)", async () => {
    const original = (DeviceOrientationEvent as unknown as { requestPermission?: unknown })
      .requestPermission;
    (
      DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
    ).requestPermission = () => Promise.resolve("denied");
    const look = new LookController({ target: document.createElement("div") });
    expect(await look.enableMotion()).toBe("denied");
    (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission =
      original;
    look.dispose();
  });

  it("keeps the view direction when the app comes back (sensor zero may move)", async () => {
    const look = new LookController({ target: document.createElement("div") });
    await look.enableMotion();
    look.onOrientation({ alpha: 10, beta: 90, gamma: 0 });
    look.recenter(-0.4);
    look.update(1);
    look.resume();
    // After resume the sensor reports a very different heading for the same physical pose.
    look.onOrientation({ alpha: 250, beta: 90, gamma: 0 });
    look.update(1);
    expect(yawOf(look.quaternion)).toBeCloseTo(-0.4, 4);
    look.dispose();
  });

  it("ignores empty sensor samples", async () => {
    const look = new LookController({ target: document.createElement("div") });
    await look.enableMotion();
    look.onOrientation({ alpha: null, beta: null, gamma: null });
    expect(look.status).toBe("asking");
    look.dispose();
    void Quaternion;
  });
});
