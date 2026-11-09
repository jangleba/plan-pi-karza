/** Grades the controlled player's OWN contribution to one decision of the
 * continuous attack (rules v9), against the goal of the lesson.
 *
 * The team result is not TY's grade: a partner's lost pass does not make TY's
 * run wrong, and a well-placed shot that the keeper saves is still a good shot.
 * Everything here is measured from the saved worlds before/after the decision
 * and from the typed events of its live simulation, so a replay of the same
 * choices always produces the same assessment.
 *
 * Texts are tactical only: where and when to be relative to the ball, the
 * rivals, the defensive line and free space.
 */
import { iqSources, situationFor, type SourceId } from "./situationBank";
import { distance, segment } from "./tacticalWorld";
import type {
  JourneyChoice,
  JourneyDefinition,
  JourneyEvent,
  JourneyQuality,
  JourneySession,
  JourneyWorld,
} from "./journeyTypes";
import type { Point } from "./types";

export type LessonAim =
  | "progress"
  | "switch"
  | "counter"
  | "finish"
  | "space"
  | "run-behind"
  | "box"
  | "close-lane"
  | "press"
  | "cover"
  | "delay"
  | "sweep"
  | "recover";

/** What the lesson asks of TY in each hand-placed situation. */
const SITUATION_AIMS: Record<string, LessonAim> = {
  counter: "counter",
  "gk-build": "progress",
  cross: "box",
  "counter-press": "press",
  "low-block": "space",
  "wide-1v1": "progress",
  "defend-centre": "cover",
  "hold-up": "progress",
  "fullback-overlap": "space",
  "gk-switch": "switch",
  "gk-sweep": "sweep",
  "gk-counter": "counter",
  "cb-carry": "progress",
  "cb-step-out": "close-lane",
  "fb-inverted": "space",
  "fb-2v1": "delay",
  "six-pivot": "space",
  "six-screen": "close-lane",
  "six-switch": "switch",
  "eight-third-man": "space",
  "eight-box": "box",
  "ten-turn": "progress",
  "ten-press": "press",
  "wing-press": "close-lane",
  "nine-press": "press",
  "nine-depth": "run-behind",
};

export function lessonAim(def: JourneyDefinition): LessonAim {
  const key = def.topicId.startsWith("iqs-") ? def.topicId.slice(4) : "";
  if (SITUATION_AIMS[key]) return SITUATION_AIMS[key];
  if (def.concept === "press-cover") return "press";
  if (def.concept === "overload-switch") return "switch";
  return "progress";
}

export type DecisionKind = "own" | "partner" | "rival" | "loose";
export type ContributionProblem =
  | "lane-closed"
  | "offside-pass"
  | "no-progress"
  | "stayed-crowded"
  | "carried-into-pressure"
  | "long-shot"
  | "shot-angle"
  | "pass-not-reached"
  | "offside-run"
  | "receiver-lane-closed"
  | "marked"
  | "no-run"
  | "outside-box"
  | "far-from-ball"
  | "bypassed"
  | "lane-open"
  | "rival-behind"
  | "too-deep"
  | "lost-race"
  | "held-too-long";

export type DecisionFacts = {
  kind: DecisionKind;
  aim: LessonAim;
  intent: JourneyChoice["intent"];
  /** Where TY aimed the action (the tapped point). */
  point: Point;
  targetNumber?: number;
  keeper: boolean;
  /** Ball in the final third at the start (crossing and finishing zone). */
  finalThird: boolean;
  start: Point;
  end: Point;
  /** Metres TY moved. */
  moved: number;
  /** Ball metres toward the rival goal during the decision (negative: backwards). */
  gain: number;
  /** Outfield rivals the ball got past during the decision. */
  bypassed: number;
  switched: boolean;
  passResult?: "completed" | "intercepted" | "offside" | "loose" | "space-lost";
  receiverNumber?: number;
  interceptorNumber?: number;
  shot?: {
    metres: number;
    result: "goal" | "save" | "block" | "miss" | "none";
  };
  /** Free metres of the carrier → TY pass lane (no rival closer to its track). */
  laneBefore: number;
  laneAfter: number;
  /** Off the ball: lane and space were measured when the partner played the ball. */
  atPartnerKick: boolean;
  /** Metres to the nearest rival. */
  spaceBefore: number;
  spaceAfter: number;
  carrierNumber?: number;
  received: boolean;
  youOffside: boolean;
  lostByYou: boolean;
  wonByYou: boolean;
  conceded: boolean;
  /** Rival game: TY between the ball and our goal. */
  goalSide: boolean;
  toBall: number;
  /** Rival game: forward passes TY's position closes. */
  lanesClosed: number;
  closedNumbers: number[];
  inBox: boolean;
  /** Rival game: rivals further from their goal than TY (behind TY). */
  rivalsBehind: number;
  /** Keeper: metres to our deepest outfield player. */
  gapToDefence: number;
  markerFollowed?: { number: number; metres: number };
};

