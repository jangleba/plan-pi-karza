import type { MatchPlayer, PlannedAction, Point, Scenario } from "./types";

// Tactical coordinates represent a 68 m wide pitch.
export const METRES_PER_UNIT = 0.68;
export const RUN_STRIDE_UNITS = 3.1 / METRES_PER_UNIT;
// Supplied Walking advances 184.52 FBX units per cycle. At the displayed
// Y Bot scale this is 6.94 pitch units; phase follows distance to limit foot slip.
export const WALK_STRIDE_UNITS = 6.94;
export const BALL_OFFSET = 1.8;
export const BALL_RADIUS = 0.65;
export const BALL_REST_HEIGHT = BALL_RADIUS + 0.05;
// Supplied Soccer Pass: 1.6 s at 30 FPS; right foot contact at frame 14.
export const PASS_WINDUP_SECONDS = 14 / 30;
export const PASS_RECOVERY_SECONDS = 34 / 30;
export const RECEIVE_SECONDS = 0.22;
export const PASS_CONTACT_PHASE = 14 / 48;
export const PASS_BALL_LATERAL = -0.15;
export const PASS_BALL_FORWARD = 2.65;

export type PlayerMotion = {
  heading: number;
  distance: number;
  moving: boolean;
  elapsed: number;
  duration: number;
  state?: "idle" | "turn" | "move" | "pass" | "receive";
  gait?: "run" | "walk";
  phase?: number;
  weight?: number;
  clock?: number;
};

