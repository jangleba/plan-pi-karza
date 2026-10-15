import { BALL_RADIUS, PASS_WINDUP_SECONDS, PASS_RECOVERY_SECONDS } from "./animation";
import type { PlaybackFrame, PlayerMotion } from "./animation";
import type { MatchPlayer, Point, EvaluationLevel, Scenario } from "./types";
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
  return choices;
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
export function chooseJourney(
  previous: JourneySession,
  choiceId: string,
  decisionSeconds = 0,
  findAlternative = true,
): JourneySession {
  if (previous.outcome) throw new Error("Nie można dopisać decyzji po końcu akcji.");
  const step = journeyStep(previous),
    choice = step.choices.find((c) => c.id === choiceId);
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
  ) {
    const start = clone(session.world);
    mutate();
    const movement = distance(from, to);
    const duration =
      kind === "pass"
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
  ) {
    const from = clone(session.world.positions[fromId]),
      to = clone(session.world.positions[targetId]);
    const lane = journeyLane(session, from, to);
    const intercepted = allowIntercept && lane.distance < 2.6;
    const offside =
      allowIntercept &&
      session.players.find((p) => p.id === fromId)?.team === "home" &&
      session.players.find((p) => p.id === targetId)?.team === "home" &&
      journeyOffside(session, to, from);
    const receiver = intercepted ? lane.id : targetId;
    const end = intercepted ? lane.point : to;
    beat(
      "pass",
      fromId,
      receiver,
      from,
      end,
      intercepted ? "Rywal przejmuje podanie." : text,
      () => {
        session.world.headings[fromId] = heading(from, end, session.world.headings[fromId]);
        if (intercepted) worldMoved(session.world, receiver, end);
        session.world.carrierId = receiver;
        session.world.headings[receiver] = heading(end, from, session.world.headings[receiver]);
        // During the kick/flight the receivers hold their lane; other opponents
        // react in the following movement beat so they cannot cross the ball unseen.
      },
      shot,
    );
    if (intercepted) session.outcome = "loss";
    else if (offside) session.outcome = "blocked";
    return !intercepted && !offside;
  }
  if (step.kind === "pass" || step.kind === "finish") {
    if (session.world.carrierId !== "you")
      throw new Error("Zawodnik nie posiada piłki do podania.");
    if (choiceId === "shot") {
      pass("you", "keeper", "Próba zakończenia akcji.", false, true);
      session.outcome = "chance";
    } else {
      pass("you", choice.targetId!, "Partner przyjmuje piłkę.", true);
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
      pass(ballId, receivers[0].id, "Rywal zmienia kierunek rozegrania.", false);
    }
  } else {
    const hadBall = session.world.carrierId === "you";
    if (step.kind === "carry" && !hadBall) throw new Error("Prowadzenie wymaga posiadania piłki.");
    const from = clone(session.world.positions.you);
    beat(
      "move",
      "you",
      undefined,
      from,
      choice.point,
      hadBall ? "Prowadzisz piłkę." : "Ruch bez piłki.",
      () => {
        worldMoved(session.world, "you", choice.point);
        reactions(choice.point);
      },
    );
    if (hadBall && nearestOpponent(session, choice.point).distance < 3) {
      const rival = nearestOpponent(session, choice.point).id;
      beat(
        "hold",
        rival,
        undefined,
        session.world.positions[rival],
        choice.point,
        "Rywal odbiera piłkę.",
        () => {
          worldMoved(session.world, rival, choice.point);
          session.world.carrierId = rival;
        },
      );
      quality = "error";
      why = "Prowadzenie zakończyło się w zasięgu rywala.";
      session.outcome = "loss";
    } else if (!hadBall) {
      const holder = session.world.carrierId;
      const lane = journeyLane(
        session,
        session.world.positions[holder],
        session.world.positions.you,
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
        pass(holder, "you", "Otrzymujesz podanie zwrotne.", true);
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
  if (!session.outcome && session.step === session.definition.steps.length) {
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
export function journeyCameraPoints(session: JourneySession): Point[] {
  const visibleIds = session.players.filter((p) => !p.goalkeeper || p.controlled).map((p) => p.id);
  const worlds = [
    session.initial,
    session.world,
    ...session.beats.flatMap((beat) => [beat.before, beat.after]),
  ];
  return [
    ...worlds.flatMap((world) => visibleIds.map((id) => world.positions[id])),
    ...session.beats.flatMap((beat) => [beat.from, beat.to]),
    ...(!session.outcome ? journeyStep(session).choices.map((c) => c.point) : []),
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
        gait: "run",
        weight: 1,
        clock: clock + elapsed,
      });
    }
  }
  if (beat.kind === "pass") {
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
