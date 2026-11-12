/** Local, deterministic 5v5 simulator (four outfield players and a keeper per team).
 *
 * - Fixed 60 Hz step, independent of the display frame rate. The same variant and the same
 *   inputs give the same fragment on every device, so an attempt can be replayed from above
 *   and checked again when it is restored from a backup.
 * - Movement and ball physics are shared with the 3v2 lesson (fpPhysics): acceleration,
 *   braking, grip-limited turns, rolling and flying ball.
 * - One player (TY) is steered by the user: a movement direction and speed, kicks with a
 *   direction and power, and defensive actions. Everybody else follows local rules that
 *   react to the current picture every step; nothing decides the ending in advance.
 * - Small-sided rules: no offside; the fragment ends with a goal, a shot, the ball out of
 *   play, a long spell without the ball or the time limit.
 */
import {
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
} from "../firstPerson/fpMath";
import {
  advanceBall,
  ballFuture,
  canReach,
  covered,
  DT,
  GRAVITY,
  groundSpeedFor,
  moveBody,
  TICK_HZ,
  type BallSample,
  type MotionBody,
} from "../firstPerson/fpPhysics";
import {
  F5_PITCH,
  PLAYER_COUNT,
  PRESSER_FOR,
  SLOTS,
  slotIndex,
  type F5Variant,
  type Slot,
} from "./f5Variants";

export { DT, TICK_HZ };
export const F5_ENGINE_VERSION = 1;
export const MAX_TICKS = TICK_HZ * 35;
/** The fragment ends when the rivals keep the ball this long. */
export const LOSS_LIMIT = TICK_HZ * 8;
const RUN_ON_TICKS = 50;
const RESTART_HOLD = 45;
/** Supplied "Soccer Pass" clip: 1.6 s, foot contact at frame 14 of 30 FPS, played 1.5× faster. */
export const KICK_CLIP_SECONDS = 1.6;
export const KICK_RATE = 1.5;
export const KICK_CONTACT_TICKS = Math.round((14 / 30 / KICK_RATE) * TICK_HZ);
const BALL_H = 0.11;
const AI_THINK = 10;
const EYE = 1.68;

export type Team = "home" | "away";
export type Anim = "idle" | "run" | "kick";
export type KickType = "pass" | "shot" | "lofted";

export type F5Input =
  /** Joystick: world heading of the movement and 0…1 of top speed (0 = stop). */
  | { tick: number; kind: "move"; dir: number; speed: number }
  /** Right-hand buttons: heading and pitch of the view, hold power 0…1, aimed partner. */
  | {
      tick: number;
      kind: "kick";
      type: KickType;
      dir: number;
      pitch: number;
      power: number;
      target?: number;
    }
  | { tick: number; kind: "press" }
  | { tick: number; kind: "tackle" };

export type Player = MotionBody & {
  index: number;
  team: Team;
  slot: Slot;
  keeper: boolean;
  anim: Anim;
  animTick: number;
  noTouchUntil: number;
  stunUntil: number;
};

export type Ball = {
  pos: V;
  vel: V;
  h: number;
  vh: number;
  owner: number | null;
  last: number | null;
  roll: number;
  held: boolean;
};

type Kick = {
  by: number;
  type: KickType;
  dir: number;
  pitch: number;
  power: number;
  target: number | null;
  contact: number;
};

export type OutcomeKind =
  "goal" | "conceded" | "shot" | "shotAgainst" | "kept" | "lost" | "out" | "outAgainst";
export type Outcome = { kind: OutcomeKind; tick: number };

export type F5Event =
  | { tick: number; type: "control"; by: number; from: "pass" | "loose" | "tackle" | "start" }
  | { tick: number; type: "touch"; by: number; dir: number | null; away: number; pressure: number }
  | {
      tick: number;
      type: "pass";
      by: number;
      to: number | null;
      kick: KickType;
      lane: number;
      pressure: number;
    }
  | { tick: number; type: "shot"; by: number; distance: number }
  | { tick: number; type: "tackle"; by: number; from: number; won: boolean }
  | { tick: number; type: "press"; by: number }
  | { tick: number; type: "goal"; team: Team }
  | { tick: number; type: "save"; by: number }
  | { tick: number; type: "out"; last: number | null }
  | { tick: number; type: "possession"; team: Team }
  | { tick: number; type: "end"; outcome: Outcome };

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

export type Phase = "restart" | "play" | "done";

export type SimState = {
  variant: F5Variant;
  ty: number;
  tick: number;
  phase: Phase;
  players: Player[];
  ball: Ball;
  kicks: Kick[];
  possession: Team | null;
  possessionSince: number;
  /** User controls. */
  move: { dir: number; speed: number };
  pressUntil: number;
  /** Rival-side rules. */
  presser: Record<Team, number | null>;
  presserTrigger: boolean;
  tackleClock: number;
  decideAt: number[];
  engage: number[];
  passer: number | null;
  plan: (null | { kind: "carry" | "hold"; target: V; top: number; until: number })[];
  runs: (null | { target: V; until: number })[];
  passTo: number | null;
  shotBy: number | null;
  chase: Map<Team, number>;
  future: BallSample[] | null;
  outcome: Outcome | null;
  events: F5Event[];
  frames: Frame[];
  random: () => number;
  record: boolean;
};

export type SimOptions = { record?: boolean };

const outfield = (team: Team) => [1, 2, 3, 4].map((i) => (team === "home" ? i : i + 5));
const keeperOf = (team: Team) => (team === "home" ? 0 : 5);
const other = (team: Team): Team => (team === "home" ? "away" : "home");
const sign = (team: Team) => (team === "home" ? 1 : -1);
/** Team-relative frame: every team attacks +y in its own frame (mirror both axes). */
const rel = (p: V, team: Team): V => (team === "home" ? p : { x: -p.x, y: -p.y });
const ownGoal = (team: Team): V => v(0, -sign(team) * F5_PITCH.halfLength);
const rivalGoal = (team: Team): V => v(0, sign(team) * F5_PITCH.halfLength);
export const inOwnBox = (p: V, team: Team) => {
  const r = rel(p, team);
  return r.y <= -F5_PITCH.halfLength + F5_PITCH.boxDepth && Math.abs(r.x) <= F5_PITCH.boxHalfWidth;
};
const clampIn = (p: V, m = 0.6): V =>
  v(
    clamp(p.x, -F5_PITCH.halfWidth + m, F5_PITCH.halfWidth - m),
    clamp(p.y, -F5_PITCH.halfLength + m, F5_PITCH.halfLength - m),
  );