export type PlaybackFrame = {
  positions: Map<string, Point>;
  motions: Map<string, PlayerMotion>;
  ball: Point;
  // Visual coordinates include the foot/setup offset, including pass endpoints.
  ballVisual: Point;
  ballHeight: number;
  ballCarrierId: string;
  ballInFlight: boolean;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const distanceBetween = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const TIME_EPSILON = 1e-9;
const face = (a: Point, b: Point, fallback: number) =>
  distanceBetween(a, b) > 0.001 ? Math.atan2(b.x - a.x, b.y - a.y) : fallback;
const atFoot = (point: Point, heading: number, lateral = 0, forward = BALL_OFFSET): Point => ({
  x: point.x + Math.sin(heading) * forward + Math.cos(heading) * lateral,
  y: point.y + Math.cos(heading) * forward - Math.sin(heading) * lateral,
});

export const shortestAngle = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

function turnDuration(from: number, to: number) {
  const angle = Math.abs(shortestAngle(from, to));
  return angle < 0.04 ? 0 : angle / (Math.PI * 2);
}

function turnHeading(from: number, to: number, elapsed: number, duration: number) {
  return from + shortestAngle(from, to) * (duration > 0 ? smooth(elapsed / duration) : 1);
}

export function actionDuration(action: PlannedAction, from = action.from, to = action.to) {
  const metres = distanceBetween(from, to) * METRES_PER_UNIT;
  if (action.type === "pass") return Math.max(0.15, metres / 15);
  // Integrating both acceleration ramps adds 0.18 s to the constant-speed time.
  return Math.max(0.45, metres / (action.type === "run" ? 5.2 : 1.6) + 0.18);
}

function initialMotion(player: MatchPlayer): PlayerMotion {
  return {
    heading: player.team === "home" ? Math.PI : 0,
    distance: 0,
    moving: false,
    elapsed: 0,
    duration: 0,
    state: "idle",
  };
}

export function createPlayback(scenario: Scenario, actions: PlannedAction[]) {
  const positions = new Map(scenario.players.map((p) => [p.id, { x: p.x, y: p.y }]));
  const headings = new Map(scenario.players.map((p) => [p.id, initialMotion(p).heading]));
  let start = 0;
  const segments = actions.map((action) => {
    // Reference anchors can be stale; begin where the preceding action ends.
    const from = positions.get(action.playerId) ?? action.from;
    const to = action.type === "pass" ? (positions.get(action.targetId) ?? action.to) : action.to;
    const headingFrom = headings.get(action.playerId) ?? Math.PI;
    const headingTo = face(from, to, headingFrom);
    const receiverFrom = action.type === "pass" ? (headings.get(action.targetId) ?? Math.PI) : 0;
    const receiverTo = face(to, from, receiverFrom);
    const turn = Math.max(
      turnDuration(headingFrom, headingTo),
      action.type === "pass" ? turnDuration(receiverFrom, receiverTo) : 0,
    );
    const travel = actionDuration(action, from, to);
    const duration =
      action.type === "pass"
        ? turn + PASS_WINDUP_SECONDS + Math.max(travel + RECEIVE_SECONDS, PASS_RECOVERY_SECONDS)
        : turn + travel;
    const segment = {
      action,
      from,
      to,
      start,
      duration,
      turn,
      travel,
      headingFrom,
      headingTo,
      receiverFrom,
      receiverTo,
    };
    start += duration;
    headings.set(action.playerId, headingFrom + shortestAngle(headingFrom, headingTo));
    if (action.type === "pass")
      headings.set(action.targetId, receiverFrom + shortestAngle(receiverFrom, receiverTo));
    else positions.set(action.playerId, to);
    return segment;
  });
  return { scenario, segments, duration: start };
}

export type Playback = ReturnType<typeof createPlayback>;

export function playbackDuration(scenario: Scenario, actions: PlannedAction[]) {
  return createPlayback(scenario, actions).duration;
}

// Integrate a trapezoidal speed profile, with zero velocity at both ends.
function movementProgress(elapsed: number, duration: number) {
  const t = Math.max(0, Math.min(duration, elapsed));
  const ramp = Math.min(0.18, duration / 3);
  const area = duration - ramp;
  if (t < ramp) return (t * t) / (2 * ramp * area);
  if (t > duration - ramp) return 1 - (duration - t) ** 2 / (2 * ramp * area);
  return (t - ramp / 2) / area;
}

export function samplePlayback(playback: Playback, progress: number): PlaybackFrame {
  const { scenario, segments, duration: total } = playback;
  const positions = new Map(scenario.players.map((p) => [p.id, { x: p.x, y: p.y }]));
  const motions = new Map(scenario.players.map((p) => [p.id, initialMotion(p)]));
  const elapsed = clamp(progress) * total;
  motions.forEach((motion) => {
    motion.clock = elapsed;
  });
  let ballCarrierId = scenario.ballCarrierId;
  let ball = positions.get(ballCarrierId) ?? { x: 50, y: 70 };
  let ballVisual: Point | null = null;
  let ballInFlight = false;
  let ballHeight = BALL_REST_HEIGHT;

  for (const segment of segments) {
    const { action, from, to, start, duration, turn, travel, headingFrom, headingTo } = segment;
    const t = Math.max(0, Math.min(duration, elapsed - start));
    // Multiplying normalized progress can round a boundary to either side.
    if (t <= TIME_EPSILON) break;
    const previous = motions.get(action.playerId)!;
    const heading = turnHeading(headingFrom, headingTo, t, turn);
    motions.set(action.playerId, { ...previous, heading, moving: false, state: "idle" });
    if (action.type === "pass") {
      const receiver = motions.get(action.targetId)!;
      const receiverHeading = turnHeading(segment.receiverFrom, segment.receiverTo, t, turn);
      motions.set(action.targetId, {
        ...receiver,
        heading: receiverHeading,
        moving: false,
        state: t < turn ? "turn" : "idle",
      });
      const kickTime = t - turn;
      const released = kickTime >= PASS_WINDUP_SECONDS;
      const flight = clamp((kickTime - PASS_WINDUP_SECONDS) / travel);
      const caught = released && flight >= 1;
      const phase = released
        ? PASS_CONTACT_PHASE +
          (1 - PASS_CONTACT_PHASE) * clamp((kickTime - PASS_WINDUP_SECONDS) / PASS_RECOVERY_SECONDS)
        : PASS_CONTACT_PHASE * clamp(kickTime / PASS_WINDUP_SECONDS);
      const weight = Math.min(
        smooth(kickTime / 0.1),
        smooth((PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS - kickTime) / 0.1),
      );
      motions.set(action.playerId, {
        ...motions.get(action.playerId)!,
        state: t < turn ? "turn" : weight > 0 ? "pass" : "idle",
        phase,
        weight,
        elapsed: Math.max(0, kickTime),
        duration: PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS,
      });
      if (released) {
        ball = mix(from, to, flight);
        ballVisual = mix(
          atFoot(from, heading, PASS_BALL_LATERAL, PASS_BALL_FORWARD),
          atFoot(to, receiverHeading),
          flight,
        );
        ballHeight = BALL_REST_HEIGHT + Math.sin(Math.PI * flight) * 0.12;
        ballInFlight = !caught;
      } else {
        // Set up the ball on the kicking side during the first step, continuously.
        ballVisual = mix(
          atFoot(from, heading),
          atFoot(from, heading, PASS_BALL_LATERAL, PASS_BALL_FORWARD),
          smooth(kickTime / 0.2),
        );
      }
      if (caught) {
        ballCarrierId = action.targetId;
        const controlTime = kickTime - PASS_WINDUP_SECONDS - travel;
        motions.set(action.targetId, {
          ...motions.get(action.targetId)!,
          state: controlTime < RECEIVE_SECONDS ? "receive" : "idle",
          phase: clamp(controlTime / RECEIVE_SECONDS),
          weight: Math.sin(Math.PI * clamp(controlTime / RECEIVE_SECONDS)),
          elapsed: controlTime,
          duration: RECEIVE_SECONDS,
        });
      }
    } else {
      const moveTime = Math.max(0, t - turn);
      const local = movementProgress(moveTime, travel);
      const point = mix(from, to, local);
      const distance = distanceBetween(from, to);
      positions.set(action.playerId, point);
      if (action.playerId === ballCarrierId) ballVisual = null;
      const moving = moveTime > TIME_EPSILON && duration - t > TIME_EPSILON && distance > 0.001;
      motions.set(action.playerId, {
        ...motions.get(action.playerId)!,
        distance: previous.distance + distance * local,
        moving,
        elapsed: moveTime,
        duration: travel,
        state: t < turn ? "turn" : moving ? "move" : "idle",
        gait: action.type === "shift" ? "walk" : "run",
        weight: moving ? Math.min(smooth(moveTime / 0.18), smooth((travel - moveTime) / 0.18)) : 0,
      });
    }
    if (t < duration) break;
  }
  if (!ballInFlight) {
    ball = positions.get(ballCarrierId) ?? ball;
    ballVisual ??= atFoot(ball, motions.get(ballCarrierId)?.heading ?? Math.PI);
  }
  return {
    positions,
    motions,
    ball,
    ballVisual: ballVisual ?? ball,
    ballHeight,
    ballCarrierId,
    ballInFlight,
  };
}

export function playbackFrame(scenario: Scenario, actions: PlannedAction[], progress: number) {
  return samplePlayback(createPlayback(scenario, actions), progress);
}
