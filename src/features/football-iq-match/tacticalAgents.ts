import type { Point } from "./types";
import type { DribbleStyle, JourneyBeat, JourneyQuality, JourneySession } from "./journeyTypes";
import {
  actorId,
  appendBeat,
  bound,
  copyWorld,
  direction,
  distance,
  goalie,
  holdBeat,
  moved,
  passAssessment,
  passBeat,
  pressure,
  rivals,
  segment,
  teamOf,
} from "./tacticalWorld";

export type AgentOption = {
  intent: "pass" | "carry" | "hold" | "shoot";
  targetId?: string;
  point: Point;
  score: number;
  reason: string;
};
export function repositionWorld(
  s: JourneySession,
  seconds = 0.7,
  follow?: { id: string; to: Point; from?: Point },
  engage = false,
) {
  const owner = s.world.carrierId,
    ball = s.world.positions[owner],
    attacking = teamOf(s, owner),
    dir = direction(attacking),
    controlled = actorId(s);
  const defenders = rivals(s, attacking)
    .filter((p) => !p.goalkeeper)
    .sort(
      (a, b) => distance(s.world.positions[a.id], ball) - distance(s.world.positions[b.id], ball),
    );
  const attackers = s.players.filter((p) => p.team === attacking && p.id !== owner);
  for (const player of s.players) {
    if (player.id === owner || player.id === controlled || player.goalkeeper) continue;
    const p = s.world.positions[player.id];
    let target = p;
    if (
      follow &&
      player.team !== teamOf(s, follow.id) &&
      distance(p, follow.from ?? s.world.positions[follow.id]) < 13
    ) {
      target = bound(follow.to.x, follow.to.y + direction(player.team) * 3);
    } else if (player.team !== attacking) {
      const index = defenders.findIndex((r) => r.id === player.id);
      const candidates = attackers
        .filter((a) => !a.goalkeeper)
        .sort((a, b) => dir * (s.world.positions[b.id].y - s.world.positions[a.id].y));
      const mark = candidates[Math.max(0, index - 1) % Math.max(1, candidates.length)];
      target =
        index === 0
          ? bound(ball.x, ball.y + dir * (engage ? 1.8 : 3.5))
          : mark
            ? bound(s.world.positions[mark.id].x, s.world.positions[mark.id].y + dir * 3)
            : p;
    } else {
      const side = p.x < 50 ? -1 : 1;
      const candidates = [
        p,
        bound(ball.x + side * 17, ball.y - dir * 11),
        bound(side < 0 ? 15 : 85, ball.y + dir * 6),
        bound(ball.x + side * 12, ball.y + dir * 17),
      ];
      const score = (point: Point) => {
        const spacing = Math.min(
          ...s.players
            .filter((q) => q.team === player.team && q.id !== player.id)
            .map((q) => distance(s.world.positions[q.id], point)),
        );
        const lane = Math.min(
          ...rivals(s, attacking).map((r) => segment(s.world.positions[r.id], ball, point).gap),
        );
        const cover =
          player.id === "anchor" || player.role.includes("obroń")
            ? Math.max(0, -dir * (point.y - ball.y)) * 0.3
            : Math.max(0, dir * (point.y - ball.y)) * 0.15;
        return (
          Math.min(spacing, 14) +
          Math.min(pressure(s, point, attacking), 12) +
          Math.min(lane, 7) +
          cover -
          distance(p, point) * 0.08
        );
      };
      target = candidates.sort((a, b) => score(b) - score(a))[0];
    }
    const gap = distance(p, target),
      t = Math.min(1, (seconds * 3.2) / 0.68 / (gap || 1));
    moved(s.world, player.id, bound(p.x + (target.x - p.x) * t, p.y + (target.y - p.y) * t));
  }
}
/** A stationary carrier can lose the ball to an opponent who actually reached it. */
export function contestHeldBall(s: JourneySession) {
  const owner = s.world.carrierId,
    team = teamOf(s, owner),
    ball = s.world.positions[owner];
  const enemy = rivals(s, team)
    .filter((p) => !p.goalkeeper)
    .sort(
      (a, b) => distance(s.world.positions[a.id], ball) - distance(s.world.positions[b.id], ball),
    )[0];
  if (enemy && distance(s.world.positions[enemy.id], ball) < 2.1) {
    holdBeat(
      s,
      enemy.id,
      `Nr ${enemy.number} dosięga przetrzymanej piłki.`,
      () => {
        s.world.carrierId = enemy.id;
      },
      0.25,
      {
        intent: "press",
        reason: "Dalsze czekanie pozwoliło rywalowi wejść w zasięg odbioru.",
        team: enemy.team,
      },
    );
  }
}
export function responseBeat(
  s: JourneySession,
  text = "Partnerzy szukają linii, rywale przesuwają krycie.",
  follow?: { id: string; to: Point; from?: Point },
) {
  holdBeat(s, s.world.carrierId, text, () => repositionWorld(s, 0.65, follow), 0.65);
}

