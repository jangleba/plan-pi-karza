import { pressingAssessment } from "./tacticalLearning";
import { createAdvancedJourney } from "./advancedJourney";
import {
  autonomousTurn,
  carryAssessment,
  contestHeldBall,
  performCarry,
  repositionWorld,
  responseBeat,
} from "./tacticalAgents";
import {
  actorId,
  bound,
  copyWorld,
  direction,
  distance,
  goalie,
  holdBeat,
  moveBeat,
  passAssessment,
  passBeat,
  pressure,
  segment,
  teamOf,
  TACTICAL_TURNS,
} from "./tacticalWorld";
import type { Point } from "./types";
import type {
  ActionTiming,
  DribbleStyle,
  JourneyAction,
  JourneyChoice,
  JourneyDefinition,
  JourneyQuality,
  JourneySession,
  TacticalIntent,
} from "./journeyTypes";
import type { BallDelivery } from "./ballFlight";

export function createTacticalJourney(
  definition: JourneyDefinition,
  rulesVersion: 6 | 7 = 7,
): JourneySession {
  const s = createAdvancedJourney(definition);
  s.rulesVersion = rulesVersion;
  s.controlledId = "you";
  // Keep the immutable scenario definition: old step metadata also seeds its starting shape.
  if (definition.concept === "overload-switch") {
    const side = s.world.positions.you.x < 50 ? 1 : -1;
    s.world.positions.wide = bound(side > 0 ? 91 : 9, s.world.positions.wide.y + 6);
    s.world.positions.r1 = bound(s.world.positions.r1.x - side * 8, s.world.positions.r1.y + 7);
    s.world.positions.third = bound(
      s.world.positions.third.x + side * 5,
      s.world.positions.third.y + 5,
    );
    if (definition.context === 0) s.world.carrierId = "anchor";
  } else if (definition.concept === "third-player" && definition.context === 1)
    s.world.carrierId = "support";
  if (!s.players.some((p) => p.team === "home" && p.goalkeeper)) {
    const keeper = {
      id: "home-keeper",
      x: 50,
      y: 133,
      team: "home" as const,
      goalkeeper: true,
      number: 1,
      role: "Bramkarz",
    };
    s.players = [...s.players, keeper];
    s.world.positions[keeper.id] = { x: keeper.x, y: keeper.y };
    s.world.headings[keeper.id] = Math.PI;
    s.world.distances[keeper.id] = 0;
  }
  s.players = s.players.map((p) => ({ ...p, ...s.world.positions[p.id] }));
  s.initial = copyWorld(s.world);
  s.scenario = { ...s.scenario, players: s.players };
  return s;
}
export type TacticalGroup = "pass" | "carry" | "move" | "decoy" | "defend" | "hold" | "shoot";
export const tacticalGroup = (c: JourneyChoice): TacticalGroup =>
  c.style === "shield"
    ? "hold"
    : ["press", "cover", "mark"].includes(c.intent ?? "")
      ? "defend"
      : c.intent === "wait"
        ? "hold"
        : ((c.intent as TacticalGroup) ?? "move");
export function tacticalGroups(s: JourneySession) {
  return s.world.carrierId === actorId(s)
    ? ([
        "pass",
        "carry",
        "hold",
        ...(!s.players.find((p) => p.id === actorId(s))!.goalkeeper ? ["shoot"] : []),
      ] as TacticalGroup[])
    : teamOf(s, s.world.carrierId) === "home"
      ? (["move", "decoy", "hold", "defend"] as TacticalGroup[])
      : (["defend", "move", "hold"] as TacticalGroup[]);
}
export const tacticalGroupLabels: Record<TacticalGroup, string> = {
  pass: "Podanie",
  carry: "Drybling",
  move: "Własna pozycja",
  decoy: "Ruch dla partnera",
  defend: "Krycie / osłona",
  hold: "Poczekaj / utrzymaj",
  shoot: "Strzał",
};
export const dribbleLabels: Record<DribbleStyle, string> = {
  direct: "Prowadzenie",
  "cut-left": "Zwód i zmiana w lewo",
  "cut-right": "Zwód i zmiana w prawo",
  "stop-go": "Zwolnij i przyspiesz",
  "turn-back": "Zawrót z piłką",
  shield: "Osłoń piłkę",
};
/** Explicit, single-decision takeover. It never transfers control to an opponent. */
export function controlTacticalActor(s: JourneySession, id: string): JourneySession {
  if (
    (s.rulesVersion !== 6 && s.rulesVersion !== 7) ||
    s.outcome ||
    id !== s.world.carrierId ||
    teamOf(s, id) !== "home"
  )
    throw new Error("Możesz przejąć tylko partnera, który aktualnie ma piłkę.");
  return { ...s, controlledId: id };
}
const choiceId = (s: JourneySession, id: string) =>
  actorId(s) === "you" ? id : `as6:${actorId(s)}:${id}`;

