import {
  BALL_REST_HEIGHT,
  PASS_BALL_FORWARD,
  PASS_BALL_LATERAL,
  PASS_WINDUP_SECONDS,
  PASS_RECOVERY_SECONDS,
  shortestAngle,
} from "./animation";
import type { PlaybackFrame, PlayerMotion } from "./animation";
import { flightProfile } from "./ballFlight";
import { validateAerialCalibration } from "./aerialClips";
import type { AerialCalibration } from "./aerialClips";
import type { RunningModel } from "./mixamo";
import type { MatchPlayer, Point } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const face = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.y - a.y);
function contactAt(p: Point, heading: number, contact: AerialCalibration["contact"]): Point {
  return {
    x: p.x + Math.sin(heading) * contact.forward + Math.cos(heading) * contact.lateral,
    y: p.y + Math.cos(heading) * contact.forward - Math.sin(heading) * contact.lateral,
  };
}
const foot = { lateral: 0, forward: 1.8, height: BALL_REST_HEIGHT };
const inside = (p: Point) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 140;

export type AerialSequenceOptions = {
  passerId: string;
  headerId: string;
  receiverId: string;
  headerAt: Point;
  delivery: "lofted" | "cross";
};

// Playback infrastructure for real, calibrated clips. Kept out of the learner's
// scenario picker until the exports have been supplied and visually verified.
export function createAerialSequence(
  players: readonly MatchPlayer[],
  options: AerialSequenceOptions,
  assets: Pick<RunningModel, "aerial" | "aerialStatus">,
) {
  const header = assets.aerial.header;
  if (!header || assets.aerialStatus.header !== "ready")
    throw new Error("Główka czeka na sprawdzony i skalibrowany plik Mixamo.");
  const headerTiming = validateAerialCalibration("header", header);
  const kick =
    assets.aerialStatus["long-kick"] === "ready" ? assets.aerial["long-kick"] : undefined;
  const kickTiming = kick
    ? validateAerialCalibration("long-kick", kick)
    : {
        contact: PASS_WINDUP_SECONDS,
        duration: PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS,
        recovery: PASS_RECOVERY_SECONDS,
      };
  const byId = new Map(players.map((p) => [p.id, p]));
  const passer = byId.get(options.passerId),
    headerPlayer = byId.get(options.headerId),
    receiver = byId.get(options.receiverId);
  if (
    new Set(players.map((p) => p.id)).size !== players.length ||
    new Set([options.passerId, options.headerId, options.receiverId]).size !== 3 ||
    !passer ||
    !headerPlayer ||
    !receiver ||
    !players.every(inside) ||
    !inside(options.headerAt) ||
    gap(passer, options.headerAt) < 8 ||
    gap(receiver, options.headerAt) < 5
  )
    throw new Error("Nieprawidłowe ustawienie do sekwencji główki.");
  const incomingHeading = face(passer, options.headerAt);
  const headerHeading = face(options.headerAt, receiver);
  const receiverHeading = face(receiver, options.headerAt);
  const kickContact = kick?.contact ?? {
    lateral: PASS_BALL_LATERAL,
    forward: PASS_BALL_FORWARD,
    height: BALL_REST_HEIGHT,
  };
  const kickPoint = contactAt(passer, incomingHeading, kickContact);
  const headerPoint = contactAt(options.headerAt, headerHeading, header.contact);
  const receivePoint = contactAt(receiver, receiverHeading, foot);
  const approachSeconds = (gap(headerPlayer, options.headerAt) * 0.68) / 5.2 + 0.18;
  const incoming = flightProfile(options.delivery, gap(kickPoint, headerPoint));
  const flightSeconds = Math.max(incoming.flight, approachSeconds + headerTiming.contact + 0.16);
  const contactSeconds = kickTiming.contact + flightSeconds;
  const headerStart = contactSeconds - headerTiming.contact;
  const outgoing = flightProfile("chip", gap(headerPoint, receivePoint));
  const receiveSeconds = contactSeconds + outgoing.flight;
  const duration = Math.max(
    kickTiming.duration,
    headerStart + headerTiming.duration,
    receiveSeconds + 0.22,
  );
  return {
    players: players.map((p) => ({ ...p })),
    options: { ...options, headerAt: { ...options.headerAt } },
    header: structuredClone(header),
    kick: kick ? structuredClone(kick) : undefined,
    incomingHeading,
    headerHeading,
    receiverHeading,
    kickPoint,
    headerPoint,
    receivePoint,
    kickHeight: kickContact.height,
    approachSeconds,
    headerStart,
    flightSeconds,
    incomingApex: incoming.apex,
    outgoingSeconds: outgoing.flight,
    outgoingApex: 2,
    kickDuration: kickTiming.duration,
    duration,
    events: {
      release: kickTiming.contact,
      takeoff: headerStart + header.takeoffFrame! / header.fps,
      contact: contactSeconds,
      landing: headerStart + header.landingFrame! / header.fps,
      receive: receiveSeconds,
    },
  };
}
export type AerialSequence = ReturnType<typeof createAerialSequence>;