function carryLeg(
  s: JourneySession,
  id: string,
  to: Point,
  speed: number,
  text: string,
  autonomous?: JourneyBeat["autonomous"],
) {
  const team = teamOf(s, id),
    before = copyWorld(s.world),
    from = before.positions[id],
    duration = Math.max(0.35, (distance(from, to) * 0.68) / speed);
  moved(s.world, id, to);
  repositionWorld(s, duration);
  let contact: { id: string; t: number } | null = null;
  for (const enemy of rivals(s, team)) {
    const a = before.positions[enemy.id],
      b = s.world.positions[enemy.id];
    const row = segment(
      { x: 0, y: 0 },
      { x: from.x - a.x, y: from.y - a.y },
      { x: to.x - b.x, y: to.y - b.y },
    );
    if (row.gap < 2.1 && (!contact || row.t < contact.t)) contact = { id: enemy.id, t: row.t };
  }
  if (contact) {
    const t = Math.max(0.05, contact.t);
    s.world = copyWorld(before);
    const planned = { ...s.world.positions };
    // Reproduce exactly the same simultaneous defender movement before clipping contact.
    moved(s.world, id, to);
    repositionWorld(s, duration);
    const end = copyWorld(s.world);
    s.world = copyWorld(before);
    for (const key of Object.keys(planned))
      moved(s.world, key, {
        x: before.positions[key].x + (end.positions[key].x - before.positions[key].x) * t,
        y: before.positions[key].y + (end.positions[key].y - before.positions[key].y) * t,
      });
    appendBeat(s, {
      kind: "move",
      actorId: id,
      from: { ...from },
      to: { ...s.world.positions[id] },
      before,
      after: copyWorld(s.world),
      duration: Math.max(0.18, duration * t),
      text,
      autonomous,
    });
    holdBeat(
      s,
      contact.id,
      "Rywal dosięga piłki w pokazanym miejscu.",
      () => {
        s.world.carrierId = contact!.id;
      },
      0.25,
      autonomous,
    );
    return false;
  }
  appendBeat(s, {
    kind: "move",
    actorId: id,
    from: { ...from },
    to: { ...to },
    before,
    after: copyWorld(s.world),
    duration,
    text,
    autonomous,
  });
  return true;
}
export function performCarry(
  s: JourneySession,
  id: string,
  destination: Point,
  style: DribbleStyle = "direct",
  autonomous?: JourneyBeat["autonomous"],
) {
  const from = s.world.positions[id];
  const endpoint = bound(destination.x, destination.y);
  const points: Point[] = [];
  if (style === "cut-left" || style === "cut-right") {
    const side = style === "cut-left" ? -1 : 1;
    points.push(bound(from.x - side * 3, from.y));
  }
  if (style === "stop-go")
    holdBeat(
      s,
      id,
      "Krótka pauza przed zmianą tempa.",
      () => repositionWorld(s, 0.5),
      0.5,
      autonomous,
    );
  if (style === "turn-back") points.push(bound(from.x, from.y - direction(teamOf(s, id)) * 5));
  if (style === "shield") {
    const enemy = rivals(s, teamOf(s, id)).sort(
      (a, b) => distance(s.world.positions[a.id], from) - distance(s.world.positions[b.id], from),
    )[0];
    const ep = s.world.positions[enemy.id],
      gap = distance(from, ep) || 1;
    points.push(bound(from.x + ((from.x - ep.x) * 3) / gap, from.y + ((from.y - ep.y) * 3) / gap));
  } else points.push(endpoint);
  for (const target of points) {
    const start = { ...s.world.positions[id] },
      length = distance(start, target),
      count = Math.max(1, Math.ceil(length / 7));
    for (let i = 1; i <= count; i++) {
      const to = bound(
        start.x + ((target.x - start.x) * i) / count,
        start.y + ((target.y - start.y) * i) / count,
      );
      if (
        !carryLeg(
          s,
          id,
          to,
          style === "stop-go" ? 6 : style === "shield" ? 2.5 : 4.8,
          style === "direct"
            ? "Prowadzenie i reakcja obrońcy."
            : "Zmiana kierunku lub tempa z piłką.",
          autonomous,
        )
      )
        return false;
    }
  }
  return true;
}
export function carryAssessment(
  s: JourneySession,
  id: string,
  to: Point,
  style: DribbleStyle = "direct",
) {
  const predicted: JourneySession = { ...s, world: copyWorld(s.world), beats: [], decisions: [] };
  const safe = performCarry(predicted, id, to, style);
  const team = teamOf(s, id),
    end = predicted.world.positions[id],
    room = pressure(predicted, end, team);
  const quality: JourneyQuality = !safe ? "error" : room < 5 ? "possible" : "good";
  const why = !safe
    ? "Zmiana toru lub tempa nadal wprowadza piłkę w zasięg obrońcy; moment kontaktu pojawi się w odtworzeniu."
    : room < 5
      ? "Utrzymujesz piłkę, ale po ruchu pozostajesz pod presją; przygotuj następne zagranie."
      : style === "shield"
        ? "Osłona zwiększa odstęp od rywala. Zyskujesz czas, nie automatycznie przewagę do przodu."
        : "Wybrany tor i tempo pozostawiają piłkę poza pokazanym doskokiem. Sprawdź kolejną opcję, zanim rywal wróci.";
  return { quality, why, room, world: predicted.world };
}

