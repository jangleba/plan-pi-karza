import {
  BALL_RADIUS,
  BALL_REST_HEIGHT,
  PASS_BALL_FORWARD,
  PASS_BALL_LATERAL,
  PASS_WINDUP_SECONDS,
  PASS_RECOVERY_SECONDS,
} from "./animation";
import type { PlaybackFrame, PlayerMotion } from "./animation";
import type { MatchPlayer, Point, EvaluationLevel, Scenario } from "./types";
import { flightHeight, flightProfile, deliveryLabels } from "./ballFlight";
import type { BallDelivery } from "./ballFlight";
import type {
  IQRole,
  JourneyBeat,
  JourneyChoice,
  JourneyDecision,
  JourneyDefinition,
  JourneySession,
  JourneyStep,
  JourneyWorld,
} from "./journeyTypes";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const point = (x: number, y: number): Point => ({ x: clamp(x, 5, 95), y: clamp(y, 7, 133) });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const heading = (a: Point, b: Point, fallback = Math.PI) =>
  distance(a, b) > 0.001 ? Math.atan2(b.x - a.x, b.y - a.y) : fallback;
const defensiveKinds = new Set(["cover", "press", "mark"]);
const anchors: Record<IQRole, Point> = {
  gk: { x: 50, y: 124 },
  cb: { x: 48, y: 102 },
  fb: { x: 23, y: 94 },
  six: { x: 48, y: 87 },
  eight: { x: 48, y: 72 },
  ten: { x: 49, y: 55 },
  wing: { x: 22, y: 48 },
  nine: { x: 51, y: 38 },
};
const numbers: Record<IQRole, number> = {
  gk: 1,
  cb: 4,
  fb: 2,
  six: 6,
  eight: 8,
  ten: 10,
  wing: 7,
  nine: 9,
};

