import { flightHeight, flightProfile } from "./ballFlight";
import { BALL_REST_HEIGHT, PASS_WINDUP_SECONDS } from "./animation";
import type { BallDelivery } from "./ballFlight";
import type { MatchPlayer, Point } from "./types";
import type { JourneyBeat, JourneyQuality, JourneySession, JourneyWorld } from "./journeyTypes";

export const LEGACY_TACTICAL_BANK_VERSION = "2026-11-01.6";
export const TACTICAL_BANK_VERSION = "2026-11-06.7";
export const TACTICAL_TURNS = 8;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const bound = (x: number, y: number): Point => ({
  x: Math.max(4, Math.min(96, x)),
  y: Math.max(6, Math.min(134, y)),
});
export const copyWorld = (w: JourneyWorld): JourneyWorld => JSON.parse(JSON.stringify(w));
export const actorId = (s: JourneySession) => s.controlledId ?? "you";
export const teamOf = (s: JourneySession, id: string) => s.players.find((p) => p.id === id)!.team;
export const direction = (team: "home" | "away") => (team === "home" ? -1 : 1);
export const rivals = (s: JourneySession, team: "home" | "away") =>
  s.players.filter((p) => p.team !== team);
export function pressure(s: JourneySession, p: Point, team: "home" | "away") {
  return Math.min(...rivals(s, team).map((r) => distance(s.world.positions[r.id], p)));
}
export function segment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { point, t, gap: distance(p, point) };
}
export function offside(s: JourneySession, fromId: string, toId: string) {
  const team = teamOf(s, fromId),
    from = s.world.positions[fromId],
    to = s.world.positions[toId];
  if (team !== teamOf(s, toId)) return false;
  const line = rivals(s, team)
    .map((p) => s.world.positions[p.id].y)
    .sort((a, b) => (team === "home" ? a - b : b - a))[1];
  return team === "home"
    ? to.y < 70 && to.y < from.y - 0.4 && to.y < line - 0.4
    : to.y > 70 && to.y > from.y + 0.4 && to.y > line + 0.4;
}
export function passAssessment(
  s: JourneySession,
  fromId: string,
  toId: string,
  delivery: BallDelivery = "ground",
  shot = false,
) {
  const from = s.world.positions[fromId],
    to = s.world.positions[toId],
    team = teamOf(s, fromId),
    length = distance(from, to);
  const lines = rivals(s, team)
    .filter((p) => !shot || !p.goalkeeper)
    .map((p) => {
      const row = segment(s.world.positions[p.id], from, to);
      const height = flightHeight(
        delivery,
        length,
        row.t,
        delivery === "ground" ? BALL_REST_HEIGHT : 2,
      );
      return { ...row, id: p.id, gap: height > 3.2 ? Infinity : row.gap };
    })
    .filter((p) => p.t > 0.08 && p.t < 0.96)
    .sort((a, b) => a.gap - b.gap);
  const lane = lines[0] ?? { id: "", point: to, t: 1, gap: Infinity };
  const receiverPressure = shot ? Infinity : pressure(s, to, team),
    isOffside = !shot && offside(s, fromId, toId);
  const crowded = !shot && receiverPressure < 2.4;
  const close = rivals(s, team).sort(
    (a, b) => distance(s.world.positions[a.id], to) - distance(s.world.positions[b.id], to),
  )[0];
  const interceptor = lane.gap < 2.4 ? lane.id : crowded ? close.id : null;
  const quality: JourneyQuality =
    isOffside || interceptor ? "error" : lane.gap < 5 || receiverPressure < 5 ? "possible" : "good";
  const why = isOffside
    ? "Odbiorca był za linią spalonego w momencie podania."
    : interceptor
      ? "Wybrany tor lub miejsce przyjęcia są w zasięgu rywala."
      : quality === "possible"
        ? "Podanie jest dostępne, ale odbiorca lub tor pozostaje pod naciskiem."
        : "Otwarta linia i miejsce przy odbiorcy pozwalają kontynuować grę.";
  return {
    quality,
    why,
    lane,
    receiverPressure,
    isOffside,
    interceptor,
    end: lane.gap < 2.4 ? lane.point : to,
    endT: lane.gap < 2.4 ? lane.t : 1,
  };
}
export function moved(w: JourneyWorld, id: string, p: Point) {
  const from = w.positions[id],
    to = bound(p.x, p.y);
  w.distances[id] += distance(from, to);
  if (distance(from, to) > 0.001) w.headings[id] = Math.atan2(to.x - from.x, to.y - from.y);
  w.positions[id] = to;
}
export function appendBeat(s: JourneySession, data: Omit<JourneyBeat, "id" | "revision">) {
  s.beats.push({ ...data, id: `${s.definition.id}-v6-${s.beats.length}`, revision: 2 });
}
export function moveBeat(
  s: JourneySession,
  id: string,
  to: Point,
  text: string,
  speed = 4.5,
  autonomous?: JourneyBeat["autonomous"],
  react?: (seconds: number) => void,
) {
  const before = copyWorld(s.world),
    from = { ...s.world.positions[id] };
  moved(s.world, id, to);
  const duration = Math.max(0.45, (distance(from, to) * 0.68) / speed);
  react?.(duration);
  appendBeat(s, {
    kind: "move",
    actorId: id,
    from,
    to: { ...s.world.positions[id] },
    before,
    after: copyWorld(s.world),
    duration,
    text,
    autonomous,
  });
}
export function holdBeat(
  s: JourneySession,
  id: string,
  text: string,
  mutate: () => void = () => {},
  duration = 0.8,
  autonomous?: JourneyBeat["autonomous"],
) {
  const before = copyWorld(s.world),
    p = { ...s.world.positions[id] };
  mutate();
  appendBeat(s, {
    kind: "hold",
    actorId: id,
    from: p,
    to: { ...s.world.positions[id] },
    before,
    after: copyWorld(s.world),
    duration,
    text,
    autonomous,
  });
}
export function passBeat(
  s: JourneySession,
  fromId: string,
  toId: string,
  delivery: BallDelivery,
  text: string,
  shot = false,
  autonomous?: JourneyBeat["autonomous"],
) {
  const assessment = passAssessment(s, fromId, toId, delivery, shot),
    from = { ...s.world.positions[fromId] },
    target = { ...s.world.positions[toId] };
  const end = { ...assessment.end },
    receiverId = assessment.interceptor ?? toId,
    before = copyWorld(s.world),
    profile = flightProfile(delivery, distance(from, target));
  const flight =
    (shot ? Math.max(0.2, (distance(from, target) * 0.68) / 23) : profile.flight) * assessment.endT;
  s.world.headings[fromId] = Math.atan2(end.x - from.x, end.y - from.y);
  if (assessment.interceptor) moved(s.world, receiverId, end);
  s.world.carrierId = receiverId;
  s.world.headings[receiverId] = Math.atan2(from.x - end.x, from.y - end.y);
  appendBeat(s, {
    kind: "pass",
    actorId: fromId,
    receiverId,
    from,
    to: end,
    before,
    after: copyWorld(s.world),
    duration: PASS_WINDUP_SECONDS + flight + profile.control,
    text,
    shot,
    delivery,
    flightSeconds: flight,
    controlSeconds: profile.control,
    flightEnd: assessment.endT,
    landingHeight: flightHeight(
      delivery,
      distance(from, target),
      assessment.endT,
      delivery === "ground" ? BALL_REST_HEIGHT : 2,
    ),
    flightDistance: distance(from, target),
    receiveAt: end,
    autonomous,
  });
  return assessment;
}
export function goalie(s: JourneySession, defending: "home" | "away"): MatchPlayer {
  return (
    s.players.find((p) => p.team === defending && p.goalkeeper) ??
    s.players
      .filter((p) => p.team === defending)
      .sort((a, b) =>
        defending === "home"
          ? s.world.positions[b.id].y - s.world.positions[a.id].y
          : s.world.positions[a.id].y - s.world.positions[b.id].y,
      )[0]
  );
}
