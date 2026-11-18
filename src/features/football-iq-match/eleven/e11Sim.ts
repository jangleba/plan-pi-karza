/** Local, deterministic 11v11 attacking fragment (eleven players a side, 105 × 68 m).
 *
 * - Fixed 60 Hz step, independent of the display frame rate. The same variant and the same
 *   inputs give the same fragment on every device, so an attempt can be replayed from above.
 * - Movement and ball physics are shared with the 3v2 and 5v5 lessons (fpPhysics).
 * - One player (TY) is steered by the user: a movement direction and speed, a pass to a named
 *   team-mate (to feet or into the space ahead of him) and a shot. Everybody else follows local
 *   rules that react to the current picture every step; nothing decides the ending in advance.
 * - Offside is the real rule: at the moment the ball is played, a team-mate ahead of both the
 *   ball and the second-last rival, in the rivals' half, is flagged; when he is the first of
 *   your team to touch that ball the play is stopped. Level is onside. Judged at the release,
 *   never at the reception, so the timing of the pass is what the user trains.
 * - The fragment ends with a goal, a save, a shot wide, offside, a lost ball, the ball out of
 *   play or the time limit.
 */
import {
  add,
  clamp,
  dirOf,
  dist,
  headingOf,
  len,
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
  DT,
  GRAVITY,
  groundSpeedFor,
  moveBody,
  TICK_HZ,
  type MotionBody,
} from "../firstPerson/fpPhysics";
import {
  E11,
  LINE_Y,
  PLAYER_COUNT,
  PLAYERS_PER_TEAM,
  BASE,
  ROLE_START,
  SLOTS,
  slotIndex,
  type E11Run,
  type E11Variant,
  type Slot,
} from "./e11Variants";

export { DT, TICK_HZ };
export const E11_ENGINE_VERSION = 1;
export const MAX_TICKS = TICK_HZ * 45;
const RESTART_HOLD = 40;
/** Soccer-pass clip: foot contact at frame 14 of 30 FPS, played 1.5× faster (as in 5v5). */
export const KICK_CLIP_SECONDS = 1.6;
const KICK_CONTACT_TICKS = Math.round((14 / 30 / 1.5) * TICK_HZ);
const TOUCH_REACH = 0.95;
const AI_THINK = 14;
/** The runner waits this far behind the rivals' line, jogging, until his burst. */
const HOLD_BEHIND = 3;
/** A run ends inside the pitch: never a target next to the end line. */
const RUN_TARGET_MAX_Y = 43;
/** A defender follows a runner only this long after he got ahead of the line. */
const TRACK_AFTER = 12;
/** Rivals start to move for a played ball this many ticks after it is released. */
const REACTION = 26;

export type Team = "home" | "away";
export type Anim = "idle" | "run" | "kick";

export type E11Input =
  /** Joystick: world heading of the movement and 0…1 of top speed (0 = stop). */
  | { tick: number; kind: "move"; dir: number; speed: number }
  /** Pass to a team-mate: to his feet, or `through` into the space ahead of him. */
  | { tick: number; kind: "pass"; to: number; through: boolean }
  | { tick: number; kind: "shot" };

export type Player = MotionBody & {
  index: number;
  team: Team;
  slot: Slot;
  keeper: boolean;
  anim: Anim;
  animTick: number;
  noTouchUntil: number;
};
export type Ball = {
  pos: V;
  vel: V;
  h: number;
  vh: number;
  owner: number | null;
  last: number | null;
  roll: number;
  /** A lofted pass in the air: it comes down softly near the aim instead of racing on. */
  air: boolean;
};
type Kick = {
  by: number;
  kind: "pass" | "through" | "shot";
  to: number | null;
  contact: number;
  aim: V;
};
export type OutcomeKind =
  "goal" | "saved" | "shotOff" | "offside" | "intercepted" | "tackled" | "out" | "timeout";
export type Outcome = { kind: OutcomeKind; tick: number };