export type DecisionAssessment = {
  index: number;
  grade: JourneyQuality;
  problem: ContributionProblem | null;
  facts: DecisionFacts;
  /** What TY chose. */
  did: string;
  /** What really happened, from the simulation events. */
  happened: string;
  /** Why it mattered: a conditional principle with the measured value. */
  why: string;
  /** One tactical task for next time, chosen from the detected problem. */
  task: string;
  /** How the nearest rival reacted to TY, when the simulation recorded it. */
  rivalReaction: string | null;
  source: { label: string; url: string };
};

// Rounded down, so a value shown as "4 m" never fails a "4 m" threshold.
const metres = (n: number) => `${Math.max(0, Math.floor(n))} m`;
function parseChoice(id: string) {
  const m = /^attack9:[^:]+:([a-z]+):[^:]+:[^:]+:(-?[\d.]+):(-?[\d.]+):(.+)$/.exec(id);
  return {
    intent: (m?.[1] ?? "wait") as JourneyChoice["intent"],
    point: m ? { x: Number(m[2]), y: Number(m[3]) } : null,
    targetId: m && m[4] !== "space" ? m[4] : undefined,
  };
}

function teamOfId(s: JourneySession, id: string) {
  return s.players.find((p) => p.id === id)?.team;
}
function numberOf(s: JourneySession, id: string | undefined) {
  return s.players.find((p) => p.id === id)?.number;
}
function ballAt(w: JourneyWorld): Point {
  return w.looseBall ?? w.positions[w.carrierId];
}
const outfieldRivals = (s: JourneySession) =>
  s.players.filter((p) => p.team === "away" && !p.goalkeeper);

/** Clearance of the lane from `from` to `to` in world `w` (metres, capped at 12).
 * A rival pressing the passer (within 3 m of the ball) is pressure, not a lane block. */
function laneClearance(s: JourneySession, w: JourneyWorld, from: Point, to: Point) {
  return Math.min(
    12,
    ...s.players
      .filter((p) => p.team === "away" && distance(w.positions[p.id], from) > 3)
      .map((p) => {
        const line = segment(w.positions[p.id], from, to);
        return line.t > 0.05 && line.t < 0.95 ? line.gap : 25;
      }),
  );
}
const nearestRival = (s: JourneySession, w: JourneyWorld, at: Point) =>
  Math.min(
    ...s.players.filter((p) => p.team === "away").map((p) => distance(w.positions[p.id], at)),
  );