export function isJourneyDefensive(definition: JourneyDefinition) {
  return defensiveKinds.has(definition.steps[0]);
}
export function createJourney(definition: JourneyDefinition): JourneySession {
  const base = anchors[definition.role];
  const side = definition.ordinal % 2 === 0 ? 1 : -1;
  const x =
    (definition.role === "fb" || definition.role === "wing") && side === -1 ? 100 - base.x : base.x;
  const you = point(
    x + ((definition.ordinal % 3) - 1) * 3,
    base.y + ((definition.ordinal % 3) - 1) * 3,
  );
  const defending = isJourneyDefensive(definition);
  const homePositions: Record<string, Point> = {
    you,
    support: point(you.x - side * 22, you.y + 10),
    wide: point(you.x + side * 27, you.y - 12),
    forward: point(you.x - side * 7, you.y - 29),
  };
  if (definition.role === "gk") {
    homePositions.support = point(25, 107);
    homePositions.wide = point(78, 102);
    homePositions.forward = point(48, 88);
  }
  if (definition.revision === 2) {
    const dir = you.x <= 50 ? 1 : -1;
    if (definition.pattern === "wide-cross") {
      Object.assign(you, point(dir === 1 ? 20 : 80, 48));
      homePositions.support = point(50, 49);
      homePositions.wide = point(dir === 1 ? 68 : 32, 25);
      homePositions.forward = point(dir === 1 ? 43 : 57, 19);
    } else if (definition.pattern === "wide-return") {
      homePositions.support = point(you.x + dir * 18, you.y + 10);
      homePositions.wide = point(you.x + dir * 37, you.y - 10);
      homePositions.forward = point(you.x + dir * 20, you.y - 28);
    } else {
      homePositions.support = point(you.x - dir * 22, you.y + 12);
      homePositions.wide = point(you.x + dir * 36, you.y - 15);
      homePositions.forward = point(you.x + dir * 6, you.y - 28);
    }
  }
  const open = definition.context === 1 ? "wide" : "support";
  const homeNumbers = [4, 2, 6, 8, 10, 7, 9].filter((n) => n !== numbers[definition.role]);
  const players: MatchPlayer[] = Object.entries(homePositions).map(([id, p], i) => ({
    ...p,
    id,
    team: "home",
    number: id === "you" ? numbers[definition.role] : homeNumbers[i - 1],
    role:
      id === "you"
        ? "Ty"
        : id === "support"
          ? "Wsparcie"
          : id === "wide"
            ? "Boczny sektor"
            : "Przód",
    controlled: id === "you",
    goalkeeper: id === "you" && definition.role === "gk",
  }));
  let opponents: Record<string, Point>;
  if (defending) {
    opponents = {
      r0: point(you.x - side * 14, you.y - 22),
      r1: point(you.x + side * 22, you.y - 7),
      r2: point(you.x - side * 25, you.y - 38),
      r3: point(you.x + side * 8, you.y - 35),
    };
    if (definition.context === 1) opponents.r1 = point(you.x - side * 26, you.y - 5);
    if (definition.context === 2) {
      opponents.r0 = point(you.x + side * 18, you.y - 19);
      opponents.r1 = point(you.x - side * 20, you.y - 4);
    }
  } else {
    const closed = homePositions[open === "support" ? "wide" : "support"];
    opponents = {
      r0: point(you.x + (definition.context === 2 ? -side * 9 : side * 8), you.y - 9),
      r1: point(closed.x + side * 3, closed.y - 2),
      r2: point(homePositions.forward.x + side * 1.5, homePositions.forward.y + 2),
      r3: point(you.x + side * 24, you.y - 32),
    };
  }
  if (definition.revision === 2 && !defending) {
    const dir = you.x <= 50 ? 1 : -1;
    const target = homePositions.wide;
    opponents.r0 =
      definition.context === 0
        ? point(you.x + dir * 5, you.y - 4)
        : point((you.x + target.x) / 2, (you.y + target.y) / 2);
    opponents.r1 =
      definition.context === 1
        ? point(target.x + dir * 2, target.y + 1)
        : point(homePositions.forward.x - dir * 8, homePositions.forward.y + 4);
    opponents.r2 = point(homePositions.forward.x + dir * 12, homePositions.forward.y - 5);
    opponents.r3 = point(you.x - dir * 20, you.y - 32);
  }
  Object.entries(opponents).forEach(([id, p], i) =>
    players.push({ ...p, id, team: "away", number: [9, 6, 4, 3][i], role: "Rywal" }),
  );
  players.push({
    id: "keeper",
    x: 50,
    y: 7,
    team: "away",
    number: 1,
    role: "Bramkarz rywali",
    goalkeeper: true,
  });
  const startsWithout = defending || definition.steps[0] === "move";
  const carrierId = defending ? "r0" : startsWithout ? "support" : "you";
  const world: JourneyWorld = {
    positions: Object.fromEntries(players.map((p) => [p.id, { x: p.x, y: p.y }])),
    carrierId,
    headings: Object.fromEntries(players.map((p) => [p.id, p.team === "home" ? Math.PI : 0])),
    distances: Object.fromEntries(players.map((p) => [p.id, 0])),
  };
  const scenario: Scenario = {
    id: definition.id,
    title: definition.title,
    question: definition.focus,
    focus: definition.focus,
    seconds: 0,
    controlledPlayerId: "you",
    ballCarrierId: carrierId,
    players,
    referenceActions: [],
    defensive: defending,
  };
  return {
    definition,
    scenario,
    players,
    initial: clone(world),
    world,
    step: 0,
    decisions: [],
    beats: [],
    outcome: null,
  };
}
function segmentProjection(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { point: mix(a, b, t), t };
}
export function journeyLane(session: JourneySession, from: Point, to: Point) {
  const enemies = session.players.filter((p) => p.team === "away" && !p.goalkeeper);
  const rows = enemies
    .map((p) => {
      const projection = segmentProjection(session.world.positions[p.id], from, to);
      return {
        id: p.id,
        point: projection.point,
        t: projection.t,
        distance: distance(session.world.positions[p.id], projection.point),
      };
    })
    .filter((p) => p.t > 0.1 && p.t < 0.97)
    .sort((a, b) => a.distance - b.distance);
  return rows[0] ?? { id: "r0", point: to, t: 1, distance: 100 };
}
function nearestOpponent(session: JourneySession, p: Point) {
  return session.players
    .filter((p) => p.team === "away" && !p.goalkeeper)
    .map((player) => ({ id: player.id, distance: distance(session.world.positions[player.id], p) }))
    .sort((a, b) => a.distance - b.distance)[0];
}
export function journeyOffside(session: JourneySession, receiver: Point, ball: Point): boolean {
  const line =
    session.players
      .filter((p) => p.team === "away")
      .map((p) => session.world.positions[p.id].y)
      .sort((a, b) => a - b)[1] ?? 0;
  return receiver.y < 70 && receiver.y < ball.y - 0.4 && receiver.y < line - 0.4;
}
function receivePoint(session: JourneySession, id: string, delivery: BallDelivery) {
  const p = session.world.positions[id];
  if (delivery === "ground") return p;
  const dir = p.x <= 50 ? 1 : -1;
  const attack = session.players.find((player) => player.id === id)?.team === "away" ? 1 : -1;
  return point(
    p.x + dir * (delivery === "cross" ? 3 : 4),
    p.y + attack * (delivery === "chip" ? 7 : 4),
  );
}
export function journeyDeliveryLane(
  session: JourneySession,
  from: Point,
  to: Point,
  delivery: BallDelivery,
) {
  if (delivery === "ground") return journeyLane(session, from, to);
  const length = distance(from, to);
  const rows = session.players
    .filter((p) => p.team === "away" && !p.goalkeeper)
    .map((p) => {
      const projection = segmentProjection(session.world.positions[p.id], from, to);
      const height = flightHeight(delivery, length, projection.t, 2);
      // This stage models a foot/thigh interception. Heading duels need separate
      // animations and are not silently treated as ground interceptions.
      const reach = height < 1.8 ? 2.6 : height < 3.2 ? 1.7 : 0;
      return {
        id: p.id,
        ...projection,
        distance: reach
          ? (distance(session.world.positions[p.id], projection.point) * 2.6) / reach
          : 100,
      };
    })
    .filter((p) => p.t > 0.1 && p.t < 0.97)
    .sort((a, b) => a.distance - b.distance);
  return rows[0] ?? { id: "r0", point: to, t: 1, distance: 100 };
}
function passChoices(session: JourneySession): JourneyChoice[] {
  const from = session.world.positions.you;
  const choices = session.players
    .filter((p) => p.team === "home" && p.id !== "you")
    .map((player) => {
      const target = session.world.positions[player.id],
        lane = journeyLane(session, from, target);
      const pressure = nearestOpponent(session, target).distance;
      const offside = journeyOffside(session, target, from);
      const quality =
        offside || lane.distance < 2.6
          ? "error"
          : lane.distance < 5 || pressure < 6
            ? "possible"
            : "good";
      return {
        id: "pass:" + player.id,
        targetId: player.id,
        point: { ...target },
        label: `Podanie do ${player.number}`,
        quality,
        why: offside
          ? "Partner jest przed piłką i przed przedostatnim rywalem: zagranie uruchomi spalonego."
          : quality === "error"
            ? "Rywal znajduje się w torze podania i może je przejąć."
            : quality === "possible"
              ? "Podanie jest możliwe, ale odbiorca lub tor zagrania pozostaje pod presją."
              : "Partner ma dostępną linię podania i miejsce na kontynuację.",
      } as JourneyChoice;
    });
  // A safe sideways/backward pass remains valid; we do not reject it merely
  // because it differs from an authored preferred route.
  if (session.definition.revision !== 2) return choices;
  const deliveries: BallDelivery[] = ["ground", session.definition.delivery ?? "lofted"];
  return choices.flatMap((c) =>
    deliveries.map((delivery) => {
      const target = receivePoint(session, c.targetId!, delivery);
      const lane = journeyDeliveryLane(session, from, target, delivery);
      const pressure = nearestOpponent(session, target).distance;
      const offside = journeyOffside(session, session.world.positions[c.targetId!], from);
      const quality =
        offside || lane.distance < 2.6 || pressure < 2.8
          ? "error"
          : pressure < 6 || lane.distance < 5
            ? "possible"
            : "good";
      return {
        ...c,
        id: delivery === "ground" ? c.id : `${delivery}:${c.targetId}`,
        delivery,
        quality,
        label: `${deliveryLabels[delivery]} do ${session.players.find((p) => p.id === c.targetId)!.number}`,
        why: offside
          ? "Odbiorca jest na spalonym w momencie zagrania."
          : lane.distance < 2.6
            ? "Rywal dosięga piłki na wybranym torze zagrania."
            : pressure < 2.8
              ? "W miejscu opadania piłki rywal ma możliwość przejęcia."
              : pressure < 6
                ? "Odbiorca dostanie piłkę pod presją. Przygotuj kolejne wsparcie."
                : delivery === "ground"
                  ? "Otwarta linia pozwala zagrać po ziemi i utrzymać tempo."
                  : "Tor lotu omija doskok, a odbiorca ma miejsce do opanowania piłki.",
      } satisfies JourneyChoice;
    }),
  );
}
function movementChoices(session: JourneySession, carry: boolean): JourneyChoice[] {
  const w = session.world,
    you = w.positions.you,
    holder = w.positions[w.carrierId];
  const candidates = [
    [-23, -14],
    [23, -14],
    [-15, -25],
    [15, -25],
    [-24, 8],
    [24, 8],
    [0, -23],
  ].map(([x, y]) => point(you.x + x, you.y + y));
  if (session.definition.revision === 2 && !carry) {
    const line =
      session.players
        .filter((p) => p.team === "away")
        .map((p) => w.positions[p.id].y)
        .sort((a, b) => a - b)[1] ?? 0;
    const safeY = Math.max(you.y + 12, line + 8);
    candidates.push(
      point(you.x - 20, safeY),
      point(you.x + 20, safeY),
      point(holder.x - 18, holder.y + 6),
    );
  }
  const ranked = candidates
    .map((p) => {
      const lane = journeyLane(session, carry ? you : holder, p).distance;
      const clearance = nearestOpponent(session, p).distance;
      const progress = you.y - p.y;
      const supportPenalty = distance(holder, p) > 48 ? 20 : 0;
      const offsidePenalty = !carry && journeyOffside(session, p, holder) ? 100 : 0;
      const score =
        Math.min(lane, 10) * 2 +
        Math.min(clearance, 14) +
        progress * 0.25 -
        supportPenalty -
        offsidePenalty;
      return { p, lane, clearance, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const weak = ranked.filter((r) => distance(r.p, best.p) > 19).at(-1) ?? ranked.at(-1)!;
  const enemy = session.world.positions[nearestOpponent(session, you).id];
  const bad = session.definition.context === 2 && distance(enemy, best.p) > 20 ? enemy : weak.p;
  const badClear = nearestOpponent(session, bad).distance;
  return [
    {
      id: "space:open",
      point: best.p,
      label: carry ? "Prowadź w wybrany korytarz" : "Wbiegnij w wybraną przestrzeń",
      quality: "good",
      why: carry
        ? "Wykorzystałeś wolny korytarz bez prowadzenia prosto na rywala."
        : "Otworzyłeś kąt podania i zmieniłeś ustawienie względem rywali.",
    },
    {
      id: "space:other",
      point: { ...bad },
      label: carry ? "Prowadź w drugi korytarz" : "Zajmij drugą przestrzeń",
      quality: badClear < 4 ? "error" : "possible",
      why:
        badClear < 4
          ? "Wszedłeś w zasięg rywala. Partner ma mniej miejsca na dalszą grę."
          : "Ten ruch jest możliwy, ale daje mniejszą korzyść lub utrudnia kolejne podanie.",
    },
  ];
}
export function journeyStep(session: JourneySession): JourneyStep {
  if (session.outcome) throw new Error("Akcja została już zakończona.");
  if (session.transition === "choose") {
    const you = session.world.positions.you,
      ball = session.world.positions[session.world.carrierId];
    const close = distance(you, ball) <= 12;
    return {
      kind: "transition",
      prompt: "Strata. Doskok czy powrót?",
      instruction: "Wybierz swoją reakcję.",
      cue: close
        ? "Jesteś blisko piłki. Sprawdź możliwość doskoku."
        : "Rywal ma przewagę odległości. Osłoń drogę do bramki.",
      choices: [
        {
          id: "transition:press",
          point: point(ball.x, ball.y + 1.5),
          label: "Doskok",
          quality: close ? "good" : "error",
          why: close
            ? "Bliski doskok pozwolił odebrać piłkę przed rozwinięciem kontry."
            : "Zbyt daleki doskok otworzył rywalowi drogę do przodu.",
        },
        {
          id: "transition:recover",
          point: point((you.x + ball.x) / 2, Math.max(you.y, ball.y) + 13),
          label: "Powrót",
          quality: close ? "possible" : "good",
          why: "Powrót osłonił drogę do bramki i zatrzymał prostą kontrę.",
        },
      ],
    };
  }
  const kind = session.definition.steps[session.step];
  const w = session.world,
    you = w.positions.you;
  if (kind === "pass" || kind === "finish") {
    const choices = passChoices(session);
    if (kind === "finish") {
      const goal = { x: 50, y: 5 };
      const lane = journeyLane(session, you, goal);
      const feasible = you.y <= 43 && lane.distance >= 3;
      choices.push({
        id: "shot",
        point: goal,
        label: "Strzał",
        quality: feasible ? "good" : "possible",
        why: feasible
          ? "Stworzyłeś miejsce na próbę zakończenia. To ocena decyzji, bez gwarancji gola."
          : "Możesz próbować kończyć, ale odległość lub ustawienie rywali utrudniają strzał.",
      });
    }
    return {
      kind,
      prompt:
        kind === "finish"
          ? "Strzał czy podanie?"
          : session.step > 1
            ? "Komu zagrasz teraz?"
            : "Komu podasz?",
      instruction:
        kind === "finish" ? "Dotknij partnera albo wybierz strzał." : "Dotknij partnera na boisku.",
      cue:
        session.definition.context === 0
          ? "Sprawdź, kto zostaje poza doskokiem."
          : session.definition.context === 1
            ? "Zobacz, czy rywal zamyka tor podania."
            : "Porównaj miejsce partnera z najbliższym rywalem.",
      choices,
    };
  }
  if (defensiveKinds.has(kind)) {
    const ball = w.positions[w.carrierId];
    const receiver = session.players
      .filter((p) => p.team === "away" && !p.goalkeeper && p.id !== w.carrierId)
      .map((p) => ({ id: p.id, p: w.positions[p.id] }))
      .sort((a, b) => b.p.y - a.p.y)[0];
    const good =
      kind === "press"
        ? point(ball.x + (you.x - ball.x) * 0.12, ball.y + 4)
        : kind === "mark"
          ? point(receiver.p.x, receiver.p.y + 4)
          : point((ball.x + receiver.p.x) / 2, (ball.y + receiver.p.y) / 2 + 2);
    let other =
      kind === "press"
        ? point(ball.x + (session.definition.context === 1 ? -16 : 16), ball.y + 10)
        : point(ball.x - 16, ball.y - 5);
    if (distance(other, good) < 20) other = point(good.x + (good.x < 50 ? 26 : -26), good.y + 14);
    return {
      kind,
      prompt:
        kind === "press"
          ? "Skąd doskoczysz do rywala?"
          : kind === "mark"
            ? "Gdzie przejmiesz krycie?"
            : "Którą przestrzeń osłonisz?",
      instruction: "Dotknij miejsca, które zajmiesz.",
      cue:
        kind === "press"
          ? "Zamknij wyjście do przodu, zachowując osłonę środka."
          : "Obserwuj piłkę i najbliższego odbiorcę.",
      choices: [
        {
          id: "defend:line",
          point: good,
          label: "Zajmij pierwszą przestrzeń",
          quality: "good",
          why:
            kind === "press"
              ? "Doskok ograniczył prostą grę do przodu."
              : "Ustawienie osłoniło korytarz podania i dało możliwość przejęcia piłki.",
        },
        {
          id: "defend:chase",
          point: other,
          label: "Zajmij drugą przestrzeń",
          quality: "possible",
          why: "Naciskasz lub przesuwasz się, ale zostawiasz wolny korytarz za sobą.",
        },
      ],
    };
  }
  const carrying = kind === "carry";
  return {
    kind,
    prompt: carrying ? "Którym korytarzem ruszysz?" : "Gdzie ruszysz bez piłki?",
    instruction: "Dotknij miejsca na boisku.",
    cue: carrying
      ? "Porównaj wolną przestrzeń i możliwość reakcji rywala."
      : "Zmień kąt względem partnera z piłką.",
    choices: movementChoices(session, carrying),
  };
}
function worldMoved(world: JourneyWorld, id: string, to: Point): void {
  const from = world.positions[id];
  world.headings[id] = heading(from, to, world.headings[id]);
  world.distances[id] += distance(from, to);
  world.positions[id] = { ...to };
}
// Independent-mode destinations are actual coordinates, not a nearest authored
// answer. Canonical IDs keep drafts, replays and analysis deterministic.
export function journeyPointChoice(session: JourneySession, location: Point): JourneyChoice {
  const kind = journeyStep(session).kind;
  if (
    ["pass", "finish"].includes(kind) ||
    !Number.isFinite(location.x) ||
    !Number.isFinite(location.y) ||
    location.x < 3 ||
    location.x > 97 ||
    location.y < 4 ||
    location.y > 136
  )
    throw new Error("Wskaż dostępne miejsce na boisku.");
  const p = { x: Math.round(location.x * 100) / 100, y: Math.round(location.y * 100) / 100 };
  const id = `free:${kind}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`;
  const you = session.world.positions.you;
  const ball = session.world.positions[session.world.carrierId];
  let quality: JourneyChoice["quality"] = "possible",
    why = "Ten ruch jest możliwy, ale nie poprawił wyraźnie ustawienia.";
  if (distance(you, p) < 1) {
    quality = "error";
    why = "Pozostałeś w tym samym miejscu, bez zmiany ustawienia.";
  } else if (kind === "carry" || kind === "move") {
    const carrying = kind === "carry";
    const lane = journeyLane(session, carrying ? you : ball, p);
    const clearance = nearestOpponent(session, p).distance;
    const offside = !carrying && journeyOffside(session, p, ball);
    quality =
      offside || clearance < 3 || lane.distance < 2.6
        ? "error"
        : clearance < 6 || lane.distance < 5 || (!carrying && distance(ball, p) > 48)
          ? "possible"
          : "good";
    why = offside
      ? "Wyszedłeś na pozycję spaloną przed podaniem."
      : lane.distance < 2.6
        ? carrying
          ? "Wybrana droga prowadzenia przechodzi przez zasięg rywala."
          : "Rywal zamyka linię podania do wybranego miejsca."
        : clearance < 3
          ? "Wybrałeś miejsce w bezpośrednim zasięgu rywala."
          : quality === "possible"
            ? "Ruch pozostawia presję lub utrudnia następne podanie."
            : carrying
              ? "Wybrałeś wolną drogę prowadzenia i miejsce poza zasięgiem rywala."
              : "Otworzyłeś linię podania i znalazłeś miejsce poza presją.";
  } else if (kind === "transition") {
    const pressing = distance(p, ball) <= 6;
    const cover = segmentProjection(p, ball, { x: 50, y: 136 });
    const coverDistance = distance(p, cover.point);
    quality = pressing
      ? distance(you, ball) <= 12 && distance(p, ball) <= 5
        ? "good"
        : "error"
      : p.y > ball.y + 3 && cover.t > 0.05 && coverDistance <= 10
        ? "good"
        : p.y > ball.y && coverDistance <= 15
          ? "possible"
          : "error";
    why = pressing
      ? quality === "good"
        ? "Krótki doskok pozwolił zareagować przy piłce."
        : "Zbyt daleki lub niedokładny doskok pozostawił rywalowi drogę do przodu."
      : quality === "error"
        ? "Wybrane ustawienie nie osłoniło drogi do Twojej bramki."
        : "Powrót ograniczył korytarz prowadzący do Twojej bramki.";
  } else {
    const receiver = session.players
      .filter((p) => p.team === "away" && !p.goalkeeper && p.id !== session.world.carrierId)
      .sort((a, b) => session.world.positions[b.id].y - session.world.positions[a.id].y)[0];
    const receiverPoint = session.world.positions[receiver.id];
    const lane = segmentProjection(p, ball, receiverPoint);
    const laneGap = distance(p, lane.point);
    const goalSide = p.y >= (kind === "mark" ? receiverPoint.y : ball.y);
    quality =
      kind === "press"
        ? distance(p, ball) <= 7 && goalSide
          ? "good"
          : distance(p, ball) <= 13
            ? "possible"
            : "error"
        : kind === "mark"
          ? distance(p, receiverPoint) <= 7 && goalSide
            ? "good"
            : distance(p, receiverPoint) <= 13
              ? "possible"
              : "error"
          : laneGap <= 7 && p.y >= Math.min(ball.y, receiverPoint.y)
            ? "good"
            : laneGap <= 13
              ? "possible"
              : "error";
    why =
      quality === "good"
        ? "Wybrane miejsce ograniczyło rywalowi możliwość gry do przodu."
        : quality === "possible"
          ? "Zbliżyłeś się do akcji, ale rywal nadal ma przestrzeń do zagrania."
          : "Wybrane miejsce pozostawiło rywalowi otwarty korytarz.";
  }
  return {
    id,
    point: p,
    label: kind === "carry" ? "Prowadzenie w wybrane miejsce" : "Ruch w wybrane miejsce",
    quality,
    why,
  };
}
export function journeyChoice(session: JourneySession, id: string): JourneyChoice | undefined {
  const authored = journeyStep(session).choices.find((c) => c.id === id);
  if (authored || !id.startsWith("free:")) return authored;
  const match = /^free:([a-z]+):(\d{1,2}\.\d{2}):(\d{1,3}\.\d{2})$/.exec(id);
  if (!match || match[1] !== journeyStep(session).kind) return undefined;
  try {
    const choice = journeyPointChoice(session, { x: Number(match[2]), y: Number(match[3]) });
    return choice.id === id ? choice : undefined;
  } catch {
    return undefined;
  }
}
export function chooseJourney(
  previous: JourneySession,
  choiceId: string,
  decisionSeconds = 0,
  findAlternative = true,
): JourneySession {
  if (previous.outcome) throw new Error("Nie można dopisać decyzji po końcu akcji.");
  const step = journeyStep(previous),
    choice = journeyChoice(previous, choiceId);
  if (!choice) throw new Error("Ten wybór nie jest dostępny w bieżącej decyzji.");
  const session: JourneySession = {
    ...previous,
    world: clone(previous.world),
    decisions: [...previous.decisions],
    beats: [...previous.beats],
  };
  const before = clone(session.world),
    firstBeat = session.beats.length;
  let quality = choice.quality,
    why = choice.why;
  function beat(
    kind: JourneyBeat["kind"],
    actorId: string,
    receiverId: string | undefined,
    from: Point,
    to: Point,
    text: string,
    mutate: () => void,
    shot = false,
    air?: Pick<
      JourneyBeat,
      | "delivery"
      | "flightSeconds"
      | "controlSeconds"
      | "flightEnd"
      | "landingHeight"
      | "flightDistance"
      | "receiveAt"
    >,
  ) {
    const start = clone(session.world);
    mutate();
    const movement = distance(from, to);
    const duration = air
      ? PASS_WINDUP_SECONDS + air.flightSeconds! + air.controlSeconds!
      : kind === "pass"
        ? Math.max(PASS_WINDUP_SECONDS + (movement * 0.68) / 15 + 0.22, PASS_RECOVERY_SECONDS)
        : kind === "hold"
          ? 0.6
          : Math.max(
              0.8,
              (movement * 0.68) / (step.kind === "cover" || step.kind === "mark" ? 3.5 : 5.2),
            );
    session.beats.push({
      id: `${session.definition.id}-${session.beats.length}`,
      before: start,
      after: clone(session.world),
      kind,
      actorId,
      receiverId,
      from: { ...from },
      to: { ...to },
      duration,
      text,
      shot,
      ...air,
      ...(session.definition.revision === 2 ? { revision: 2 as const } : {}),
    });
  }
  function reactions(target: Point, exclude?: string) {
    const rivals = session.players.filter(
      (p) => p.team === "away" && !p.goalkeeper && p.id !== exclude,
    );
    rivals.forEach((r, i) => {
      const p = session.world.positions[r.id];
      const t = i === session.definition.context ? 0.13 : 0.055;
      worldMoved(
        session.world,
        r.id,
        point(p.x + (target.x - p.x) * t, p.y + (target.y - p.y) * t),
      );
    });
  }
  function pass(
    fromId: string,
    targetId: string,
    text: string,
    allowIntercept: boolean,
    shot = false,
    delivery: BallDelivery = "ground",
  ) {
    const enhanced = session.definition.revision === 2 && !shot;
    const from = clone(session.world.positions[fromId]),
      receiverStart = clone(session.world.positions[targetId]),
      to = enhanced ? receivePoint(session, targetId, delivery) : receiverStart;
    const lane = enhanced
      ? journeyDeliveryLane(session, from, to, delivery)
      : journeyLane(session, from, to);
    const crowded = enhanced && nearestOpponent(session, to).distance < 2.8;
    const intercepted = allowIntercept && (lane.distance < 2.6 || crowded);
    const offside =
      allowIntercept &&
      session.players.find((p) => p.id === fromId)?.team === "home" &&
      session.players.find((p) => p.id === targetId)?.team === "home" &&
      journeyOffside(session, receiverStart, from);
    const receiver = intercepted
      ? crowded && lane.distance >= 2.6
        ? nearestOpponent(session, to).id
        : lane.id
      : targetId;
    const end = intercepted && lane.distance < 2.6 ? lane.point : to;
    const endT = intercepted && lane.distance < 2.6 ? lane.t : 1;
    const profile = flightProfile(delivery, distance(from, to));
    const attack =
      session.players.find((player) => player.id === receiver)?.team === "away" ? 1 : -1;
    const controlTo = enhanced
      ? point(end.x + (end.x < 50 ? 1.2 : -1.2), end.y + attack * 1.4)
      : end;
    beat(
      "pass",
      fromId,
      receiver,
      from,
      end,
      intercepted ? "Rywal przejmuje podanie." : text,
      () => {
        session.world.headings[fromId] = heading(from, end, session.world.headings[fromId]);
        if (intercepted || enhanced) worldMoved(session.world, receiver, controlTo);
        session.world.carrierId = receiver;
        session.world.headings[receiver] = heading(end, from, session.world.headings[receiver]);
        if (enhanced) {
          for (const rival of session.players.filter(
            (p) => p.team === "away" && !p.goalkeeper && p.id !== receiver,
          )) {
            const p = session.world.positions[rival.id];
            const gap = distance(p, end);
            // Far defenders can shift with the flight. Those near the lane or
            // landing zone keep the exact positions used by the interception check.
            if (gap > 18 && distance(p, segmentProjection(p, from, end).point) > 9) {
              const follow = Math.min(0.08, 2 / gap);
              worldMoved(
                session.world,
                rival.id,
                point(p.x + (end.x - p.x) * follow, p.y + (end.y - p.y) * follow),
              );
            }
          }
        }
        // During the kick/flight the receivers hold their lane; other opponents
        // react in the following movement beat so they cannot cross the ball unseen.
      },
      shot,
      enhanced
        ? {
            delivery,
            flightSeconds: profile.flight * endT,
            controlSeconds: profile.control,
            flightEnd: endT,
            landingHeight: flightHeight(
              delivery,
              distance(from, to),
              endT,
              delivery === "ground" ? BALL_REST_HEIGHT : 2,
            ),
            flightDistance: distance(from, to),
            receiveAt: end,
          }
        : undefined,
    );
    if (intercepted) session.outcome = "loss";
    else if (offside) session.outcome = "blocked";
    return !intercepted && !offside;
  }
  if (step.kind === "transition") {
    const pressing =
      choiceId === "transition:press" ||
      (choiceId.startsWith("free:") &&
        distance(choice.point, session.world.positions[session.world.carrierId]) <= 6);
    const recovering =
      choiceId === "transition:recover" ||
      (choiceId.startsWith("free:") && !pressing && quality !== "error");
    session.transition = "done";
    const holder = session.world.carrierId,
      ball = clone(session.world.positions[holder]);
    beat(
      "move",
      "you",
      undefined,
      session.world.positions.you,
      choice.point,
      pressing ? "Reagujesz doskokiem po stracie." : "Wracasz do osłony kontry.",
      () => worldMoved(session.world, "you", choice.point),
    );
    if (pressing && quality === "good") {
      beat("hold", holder, undefined, ball, ball, "Odbierasz piłkę w bliskim doskoku.", () => {
        worldMoved(session.world, "you", ball);
        session.world.carrierId = "you";
      });
      session.outcome = "recovered";
    } else if (recovering) {
      const to = point(ball.x, Math.min(choice.point.y - 5, ball.y + 8));
      beat("move", holder, undefined, ball, to, "Rywal zatrzymuje kontrę przed Twoją osłoną.", () =>
        worldMoved(session.world, holder, to),
      );
      session.outcome = "contained";
    } else {
      const to = point(ball.x + (ball.x < 50 ? 12 : -12), ball.y + 16);
      beat("move", holder, undefined, ball, to, "Rywal omija spóźniony doskok.", () =>
        worldMoved(session.world, holder, to),
      );
      session.outcome = "loss";
    }
  } else if (step.kind === "pass" || step.kind === "finish") {
    if (session.world.carrierId !== "you")
      throw new Error("Zawodnik nie posiada piłki do podania.");
    if (choiceId === "shot") {
      pass("you", "keeper", "Próba zakończenia akcji.", false, true);
      session.outcome = "chance";
    } else {
      pass(
        "you",
        choice.targetId!,
        choice.delivery && choice.delivery !== "ground"
          ? "Partner dobiega i opanowuje piłkę górną."
          : "Partner przyjmuje piłkę.",
        true,
        false,
        choice.delivery,
      );
      if (session.outcome === "loss") {
        quality = "error";
        why = "Rywal przeciął tor podania. Ten sam moment jest widoczny w powtórce.";
      }
      if (session.outcome === "blocked") {
        quality = "error";
        why = "Odbiorca był na spalonym w momencie zagrania. Akcja została zatrzymana.";
      }
    }
  } else if (defensiveKinds.has(step.kind)) {
    const from = clone(session.world.positions.you),
      ballId = session.world.carrierId;
    beat("move", "you", undefined, from, choice.point, "Zmiana ustawienia w obronie.", () =>
      worldMoved(session.world, "you", choice.point),
    );
    const nextKind = session.definition.steps[session.step + 1];
    const lastDefensive = !defensiveKinds.has(nextKind);
    if (lastDefensive && quality === "good") {
      pass(ballId, "you", "Przecinasz podanie. Piłka odzyskana.", false);
    } else if (lastDefensive) {
      const from = clone(session.world.positions[ballId]);
      const to = point(from.x, from.y + 12);
      beat("move", ballId, undefined, from, to, "Rywal wykorzystuje pozostawiony korytarz.", () =>
        worldMoved(session.world, ballId, to),
      );
      quality = "error";
      why = "Rywal przeszedł przez odsłonięty korytarz. Zatrzymaj ten moment w analizie.";
      session.outcome = "blocked";
    } else {
      const receivers = session.players
        .filter((p) => p.team === "away" && !p.goalkeeper && p.id !== ballId)
        .sort(
          (a, b) =>
            distance(session.world.positions[b.id], session.world.positions.you) -
            distance(session.world.positions[a.id], session.world.positions.you),
        );
      pass(
        ballId,
        receivers[0].id,
        "Rywal zmienia kierunek rozegrania.",
        false,
        false,
        session.definition.pattern === "defend-air" ? "lofted" : "ground",
      );
    }
  } else {
    const hadBall = session.world.carrierId === "you";
    if (step.kind === "carry" && !hadBall) throw new Error("Prowadzenie wymaga posiadania piłki.");
    const from = clone(session.world.positions.you);
    const freeLane =
      hadBall && choiceId.startsWith("free:") ? journeyLane(session, from, choice.point) : null;
    const stoppedBy = freeLane && freeLane.distance < 2.6 ? freeLane : null;
    const destination = stoppedBy?.point ?? choice.point;
    beat(
      "move",
      "you",
      undefined,
      from,
      destination,
      hadBall ? "Prowadzisz piłkę." : "Ruch bez piłki.",
      () => {
        worldMoved(session.world, "you", destination);
        reactions(destination);
      },
    );
    if (hadBall && (stoppedBy || nearestOpponent(session, choice.point).distance < 3)) {
      const rival = stoppedBy?.id ?? nearestOpponent(session, choice.point).id;
      beat(
        "hold",
        rival,
        undefined,
        session.world.positions[rival],
        destination,
        "Rywal odbiera piłkę.",
        () => {
          worldMoved(session.world, rival, destination);
          session.world.carrierId = rival;
        },
      );
      quality = "error";
      why = "Prowadzenie zakończyło się w zasięgu rywala.";
      session.outcome = "loss";
    } else if (!hadBall) {
      const holder = session.world.carrierId;
      const returnDelivery =
        session.definition.pattern === "air-control" || session.definition.pattern === "third-air"
          ? (session.definition.delivery ?? "ground")
          : "ground";
      const lane = journeyDeliveryLane(
        session,
        session.world.positions[holder],
        session.definition.revision === 2
          ? receivePoint(session, "you", returnDelivery)
          : session.world.positions.you,
        returnDelivery,
      );
      if (lane.distance < 2.6) {
        beat(
          "hold",
          holder,
          undefined,
          session.world.positions[holder],
          session.world.positions[holder],
          "Partner nie ma otwartej linii podania.",
          () => {},
        );
        quality = "error";
        why = "Twój ruch nie otworzył bezpiecznej linii podania. Piłka została przy partnerze.";
        session.outcome = "blocked";
      } else {
        pass(
          holder,
          "you",
          session.definition.revision === 2
            ? "Wychodzisz do piłki i przygotowujesz kontynuację."
            : "Otrzymujesz podanie zwrotne.",
          true,
          false,
          returnDelivery,
        );
        if (session.outcome === "blocked") {
          quality = "error";
          why = "W momencie podania znajdowałeś się na spalonym. Wybierz ruch z innej wysokości.";
        }
      }
    }
  }
  const alternative =
    findAlternative && quality !== "good"
      ? (step.choices
          .filter((c) => c.id !== choiceId && c.quality === "good")
          .sort(
            (a, b) =>
              distance(before.positions.you, b.point) - distance(before.positions.you, a.point),
          )
          .find((c) => {
            const result = chooseJourney(previous, c.id, 0, false);
            return (
              !["loss", "blocked"].includes(result.outcome ?? "") &&
              result.decisions.at(-1)?.quality !== "error"
            );
          }) ?? null)
      : null;
  const decision: JourneyDecision = {
    index: session.step,
    action: step.kind,
    choiceId: choice.id,
    label: choice.label,
    quality,
    why,
    before,
    after: clone(session.world),
    alternative: quality === "good" ? null : alternative,
    firstBeat,
    lastBeat: session.beats.length - 1,
    decisionSeconds: Number.isFinite(decisionSeconds) ? Math.max(0, decisionSeconds) : 0,
  };
  session.decisions.push(decision);
  session.step++;
  if (session.definition.revision === 2 && session.outcome === "loss" && !session.transition) {
    session.outcome = null;
    session.transition = "choose";
  }
  if (
    !session.outcome &&
    session.transition !== "choose" &&
    session.step === session.definition.steps.length
  ) {
    const gain = session.initial.positions.you.y - session.world.positions.you.y;
    session.outcome = isJourneyDefensive(session.definition)
      ? "recovered"
      : gain > 12
        ? "progress"
        : "retained";
  }
  return session;
}

export function journeyVerdict(session: JourneySession): EvaluationLevel {
  if (
    session.outcome === "loss" ||
    session.outcome === "blocked" ||
    session.decisions.some((d) => d.quality === "error")
  )
    return "risky";
  return session.decisions.some((d) => d.quality === "possible") ? "conditional" : "strong";
}
export function journeyDuration(session: JourneySession) {
  return session.beats.reduce((n, b) => n + b.duration, 0);
}
export function journeyCameraPoints(session: JourneySession, includeChoices = true): Point[] {
  const visibleIds = session.players.filter((p) => !p.goalkeeper || p.controlled).map((p) => p.id);
  const worlds = [
    session.initial,
    session.world,
    ...session.beats.flatMap((beat) => [beat.before, beat.after]),
  ];
  return [
    ...worlds.flatMap((world) => visibleIds.map((id) => world.positions[id])),
    ...session.beats.flatMap((beat) => [beat.from, beat.to]),
    ...(includeChoices && !session.outcome ? journeyStep(session).choices.map((c) => c.point) : []),
  ];
}
export function journeyFrame(
  world: JourneyWorld,
  players: readonly MatchPlayer[],
  clock = 0,
): PlaybackFrame {
  const positions = new Map(Object.entries(world.positions).map(([id, p]) => [id, { ...p }]));
  const motions = new Map<string, PlayerMotion>(
    players.map((player) => [
      player.id,
      {
        heading: world.headings[player.id],
        distance: world.distances[player.id],
        moving: false,
        elapsed: 0,
        duration: 0,
        state: "idle",
        clock,
      },
    ]),
  );
  const ball = world.positions[world.carrierId];
  const angle = world.headings[world.carrierId];
  return {
    positions,
    motions,
    ball: { ...ball },
    ballVisual: { x: ball.x + Math.sin(angle) * 1.8, y: ball.y + Math.cos(angle) * 1.8 },
    ballHeight: BALL_RADIUS + 0.05,
    ballCarrierId: world.carrierId,
    ballInFlight: false,
  };
}
export function sampleJourneyBeat(
  beat: JourneyBeat,
  players: readonly MatchPlayer[],
  seconds: number,
  clock = 0,
): PlaybackFrame {
  const elapsed = clamp(seconds, 0, beat.duration),
    t = beat.duration ? elapsed / beat.duration : 1;
  const smooth = t * t * (3 - 2 * t),
    frame = journeyFrame(beat.before, players, clock + elapsed);
  for (const player of players) {
    const id = player.id,
      a = beat.before.positions[id],
      b = beat.after.positions[id],
      d = distance(a, b);
    if (d > 0.001) {
      frame.positions.set(id, mix(a, b, smooth));
      frame.motions.set(id, {
        heading: heading(a, b, beat.before.headings[id]),
        distance: beat.before.distances[id] + d * smooth,
        moving: t < 1,
        elapsed,
        duration: beat.duration,
        state: t < 1 ? "move" : "idle",
        gait: beat.revision === 2 && (d * 0.68) / beat.duration < 3.1 ? "walk" : "run",
        weight: 1,
        clock: clock + elapsed,
      });
    }
  }
  if (beat.kind === "pass" && beat.delivery) {
    const travel = beat.flightSeconds!,
      control = beat.controlSeconds!;
    const flight = clamp((elapsed - PASS_WINDUP_SECONDS) / travel, 0, 1);
    const touch = clamp((elapsed - PASS_WINDUP_SECONDS - travel) / control, 0, 1);
    const angle = heading(beat.from, beat.to);
    const atFoot = (p: Point, facing: number, lateral = 0, forward = 1.8) => ({
      x: p.x + Math.sin(facing) * forward + Math.cos(facing) * lateral,
      y: p.y + Math.cos(facing) * forward - Math.sin(facing) * lateral,
    });
    const contact = atFoot(beat.from, angle, PASS_BALL_LATERAL, PASS_BALL_FORWARD);
    const windup = clamp(elapsed / 0.2, 0, 1);
    const receiveId = beat.receiverId!;
    const receiveAt = beat.receiveAt!;
    const facing = beat.after.headings[receiveId];
    const controlEnd = atFoot(beat.after.positions[receiveId], facing);
    const landing = atFoot(receiveAt, facing);
    frame.ballVisual =
      elapsed < PASS_WINDUP_SECONDS
        ? mix(
            atFoot(beat.from, beat.before.headings[beat.actorId]),
            contact,
            windup * windup * (3 - 2 * windup),
          )
        : flight < 1
          ? mix(contact, landing, flight)
          : mix(landing, controlEnd, touch);
    frame.ball = mix(beat.from, receiveAt, flight);
    frame.ballHeight =
      elapsed < PASS_WINDUP_SECONDS
        ? BALL_REST_HEIGHT
        : flight < 1
          ? flightHeight(
              beat.delivery,
              beat.flightDistance!,
              flight * (beat.flightEnd ?? 1),
              beat.delivery === "ground" ? BALL_REST_HEIGHT : 2,
            )
          : beat.landingHeight! + (BALL_REST_HEIGHT - beat.landingHeight!) * touch;
    frame.ballInFlight = elapsed > PASS_WINDUP_SECONDS && flight < 1;
    frame.ballCarrierId = flight < 1 ? beat.before.carrierId : beat.after.carrierId;
    const kickEnd = PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS;
    const weight = Math.min(clamp(elapsed / 0.1, 0, 1), clamp((kickEnd - elapsed) / 0.1, 0, 1));
    const turn = clamp(elapsed / 0.2, 0, 1);
    const facingDelta = Math.atan2(
      Math.sin(angle - beat.before.headings[beat.actorId]),
      Math.cos(angle - beat.before.headings[beat.actorId]),
    );
    frame.motions.set(beat.actorId, {
      ...frame.motions.get(beat.actorId)!,
      heading: beat.before.headings[beat.actorId] + facingDelta * turn,
      moving: false,
      state: weight > 0 ? "pass" : "idle",
      phase: clamp(elapsed / kickEnd, 0, 1),
      elapsed,
      duration: kickEnd,
      weight,
      delivery: beat.delivery,
    });
    const run = clamp((elapsed - PASS_WINDUP_SECONDS) / Math.max(0.15, travel - 0.2), 0, 1);
    const receiverStart = beat.before.positions[receiveId],
      receiverEnd = beat.after.positions[receiveId];
    const position =
      flight < 1 ? mix(receiverStart, receiveAt, run) : mix(receiveAt, receiverEnd, touch);
    frame.positions.set(receiveId, position);
    const moving = run > 0 && run < 1 && distance(receiverStart, receiveAt) > 0.1;
    const receiving = !moving && elapsed >= PASS_WINDUP_SECONDS + travel - 0.2;
    frame.motions.set(receiveId, {
      ...frame.motions.get(receiveId)!,
      moving,
      state: moving ? "move" : receiving ? "receive" : "idle",
      heading: moving ? heading(receiverStart, receiveAt) : facing,
      distance: beat.before.distances[receiveId] + distance(receiverStart, position),
      elapsed: Math.max(0, elapsed - PASS_WINDUP_SECONDS),
      duration: travel,
      gait: "run",
      weight: 1,
      phase:
        flight < 1
          ? clamp((elapsed - (PASS_WINDUP_SECONDS + travel - 0.2)) / 0.4, 0, 0.5)
          : 0.5 + touch * 0.5,
      control: beat.delivery === "ground" ? undefined : "aerial",
    });
  } else if (beat.kind === "pass") {
    const flightDuration = Math.max(0.15, beat.duration - PASS_WINDUP_SECONDS - 0.22);
    const flight = clamp((elapsed - PASS_WINDUP_SECONDS) / flightDuration, 0, 1);
    const actor = frame.motions.get(beat.actorId)!;
    frame.motions.set(beat.actorId, {
      ...actor,
      heading: heading(beat.from, beat.to),
      moving: false,
      state: "pass",
      phase: clamp(elapsed / 1.6, 0, 1),
      elapsed,
      duration: 1.6,
      weight: elapsed < 1.6 ? 1 : 0,
    });
    const angle = heading(beat.from, beat.to),
      a = { x: beat.from.x + Math.sin(angle) * 1.8, y: beat.from.y + Math.cos(angle) * 1.8 };
    const b = { x: beat.to.x - Math.sin(angle) * 1.8, y: beat.to.y - Math.cos(angle) * 1.8 };
    frame.ballVisual = mix(a, b, flight);
    frame.ball = mix(beat.from, beat.to, flight);
    frame.ballHeight = BALL_RADIUS + 0.05 + (beat.loft ? Math.sin(Math.PI * flight) * 5 : 0);
    frame.ballInFlight = elapsed > PASS_WINDUP_SECONDS && flight < 1;
    frame.ballCarrierId = flight >= 1 ? beat.after.carrierId : beat.before.carrierId;
    if (flight >= 1 && beat.receiverId) {
      const m = frame.motions.get(beat.receiverId)!;
      frame.motions.set(beat.receiverId, {
        ...m,
        heading: heading(beat.to, beat.from),
        state: "receive",
        phase: clamp((elapsed - PASS_WINDUP_SECONDS - flightDuration) / 0.22, 0, 1),
        weight: 1,
      });
    }
  } else {
    const owner = beat.after.carrierId,
      p = frame.positions.get(owner)!;
    const angle = frame.motions.get(owner)!.heading;
    frame.ballCarrierId = owner;
    frame.ball = { ...p };
    frame.ballVisual = { x: p.x + Math.sin(angle) * 1.8, y: p.y + Math.cos(angle) * 1.8 };
    if (beat.revision === 2) {
      const previous = journeyFrame(beat.before, players).ballVisual;
      const blend = clamp(elapsed / Math.min(0.2, beat.duration), 0, 1);
      frame.ballVisual = mix(previous, frame.ballVisual, blend * blend * (3 - 2 * blend));
    }
  }
  // The exact final frame is shared by live play, review and the next decision.
  return t >= 1 ? journeyFrame(beat.after, players, clock + elapsed) : frame;
}
export function sampleJourney(session: JourneySession, seconds: number): PlaybackFrame {
  let cursor = 0;
  for (const beat of session.beats) {
    if (seconds < cursor + beat.duration)
      return sampleJourneyBeat(beat, session.players, seconds - cursor, cursor);
    cursor += beat.duration;
  }
  return journeyFrame(session.world, session.players, cursor);
}