export type RunState = "hold" | "burst" | "cross" | "done";
export type E11Event =
  | { tick: number; type: "control"; by: number; from: "start" | "pass" | "loose" }
  | {
      tick: number;
      type: "pass";
      by: number;
      to: number;
      through: boolean;
      from: V;
      aim: V;
      /** World y of the rivals' offside line at the moment the ball was played. */
      line: number;
      /** Receiver ahead (+) or behind (−) the line at that moment, metres. */
      gap: number;
      flagged: number[];
      lane: number;
      pressure: number;
      /** For a run: ticks since the run's burst began (negative = not yet). */
      sinceBurst: number | null;
    }
  | { tick: number; type: "shot"; by: number; distance: number; lane: number; pressure: number }
  | { tick: number; type: "offside"; by: number; passer: number; line: number; gap: number }
  | { tick: number; type: "tackle"; by: number; from: number }
  | { tick: number; type: "block"; by: number }
  | { tick: number; type: "run"; slot: Slot; state: RunState }
  | { tick: number; type: "line"; from: number; to: number }
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
/** Light snapshot for the replay from above (every second step). */
export type Snapshot = {
  tick: number;
  /** x, y, heading for each of the 22 players. */
  p: number[];
  ball: [number, number, number];
  /** The rivals' offside line at that moment (world y). */
  line: number;
  owner: number | null;
};

export type Phase = "restart" | "play" | "done";
type Runner = {
  run: E11Run;
  index: number;
  state: RunState;
  since: number;
  /** Tick at which he first got ahead of the rivals' line (null before). */
  crossed: number | null;
  target: V;
};

export type SimState = {
  variant: E11Variant;
  ty: number;
  tick: number;
  phase: Phase;
  players: Player[];
  ball: Ball;
  kicks: Kick[];
  move: { dir: number; speed: number };
  /** Rivals' back line (world y of their deepest defender) and its planned steps. */
  lineY: number;
  stepFrom: number;
  stepTo: number;
  stepStart: number;
  stepEnd: number;
  lastStepAt: number;
  runners: Runner[];
  /** Tick at which each player last gained the ball, for the presser's timing. */
  gainedAt: number;
  decideAt: number[];
  /** Ticks a rival has been at your ball carrier (the tackle needs time). */
  contactTicks: number;
  /** Free ball: who goes where to meet it (one chaser per team), refreshed every few steps. */
  chase: Map<number, V>;
  /** The last ball played by your team: who may be flagged when he touches it. */
  lastPlay: { tick: number; by: number; flagged: number[]; line: number; shot: boolean } | null;
  outcome: Outcome | null;
  events: E11Event[];
  snapshots: Snapshot[];
  frames: Frame[];
  random: () => number;
  record: boolean;
};
export type SimOptions = { record?: boolean };

const teamOf = (i: number): Team => (i < PLAYERS_PER_TEAM ? "home" : "away");
const keeperOf = (team: Team) => (team === "home" ? 0 : PLAYERS_PER_TEAM);
const GOAL_Y = E11.halfLength;
const other = (team: Team): Team => (team === "home" ? "away" : "home");

function makePlayer(index: number, pos: V): Player {
  const team = teamOf(index);
  const slot = SLOTS[index % PLAYERS_PER_TEAM]!;
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
    maxSpeed: keeper ? 5.5 : 8.1,
    accel: keeper ? 4.2 : 5.2,
    stride: 0,
    anim: "idle",
    animTick: 0,
    noTouchUntil: 0,
  };
}

export function createSim(variant: E11Variant, options: SimOptions = {}): SimState {
  const players = variant.start.map((p, i) => makePlayer(i, p));
  const ty = slotIndex("home", ROLE_START[variant.role].slot);
  const ball: Ball = {
    pos: { ...variant.ball },
    vel: v(0, 0),
    h: 0.11,
    vh: 0,
    owner: ty,
    last: ty,
    roll: 0,
    air: false,
  };
  const runners: Runner[] = variant.runs.map((run) => ({
    run,
    index: slotIndex("home", run.slot),
    state: "hold",
    since: 0,
    crossed: null,
    target: v(run.lane, Math.min(RUN_TARGET_MAX_Y, LINE_Y[variant.line] + run.depth)),
  }));
  const start = LINE_Y[variant.line];
  const s: SimState = {
    variant,
    ty,
    tick: 0,
    phase: "restart",
    players,
    ball,
    kicks: [],
    move: { dir: 0, speed: 0 },
    lineY: start,
    stepFrom: start,
    stepTo: start,
    stepStart: 0,
    stepEnd: 0,
    lastStepAt: -999,
    runners,
    gainedAt: 0,
    decideAt: players.map(() => 0),
    contactTicks: 0,
    chase: new Map(),
    lastPlay: null,
    outcome: null,
    events: [{ tick: 0, type: "control", by: ty, from: "start" }],
    snapshots: [],
    frames: [],
    random: rng(variant.seed * 104729 + 7),
    record: options.record ?? true,
  };
  players[ty]!.heading = 0;
  for (const p of players) {
    p.target = { ...p.pos };
    p.face = { ...ball.pos };
  }
  record(s);
  return s;
}

