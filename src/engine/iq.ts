/**
 * IQ: silnik decyzji w sytuacji boiskowej. Współrzędne w metrach:
 * x – wzdłuż boiska (atak w stronę x = 105), y – w poprzek (0–68).
 * Model oceny jest uproszczony (prototyp): reguły, nie dane meczowe.
 */
export interface Vec { x: number; y: number }

export interface Mate {
  id: string;
  name: string;
  start: Vec;
  end: Vec;
  /** Opóźnienie startu biegu (s) i prędkość (m/s). */
  delay: number;
  speed: number;
}

export interface Scenario {
  id: string;
  title: string;
  brief: string;
  player: Vec;
  mates: Mate[];
  /** Linia obrony (bez bramkarza). */
  backLine: Vec[];
  /** Obrońcy doskakujący do piłkarza z prędkością `pressSpeed`. */
  pressers: Vec[];
  pressSpeed: number;
  keeper: Vec;
}

export const GOAL = { x: 105, y: 34, width: 7.32 } as const;

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function matePos(m: Mate, t: number): Vec {
  const total = dist(m.start, m.end);
  const run = Math.max(0, t - m.delay) * m.speed;
  if (total === 0 || run <= 0) return m.start;
  const k = Math.min(1, run / total);
  return { x: m.start.x + (m.end.x - m.start.x) * k, y: m.start.y + (m.end.y - m.start.y) * k };
}

export interface Snapshot {
  t: number;
  ball: Vec;
  mates: Array<{ id: string; name: string; pos: Vec }>;
  defenders: Vec[];
  keeper: Vec;
}

function towards(from: Vec, to: Vec, step: number): Vec {
  const d = dist(from, to);
  if (d <= 1) return from;
  const k = Math.min(step, d - 1) / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

export function snapshotAt(s: Scenario, t: number, player: Vec): Snapshot {
  return {
    t,
    ball: player,
    mates: s.mates.map((m) => ({ id: m.id, name: m.name, pos: matePos(m, t) })),
    defenders: [...s.backLine, ...s.pressers.map((p) => towards(p, player, s.pressSpeed * t))],
    keeper: s.keeper,
  };
}

/** Czy obrońca `d` zasłania tor od `a` do `b` – obrońca stojący za plecami podającego nie blokuje. */
export function laneBlocked(d: Vec, a: Vec, b: Vec, radius = 1.8): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 > 0 && ((d.x - a.x) * dx + (d.y - a.y) * dy) / len2 < 0) return false;
  return distToSegment(d, a, b) < radius;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + k * dx, y: a.y + k * dy });
}

/** Linia spalonego: przedostatni obrońca licząc bramkarza, ale nie za piłką. */
export function offsideLine(snap: Snapshot): number {
  const xs = [...snap.defenders.map((d) => d.x), snap.keeper.x].sort((a, b) => b - a);
  return Math.max(xs[1] ?? 0, snap.ball.x);
}

export interface Option {
  kind: "pass" | "shot";
  targetId?: string;
  label: string;
  score: number;
  offside: boolean;
  blocked: boolean;
  /** Jedno zdanie po polsku: dlaczego tak. */
  text: string;
}

const LANE_RADIUS = 1.8;

export function shotChance(snap: Snapshot): { p: number; blocked: boolean } {
  const goal = { x: GOAL.x, y: GOAL.y };
  const d = dist(snap.ball, goal);
  const blocked = snap.defenders.some((x) => laneBlocked(x, snap.ball, goal, LANE_RADIUS));
  // prosty model: szansa maleje z dystansem; blokada zmniejsza 5-krotnie
  const p = Math.max(0.01, 0.5 * Math.exp(-d / 12)) * (blocked ? 0.2 : 1);
  return { p, blocked };
}

export function evaluate(snap: Snapshot): Option[] {
  const line = offsideLine(snap);
  const opts: Option[] = snap.mates.map((m) => {
    const offside = m.pos.x > line;
    const blocked = snap.defenders.some((d) => laneBlocked(d, snap.ball, m.pos, LANE_RADIUS));
    const open = Math.min(8, Math.min(...snap.defenders.map((d) => dist(d, m.pos))));
    const progress = (m.pos.x - snap.ball.x) * 0.6;
    const behindLine = !offside && m.pos.x > line - 6 ? 8 : 0;
    const score = progress + open * 1.5 + behindLine - (blocked ? 25 : 0) - (offside ? 40 : 0);
    const text = offside
      ? `${m.name} jest na spalonym (${m.pos.x.toFixed(0)} m przy linii ${line.toFixed(0)} m).`
      : blocked
        ? `Tor podania do ${m.name} jest zablokowany przez obrońcę.`
        : behindLine
          ? `${m.name} wbiega za linię obrony i jest wolny.`
          : `${m.name} jest wolny, bezpieczne podanie.`;
    return { kind: "pass" as const, targetId: m.id, label: `Podanie do ${m.name}`, score, offside, blocked, text };
  });
  const shot = shotChance(snap);
  opts.push({
    kind: "shot",
    label: "Strzał",
    score: shot.p * 100,
    offside: false,
    blocked: shot.blocked,
    text: shot.blocked
      ? "Strzał blokowany przez obrońcę."
      : `Strzał z ${dist(snap.ball, { x: GOAL.x, y: GOAL.y }).toFixed(0)} m ma niską szansę.`,
  });
  return opts.sort((a, b) => b.score - a.score);
}

export interface Verdict {
  chosen: Option;
  best: Option;
  verdict: "best" | "good" | "poor";
  summary: string;
}

/** Porównanie wyboru zawodnika z najlepszą opcją (bez punktów, tylko wskazanie lepszego wyboru). */
export function compare(snap: Snapshot, chosen: { kind: "pass" | "shot"; targetId?: string }): Verdict {
  const opts = evaluate(snap);
  const best = opts[0]!;
  const c = opts.find((o) => o.kind === chosen.kind && o.targetId === chosen.targetId) ?? opts[opts.length - 1]!;
  const gap = best.score - c.score;
  const verdict = c === best ? "best" : c.offside || c.blocked || gap > 10 ? "poor" : "good";
  const summary =
    verdict === "best"
      ? `Najlepszy wybór. ${c.text}`
      : `${c.text} Lepiej: ${best.label.toLowerCase()}. ${best.text}`;
  return { chosen: c, best, verdict, summary };
}

/** Pierwszy scenariusz (zaawansowany): bieg za linię obrony i timing podania. */
export const SCENARIO_RUN_IN_BEHIND: Scenario = {
  id: "run-in-behind",
  title: "Bieg za linię obrony",
  brief: "Masz piłkę. Napastnik rusza za plecy obrony. Wybierz moment i adresata podania.",
  player: { x: 66, y: 34 },
  mates: [
    { id: "A", name: "Napastnik", start: { x: 83, y: 30 }, end: { x: 100, y: 37 }, delay: 1.5, speed: 7 },
    { id: "B", name: "Skrzydłowy", start: { x: 76, y: 8 }, end: { x: 76, y: 8 }, delay: 0, speed: 0 },
    { id: "C", name: "Pomocnik", start: { x: 58, y: 42 }, end: { x: 58, y: 42 }, delay: 0, speed: 0 },
  ],
  backLine: [{ x: 89, y: 18 }, { x: 90, y: 29 }, { x: 90, y: 40 }, { x: 89, y: 50 }],
  pressers: [{ x: 76, y: 41 }, { x: 74, y: 26 }],
  pressSpeed: 2.2,
  keeper: { x: 103, y: 34 },
};
