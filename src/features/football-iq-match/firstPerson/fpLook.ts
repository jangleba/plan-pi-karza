/** Looking around by turning the phone (device orientation → camera quaternion), with a
 * finger-drag fallback when motion data is missing, denied or not supported.
 *
 * The look direction is a control only: it aims the first touch and the pass. It is kept
 * apart from the simulated body facing and is never treated as a measure of where the
 * player's eyes or head were.
 */
import { Euler, Quaternion, Vector3 } from "three";

const ZEE = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;
/** The camera looks out of the back of the device, not along its top edge. */
const Q_BACK = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const euler = new Euler();
const q0 = new Quaternion();

/** W3C device orientation (degrees) + screen rotation (degrees) → camera quaternion in a
 * three.js world where +Y is up. Correct in portrait and both landscape directions. */
export function deviceQuaternion(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle: number,
  out = new Quaternion(),
) {
  euler.set(beta * DEG, alpha * DEG, -gamma * DEG, "YXZ");
  out.setFromEuler(euler);
  out.multiply(Q_BACK);
  out.multiply(q0.setFromAxisAngle(ZEE, -screenAngle * DEG));
  return out;
}

const forward = new Vector3();
/** Horizontal look direction: 0 looks along −Z, positive turns towards −X (counter-clockwise). */
export function yawOf(q: Quaternion) {
  forward.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-forward.x, -forward.z);
}
export function pitchOf(q: Quaternion) {
  forward.set(0, 0, -1).applyQuaternion(q);
  return Math.asin(Math.max(-1, Math.min(1, forward.y)));
}
export const yawQuaternion = (yaw: number, out = new Quaternion()) =>
  out.setFromAxisAngle(Y_AXIS, yaw);

export function currentScreenAngle(): number {
  if (typeof window === "undefined") return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === "number") return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

export type LookStatus = "drag" | "asking" | "motion" | "denied" | "unavailable";
type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type LookOptions = {
  target: HTMLElement;
  onStatus?: (status: LookStatus) => void;
  /** Milliseconds without a usable sample before falling back to dragging. */
  sensorTimeout?: number;
  now?: () => number;
  /** Starting up/down angle of the drag view in radians (default slightly down). */
  initialPitch?: number;
};

/** Holds the camera orientation. Call update(dt) once per rendered frame. */
export class LookController {
  readonly quaternion = new Quaternion();
  status: LookStatus = "drag";
  private device = new Quaternion();
  private hasSample = false;
  private calibration = new Quaternion();
  private calibrationYaw = 0;
  private pendingYaw: number | null = null;
  private dragYaw = 0;
  private dragPitch = -0.08;
  private dragging: { id: number; x: number; y: number } | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  private readonly smooth = new Quaternion();
  private readonly options: LookOptions;

  constructor(options: LookOptions) {
    this.options = options;
    if (options.initialPitch !== undefined) this.dragPitch = options.initialPitch;
    options.target.addEventListener("pointerdown", this.onDown);
    options.target.addEventListener("pointermove", this.onMove);
    options.target.addEventListener("pointerup", this.onUp);
    options.target.addEventListener("pointercancel", this.onUp);
    this.applyDrag();
    this.quaternion.copy(this.smooth);
  }

