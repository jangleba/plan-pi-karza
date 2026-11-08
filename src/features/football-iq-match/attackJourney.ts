/** Continuous attacking episode (version 9), not a prediction of a real match.
 * Fixed 50 ms steps make live play, seeking and restored attempts agree.
 * Agents use the current ball/mark/space, never the user's next decision.
 */
import { createTacticalJourney } from "./tacticalJourney";
import {
  bound,
  copyWorld,
  distance,
  direction,
  moved,
  offside,
  pressure,
  segment,
  teamOf,
} from "./tacticalWorld";
import { BALL_REST_HEIGHT, PASS_WINDUP_SECONDS } from "./animation";
import { flightHeight, flightProfile, type BallDelivery } from "./ballFlight";
import { lessonGoal, lessonQuestion } from "./liveLesson";
import { situationLayout } from "./situationBank";
import type { Point } from "./types";
import type {
  JourneyBeat,
  JourneyChoice,
  JourneyDefinition,
  JourneySession,
  JourneyStep,
  TacticalIntent,
} from "./journeyTypes";

const DT = 0.05;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const angle = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.y - a.y);

export function createAttackJourney(def: JourneyDefinition): JourneySession {
  const s = createTacticalJourney(def, 7);
  s.rulesVersion = 9;
  s.attack = { elapsed: 0, home: 0, away: 0, shots: 0 };
  if (def.role === "wing" && def.concept === "third-player") {
    const points: Record<string, Point> = {
      you: { x: 18, y: 53 },
      support: { x: 39, y: 64 },
      wide: { x: 10, y: 77 },
      forward: { x: 52, y: 29 },
      third: { x: 63, y: 46 },
      anchor: { x: 52, y: 90 },
      r0: { x: 38, y: 53 },
      r1: { x: 25, y: 49 },
      r2: { x: 50, y: 40 },
      r3: { x: 69, y: 37 },
      r4: { x: 51, y: 61 },
    };
    for (const p of s.players) {
      if (points[p.id]) s.world.positions[p.id] = points[p.id];
    }
    s.world.carrierId = "support";
    // Distinct reactions, not a predetermined successful route.
    if (def.context === 1) s.world.positions.r1 = { x: 30, y: 47 };
    if (def.context === 2) s.world.positions.r0 = { x: 34, y: 57 };
    s.players = s.players.map((p) => ({
      ...p,
      ...s.world.positions[p.id],
      number:
        (
          {
            you: 7,
            support: 8,
            wide: 3,
            forward: 9,
            third: 10,
            anchor: 6,
            "home-keeper": 1,
          } as Record<string, number>
        )[p.id] ?? p.number,
    }));
  }
  if (def.role === "wing" && def.concept === "third-player") {
    for (const p of s.players)
      if (!p.goalkeeper)
        s.world.positions[p.id] = bound(
          s.world.positions[p.id].x,
          s.world.positions[p.id].y + 22,
        );
    s.players = s.players.map((p) => ({ ...p, ...s.world.positions[p.id] }));
  }
  const layout = situationLayout(def);
  if (layout) {
    for (const p of s.players) {
      const at = layout.positions[p.id];
      if (!at) throw new Error(`Brak pozycji zawodnika ${p.id}.`);
      s.world.positions[p.id] = bound(at.x, at.y);
      s.world.headings[p.id] = p.team === "home" ? Math.PI : 0;
    }
    s.world.carrierId = layout.carrier;
    s.players = s.players.map((p) => ({
      ...p,
      ...s.world.positions[p.id],
      number: layout.numbers[p.id] ?? p.number,
    }));
  }
  s.initial = copyWorld(s.world);
  s.scenario = { ...s.scenario, players: s.players };
  const openingBefore = copyWorld(s.world),
    samples: NonNullable<JourneyBeat["live"]> = [];
  const presser = s.players
    .filter((p) => p.team !== teamOf(s, s.world.carrierId) && !p.goalkeeper)
    .sort(
      (a, b) =>
        distance(
          s.world.positions[a.id],
          s.world.positions[s.world.carrierId],
        ) -
        distance(s.world.positions[b.id], s.world.positions[s.world.carrierId]),
    )[0];
  for (let tick = 0; tick <= 16; tick++) {
    if (tick && presser) {
      const at = s.world.positions[presser.id],
        ball = s.world.positions[s.world.carrierId];
      moved(
        s.world,
        presser.id,
        lerp(at, ball, Math.min(0.18 / Math.max(1, distance(at, ball)), 1)),
      );
    }
    samples.push({
      time: tick * DT,
      world: copyWorld(s.world),
      ball: { ...s.world.positions[s.world.carrierId] },
      height: BALL_REST_HEIGHT,
      inFlight: false,
    });
  }
  s.beats = [
    {
      id: def.id + "-opening8",
      revision: 2,
      kind: "hold",
      actorId: s.world.carrierId,
      before: openingBefore,
      after: copyWorld(s.world),
      duration: 0.8,
      from: openingBefore.positions[s.world.carrierId],
      to: s.world.positions[s.world.carrierId],
      text: "Rywal skraca odległość do piłki. Zatrzymaj wzrok na jego ustawieniu.",
      live: samples,
      events: [
        {
          time: 0.25,
          text: "Rywal rusza do piłki. Sprawdź przestrzeń za jego plecami.",
        },
      ],
    },
  ];
  return s;
}
export function attackChoice(
  s: JourneySession,
  intent: TacticalIntent,
  at: Point,
  targetId?: string,
  delivery: BallDelivery = "ground",
  timing: "now" | "delay" = "now",
): JourneyChoice {
  const actor = s.controlledId ?? "you",
    own = actor === s.world.carrierId && !s.world.looseBall;
  if (
    ![
      "pass",
      "move",
      "carry",
      "cover",
      "press",
      "mark",
      "wait",
      "hold",
      "shoot",
    ].includes(intent)
  )
    throw new Error("Niedostępny ruch.");
  if (["pass", "carry", "shoot", "hold"].includes(intent) && !own)
    throw new Error("Ten zawodnik nie ma piłki. Wybierz własny ruch.");
  if (
    targetId &&
    (!s.players.some((p) => p.id === targetId && p.team === "home") ||
      targetId === actor)
  )
    throw new Error("Nieprawidłowy odbiorca.");
  const p =
    intent === "shoot" ? { x: clamp(at.x, 36, 64), y: 0 } : bound(at.x, at.y);
  if (![at.x, at.y].every(Number.isFinite))
    throw new Error("Nieprawidłowy punkt.");
  const from = s.world.positions[actor];
  const endpoint =
    ["move", "carry", "cover", "press", "mark"].includes(intent) &&
    distance(from, p) > 32
      ? lerp(from, p, 32 / distance(from, p))
      : p;
  const id = `attack9:${actor}:${intent}:${delivery}:${timing}:${endpoint.x.toFixed(2)}:${endpoint.y.toFixed(2)}:${targetId ?? "space"}`;
  const receiver = s.players.find((p) => p.id === targetId);
  return {
    id,
    intent,
    point: { x: +endpoint.x.toFixed(2), y: +endpoint.y.toFixed(2) },
    targetId,
    delivery,
    timing,
    quality: "possible",
    why: "Oceń wybór po reakcji rywali i następnej możliwości gry.",
    label:
      intent === "pass"
        ? receiver
          ? `Podanie do ${receiver.number}`
          : "Podanie w przestrzeń"
        : intent === "carry"
          ? "Prowadzenie piłki"
          : intent === "shoot"
            ? "Strzał"
            : ["wait", "hold"].includes(intent)
              ? "Utrzymanie pozycji"
              : "Twój ruch",
  };
}
export function parseAttackChoice(s: JourneySession, id: string) {
  const m =
    /^attack9:([a-z0-9-]+):(pass|move|carry|cover|press|mark|wait|hold|shoot):(ground|chip|lofted|cross):(now|delay):(\d{1,2}\.\d{2}):(\d{1,3}\.\d{2}):([a-z0-9-]+)$/.exec(
      id,
    );
  if (!m) return undefined;
  if (
    m[1] !== "you" &&
    (m[1] !== s.world.carrierId || teamOf(s, m[1]) !== "home")
  )
    return undefined;
  const controlled = { ...s, controlledId: m[1] };
  try {
    const c = attackChoice(
      controlled,
      m[2] as TacticalIntent,
      { x: +m[5], y: +m[6] },
      m[7] === "space" ? undefined : m[7],
      m[3] as BallDelivery,
      m[4] as "now" | "delay",
    );
    return c.id === id ? c : undefined;
  } catch {
    return undefined;
  }
}
export function attackStep(s: JourneySession): JourneyStep {
  const id = s.controlledId ?? "you",
    own = id === s.world.carrierId && !s.world.looseBall,
    at = s.world.positions[id];
  const choices: JourneyChoice[] = [];
  if (own) {
    for (const p of s.players.filter((p) => p.team === "home" && p.id !== id))
      choices.push(attackChoice(s, "pass", s.world.positions[p.id], p.id));
    choices.push(attackChoice(s, "carry", bound(at.x + 12, at.y - 12)));
    if (!s.players.find((p) => p.id === id)?.goalkeeper)
      choices.push(attackChoice(s, "shoot", { x: 50, y: 6 }));
  } else {
    for (const dx of [-14, 14])
      choices.push(attackChoice(s, "move", bound(at.x + dx, at.y - 12)));
  }
  choices.push(attackChoice(s, own ? "hold" : "wait", at));
  return {
    kind: own ? "play" : "move",
    prompt: lessonQuestion(s),
    instruction: lessonGoal(s),
    cue: "Przewidź kolejne zagranie.",
    choices,
  };
}
function laneScore(
  s: JourneySession,
  from: Point,
  to: Point,
  team: "home" | "away",
) {
  const nearest = Math.min(
    ...s.players
      .filter((p) => p.team !== team)
      .map((p) => {
        const line = segment(s.world.positions[p.id], from, to);
        return line.t > 0.05 && line.t < 0.95 ? line.gap : 25;
      }),
  );
  return Math.min(12, nearest) + Math.min(12, pressure(s, to, team));
}
export function attackOpenings(s: JourneySession) {
  if (teamOf(s, s.world.carrierId) !== "home") return 0;
  return s.players.filter(
    (p) =>
      p.team === "home" &&
      p.id !== s.world.carrierId &&
      !p.goalkeeper &&
      laneScore(
        s,
        s.world.positions[s.world.carrierId],
        s.world.positions[p.id],
        "home",
      ) > 12 &&
      !offside(s, s.world.carrierId, p.id),
  ).length;
}
type Flight = {
  from: Point;
  to: Point;
  actor: string;
  receiver?: string;
  start: number;
  end: number;
  delivery: BallDelivery;
  offside: boolean;
  released?: boolean;
  offsidePlayers?: string[];
  shot?: boolean;
};
/** Simulate one short decision window; every actor reacts during flight as well as between passes. */
export function chooseAttackJourney(
  previous: JourneySession,
  choiceId: string,
  seconds: number,
  findAlternative = true,
): JourneySession {
  if (previous.outcome) throw new Error("Ta akcja już się zakończyła.");
  const c = parseAttackChoice(previous, choiceId);
  if (!c) throw new Error("Nieprawidłowa decyzja.");
  const s: JourneySession = {
    ...previous,
    world: copyWorld(previous.world),
    beats: [...previous.beats],
    decisions: [...previous.decisions],
    attack: { ...previous.attack! },
  };
  // Keep immutable scene inputs stable: the renderer need not reload thirteen actors after each decision.
  s.players = previous.players;
  s.scenario = previous.scenario;
  s.definition = previous.definition;
  const before = copyWorld(s.world),
    actor = choiceId.split(":")[1];
  const team = teamOf(s, actor),
    ownAtStart = before.carrierId === actor && !before.looseBall;
  const frames: NonNullable<JourneyBeat["live"]> = [],
    events: NonNullable<JourneyBeat["events"]> = [];
  const event = (time: number, text: string) => {
    if (!events.some((e) => e.text === text))
      events.push({ time: +time.toFixed(3), text });
  };
  let ball = { ...(s.world.looseBall ?? s.world.positions[s.world.carrierId]) },
    height = BALL_REST_HEIGHT,
    flight: Flight | null = null;
  let kick: { actor: string; time: number } | undefined,
    loss = false,
    offsideCall = false,
    touched = false;
  let terminal: "goal" | "miss" | "offside" | undefined;
  let goalTeam: "home" | "away" | undefined;
  let lastAuto = -1,
    lastContact = -1;
  let autoPassed = false,
    firstReceiver = "",
    completedPass = false;
  const velocity: Record<string, Point> = Object.fromEntries(
    s.players.map((p) => [p.id, { x: 0, y: 0 }]),
  );
  const startPass = (
    id: string,
    to: Point,
    receiver: string | undefined,
    delivery: BallDelivery,
    t: number,
    shot = false,
  ) => {
    const from = { ...s.world.positions[id] };
    const profile = flightProfile(delivery, distance(from, to));
    if (shot) profile.flight = Math.max(0.16, (distance(from, to) * 0.68) / 24);
    const result: Flight = {
      from,
      to: { ...to },
      actor: id,
      receiver,
      start: t + PASS_WINDUP_SECONDS,
      end: t + PASS_WINDUP_SECONDS + profile.flight,
      delivery,
      offside: !!receiver && offside(s, id, receiver),
      shot,
    };
    kick = { actor: id, time: t };
    delete s.world.looseBall;
    if (shot) s.attack!.shots++;
    s.world.headings[id] = angle(from, to);
    event(
      t,
      shot
        ? `Nr ${s.players.find((p) => p.id === id)!.number} uderza na bramkę.`
        : id === actor
          ? "Zagranie wybrane przez Ciebie."
          : `Nr ${s.players.find((p) => p.id === id)!.number} wybiera własne zagranie.`,
    );
    return result;
  };
  const record = (time: number) =>
    frames.push({
      time: +time.toFixed(3),
      world: copyWorld(s.world),
      ball: { ...ball },
      height,
      inFlight: !!flight && time >= flight.start,
      ...(kick ? { kicker: kick.actor, kickTime: kick.time } : {}),
    });
  const ownDelay = c.timing === "delay" ? 0.65 : 0;
  let ownPassStarted = false;
  record(0);
  // A decision lasts at least 2.2 s, with a hard bound allowing a long flight to finish.
  let finishAt = ["move", "carry", "cover", "press", "mark"].includes(c.intent!)
    ? clamp(distance(before.positions[actor], c.point) / 7, 2.2, 3.6)
    : 2.2;
  for (let tick = 1; tick <= 220; tick++) {
    const t = tick * DT,
      old = copyWorld(s.world),
      carrier = s.world.carrierId;
    if (
      ownAtStart &&
      s.world.carrierId === actor &&
      !s.world.looseBall &&
      ["pass", "shoot"].includes(c.intent!) &&
      !ownPassStarted &&
      t >= ownDelay + DT
    ) {
      const to = c.targetId ? old.positions[c.targetId] : c.point;
      flight = startPass(
        actor,
        to,
        c.targetId,
        c.delivery ?? "ground",
        t,
        c.intent === "shoot",
      );
      ownPassStarted = true;
      finishAt = Math.max(finishAt, flight!.end + 0.35);
    }
    const holdingTeam = teamOf(s, carrier);
    const defenders = s.players.filter(
      (p) => p.team !== holdingTeam && !p.goalkeeper,
    );
    const nearest = [...defenders].sort(
      (a, b) =>
        distance(old.positions[a.id], ball) -
        distance(old.positions[b.id], ball),
    )[0]?.id;
    const marks: Record<string, string> = {};
    const remaining = s.players.filter(
      (p) => p.team === holdingTeam && p.id !== carrier && !p.goalkeeper,
    );
    for (const defender of defenders.filter((p) => p.id !== nearest)) {
      remaining.sort(
        (a, b) =>
          distance(old.positions[defender.id], old.positions[a.id]) -
          distance(old.positions[defender.id], old.positions[b.id]),
      );
      const receiver = remaining.shift();
      if (receiver) marks[defender.id] = receiver.id;
    }
    const chasingReceiver =
      flight && !flight.receiver
        ? s.players
            .filter(
              (p) =>
                p.team === teamOf(s, flight!.actor) &&
                p.id !== flight!.actor &&
                !p.goalkeeper,
            )
            .sort(
              (a, b) =>
                distance(old.positions[a.id], flight!.to) -
                distance(old.positions[b.id], flight!.to),
            )[0]?.id
        : undefined;
    const marker = actor === "you" ? "r1" : "r2";
    const intentions: Record<string, Point> = {};
    for (const p of s.players) {
      const at = old.positions[p.id];
      let target = at,
        speed = 5.6;
      if (p.id === actor) {
        if (
          t >= ownDelay &&
          ["move", "carry", "cover", "press", "mark"].includes(c.intent!)
        )
          target = c.point;
        speed = c.intent === "carry" ? 6 : 7;
      } else if (p.goalkeeper && p.id !== carrier) {
        const ownGoal = p.team === "home" ? 132 : 8;
        const incomingShot = flight?.shot && teamOf(s, flight.actor) !== p.team;
        target =
          incomingShot && t > flight!.start + 0.17
            ? bound(clamp(flight!.to.x, 40, 60), ownGoal)
            : bound(50 + (ball.x - 50) * 0.12, ownGoal);
        speed = incomingShot ? 6.4 : 3;
      } else if (s.world.looseBall && !flight) {
        target = ball;
        speed = 6;
      } else if (p.id === carrier && !flight && p.id !== actor) {
        // Carry towards the next line if a passing lane has not opened yet.
        target = bound(at.x + (50 - at.x) * 0.12, at.y + direction(p.team) * 8);
        speed = 4.5;
      } else if (p.team !== holdingTeam) {
        if (flight && t > flight.start + 0.15) {
          // React to the observed trajectory; no target knowledge before the kick.
          const ahead = lerp(
            flight.from,
            flight.to,
            clamp(
              (t + 0.22 - flight.start) / (flight.end - flight.start),
              0,
              1,
            ),
          );
          const near = distance(at, ahead);
          if (p.id === nearest || near < 9) target = ahead;
          else
            target = bound(
              at.x + (ball.x - at.x) * 0.08,
              at.y + (ball.y - at.y) * 0.045,
            );
        } else if (p.id === marker && team === holdingTeam && !ownAtStart) {
          const follow =
            s.definition.context === 0 ||
            (s.definition.context === 2 && t > 0.8);
          target = follow
            ? bound(old.positions[actor].x + 4, old.positions[actor].y - 3)
            : bound(
                (old.positions[actor].x + ball.x) / 2,
                Math.min(old.positions[actor].y, ball.y) - 4,
              );
        } else if (p.id === nearest)
          target = bound(ball.x, ball.y + direction(holdingTeam) * 1.8);
        else {
          const mark = s.players.find((q) => q.id === marks[p.id]);
          if (mark)
            target = bound(
              old.positions[mark.id].x * 0.7 + ball.x * 0.3,
              old.positions[mark.id].y + direction(holdingTeam) * 3,
            );
        }
      } else if (p.id !== carrier || flight) {
        if (
          flight &&
          t > flight.start &&
          (p.id === flight.receiver || p.id === chasingReceiver)
        )
          target = flight.to;
        else if (p.id !== flight?.actor) {
          const dir = direction(p.team);
          const slot =
            p.id === "anchor"
              ? 18
              : p.id === "forward"
                ? -17
                : p.id === "wide"
                  ? -3
                  : -10;
          const lateral =
            p.id === "wide"
              ? at.x < 50
                ? 10
                : 90
              : p.id === "forward"
                ? 50
                : at.x;
          const candidates = [
            at,
            bound(at.x + (at.x < 50 ? -8 : 8), at.y + dir * 5),
            bound(lateral, ball.y - dir * slot),
            bound(at.x + (50 - at.x) * 0.22, at.y + dir * 10),
          ];
          const spacing = (q: Point) =>
            s.players
              .filter((o) => o.team === p.team && o.id !== p.id)
              .reduce(
                (n, o) =>
                  n + Math.max(0, 8 - distance(q, old.positions[o.id])) * 2,
                0,
              );
          const score = (q: Point) =>
            -spacing(q) +
            laneScore(s, ball, q, p.team) -
            distance(at, q) * 0.12 +
            dir * (q.y - at.y) * 0.22 -
            Math.max(0, distance(ball, q) - 40) * 0.4;
          target = [...candidates].sort((a, b) => score(b) - score(a))[0];
        }
      }
      if (
        p.team === holdingTeam &&
        p.id !== actor &&
        p.id !== carrier &&
        !p.goalkeeper &&
        !flight
      ) {
        const line = s.players
          .filter((o) => o.team !== p.team)
          .map((o) => old.positions[o.id].y)
          .sort((a, b) => (p.team === "home" ? a - b : b - a))[1];
        target = bound(
          target.x,
          p.team === "home"
            ? Math.max(target.y, Math.min(ball.y, line) + 1)
            : Math.min(target.y, Math.max(ball.y, line) - 1),
        );
      }
      // Separate bodies without abruptly moving anyone to a different spot.
      for (const other of s.players) {
        if (other.id === p.id) continue;
        const q = old.positions[other.id],
          d = distance(at, q);
        if (d > 0.01 && d < 1.8 && distance(at, target) > 0.1)
          target = bound(
            target.x + (at.x - q.x) * 0.5,
            target.y + (at.y - q.y) * 0.5,
          );
      }
      const desired =
        distance(at, target) < 0.1
          ? { x: 0, y: 0 }
          : {
              x:
                ((target.x - at.x) / distance(at, target)) *
                Math.min(speed, distance(at, target) / DT),
              y:
                ((target.y - at.y) / distance(at, target)) *
                Math.min(speed, distance(at, target) / DT),
            };
      const v = velocity[p.id],
        acceleration = 12 * DT,
        delta = distance(v, desired),
        factor = delta ? Math.min(1, acceleration / delta) : 1;
      velocity[p.id] = lerp(v, desired, factor);
      intentions[p.id] = bound(
        at.x + velocity[p.id].x * DT,
        at.y + velocity[p.id].y * DT,
      );
    }
    for (const p of s.players) moved(s.world, p.id, intentions[p.id]);
    if (flight) {
      const f: Flight = flight;
      if (!f.released && t >= f.start) {
        f.released = true;
        f.offsidePlayers = s.players
          .filter(
            (p) =>
              p.team === teamOf(s, f.actor) &&
              p.id !== f.actor &&
              offside(s, f.actor, p.id),
          )
          .map((p) => p.id);
      }
      const progress = clamp((t - f.start) / (f.end - f.start), 0, 1);
      ball = t < f.start ? { ...f.from } : lerp(f.from, f.to, progress);
      height = f.shot
        ? BALL_REST_HEIGHT + Math.sin(progress * Math.PI) * 1.1
        : flightHeight(f.delivery, distance(f.from, f.to), progress);
      if (f.shot && t >= f.start) {
        const goalY = teamOf(s, f.actor) === "home" ? 2.35 : 137.65;
        const crossed =
          teamOf(s, f.actor) === "home" ? ball.y <= goalY : ball.y >= goalY;
        if (crossed) {
          const fraction = clamp(
            (goalY - f.from.y) / (f.to.y - f.from.y),
            0,
            1,
          );
          const atLine = lerp(f.from, f.to, fraction);
          const valid = atLine.x > 42.65 && atLine.x < 57.35 && height < 3.58;
          terminal = valid ? "goal" : "miss";
          goalTeam = teamOf(s, f.actor);
          s.world.looseBall = { ...ball };
          event(
            t,
            valid
              ? goalTeam === "home"
                ? "Gol! Piłka przekracza linię bramkową."
                : "Gol rywali. Sprawdź osłonę po stracie."
              : "Strzał mija bramkę. Akcja kończy się niecelnym uderzeniem.",
          );
          flight = null;
          record(t);
          break;
        }
      }
      const candidates = s.players
        .filter(
          (p) => p.id !== f.actor && (!p.goalkeeper || t > f.start + 0.17),
        )
        .map((p) => ({ p, d: distance(s.world.positions[p.id], ball) }))
        .filter(
          ({ d, p }) =>
            height < (p.goalkeeper ? 3.4 : 2.3) &&
            d < (p.goalkeeper ? 2.15 : 1.6) &&
            progress > 0.08 &&
            (!f.shot || p.team !== teamOf(s, f.actor)),
        )
        .sort((a, b) => a.d - b.d);
      const contact = t >= f.start ? candidates[0]?.p : undefined;
      if (contact) {
        offsideCall = !f.shot && !!f.offsidePlayers?.includes(contact.id);
        lastContact = t;
        if (f.shot && contact.goalkeeper)
          event(
            t,
            "Bramkarz broni i przejmuje piłkę. Akcja trwa — przejdź do obrony.",
          );
        s.world.carrierId = contact.id;
        if (teamOf(s, contact.id) !== teamOf(s, f.actor)) {
          loss = teamOf(s, contact.id) !== "home";
          event(
            t,
            `Nr ${contact.number} przecina tor podania, zanim piłka dociera do celu.`,
          );
        } else {
          firstReceiver = contact.id;
          completedPass = true;
          event(
            t,
            `Nr ${contact.number} dochodzi do piłki. Sprawdź jego kolejną opcję.`,
          );
        }
        touched = true;
        delete s.world.looseBall;
        flight = null;
      } else if (t >= f.end) {
        // A pass into unoccupied space remains loose until someone really reaches it.
        ball = { ...f.to };
        height = BALL_REST_HEIGHT;
        const arrivals = s.players
          .filter((p) => p.id !== f.actor)
          .map((p) => ({ p, d: distance(s.world.positions[p.id], ball) }))
          .sort((a, b) => a.d - b.d);
        if (arrivals[0].d < 2.2) {
          s.world.carrierId = arrivals[0].p.id;
          loss = teamOf(s, s.world.carrierId) !== "home";
          completedPass = !loss;
          firstReceiver = !loss ? s.world.carrierId : "";
          offsideCall = !!f.offsidePlayers?.includes(s.world.carrierId);
          event(
            t,
            loss
              ? "Rywal pierwszy dochodzi do podania w przestrzeń."
              : "Partner dobiega do podania w przestrzeń.",
          );
          touched = true;
          flight = null;
        } else {
          s.world.looseBall = { ...ball };
          event(
            t,
            "Podanie w przestrzeń. Obie drużyny walczą o dojście do piłki.",
          );
          flight = null;
        }
      }
    } else if (s.world.looseBall) {
      ball = { ...s.world.looseBall };
      const closest = s.players
        .map((p) => ({ p, d: distance(s.world.positions[p.id], ball) }))
        .sort((a, b) => a.d - b.d)[0];
      if (closest.d < 1.8) {
        s.world.carrierId = closest.p.id;
        delete s.world.looseBall;
        lastContact = t;
        event(
          t,
          `Nr ${closest.p.number} zbiera piłkę. Ponownie oceń kierunek gry.`,
        );
      }
    } else {
      const owner = s.world.carrierId,
        at = s.world.positions[owner];
      ball = { ...at };
      height = BALL_REST_HEIGHT;
      const rivals = s.players.filter(
        (p) =>
          p.team !== teamOf(s, owner) &&
          distance(s.world.positions[p.id], at) < 1.15,
      );
      if (
        rivals.length &&
        t > lastContact + 0.6 &&
        !(kick && t - kick.time < 0.5)
      ) {
        s.world.carrierId = rivals[0].id;
        loss = rivals[0].team !== "home";
        lastContact = t;
        event(t, "Nacisk kończy się odbiorem. Zmienia się kierunek gry.");
      }
      if (
        !autoPassed &&
        owner !== actor &&
        t >= 0.8 &&
        t > lastContact + 0.5 &&
        t > lastAuto + 1.0
      ) {
        const ownerTeam = teamOf(s, owner),
          dir = direction(ownerTeam);
        const goalDistance = ownerTeam === "home" ? at.y : 140 - at.y;
        if (
          goalDistance < 29 &&
          Math.abs(at.x - 50) < 28 &&
          !s.players.find((p) => p.id === owner)?.goalkeeper
        ) {
          const keeper = s.players.find(
            (p) => p.goalkeeper && p.team !== ownerTeam,
          )!;
          const targetX = s.world.positions[keeper.id].x >= 50 ? 44.1 : 55.9;
          flight = startPass(
            owner,
            { x: targetX, y: ownerTeam === "home" ? 0 : 140 },
            undefined,
            "ground",
            t,
            true,
          );
          autoPassed = true;
          lastAuto = t;
          finishAt = Math.max(finishAt, flight.end + 0.3);
        } else {
          const options = s.players.filter(
            (p) =>
              p.team === ownerTeam &&
              p.id !== owner &&
              !p.goalkeeper &&
              !offside(s, owner, p.id),
          );
          const score = (id: string) => {
            const target = s.world.positions[id];
            return (
              laneScore(s, at, target, ownerTeam) +
              dir * (target.y - at.y) * 0.65 -
              distance(at, target) * 0.12
            );
          };
          const receiver = options.sort((a, b) => score(b.id) - score(a.id))[0];
          if (receiver && score(receiver.id) > 10) {
            const target = s.world.positions[receiver.id],
              v = velocity[receiver.id];
            const lead = bound(target.x + v.x * 0.35, target.y + v.y * 0.35);
            flight = startPass(owner, lead, receiver.id, "ground", t);
            autoPassed = true;
            lastAuto = t;
            finishAt = Math.max(finishAt, flight.end + 0.3);
          }
        }
      }
    }

    if (
      actor === "you" &&
      s.world.positions[marker] &&
      !ownAtStart &&
      distance(before.positions[actor], s.world.positions[actor]) > 4 &&
      distance(before.positions[marker], s.world.positions[marker]) > 3 &&
      (s.world.positions[actor].x - before.positions[actor].x) *
        (s.world.positions[marker].x - before.positions[marker].x) +
        (s.world.positions[actor].y - before.positions[actor].y) *
          (s.world.positions[marker].y - before.positions[marker].y) >
        5
    )
      event(
        t,
        s.definition.context === 0
          ? "Obrońca zmienia pozycję za Twoim ruchem. Sprawdź miejsce, które zostawia."
          : "Obrońca zmienia pozycję, kryjąc linię do środka. Sprawdź, co pozostaje dostępne.",
      );
    if (offsideCall) event(t, "Odbiorca był na spalonym w chwili zagrania.");
    record(t);
    if (offsideCall) {
      terminal = "offside";
      break;
    }
    if (t >= finishAt && !flight) break;
  }
  // End world must correspond exactly to the last sample, including a loose-ball failure.

  const last = frames.at(-1)!,
    duration = last.time;
  const beat: JourneyBeat = {
    id: `${s.definition.id}-attack9-${s.step}`,
    revision: 2,
    kind: ownAtStart && ["pass", "shoot"].includes(c.intent!) ? "pass" : "move",
    shot: c.intent === "shoot",
    before,
    after: copyWorld(s.world),
    actorId: actor,
    receiverId: firstReceiver || undefined,
    from: before.positions[actor],
    to: c.point,
    duration,
    text:
      events.at(-1)?.text ?? "Sytuacja się zmienia. Ponownie oceń możliwości.",
    live: frames,
    events,
  };
  const openingsBefore = attackOpenings({ ...s, world: before }),
    openingsAfter = attackOpenings(s);
  const possession = teamOf(s, s.world.carrierId) === "home";
  const gain =
    before.positions[before.carrierId].y -
    s.world.positions[s.world.carrierId].y;
  const cover = s.players.filter(
    (p) =>
      p.team === "home" &&
      !p.goalkeeper &&
      p.id !== s.world.carrierId &&
      s.world.positions[p.id].y > s.world.positions[s.world.carrierId].y + 4,
  ).length;
  const quality =
    loss || offsideCall
      ? "error"
      : possession &&
          (completedPass || openingsAfter > openingsBefore || gain > 6) &&
          cover > 0
        ? "good"
        : "possible";
  const why =
    terminal === "goal"
      ? goalTeam === "home"
        ? "Gol kończy rozegraną akcję. Sprawdź podanie otwierające i ustawienie przed strzałem."
        : "Rywal zdobywa gola po kontynuacji akcji. Wróć do momentu straty i osłony."
      : terminal === "miss"
        ? "Strzał mija bramkę. Porównaj kąt, bramkarza i dostępną opcję podania."
        : offsideCall
          ? "Pozycja odbiorcy w chwili kopnięcia powoduje spalonego."
          : loss
            ? (events.at(-1)?.text ?? "Drużyna traci kontrolę nad piłką.")
            : !possession
              ? "Rywal ma piłkę. Akcja trwa: zamknij podanie, wróć do osłony i szukaj odbioru."
              : `${touched ? "Piłka trafia do nowego odbiorcy. " : "Drużyna utrzymuje piłkę. "}${openingsAfter > openingsBefore ? "Po ruchu pojawiło się więcej dostępnych linii. " : "Sprawdź dalszą opcję odbiorcy. "}${cover === 0 ? "Brakuje osłony za piłką." : "Partnerzy pozostają za piłką jako osłona."}`;
  const alternative = findAlternative
    ? (attackStep(previous).choices.find(
        (a) => a.id !== c.id && a.intent !== c.intent,
      ) ?? null)
    : null;
  s.beats.push(beat);
  s.decisions.push({
    index: s.step,
    action:
      c.intent === "shoot"
        ? "finish"
        : c.intent === "pass"
          ? "pass"
          : c.intent === "carry"
            ? "carry"
            : "move",
    choiceId: c.id,
    label: c.label,
    quality,
    why,
    before,
    after: copyWorld(s.world),
    alternative,
    firstBeat: s.beats.length - 1,
    lastBeat: s.beats.length - 1,
    decisionSeconds: Math.min(
      86400,
      Math.max(0, Number.isFinite(seconds) ? seconds : 0),
    ),
    actorId: actor,
  });
  s.step++;
  s.controlledId = "you";
  s.attack!.elapsed += duration;
  if (terminal) {
    s.attack!.finish = terminal;
    s.outcome =
      terminal === "goal"
        ? goalTeam === "home"
          ? "chance"
          : "loss"
        : "blocked";
    if (terminal === "goal") s.attack![goalTeam === "home" ? "home" : "away"]++;
  } else if (s.step >= 80 || s.attack!.elapsed >= 240) {
    // An explicit safety stop is never presented as a completed/scored attack.
    s.attack!.finish = "stopped";
    s.outcome = "retained";
  }

  return s;
}
