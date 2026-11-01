import {
  createJourneyForRules,
  chooseJourney,
  journeyStep,
  journeyPointChoice,
  journeyChoice,
  journeyLane,
  journeyOffside,
} from "./journeyEngine";
import { flightHeight, flightProfile } from "./ballFlight";
import { BALL_REST_HEIGHT, PASS_WINDUP_SECONDS } from "./animation";
import type { Point } from "./types";
import type {
  JourneyChoice,
  JourneyDefinition,
  JourneySession,
  JourneyWorld,
  JourneyBeat,
} from "./journeyTypes";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (x: number, y: number): Point => ({
  x: Math.max(5, Math.min(95, x)),
  y: Math.max(7, Math.min(133, y)),
});
const classic = (definition: JourneyDefinition): JourneyDefinition => ({
  ...definition,
  revision: 2,
});
const baseSession = (session: JourneySession): JourneySession => ({
  ...session,
  definition: classic(session.definition),
  rulesVersion: 4,
});
function moved(world: JourneyWorld, id: string, to: Point) {
  const from = world.positions[id];
  world.distances[id] += distance(from, to);
  if (distance(from, to) > 0.001) world.headings[id] = Math.atan2(to.x - from.x, to.y - from.y);
  world.positions[id] = { ...to };
}

export function createAdvancedJourney(definition: JourneyDefinition): JourneySession {
  const session = createJourneyForRules(classic(definition), 4);
  const you = session.world.positions.you,
    dir = you.x < 50 ? 1 : -1;
  const used = new Set(session.players.filter((p) => p.team === "home").map((p) => p.number));
  const numbers = [2, 4, 6, 8, 9, 10, 11].filter((n) => !used.has(n));
  const extra = [
    {
      id: "third",
      ...point(you.x + dir * (18 + definition.context * 3), you.y - 10),
      team: "home" as const,
      number: numbers[0],
      role: "Trzeci zawodnik",
    },
    {
      id: "anchor",
      ...point(you.x - dir * 12, you.y + 17),
      team: "home" as const,
      number: numbers[1],
      role: "Asekuracja",
    },
    {
      id: "r4",
      ...point(you.x + dir * 26, you.y - 26 - definition.context * 3),
      team: "away" as const,
      number: 5,
      role: "Rywal osłaniający",
    },
  ];
  session.players = [...session.players, ...extra];
  for (const player of extra) {
    session.world.positions[player.id] = { x: player.x, y: player.y };
    session.world.headings[player.id] = player.team === "home" ? Math.PI : 0;
    session.world.distances[player.id] = 0;
  }
  session.initial = clone(session.world);
  session.scenario = { ...session.scenario, players: session.players };
  return { ...session, definition, rulesVersion: 5 };
}

function contextual(session: JourneySession, choice: JourneyChoice): JourneyChoice {
  const you = session.world.positions.you;
  const receiver = session.players.find((p) => p.id === choice.targetId);
  const rivals = session.players.filter((p) => p.team === "away" && !p.goalkeeper);
  const pressure = Math.min(
    ...rivals.map((p) => distance(session.world.positions[p.id], choice.point)),
  );
  const exposed =
    session.players.filter(
      (p) =>
        p.team === "home" &&
        p.id !== "you" &&
        session.world.positions[p.id].y >= choice.point.y + 3,
    ).length < 2;
  const action = session.definition.steps[session.step];
  if (action === "press" && choice.quality === "good") {
    const ball = session.world.positions[session.world.carrierId];
    const covering = session.players.some(
      (p) =>
        p.team === "home" &&
        p.id !== "you" &&
        session.world.positions[p.id].y > ball.y + 4 &&
        Math.abs(session.world.positions[p.id].x - ball.x) < 18,
    );
    if (!covering)
      return {
        ...choice,
        quality: "possible",
        why: "Doskok skraca odległość do piłki, ale partnerzy nie osłaniają korytarza za Tobą. Odbiór może się udać; nie oznacza to, że ryzyko pozostawionej przestrzeni zniknęło.",
      };
  }
  if (
    choice.quality === "good" &&
    session.definition.context === 0 &&
    choice.point.y < you.y - 10 &&
    (pressure < 8 || exposed)
  ) {
    return {
      ...choice,
      quality: "possible",
      why: receiver
        ? `Podanie do ${receiver.number} jest dostępne, ale przy prowadzeniu 1:0 zostawia mały margines po przyjęciu lub zbyt małą osłonę straty.`
        : "Możesz przyspieszyć, ale przy prowadzeniu 1:0 uwzględnij zabezpieczenie za piłką i możliwość powrotu rywala.",
    };
  }
  return choice;
}