function withTiming(s: JourneySession, timing: ActionTiming | undefined) {
  if (timing !== "delay") return s;
  const predicted = { ...s, world: copyWorld(s.world), beats: [], decisions: [] };
  repositionWorld(predicted, 0.7, undefined, true);
  contestHeldBall(predicted);
  return predicted;
}
function coverCount(s: JourneySession, p: Point) {
  const team = teamOf(s, actorId(s)),
    dir = direction(team);
  return s.players.filter(
    (q) =>
      q.team === team &&
      q.id !== actorId(s) &&
      dir * (s.world.positions[q.id].y - p.y) < -3 &&
      Math.abs(s.world.positions[q.id].x - p.x) < 25,
  ).length;
}
function teamOpenings(s: JourneySession) {
  const holder = s.world.carrierId,
    team = teamOf(s, holder);
  return s.players
    .filter((p) => p.team === team && p.id !== holder && !p.goalkeeper)
    .reduce((sum, p) => {
      const a = passAssessment(s, holder, p.id);
      return sum + (a.quality === "good" ? 2 : a.quality === "possible" ? 1 : 0);
    }, 0);
}
function moveAssessment(s: JourneySession, p: Point, intent: TacticalIntent) {
  const id = actorId(s),
    team = teamOf(s, id),
    holder = s.world.carrierId,
    ball = s.world.positions[holder],
    you = s.world.positions[id];
  const predicted = { ...s, world: copyWorld(s.world), beats: [], decisions: [] };
  const from = s.world.positions[id];
  predicted.world.positions[id] = { ...p };
  const follow = intent === "decoy" ? { id, to: p, from } : undefined;
  repositionWorld(predicted, Math.max(0.45, (distance(from, p) * 0.68) / 4.5), follow);
  repositionWorld(predicted, 0.65, follow);
  const room = pressure(predicted, p, team),
    gain = teamOf(s, holder) === team ? teamOpenings(predicted) - teamOpenings(s) : 0;
  let quality: JourneyQuality, why: string;
  if (intent === "decoy") {
    quality = gain > 0 ? "good" : distance(from, p) < 2 ? "error" : "possible";
    why =
      gain > 0
        ? "Ruch wiąże krycie i otwiera dodatkową linię partnerowi. Nie musisz dostać podania, żeby ten ruch miał wartość."
        : "Nie pojawiła się wyraźnie lepsza linia dla partnera. Samo odciągnięcie rywala nie wystarcza, jeśli nikt nie korzysta z wolnego miejsca.";
  } else if (["cover", "mark", "press"].includes(intent)) {
    const goal = { x: 50, y: team === "home" ? 136 : 4 },
      row = segment(p, ball, goal),
      goalSide = direction(team) * (p.y - ball.y) < 0;
    if (intent === "press" && s.rulesVersion === 7) {
      ({ quality, why } = pressingAssessment(s, p));
    } else if (intent === "press") {
      const near = distance(p, ball),
        covered = coverCount(s, p) > 0;
      quality = near < 6 && covered ? "good" : near < 12 ? "possible" : "error";
      why = covered
        ? "Doskok ma partnera za plecami. Jego kierunek ogranicza możliwości rywala, ale nie oznacza automatycznego odbioru."
        : "Wychodzisz bez dostatecznej osłony. Rozważ ograniczenie podania do środka zamiast samego ścigania piłki.";
    } else {
      const enemy = s.players
        .filter((q) => q.team !== team && !q.goalkeeper && q.id !== holder)
        .sort(
          (a, b) => distance(s.world.positions[a.id], p) - distance(s.world.positions[b.id], p),
        )[0];
      const gap = enemy ? distance(s.world.positions[enemy.id], p) : 100;
      quality =
        goalSide && (intent === "mark" ? gap < 8 : row.gap < 10)
          ? "good"
          : goalSide
            ? "possible"
            : "error";
      why =
        quality === "good"
          ? "Ograniczasz korytarz lub odbiorcę między piłką a własną bramką. Rywal nadal może wybrać inną stronę."
          : "Ta pozycja nie zamyka wystarczająco drogi rywala do przodu.";
    }
  } else if (teamOf(s, holder) === team) {
    const offered = { ...predicted, world: copyWorld(predicted.world) };
    const lane = passAssessment(offered, holder, id);
    const width = Math.abs(p.x - ball.x),
      stacked = distance(p, ball) < 4;
    quality = stacked
      ? "error"
      : gain > 0 || (lane.quality === "good" && room > 5) || (width > 23 && room > 6)
        ? "good"
        : room < 2.5
          ? "error"
          : "possible";
    why = stacked
      ? "Zbliżenie do piłki ściska miejsce partnerowi zamiast dawać mu inną opcję."
      : quality === "good"
        ? "Ustawienie daje partnerowi dodatkową linię, szerokość lub osłonę. To nie zobowiązuje go do podania właśnie do Ciebie."
        : "Partner może nadal zagrać gdzie indziej. Dostosuj kolejny ruch do jego decyzji i reakcji krycia.";
  } else {
    const row = segment(p, ball, { x: 50, y: team === "home" ? 136 : 4 });
    quality = row.gap < 12 && direction(team) * (p.y - ball.y) < 0 ? "good" : "possible";
    why =
      "Pozycja jest oceniana przez osłonę dalszej gry i dostęp do rywala, nie przez odległość przebiegniętą do piłki.";
  }
  if (distance(you, p) < 1 && intent !== "cover") quality = "possible";
  return { quality, why };
}
function assess(s: JourneySession, c: Omit<JourneyChoice, "quality" | "why">): JourneyChoice {
  const prepared = withTiming(s, c.timing),
    id = actorId(s),
    owner = prepared.world.carrierId;
  let point = c.point;
  let result: { quality: JourneyQuality; why: string };
  if (["pass", "carry", "shoot"].includes(c.intent ?? "") && owner !== id) {
    result = {
      quality: "error",
      why: "Czekanie pozwoliło rywalowi dosięgnąć piłki przed planowanym działaniem.",
    };
  } else if (c.intent === "pass") {
    result = passAssessment(prepared, id, c.targetId!, c.delivery);
    point = prepared.world.positions[c.targetId!];
  } else if (c.intent === "carry") {
    const carry = carryAssessment(prepared, id, c.point, c.style);
    result = carry;
    if (c.style === "shield") point = carry.world.positions[id];
  } else if (c.intent === "shoot") {
    const target = goalie(prepared, "away"),
      evaluation = passAssessment(prepared, id, target.id, "ground", true),
      range = distance(prepared.world.positions[id], prepared.world.positions[target.id]);
    result = {
      quality: evaluation.interceptor ? "possible" : range < 30 ? "good" : "possible",
      why:
        range > 40
          ? "Próba z dużej odległości może oddać posiadanie; porównaj partnerów i tor strzału."
          : evaluation.interceptor
            ? "Rywal osłania tor. Samo oddanie strzału nie jest równoznaczne ze stworzeniem przewagi."
            : "Tor daje możliwość próby strzału. Wynik tej próby nie jest gwarantowany.",
    };
  } else if (c.intent === "hold" || c.intent === "wait") {
    const offBall = owner !== id;
    const held = { ...prepared, world: copyWorld(prepared.world), beats: [], decisions: [] };
    if (!offBall) {
      repositionWorld(held, 0.8, undefined, true);
      contestHeldBall(held);
    }
    const room = pressure(held, held.world.positions[id], teamOf(held, id));
    result = offBall
      ? {
          quality:
            coverCount(prepared, prepared.world.positions[owner]) > 0 || room > 8
              ? "good"
              : "possible",
          why: "Pozostajesz w pozycji i obserwujesz. Partner może wykorzystać zachowaną szerokość lub osłonę, zamiast szukać podania do Ciebie.",
        }
      : {
          quality:
            held.world.carrierId !== id || room < 3 ? "error" : room < 6 ? "possible" : "good",
          why:
            room < 3
              ? "Rywal jest za blisko na bierne utrzymanie piłki."
              : "Zyskujesz czas na odczytanie ruchu partnerów, ale rywal również może skrócić odległość.",
        };
  } else result = moveAssessment(prepared, c.point, c.intent ?? "move");
  if (s.rulesVersion === 7 && c.intent === "wait") {
    const ownTeam = teamOf(prepared, id),
      at = prepared.world.positions[id];
    if (teamOf(prepared, owner) !== ownTeam) {
      const goal = { x: 50, y: ownTeam === "home" ? 136 : 4 };
      const ball = prepared.world.positions[owner];
      const lane = segment(at, ball, goal);
      const holdsLane = direction(ownTeam) * (at.y - ball.y) < 0 && lane.gap < 10;
      result = {
        quality: holdsLane ? "possible" : "error",
        why: holdsLane
          ? "Zachowujesz korytarz do bramki, ale czekanie daje rywalowi czas. Sprawdź najbliższego odbiorcę i moment skrócenia dystansu; samo pozostanie nie jest wygraną decyzją."
          : "Pozostając tutaj, nie osłaniasz korytarza do bramki. Wolne miejsce wokół Ciebie nie oznacza, że drużyna ma zabezpieczenie.",
      };
    } else {
      const lane = passAssessment(prepared, owner, id);
      const available = lane.quality === "good" && pressure(prepared, at, ownTeam) > 5;
      result = {
        quality: available ? "good" : "possible",
        why: available
          ? "Utrzymujesz dostępną linię dla partnera zamiast zbiegać do piłki. Po jego następnym kontakcie ponownie sprawdź krycie i kąt wsparcia."
          : "Czekanie nie otwiera wyraźnej linii do Ciebie. Porównaj nowy kąt wsparcia z zachowaniem miejsca dla innego partnera.",
      };
    }
  }
  return { ...c, quality: result.quality, why: result.why, point };
}
function authoredChoices(s: JourneySession, onlyId?: string): JourneyChoice[] {
  const id = actorId(s),
    you = s.world.positions[id],
    holder = s.world.carrierId,
    ball = s.world.positions[holder],
    own = holder === id,
    dir = direction(teamOf(s, id));
  const choices: JourneyChoice[] = [];
  const add = (c: Omit<JourneyChoice, "quality" | "why">) => {
    if (!onlyId || c.id === onlyId) choices.push(assess(s, c));
  };
  if (own) {
    for (const player of s.players.filter((p) => p.team === teamOf(s, id) && p.id !== id))
      for (const delivery of ["ground", s.definition.delivery ?? "lofted"] as BallDelivery[]) {
        add({
          id: `t:pass:${player.id}:${delivery}`,
          intent: "pass",
          targetId: player.id,
          delivery,
          point: s.world.positions[player.id],
          label: `Podanie do ${player.number}`,
        });
      }
    const candidates: [DribbleStyle, Point][] = [
      ["direct", bound(you.x, you.y + dir * 13)],
      ["direct", bound(you.x + (you.x < 50 ? -9 : 9), you.y + dir * 10)],
      ["cut-left", bound(you.x - 12, you.y + dir * 8)],
      ["cut-right", bound(you.x + 12, you.y + dir * 8)],
      ["stop-go", bound(you.x + (you.x < 50 ? 7 : -7), you.y + dir * 15)],
      ["turn-back", bound(you.x + (you.x < 50 ? 5 : -5), you.y - dir * 9)],
    ];
    candidates.forEach(([style, p], i) =>
      add({
        id: `t:carry:${style}:${i}`,
        intent: "carry",
        style,
        point: p,
        label: dribbleLabels[style],
      }),
    );
    add({
      id: "t:hold:protect",
      intent: "carry",
      style: "shield",
      point: you,
      label: "Osłoń piłkę",
    });
    add({ id: "t:hold:wait", intent: "hold", point: you, label: "Utrzymaj i poczekaj" });
    if (!s.players.find((p) => p.id === id)!.goalkeeper)
      add({
        id: "t:shoot",
        intent: "shoot",
        targetId: goalie(s, "away").id,
        point: s.world.positions[goalie(s, "away").id],
        label: "Spróbuj strzału",
      });
  } else {
    if (teamOf(s, holder) === teamOf(s, id)) {
      [
        bound(you.x - 15, you.y + dir * 9),
        bound(you.x + 15, you.y + dir * 9),
        bound(you.x + (you.x < 50 ? -12 : 12), ball.y - dir * 7),
      ].forEach((p, i) =>
        add({
          id: `t:move:${i}`,
          intent: "move",
          point: p,
          label: i === 2 ? "Zachowaj szerokość" : "Zmień kąt wsparcia",
        }),
      );
      [bound(you.x - 16, you.y + dir * 17), bound(you.x + 16, you.y + dir * 17)].forEach((p, i) =>
        add({
          id: `t:decoy:${i}`,
          intent: "decoy",
          point: p,
          label: "Zwiąż rywala ruchem dla partnera",
        }),
      );
    } else {
      [bound(you.x - 12, you.y - dir * 9), bound(you.x + 12, you.y - dir * 9)].forEach((p, i) =>
        add({ id: `t:move:${i}`, intent: "move", point: p, label: "Przesuń pozycję za piłką" }),
      );
    }
    const goal = { x: 50, y: teamOf(s, id) === "home" ? 136 : 4 };
    const cover = bound(ball.x + (goal.x - ball.x) * 0.3, ball.y + (goal.y - ball.y) * 0.22);
    add({ id: "t:defend:cover", intent: "cover", point: cover, label: "Osłoń środek" });
    if (teamOf(s, holder) !== teamOf(s, id))
      add({
        id: "t:defend:press",
        intent: "press",
        point: bound(ball.x, ball.y - dir * 4),
        label: "Wyjdź do zawodnika z piłką",
      });
    const target = s.players
      .filter((p) => p.team !== teamOf(s, id) && !p.goalkeeper && p.id !== holder)
      .sort(
        (a, b) => distance(s.world.positions[a.id], you) - distance(s.world.positions[b.id], you),
      )[0];
    if (target && teamOf(s, holder) !== teamOf(s, id))
      add({
        id: "t:defend:mark",
        intent: "mark",
        point: bound(s.world.positions[target.id].x, s.world.positions[target.id].y - dir * 3),
        label: "Zabezpiecz najbliższego odbiorcę",
      });
    add({ id: "t:wait", intent: "wait", point: you, label: "Zostań i obserwuj dalszą grę" });
  }
  return choices;
}
export function tacticalStep(s: JourneySession) {
  if (s.outcome) throw new Error("Akcja została zakończona.");
  const owner = s.world.carrierId,
    own = owner === actorId(s),
    team = teamOf(s, owner);
  const base = authoredChoices(s);
  const delayed = base
    .filter((c) => !["hold", "wait"].includes(c.intent ?? ""))
    .map((c) =>
      assess(s, { ...c, id: `delay:${c.id}`, timing: "delay", label: `${c.label} po chwili` }),
    );
  return {
    kind: (own ? "play" : team === "home" ? "move" : "cover") as JourneyAction,
    choices: [...base, ...delayed].map((c) => ({ ...c, id: choiceId(s, c.id) })),
    prompt: own
      ? "Co, gdzie i w jakim momencie zrobisz z piłką?"
      : team === "home"
        ? "Jak pomożesz akcji, nawet bez otrzymania podania?"
        : "Którą opcję rywala ograniczysz?",
    instruction: "Sam wybierz zamiar i miejsce. Zawodnicy reagują na bieżące ustawienie.",
    cue: own
      ? "Porównaj wyjście po zwodzie z podaniem i ochroną posiadania. Po każdym dotknięciu układ może się zmienić."
      : team === "home"
        ? "Obserwuj nie tylko piłkę: Twój bieg może otworzyć miejsce innemu partnerowi. Nie każdy ruch musi kończyć się podaniem do Ciebie."
        : "Sprawdź odbiorcę za plecami i osłonę partnera, zanim ruszysz do piłki.",
  };
}
export function freeTacticalChoice(
  s: JourneySession,
  p: Point,
  intent: TacticalIntent = s.world.carrierId === actorId(s) ? "carry" : "move",
  style: DribbleStyle = "direct",
  timing: ActionTiming = "now",
): JourneyChoice {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 4 || p.x > 96 || p.y < 6 || p.y > 134)
    throw new Error("Wskaż miejsce wewnątrz boiska.");
  const own = s.world.carrierId === actorId(s),
    team = teamOf(s, s.world.carrierId);
  if (
    own
      ? !["carry"].includes(intent)
      : !["move", "decoy", "cover", "press", "mark"].includes(intent)
  )
    throw new Error("Ten zamiar nie pasuje do aktualnego posiadania piłki.");
  if (intent === "decoy" && team !== "home")
    throw new Error("Ruch dla partnera wymaga posiadania Twojej drużyny.");
  if (["press", "mark"].includes(intent) && team === "home")
    throw new Error("Przy piłce u partnera wybierz wsparcie albo zabezpieczenie akcji.");
  if (
    !["direct", "cut-left", "cut-right", "stop-go", "turn-back"].includes(style) ||
    !["now", "delay"].includes(timing)
  )
    throw new Error("Nieobsługiwany wariant ruchu.");
  const from = s.world.positions[actorId(s)],
    point = { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) };
  if (distance(from, point) > 32) throw new Error("Wybierz krótszy odcinek na tę decyzję.");
  if (
    (own && style === "cut-left" && point.x >= from.x) ||
    (own && style === "cut-right" && point.x <= from.x)
  )
    throw new Error("Wskaż punkt po stronie wybranej zmiany kierunku.");
  if (own && style === "turn-back" && direction(teamOf(s, actorId(s))) * (point.y - from.y) >= 0)
    throw new Error("Przy zawrocie wskaż miejsce w stronę własnej bramki.");
  const id = choiceId(
    s,
    `free6:${intent}:${style}:${timing}:${point.x.toFixed(2)}:${point.y.toFixed(2)}`,
  );
  return assess(s, {
    id,
    intent,
    style,
    timing,
    point,
    label:
      intent === "carry"
        ? dribbleLabels[style]
        : intent === "decoy"
          ? "Własny ruch dla partnera"
          : "Własne ustawienie",
  });
}
export function tacticalChoice(s: JourneySession, id: string) {
  let raw = id;
  if (id.startsWith("as6:")) {
    const m = /^as6:([a-z0-9-]+):(.+)$/.exec(id);
    if (!m || m[1] === "you") return undefined;
    try {
      s = controlTacticalActor(s, m[1]);
      raw = m[2];
    } catch {
      return undefined;
    }
  } else if (actorId(s) !== "you") return undefined;
  if (raw.startsWith("free6:")) {
    const m = /^free6:([a-z]+):([a-z-]+):(now|delay):(\d{1,2}\.\d{2}):(\d{1,3}\.\d{2})$/.exec(raw);
    if (!m) return undefined;
    try {
      const c = freeTacticalChoice(
        s,
        { x: Number(m[4]), y: Number(m[5]) },
        m[1] as TacticalIntent,
        m[2] as DribbleStyle,
        m[3] as ActionTiming,
      );
      return c.id === id ? c : undefined;
    } catch {
      return undefined;
    }
  }
  const delayed = raw.startsWith("delay:");
  const candidate = authoredChoices(s, delayed ? raw.slice(6) : raw)[0];
  if (!candidate || (delayed && ["hold", "wait"].includes(candidate.intent ?? "")))
    return undefined;
  return delayed
    ? assess(s, { ...candidate, id, timing: "delay", label: `${candidate.label} po chwili` })
    : { ...candidate, id };
}
function performOwn(s: JourneySession, c: JourneyChoice) {
  const id = actorId(s),
    team = teamOf(s, id),
    hadBall = s.world.carrierId === id;
  if (c.timing === "delay") {
    holdBeat(
      s,
      id,
      "Czekasz na zmianę ustawienia przed działaniem.",
      () => repositionWorld(s, 0.7, undefined, true),
      0.7,
    );
    contestHeldBall(s);
    if (hadBall && s.world.carrierId !== id) return;
  }
  if (c.intent === "pass") {
    const result = passBeat(
      s,
      id,
      c.targetId!,
      c.delivery ?? "ground",
      `Zagranie do nr ${s.players.find((p) => p.id === c.targetId)!.number}.`,
    );
    if (result.isOffside) s.outcome = "blocked";
  } else if (c.intent === "carry") performCarry(s, id, c.point, c.style);
  else if (c.intent === "shoot") {
    passBeat(s, id, goalie(s, "away").id, "ground", "Decydujesz się na próbę strzału.", true);
    s.finishTeam = team;
    s.outcome = "chance";
  } else if (c.intent === "hold" || c.intent === "wait") {
    holdBeat(
      s,
      id,
      s.world.carrierId === id
        ? "Przytrzymujesz piłkę i obserwujesz."
        : "Zostajesz w pozycji. Akcja toczy się u partnerów.",
      () => repositionWorld(s, 0.8, undefined, true),
      0.8,
    );
    contestHeldBall(s);
  } else {
    const from = { ...s.world.positions[id] };
    moveBeat(
      s,
      id,
      c.point,
      c.intent === "decoy"
        ? "Ruch wiąże rywala i tworzy miejsce dla partnerów."
        : "Zmiana własnej pozycji bez wymuszenia podania zwrotnego.",
      4.5,
      undefined,
      (seconds) =>
        repositionWorld(s, seconds, c.intent === "decoy" ? { id, to: c.point, from } : undefined),
    );
    responseBeat(s, undefined, c.intent === "decoy" ? { id, to: c.point, from } : undefined);
    if (
      c.intent === "press" &&
      teamOf(s, s.world.carrierId) !== team &&
      distance(s.world.positions[id], s.world.positions[s.world.carrierId]) < 3
    ) {
      const owner = s.world.carrierId;
      holdBeat(
        s,
        id,
        "Doskok dosięga piłki.",
        () => {
          s.world.carrierId = id;
          s.world.headings[id] = Math.atan2(
            from.x - s.world.positions[owner].x,
            from.y - s.world.positions[owner].y,
          );
        },
        0.3,
      );
    }
  }
}
export function chooseTacticalJourney(
  previous: JourneySession,
  id: string,
  seconds = 0,
  findAlternative = true,
): JourneySession {
  if (previous.outcome) throw new Error("Nie można dopisać decyzji po końcu akcji.");
  if (id.startsWith("as6:")) {
    const match = /^as6:([a-z0-9-]+):/.exec(id);
    if (!match) throw new Error("Niepoprawny zapis przejęcia partnera.");
    previous = controlTacticalActor(previous, match[1]);
  }
  const controlled = actorId(previous);
  const c = tacticalChoice(previous, id);
  if (!c) throw new Error("Ten wybór nie jest teraz dostępny.");
  const s: JourneySession = {
      ...previous,
      world: copyWorld(previous.world),
      decisions: [...previous.decisions],
      beats: [...previous.beats],
    },
    before = copyWorld(s.world),
    first = s.beats.length;
  performOwn(s, c);
  // Return to the primary player after the one chosen action, before others continue.
  s.controlledId = "you";
  for (let i = 0; i < 2 && !s.outcome && s.world.carrierId !== actorId(s); i++) {
    responseBeat(s);
    autonomousTurn(s);
  }
  let quality = c.quality,
    why = c.why;
  if (
    teamOf(previous, previous.world.carrierId) === "home" &&
    previous.world.carrierId === controlled &&
    teamOf(s, s.world.carrierId) !== "home" &&
    ["pass", "carry", "hold"].includes(c.intent ?? "")
  ) {
    const firstForeign = s.beats.slice(first).find((b) => b.after.carrierId !== controlled);
    if (firstForeign && teamOf(s, firstForeign.after.carrierId) !== "home") {
      quality = "error";
      why = "Własne działanie oddało piłkę rywalowi w pokazanym miejscu.";
    }
  }
  const lastTeamEvent = s.beats.slice(first).find((b) => b.autonomous);
  if (lastTeamEvent)
    why += ` Partnerzy i rywale wybrali dalszą grę samodzielnie: ${lastTeamEvent.text}`;
  const action: JourneyAction =
    c.intent === "shoot"
      ? "finish"
      : c.intent === "hold" || c.intent === "wait"
        ? "wait"
        : c.intent === "decoy"
          ? "move"
          : (c.intent as JourneyAction);
  s.decisions.push({
    index: s.step,
    action,
    choiceId: c.id,
    label: c.label,
    quality,
    why,
    before,
    after: copyWorld(s.world),
    alternative: null,
    firstBeat: first,
    lastBeat: s.beats.length - 1,
    decisionSeconds: Number.isFinite(seconds) ? Math.max(0, Math.min(86400, seconds)) : 0,
    actorId: controlled,
  });
  s.step++;
  if (!s.outcome && s.step >= TACTICAL_TURNS) {
    const owner = s.world.carrierId;
    if (teamOf(s, owner) === "home") {
      const start = previous.initial.positions[previous.initial.carrierId].y;
      s.outcome = start - s.world.positions[owner].y > 12 ? "progress" : "retained";
      if (s.definition.context === 2 && s.outcome === "retained" && quality === "good") {
        s.decisions.at(-1)!.quality = "possible";
        s.decisions.at(-1)!.why +=
          " Przy 0:1 sama kontrola posiadania nie przyniosła jeszcze postępu.";
      }
    } else
      s.outcome =
        quality === "good" && ["cover", "mark"].includes(c.intent ?? "") ? "contained" : "loss";
  }
  if (findAlternative && s.decisions.at(-1)!.quality !== "good") {
    s.decisions.at(-1)!.alternative =
      (previous.rulesVersion === 7
        ? tacticalAlternatives(previous, c).filter((x) => x.quality === "good")
        : tacticalStep(previous)
            .choices.filter(
              (x) => x.id !== id && x.quality === "good" && tacticalGroup(x) === tacticalGroup(c),
            )
            .slice(0, 3)
      ).find(
        (x) =>
          chooseTacticalJourney(previous, x.id, 0, false).decisions.at(-1)?.quality !== "error",
      ) ?? null;
  }
  return s;
}

/** Compare intentions as well as coordinates; bound simulation work per decision. */
export function tacticalAlternatives(s: JourneySession, chosen: JourneyChoice) {
  const candidates = tacticalStep(s).choices.filter(
    (c) => c.id !== chosen.id && c.quality !== "error",
  );
  candidates.sort(
    (a, b) =>
      Number(b.quality === "good") - Number(a.quality === "good") ||
      Number(tacticalGroup(a) === tacticalGroup(chosen)) -
        Number(tacticalGroup(b) === tacticalGroup(chosen)) ||
      Number(a.timing === "delay") - Number(b.timing === "delay"),
  );
  const distinct = new Set<TacticalGroup>();
  const diverse = candidates.filter((c) => {
    const group = tacticalGroup(c);
    if (distinct.has(group)) return false;
    distinct.add(group);
    return true;
  });
  return [...diverse, ...candidates.filter((c) => !diverse.includes(c))].slice(0, 8);
}
