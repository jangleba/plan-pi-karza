/** Shared motion and ball physics of the first-person simulators (3v2 and 5v5).
 *
 * Moved here unchanged from the 3v2 simulator, so saved 3v2 attempts replay exactly as
 * before. All functions are pure and run at the fixed simulator step.
 */
import {
  add,
  angleDiff,
  clamp,
  dirOf,
  dist,
  dot,
  headingOf,
  len,
  norm,
  scale,
  sub,
  v,
  type V,
} from "./fpMath";

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const GRAVITY = 9.81;
export const ROLL_DECEL = 1.6;
export const ROLL_DRAG = 0.012;

/** What the movement model needs from a player. */
export type MotionBody = {
  pos: V;
  vel: V;
  /** Body facing (heading). */
  heading: number;
  target: V;
  top: number;
  face: V | null;
  maxSpeed: number;
  accel: number;
  /** Gait cycles travelled, drives the run/walk clip so feet match the ground speed. */
  stride: number;
};

/** One fixed step of a player's movement: acceleration, braking, grip-limited turns, body
 * facing and gait. `faceAlways`: keep facing the face point even when running. */
export function moveBody(a: MotionBody, faceAlways = false) {
  const toTarget = sub(a.target, a.pos);
  const d = len(toTarget);
  const want = norm(toTarget);
  // Arrive: brake so the player stops on the spot (deceleration ~6.5 m/s²).
  let top = Math.min(a.top, Math.sqrt(2 * 6.5 * 0.8 * Math.max(0, d - 0.15)));
  // Moving against the body facing is slow until the body has turned.
  if (top > 0.5 && Math.abs(angleDiff(a.heading, headingOf(want))) > 1.9) top = Math.min(top, 3.2);
  const desired = scale(want, d > 0.05 ? top : 0);
  const speed = len(a.vel);
  const wanted = len(desired);
  if (speed < 1.0) {
    // From (almost) standing a player can step off in any direction.
    const dv = sub(desired, a.vel);
    const lim = a.accel * DT;
    a.vel = add(a.vel, len(dv) > lim ? scale(norm(dv), lim) : dv);
  } else {
    // Running: the direction turns with limited grip (about 9 m/s² sideways), so tight turns
    // need lower speed; a big change of direction means braking first.
    const current = headingOf(a.vel);
    const diff = wanted > 0.05 ? angleDiff(current, headingOf(desired)) : 0;
    const maxTurn = ((speed < 3.5 ? 12 : 9) / speed) * DT;
    const heading = current + clamp(diff, -maxTurn, maxTurn);
    // Small corrections keep the speed; a cut of 90° or more needs braking first.
    const cut = Math.abs(diff);
    const along = wanted * (cut < 1.6 ? Math.max(0.45, Math.cos(cut)) : 0);
    const accelNow = a.accel * Math.max(0.05, 1 - speed / a.maxSpeed);
    const next = speed + clamp(along - speed, -6.5 * DT, accelNow * DT);
    a.vel = scale(dirOf(heading), Math.max(0, next));
  }
  const sp = len(a.vel);
  if (sp > a.maxSpeed) a.vel = scale(a.vel, a.maxSpeed / sp);
  a.pos = add(a.pos, scale(a.vel, DT));
  // Body facing: along the run when running, towards the face point when slow.
  const turnRate = 9 - 6 * clamp(sp / a.maxSpeed, 0, 1);
  let faceHeading: number | null = null;
  // Face the ball when standing or shuffling; a sprint turns the body into the run.
  const shuffling = sp < 2.6 || (a.top <= 4.5 && sp < 4.6);
  if (a.face && (shuffling || faceAlways)) faceHeading = headingOf(sub(a.face, a.pos));
  else if (sp > 1.0) faceHeading = headingOf(a.vel);
  if (faceHeading !== null && (a.face ? dist(a.face, a.pos) > 0.3 : true)) {
    const diff = angleDiff(a.heading, faceHeading);
    a.heading += clamp(diff, -turnRate * DT, turnRate * DT);
  }
  // Gait: a stride cycle is longer at speed (≈1.6 m walking, up to ≈4.6 m sprinting).
  const cycle = sp < 2.2 ? 1.55 : 1.8 + 0.37 * sp;
  a.stride += (sp * DT) / cycle;
  return sp;
}

