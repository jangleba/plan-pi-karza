/** A bounded teaching simulation, not a prediction of a real match.
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
import type { Point } from "./types";
import type {
  JourneyBeat,
  JourneyChoice,
  JourneyDefinition,
  JourneySession,
  JourneyStep,
  JourneyWorld,
  TacticalIntent,
} from "./journeyTypes";

const DT = 0.05;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const angle = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.y - a.y);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function createLiveJourney(def: JourneyDefinition): JourneySession {
  const s = createTacticalJourney(def, 7);
  s.rulesVersion = 8;
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
      text: "Rywal skraca odległość do piłki. Sprawdź, gdzie zostawia wolne miejsce.",
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
export function liveChoice(
  s: JourneySession,
  intent: TacticalIntent,
  at: Point,
  targetId?: string,
  delivery: BallDelivery = "ground",
  timing: "now" | "delay" = "now",
): JourneyChoice {
  const actor = s.controlledId ?? "you",
    own = actor === s.world.carrierId;
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
  const p = bound(at.x, at.y);
  if (![at.x, at.y].every(Number.isFinite))
    throw new Error("Nieprawidłowy punkt.");
  const from = s.world.positions[actor];
  const endpoint =
    ["move", "carry", "cover", "press", "mark"].includes(intent) &&
    distance(from, p) > 32
      ? lerp(from, p, 32 / distance(from, p))
      : p;
  const id = `live8:${actor}:${intent}:${delivery}:${timing}:${endpoint.x.toFixed(2)}:${endpoint.y.toFixed(2)}:${targetId ?? "space"}`;
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
export function parseLiveChoice(s: JourneySession, id: string) {
  const m =
    /^live8:([a-z0-9-]+):(pass|move|carry|cover|press|mark|wait|hold|shoot):(ground|chip|lofted|cross):(now|delay):(\d{1,2}\.\d{2}):(\d{1,3}\.\d{2}):([a-z0-9-]+)$/.exec(
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
    const c = liveChoice(
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
export function liveStep(s: JourneySession): JourneyStep {
  const id = s.controlledId ?? "you",
    own = id === s.world.carrierId,
    at = s.world.positions[id];
  const choices: JourneyChoice[] = [];
  if (own) {
    for (const p of s.players.filter((p) => p.team === "home" && p.id !== id))
      choices.push(liveChoice(s, "pass", s.world.positions[p.id], p.id));
    choices.push(liveChoice(s, "carry", bound(at.x + 12, at.y - 12)));
    if (!s.players.find((p) => p.id === id)?.goalkeeper)
      choices.push(liveChoice(s, "shoot", { x: 50, y: 6 }));
  } else {
    for (const dx of [-14, 14])
      choices.push(liveChoice(s, "move", bound(at.x + dx, at.y - 12)));
  }
  choices.push(liveChoice(s, own ? "hold" : "wait", at));
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
export function liveOpenings(s: JourneySession) {
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
};
/** Simulate one short decision window; every actor reacts during flight as well as between passes. */
export function chooseLiveJourney(
  previous: JourneySession,
  choiceId: string,
  seconds: number,
  findAlternative = true,
): JourneySession {
  if (previous.outcome) throw new Error("Ta akcja już się zakończyła.");
  const c = parseLiveChoice(previous, choiceId);
  if (!c) throw new Error("Nieprawidłowa decyzja.");
  const s = clone(previous);
  // Keep immutable scene inputs stable: the renderer need not reload thirteen actors after each decision.
  s.players = previous.players;
  s.scenario = previous.scenario;
  s.definition = previous.definition;
  const before = copyWorld(s.world),
    actor = choiceId.split(":")[1];
  const team = teamOf(s, actor),
    ownAtStart = before.carrierId === actor;
  const frames: NonNullable<JourneyBeat["live"]> = [],
    events: NonNullable<JourneyBeat["events"]> = [];
  const event = (time: number, text: string) => {
    if (!events.some((e) => e.text === text))
      events.push({ time: +time.toFixed(3), text });
  };
  let ball = { ...s.world.positions[s.world.carrierId] },
    height = BALL_REST_HEIGHT,
    flight: Flight | null = null;
  let kick: { actor: string; time: number } | undefined,
    loss = false,
    offsideCall = false,
    touched = false;
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
  ) => {
    const from = { ...s.world.positions[id] };
    const profile = flightProfile(delivery, distance(from, to));
    const result: Flight = {
      from,
      to: { ...to },
      actor: id,
      receiver,
      start: t + PASS_WINDUP_SECONDS,
      end: t + PASS_WINDUP_SECONDS + profile.flight,
      delivery,
      offside: !!receiver && offside(s, id, receiver),
    };
    kick = { actor: id, time: t };
    s.world.headings[id] = angle(from, to);
    event(
      t,
      id === actor
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
  for (let tick = 1; tick <= 180; tick++) {
    const t = tick * DT,
      old = copyWorld(s.world),
      carrier = s.world.carrierId;
    if (
      ownAtStart &&
      ["pass", "shoot"].includes(c.intent!) &&
      !ownPassStarted &&
      t >= ownDelay + DT
    ) {
      const to = c.targetId ? old.positions[c.targetId] : c.point;
      flight = startPass(actor, to, c.targetId, c.delivery ?? "ground", t);
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
      } else if (p.goalkeeper) {
        target = bound(50 + (ball.x - 50) * 0.18, p.team === "home" ? 132 : 8);
        speed = 3;
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
          const opponents = s.players.filter(
            (q) => q.team === holdingTeam && !q.goalkeeper && q.id !== carrier,
          );
          const mark = opponents.sort(
            (a, b) =>
              distance(at, old.positions[a.id]) -
              distance(at, old.positions[b.id]),
          )[0];
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
          (p.id === flight.receiver || distance(at, ball) < 14)
        )
          target = flight.to;
        else if (p.id !== flight?.actor) {
          const base = s.initial.positions[p.id];
          const sign = base.x < 50 ? -1 : 1;
          const candidates = [
            at,
            bound(at.x + sign * 7, at.y),
            bound(at.x - sign * 5, at.y + direction(p.team) * 7),
            bound(base.x, base.y),
          ];
          const score = (q: Point) =>
            laneScore(s, ball, q, p.team) -
            distance(at, q) * 0.18 -
            Math.max(0, distance(ball, q) - 40) * 0.4;
          target = [...candidates].sort((a, b) => score(b) - score(a))[0];
        }
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
      height = flightHeight(f.delivery, distance(f.from, f.to), progress);
      const candidates = s.players
        .filter((p) => p.id !== f.actor && (!p.goalkeeper || progress > 0.8))
        .map((p) => ({ p, d: distance(s.world.positions[p.id], ball) }))
        .filter(
          ({ d, p }) =>
            height < (p.goalkeeper ? 3.4 : 2.3) && d < 1.75 && progress > 0.08,
        )
        .sort((a, b) => a.d - b.d);
      const contact = t >= f.start ? candidates[0]?.p : undefined;
      if (contact) {
        offsideCall = !!f.offsidePlayers?.includes(contact.id);
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
        } else if (t > f.end + 1.2) {
          // End at an unresolved ball, not an invented completion/teleport.
          event(
            t,
            "Piłka pozostaje bez kontroli. Podanie nie znalazło odbiorcy w tym fragmencie.",
          );
          loss = true;
          s.world.looseBall = { ...ball };
          record(t);
          break;
        }
      }
    } else {
      const owner = s.world.carrierId,
        at = s.world.positions[owner];
      ball = { ...at };
      height = BALL_REST_HEIGHT;
      const rivals = s.players.filter(
        (p) =>
          p.team !== teamOf(s, owner) &&
          distance(s.world.positions[p.id], at) < 1.6,
      );
      if (rivals.length && t > 0.4 && !(kick && t - kick.time < 0.5)) {
        s.world.carrierId = rivals[0].id;
        loss = rivals[0].team !== "home";
        event(t, "Nacisk kończy się odbiorem. Zmienia się kierunek gry.");
      }
      // Exactly one independent team action per window, then freeze for a new user decision.
      if (
        !ownAtStart &&
        !autoPassed &&
        owner !== actor &&
        t >= 0.8 &&
        teamOf(s, owner) === "home"
      ) {
        const options = s.players.filter(
          (p) =>
            p.team === "home" &&
            p.id !== owner &&
            !p.goalkeeper &&
            !offside(s, owner, p.id),
        );
        const score = (id: string) => {
          const target = s.world.positions[id];
          return (
            laneScore(s, at, target, "home") +
            (at.y - target.y) * 0.18 -
            distance(at, target) * 0.12
          );
        };
        const receiver = options.sort((a, b) => score(b.id) - score(a.id))[0];
        if (receiver && score(receiver.id) > 9) {
          flight = startPass(
            owner,
            s.world.positions[receiver.id],
            receiver.id,
            "ground",
            t,
          );
          finishAt = Math.max(finishAt, flight!.end + 0.3);
          autoPassed = true;
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
    if ((loss || offsideCall) && !flight) break;
    if (t >= finishAt && !flight) break;
  }
  // End world must correspond exactly to the last sample, including a loose-ball failure.

  const last = frames.at(-1)!,
    duration = last.time;
  const beat: JourneyBeat = {
    id: `${s.definition.id}-live8-${s.step}`,
    revision: 2,
    kind: ownAtStart && c.intent === "pass" ? "pass" : "move",
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
  const openingsBefore = liveOpenings({ ...s, world: before }),
    openingsAfter = liveOpenings(s);
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
  const why = offsideCall
    ? "Pozycja odbiorcy w chwili kopnięcia powoduje spalonego."
    : loss
      ? (events.at(-1)?.text ?? "Drużyna traci kontrolę nad piłką.")
      : !possession
        ? "Rywal nadal ma piłkę. Sprawdź linię do środka i osłonę za sobą."
        : `${touched ? "Piłka trafia do nowego odbiorcy. " : "Drużyna utrzymuje piłkę. "}${openingsAfter > openingsBefore ? "Po ruchu pojawiło się więcej dostępnych linii. " : "Sprawdź dalszą opcję odbiorcy. "}${cover === 0 ? "Brakuje osłony za piłką." : "Partnerzy pozostają za piłką jako osłona."}`;
  const alternative = findAlternative
    ? (liveStep(previous).choices.find(
        (a) => a.id !== c.id && a.intent !== c.intent,
      ) ?? null)
    : null;
  s.beats.push(beat);
  s.decisions.push({
    index: s.step,
    action:
      c.intent === "pass" ? "pass" : c.intent === "carry" ? "carry" : "move",
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
  // Three causal checkpoints; turnover ends the teaching episode immediately.
  if (loss || offsideCall) s.outcome = loss ? "loss" : "blocked";
  else {
    const totalGain =
      s.initial.positions[s.initial.carrierId].y -
      s.world.positions[s.world.carrierId].y;
    const achieved =
      possession && totalGain > 10 && openingsAfter > 0 && cover > 0;
    if ((s.step >= 2 && achieved) || s.step >= 3)
      s.outcome = possession
        ? achieved
          ? "progress"
          : "retained"
        : "contained";
  }
  return s;
}

/** Interpolate the fixed-step trace, rather than recomputing opponents at render rate. */
export function liveSample(beat: JourneyBeat, seconds: number, clock: number) {
  const rows = beat.live!;
  const time = clamp(seconds, 0, beat.duration);
  const index = Math.min(
    rows.length - 2,
    Math.max(0, Math.floor(time / DT + 1e-7)),
  );
  const a = rows[index],
    b = rows[index + 1] ?? a,
    t = b.time > a.time ? clamp((time - a.time) / (b.time - a.time), 0, 1) : 1;
  const world: JourneyWorld = copyWorld(a.world);
  for (const id of Object.keys(world.positions)) {
    world.positions[id] = lerp(a.world.positions[id], b.world.positions[id], t);
    const delta = Math.atan2(
      Math.sin(b.world.headings[id] - a.world.headings[id]),
      Math.cos(b.world.headings[id] - a.world.headings[id]),
    );
    world.headings[id] = a.world.headings[id] + delta * t;
    world.distances[id] =
      a.world.distances[id] +
      (b.world.distances[id] - a.world.distances[id]) * t;
  }
  return {
    world,
    a,
    b,
    time,
    clock: clock + time,
    ball: lerp(a.ball, b.ball, t),
    height: a.height + (b.height - a.height) * t,
  };
}