/** Facts about TY's decision `index`, measured from the saved worlds and events. */
export function decisionFacts(session: JourneySession, index: number): DecisionFacts {
  const d = session.decisions[index];
  const you = d.actorId ?? "you";
  const before = d.before,
    after = d.after;
  const events: JourneyEvent[] = session.beats
    .slice(d.firstBeat, d.lastBeat + 1)
    .flatMap((b) => b.events ?? []);
  const parsed = parseChoice(d.choiceId),
    intent = parsed.intent;
  const kind: DecisionKind = before.looseBall
    ? "loose"
    : before.carrierId === you
      ? "own"
      : teamOfId(session, before.carrierId) === "home"
        ? "partner"
        : "rival";
  const start = before.positions[you],
    end = after.positions[you];
  const ballBefore = ballAt(before);
  const typed = (type: JourneyEvent["type"]) => events.find((e) => e.type === type);
  const shotEvent = typed("shot");
  const yourShot = shotEvent?.actorId === you;
  const interception = events.find((e) => e.type === "interception");
  const offsideEvent = typed("offside");
  const reception = events.find(
    (e) => (e.type === "reception" || e.type === "space-won") && e.targetId === you,
  );
  // The first thing that happens to TY's own pass; later team play is not TY's pass.
  const passOutcome = events.find((e) =>
    ["reception", "space-won", "interception", "space-lost", "loose"].includes(e.type ?? ""),
  );
  // TY's own pass is measured when it arrives, not after the partner's next touch.
  const arrival =
    kind === "own" &&
    passOutcome &&
    (passOutcome.type === "reception" || passOutcome.type === "space-won")
      ? session.beats
          .slice(d.firstBeat, d.lastBeat + 1)
          .flatMap((b) => b.live ?? [])
          .find((frame) => frame.time >= passOutcome.time)?.world
      : undefined;
  const measured = arrival ?? after,
    ballAfter = ballAt(measured);
  const passedRivals = outfieldRivals(session).filter((p) => {
    const was = before.positions[p.id].y,
      now = measured.positions[p.id].y;
    return was < ballBefore.y && now > ballAfter.y;
  }).length;
  let passResult: DecisionFacts["passResult"];
  if (kind === "own" && intent === "pass")
    passResult =
      offsideEvent?.targetId === you
        ? "offside"
        : passOutcome?.type === "interception"
          ? "intercepted"
          : passOutcome?.type === "space-lost"
            ? "space-lost"
            : passOutcome?.type === "reception" || passOutcome?.type === "space-won"
              ? "completed"
              : "loose";
  const shotResult = !yourShot
    ? undefined
    : typed("goal")
      ? "goal"
      : typed("save")
        ? "save"
        : typed("block")
          ? "block"
          : typed("miss")
            ? "miss"
            : "none";
  // Lane from the ball carrier to TY: the carrier at the end when we still have it.
  const carrierAfter =
    teamOfId(session, after.carrierId) === "home" && !after.looseBall
      ? after.carrierId
      : before.carrierId;
  const laneBefore =
    kind === "partner"
      ? laneClearance(session, before, before.positions[before.carrierId], start)
      : 0;
  // Without the ball, what matters is whether TY was open when the partner played the ball.
  const partnerKick =
    kind === "partner"
      ? events.find(
          (e) =>
            (e.type === "kick" || e.type === "shot") &&
            e.actorId !== you &&
            teamOfId(session, e.actorId ?? "") === "home",
        )
      : undefined;
  const kickWorld = partnerKick
    ? session.beats
        .slice(d.firstBeat, d.lastBeat + 1)
        .flatMap((b) => b.live ?? [])
        .find((frame) => frame.time >= partnerKick.time)?.world
    : undefined;
  const offBall = kickWorld ?? after,
    passer = partnerKick?.actorId ?? carrierAfter,
    offBallAt = offBall.positions[you];
  const laneAfter =
    kind === "partner" && passer !== you
      ? laneClearance(session, offBall, offBall.positions[passer], offBallAt)
      : laneBefore;
  // Rival game: the rival with the ball at the end (or the one who had it before).
  const rivalCarrier =
    teamOfId(session, after.carrierId) === "away" ? after.carrierId : before.carrierId;
  const rivalBall = after.looseBall ?? after.positions[rivalCarrier];
  const goalSide = end.y > rivalBall.y + 0.5;
  const receivers = outfieldRivals(session).filter((p) => p.id !== rivalCarrier);
  const closed = receivers.filter((p) => {
    const line = segment(end, rivalBall, after.positions[p.id]);
    return line.t > 0.1 && line.t < 0.92 && line.gap < 3;
  });
  const defenders = session.players.filter(
    (p) => p.team === "home" && !p.goalkeeper && p.id !== you,
  );
  const deepest = Math.max(...defenders.map((p) => after.positions[p.id].y));
  const markerEvent = events.find((e) => e.type === "marker" && e.targetId === you);
  const conceded = events.some(
    (e) => e.type === "goal" && teamOfId(session, e.actorId ?? "") === "away",
  );
  return {
    kind,
    aim: lessonAim(session.definition),
    intent,
    point: parsed.point ?? end,
    targetNumber: numberOf(session, parsed.targetId),
    keeper: !!session.players.find((p) => p.id === you)?.goalkeeper,
    finalThird: ballBefore.y < 40,
    start,
    end,
    moved: distance(start, end),
    gain: ballBefore.y - ballAfter.y,
    bypassed: passedRivals,
    switched: Math.abs(ballAfter.x - ballBefore.x) > 30,
    passResult,
    receiverNumber: numberOf(
      session,
      reception?.actorId ?? (passResult ? after.carrierId : undefined),
    ),
    interceptorNumber: numberOf(
      session,
      passResult === "intercepted" ? passOutcome?.actorId : interception?.actorId,
    ),
    shot: yourShot
      ? { metres: distance(start, { x: 50, y: 0 }), result: shotResult ?? "none" }
      : undefined,
    laneBefore,
    laneAfter,
    spaceBefore: nearestRival(session, before, start),
    spaceAfter:
      kind === "partner"
        ? nearestRival(session, offBall, offBallAt)
        : nearestRival(session, after, end),
    carrierNumber: numberOf(session, kind === "partner" ? passer : rivalCarrier),
    atPartnerKick: !!kickWorld,
    received: events.some(
      (e) => (e.type === "reception" || e.type === "space-won") && e.actorId === you,
    ),
    youOffside: offsideEvent?.actorId === you,
    lostByYou:
      passResult === "intercepted" ||
      passResult === "space-lost" ||
      events.some((e) => e.type === "tackle" && e.targetId === you),
    wonByYou: events.some(
      (e) =>
        e.actorId === you &&
        (e.type === "interception" ||
          e.type === "tackle" ||
          e.type === "recovery" ||
          e.type === "save"),
    ),
    conceded,
    goalSide,
    toBall: distance(end, rivalBall),
    lanesClosed: closed.length,
    closedNumbers: closed.map((p) => p.number),
    inBox: end.y <= 22 && end.x >= 30 && end.x <= 70,
    rivalsBehind: outfieldRivals(session).filter((p) => after.positions[p.id].y > end.y + 1).length,
    gapToDefence: Math.abs(end.y - deepest),
    markerFollowed: markerEvent
      ? {
          number: numberOf(session, markerEvent.actorId) ?? 0,
          metres: distance(
            before.positions[markerEvent.actorId!],
            after.positions[markerEvent.actorId!],
          ),
        }
      : undefined,
  };
}