export function advancedPointChoice(session: JourneySession, location: Point) {
  return contextual(session, journeyPointChoice(baseSession(session), location));
}

export function advancedStep(session: JourneySession) {
  const step = journeyStep(baseSession(session));
  let choices = step.choices.map((c) => contextual(session, c));
  if (["move", "carry"].includes(step.kind)) {
    const you = session.world.positions.you;
    const p = point(you.x + (you.x < 50 ? 11 : -11), you.y + 12);
    if (choices.every((c) => distance(c.point, p) > 5))
      choices.push({
        ...advancedPointChoice(session, p),
        id: "reset:space",
        label: "Zmień kąt i zachowaj wsparcie",
      });
  }
  // At a finish decision keep three passing routes plus the shot; distribution
  // earlier in the action retains all five actual team-mates as options.
  if (step.kind === "finish") {
    const ids = [...new Set(choices.filter((c) => c.targetId).map((c) => c.targetId))];
    const selected = ids
      .sort((a, b) => {
        const rank = (id: string | undefined) =>
          Math.min(
            ...choices
              .filter((c) => c.targetId === id)
              .map((c) => (c.quality === "good" ? 0 : c.quality === "possible" ? 1 : 2)),
          );
        return rank(a) - rank(b);
      })
      .slice(0, 3);
    choices = choices.filter((c) => !c.targetId || selected.includes(c.targetId));
  }
  const prompts: Record<string, string> = {
    pass: "Które zagranie przygotuje następną przewagę?",
    move: "Jak pokażesz się po przesunięciu rywala?",
    carry: "Przyciągniesz nacisk czy zmienisz kierunek?",
    cover: "Który korytarz musisz najpierw osłonić?",
    mark: "Kogo zabezpieczysz przed następnym podaniem?",
    press: "Czy masz osłonę, żeby wyjść do piłki?",
  };
  return {
    ...step,
    choices,
    prompt: prompts[step.kind] ?? step.prompt,
    cue:
      session.definition.concept === "third-player"
        ? "Sprawdź nie tylko odbiorcę: kto dostanie następne podanie i gdzie przesunie się jego obrońca?"
        : session.definition.concept === "overload-switch"
          ? "Oceń jednocześnie doskok do piłki, dalszą stronę i osłonę za piłką. Wolne miejsce teraz może zniknąć przed przyjęciem."
          : "Zanim doskoczysz, sprawdź podanie za Twoimi plecami i partnera, który je zabezpiecza.",
  };
}