/** The rivals' offside line: the second-last rival or the ball, whichever is deeper (world y). */
export function offsideLine(players: readonly Player[], ballY: number): number {
  const ys = players
    .filter((p) => p.team === "away")
    .map((p) => p.pos.y)
    .sort((a, b) => b - a);
  return Math.max(ballY, ys[1] ?? ys[0] ?? 0);
}
/** Would this player of your team be offside if the ball were played now? */
export function isOffside(p: Player, line: number): boolean {
  return p.team === "home" && p.pos.y > line + 1e-6 && p.pos.y > 0;
}

export function applyInput(s: SimState, input: E11Input) {
  if (s.phase === "done") return;
  const ty = s.players[s.ty]!;
  if (input.kind === "move") {
    s.move = { dir: input.dir, speed: clamp(input.speed, 0, 1) };
    return;
  }
  if (s.phase !== "play" || s.ball.owner !== s.ty || ty.anim === "kick") return;
  if (input.kind === "pass") {
    if (input.to === s.ty || input.to < 0 || input.to >= PLAYERS_PER_TEAM) return;
    startKick(s, {
      by: s.ty,
      kind: input.through ? "through" : "pass",
      to: input.to,
      contact: s.tick + KICK_CONTACT_TICKS,
      aim: passAim(s, input.to, input.through),
    });
  } else if (input.kind === "shot") {
    startKick(s, {
      by: s.ty,
      kind: "shot",
      to: null,
      contact: s.tick + KICK_CONTACT_TICKS,
      aim: shotAim(s, s.ty),
    });
  }
}
function startKick(s: SimState, kick: Kick) {
  const p = s.players[kick.by]!;
  p.anim = "kick";
  p.animTick = 0;
  s.kicks.push(kick);
}

export function stepSim(s: SimState, inputs: readonly E11Input[] = []) {
  if (s.phase === "done") return;
  for (const input of inputs) if (input.tick === s.tick) applyInput(s, input);
  if (s.phase === "restart" && s.tick >= RESTART_HOLD) s.phase = "play";
  if (s.phase === "play") {
    updateLine(s);
    think(s);
  }
  for (const p of s.players) movePlayer(s, p);
  resolveKicks(s);
  if (s.phase === "play") moveBall(s);
  else follow(s);
  s.tick++;
  if (s.phase === "play" && !s.outcome && s.tick >= MAX_TICKS) finish(s, "timeout");
  if (s.tick % 2 === 0) record(s);
}
export function runSim(variant: E11Variant, inputs: readonly E11Input[], options: SimOptions = {}) {
  const s = createSim(variant, options);
  const last = inputs.reduce((m, i) => Math.max(m, i.tick), 0);
  while (s.phase !== "done" && s.tick < Math.max(MAX_TICKS, last + 2)) stepSim(s, inputs);
  return s;
}
function finish(s: SimState, kind: OutcomeKind) {
  if (s.outcome) return;
  s.outcome = { kind, tick: s.tick };
  s.phase = "done";
  s.events.push({ tick: s.tick, type: "end", outcome: s.outcome });
  record(s);
}

// ---------------------------------------------------------------- geometry and reading

/** Smallest distance of any rival to the segment a→b, only counting those who could get there. */
export function laneMargin(s: SimState, from: V, to: V, team: Team): number {
  let best = 99;
  for (const p of s.players) {
    if (p.team === team || p.keeper) continue;
    const seg = segmentDistance(p.pos, from, to);
    if (seg.t <= 0.05 || seg.t >= 0.97) continue;
    best = Math.min(best, seg.d);
  }
  return best;
}
export function nearestRival(s: SimState, at: V, team: Team, keepers = false): number {
  let best = 99;
  for (const p of s.players)
    if (p.team !== team && (keepers || !p.keeper)) best = Math.min(best, dist(p.pos, at));
  return best;
}

function passAim(s: SimState, to: number, through: boolean): V {
  const r = s.players[to]!;
  const runner = s.runners.find((q) => q.index === to && q.state !== "done");
  if (through) {
    // Into the space his run is heading for; without a run, ten metres ahead of him.
    const t = runner ? runner.target : v(r.pos.x, Math.min(GOAL_Y - 8, r.pos.y + 12));
    return { x: clamp(t.x, -E11.halfWidth + 1, E11.halfWidth - 1), y: Math.min(GOAL_Y - 2, t.y) };
  }
  return add(r.pos, scale(r.vel, 0.45));
}
/** Aim for the far post when the keeper leans to one side; a little noise from the distance. */
function shotAim(s: SimState, by: number): V {
  const keeper = s.players[keeperOf(teamOf(by) === "home" ? "away" : "home")]!;
  const side = keeper.pos.x > 0 ? -1 : 1;
  const p = s.players[by]!;
  const d = dist(p.pos, v(0, GOAL_Y));
  const noise = (s.random() - 0.5) * Math.min(3.2, d * 0.06);
  return v(clamp(side * 2.7 + noise, -6, 6), GOAL_Y + 0.5);
}