/** The aim that applies in this phase: an attacking lesson still asks for defending after a loss. */
function phaseAim(f: DecisionFacts, keeper: boolean): LessonAim {
  const a = f.aim;
  if (f.kind === "loose") return "recover";
  if (f.kind === "own") {
    if (["progress", "switch", "counter", "finish"].includes(a)) return a;
    return a === "box" || a === "run-behind" ? "finish" : "progress";
  }
  if (f.kind === "partner") {
    if (["space", "run-behind", "box"].includes(a)) return a;
    return a === "counter" ? "run-behind" : "space";
  }
  if (keeper) return "sweep";
  return ["close-lane", "press", "cover", "delay"].includes(a) ? a : "close-lane";
}

type Grade = { grade: JourneyQuality; problem: ContributionProblem | null };
const good: Grade = { grade: "good", problem: null };
const possible = (problem: ContributionProblem): Grade => ({ grade: "possible", problem });
const error = (problem: ContributionProblem): Grade => ({ grade: "error", problem });

function grade(f: DecisionFacts, aim: LessonAim): Grade {
  if (f.kind === "own") {
    if (f.shot) {
      if (f.shot.result === "goal") return good;
      if (f.shot.metres > 26) return error("long-shot");
      // A shot from a good place is a good decision even when the keeper saves it.
      return f.shot.metres <= 18 && Math.abs(f.start.x - 50) <= 12 ? good : possible("shot-angle");
    }
    if (f.passResult === "offside") return error("offside-pass");
    if (f.passResult === "intercepted" || f.passResult === "space-lost")
      return error("lane-closed");
    if (f.lostByYou) return error(f.intent === "hold" ? "held-too-long" : "carried-into-pressure");
    if (f.passResult === "loose") return possible("pass-not-reached");
    if (aim === "switch") return f.switched || f.bypassed >= 2 ? good : possible("stayed-crowded");
    if (f.bypassed >= 1 || f.gain >= 8) return good;
    // Keeping the ball under close pressure is the right answer when nothing is open.
    if (f.spaceBefore < 4 && f.gain > -15) return good;
    return possible("no-progress");
  }
  if (f.kind === "partner") {
    if (f.youOffside) return error("offside-run");
    if (f.received) return good;
    if (aim === "run-behind") {
      if (f.start.y - f.end.y < 6) return possible("no-run");
      return f.laneAfter >= 3 ? good : possible("receiver-lane-closed");
    }
    // Arriving in the box matters once the ball is in the final third.
    if (aim === "box" && f.finalThird)
      return f.inBox && f.spaceAfter >= 3.5 ? good : possible("outside-box");
    if (f.laneAfter < 4) return possible("receiver-lane-closed");
    if (f.spaceAfter < 4) return possible("marked");
    return good;
  }
  if (f.kind === "rival") {
    if (f.wonByYou) return good;
    if (f.conceded && !f.goalSide && f.toBall < 15) return error("bypassed");
    if (aim === "sweep") return f.gapToDefence <= 22 ? good : possible("too-deep");
    if (aim === "press") {
      if (f.toBall <= 5) return f.goalSide ? good : possible("bypassed");
      return possible("far-from-ball");
    }
    if (aim === "delay") {
      if (!f.goalSide) return error("bypassed");
      return f.toBall <= 9 && f.gain > -8 ? good : possible("far-from-ball");
    }
    if (aim === "cover") {
      if (f.rivalsBehind > 0 && !f.lanesClosed) return possible("rival-behind");
      return f.goalSide ? good : error("bypassed");
    }
    // close-lane
    if (f.lanesClosed > 0) return good;
    return possible("lane-open");
  }
  // Loose ball
  if (f.wonByYou) return good;
  if (f.intent === "wait" && f.spaceBefore > 0 && f.moved < 2) return possible("lost-race");
  return good;
}

