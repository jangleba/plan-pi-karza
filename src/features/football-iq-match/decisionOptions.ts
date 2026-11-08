/** Ready-made options for one decision of the continuous attack (rules v9).
 * Every option is a normal `attackChoice`, so playing it is identical to tapping
 * the same point on the pitch. Labels say only what to do.
 */
import { attackChoice } from "./attackJourney";
import { bound, distance, offside, pressure, segment, teamOf } from "./tacticalWorld";
import type { JourneyChoice, JourneySession } from "./journeyTypes";
import type { PlannedAction, Point } from "./types";

export type DecisionOption = {
  key: string;
  /** Short command, e.g. "Podaj do 10 do przodu". */
  label: string;
  choice: JourneyChoice;
};
export type DecisionSituation = "own" | "partner" | "rival" | "loose";

const MAX_OPTIONS = 4;
/** The engine shortens runs over 32 m; staying below it keeps the saved id stable. */
const MAX_RUN = 31;
function choose(
  s: JourneySession,
  intent: Parameters<typeof attackChoice>[1],
  to: Point,
  targetId?: string,
) {
  const from = s.world.positions[s.controlledId ?? "you"];
  const d = distance(from, to);
  const point =
    ["move", "carry", "cover", "press", "mark"].includes(intent) && d > MAX_RUN
      ? {
          x: from.x + ((to.x - from.x) * MAX_RUN) / d,
          y: from.y + ((to.y - from.y) * MAX_RUN) / d,
        }
      : to;
  return attackChoice(s, intent, point, targetId);
}
const number = (s: JourneySession, id: string) => s.players.find((p) => p.id === id)?.number ?? 0;

export function decisionSituation(
  s: JourneySession,
  actor = s.controlledId ?? "you",
): DecisionSituation {
  if (s.world.looseBall) return "loose";
  if (s.world.carrierId === actor) return "own";
  return teamOf(s, s.world.carrierId) === "home" ? "partner" : "rival";
}

/** One line: what is happening right now. Always derived from the live state. */
export function situationLine(s: JourneySession, actor = s.controlledId ?? "you") {
  const kind = decisionSituation(s, actor);
  const carrier = number(s, s.world.carrierId);
  if (kind === "own") return "Masz piłkę. Wybierz zagranie.";
  if (kind === "partner") return `Piłkę ma partner ${carrier}. Wybierz swój ruch.`;
  if (kind === "rival") return `Piłkę ma rywal ${carrier}. Wybierz, jak bronisz.`;
  return "Piłka jest wolna. Wybierz, co robisz.";
}

/** Clearance of a pass lane (0–12) plus space around the receiver (0–12). */
function laneSafety(s: JourneySession, from: Point, to: Point) {
  const lane = Math.min(
    12,
    ...s.players
      .filter((p) => p.team === "away")
      .map((p) => {
        const line = segment(s.world.positions[p.id], from, to);
        return line.t > 0.05 && line.t < 0.95 ? line.gap : 25;
      }),
  );
  return { lane, space: Math.min(12, pressure(s, to, "home")) };
}

function passLabel(from: Point, to: Point, n: number) {
  if (Math.abs(to.x - from.x) > 34) return `Zmień stronę: podaj do ${n}`;
  if (to.y < from.y - 6) return `Podaj do ${n} do przodu`;
  if (to.y > from.y + 6) return `Podaj do ${n} do tyłu`;
  return `Podaj do ${n}`;
}

/** Point `step` metres toward the rival goal, sliding away from the nearest rival. */
function freeAhead(s: JourneySession, at: Point, step: number) {
  const candidates = [-12, -6, 0, 6, 12].map((dx) => bound(at.x + dx, at.y - step));
  return candidates.reduce((best, p) =>
    pressure(s, p, "home") > pressure(s, best, "home") ? p : best,
  );
}

const laneSafetyScore = (r: { lane: number; space: number }) => r.lane + r.space;

