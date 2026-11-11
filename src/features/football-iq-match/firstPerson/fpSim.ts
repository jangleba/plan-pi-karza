/** Local, deterministic simulator of the 3v2 receive-and-pass situation.
 *
 * Runs at a fixed 60 Hz step, independent of the display frame rate. The same variant
 * and the same inputs give the same match on every device, so an attempt can be replayed
 * from above and checked again when it is restored from a backup.
 *
 * Physics: players accelerate, brake and turn with limited rates (running backwards is
 * slow until the body has turned), the ball rolls with friction or flies with gravity.
 * Offside is judged at the moment of every pass. Nothing here decides the ending in
 * advance: partners and rivals react to the current picture every step.
 */
import {
  PITCH,
  add,
  angleDiff,
  clamp,
  dirOf,
  dist,
  dot,
  gauss,
  headingOf,
  len,
  lerpV,
  norm,
  rng,
  scale,
  segmentDistance,
  sub,
  v,
  type V,
} from "./fpMath";
import type { FpVariant } from "./fpVariants";

export const FP_ENGINE_VERSION = 1;
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const MAX_TICKS = TICK_HZ * 16;
/** Supplied "Soccer Pass" clip: 1.6 s, foot contact at frame 14 of 30 FPS.
 * A quick match pass plays it 1.5× faster; the contact frame still meets the ball. */
export const KICK_CLIP_SECONDS = 1.6;
export const KICK_RATE = 1.5;
export const KICK_CONTACT_TICKS = Math.round((14 / 30 / KICK_RATE) * TICK_HZ);
const RUN_ON_TICKS = 48;
const GRAVITY = 9.81;
const ROLL_DECEL = 1.6;
const ROLL_DRAG = 0.012;
const EYE_FOOT = 0.55;
const POSSESSION_LIMIT = 6 * TICK_HZ;

export const ROLES = ["ty", "support", "runner", "d1", "d2", "gk"] as const;
export type Role = (typeof ROLES)[number];
export type Partner = "support" | "runner";
export const ATTACKERS: readonly Role[] = ["ty", "support", "runner"];
export const DEFENDERS: readonly Role[] = ["d1", "d2", "gk"];
export const isDefender = (r: Role) => r === "d1" || r === "d2" || r === "gk";

export type Aim = { kind: "player"; id: Partner } | { kind: "point"; x: number; y: number };
export type FpInput =
  | { tick: number; kind: "touch"; dir: number }
  | { tick: number; kind: "pass"; aim: Aim; lofted?: boolean }
  | { tick: number; kind: "carry"; dir: number };

export type Anim = "idle" | "run" | "kick";
export type Agent = {
  id: Role;
  pos: V;
  vel: V;
  /** Body facing (heading). The first-person look direction is separate and never stored here. */
  heading: number;
  target: V;
  top: number;
  face: V | null;
  maxSpeed: number;
  accel: number;
  /** Gait cycles travelled, drives the run/walk clip so feet match the ground speed. */
  stride: number;
  anim: Anim;
  animTick: number;
};
export type Ball = { pos: V; vel: V; h: number; vh: number; owner: Role | null; roll: number };
export type OutcomeKind = "chance" | "progress" | "kept" | "loss" | "offside" | "timeout";
export type Outcome = {
  kind: OutcomeKind;
  tick: number;
  by: Role | null;
  detail: "intercept" | "tackle" | "out" | "keeper" | "received" | "carried" | "offside" | "slow";
};
export type FpEvent =
  | { tick: number; type: "pass"; from: Role; to: Aim | null; lofted: boolean; offside: Role[] }
  | { tick: number; type: "touch"; dir: number; quality: number; armed: boolean }
  | { tick: number; type: "control"; by: Role }
  | { tick: number; type: "run"; by: Role }
  | { tick: number; type: "outcome"; outcome: Outcome };
export type Phase = "build" | "incoming" | "touch" | "possession" | "pass" | "done";

export type FrameAgent = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  stride: number;
  anim: Anim;
  animT: number;
};
export type Frame = {
  tick: number;
  agents: FrameAgent[];
  ball: { x: number; y: number; h: number; roll: number; heading: number };
};

type Pending = {
  kind: "pass";
  aim: Aim;
  lofted: boolean;
  stage: "turn" | "windup";
  windupStart: number;
} | null;

export type SimOptions = {
  /** Execution noise is drawn from the variant seed; from this tick on, TY's actions are exact. */
  idealFrom?: number;
  record?: boolean;
};

export type SimState = {
  variant: FpVariant;
  tick: number;
  phase: Phase;
  agents: Record<Role, Agent>;
  ball: Ball;
  armedTouch: number | null;
  pending: Pending;
  carry: { dir: number; until: number } | null;
  pass: {
    from: Role;
    intended: Partner | null;
    lofted: boolean;
    launch: number;
    origin: V;
    target: V;
    offside: Role[];
  } | null;
  controlTick: number | null;
  tackleClock: number;
  jockeyTicks: number;
  runner: { mode: "hold" | "run" | "check"; since: number; runs: number };
  supportMode: "short" | "overlap";
  supportSpot: V | null;
  supportReplan: number;
  outcome: Outcome | null;
  events: FpEvent[];
  frames: Frame[];
  random: () => number;
  idealFrom: number;
  record: boolean;
  touchQuality: number | null;
  touchTick: number | null;
  passError: number | null;
};