function direction(from: Point, to: Point) {
  const dy = from.y - to.y,
    dx = to.x - from.x;
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return "w bok";
  return dy >= 0 ? "do przodu" : "do tyłu";
}
/** What TY did, in words, from the saved choice. */
function didText(f: DecisionFacts) {
  const len = distance(f.start, f.point);
  const nr = f.targetNumber ? ` do nr ${f.targetNumber}` : " w wolne pole";
  switch (f.intent) {
    case "pass":
      return Math.abs(f.point.x - f.start.x) > 34
        ? `Zmieniłeś stronę podaniem${nr}.`
        : `Podałeś${nr} ${direction(f.start, f.point)}.`;
    case "carry":
      return `Wprowadziłeś piłkę ${metres(len)} ${direction(f.start, f.point)}.`;
    case "shoot":
      return `Uderzyłeś na bramkę z ${metres(f.shot?.metres ?? len)}.`;
    case "hold":
      return "Osłoniłeś piłkę.";
    case "wait":
      return "Zostałeś na miejscu.";
    case "press":
      return f.carrierNumber ? `Doskoczyłeś do nr ${f.carrierNumber}.` : "Doskoczyłeś do piłki.";
    case "mark":
      return "Przesunąłeś się na tor podania rywala.";
    case "cover":
      return f.keeper
        ? `Wyszedłeś ${metres(len)} przed bramkę.`
        : `Cofnąłeś się ${metres(len)} za linię piłki.`;
    default:
      return `Przesunąłeś się ${metres(len)} ${direction(f.start, f.point)}.`;
  }
}

