import type { PlannedAction, Point, Scenario } from "./types";
import type { PlaybackFrame, PlayerMotion } from "./animation";

const DT = 1 / 30;
const METRES = 0.68;
const RUN = 5.2 / METRES;
const WALK = 2.4 / METRES;
export const insidePitch = (p: Point) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 2.2 &&
  p.x <= 97.8 &&
  p.y >= 3 &&
  p.y <= 137;
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const clampPoint = (p: Point): Point => ({
  x: Math.max(3, Math.min(97, p.x)),
  y: Math.max(3, Math.min(137, p.y)),
});
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export type SimulationEvent = {
  kind: "pass" | "move" | "interception" | "tackle" | "shot" | "blocked" | "saved" | "invalid";
  text: string;
  time: number;
  actionIndex: number;
  point: Point;
  playerId: string;
  receiverId?: string;
  hadBall?: boolean;
  from?: Point;
  actionType?: PlannedAction["type"];
};
export type Simulation = {
  frames: PlaybackFrame[];
  events: SimulationEvent[];
  duration: number;
  initial: PlaybackFrame;
  final: PlaybackFrame;
  valid: boolean;
  lost: boolean;
};

/** Deterministic tactical model. The replay and verdict consume these same events. */
export function simulate(scenario: Scenario, actions: PlannedAction[]): Simulation {
  const positions = new Map(scenario.players.map((p) => [p.id, { x: p.x, y: p.y }]));
  const players = new Map(scenario.players.map((p) => [p.id, p]));
  const motions = new Map<string, PlayerMotion>(
    scenario.players.map((p) => [
      p.id,
      {
        heading: p.team === "home" ? Math.PI : 0,
        distance: 0,
        moving: false,
        elapsed: 0,
        duration: 0,
        state: "idle",
      },
    ]),
  );
  let carrier = scenario.ballCarrierId;
  let ball = { ...(positions.get(carrier) ?? { x: 50, y: 70 }) };
  let height = 0.7,
    flight = false,
    time = 0,
    valid = true,
    lost = false;
  const frames: PlaybackFrame[] = [],
    events: SimulationEvent[] = [];
  const record = () => {
    const ballVisual = flight
      ? { ...ball }
      : { x: ball.x, y: ball.y + (players.get(carrier)?.team === "home" ? -1.25 : 1.25) };
    frames.push({
      positions: new Map([...positions].map(([id, p]) => [id, { ...p }])),
      motions: new Map([...motions].map(([id, m]) => [id, { ...m, clock: time }])),
      ball: { ...ball },
      ballVisual,
      ballHeight: height,
      ballCarrierId: carrier,
      ballInFlight: flight,
    });
  };
  const move = (id: string, target: Point, speed: number, duration: number, elapsed: number) => {
    const from = positions.get(id)!;
    const d = distance(from, target);
    const moved = Math.min(d, speed * DT);
    const next = d > 0.00001 ? lerp(from, target, moved / d) : { ...from };
    positions.set(id, next);
    const prev = motions.get(id)!;
    motions.set(id, {
      ...prev,
      heading: d > 0.01 ? Math.atan2(target.x - from.x, target.y - from.y) : prev.heading,
      distance: prev.distance + moved,
      moving: moved > 0.005,
      elapsed,
      duration,
      gait: speed <= WALK ? "walk" : "run",
      state: moved > 0.005 ? "move" : "idle",
      weight: 1,
    });
  };
  const event = (
    kind: SimulationEvent["kind"],
    text: string,
    index: number,
    id: string,
    point = positions.get(id)!,
    extra: Partial<SimulationEvent> = {},
  ) => {
    events.push({
      kind,
      text,
      time,
      actionIndex: index,
      point: { ...point },
      playerId: id,
      ...extra,
    });
  };
  const react = (
    elapsed: number,
    duration: number,
    actorId: string,
    index: number,
    _startTime: number,
    hasActivePress: boolean,
  ) => {
    const cfg = scenario.simulation!;
    if (time < cfg.reaction) return;
    const carrierPlayer = players.get(carrier)!;
    if (!carrierPlayer) return;
    if (carrierPlayer.team === "away" && !flight) {
      const p = positions.get(carrier)!;
      // The opponent advances; a manual press/cover has to contend with that motion.
      move(carrier, clampPoint({ x: p.x, y: 137 }), 3.2 / METRES, duration, elapsed);
      ball = { ...positions.get(carrier)! };
    }
    const defenders = scenario.players.filter(
      (p) =>
        p.team !== carrierPlayer.team && !p.goalkeeper && (p.team === "away" || p.id === actorId),
    );
    const nearest = [...defenders].sort(
      (a, b) => distance(positions.get(a.id)!, ball) - distance(positions.get(b.id)!, ball),
    )[0];
    for (const p of defenders) {
      if (p.id === actorId) continue;
      const pressure = p.id === nearest?.id;
      const target = pressure
        ? ball
        : clampPoint({ x: p.x + (ball.x - 50) * 0.12, y: p.y + (ball.y - 70) * 0.06 });
      move(
        p.id,
        target,
        (pressure ? cfg.defenderSpeed : cfg.defenderSpeed * 0.55) / METRES,
        duration,
        elapsed,
      );
    }
    if (flight || lost || !nearest || (nearest.team === "home" && !hasActivePress)) return;
    const defender = positions.get(nearest.id)!;
    if (distance(defender, ball) < 1.9) {
      const homeWon = nearest.team === "home";
      carrier = nearest.id;
      ball = { ...defender };
      lost = !homeWon;
      event(
        "tackle",
        homeWon ? "Pressing zakończył się odbiorem piłki." : "Rywal doskoczył i odebrał piłkę.",
        index,
        nearest.id,
      );
    }
  };
  record();
  const initial = frames[0];
  for (let index = 0; index < actions.length && !lost; index++) {
    const action = actions[index],
      actor = players.get(action.playerId);
    const from = positions.get(action.playerId);
    const transfer = action.type === "pass" || action.type === "shot";
    const needsBall = transfer || action.type === "carry" || action.type === "hold";
    const target = action.type === "pass" ? players.get(action.targetId) : undefined;
    const markedOpponent =
      action.type === "mark" || action.type === "press"
        ? players.get(action.opponentId ?? "")
        : undefined;
    if (
      !actor ||
      actor.team !== "home" ||
      !from ||
      !insidePitch(action.to) ||
      (needsBall && carrier !== actor.id) ||
      (action.type === "run" && carrier === actor.id) ||
      ((action.type === "mark" || action.type === "press") &&
        (!markedOpponent || markedOpponent.team !== "away")) ||
      (action.type === "pass" && (!target || target.team !== "home" || target.id === actor.id))
    ) {
      valid = false;
      event(
        "invalid",
        "To działanie nie może zostać wykonane z obecnego ustawienia lub posiadania piłki.",
        index,
        action.playerId,
        action.to,
      );
      break;
    }
    if (action.type === "shot") {
      if (distance(from, { x: 50, y: 3 }) > 50) {
        valid = false;
        event(
          "invalid",
          "Najpierw popraw pozycję lub poszukaj dostępnego partnera.",
          index,
          actor.id,
          from,
        );
        break;
      }
      // A finishing choice closes the lesson; it is not a simulated goal or shot trajectory.
      for (let step = 0; step < 18; step++) {
        time += DT;
        record();
      }
      event(
        "shot",
        "Wybrałeś strzał jako zakończenie planu. Ocena dotyczy celu taktycznego.",
        index,
        actor.id,
        from,
        { hadBall: true, from: { ...from }, actionType: "shot" },
      );
      break;
    }
    const started = time,
      hadBall = carrier === actor.id;
    const delivery = action.type === "pass" ? (action.delivery ?? "ground") : "ground";
    const end =
      action.type === "pass" && delivery === "ground"
        ? { ...positions.get(action.targetId)! }
        : { ...action.to };
    const movingPass = action.type === "pass" && delivery !== "ground";
    const d = distance(from, end);
    const windup = transfer ? 14 / 30 : 0;
    const speed =
      action.type === "pass"
        ? (delivery === "cross" ? 13 : 17) / METRES
        : action.type === "shift" || action.type === "cover" || action.type === "mark"
          ? WALK
          : RUN;
    const duration = transfer
      ? windup + Math.max(0.22, d / speed) + 0.22
      : action.type === "hold"
        ? 1.1
        : Math.max(action.type === "press" ? 1.8 : 0.35, d / speed);
    const steps = Math.ceil(duration / DT);
    let intercepted = false;
    for (let step = 1; step <= steps; step++) {
      time += DT;
      const elapsed = Math.min(duration, step * DT);
      motions.forEach((m, id) =>
        motions.set(id, { ...m, moving: false, state: "idle", weight: 0 }),
      );
      if (transfer) {
        const heading = Math.atan2(end.x - from.x, end.y - from.y);
        motions.set(actor.id, {
          ...motions.get(actor.id)!,
          heading,
          moving: false,
          state: "pass",
          elapsed,
          duration,
          phase: Math.min(1, elapsed / 1.6),
          weight: elapsed < 1.6 ? 1 : 0,
        });
        const progress = Math.max(0, Math.min(1, (elapsed - windup) / Math.max(0.22, d / speed)));
        flight = elapsed >= windup && progress < 1;
        ball = elapsed < windup ? { ...from } : lerp(from, end, progress);
        height = 0.7 + Math.sin(Math.PI * progress) * (delivery === "cross" ? 7 : 0.2);
        if (movingPass && action.type === "pass") {
          move(action.targetId, end, RUN, duration, elapsed);
        }
        react(elapsed, duration, actor.id, index, started, false);
        if (elapsed >= windup && !intercepted) {
          const eligible = scenario.players.filter((p) => p.team === "away" && !p.goalkeeper);
          const blocker = eligible.find(
            (p) =>
              distance(positions.get(p.id)!, ball) <= (p.goalkeeper ? 3.2 : 1.35) &&
              height < (p.goalkeeper ? 3 : 1.6),
          );
          if (blocker) {
            carrier = blocker.id;
            ball = { ...positions.get(blocker.id)! };
            height = 0.7;
            flight = false;
            lost = true;
            intercepted = true;
            event("interception", "Rywal przeciął tor podania.", index, blocker.id, ball, {
              from: { ...from },
            });
          } else if (progress >= 1) {
            flight = false;
            height = 0.7;
            if (action.type === "pass") {
              if (distance(positions.get(action.targetId)!, end) > 3.5) {
                lost = true;
                intercepted = true;
                event(
                  "interception",
                  "Piłka została zagrana dalej, niż partner zdążył dobiec.",
                  index,
                  actor.id,
                  end,
                );
              } else {
                carrier = action.targetId;
                ball = { ...positions.get(carrier)! };
              }
            }
          }
        }
      } else {
        const tracked = action.opponentId && positions.get(action.opponentId);
        const aim = tracked
          ? clampPoint({
              x: tracked.x + (action.type === "mark" ? 2.6 : 0),
              y: tracked.y + (action.type === "mark" ? 3 : 0),
            })
          : end;
        if (action.type !== "hold") move(actor.id, aim, speed, duration, elapsed);
        if (carrier === actor.id) ball = { ...positions.get(actor.id)! };
        react(elapsed, duration, actor.id, index, started, action.type === "press");
      }
      record();
      if (lost) break;
      if (action.type === "press" && players.get(carrier)?.team === "home") break;
    }
    if (lost) break;
    const point = positions.get(actor.id)!;
    event(
      action.type === "pass" ? "pass" : "move",
      action.type === "pass"
        ? `Podanie do ${target!.number}${delivery === "through" ? " w przestrzeń" : delivery === "cross" ? " po dośrodkowaniu" : ""} dotarło.`
        : action.type === "hold"
          ? "Utrzymałeś piłkę, dając rywalom czas na doskok."
          : action.type === "press"
            ? "Doskok ograniczył czas i przestrzeń rywala."
            : action.type === "cover"
              ? "Ustawienie daje asekurację za partnerem."
              : action.type === "mark"
                ? "Zawodnik podąża za wskazanym rywalem."
                : hadBall
                  ? "Zawodnik poprowadził piłkę."
                  : "Ruch bez piłki zmienił ustawienie.",
      index,
      actor.id,
      action.type === "pass" ? end : point,
      {
        hadBall,
        from: { ...from },
        actionType: action.type,
        receiverId: action.type === "pass" ? action.targetId : undefined,
      },
    );
  }
  motions.forEach((m, id) => motions.set(id, { ...m, moving: false, state: "idle", weight: 0 }));
  record();
  return { frames, events, duration: time, initial, final: frames.at(-1)!, valid, lost };
}

export function sampleSimulation(sim: Simulation, progress: number): PlaybackFrame {
  const p = Math.max(0, Math.min(1, progress));
  if (!sim.duration || p === 1) return sim.final;
  const index = Math.min(sim.frames.length - 2, Math.floor((p * sim.duration) / DT));
  const a = sim.frames[index],
    b = sim.frames[index + 1];
  const t = Math.max(0, Math.min(1, (p * sim.duration - index * DT) / DT));
  return {
    ...a,
    positions: new Map(
      [...a.positions].map(([id, point]) => [id, lerp(point, b.positions.get(id)!, t)]),
    ),
    ball: lerp(a.ball, b.ball, t),
    ballVisual: lerp(a.ballVisual, b.ballVisual, t),
    ballHeight: a.ballHeight + (b.ballHeight - a.ballHeight) * t,
  };
}