function appendBeat(session: JourneySession, beat: Omit<JourneyBeat, "id" | "revision">) {
  session.beats.push({
    ...beat,
    id: `${session.definition.id}-${session.beats.length}`,
    revision: 2,
  });
}
function thirdPlayerPass(session: JourneySession) {
  const holder = session.world.carrierId;
  if (holder === "you" || holder === "third" || holder.startsWith("r")) return;
  const from = session.world.positions[holder],
    to = session.world.positions.third;
  const lane = journeyLane(session, from, to);
  const clearance = Math.min(
    ...session.players
      .filter((p) => p.team === "away")
      .map((p) => distance(session.world.positions[p.id], to)),
  );
  if (
    distance(from, to) < 5 ||
    lane.distance < 5 ||
    clearance < 6 ||
    journeyOffside(session, to, from)
  )
    return;
  const before = clone(session.world),
    profile = flightProfile("ground", distance(from, to));
  session.world.headings[holder] = Math.atan2(to.x - from.x, to.y - from.y);
  session.world.headings.third = Math.atan2(from.x - to.x, from.y - to.y);
  session.world.carrierId = "third";
  appendBeat(session, {
    kind: "pass",
    actorId: holder,
    receiverId: "third",
    from: { ...from },
    to: { ...to },
    before,
    after: clone(session.world),
    duration: PASS_WINDUP_SECONDS + profile.flight + profile.control,
    text: "Partner gra na trzeciego. Sprawdź nowe ustawienie obrony.",
    delivery: "ground",
    flightSeconds: profile.flight,
    controlSeconds: profile.control,
    flightEnd: 1,
    landingHeight: flightHeight("ground", distance(from, to), 1, BALL_REST_HEIGHT),
    flightDistance: distance(from, to),
    receiveAt: { ...to },
  });
}
function collectiveResponse(session: JourneySession) {
  const holder = session.world.carrierId,
    ball = session.world.positions[holder],
    before = clone(session.world);
  const dir = ball.x < 50 ? 1 : -1;
  const targets: Record<string, Point> = {
    support: point(ball.x - dir * 17, ball.y + 9),
    wide: point(dir === 1 ? 83 : 17, ball.y - 11),
    forward: point(ball.x + dir * 7, ball.y - 24),
    third: point(ball.x + dir * 17, ball.y - 7),
    anchor: point(ball.x - dir * 13, ball.y + 20),
    r0: point(ball.x + dir * 4, ball.y - 3),
    r1: point(
      (ball.x + session.world.positions.forward.x) / 2,
      (ball.y + session.world.positions.forward.y) / 2,
    ),
    r2: point(session.world.positions.third.x + dir * 4, session.world.positions.third.y - 4),
    r3: point(dir === 1 ? 70 : 30, ball.y - 22),
    r4: point(50, ball.y - 28),
  };
  for (const [id, target] of Object.entries(targets)) {
    if (id === holder) continue;
    const from = session.world.positions[id],
      gap = distance(from, target);
    const max = id.startsWith("r") ? 3.5 + session.definition.context : 5;
    const t = Math.min(1, max / (gap || 1));
    moved(
      session.world,
      id,
      point(from.x + (target.x - from.x) * t, from.y + (target.y - from.y) * t),
    );
  }
  appendBeat(session, {
    kind: "hold",
    actorId: holder,
    from: { ...ball },
    to: { ...ball },
    before,
    after: clone(session.world),
    duration: 1.25,
    text: "Rywal przesuwa nacisk; partnerzy zmieniają szerokość i kąty wsparcia.",
  });
}

export function chooseAdvancedJourney(
  previous: JourneySession,
  choiceId: string,
  seconds: number,
  findAlternative: boolean,
): JourneySession {
  if (previous.outcome) throw new Error("Akcja została już zakończona.");
  const step = advancedStep(previous),
    choice = journeyChoice(previous, choiceId);
  if (!choice) throw new Error("Ten wybór nie jest dostępny.");
  const base = baseSession(previous);
  const delegatedId =
    choiceId === "reset:space" ? journeyPointChoice(base, choice.point).id : choiceId;
  const result = chooseJourney(base, delegatedId, seconds, false);
  result.definition = previous.definition;
  result.rulesVersion = 5;
  const decision = result.decisions.at(-1)!;
  decision.choiceId = choiceId;
  decision.label = choice.label;
  if (decision.quality !== "error") {
    decision.quality = choice.quality;
    decision.why = choice.why;
  }
  if (!result.outcome && result.transition !== "choose") {
    if (
      previous.definition.concept === "third-player" &&
      previous.step === 0 &&
      step.kind === "pass"
    )
      thirdPlayerPass(result);
    collectiveResponse(result);
    decision.after = clone(result.world);
    decision.lastBeat = result.beats.length - 1;
  }
  if (["progress", "retained"].includes(result.outcome ?? "")) {
    const start = result.initial.positions[result.initial.carrierId];
    const finish = result.world.positions[result.world.carrierId];
    result.outcome = start.y - finish.y > 12 ? "progress" : "retained";
    if (
      result.definition.context === 2 &&
      result.outcome === "retained" &&
      decision.quality !== "error"
    ) {
      decision.quality = "possible";
      decision.why =
        "Utrzymałeś piłkę, ale przy 0:1 końcowe ustawienie nie przyniosło wyraźnego postępu. Bezpieczne podania mogą przygotować przewagę; nie zastępują jej wykorzystania, gdy potrzebujesz bramki.";
    }
  }
  if (findAlternative && decision.quality !== "good") {
    decision.alternative =
      step.choices
        .filter((c) => c.id !== choiceId && c.quality === "good")
        .find((c) => {
          const alternate = chooseAdvancedJourney(previous, c.id, 0, false);
          return (
            !["loss", "blocked"].includes(alternate.outcome ?? "") &&
            alternate.decisions.at(-1)?.quality !== "error"
          );
        }) ?? null;
  }
  return result;
}