const ATT_SPEED = 7.6;
const DEF_SPEED = 7.3;
function agent(id: Role, pos: V, heading: number): Agent {
  const defender = isDefender(id);
  return {
    id,
    pos: { ...pos },
    vel: v(0, 0),
    heading,
    target: { ...pos },
    top: 0,
    face: null,
    maxSpeed: id === "gk" ? 6.5 : defender ? DEF_SPEED : ATT_SPEED,
    // Sprint acceleration a = a0·(1 − v/vmax): about 1.1 s to reach 63% of top speed.
    accel: defender ? 6.6 : 7,
    stride: 0,
    anim: "idle",
    animTick: 0,
  };
}

export function createSim(variant: FpVariant, options: SimOptions = {}): SimState {
  const s = variant.start;
  const agents = {
    ty: agent("ty", s.ty, headingOf(sub(s.support, s.ty))),
    support: agent("support", s.support, headingOf(sub(s.ty, s.support))),
    runner: agent("runner", s.runner, headingOf(sub(s.ty, s.runner))),
    d1: agent("d1", s.d1, headingOf(sub(s.ty, s.d1))),
    d2: agent("d2", s.d2, headingOf(sub(s.ty, s.d2))),
    gk: agent("gk", s.gk, Math.PI),
  } satisfies Record<Role, Agent>;
  const state: SimState = {
    variant,
    tick: 0,
    phase: "build",
    agents,
    ball: {
      pos: add(s.support, scale(dirOf(agents.support.heading), EYE_FOOT)),
      vel: v(0, 0),
      h: 0.11,
      vh: 0,
      owner: "support",
      roll: 0,
    },
    armedTouch: null,
    pending: null,
    carry: null,
    pass: null,
    controlTick: null,
    tackleClock: 0,
    jockeyTicks: 0,
    runner: { mode: "hold", since: 0, runs: 0 },
    supportMode: variant.support,
    supportSpot: null,
    supportReplan: 0,
    outcome: null,
    events: [],
    frames: [],
    random: rng(variant.seed * 104729 + 3),
    idealFrom: options.idealFrom ?? Infinity,
    record: options.record ?? true,
    touchQuality: null,
    touchTick: null,
    passError: null,
  };
  agents.support.anim = "kick";
  agents.support.animTick = 0;
  if (state.record) state.frames.push(frameOf(state));
  return state;
}

// ---------- geometry of the moment ----------

const goalCentre = v(0, PITCH.halfLength);
/** The offside line: the second-last rival (the keeper is normally the last). */
export function offsideLine(s: SimState) {
  const ys = DEFENDERS.map((id) => s.agents[id].pos.y).sort((a, b) => b - a);
  return Math.max(ys[1]!, 0);
}
export function inBox(p: V) {
  return p.y >= PITCH.halfLength - PITCH.boxDepth && Math.abs(p.x) <= PITCH.boxHalfWidth;
}
const inPitch = (p: V) => Math.abs(p.x) <= PITCH.halfWidth && Math.abs(p.y) <= PITCH.halfLength;