/** Rule-based decisions from current space, passing lanes and pressure. No special return-to-TY rule. */
export function agentOptions(s: JourneySession, id = s.world.carrierId): AgentOption[] {
  const team = teamOf(s, id),
    from = s.world.positions[id],
    dir = direction(team),
    ownPressure = pressure(s, from, team);
  const options: AgentOption[] = s.players
    .filter((p) => p.team === team && p.id !== id)
    .map((p) => {
      const a = passAssessment(s, id, p.id),
        to = s.world.positions[p.id],
        progress = dir * (to.y - from.y);
      return {
        intent: "pass",
        targetId: p.id,
        point: to,
        score:
          48 +
          Math.min(a.receiverPressure, 12) * 1.2 +
          Math.min(a.lane.gap, 8) +
          progress * 0.42 -
          distance(from, to) * 0.1 +
          (ownPressure < 7 ? 8 : 0) -
          (a.quality === "error" ? 250 : a.quality === "possible" ? 17 : 0),
        reason: a.why,
      };
    });
  if (!s.players.find((p) => p.id === id)!.goalkeeper) {
    for (const dx of [-8, 0, 8]) {
      const to = bound(from.x + dx, from.y + dir * 10),
        a = carryAssessment(s, id, to);
      options.push({
        intent: "carry",
        point: to,
        score:
          48 +
          dir * (to.y - from.y) * 0.9 +
          Math.min(a.room, 10) -
          (a.quality === "error" ? 240 : a.quality === "possible" ? 12 : 0),
        reason: a.why,
      });
    }
    const keeper = goalie(s, team === "home" ? "away" : "home"),
      goal = s.world.positions[keeper.id],
      shot = passAssessment(s, id, keeper.id, "ground", true),
      range = distance(from, goal);
    if (range < 34)
      options.push({
        intent: "shoot",
        targetId: keeper.id,
        point: goal,
        score: 79 + (25 - range) * 0.7 - (shot.interceptor ? 50 : 0) - (ownPressure < 3 ? 12 : 0),
        reason: shot.interceptor
          ? "Rywal osłania tor strzału."
          : "Zawodnik ma drogę do próby strzału; to nie gwarantuje gola.",
      });
  }
  options.push({
    intent: "hold",
    point: from,
    score: 27 + Math.min(ownPressure, 10),
    reason: "Zachowuje piłkę, czekając na zmianę dostępnych linii.",
  });
  return options.sort(
    (a, b) =>
      b.score - a.score ||
      `${a.intent}:${a.targetId ?? a.point.x}`.localeCompare(
        `${b.intent}:${b.targetId ?? b.point.x}`,
      ),
  );
}
export function autonomousTurn(s: JourneySession) {
  const id = s.world.carrierId;
  if (id === actorId(s)) return;
  const player = s.players.find((p) => p.id === id)!,
    option = agentOptions(s, id)[0];
  const event: NonNullable<JourneyBeat["autonomous"]> = {
    intent: option.intent,
    reason: option.reason,
    team: player.team,
  };
  if (option.intent === "pass") {
    const number = s.players.find((p) => p.id === option.targetId)!.number;
    const result = passBeat(
      s,
      id,
      option.targetId!,
      "ground",
      `Nr ${player.number} wybiera podanie do nr ${number}. ${option.reason}`,
      false,
      event,
    );
    if (result.isOffside) s.outcome = "blocked";
  } else if (option.intent === "carry") performCarry(s, id, option.point, "direct", event);
  else if (option.intent === "shoot") {
    passBeat(
      s,
      id,
      option.targetId!,
      "ground",
      `Nr ${player.number} decyduje się na strzał.`,
      true,
      event,
    );
    s.finishTeam = player.team;
    s.outcome = "chance";
  } else
    holdBeat(
      s,
      id,
      `Nr ${player.number} przytrzymuje piłkę. ${option.reason}`,
      () => repositionWorld(s, 0.8, undefined, true),
      0.8,
      event,
    );
  if (option.intent === "hold") contestHeldBall(s);
}