function happenedText(f: DecisionFacts): string {
  const n = (x?: number) => (x ? `nr ${x}` : "partner");
  if (f.kind === "own") {
    if (f.shot) {
      const where = `z ${metres(f.shot.metres)}`;
      if (f.shot.result === "goal") return `Strzał ${where} — gol.`;
      if (f.shot.result === "save") return `Strzał ${where}. Bramkarz broni.`;
      if (f.shot.result === "block") return `Strzał ${where}. Obrońca blokuje uderzenie.`;
      if (f.shot.result === "miss") return `Strzał ${where} mija bramkę.`;
      return `Strzał ${where}.`;
    }
    if (f.passResult === "offside")
      return "Odbiorca był za przedostatnim rywalem w chwili podania — spalony.";
    if (f.passResult === "intercepted") return `Nr ${f.interceptorNumber ?? "?"} przecina podanie.`;
    if (f.passResult === "space-lost") return "Rywal pierwszy dochodzi do podania w wolne pole.";
    if (f.passResult === "loose") return "Piłka zostaje wolna, nikt jej od razu nie przejmuje.";
    if (f.lostByYou) return "Rywal doskakuje i odbiera piłkę.";
    const past =
      f.bypassed > 0 ? ` Piłka mija ${f.bypassed} ${f.bypassed === 1 ? "rywala" : "rywali"}.` : "";
    const ahead =
      f.gain >= 2
        ? `${metres(f.gain)} bliżej bramki rywala`
        : f.gain <= -2
          ? `${metres(-f.gain)} dalej od bramki rywala`
          : "na tej samej wysokości";
    if (f.passResult === "completed")
      return `${n(f.receiverNumber)} przyjmuje podanie ${ahead}.${past}`.replace(/^n/, "N");
    return `Drużyna zostaje przy piłce, ${ahead}.${past}`;
  }
  if (f.kind === "partner") {
    if (f.youOffside) return "Byłeś za przedostatnim rywalem w chwili podania — spalony.";
    if (f.received) return `Dostajesz podanie od ${n(f.carrierNumber)}.`;
    const when = f.atPartnerKick
      ? `W chwili zagrania ${n(f.carrierNumber)} tor do Ciebie`
      : `Po Twoim ruchu tor podania od ${n(f.carrierNumber)}`;
    return `${when} miał ${metres(f.laneAfter)} wolnego, a najbliższy rywal stał ${metres(f.spaceAfter)} od Ciebie.`;
  }
  if (f.kind === "rival") {
    if (f.wonByYou) return "Odbierasz piłkę rywalowi.";
    const closes = f.lanesClosed
      ? `zamykasz podanie do ${f.closedNumbers.map((x) => `nr ${x}`).join(" i ")}`
      : "nie zamykasz żadnego podania";
    return `Jesteś ${metres(f.toBall)} od piłki, ${f.goalSide ? "między piłką a naszą bramką" : "przed piłką (rywal ma ją za Tobą)"}, ${closes}.`;
  }
  return f.wonByYou ? "Pierwszy dochodzisz do wolnej piłki." : "Wolną piłkę zbiera inny zawodnik.";
}