/** Sprint model v(t) = vmax(1 − e^(−t/τ)), τ = vmax / a0. Distance covered after t seconds. */
function covered(a: Agent, t: number) {
  const tau = a.maxSpeed / a.accel;
  return t <= 0 ? 0 : a.maxSpeed * (t - tau * (1 - Math.exp(-t / tau)));
}
/** Can this player reach the point within `time` seconds (starting speed along the way counts)? */
export function canReach(a: Agent, to: V, time: number, reach = 0.8) {
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

export type BallSample = { t: number; p: V; h: number };
/** Where the free ball will be over the next seconds (same physics as the step). */
export function ballFuture(ball: Ball, seconds = 3.2, step = 0.05): BallSample[] {
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
function advanceBall(p: V, vel: V, h: number, vh: number, dt: number) {
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

/** Earliest point on the free ball's path this player can reach first (or null). */
export function meetPoint(a: Agent, ball: Ball | BallSample[], delay = 0, reach = 0.8, maxH = 0.6) {
  const samples = Array.isArray(ball) ? ball : ballFuture(ball);
  for (const sample of samples) {
    if (sample.h > maxH) continue;
    if (!inPitch(sample.p)) return null;
    if (canReach(a, sample.p, sample.t - delay, reach)) return sample;
  }
  return null;
}

// ---------- inputs ----------

export function applyInput(s: SimState, input: FpInput) {
  if (s.phase === "done" || s.outcome) return;
  if (input.kind === "touch") {
    if (s.phase === "build" || s.phase === "incoming") s.armedTouch = input.dir;
    return;
  }
  if (input.kind === "carry") {
    if (s.phase !== "possession" || s.pending) return;
    s.carry = { dir: input.dir, until: s.tick + Math.round(TICK_HZ * 0.9) };
    return;
  }
  if (input.kind === "pass") {
    if (s.phase !== "possession" && s.phase !== "touch") return;
    if (s.pending) return;
    s.carry = null;
    s.pending = {
      kind: "pass",
      aim: input.aim,
      lofted: !!input.lofted,
      stage: "turn",
      windupStart: 0,
    };
  }
}

// ---------- the step ----------

export function stepSim(s: SimState, inputs: readonly FpInput[] = []) {
  if (s.phase === "done") return;
  for (const input of inputs) if (input.tick === s.tick) applyInput(s, input);
  think(s);
  actTy(s);
  for (const id of ROLES) moveAgent(s, s.agents[id]);
  moveBall(s);
  contacts(s);
  if (!s.outcome) judgeTime(s);
  s.tick++;
  if (s.outcome && s.tick >= s.outcome.tick + RUN_ON_TICKS) s.phase = "done";
  if (s.tick >= MAX_TICKS) {
    if (!s.outcome) finish(s, { kind: "timeout", by: null, detail: "slow" });
    s.phase = "done";
  }
  if (s.record) s.frames.push(frameOf(s));
}

export function runSim(variant: FpVariant, inputs: readonly FpInput[], options: SimOptions = {}) {
  const s = createSim(variant, options);
  const byTick = new Map<number, FpInput[]>();
  for (const input of inputs) byTick.set(input.tick, [...(byTick.get(input.tick) ?? []), input]);
  while (s.phase !== "done") stepSim(s, byTick.get(s.tick) ?? []);
  return s;
}

function finish(s: SimState, o: Omit<Outcome, "tick">) {
  if (s.outcome) return;
  s.outcome = { ...o, tick: s.tick };
  s.events.push({ tick: s.tick, type: "outcome", outcome: s.outcome });
}
const noisy = (s: SimState) => s.tick < s.idealFrom;

// ---------- AI: partners and rivals react to the picture every step ----------

function setGoal(a: Agent, target: V, top: number, face: V | null = null) {
  a.target = target;
  a.top = top;
  a.face = face;
}

function think(s: SimState) {
  const { agents: A, ball } = s;
  const line = offsideLine(s);
  const ballPos = ball.pos;
  const carrier = ball.owner;
  const sideSign = s.variant.side; // +1: passer left, runner right
  const free = !carrier;

  // --- TY when not acting on an input: meet the incoming ball, then wait on it.
  const ty = A.ty;
  if (s.phase === "build") setGoal(ty, ty.pos, 0, ballPos);
  else if (s.phase === "incoming") {
    const meet = meetPoint(ty, ball, 0, 0.6);
    const towards = meet ? meet.p : ty.pos;
    // Short check towards the ball (≤ 2 m), facing it.
    const step = sub(towards, s.variant.start.ty);
    const target = len(step) > 2 ? add(s.variant.start.ty, scale(norm(step), 2)) : towards;
    setGoal(ty, target, 4.5, ballPos);
  } else if (s.phase === "touch") {
    // Follow the first touch to where the ball will stop; the body turns with it.
    const future = ballFuture(ball, 1.2);
    const rest = future.length ? future[future.length - 1]!.p : ballPos;
    setGoal(ty, rest, ATT_SPEED, rest);
  } else if (s.phase === "possession" && !s.carry && !s.pending) setGoal(ty, ty.pos, 0, null);
  else if (s.phase === "pass" || s.outcome) setGoal(ty, ty.pos, 0, ballPos);

  // --- Free ball after TY's pass: the intended (or best placed) partner meets it.
  const meetFor = new Map<Role, V>();
  if (free && s.phase !== "build" && s.phase !== "incoming" && s.phase !== "touch") {
    const future = ballFuture(ball);
    // The receiver attacks the ball where it was played (into his run) when he gets there in
    // time; otherwise he meets it at the earliest point he can reach.
    const aimed = s.pass?.target;
    const aimedSample = aimed
      ? future.reduce<BallSample | null>(
          (best, x) => (!best || dist(x.p, aimed) < dist(best.p, aimed) ? x : best),
          null,
        )
      : null;
    for (const id of ["support", "runner"] as const) {
      const intended = s.pass?.intended === id || (!s.pass?.intended && aimedSample !== null);
      if (
        intended &&
        aimedSample &&
        aimedSample.h < 0.6 &&
        canReach(A[id], aimedSample.p, aimedSample.t + 0.15, 0.6)
      ) {
        meetFor.set(id, aimedSample.p);
        continue;
      }
      const m = meetPoint(A[id], future, 0, 0.8);
      if (m) meetFor.set(id, m.p);
    }
    for (const id of DEFENDERS) {
      const delay =
        s.pass && s.tick - s.pass.launch < 12 ? (12 - (s.tick - s.pass.launch)) / TICK_HZ : 0;
      const m = meetPoint(
        A[id],
        future,
        delay,
        id === "gk" ? 1.4 : 0.85,
        id === "gk" && inBox(ball.pos) ? 2.3 : 0.6,
      );
      if (m && (id !== "gk" || inBox(m.p))) meetFor.set(id, m.p);
    }
  }

  // --- Support (the first passer).
  const sup = A.support;
  if (s.phase === "build") setGoal(sup, sup.pos, 0, ty.pos);
  else if (
    meetFor.has("support") &&
    (s.pass?.intended === "support" || !s.pass?.intended || s.phase !== "pass")
  )
    setGoal(sup, meetFor.get("support")!, ATT_SPEED, ballPos);
  else if (!s.outcome || s.outcome.by !== "support") {
    if (s.tick >= s.supportReplan) {
      s.supportReplan = s.tick + 12;
      s.supportSpot = supportSpot(s, line, sideSign);
    }
    if (s.supportSpot)
      setGoal(sup, s.supportSpot, s.supportMode === "overlap" ? ATT_SPEED : 5.5, ballPos);
  }

  // --- Runner: lanes and timed runs against the line.
  const run = A.runner;
  if (meetFor.has("runner") && (s.pass?.intended === "runner" || !s.pass?.intended))
    setGoal(run, meetFor.get("runner")!, ATT_SPEED, ballPos);
  else if (!s.outcome || s.outcome.by !== "runner") runnerBrain(s, line, sideSign);

  // --- Rivals: press, shut a side, cover, hold the line.
  defenders(s, line, meetFor);
}

function laneClear(s: SimState, from: V, to: V) {
  let min = 6;
  for (const id of ["d1", "d2"] as const) {
    const sd = segmentDistance(s.agents[id].pos, from, to);
    if (sd.t > 0.04) min = Math.min(min, sd.d + sd.t * 0.8);
  }
  return min;
}

function supportSpot(s: SimState, line: number, sideSign: number): V {
  const { agents: A, ball } = s;
  const anchor =
    ball.owner === "ty" || s.phase === "touch" || s.phase === "incoming" ? A.ty.pos : ball.pos;
  if (s.supportMode === "overlap") {
    // Run past TY on the passer's side into the channel, but stay onside.
    const x = clamp(anchor.x - sideSign * 11, -30, 30);
    const y = Math.min(line - 1, anchor.y + 9);
    // If the lane is shut for too long, change to a short offer.
    if (
      laneClear(s, anchor, A.support.pos) < 1.2 &&
      s.phase === "possession" &&
      s.controlTick !== null &&
      s.tick - s.controlTick > 50
    )
      s.supportMode = "short";
    return v(x, y);
  }
  let best: V | null = null,
    bestScore = -Infinity;
  for (let deg = -170; deg <= 170; deg += 20) {
    for (const r of [8, 11, 14]) {
      const c = add(anchor, scale(dirOf((deg * Math.PI) / 180), r));
      if (!inPitch(c) || c.y > line - 0.8) continue;
      if (dist(c, A.runner.pos) < 7) continue;
      const lane = Math.min(laneClear(s, anchor, c), 4) / 4;
      const forward = clamp((c.y - anchor.y) / 10, -1, 1);
      // Prefer the passer's side: the runner takes the other one.
      const sideFit = Math.sign(c.x - anchor.x) === -sideSign ? 0.15 : 0;
      const score = lane + 0.3 * forward + sideFit - 0.035 * dist(A.support.pos, c);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  if (best && s.supportSpot) {
    const keep = add(anchor, sub(s.supportSpot, anchor));
    const keepScore =
      Math.min(laneClear(s, anchor, keep), 4) / 4 +
      0.3 * clamp((keep.y - anchor.y) / 10, -1, 1) -
      0.035 * dist(A.support.pos, keep);
    if (keepScore > bestScore - 0.12 && keep.y <= line - 0.8 && inPitch(keep)) return keep;
  }
  return best ?? A.support.pos;
}

function runnerBrain(s: SimState, line: number, sideSign: number) {
  const { agents: A } = s;
  const r = A.runner;
  const mode = s.variant.runner;
  const d2 = A.d2.pos;
  const ballAt = s.ball.owner === "ty" || s.phase === "touch" ? A.ty.pos : s.ball.pos;
  const ready = s.phase === "possession" && s.controlTick !== null && s.tick - s.controlTick >= 18;
  const st = s.runner;
  // Out of the cover shadow: shift sideways when the second rival stands on the lane.
  const shadowShift = () => {
    const sd = segmentDistance(d2, ballAt, r.pos);
    if (sd.d < 1.6 && sd.t > 0.2 && sd.t < 0.95) return Math.sign(r.pos.x - d2.x || sideSign) * 3;
    return 0;
  };
  if (st.mode === "run") {
    // Bend the run along the line until the pass is on its way, then go in behind.
    const released =
      s.phase !== "possession" || s.pending?.stage === "windup" || s.tick - st.since > 70;
    // Run off the marker's shoulder: away from the side the second rival stands on.
    const away = Math.sign(r.pos.x - d2.x) || -sideSign;
    const laneX = clamp(r.pos.x + away * 4, -24, 24);
    const runTarget = released ? v(laneX, line + 14) : v(laneX, line - 0.4);
    setGoal(r, runTarget, ATT_SPEED, null);
    // Run not played in time: check back onside and offer again.
    if (s.tick - st.since > 80 && s.phase === "possession") {
      st.mode = "check";
      st.since = s.tick;
    }
    return;
  }
  if (st.mode === "check") {
    setGoal(r, v(r.pos.x, line - 1.6), 6, ballAt);
    if (s.tick - st.since > 55 && r.pos.y < line - 0.5) {
      st.mode = "hold";
      st.since = s.tick;
    }
    return;
  }
  // Hold: depth and wide wait on the line, drop comes short between the lines.
  if (mode === "drop") {
    const x = clamp(r.pos.x + (ballAt.x - r.pos.x) * 0.02 + shadowShift() * 0.1, -30, 30);
    setGoal(r, v(x, line - 7), 5, ballAt);
    // The tight marker followed him out: spin in behind.
    if (ready && dist(A.d2.pos, r.pos) < 3.2 && st.runs < 2 && s.tick - st.since > 30) startRun(s);
    return;
  }
  // Depth and wide wait on the line. Once TY's first touch is made they start moving across
  // the line (still onside), so the run in behind starts from a jog, not from standing.
  const touched = s.touchTick !== null || s.phase === "possession";
  const across = touched && mode === "depth" ? -Math.sign(r.pos.x || sideSign) * 3 : 0;
  const x =
    mode === "wide"
      ? sideSign * 26
      : clamp(s.variant.start.runner.x + shadowShift() + across, -30, 30);
  setGoal(
    r,
    v(x, line - 0.8),
    touched ? 3 : mode === "wide" ? 6.5 : 2.5,
    add(r.pos, v(ballAt.x - r.pos.x || -sideSign, 0)),
  );
  // Synchronised run: go when TY has the ball and can play it forward (his body is open
  // towards the runner or the goal), or as soon as his kick towards the runner starts.
  const ty = A.ty;
  const open =
    Math.abs(angleDiff(ty.heading, headingOf(sub(r.pos, ty.pos)))) < 1.15 ||
    Math.abs(angleDiff(ty.heading, 0)) < 0.8;
  const kickingForward =
    s.pending?.stage === "windup" &&
    (s.pending.aim.kind === "point" || s.pending.aim.id === "runner");
  const go =
    s.phase === "possession" &&
    s.controlTick !== null &&
    s.tick - s.controlTick >= 4 &&
    (open || kickingForward);
  if (go && st.runs < 2 && s.tick - st.since > 20 && Math.abs(r.pos.y - (line - 0.8)) < 1.5)
    startRun(s);
}
function startRun(s: SimState) {
  s.runner = { mode: "run", since: s.tick, runs: s.runner.runs + 1 };
  s.events.push({ tick: s.tick, type: "run", by: "runner" });
}

function defenders(s: SimState, line: number, meetFor: Map<Role, V>) {
  const { agents: A, ball, variant } = s;
  const d1 = A.d1,
    d2 = A.d2,
    gk = A.gk;
  const ty = A.ty;
  const goalDir = (p: V) => norm(sub(goalCentre, p));
  // Side the presser shuts (unit x): the runner's side or the passer's side.
  const runnerSide = Math.sign(A.runner.pos.x - ty.pos.x) || variant.side;
  const shutSide = variant.closes === "runner" ? runnerSide : -runnerSide;

  // GK: on the line between ball and goal, or out for a ball in the box.
  if (meetFor.has("gk")) setGoal(gk, meetFor.get("gk")!, gk.maxSpeed, ball.pos);
  else {
    const g = add(
      goalCentre,
      scale(goalDir(ball.pos), -Math.min(6, dist(ball.pos, goalCentre) * 0.15)),
    );
    setGoal(gk, v(clamp(g.x, -6, 6), Math.min(PITCH.halfLength - 1, g.y)), 4, ball.pos);
  }

  const passReacted = s.pass ? s.tick - s.pass.launch >= 12 : true;
  // D1: press TY, arrive goal side and on the shut side, brake, jockey, then engage.
  if (meetFor.has("d1") && passReacted && ball.owner === null && s.phase === "pass") {
    setGoal(d1, meetFor.get("d1")!, d1.maxSpeed, ball.pos);
  } else if (s.phase === "build") {
    setGoal(d1, d1.pos, 0, ball.pos);
  } else if (s.phase === "incoming" || s.phase === "touch" || s.phase === "possession") {
    const reacted = s.phase !== "incoming" || (s.pass && s.tick - s.pass.launch >= 9);
    const ballNow = s.phase === "possession" ? ball.pos : ty.pos;
    // Angled approach: stand on the shut side, a little goal side, so play is shown the other way.
    const shield = add(ballNow, add(scale(v(shutSide, 0), 1.35), scale(goalDir(ballNow), 0.75)));
    const beaten =
      s.phase === "possession" && ty.pos.y > d1.pos.y + 0.8 && dist(ty.pos, d1.pos) > 1.2;
    const loose = s.phase === "touch" || (s.phase === "possession" && dist(ball.pos, ty.pos) > 1.0);
    if (!reacted) setGoal(d1, d1.pos, 0, ball.pos);
    else if (loose || beaten) setGoal(d1, ball.pos, d1.maxSpeed, ball.pos);
    else if (s.phase === "possession") {
      // Brake at about 1.5 m, jockey on the shut side, then step in.
      if (dist(d1.pos, ball.pos) < 2.2) s.jockeyTicks++;
      const engage = s.jockeyTicks > 40;
      setGoal(d1, engage ? ball.pos : shield, engage ? 5 : d1.maxSpeed, ball.pos);
    } else setGoal(d1, shield, d1.maxSpeed, ball.pos);
  } else if (ball.owner && ball.owner !== "d1" && ball.owner !== "ty") {
    // After a pass: press the new carrier when close, otherwise drop to the line.
    const carrier = A[ball.owner];
    if (dist(d1.pos, carrier.pos) < 12)
      setGoal(d1, add(carrier.pos, scale(goalDir(carrier.pos), 1.2)), d1.maxSpeed, carrier.pos);
    else setGoal(d1, v(d1.pos.x * 0.8, Math.max(d1.pos.y, line)), 5, ball.pos);
  } else {
    // Ball travelling past him: recover goal side of TY's pass.
    setGoal(d1, v(d1.pos.x, d1.pos.y + 1), 4, ball.pos);
  }

  // D2: guard the runner goal side, cover behind the presser on the side he forces play to.
  if (meetFor.has("d2") && passReacted && ball.owner === null && s.phase === "pass") {
    setGoal(d2, meetFor.get("d2")!, d2.maxSpeed, ball.pos);
    return;
  }
  const runner = A.runner;
  const tracking = s.runner.mode === "run" && s.tick - s.runner.since > 14;
  const guard = add(
    runner.pos,
    add(
      scale(goalDir(runner.pos), 1.8),
      scale(norm(sub(ball.pos, runner.pos)), variant.cover === "tight" ? 0.8 : 0.2),
    ),
  );
  const forced = -shutSide;
  const cover = add(d1.pos, v(forced * 5, 5.5));
  if (s.phase === "possession" && ty.pos.y > d1.pos.y + 1 && dist(ty.pos, d1.pos) > 1.5) {
    // TY got past the presser: step out to the ball (cover).
    setGoal(d2, add(ty.pos, scale(goalDir(ty.pos), 1.5)), d2.maxSpeed, ball.pos);
  } else if (tracking) {
    setGoal(
      d2,
      add(runner.pos, add(scale(goalDir(runner.pos), 1.5), scale(runner.vel, 0.4))),
      d2.maxSpeed,
      ball.pos,
    );
  } else if (ball.owner === "runner" || ball.owner === "support") {
    const c = A[ball.owner];
    setGoal(d2, add(c.pos, scale(goalDir(c.pos), 1.4)), d2.maxSpeed, c.pos);
  } else {
    const w = variant.cover === "tight" ? 0.85 : 0.55;
    const spot = lerpV(cover, guard, w);
    // Hold the line: do not drop deep before the runner goes.
    spot.y = clamp(spot.y, runner.pos.y - 0.5, runner.pos.y + 3);
    setGoal(d2, spot, 5.5, ball.pos);
  }
}

// ---------- TY's own actions ----------

function actTy(s: SimState) {
  const ty = s.agents.ty;
  if (s.carry && s.phase === "possession") {
    if (s.tick >= s.carry.until) s.carry = null;
    else setGoal(ty, add(ty.pos, scale(dirOf(s.carry.dir), 3)), 5.6, null);
  }
  const p = s.pending;
  if (!p || p.kind !== "pass" || s.phase !== "possession") return;
  const aimDir = headingOf(sub(aimPoint(s, p.aim, 1), ty.pos));
  if (p.stage === "turn") {
    setGoal(ty, ty.pos, 0, add(ty.pos, dirOf(aimDir)));
    if (Math.abs(angleDiff(ty.heading, aimDir)) < 0.35) {
      p.stage = "windup";
      p.windupStart = s.tick;
      ty.anim = "kick";
      ty.animTick = s.tick;
    }
    return;
  }
  setGoal(ty, ty.pos, 0, add(ty.pos, dirOf(aimDir)));
  if (s.tick - p.windupStart >= KICK_CONTACT_TICKS) {
    launchPass(s, "ty", p.aim, p.lofted);
    s.pending = null;
  }
}

/** Target point of a pass. Players get the ball led into their run. */
function aimPoint(s: SimState, aim: Aim, iterations = 3, lofted = false): V {
  if (aim.kind === "point") return v(aim.x, aim.y);
  const r = s.agents[aim.id];
  const from = s.ball.pos;
  let target = r.pos;
  for (let i = 0; i < iterations; i++) {
    const d = dist(from, target);
    const t = lofted ? 1.0 + d / 28 : d / 13;
    const lead = scale(r.vel, t * 0.85);
    target = add(r.pos, len(lead) > 9 ? scale(norm(lead), 9) : lead);
  }
  return target;
}

function launchPass(s: SimState, from: Role, aim: Aim | null, lofted: boolean) {
  const kicker = s.agents[from];
  const target = aim ? aimPoint(s, aim, 3, lofted) : firstPassTarget(s);
  let d = Math.min(dist(s.ball.pos, target), 48);
  let dir = headingOf(sub(target, s.ball.pos));
  let speedFactor = 1;
  if (from === "ty" && noisy(s)) {
    const pressure = dist(s.agents.d1.pos, kicker.pos) < 2.2 ? 1 : 0;
    const moving = clamp(len(kicker.vel) / 5, 0, 1);
    const sd = 0.022 + 0.04 * pressure + (lofted ? 0.03 : 0) + 0.02 * moving;
    const angleError = gauss(s.random) * sd;
    speedFactor = 1 + gauss(s.random) * (lofted ? 0.09 : 0.06);
    dir += angleError;
    s.passError = Math.abs(angleError) * d + Math.abs(speedFactor - 1) * d * 0.5;
  } else if (from === "ty") s.passError = 0;
  const arrive = !aim ? 8.5 : aim.kind === "point" ? 5.5 : 7;
  const u = dirOf(dir);
  if (lofted) {
    const T = 0.9 + d / 30;
    s.ball.vel = scale(u, (d / T) * speedFactor);
    s.ball.vh = (GRAVITY * T) / 2;
    s.ball.h = 0.12;
  } else {
    d *= speedFactor;
    const v0 = groundSpeedFor(d, arrive);
    s.ball.vel = scale(u, v0);
    s.ball.vh = 0;
  }
  s.ball.owner = null;
  // Offside is judged at the moment of the pass.
  const line = offsideLine(s);
  const offside = ATTACKERS.filter(
    (id) =>
      id !== from &&
      s.agents[id].pos.y > Math.max(line, s.ball.pos.y) + 0.3 &&
      s.agents[id].pos.y > 0,
  );
  const intended = aim?.kind === "player" ? aim.id : null;
  s.pass = { from, intended, lofted, launch: s.tick, origin: { ...s.ball.pos }, target, offside };
  s.events.push({ tick: s.tick, type: "pass", from, to: aim, lofted, offside });
  s.phase = from === "ty" ? "pass" : "incoming";
}

// ---------- movement ----------

function moveAgent(s: SimState, a: Agent) {
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
  if (a.face && (shuffling || a.id === "ty")) faceHeading = headingOf(sub(a.face, a.pos));
  else if (sp > 1.0) faceHeading = headingOf(a.vel);
  if (faceHeading !== null && (a.face ? dist(a.face, a.pos) > 0.3 : true)) {
    const diff = angleDiff(a.heading, faceHeading);
    a.heading += clamp(diff, -turnRate * DT, turnRate * DT);
  }
  // Gait: a stride cycle is longer at speed (≈1.6 m walking, up to ≈4.6 m sprinting).
  const cycle = sp < 2.2 ? 1.55 : 1.8 + 0.37 * sp;
  a.stride += (sp * DT) / cycle;
  if (a.anim === "kick" && s.tick - a.animTick > (KICK_CLIP_SECONDS / KICK_RATE) * TICK_HZ)
    a.anim = "idle";
  if (a.anim !== "kick") a.anim = sp > 0.35 ? "run" : "idle";
}

function moveBall(s: SimState) {
  const b = s.ball;
  if (b.owner) {
    const o = s.agents[b.owner];
    // Build-up passer: the ball leaves his foot at the contact frame.
    if (b.owner === "support" && s.phase === "build") {
      b.pos = add(o.pos, scale(dirOf(o.heading), EYE_FOOT));
      if (s.tick >= KICK_CONTACT_TICKS) launchPass(s, "support", null, false);
      return;
    }
    const sp = len(o.vel);
    const ahead = sp > 1 ? 0.75 : EYE_FOOT;
    const foot = add(o.pos, scale(dirOf(sp > 1 ? headingOf(o.vel) : o.heading), ahead));
    b.roll += dist(b.pos, foot);
    b.pos = foot;
    b.vel = { ...o.vel };
    b.h = 0.11;
    b.vh = 0;
    return;
  }
  const before = b.pos;
  const next = advanceBall(b.pos, b.vel, b.h, b.vh, DT);
  b.pos = next.p;
  b.vel = next.vel;
  b.h = next.h;
  b.vh = next.vh;
  b.roll += dist(before, b.pos);
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

/** The build-up pass goes to TY's feet, a metre in front of him. */
function firstPassTarget(s: SimState) {
  const ty = s.agents.ty;
  const back = norm(sub(s.agents.support.pos, ty.pos));
  return add(ty.pos, scale(back, 1.0));
}

// ---------- contacts: receive, intercept, tackle, out ----------

function contacts(s: SimState) {
  const { agents: A, ball } = s;
  if (s.outcome && s.phase === "done") return;
  if (!ball.owner && !inPitch(ball.pos)) {
    if (!s.outcome) finish(s, { kind: "loss", by: null, detail: "out" });
    ball.vel = v(0, 0);
    return;
  }
  // TY receives the build-up pass: the first touch.
  if (s.phase === "incoming") {
    for (const id of DEFENDERS) {
      if (id === "gk") continue;
      if (dist(A[id].pos, ball.pos) < 0.75 && ball.h < 0.6) {
        ball.owner = id;
        finish(s, { kind: "loss", by: id, detail: "intercept" });
        return;
      }
    }
    if (dist(A.ty.pos, ball.pos) < 0.7) firstTouch(s);
    return;
  }
  if (s.phase === "touch") {
    for (const id of ["d1", "d2"] as const) {
      if (dist(A[id].pos, ball.pos) < 0.8) {
        ball.owner = id;
        s.phase = "possession";
        finish(s, { kind: "loss", by: id, detail: "tackle" });
        return;
      }
    }
    const settled = s.tick - (s.touchTick ?? s.tick) >= 14 || len(ball.vel) < 1.2;
    if (settled && dist(A.ty.pos, ball.pos) < 0.7) {
      ball.owner = "ty";
      s.phase = "possession";
      s.controlTick = s.tick;
      s.events.push({ tick: s.tick, type: "control", by: "ty" });
    }
    return;
  }
  if (s.phase === "possession" && ball.owner === "ty" && !s.outcome) {
    // Tackle: a rival who stays within reach long enough wins the ball.
    let near = false;
    for (const id of ["d1", "d2"] as const) {
      if (dist(A[id].pos, ball.pos) < 1.0) near = true;
    }
    const escaping = len(A.ty.vel) > 3.6;
    s.tackleClock = near ? s.tackleClock + (escaping ? 0.4 : 1) : Math.max(0, s.tackleClock - 0.5);
    const windup = s.pending?.stage === "windup";
    if (s.tackleClock >= (windup ? 10 : 21)) {
      const who = dist(A.d1.pos, ball.pos) < dist(A.d2.pos, ball.pos) ? "d1" : "d2";
      ball.owner = who;
      s.pending = null;
      finish(s, { kind: "loss", by: who, detail: "tackle" });
      return;
    }
    // Carried past the line into free space.
    const line = offsideLine(s);
    const nearest = Math.min(dist(A.d1.pos, A.ty.pos), dist(A.d2.pos, A.ty.pos));
    if (A.ty.pos.y > line + 1 && nearest > 2.2)
      finish(s, { kind: "chance", by: "ty", detail: "carried" });
    return;
  }
  if (s.phase === "pass" && !ball.owner) {
    const age = s.tick - (s.pass?.launch ?? 0);
    const contenders: Role[] = ["support", "runner", "d1", "d2", "gk"];
    if (age > 15) contenders.push("ty");
    for (const id of contenders) {
      const a = A[id];
      // A fast ball played right past a rival is hard to react to in the first moments.
      const fast = len(ball.vel) > 10 && age < 18;
      const reach =
        id === "gk" ? (inBox(ball.pos) ? 1.3 : 0) : isDefender(id) ? (fast ? 0.6 : 0.85) : 0.8;
      const height = id === "gk" ? 2.4 : 0.7;
      if (ball.h > height || dist(a.pos, ball.pos) > reach) continue;
      ball.owner = id;
      ball.vel = v(0, 0);
      if (isDefender(id)) {
        finish(s, { kind: "loss", by: id, detail: id === "gk" ? "keeper" : "intercept" });
        return;
      }
      if (s.pass?.offside.includes(id)) {
        finish(s, { kind: "offside", by: id, detail: "offside" });
        return;
      }
      s.events.push({ tick: s.tick, type: "control", by: id });
      finish(s, { ...receptionValue(s, id), by: id, detail: "received" });
      return;
    }
    if (len(ball.vel) < 0.15 && ball.h <= 0.12 && age > 40) {
      // Dead ball nobody reached in time: the nearest rival collects it.
      finish(s, { kind: "loss", by: null, detail: "slow" });
    }
  }
}

function firstTouch(s: SimState) {
  const { agents: A, ball } = s;
  const ty = A.ty;
  const incoming = len(ball.vel);
  const armed = s.armedTouch !== null;
  const dir = armed ? s.armedTouch! : headingOf(sub(A.support.pos, ty.pos));
  let quality: number;
  if (!armed) {
    // Ball stopped at the feet, facing the passer.
    quality = 0.9 - 0.15 * clamp((incoming - 9) / 8, 0, 1);
    ball.vel = scale(norm(ball.vel), 0.6);
  } else {
    const toD1 = sub(A.d1.pos, ty.pos);
    const d1Dist = len(toD1);
    const intoPressure = Math.abs(angleDiff(dir, headingOf(toD1))) < 0.9 && d1Dist < 3.5;
    const turn = Math.abs(angleDiff(ty.heading, dir)) / Math.PI;
    quality =
      0.95 -
      0.2 * clamp((incoming - 9) / 8, 0, 1) -
      0.14 * turn -
      (intoPressure ? 0.35 : d1Dist < 1.6 ? 0.1 : 0);
    if (noisy(s)) quality += gauss(s.random) * 0.07;
    quality = clamp(quality, 0.15, 1);
    const angleError = noisy(s) ? gauss(s.random) * (1 - quality) * 0.45 : 0;
    ball.vel = scale(dirOf(dir + angleError), 2.6 + (1 - quality) * 4.2);
  }
  s.touchQuality = Math.round(quality * 100) / 100;
  s.touchTick = s.tick;
  s.events.push({ tick: s.tick, type: "touch", dir, quality: s.touchQuality, armed });
  s.phase = "touch";
  if (!armed) {
    ball.owner = "ty";
    s.phase = "possession";
    s.controlTick = s.tick;
    s.events.push({ tick: s.tick, type: "control", by: "ty" });
  }
}

/** What a pass reception is worth: behind the line or free in the box is a chance. */
function receptionValue(s: SimState, id: Role): Pick<Outcome, "kind"> {
  const r = s.agents[id];
  const line = offsideLine(s);
  const nearest = Math.min(dist(s.agents.d1.pos, r.pos), dist(s.agents.d2.pos, r.pos));
  if ((r.pos.y > line + 0.5 && nearest > 1.2) || (inBox(r.pos) && nearest > 2.5))
    return { kind: "chance" };
  if (r.pos.y >= (s.pass?.origin.y ?? r.pos.y) + 4) return { kind: "progress" };
  return { kind: "kept" };
}

function judgeTime(s: SimState) {
  if (
    s.phase === "possession" &&
    s.controlTick !== null &&
    s.tick - s.controlTick > POSSESSION_LIMIT &&
    !s.pending
  )
    finish(s, { kind: "timeout", by: null, detail: "slow" });
}

// ---------- frames ----------

export function frameOf(s: SimState): Frame {
  return {
    tick: s.tick,
    agents: ROLES.map((id) => {
      const a = s.agents[id];
      return {
        x: a.pos.x,
        y: a.pos.y,
        heading: a.heading,
        speed: len(a.vel),
        stride: a.stride,
        anim: a.anim,
        animT: a.anim === "kick" ? ((s.tick - a.animTick) / TICK_HZ) * KICK_RATE : 0,
      };
    }),
    ball: {
      x: s.ball.pos.x,
      y: s.ball.pos.y,
      h: s.ball.h,
      roll: s.ball.roll,
      heading: len(s.ball.vel) > 0.1 ? headingOf(s.ball.vel) : 0,
    },
  };
}

export const roleIndex = (id: Role) => ROLES.indexOf(id);

/** Internals for unit tests only. */
export const __test = { moveAgent };