/** Sprint model v(t) = vmax(1 − e^(−t/τ)), τ = vmax / a0. Distance covered after t seconds. */
export function covered(a: Pick<MotionBody, "maxSpeed" | "accel">, t: number) {
  const tau = a.maxSpeed / a.accel;
  return t <= 0 ? 0 : a.maxSpeed * (t - tau * (1 - Math.exp(-t / tau)));
}
/** Can this player reach the point within `time` seconds (starting speed along the way counts)? */
export function canReach(a: MotionBody, to: V, time: number, reach = 0.8) {
  const d = Math.max(0, dist(a.pos, to) - reach);
  if (d <= 0) return true;
  const way = norm(sub(to, a.pos));
  const along = len(a.vel) > 0.1 ? dot(a.vel, way) : 0;
  const u = clamp(along, 0, a.maxSpeed * 0.98);
  const tau = a.maxSpeed / a.accel;
  const t0 = -tau * Math.log(1 - u / a.maxSpeed);
  // Turning round to run the other way costs time.
  const turn = (Math.abs(angleDiff(a.heading, headingOf(way))) / 7) * 0.6;
  return covered(a, t0 + time - turn) - covered(a, t0) >= d;
}

/** One step of a free ball: flight with gravity and bounce, or rolling with friction + drag. */
export function advanceBall(p: V, vel: V, h: number, vh: number, dt: number) {
  if (h > 0.115 || vh > 0) {
    vh -= GRAVITY * dt;
    h += vh * dt;
    p = add(p, scale(vel, dt));
    if (h <= 0.11) {
      h = 0.11;
      if (Math.abs(vh) > 1.5) {
        vh = -vh * 0.42;
        vel = scale(vel, 0.72);
      } else vh = 0;
    }
  } else {
    const speed = len(vel);
    const next = Math.max(0, speed - (ROLL_DECEL + ROLL_DRAG * speed * speed) * dt);
    vel = speed > 1e-6 ? scale(vel, next / speed) : v(0, 0);
    p = add(p, scale(vel, dt));
  }
  return { p, vel, h, vh };
}

export type BallSample = { t: number; p: V; h: number };
export type FreeBall = { pos: V; vel: V; h: number; vh: number };
/** Where the free ball will be over the next seconds (same physics as the step). */
export function ballFuture(ball: FreeBall, seconds = 3.2, step = 0.05): BallSample[] {
  const out: BallSample[] = [];
  let p = { ...ball.pos },
    vel = { ...ball.vel },
    h = ball.h,
    vh = ball.vh;
  for (let t = step; t <= seconds; t += step) {
    ({ p, vel, h, vh } = advanceBall(p, vel, h, vh, step));
    out.push({ t, p, h });
    if (len(vel) < 0.2 && h <= 0.12) break;
  }
  return out;
}

/** Kick speed so a rolling ball covers `d` metres and still arrives at `arrive` m/s. */
export function groundSpeedFor(d: number, arrive: number) {
  const speedAt = (v0: number) => {
    let speed = v0,
      travelled = 0;
    const dt = 1 / 120;
    while (travelled < d && speed > 0) {
      travelled += speed * dt;
      speed -= (ROLL_DECEL + ROLL_DRAG * speed * speed) * dt;
    }
    return travelled >= d ? speed : -1;
  };
  let lo = arrive,
    hi = 30;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (speedAt(mid) >= arrive) hi = mid;
    else lo = mid;
  }
  return Math.min(28, hi);
}