const WHY: Record<ContributionProblem | "good", (f: DecisionFacts) => string> = {
  good: () => "",
  "lane-closed": (f) =>
    `Podanie przechodzi bezpiecznie, gdy na jego torze nie stoi rywal. Tu nr ${f.interceptorNumber ?? "rywala"} zdążył wejść w tor.`,
  "offside-pass": () =>
    "Podanie do przodu jest dozwolone, gdy odbiorca w chwili zagrania nie jest bliżej bramki niż przedostatni rywal i piłka.",
  "no-progress": (f) =>
    `Najbliższy rywal stał ${metres(f.spaceBefore)} od Ciebie, więc był czas, żeby zagrać do przodu albo wprowadzić piłkę. Tu piłka ${f.gain <= -2 ? "cofnęła się" : "nie przesunęła się"} w stronę bramki rywala.`,
  "stayed-crowded": () =>
    "Zmiana strony daje przewagę, gdy rywale przesunęli się do piłki, a po drugiej stronie jest wolne miejsce.",
  "carried-into-pressure": () =>
    "Prowadzenie piłki opłaca się, gdy przed Tobą jest wolne pole. Gdy rywal zamyka kierunek, szybciej działa podanie.",
  "long-shot": (f) =>
    `Strzał z ${metres(f.shot?.metres ?? 0)} rzadko kończy się golem, gdy obok jest partner bliżej bramki.`,
  "shot-angle": () =>
    "Strzał z boku pola karnego ma mały kąt. Gdy partner jest bliżej środka, podanie daje lepszą szansę.",
  "pass-not-reached": () =>
    "Podanie w wolne pole działa, gdy partner dobiega do piłki przed rywalem.",
  "offside-run": () =>
    "Bieg za obrońców jest dozwolony, gdy w chwili podania jesteś najdalej na linii przedostatniego rywala.",
  "receiver-lane-closed": (f) =>
    `Partner zagra do Ciebie, gdy tor podania jest wolny na około 4 m. Tu było ${metres(f.laneAfter)}.`,
  marked: (f) =>
    `Przyjęcie jest łatwiejsze, gdy najbliższy rywal stoi dalej niż około 4 m. Tu był ${metres(f.spaceAfter)} od Ciebie.`,
  "no-run": () =>
    "Wbiegnięcie za obrońców działa, gdy ruszasz w chwili podania i masz wolny tor do piłki.",
  "outside-box": () =>
    "Przy dośrodkowaniu szansę daje strefa w polu karnym, której żaden obrońca nie zamyka.",
  "far-from-ball": (f) =>
    `Nacisk działa, gdy jesteś blisko piłki. Tu było ${metres(f.toBall)}, więc rywal miał czas na podanie.`,
  bypassed: () =>
    "Gdy rywal z piłką mija Cię, za Tobą zostaje wolne miejsce. Stań między piłką a bramką.",
  "lane-open": () =>
    "Gdy nie możesz dojść do piłki, ustaw się na torze podania do rywala, który stoi bliżej naszej bramki.",
  "rival-behind": (f) =>
    `Asekuracja działa, gdy żaden rywal nie stoi za Tobą. Tu ${f.rivalsBehind === 1 ? "1 rywal stał" : `${f.rivalsBehind} rywali stało`} bliżej naszej bramki niż Ty.`,
  "too-deep": (f) =>
    `Bramkarz asekuruje wysoką linię obrony, gdy stoi blisko niej. Tu dzieliło Cię od niej ${metres(f.gapToDefence)}.`,
  "lost-race": () => "Wolną piłkę zbiera ten, kto ruszy pierwszy. Czekanie oddaje ją rywalowi.",
  "held-too-long": () =>
    "Osłanianie piłki działa krótko. Gdy dochodzi drugi rywal, szybciej działa podanie.",
};

const GOOD_WHY: Record<DecisionKind, (f: DecisionFacts) => string> = {
  own: (f) =>
    f.shot
      ? "Strzał z dobrego miejsca to dobra decyzja, nawet gdy bramkarz obroni."
      : f.bypassed > 0
        ? "Podanie, które mija rywali, zostawia ich za piłką i daje drużynie przewagę."
        : "Piłka zostaje w drużynie i przesuwa się w stronę bramki rywala.",
  partner: (f) =>
    f.received
      ? "Byłeś wolny na czystym torze podania, więc partner mógł zagrać do Ciebie."
      : "Wolny tor podania i miejsce wokół Ciebie dają partnerowi bezpieczną opcję.",
  rival: (f) =>
    f.wonByYou
      ? "Odbiór blisko piłki od razu daje drużynie atak."
      : f.lanesClosed
        ? "Zamknięte podanie zmusza rywala do gry tam, gdzie nie robi przewagi."
        : "Stoisz między piłką a naszą bramką, więc rywal nie gra za Twoje plecy.",
  loose: () => "Pierwszy przy wolnej piłce decyduje, kto atakuje.",
};