// ---------------------------------------------------------------- rivals' line and runs

function updateLine(s: SimState) {
  const steps = s.variant.steps;
  for (const step of steps) {
    if (step.tick === s.tick) {
      s.stepFrom = s.lineY;
      s.stepTo = s.lineY + step.delta;
      s.stepStart = s.tick;
      s.stepEnd = s.tick + Math.round(step.seconds * TICK_HZ);
      s.lastStepAt = s.tick;
      s.events.push({ tick: s.tick, type: "line", from: s.stepFrom, to: s.stepTo });
    }
  }
  if (s.tick <= s.stepEnd && s.stepEnd > s.stepStart) {
    const k = clamp((s.tick - s.stepStart) / (s.stepEnd - s.stepStart), 0, 1);
    s.lineY = s.stepFrom + (s.stepTo - s.stepFrom) * k;
  }
  for (const r of s.runners) {
    const p = s.players[r.index]!;
    if (r.state === "hold" && s.tick >= r.run.burst) {
      r.state = "burst";
      r.since = s.tick;
      s.events.push({ tick: s.tick, type: "run", slot: r.run.slot, state: "burst" });
    }
    if (r.state === "burst" && r.crossed === null && p.pos.y > s.lineY) {
      r.crossed = s.tick;
      s.events.push({ tick: s.tick, type: "run", slot: r.run.slot, state: "cross" });
    }
    if (r.state === "burst" && (dist(p.pos, r.target) < 2.2 || s.tick - r.since > 240)) {
      r.state = "done";
      s.events.push({ tick: s.tick, type: "run", slot: r.run.slot, state: "done" });
    }
  }
}

// ---------------------------------------------------------------- the thinking of the 20

function think(s: SimState) {
  const ball = s.ball;
  const owner = ball.owner !== null ? s.players[ball.owner]! : null;
  const block = clamp(ball.pos.y * 0.6, -14, 22);
  const lineY = s.lineY;
  const ty = s.players[s.ty]!;
  if (ball.owner !== null) s.chase.clear();
  else if (s.tick % 4 === 0) refreshChase(s);
  for (const p of s.players) {
    if (p.index === s.ty) {
      // You: the joystick sets the target; no joystick, no run.
      const d = dirOf(s.move.dir);
      ty.target = add(ty.pos, scale(d, 8));
      ty.top = s.move.speed * ty.maxSpeed;
      ty.face = null;
      continue;
    }
    p.face = { ...ball.pos };
    if (p.team === "home") homeBrain(s, p, owner, block, lineY);
    else awayBrain(s, p, owner, lineY);
  }
}

function homeBrain(s: SimState, p: Player, owner: Player | null, block: number, lineY: number) {
  const ball = s.ball;
  if (p.keeper) {
    p.target = v(clamp(ball.pos.x * 0.1, -3, 3), -49);
    p.top = 3;
    return;
  }
  if (owner === p) return carrierBrain(s, p);
  // A free ball played to you: go and meet it.
  const meet = s.chase.get(p.index);
  if (meet && ball.owner === null) {
    p.target = meet;
    p.top = p.maxSpeed;
    return;
  }
  const runner = s.runners.find((r) => r.index === p.index);
  if (runner && runner.state === "burst") {
    p.target = { ...runner.target };
    p.top = p.maxSpeed;
    p.face = null;
    return;
  }
  const base = BASE[p.slot];
  let x = base.x * 0.9 + ball.pos.x * 0.18;
  let y = base.y + block;
  const attacker = p.slot === "ls" || p.slot === "rs" || p.slot === "lm" || p.slot === "rm";
  if (runner && runner.state === "hold") {
    // Level with the line, drifting along it: the waiting before the burst.
    const live = s.tick - 0;
    x = runner.run.lane * 0.55 + Math.sin(live * 0.045 + p.index) * 3.2;
    y = lineY - HOLD_BEHIND;
    // A runner who finds himself beyond the line after a step-up checks back, a beat late.
    if (p.pos.y > lineY && s.tick > s.lastStepAt + 28) {
      p.target = v(x, lineY - HOLD_BEHIND);
      p.top = 6.5;
    } else {
      p.target = v(x, Math.min(y, lineY - 0.2));
      p.top = 3.6;
    }
    return;
  }
  if (attacker) y = Math.min(y, lineY - 0.8);
  p.target = v(clamp(x, -31, 31), clamp(y, -47, GOAL_Y - 6));
  p.top = 5.2;
}