function ownOptions(s: JourneySession, actor: string): DecisionOption[] {
  const at = s.world.positions[actor];
  const out: DecisionOption[] = [];
  const candidates = s.players
    .filter((p) => p.team === "home" && p.id !== actor)
    .map((p) => {
      const to = s.world.positions[p.id];
      const { lane, space } = laneSafety(s, at, to);
      return {
        p,
        to,
        lane,
        space,
        safe: lane >= 4 && space >= 4 && !offside(s, actor, p.id),
        score: lane + space + Math.max(-10, Math.min(20, at.y - to.y)) * 0.6,
      };
    });
  const passes = candidates
    .filter((r) => r.safe && (!r.p.goalkeeper || r.to.y > at.y + 25))
    .sort((a, b) => b.score - a.score);
  // One pass that moves the game on, one that keeps the ball safest (often a lay-off).
  const best = passes[0];
  const safest = passes
    .filter((r) => r !== best)
    .sort((a, b) => laneSafetyScore(b) - laneSafetyScore(a))[0];
  // A tempting pass forward through a tight lane: playable, so the player has to judge the risk.
  const risky = candidates
    .filter(
      (r) =>
        !r.safe &&
        r !== best &&
        r !== safest &&
        !r.p.goalkeeper &&
        r.lane >= 1.5 &&
        r.to.y < at.y - 8 &&
        !offside(s, actor, r.p.id),
    )
    .sort((a, b) => a.to.y - b.to.y)[0];
  for (const r of [best, risky, safest].filter(Boolean))
    out.push({
      key: `pass-${r.p.id}`,
      label: passLabel(at, r.to, r.p.number),
      choice: choose(s, "pass", r.to, r.p.id),
    });
  if (at.y < 40 && !s.players.find((p) => p.id === actor)?.goalkeeper) {
    const keeper = s.players.find((p) => p.team === "away" && p.goalkeeper);
    const kx = keeper ? s.world.positions[keeper.id].x : 50;
    const aim = kx >= 50 ? 44 : 56;
    out.push({
      key: "shoot",
      label: aim < 50 ? "Strzał w lewy róg" : "Strzał w prawy róg",
      choice: choose(s, "shoot", { x: aim, y: 0 }),
    });
  }
  out.push({
    key: "carry",
    label: "Prowadź piłkę w wolne pole",
    choice: choose(s, "carry", freeAhead(s, at, 12)),
  });
  out.push({
    key: "hold",
    label: "Osłoń piłkę",
    choice: choose(s, "hold", at),
  });
  return out;
}

/** Free point between the rival midfield and defensive lines, in the player's half-space. */
function betweenLines(s: JourneySession, at: Point): Point | null {
  const ys = s.players
    .filter((p) => p.team === "away" && !p.goalkeeper)
    .map((p) => s.world.positions[p.id].y)
    .sort((a, b) => a - b);
  if (ys.length < 4) return null;
  const back = (ys[0] + ys[1]) / 2,
    mid = (ys[2] + ys[3]) / 2;
  if (mid - back < 8) return null;
  const y = (back + mid) / 2;
  if (y > at.y + 10) return null;
  const x = at.x < 50 ? 34 : 66;
  return [-6, 0, 6]
    .map((dx) => bound(x + dx, y))
    .reduce((best, p) => (pressure(s, p, "home") > pressure(s, best, "home") ? p : best));
}

function partnerOptions(s: JourneySession, actor: string): DecisionOption[] {
  const at = s.world.positions[actor];
  const ball = s.world.positions[s.world.carrierId];
  const n = number(s, s.world.carrierId);
  // Second-last rival: running beyond it would be offside.
  const line = s.players
    .filter((p) => p.team === "away")
    .map((p) => s.world.positions[p.id].y)
    .sort((a, b) => a - b)[1];
  const forward = freeAhead(s, at, 14);
  const run = bound(forward.x, Math.max(forward.y, line + 1.5));
  // Show for the ball: halfway to the carrier, pick the side with a clear lane.
  const mid = { x: (at.x + ball.x) / 2, y: (at.y + ball.y) / 2 };
  const show = [-8, 0, 8]
    .map((dx) => bound(mid.x + dx, mid.y))
    .reduce((best, p) => {
      const a = laneSafety(s, ball, p),
        b = laneSafety(s, ball, best);
      return a.lane + a.space > b.lane + b.space ? p : best;
    });
  const wide = bound(at.x < 50 ? at.x - 12 : at.x + 12, at.y - 4);
  const pocket = betweenLines(s, at);
  const out: DecisionOption[] = [];
  if (run.y < at.y - 3)
    out.push({
      key: "run",
      label: "Wbiegnij w wolne pole do przodu",
      choice: choose(s, "move", run),
    });
  if (distance(show, at) > 4)
    out.push({
      key: "show",
      label: `Pokaż się do podania od ${n}`,
      choice: choose(s, "move", show),
    });
  if (pocket && distance(pocket, at) > 4 && distance(pocket, show) > 4)
    out.push({
      key: "between",
      label: "Zejdź między linie rywala",
      choice: choose(s, "move", pocket),
    });
  if (distance(wide, at) > 4)
    out.push({
      key: "wide",
      label: "Poszerz grę przy linii",
      choice: choose(s, "move", wide),
    });
  // Already on the touchline: the useful move is inside.
  else
    out.push({
      key: "inside",
      label: "Zejdź bliżej środka",
      choice: choose(s, "move", bound(at.x + Math.sign(50 - at.x) * 12, at.y)),
    });
  out.push({
    key: "wait",
    label: "Zostań na miejscu",
    choice: choose(s, "wait", at),
  });
  return out;
}