function makePlayer(index: number, pos: V): Player {
  const team: Team = index < 5 ? "home" : "away";
  const slot = SLOTS[index % 5]!;
  const keeper = slot === "gk";
  return {
    index,
    team,
    slot,
    keeper,
    pos: { ...pos },
    vel: v(0, 0),
    heading: team === "home" ? 0 : Math.PI,
    target: { ...pos },
    top: 0,
    face: null,
    maxSpeed: keeper ? 6.4 : team === "home" ? 7.4 : 7.2,
    accel: keeper ? 6.2 : 6.8,
    stride: 0,
    anim: "idle",
    animTick: 0,
    noTouchUntil: 0,
    stunUntil: 0,
  };
}

export function createSim(variant: F5Variant, options: SimOptions = {}): SimState {
  const players = variant.start.map((p, i) => makePlayer(i, p));
  const ty = slotIndex("home", variant.position);
  const gk = players[0]!;
  // Everybody starts facing the ball in the keeper's hands.
  for (const p of players) if (p !== gk) p.heading = headingOf(sub(gk.pos, p.pos));
  gk.heading = headingOf(sub(players[ty]!.pos, gk.pos));
  const s: SimState = {
    variant,
    ty,
    tick: 0,
    phase: "restart",
    players,
    ball: {
      pos: add(gk.pos, scale(dirOf(gk.heading), 0.5)),
      vel: v(0, 0),
      h: 1.0,
      vh: 0,
      owner: 0,
      last: 0,
      roll: 0,
      held: true,
    },
    kicks: [],
    possession: "home",
    possessionSince: 0,
    move: { dir: 0, speed: 0 },
    pressUntil: -1,
    presser: { home: null, away: slotIndex("away", PRESSER_FOR[variant.position]) },
    presserTrigger: variant.timing === "early",
    tackleClock: 0,
    decideAt: players.map((_, i) => (i * 3) % AI_THINK),
    engage: players.map(() => 0),
    passer: null,
    plan: players.map(() => null),
    runs: players.map(() => null),
    passTo: null,
    shotBy: null,
    chase: new Map(),
    future: null,
    outcome: null,
    events: [],
    frames: [],
    random: rng(variant.seed * 92821 + 7 + variant.start.length),
    record: options.record ?? true,
  };
  s.events.push({ tick: 0, type: "control", by: 0, from: "start" });
  if (s.record) s.frames.push(frameOf(s));
  return s;
}

// ---------- inputs ----------

export function applyInput(s: SimState, input: F5Input) {
  if (s.phase === "done") return;
  const ty = s.players[s.ty]!;
  if (input.kind === "move") {
    s.move = { dir: input.dir, speed: clamp(input.speed, 0, 1) };
    if (input.speed > 0.3) s.pressUntil = -1;
    return;
  }
  if (input.kind === "press") {
    if (s.possession === "home" && s.ball.owner !== null) return;
    s.pressUntil = s.tick + 50;
    s.events.push({ tick: s.tick, type: "press", by: s.ty });
    return;
  }
  if (input.kind === "tackle") {
    tryTackle(s, ty);
    return;
  }
  // Kick: with the ball at the feet (or a loose ball within reach for a first-time kick).
  if (s.kicks.some((k) => k.by === s.ty)) return;
  const own = s.ball.owner === s.ty;
  const loose =
    s.ball.owner === null &&
    dist(ty.pos, s.ball.pos) < 1.1 &&
    s.ball.h < 0.7 &&
    s.tick >= ty.noTouchUntil;
  if (!own && !loose) return;
  startKick(s, {
    by: s.ty,
    type: input.type,
    dir: input.dir,
    pitch: input.pitch,
    power: clamp(input.power, 0, 1),
    target: input.target ?? null,
    contact: s.tick + KICK_CONTACT_TICKS,
  });
}

function startKick(s: SimState, kick: Kick) {
  const p = s.players[kick.by]!;
  s.kicks.push(kick);
  p.anim = "kick";
  p.animTick = s.tick;
}

export function stepSim(s: SimState, inputs: readonly F5Input[] = []) {
  if (s.phase === "done") return;
  for (const input of inputs) if (input.tick === s.tick) applyInput(s, input);
  if (s.ball.owner === null && (s.tick % 3 === 0 || !s.future)) {
    s.future = ballFuture(s.ball, 3, 0.05);
    s.chase = chasers(s, s.future);
  } else if (s.ball.owner !== null) s.future = null;
  think(s);
  for (const p of s.players) movePlayer(s, p);
  resolveKicks(s);
  moveBall(s);
  contacts(s);
  judge(s);
  s.tick++;
  if (s.outcome && s.tick >= s.outcome.tick + RUN_ON_TICKS) s.phase = "done";
  if (s.tick >= MAX_TICKS + RUN_ON_TICKS) s.phase = "done";
  if (s.record) s.frames.push(frameOf(s));
}

export function runSim(variant: F5Variant, inputs: readonly F5Input[], options: SimOptions = {}) {
  const s = createSim(variant, options);
  const byTick = new Map<number, F5Input[]>();
  for (const input of inputs) byTick.set(input.tick, [...(byTick.get(input.tick) ?? []), input]);
  while (s.phase !== "done") stepSim(s, byTick.get(s.tick) ?? []);
  return s;
}

function finish(s: SimState, kind: OutcomeKind) {
  if (s.outcome) return;
  s.outcome = { kind, tick: s.tick };
  s.events.push({ tick: s.tick, type: "end", outcome: s.outcome });
}

// ---------- reading the picture ----------

/** Seconds a player needs to reach a point (sprint model from standing, plus turning). */
export function timeToReach(p: MotionBody, to: V, reach = 0.8) {
  const d = Math.max(0, dist(p.pos, to) - reach);
  if (d <= 0) return 0;
  const way = headingOf(sub(to, p.pos));
  const turn = (Math.abs(angleDiff(p.heading, way)) / 7) * 0.6;
  let lo = 0,
    hi = 8;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (covered(p, mid) >= d) hi = mid;
    else lo = mid;
  }
  return hi + turn;
}