function carrierBrain(s: SimState, p: Player) {
  const ball = s.ball;
  p.target = v(clamp(p.pos.x * 0.9, -28, 28), Math.min(GOAL_Y - 8, p.pos.y + 12));
  p.top = 6.2;
  if (s.tick < s.decideAt[p.index]!) return;
  s.decideAt[p.index] = s.tick + AI_THINK;
  if (p.anim === "kick") return;
  const toGoal = dist(p.pos, v(0, GOAL_Y));
  if (p.pos.y > 28 && toGoal < 24 && s.random() < 0.7) {
    startKick(s, {
      by: p.index,
      kind: "shot",
      to: null,
      contact: s.tick + KICK_CONTACT_TICKS,
      aim: shotAim(s, p.index),
    });
    return;
  }
  const line = offsideLine(s.players, ball.pos.y);
  let best = -1,
    bestScore = -Infinity;
  for (let i = 1; i < PLAYERS_PER_TEAM; i++) {
    if (i === p.index) continue;
    const q = s.players[i]!;
    if (isOffside(q, line)) continue;
    const lane = laneMargin(s, p.pos, q.pos, "home");
    if (lane < 2.4) continue;
    const gain = q.pos.y - p.pos.y;
    const score =
      gain * 0.5 +
      Math.min(lane, 6) +
      nearestRival(s, q.pos, "home") * 0.4 -
      dist(p.pos, q.pos) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0 && bestScore > 4 && s.random() < 0.55)
    startKick(s, {
      by: p.index,
      kind: "pass",
      to: best,
      contact: s.tick + KICK_CONTACT_TICKS,
      aim: passAim(s, best, false),
    });
}