export function sampleAerialSequence(sequence: AerialSequence, seconds: number): PlaybackFrame {
  const s = sequence,
    o = s.options;
  if (!Number.isFinite(seconds)) throw new Error("Czas odtwarzania musi być skończony.");
  const t = Math.max(0, Math.min(s.duration, seconds));
  const positions = new Map(s.players.map((p) => [p.id, { x: p.x, y: p.y }]));
  const motions = new Map<string, PlayerMotion>(
    s.players.map((p) => [
      p.id,
      {
        heading: p.team === "home" ? Math.PI : 0,
        moving: false,
        state: "idle",
        distance: 0,
        elapsed: 0,
        duration: 0,
        clock: t,
      },
    ]),
  );
  const passer = positions.get(o.passerId)!,
    initialHeader = positions.get(o.headerId)!;
  const approach = clamp((t - s.events.release) / s.approachSeconds);
  const headerPosition = mix(initialHeader, o.headerAt, smooth(approach));
  positions.set(o.headerId, headerPosition);
  const approachHeading =
    gap(initialHeader, o.headerAt) > 0.01 ? face(initialHeader, o.headerAt) : s.headerHeading;
  const turn = smooth((t - s.events.release - s.approachSeconds) / 0.16);
  const headerLocal = t - s.headerStart;
  const inHeader = headerLocal >= 0 && headerLocal < s.header.durationSeconds;
  const motion = (id: string) => motions.get(id)!;
  const gestureWeight = (time: number, duration: number) =>
    Math.min(smooth(time / 0.1), smooth((duration - time) / 0.1));
  const initialPassHeading = motion(o.passerId).heading;
  motions.set(o.passerId, {
    ...motion(o.passerId),
    heading:
      initialPassHeading + shortestAngle(initialPassHeading, s.incomingHeading) * smooth(t / 0.2),
    state: t < s.kickDuration ? "pass" : "idle",
    clip: s.kick && t < s.kickDuration ? "long-kick" : undefined,
    phase: clamp(t / s.kickDuration),
    elapsed: t,
    duration: s.kickDuration,
    weight: gestureWeight(t, s.kickDuration),
    delivery: o.delivery,
  });
  motions.set(o.headerId, {
    ...motion(o.headerId),
    heading: approachHeading + shortestAngle(approachHeading, s.headerHeading) * turn,
    distance: gap(initialHeader, headerPosition),
    moving: approach > 0 && approach < 1,
    state: inHeader ? "header" : approach > 0 && approach < 1 ? "move" : "idle",
    clip: inHeader ? "header" : undefined,
    phase: clamp(headerLocal / s.header.durationSeconds),
    elapsed: inHeader ? headerLocal : Math.max(0, t - s.events.release),
    duration: inHeader ? s.header.durationSeconds : s.approachSeconds,
    weight: inHeader
      ? gestureWeight(headerLocal, s.header.durationSeconds)
      : Math.sin(Math.PI * approach),
  });
  motions.set(o.receiverId, {
    ...motion(o.receiverId),
    heading: s.receiverHeading,
    state: t >= s.events.receive && t < s.events.receive + 0.22 ? "receive" : "idle",
    phase: clamp((t - s.events.receive) / 0.22),
    weight: 1,
  });
  const initialBall = contactAt(passer, initialPassHeading, foot);
  let ballVisual = mix(initialBall, s.kickPoint, smooth(t / 0.2));
  let ballHeight =
    BALL_REST_HEIGHT + (s.kickHeight - BALL_REST_HEIGHT) * smooth(t / s.events.release);
  let ballCarrierId = o.passerId;
  if (t >= s.events.release && t < s.events.contact) {
    const flight = clamp((t - s.events.release) / s.flightSeconds);
    ballVisual = mix(s.kickPoint, s.headerPoint, flight);
    ballHeight =
      s.kickHeight +
      (s.header.contact.height - s.kickHeight) * flight +
      4 * s.incomingApex * flight * (1 - flight);
  } else if (t >= s.events.contact && t < s.events.receive) {
    const flight = clamp((t - s.events.contact) / s.outgoingSeconds);
    ballVisual = mix(s.headerPoint, s.receivePoint, flight);
    ballHeight =
      s.header.contact.height +
      (BALL_REST_HEIGHT - s.header.contact.height) * flight +
      4 * s.outgoingApex * flight * (1 - flight);
    ballCarrierId = o.headerId;
  } else if (t >= s.events.receive) {
    ballVisual = { ...s.receivePoint };
    ballHeight = BALL_REST_HEIGHT;
    ballCarrierId = o.receiverId;
  }
  return {
    positions,
    motions,
    ball: { ...ballVisual },
    ballVisual,
    ballHeight,
    ballCarrierId,
    ballInFlight: t >= s.events.release && t < s.events.receive,
  };
}