function rivalOptions(s: JourneySession, actor: string): DecisionOption[] {
  const at = s.world.positions[actor];
  const ball = s.world.positions[s.world.carrierId];
  const n = number(s, s.world.carrierId);
  const out: DecisionOption[] = [];
  if (s.players.find((p) => p.id === actor)?.goalkeeper) {
    // Keeper: guard the space behind the defence or stay on the line.
    out.push({
      key: "sweep",
      label: "Wyjdź na przedpole",
      choice: choose(
        s,
        "cover",
        bound(at.x + (ball.x - at.x) * 0.3, Math.max(ball.y + 12, at.y - 14)),
      ),
    });
    out.push({ key: "wait", label: "Zostań w bramce", choice: choose(s, "wait", at) });
    return out;
  }
  if (distance(at, ball) < 30)
    out.push({
      key: "press",
      label: `Doskocz do ${n}`,
      choice: choose(s, "press", ball),
    });
  // Two receivers to choose from: the one closest to our goal and the one closest to you.
  const receivers = s.players.filter(
    (p) =>
      p.team === "away" &&
      !p.goalkeeper &&
      p.id !== s.world.carrierId &&
      distance(s.world.positions[p.id], ball) < 40,
  );
  const deepest = [...receivers].sort(
    (a, b) => s.world.positions[b.id].y - s.world.positions[a.id].y || a.id.localeCompare(b.id),
  )[0];
  const nearest = [...receivers].sort(
    (a, b) =>
      distance(s.world.positions[a.id], at) - distance(s.world.positions[b.id], at) ||
      a.id.localeCompare(b.id),
  )[0];
  for (const receiver of [deepest, nearest].filter((r, i, list) => r && list.indexOf(r) === i)) {
    const r = s.world.positions[receiver.id];
    out.push({
      key: `mark-${receiver.id}`,
      label: `Zamknij podanie do ${receiver.number}`,
      choice: choose(s, "mark", {
        x: r.x + (ball.x - r.x) * 0.3,
        y: r.y + (ball.y - r.y) * 0.3,
      }),
    });
  }
  out.push({
    key: "cover",
    label: "Cofnij się za linię piłki",
    choice: choose(s, "cover", bound(at.x + (50 - at.x) * 0.3, Math.max(at.y, ball.y) + 10)),
  });
  // Holding the shape is a real answer too; it fills the list when few rivals are near.
  out.push({ key: "hold", label: "Utrzymaj pozycję", choice: choose(s, "wait", at) });
  return out;
}

function looseOptions(s: JourneySession, actor: string): DecisionOption[] {
  const at = s.world.positions[actor];
  const ball = s.world.looseBall!;
  return [
    {
      key: "chase",
      label: "Biegnij do piłki",
      choice: choose(s, "move", ball),
    },
    {
      key: "cover",
      label: "Zabezpiecz za piłką",
      choice: choose(s, "cover", bound(ball.x, ball.y + 12)),
    },
    {
      key: "wait",
      label: "Zostań na miejscu",
      choice: choose(s, "wait", at),
    },
  ];
}

/** 2–4 distinct, playable options for the controlled player. */
export function decisionOptions(s: JourneySession): DecisionOption[] {
  if (s.rulesVersion !== 9 || s.outcome) return [];
  const actor = s.controlledId ?? "you";
  const kind = decisionSituation(s, actor);
  const raw =
    kind === "own"
      ? ownOptions(s, actor)
      : kind === "partner"
        ? partnerOptions(s, actor)
        : kind === "rival"
          ? rivalOptions(s, actor)
          : looseOptions(s, actor);
  const seen = new Set<string>();
  return raw.filter((o) => !seen.has(o.choice.id) && !!seen.add(o.choice.id)).slice(0, MAX_OPTIONS);
}

/** Tactics-board marker colours, readable on the green pitch and distinct from both kits. */
export const OPTION_MARKS = [
  { letter: "A", color: "#ffd84d" },
  { letter: "B", color: "#ffffff" },
  { letter: "C", color: "#ff7ad9" },
  { letter: "D", color: "#8ee86b" },
] as const;

/** Arrows for the options, like chalk on a tactics board. With a selection only that arrow stays. */
export function optionPaths(
  s: JourneySession,
  options: DecisionOption[],
  selectedKey?: string | null,
): PlannedAction[] {
  const actor = s.controlledId ?? "you";
  const from = s.world.positions[actor];
  return options.flatMap((o, i): PlannedAction[] => {
    if (selectedKey && o.key !== selectedKey) return [];
    const to = o.choice.point;
    if (distance(from, to) < 1) return [];
    const color: string = OPTION_MARKS[i % OPTION_MARKS.length].color;
    const intent = o.choice.intent;
    const base = { id: `option-${o.key}`, playerId: actor, from, to, analysisColor: color };
    if (intent === "pass")
      return [{ ...base, type: "pass" as const, targetId: o.choice.targetId ?? "space" }];
    if (intent === "shoot") return [{ ...base, type: "shot" as const }];
    const type =
      intent === "carry" || intent === "press" || intent === "cover" || intent === "mark"
        ? intent
        : ("run" as const);
    return [{ ...base, type }];
  });
}