/** Spare time of the ball over the quickest rival on a pass lane (seconds, negative = cut). */
export function laneMargin(s: SimState, from: V, to: V, team: Team, lofted = false) {
  const d = dist(from, to);
  if (d < 0.5) return 9;
  const speed = lofted ? d / (0.75 + d / 26) : (groundSpeedFor(d, 5) + 5) / 2;
  let worst = 9;
  for (const o of s.players) {
    if (o.team === team) continue;
    if (o.keeper && !inOwnBox(to, o.team)) continue;
    const { t } = segmentDistance(o.pos, from, to);
    // A lofted ball can only be won where it comes down.
    if (lofted && t < 0.8) continue;
    const point = lerpV(from, to, t);
    const ballTime = (d * t) / speed + 0.12;
    const margin = timeToReach(o, point, o.keeper ? 1.2 : 0.75) - ballTime;
    worst = Math.min(worst, margin);
  }
  return worst;
}

export const nearestRival = (s: SimState, p: V, team: Team) => {
  let best: Player | null = null,
    bestD = Infinity;
  for (const o of s.players) {
    if (o.team === team || o.keeper) continue;
    const d = dist(o.pos, p);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return { player: best, d: bestD };
};

/** Player of each team who goes for the loose ball: the one who gets there first. */
function chasers(s: SimState, future: BallSample[]) {
  const out = new Map<Team, number>();
  const times = new Map<Team, number>();
  for (const team of ["home", "away"] as const) {
    let best = -1,
      bestT = Infinity;
    for (const p of s.players) {
      if (p.team !== team || s.tick < p.stunUntil) continue;
      if (p.keeper && !inOwnBox(s.ball.pos, team) && !future.some((f) => inOwnBox(f.p, team)))
        continue;
      for (const f of future) {
        if (f.t >= bestT) break;
        if (f.h > (p.keeper ? 2.3 : 0.9)) continue;
        if (canReach(p, f.p, f.t, p.keeper ? 1.1 : 0.7)) {
          bestT = f.t;
          best = p.index;
          break;
        }
      }
    }
    if (best < 0) {
      // Nobody gets there in time: the closest to where the ball stops.
      const end = future.at(-1)?.p ?? s.ball.pos;
      let bd = Infinity;
      for (const p of s.players)
        if (p.team === team && !p.keeper && dist(p.pos, end) < bd) {
          bd = dist(p.pos, end);
          best = p.index;
        }
    }
    out.set(team, best);
    times.set(team, bestT);
  }
  // A pass to a partner: the receiver goes for it; a rival only if he gets there first.
  if (s.passTo !== null) {
    const receiver = s.players[s.passTo]!;
    const rivals = other(receiver.team);
    out.set(receiver.team, receiver.index);
    let receiverT = Infinity;
    for (const f of future) {
      if (f.h > 0.9) continue;
      if (canReach(receiver, f.p, f.t, 0.7)) {
        receiverT = f.t;
        break;
      }
    }
    if ((times.get(rivals) ?? Infinity) > receiverT - 0.05) out.set(rivals, -1);
  }
  return out;
}

function meet(s: SimState, p: Player): V {
  for (const f of s.future ?? []) {
    if (f.h > (p.keeper ? 2.3 : 0.9)) continue;
    if (canReach(p, f.p, f.t, 0.6)) return f.p;
  }
  return s.future?.at(-1)?.p ?? s.ball.pos;
}

// ---------- AI: partners and rivals react to the picture every step ----------

function goal(p: Player, target: V, top: number, face: V | null = null) {
  p.target = clampIn(target, 0.4);
  p.top = top;
  p.face = face;
}

function think(s: SimState) {
  const ball = s.ball;
  const carrier = ball.owner !== null ? s.players[ball.owner]! : null;
  const attacking: Team | null = carrier ? carrier.team : s.possession;
  if (carrier) {
    // Choose who presses: the closest outfield rival, kept unless another is clearly closer.
    const def = other(carrier.team);
    const current = s.presser[def];
    let best = current,
      bestD = current !== null ? dist(s.players[current]!.pos, ball.pos) - 1.5 : Infinity;
    for (const i of outfield(def)) {
      const d = dist(s.players[i]!.pos, ball.pos);
      if (d < bestD && s.tick >= s.players[i]!.stunUntil) {
        best = i;
        bestD = d;
      }
    }
    s.presser[def] = best;
  }
  for (const p of s.players) {
    if (p.index === s.ty) {
      tyControl(s, p);
      continue;
    }
    if (p.keeper) {
      keeper(s, p);
      continue;
    }
    if (ball.owner === p.index) {
      carrierBrain(s, p);
      continue;
    }
    if (ball.owner === null) {
      // Loose ball: only the one who gets there first goes for it; the intended receiver
      // attacks the ball; the rest keep their positions.
      const chaser = s.chase.get(p.team);
      if (chaser === p.index || s.passTo === p.index) {
        goal(p, meet(s, p), p.maxSpeed, ball.pos);
        continue;
      }
    }
    if (attacking === p.team) support(s, p);
    else defend(s, p);
  }
}

function tyControl(s: SimState, p: Player) {
  if (s.tick < p.stunUntil) {
    goal(p, p.pos, 0);
    return;
  }
  if (s.tick < s.pressUntil && s.ball.owner !== s.ty) {
    // Doskok: close the ball down goal side, at a sprint until 2 m, then under control.
    const target = pressPoint(s.ball.pos, "home");
    const d = dist(p.pos, target);
    goal(p, target, d > 2.5 ? p.maxSpeed : 3, s.ball.pos);
    if (d < 0.6) s.pressUntil = -1;
    return;
  }
  const kicking = s.kicks.some((k) => k.by === s.ty);
  const speed = kicking ? Math.min(s.move.speed, 0.3) : s.move.speed;
  if (speed < 0.05) {
    goal(p, p.pos, 0, dist(p.pos, s.ball.pos) > 1 ? s.ball.pos : null);
    return;
  }
  // The joystick sets the direction and speed; the body follows with the same limits as
  // everybody else (no instant turns).
  goal(p, add(p.pos, scale(dirOf(s.move.dir), 30)), speed * p.maxSpeed);
  p.face = null;
}

/** Goal-side spot from which a rival closes the ball down and shuts the inside. */
function pressPoint(ballPos: V, defending: Team): V {
  const toGoal = norm(sub(ownGoal(defending), ballPos));
  const inside = ballPos.x === 0 ? 0 : -Math.sign(ballPos.x);
  return add(add(ballPos, scale(toGoal, 1.25)), v(inside * 0.5, 0));
}

function defend(s: SimState, p: Player) {
  const ball = s.ball;
  const team = p.team;
  const receiver =
    ball.owner === null && s.passTo !== null && s.players[s.passTo]!.team !== team
      ? s.players[s.passTo]!
      : null;
  const bpos =
    ball.owner !== null ? s.players[ball.owner]!.pos : receiver ? receiver.pos : ball.pos;
  const r = rel(bpos, team);
  const variantPresser = s.presser[team] === p.index && team === "away";
  const trigger =
    s.presserTrigger || s.variant.timing === "early" || !variantPresser || s.tick > TICK_HZ * 6;
  const block = team === "away" && s.variant.rivals === "block";
  if (s.presser[team] === p.index && trigger) {
    // The block only presses in its own half or when the carrier is turned away.
    const carrier = ball.owner !== null ? s.players[ball.owner]! : null;
    const backToGoal =
      carrier &&
      Math.abs(angleDiff(carrier.heading, headingOf(sub(rivalGoal(carrier.team), carrier.pos)))) >
        1.6;
    if (block && r.y > 2 && !backToGoal) {
      const hold = add(bpos, scale(norm(sub(ownGoal(team), bpos)), 4));
      goal(p, hold, 4.5, bpos);
      return;
    }
    const press = pressPoint(bpos, team);
    const d = dist(p.pos, press);
    // Sprint to 3 m, then come in under control (jockey) so he is not beaten by one touch;
    // after a moment at the ball he goes in for it.
    s.engage[p.index] = d < 1.6 && ball.owner !== null ? s.engage[p.index]! + 1 : 0;
    const target = s.engage[p.index]! > 24 ? ball.pos : press;
    goal(p, target, d > 3 ? p.maxSpeed : 2.8, bpos);
    return;
  }
  if (variantPresser && !trigger) {
    goal(p, p.pos, 0, bpos);
    return;
  }
  const outfieldMates = outfield(team).filter((i) => i !== s.presser[team]);
  // Cover: the next closest stands behind the presser on the ball side.
  let cover = -1,
    coverD = Infinity;
  for (const i of outfieldMates) {
    const d = dist(s.players[i]!.pos, bpos);
    if (d < coverD) {
      coverD = d;
      cover = i;
    }
  }
  const toGoal = norm(sub(ownGoal(team), bpos));
  if (p.index === cover) {
    const spot = add(bpos, scale(toGoal, 5.5));
    const target = v(spot.x * 0.75, spot.y);
    goal(p, target, 5.5, bpos);
    return;
  }
  // Markers: the rest mark the nearest free attacker goal side and shift to the ball side.
  const attackers = outfield(other(team)).filter((i) => i !== s.ball.owner);
  const markers = outfieldMates.filter((i) => i !== cover);
  const taken = new Set<number>();
  let mine: number | null = null;
  for (const m of markers) {
    let best: number | null = null,
      bestD = Infinity;
    for (const a of attackers) {
      if (taken.has(a)) continue;
      const d = dist(s.players[m]!.pos, s.players[a]!.pos);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best !== null) taken.add(best);
    if (m === p.index) mine = best;
  }
  if (block) {
    // Compact zone: hold the shape between ball and goal, shifted to the ball side.
    const baseY = -F5_PITCH.halfLength + (p.slot === "def" ? 8 : 12);
    const baseX = p.slot === "left" ? -5 : p.slot === "right" ? 5 : 0;
    const zone = v(baseX + r.x * 0.4, Math.min(baseY + (r.y + 20) * 0.22, r.y - 2));
    const target = rel(zone, team);
    goal(p, target, 5, bpos);
    return;
  }
  if (mine === null) {
    goal(p, add(bpos, scale(toGoal, 8)), 5, bpos);
    return;
  }
  const a = s.players[mine]!;
  const goalSide = add(a.pos, scale(norm(sub(ownGoal(team), a.pos)), 1.6));
  const shifted = v(goalSide.x + (bpos.x - goalSide.x) * 0.22, goalSide.y);
  const ry = rel(shifted, team);
  const safe = rel(v(ry.x, Math.max(ry.y, -F5_PITCH.halfLength + 2.5)), team);
  goal(p, safe, dist(p.pos, safe) > 3 ? 6.5 : 4.5, bpos);
}

/** Off-ball attackers: support behind the ball, width on both sides and depth ahead; step
 * out of a rival's cover shadow; time runs in behind with the carrier's chance to pass. */
function support(s: SimState, p: Player) {
  const team = p.team;
  const ball = s.ball;
  const carrier = ball.owner !== null ? s.players[ball.owner]! : null;
  const bpos = carrier ? carrier.pos : ball.pos;
  const b = rel(bpos, team);
  const deepest = Math.max(...outfield(other(team)).map((i) => rel(s.players[i]!.pos, team).y));
  const wide = team === "away" || s.variant.shape === "wide";
  let spot: V;
  switch (p.slot) {
    case "def":
      spot = v(b.x * 0.35, clamp(b.y - 7, -15.5, 6));
      break;
    case "left":
    case "right": {
      const side = p.slot === "left" ? -1 : 1;
      const x = wide ? side * (F5_PITCH.halfWidth - 1.8) : side * 6.5;
      spot = v(x, clamp(b.y + (side * b.x > 2 ? 1 : 4), -12, 13));
      break;
    }
    default:
      spot = v(b.x * 0.3, clamp(Math.max(b.y + 7, deepest - 1), -6, 15));
  }
  // A run in behind, timed with the carrier: he is free and facing forward.
  const run = s.runs[p.index];
  if (run && s.tick < run.until) {
    goal(p, run.target, p.maxSpeed, bpos);
    return;
  }
  if (carrier && carrier.team === team && (p.slot === "pivot" || p.slot !== "def")) {
    const free = nearestRival(s, carrier.pos, team).d > 3.2;
    const facing =
      Math.abs(angleDiff(carrier.heading, headingOf(sub(rivalGoal(team), carrier.pos)))) < 1.0;
    const me = rel(p.pos, team);
    const already = s.runs.some((r, i) => r && s.tick < r.until && s.players[i]!.team === team);
    if (free && facing && !already && me.y > b.y + 2 && me.y < 13 && s.random() < 0.08) {
      const target = rel(v(clamp(me.x * 0.6, -6, 6), Math.min(16, deepest + 5)), team);
      s.runs[p.index] = { target, until: s.tick + 80 };
      goal(p, target, p.maxSpeed, bpos);
      return;
    }
  }
  let target = rel(spot, team);
  // Cover shadow: if a rival stands on the lane from the ball, move to clear it.
  if (carrier && carrier.team === team) {
    for (const o of s.players) {
      if (o.team === team || o.keeper) continue;
      const { d, t } = segmentDistance(o.pos, carrier.pos, target);
      if (d < 1.4 && t > 0.15 && t < 0.92) {
        const lane = norm(sub(target, carrier.pos));
        const perp = v(-lane.y, lane.x);
        const sideOf = dot(sub(o.pos, carrier.pos), perp) > 0 ? -1 : 1;
        target = add(target, scale(perp, sideOf * 2.6));
        break;
      }
    }
  }
  const d = dist(p.pos, target);
  goal(p, target, d > 4 ? 6 : 3.6, bpos);
}

function carrierBrain(s: SimState, p: Player) {
  const plan = s.plan[p.index];
  const team = p.team;
  if (s.kicks.some((k) => k.by === p.index)) {
    goal(p, p.pos, 1.5);
    return;
  }
  const pressed = nearestRival(s, p.pos, team);
  if (s.tick >= s.decideAt[p.index]!) {
    s.decideAt[p.index] = s.tick + AI_THINK;
    const settled = s.tick - s.possessionSince > 16;
    if (settled) decide(s, p, pressed.d);
  }
  const now = s.plan[p.index];
  if (now && s.tick < now.until) {
    goal(p, clampIn(now.target, 1.6), now.top);
    return;
  }
  if (plan && s.tick >= plan.until) s.plan[p.index] = null;
  // Default: keep the ball away from the nearest rival, never into the lines.
  if (pressed.player && pressed.d < 3) {
    const away = norm(sub(p.pos, pressed.player.pos));
    const inward = scale(norm(sub(v(0, 0), p.pos)), 0.4);
    goal(p, clampIn(add(p.pos, scale(norm(add(away, inward)), 3)), 1.6), 2.4);
  } else goal(p, p.pos, 0);
}

function decide(s: SimState, p: Player, pressure: number) {
  const team = p.team;
  const me = rel(p.pos, team);
  const noise = () => (s.random() - 0.5) * 0.08;
  type Option = { score: number; act: () => void };
  const options: Option[] = [];
  for (const i of [...outfield(team), keeperOf(team)]) {
    if (i === p.index) continue;
    const r = s.players[i]!;
    if (r.keeper && me.y > -4) continue;
    const target = leadPoint(p.pos, r);
    const d = dist(p.pos, target);
    if (d < 3 || d > 26) continue;
    const margin = laneMargin(s, p.pos, target, team);
    const space = nearestRival(s, target, team).d;
    const gain = rel(target, team).y - me.y;
    const patience = Math.min(1, (s.tick - teamSince(s, team)) / (TICK_HZ * 12));
    let score = 0.4 + gain * (0.045 + 0.03 * patience) + Math.min(space, 5) * 0.035 + noise();
    if (r.keeper) score -= 0.2;
    if (i === s.passer && gain < 2) score -= 0.14;
    if (margin < 0.15) score -= 1;
    else if (margin < 0.4) score -= 0.25;
    options.push({
      score,
      act: () =>
        startKick(s, {
          by: p.index,
          type: "pass",
          dir: headingOf(sub(target, p.pos)),
          pitch: 0,
          power: 0.5,
          target: i,
          contact: s.tick + KICK_CONTACT_TICKS,
        }),
    });
  }
  const goalPos = rivalGoal(team);
  const toGoal = dist(p.pos, goalPos);
  if (toGoal < 17) {
    const corner = v(
      sign(team) * (s.random() > 0.5 ? 1 : -1) * F5_PITCH.goalHalfWidth * 0.7,
      goalPos.y,
    );
    const blocked = laneMargin(s, p.pos, corner, team) < 0.05;
    options.push({
      score: 0.62 + (17 - toGoal) * 0.06 - (blocked ? 0.45 : 0) + noise(),
      act: () =>
        startKick(s, {
          by: p.index,
          type: "shot",
          dir: headingOf(sub(corner, p.pos)),
          pitch: -0.02,
          power: 0.7,
          target: null,
          contact: s.tick + KICK_CONTACT_TICKS,
        }),
    });
  }
  // Carry into space ahead when nobody is close in front.
  const threat = nearestRival(s, p.pos, team).player;
  const sideStep = threat ? scale(norm(sub(p.pos, threat.pos)), 0.5) : v(0, 0);
  const ahead = clampIn(add(p.pos, scale(norm(add(norm(sub(goalPos, p.pos)), sideStep)), 5)), 1.6);
  const space = nearestRival(s, ahead, team).d;
  if (space > 3 && me.y < 13)
    options.push({
      score: 0.52 + Math.min(space, 8) * 0.03 + noise(),
      act: () => {
        s.plan[p.index] = { kind: "carry", target: ahead, top: 5.4, until: s.tick + 36 };
      },
    });
  options.push({
    score: 0.3 + (pressure > 2.5 ? 0.15 : -0.1) + noise(),
    act: () => {
      s.plan[p.index] = null;
    },
  });
  options.sort((a, b) => b.score - a.score);
  options[0]!.act();
}

/** Where to play the ball for a moving partner (ahead of him, as a real pass would). */
function leadPoint(from: V, r: Player, lofted = false): V {
  let target = r.pos;
  for (let i = 0; i < 3; i++) {
    const d = dist(from, target);
    const t = lofted ? 0.75 + d / 26 : d / 11;
    const lead = scale(r.vel, t * 0.8);
    target = add(r.pos, len(lead) > 7 ? scale(norm(lead), 7) : lead);
  }
  return clampIn(target, 0.8);
}

function keeper(s: SimState, p: Player) {
  const team = p.team;
  const ball = s.ball;
  const g = ownGoal(team);
  if (ball.owner === p.index) {
    // Distribution: after a short hold, to the best open partner (first ball: to TY).
    goal(p, p.pos, 0);
    const wait = s.phase === "restart" ? RESTART_HOLD : 40;
    if (s.tick - s.possessionSince >= wait && !s.kicks.some((k) => k.by === p.index)) {
      let to = team === "home" && s.phase === "restart" ? s.ty : -1;
      let lofted = false;
      if (to === s.ty) {
        const open = laneMargin(s, p.pos, s.players[to]!.pos, team) > 0.35;
        if (!open && s.tick - s.possessionSince < RESTART_HOLD + 90) return;
        lofted = !open;
      }
      if (to < 0) {
        let best = -Infinity;
        for (const i of outfield(team)) {
          const r = s.players[i]!;
          const m = laneMargin(s, p.pos, r.pos, team);
          const sc = m + nearestRival(s, r.pos, team).d * 0.2;
          if (sc > best) {
            best = sc;
            to = i;
          }
        }
      }
      const target = s.players[to]!;
      startKick(s, {
        by: p.index,
        type: lofted ? "lofted" : "pass",
        dir: headingOf(sub(target.pos, p.pos)),
        pitch: 0,
        power: 0.5,
        target: to,
        contact: s.tick + KICK_CONTACT_TICKS,
      });
    }
    return;
  }
  // Shot or loose ball in the box: go for it.
  if (ball.owner === null && s.chase.get(team) === p.index) {
    goal(p, meet(s, p), p.maxSpeed, ball.pos);
    return;
  }
  if (ball.owner === null && s.shotBy !== null && s.players[s.shotBy]!.team !== team) {
    const cross = crossing(s, g.y);
    if (cross) {
      goal(
        p,
        v(clamp(cross.x, -F5_PITCH.goalHalfWidth, F5_PITCH.goalHalfWidth), g.y + sign(team) * 0.4),
        p.maxSpeed,
        ball.pos,
      );
      return;
    }
  }
  // Positioning: on the line from the goal centre to the ball, a little off the line.
  const bpos = ball.owner !== null ? s.players[ball.owner]!.pos : ball.pos;
  const dir = norm(sub(bpos, g));
  const out = clamp(dist(bpos, g) * 0.12, 0.6, 2.2);
  const spot = add(g, scale(dir, out));
  goal(p, v(clamp(spot.x, -F5_PITCH.goalHalfWidth, F5_PITCH.goalHalfWidth), spot.y), 4.5, bpos);
}

/** Where the free ball crosses the line y = lineY (null when it does not). */
function crossing(s: SimState, lineY: number) {
  const f = s.future ?? ballFuture(s.ball, 3, 0.05);
  let prev = s.ball.pos;
  for (const sample of f) {
    if ((prev.y - lineY) * (sample.p.y - lineY) <= 0)
      return { x: sample.p.x, h: sample.h, t: sample.t };
    prev = sample.p;
  }
  return null;
}

// ---------- tackles ----------

function tryTackle(s: SimState, p: Player) {
  const owner = s.ball.owner;
  if (s.tick < p.stunUntil) return;
  if (owner === null || s.players[owner]!.team === p.team) {
    // A loose ball close by: take it.
    if (owner === null && dist(p.pos, s.ball.pos) < 1.3 && s.ball.h < 0.7) {
      gainControl(s, p.index, "loose");
    }
    return;
  }
  const c = s.players[owner]!;
  const d = dist(p.pos, s.ball.pos);
  if (d > 1.5) {
    s.events.push({ tick: s.tick, type: "tackle", by: p.index, from: owner, won: false });
    p.stunUntil = s.tick + 24;
    return;
  }
  // From the front or the ball side the tackle wins; from behind the carrier it misses.
  const ballSide = dot(norm(sub(s.ball.pos, c.pos)), norm(sub(p.pos, c.pos)));
  const won = ballSide > -0.25 && !c.keeper;
  s.events.push({ tick: s.tick, type: "tackle", by: p.index, from: owner, won });
  if (won) {
    c.stunUntil = s.tick + 30;
    s.kicks = s.kicks.filter((k) => k.by !== owner);
    gainControl(s, p.index, "tackle");
  } else {
    // A missed lunge: the carrier is past.
    p.stunUntil = s.tick + 36;
  }
}

// ---------- movement ----------

function movePlayer(s: SimState, p: Player) {
  const sp = moveBody(p, false);
  if (p.anim === "kick" && s.tick - p.animTick > (KICK_CLIP_SECONDS / KICK_RATE) * TICK_HZ)
    p.anim = "idle";
  if (p.anim !== "kick") p.anim = sp > 0.35 ? "run" : "idle";
  // Nobody stands inside another player.
  for (const o of s.players) {
    if (o.index <= p.index) continue;
    const d = dist(o.pos, p.pos);
    if (d > 0.01 && d < 0.55) {
      const push = scale(norm(sub(p.pos, o.pos)), (0.55 - d) / 2);
      p.pos = add(p.pos, push);
      o.pos = sub(o.pos, push);
    }
  }
}

function resolveKicks(s: SimState) {
  const due = s.kicks.filter((k) => k.contact <= s.tick);
  if (!due.length) return;
  s.kicks = s.kicks.filter((k) => k.contact > s.tick);
  for (const k of due) {
    const p = s.players[k.by]!;
    const has =
      s.ball.owner === k.by ||
      (s.ball.owner === null && dist(s.ball.pos, p.pos) < 1.2 && s.ball.h < 0.8);
    if (!has) continue;
    launch(s, k);
  }
}

function launch(s: SimState, k: Kick) {
  const p = s.players[k.by]!;
  const ball = s.ball;
  const from = { ...ball.pos };
  const pressure = nearestRival(s, p.pos, p.team).d;
  const human = k.by === s.ty;
  let dir = k.dir;
  let target: V;
  let receiver: Player | null = k.target !== null ? s.players[k.target]! : null;
  if (receiver && receiver.team !== p.team) receiver = null;
  if (k.type === "shot") {
    target = add(from, scale(dirOf(dir), 30));
  } else if (receiver) {
    target = leadPoint(from, receiver, k.type === "lofted");
    dir = headingOf(sub(target, from));
  } else {
    const reach = k.type === "lofted" ? 6 + 24 * k.power : 5 + 25 * k.power;
    target = add(from, scale(dirOf(dir), reach));
  }
  // Execution: under pressure, on the move and with a hard kick the direction spreads.
  const noiseSd =
    (human ? 0.016 : 0.01) +
    (pressure < 2 ? 0.03 : 0) +
    (len(p.vel) > 4 ? 0.012 : 0) +
    (k.type === "shot" ? 0.025 * k.power * k.power : 0) +
    (k.type === "lofted" ? 0.02 : 0);
  dir += gauss(s.random) * noiseSd;
  const u = dirOf(dir);
  let d = dist(from, target);
  if (k.type === "shot") {
    const speed = 11 + 15 * k.power;
    const goalY = rivalGoal(p.team).y;
    const along = Math.abs(u.y) > 0.05 ? Math.abs((goalY - from.y) / u.y) : 30;
    const reachGoal = Math.min(40, along);
    // The view's pitch sets the height at the goal line.
    const hAt = clamp(EYE + Math.tan(k.pitch) * reachGoal, BALL_H, 4.5);
    ball.vel = scale(u, speed);
    if (hAt > 0.45) {
      const T = reachGoal / speed;
      ball.vh = (hAt - BALL_H) / T + (GRAVITY * T) / 2;
      ball.h = 0.12;
    } else ball.vh = 0;
    s.shotBy = k.by;
    s.events.push({
      tick: s.tick,
      type: "shot",
      by: k.by,
      distance: dist(from, rivalGoal(p.team)),
    });
  } else if (k.type === "lofted") {
    if (receiver) d *= 0.8 + 0.4 * k.power;
    const T = 0.75 + d / 26;
    ball.vel = scale(u, d / T);
    ball.vh = (GRAVITY * T) / 2;
    ball.h = 0.12;
  } else {
    const arrive = receiver ? 3 + 5 * k.power : 2 + 4 * k.power;
    if (receiver) d *= 0.75 + 0.5 * k.power;
    ball.vel = scale(u, groundSpeedFor(Math.max(1, d), arrive));
    ball.vh = 0;
  }
  if (k.type !== "shot") {
    s.passTo = receiver ? receiver.index : null;
    s.passer = k.by;
    s.events.push({
      tick: s.tick,
      type: "pass",
      by: k.by,
      to: receiver ? receiver.index : null,
      kick: k.type,
      lane: laneMargin(s, from, target, p.team, k.type === "lofted"),
      pressure,
    });
  }
  ball.owner = null;
  ball.held = false;
  ball.last = k.by;
  p.noTouchUntil = s.tick + 14;
  s.future = null;
  if (s.phase === "restart") s.phase = "play";
  if (s.variant.timing === "onPass" && p.keeper && p.team === "home") s.presserTrigger = true;
}

function moveBall(s: SimState) {
  const b = s.ball;
  if (b.owner !== null) {
    const o = s.players[b.owner]!;
    if (o.keeper && b.held) {
      b.pos = add(o.pos, scale(dirOf(o.heading), 0.35));
      b.h = 1.0;
      b.vel = v(0, 0);
      b.vh = 0;
      return;
    }
    const sp = len(o.vel);
    const ahead = sp > 1 ? 0.7 : 0.5;
    const foot = add(o.pos, scale(dirOf(sp > 1 ? headingOf(o.vel) : o.heading), ahead));
    b.roll += dist(b.pos, foot);
    b.pos = foot;
    b.vel = { ...o.vel };
    b.h = BALL_H;
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

// ---------- contacts: control, first touch, keeper, tackles, goal and out ----------

function setPossession(s: SimState, team: Team) {
  if (s.possession !== team) {
    s.possession = team;
    s.possessionSince = s.tick;
    s.events.push({ tick: s.tick, type: "possession", team });
    s.plan = s.plan.map(() => null);
    s.runs = s.runs.map(() => null);
    s.tackleClock = 0;
  } else if (s.ball.owner !== null) s.possessionSince = s.tick;
}

function gainControl(s: SimState, index: number, from: "pass" | "loose" | "tackle") {
  const p = s.players[index]!;
  const b = s.ball;
  const shot = s.shotBy;
  s.passTo = null;
  s.shotBy = null;
  s.future = null;
  b.last = index;
  if (p.keeper && inOwnBox(b.pos, p.team)) {
    b.owner = index;
    b.held = true;
    b.vel = v(0, 0);
    setPossession(s, p.team);
    s.possessionSince = s.tick;
    if (shot !== null && s.players[shot]!.team !== p.team)
      s.events.push({ tick: s.tick, type: "save", by: index });
    s.events.push({ tick: s.tick, type: "control", by: index, from });
    return;
  }
  // TY's first touch: with the joystick held, the ball goes the way he moves (a touch away
  // from pressure); without it, the ball is stopped at his feet.
  if (
    index === s.ty &&
    s.move.speed > 0.35 &&
    from !== "tackle" &&
    b.last !== s.ty &&
    len(b.vel) > 2.5
  ) {
    const dir = s.move.dir;
    b.vel = scale(dirOf(dir), 2.6 + 2.2 * s.move.speed);
    b.vh = 0;
    b.h = BALL_H;
    p.noTouchUntil = s.tick + 9;
    s.events.push({
      tick: s.tick,
      type: "touch",
      by: index,
      dir,
      away: awayAngle(s, p, dir),
      pressure: nearestRival(s, p.pos, p.team).d,
    });
    setPossession(s, p.team);
    return;
  }
  if (index === s.ty && from !== "tackle")
    s.events.push({
      tick: s.tick,
      type: "touch",
      by: index,
      dir: null,
      away: 0,
      pressure: nearestRival(s, p.pos, p.team).d,
    });
  b.owner = index;
  b.held = false;
  setPossession(s, p.team);
  s.events.push({ tick: s.tick, type: "control", by: index, from });
  if (index === s.ty && s.variant.timing === "late") s.presserTrigger = true;
}

/** Angle (radians) between a touch and the direction to the nearest rival: π = straight away. */
function awayAngle(s: SimState, p: Player, dir: number) {
  const n = nearestRival(s, p.pos, p.team).player;
  if (!n) return Math.PI;
  return Math.abs(angleDiff(dir, headingOf(sub(n.pos, p.pos))));
}

function contacts(s: SimState) {
  const b = s.ball;
  if (s.outcome) return;
  // Goal or out of play.
  if (Math.abs(b.pos.y) > F5_PITCH.halfLength) {
    const scoredBy: Team = b.pos.y > 0 ? "home" : "away";
    if (Math.abs(b.pos.x) < F5_PITCH.goalHalfWidth && b.h < F5_PITCH.goalHeight) {
      s.events.push({ tick: s.tick, type: "goal", team: scoredBy });
      finish(s, scoredBy === "home" ? "goal" : "conceded");
    } else {
      s.events.push({ tick: s.tick, type: "out", last: b.last });
      if (s.shotBy !== null)
        finish(s, s.players[s.shotBy]!.team === "home" ? "shot" : "shotAgainst");
      else finish(s, b.last !== null && s.players[b.last]!.team === "home" ? "out" : "outAgainst");
    }
    b.vel = v(0, 0);
    b.vh = 0;
    return;
  }
  if (Math.abs(b.pos.x) > F5_PITCH.halfWidth) {
    s.events.push({ tick: s.tick, type: "out", last: b.last });
    finish(s, b.last !== null && s.players[b.last]!.team === "home" ? "out" : "outAgainst");
    b.vel = v(0, 0);
    return;
  }
  if (b.owner === null) {
    let best: Player | null = null,
      bestD = Infinity;
    for (const p of s.players) {
      if (s.tick < p.noTouchUntil || s.tick < p.stunUntil) continue;
      const keeperHere = p.keeper && inOwnBox(b.pos, p.team);
      const reach = keeperHere ? 1.25 : 0.72;
      const height = keeperHere ? 2.3 : 0.75;
      const d = dist(p.pos, b.pos);
      if (d > reach || b.h > height) continue;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      const speed = len(b.vel);
      if (!best.keeper && speed > 17) {
        // Too hard to control: it bounces off.
        const turn = (s.random() - 0.5) * 1.6;
        b.vel = scale(dirOf(headingOf(b.vel) + Math.PI + turn), speed * 0.3);
        b.last = best.index;
        best.noTouchUntil = s.tick + 10;
        return;
      }
      const intended = s.passTo === best.index;
      gainControl(s, best.index, intended ? "pass" : "loose");
    }
    if (b.owner === null && s.shotBy !== null && len(b.vel) < 0.3 && b.h <= 0.12) s.shotBy = null;
    return;
  }
  // With the ball: a rival who stays at the ball long enough wins it. With the carrier
  // between the rival and the ball (ball kept away), it takes much longer.
  const c = s.players[b.owner]!;
  if (c.keeper && b.held) return;
  let pressure = 0;
  let closest: Player | null = null,
    closestD = Infinity;
  for (const o of s.players) {
    if (o.team === c.team || o.keeper || s.tick < o.stunUntil) continue;
    const d = dist(o.pos, b.pos);
    if (d < 1.05 && d < closestD) {
      closest = o;
      closestD = d;
    }
  }
  if (closest) {
    const ballSide = dot(norm(sub(b.pos, c.pos)), norm(sub(closest.pos, c.pos)));
    pressure = ballSide > 0 ? 1 : 0.35;
    if (len(c.vel) > 4 && dot(norm(c.vel), norm(sub(closest.pos, c.pos))) < 0) pressure *= 0.5;
    // TY's own tackles use the button; rivals take the ball by staying on it.
    if (closest.index === s.ty) pressure = 0;
  }
  s.tackleClock = closest ? s.tackleClock + pressure : Math.max(0, s.tackleClock - 0.5);
  const windup = s.kicks.some((k) => k.by === c.index);
  if (closest && s.tackleClock >= (windup ? 11 : 22)) {
    s.events.push({ tick: s.tick, type: "tackle", by: closest.index, from: c.index, won: true });
    c.stunUntil = s.tick + 30;
    s.kicks = s.kicks.filter((k) => k.by !== c.index);
    gainControl(s, closest.index, "tackle");
  }
}

function judge(s: SimState) {
  if (s.outcome) return;
  if (s.possession === "away" && s.tick - lastHomeTouch(s) > LOSS_LIMIT) finish(s, "lost");
  if (s.tick >= MAX_TICKS) finish(s, s.possession === "home" ? "kept" : "lost");
}

function lastHomeTouch(s: SimState) {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i]!;
    if (e.type === "possession") return e.team === "away" ? e.tick : s.tick;
  }
  return s.tick;
}

/** Since when the team has had the ball without losing it. */
function teamSince(s: SimState, team: Team) {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i]!;
    if (e.type === "possession") return e.team === team ? e.tick : s.tick;
  }
  return 0;
}

// ---------- frames ----------

export function frameOf(s: SimState): Frame {
  return {
    tick: s.tick,
    agents: s.players.map((a) => ({
      x: a.pos.x,
      y: a.pos.y,
      heading: a.heading,
      speed: len(a.vel),
      stride: a.stride,
      anim: a.anim,
      animT: a.anim === "kick" ? ((s.tick - a.animTick) / TICK_HZ) * KICK_RATE : 0,
    })),
    ball: {
      x: s.ball.pos.x,
      y: s.ball.pos.y,
      h: s.ball.h,
      roll: s.ball.roll,
      heading: len(s.ball.vel) > 0.1 ? headingOf(s.ball.vel) : 0,
    },
  };
}

export const PLAYERS = PLAYER_COUNT;