const TASK: Record<ContributionProblem, string> = {
  "lane-closed":
    "Zanim podasz, sprawdź, czy żaden rywal nie stoi blisko toru podania. Jeśli stoi, wybierz innego partnera.",
  "offside-pass":
    "Podawaj do przodu do partnera, który w chwili podania jest najdalej na linii przedostatniego rywala.",
  "no-progress": "Gdy rywal jest daleko, zagraj do przodu albo wprowadź piłkę w wolne pole.",
  "stayed-crowded":
    "Gdy rywale przesuwają się do piłki, przenieś grę na wolną stronę w najwyżej 2 podaniach.",
  "carried-into-pressure": "Prowadź piłkę tylko w wolne pole. Gdy rywal zamyka kierunek, podaj.",
  "long-shot": "Z daleka szukaj podania do partnera bliżej bramki zamiast strzału.",
  "shot-angle": "Z boku pola karnego sprawdź partnera bliżej środka, zanim uderzysz.",
  "pass-not-reached": "Podawaj w wolne pole tam, gdzie partner dobiegnie przed rywalem.",
  "offside-run": "W chwili podania bądź najdalej na linii przedostatniego rywala, potem ruszaj.",
  "receiver-lane-closed": "Ustaw się tak, żeby między Tobą a piłką nie stał żaden rywal.",
  marked: "Odejdź od kryjącego rywala w wolne miejsce, zanim partner będzie gotowy do podania.",
  "no-run": "Ruszaj za obrońców w chwili podania, w wolny korytarz między nimi.",
  "outside-box": "Wbiegaj w strefę pola karnego, której żaden obrońca nie zamyka.",
  "far-from-ball":
    "Doskakuj do piłki, gdy partner stoi za Tobą jako asekuracja, i zamknij podanie do środka.",
  bypassed: "Gdy rywal ma piłkę, stań między nim a naszą bramką, zanim do niego doskoczysz.",
  "lane-open": "Ustaw się na torze podania do rywala, który stoi najbliżej naszej bramki.",
  "rival-behind": "Cofnij się tak, żeby żaden rywal nie stał bliżej naszej bramki niż Ty.",
  "too-deep": "Stój blisko wysokiej linii obrony, żeby przejąć podanie za plecy obrońców.",
  "lost-race": "Do wolnej piłki ruszaj od razu, gdy jesteś bliżej niż rywal.",
  "held-too-long": "Gdy rywal doskakuje, podaj do wolnego partnera, zanim dojdzie drugi rywal.",
};

const KEEP_GOING: Record<DecisionKind, string> = {
  own: "Dalej szukaj podania, które mija rywali.",
  partner: "Dalej ustawiaj się na wolnym torze podania.",
  rival: "Dalej stój między piłką a naszą bramką i zamykaj podanie do przodu.",
  loose: "Dalej ruszaj pierwszy do wolnej piłki.",
};

/** The principle's source: offside → IFAB; otherwise the lesson's own sources. */
function sourceFor(session: JourneySession, problem: ContributionProblem | null) {
  const id: SourceId =
    problem === "offside-pass" || problem === "offside-run"
      ? "ifab"
      : (situationFor(session.definition)?.sources[0] ?? "fa-dna");
  return iqSources[id];
}

export function assessDecision(session: JourneySession, index: number): DecisionAssessment {
  const facts = decisionFacts(session, index);
  const { grade: g, problem } = grade(facts, phaseAim(facts, facts.keeper));
  const reaction = facts.markerFollowed
    ? `Nr ${facts.markerFollowed.number} poszedł za Tobą (${metres(facts.markerFollowed.metres)}) i zostawił miejsce, z którego wyszedł.`
    : null;
  return {
    index,
    grade: g,
    problem,
    facts,
    did: didText(facts),
    happened: happenedText(facts),
    why: problem ? WHY[problem](facts) : GOOD_WHY[facts.kind](facts),
    task: problem ? TASK[problem] : KEEP_GOING[facts.kind],
    rivalReaction: reaction,
    source: sourceFor(session, problem),
  };
}

export function assessAction(session: JourneySession): DecisionAssessment[] {
  return session.decisions.map((_, i) => assessDecision(session, i));
}

/** The moment worth looking at: the first error, else the first "can be better", else the last good one. */
export function keyMoment(list: DecisionAssessment[]): DecisionAssessment | null {
  return (
    list.find((a) => a.grade === "error") ??
    list.find((a) => a.grade === "possible") ??
    list.at(-1) ??
    null
  );
}

/** Counts per grade of TY's own decisions. */
export function contributionCounts(list: DecisionAssessment[]) {
  return {
    good: list.filter((a) => a.grade === "good").length,
    possible: list.filter((a) => a.grade === "possible").length,
    error: list.filter((a) => a.grade === "error").length,
  };
}

/** Start time (s) and end time of decision `index` on the action timeline. */
export function momentRange(session: JourneySession, index: number) {
  const d = session.decisions[index];
  const from = session.beats.slice(0, d.firstBeat).reduce((n, b) => n + b.duration, 0);
  const to =
    from + session.beats.slice(d.firstBeat, d.lastBeat + 1).reduce((n, b) => n + b.duration, 0);
  return { from, to };
}