function awayBrain(s: SimState, p: Player, owner: Player | null, lineY: number) {
  const ball = s.ball;
  const homeBall = owner?.team === "home";
  if (p.keeper) return keeperBrain(s, p);
  const base = BASE[p.slot];
  const lx = clamp(-base.x * 0.95 + ball.pos.x * 0.2, -31, 31);
  const backFour = p.slot === "lb" || p.slot === "lcb" || p.slot === "rcb" || p.slot === "rb";
  const mid = p.slot === "lm" || p.slot === "lcm" || p.slot === "rcm" || p.slot === "rm";
  // A free ball: the nearest rival who can reach it goes for it.
  const meet = s.chase.get(p.index);
  if (meet && ball.owner === null) {
    p.target = meet;
    p.top = p.maxSpeed;
    return;
  }
  if (backFour) {
    // A burst runner is followed by the nearest defender, a beat after the run starts.
    const run = s.runners.find((r) => r.crossed !== null && s.tick > r.crossed + TRACK_AFTER);
    if (run && trackerOf(s, run) === p.index) {
      const rp = s.players[run.index]!.pos;
      p.target = v(rp.x, rp.y + 1.2);
      p.top = 7.9;
      return;
    }
    const stagger = p.slot === "lcb" || p.slot === "rcb" ? 0.5 : -0.3;
    p.target = v(lx, Math.min(GOAL_Y - 8, lineY + stagger));
    p.top = 7;
    return;
  }
  if (mid) {
    const my = Math.min(lineY - 8, Math.max(ball.pos.y + 12, lineY - 16));
    p.target = v(lx, my);
    p.top = 6;
    if (homeBall && presserOf(s) === p.index) pressTarget(s, p);
    return;
  }
  // The two strikers: the nearer one presses the ball, the other drops in front of the block.
  p.target = v(lx * 0.5, Math.min(lineY - 14, ball.pos.y + 18));
  p.top = 6;
  if (homeBall && presserOf(s) === p.index) pressTarget(s, p);
}
function trackerOf(s: SimState, run: Runner): number {
  const rp = s.players[run.index]!.pos;
  let best = -1,
    bd = 1e9;
  for (const slot of ["lb", "lcb", "rcb", "rb"] as const) {
    const i = slotIndex("away", slot);
    const d = Math.abs(s.players[i]!.pos.x - rp.x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
/** The rival who goes for the ball carrier: the nearest outfield player, after a delay. */
function presserOf(s: SimState): number {
  if (s.ball.owner === null) return -1;
  const at = s.players[s.ball.owner]!.pos;
  let best = -1,
    bd = 1e9;
  for (const p of s.players) {
    if (p.team !== "away" || p.keeper) continue;
    const d = dist(p.pos, at);
    if (d < bd) {
      bd = d;
      best = p.index;
    }
  }
  return s.tick - s.gainedAt >= s.variant.pressDelay ? best : -1;
}
function pressTarget(s: SimState, p: Player) {
  const owner = s.players[s.ball.owner!]!;
  p.target = add(owner.pos, scale(owner.vel, 0.25));
  p.top = 7.2;
  p.face = null;
}

function keeperBrain(s: SimState, p: Player) {
  const ball = s.ball;
  const own = p.team === "away";
  const sign = own ? 1 : -1;
  const ownY = sign * 49;
  const flying = ball.owner === null && len(ball.vel) > 6;
  const comingIn = flying && Math.sign(ball.vel.y) === sign;
  if (comingIn) {
    // Read where the ball crosses the line and be there.
    const t = (sign * GOAL_Y - ball.pos.y) / Math.max(1e-3, ball.vel.y);
    const cx = clamp(
      ball.pos.x + ball.vel.x * Math.max(0, t),
      -E11.goalHalfWidth - 1,
      E11.goalHalfWidth + 1,
    );
    p.target = v(cx, ownY - sign * 0.5);
    p.top = p.maxSpeed * 1.15;
  } else {
    p.target = v(clamp(ball.pos.x * 0.12, -3, 3), ownY);
    p.top = 3;
  }
  // A through ball he can reach before any runner: he comes off the line.
  const meet = s.chase.get(p.index);
  if (meet && ball.owner === null && Math.abs(meet.y) > 36) {
    p.target = meet;
    p.top = p.maxSpeed;
  }
}

/**
 * The free ball: for each team, the player who can reach it earliest goes to meet it. The
 * rest keep their places. Whoever really arrives first gets the touch (touches()).
 */
function refreshChase(s: SimState) {
  s.chase.clear();
  const ball = s.ball;
  if (ball.owner !== null) return;
  if (len(ball.vel) < 1) {
    // A loose, nearly still ball: the nearest outfield player of each team goes and gets it.
    for (const team of ["home", "away"] as const) {
      let best: Player | null = null;
      for (const p of s.players)
        if (p.team === team && !p.keeper && p.noTouchUntil <= s.tick)
          if (!best || dist(p.pos, ball.pos) < dist(best.pos, ball.pos)) best = p;
      if (best) s.chase.set(best.index, { ...ball.pos });
    }
    return;
  }
  // Rivals read the pass a beat after it leaves the foot.
  const awayReacts = !s.lastPlay || s.tick >= s.lastPlay.tick + REACTION;
  const future = ballFuture({ pos: ball.pos, vel: ball.vel, h: ball.h, vh: ball.vh }, 3.2, 0.1);
  for (const team of ["home", "away"] as const) {
    let best: { index: number; at: V; t: number } | null = null;
    for (const p of s.players) {
      if (p.team !== team || p.noTouchUntil > s.tick) continue;
      if (team === "away" && !awayReacts && !p.keeper) continue;
      for (const sample of future) {
        if (sample.h > 2) continue;
        if (canReach(p, sample.p, sample.t, 0.7)) {
          if (!best || sample.t < best.t) best = { index: p.index, at: sample.p, t: sample.t };
          break;
        }
      }
    }
    if (best) s.chase.set(best.index, best.at);
  }
}

// ---------------------------------------------------------------- moving, kicking, ball

function movePlayer(s: SimState, p: Player) {
  if (s.phase === "restart" && p.index !== s.ty) {
    p.top = 0;
  }
  const sp = moveBody(p, false);
  if (p.anim === "kick") {
    p.animTick++;
    if (p.animTick >= KICK_CLIP_SECONDS * TICK_HZ) p.anim = "idle";
  } else p.anim = sp > 0.35 ? "run" : "idle";
  p.pos.x = clamp(p.pos.x, -E11.halfWidth - 2, E11.halfWidth + 2);
  p.pos.y = clamp(p.pos.y, -GOAL_Y - 2, GOAL_Y + 2);
}

function resolveKicks(s: SimState) {
  if (!s.kicks.length) return;
  const rest: Kick[] = [];
  for (const k of s.kicks) {
    if (s.tick < k.contact) {
      rest.push(k);
      continue;
    }
    // The kicker lost the ball in the meantime (tackled): nothing leaves his foot.
    if (s.ball.owner === k.by) launch(s, k);
  }
  s.kicks = rest;
}

function launch(s: SimState, k: Kick) {
  const p = s.players[k.by]!;
  const from = { ...s.ball.pos };
  const d = dist(from, k.aim);
  const dir = norm(sub(k.aim, from));
  const home = p.team === "home";
  if (k.kind === "shot") {
    const speed = clamp(18 + d * 0.12, 18, 26);
    s.ball.vel = scale(dir, speed);
    s.events.push({
      tick: s.tick,
      type: "shot",
      by: k.by,
      distance: dist(p.pos, v(0, GOAL_Y)),
      lane: laneMargin(s, from, k.aim, p.team),
      pressure: nearestRival(s, p.pos, p.team),
    });
  } else {
    // A long ball cannot roll that far: it is lofted and comes down near the aim, then bounces.
    const lofted = d > (k.kind === "through" ? 22 : 30);
    if (lofted) {
      const flight = clamp(d / 20, 1.0, 2.7);
      s.ball.vel = scale(dir, d / flight);
      s.ball.vh = 0.5 * GRAVITY * flight;
      s.ball.air = true;
    } else {
      const arrive = k.kind === "through" ? 10 : 6;
      s.ball.vel = scale(dir, groundSpeedFor(Math.max(2, d), arrive));
      s.ball.vh = 0;
      s.ball.air = false;
    }
  }
  s.ball.owner = null;
  s.ball.last = k.by;
  s.ball.h = 0.11;
  if (k.kind === "shot") {
    s.ball.vh = 0;
    s.ball.air = false;
  }
  p.noTouchUntil = s.tick + 22;
  if (home && k.kind !== "shot" && k.to !== null) {
    const line = offsideLine(s.players, from.y);
    const flagged = s.players
      .filter((q) => q.index !== k.by && isOffside(q, line))
      .map((q) => q.index);
    const runner = s.runners.find((r) => r.index === k.to);
    const receiver = s.players[k.to]!;
    s.lastPlay = { tick: s.tick, by: k.by, flagged, line, shot: false };
    s.events.push({
      tick: s.tick,
      type: "pass",
      by: k.by,
      to: k.to,
      through: k.kind === "through",
      from,
      aim: k.aim,
      line,
      gap: receiver.pos.y - line,
      flagged,
      lane: laneMargin(s, from, k.aim, "home"),
      pressure: nearestRival(s, p.pos, "home"),
      sinceBurst: runner
        ? runner.state === "hold"
          ? s.tick - runner.run.burst
          : s.tick - runner.since
        : null,
    });
  } else if (home && k.kind === "shot") {
    s.lastPlay = {
      tick: s.tick,
      by: k.by,
      flagged: [],
      line: offsideLine(s.players, from.y),
      shot: true,
    };
  } else s.lastPlay = null;
}

function follow(s: SimState) {
  // Before the whistle the ball sits at the carrier's feet.
  const owner = s.ball.owner !== null ? s.players[s.ball.owner]! : null;
  if (owner) holdBall(s, owner);
}
function holdBall(s: SimState, owner: Player) {
  const facing = dirOf(owner.heading);
  s.ball.pos = add(owner.pos, scale(facing, 0.55));
  s.ball.vel = v(0, 0);
  s.ball.h = 0.11;
  s.ball.vh = 0;
}

function moveBall(s: SimState) {
  const ball = s.ball;
  if (ball.owner !== null) {
    const owner = s.players[ball.owner]!;
    holdBall(s, owner);
    tackleCheck(s, owner);
    return;
  }
  const prev = { ...ball.pos };
  const next = advanceBall(ball.pos, ball.vel, ball.h, ball.vh, DT);
  ball.pos = next.p;
  ball.vel = next.vel;
  const wasUp = ball.h > 0.115;
  ball.h = next.h;
  ball.vh = next.vh;
  if (ball.air && wasUp && ball.h <= 0.115) {
    // The first landing of a lofted ball is soft: it holds near where it came down.
    ball.air = false;
    ball.vel = scale(ball.vel, 0.28);
    ball.vh = 0;
  }
  ball.roll += len(ball.vel) * DT;
  // Goal line / touchline.
  if (Math.abs(ball.pos.y) > GOAL_Y) {
    const side = Math.sign(ball.pos.y);
    const inGoal = Math.abs(ball.pos.x) < E11.goalHalfWidth && ball.h < E11.goalHeight;
    if (side > 0 && inGoal) {
      // A keeper who is at the ball when it crosses has saved it.
      const gk = s.players[keeperOf("away")]!;
      if (dist(gk.pos, ball.pos) < 1.9 && s.lastPlay?.shot) {
        s.events.push({ tick: s.tick, type: "block", by: gk.index });
        finish(s, "saved");
      } else finish(s, "goal");
    } else if (side > 0 && s.lastPlay?.shot) finish(s, "shotOff");
    else finish(s, "out");
    return;
  }
  if (Math.abs(ball.pos.x) > E11.halfWidth) {
    finish(s, s.lastPlay?.shot ? "shotOff" : "out");
    return;
  }
  touches(s, prev);
}

function touches(s: SimState, prev: V) {
  const ball = s.ball;
  if (ball.h > 1.9) return;
  let best: Player | null = null,
    bd = 1e9;
  for (const p of s.players) {
    if (p.noTouchUntil > s.tick) continue;
    const reach = p.keeper ? 1.9 : TOUCH_REACH;
    const d = segmentDistance(p.pos, prev, ball.pos).d;
    if (d < reach && d < bd) {
      bd = d;
      best = p;
    }
  }
  if (best) gain(s, best);
}

function gain(s: SimState, p: Player) {
  const play = s.lastPlay;
  if (p.team === "away") {
    s.ball.owner = p.index;
    s.ball.last = p.index;
    if (p.keeper && play?.shot) {
      s.events.push({ tick: s.tick, type: "block", by: p.index });
      finish(s, "saved");
    } else {
      s.events.push({ tick: s.tick, type: "block", by: p.index });
      finish(s, "intercepted");
    }
    return;
  }
  // Your team: a flagged player who is first to touch the ball he was ahead of the line for.
  if (play && play.flagged.includes(p.index) && s.tick >= play.tick) {
    const gap = p.pos.y - play.line;
    s.events.push({
      tick: s.tick,
      type: "offside",
      by: p.index,
      passer: play.by,
      line: play.line,
      gap,
    });
    finish(s, "offside");
    return;
  }
  const from = s.ball.last === p.index ? "loose" : "pass";
  s.ball.owner = p.index;
  s.ball.last = p.index;
  s.ball.vel = v(0, 0);
  s.gainedAt = s.tick;
  s.lastPlay = null;
  s.events.push({ tick: s.tick, type: "control", by: p.index, from });
}

function tackleCheck(s: SimState, owner: Player) {
  if (owner.team !== "home" || s.tick - s.gainedAt < 20) return;
  let close = false;
  for (const p of s.players) {
    if (p.team !== "away" || p.keeper) continue;
    if (dist(p.pos, owner.pos) > 1.1) continue;
    close = true;
    // He must stay with you for half a second before the ball is won; a runner with the ball
    // at speed is hard to stop.
    if (s.contactTicks < 30) continue;
    const speed = len(owner.vel);
    const win = speed < 4.6 || s.random() < 0.3;
    if (!win) continue;
    s.events.push({ tick: s.tick, type: "tackle", by: p.index, from: owner.index });
    s.ball.owner = p.index;
    s.ball.last = p.index;
    finish(s, "tackled");
    return;
  }
  s.contactTicks = close ? s.contactTicks + 1 : 0;
}

// ---------------------------------------------------------------- recording and frames

function record(s: SimState) {
  if (!s.record) return;
  const p: number[] = [];
  for (const q of s.players) p.push(round(q.pos.x), round(q.pos.y), round(q.heading));
  s.snapshots.push({
    tick: s.tick,
    p,
    ball: [round(s.ball.pos.x), round(s.ball.pos.y), round(s.ball.h)],
    line: round(offsideLine(s.players, s.ball.pos.y)),
    owner: s.ball.owner,
  });
}
const round = (n: number) => Math.round(n * 100) / 100;

export function frameOf(s: SimState): Frame {
  return {
    tick: s.tick,
    agents: s.players.map((p) => ({
      x: p.pos.x,
      y: p.pos.y,
      heading: p.heading,
      speed: len(p.vel),
      stride: p.stride,
      anim: p.anim,
      animT: p.animTick / TICK_HZ,
    })),
    ball: {
      x: s.ball.pos.x,
      y: s.ball.pos.y,
      h: s.ball.h,
      roll: s.ball.roll,
      heading: headingOf(s.ball.vel),
    },
  };
}
export const PLAYER_TOTAL = PLAYER_COUNT;
export { other as otherTeam };