  /** Must run inside a tap on iOS (motion permission). Falls back to dragging on any problem. */
  async enableMotion(): Promise<LookStatus> {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      this.setStatus("unavailable");
      return this.status;
    }
    const ctor = DeviceOrientationEvent as OrientationEventCtor;
    if (typeof ctor.requestPermission === "function") {
      this.setStatus("asking");
      try {
        const answer = await ctor.requestPermission();
        if (answer !== "granted") {
          this.setStatus("denied");
          return this.status;
        }
      } catch {
        this.setStatus("denied");
        return this.status;
      }
    }
    this.listen();
    this.setStatus("asking");
    this.armWatchdog();
    return this.status;
  }

  /** Makes the current view look in `yaw` (keeps the up/down angle). */
  recenter(yaw: number) {
    if (this.status === "motion" && this.hasSample) {
      const deviceYaw = yawOf(this.device);
      this.calibrationYaw = yaw - deviceYaw;
      yawQuaternion(this.calibrationYaw, this.calibration);
    } else {
      this.dragYaw = yaw;
      this.applyDrag();
    }
    this.pendingYaw = this.status === "motion" && !this.hasSample ? yaw : null;
    this.snap();
  }

  /** After the app comes back: keep the view where it was (the sensor's zero may have moved). */
  resume() {
    if (this.status === "motion") {
      this.pendingYaw = yawOf(this.quaternion);
      this.hasSample = false;
      this.armWatchdog();
    }
  }

  update(dt: number) {
    if (this.status === "motion" && this.hasSample) {
      this.smooth.copy(this.calibration).multiply(this.device);
    } else if (this.status !== "motion") this.applyDrag();
    // Light smoothing against sensor jitter; ~40 ms time constant, frame-rate independent.
    const t = 1 - Math.exp(-Math.max(0, dt) / 0.04);
    this.quaternion.slerp(this.smooth, Math.min(1, t));
    return this.quaternion;
  }

  snap() {
    if (this.status === "motion" && this.hasSample)
      this.smooth.copy(this.calibration).multiply(this.device);
    else this.applyDrag();
    this.quaternion.copy(this.smooth);
  }

  dispose() {
    const t = this.options.target;
    t.removeEventListener("pointerdown", this.onDown);
    t.removeEventListener("pointermove", this.onMove);
    t.removeEventListener("pointerup", this.onUp);
    t.removeEventListener("pointercancel", this.onUp);
    if (this.listening) window.removeEventListener("deviceorientation", this.onOrientation);
    this.listening = false;
    if (this.watchdog) clearTimeout(this.watchdog);
  }

  /** Test hook and event handler: one orientation sample. */
  readonly onOrientation = (event: Pick<DeviceOrientationEvent, "alpha" | "beta" | "gamma">) => {
    if (event.alpha === null || event.beta === null || event.gamma === null) return;
    if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
    deviceQuaternion(event.alpha, event.beta, event.gamma, currentScreenAngle(), this.device);
    const first = !this.hasSample;
    this.hasSample = true;
    if (this.status !== "motion") this.setStatus("motion");
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (first) {
      const keep = this.pendingYaw ?? yawOf(this.quaternion);
      this.pendingYaw = null;
      this.calibrationYaw = keep - yawOf(this.device);
      yawQuaternion(this.calibrationYaw, this.calibration);
      this.snap();
    }
  };

  private listen() {
    if (this.listening) return;
    window.addEventListener("deviceorientation", this.onOrientation);
    this.listening = true;
  }
  private armWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (!this.hasSample) this.setStatus("unavailable");
    }, this.options.sensorTimeout ?? 1500);
  }
  private setStatus(status: LookStatus) {
    if (status === this.status) return;
    // Without motion data the view continues from where it was.
    if (status === "unavailable" || status === "denied") {
      this.dragYaw = yawOf(this.quaternion);
      this.dragPitch = pitchOf(this.quaternion);
    }
    this.status = status;
    this.options.onStatus?.(status);
  }
  private applyDrag() {
    euler.set(this.dragPitch, this.dragYaw, 0, "YXZ");
    this.smooth.setFromEuler(euler);
  }
  private readonly onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private readonly onMove = (e: PointerEvent) => {
    if (!this.dragging || this.dragging.id !== e.pointerId) return;
    const dx = e.clientX - this.dragging.x,
      dy = e.clientY - this.dragging.y;
    this.dragging.x = e.clientX;
    this.dragging.y = e.clientY;
    // Dragging the picture: move the finger left to look right (like moving a photo).
    const k = 0.0055;
    if (this.status === "motion") {
      this.calibrationYaw += dx * k;
      yawQuaternion(this.calibrationYaw, this.calibration);
    } else {
      this.dragYaw += dx * k;
      this.dragPitch = Math.max(-1.25, Math.min(0.5, this.dragPitch + dy * k));
    }
  };
  private readonly onUp = (e: PointerEvent) => {
    if (this.dragging?.id === e.pointerId) this.dragging = null;
  };
}
