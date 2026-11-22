import type { ArrowStyle, Drill, Point } from "./drill";

/**
 * Animacja ćwiczenia na szkicu: zawodnik i piłka poruszają się po strzałkach w kolejności kroków.
 * Czysta funkcja czasu (bez Reacta), więc da się ją testować i wstrzymać w dowolnej chwili.
 *  – bieg: porusza się zawodnik, piłka stoi,
 *  – prowadzenie: zawodnik i piłka (tuż przed nim) razem,
 *  – podanie / strzał: leci piłka, zawodnik stoi.
 */
export interface AnimSeg { /** Indeks strzałki w drill.arrows. */ arrow: number; style: ArrowStyle; t0: number; t1: number }
export interface AnimTimeline { segs: AnimSeg[]; total: number }
export interface AnimState { player: Point; ball: Point | null; players?: Record<string, Point>; /** Indeks w segs aktualnego (lub ostatnio zakończonego) kroku; -1 przed startem. */ seg: number; active: boolean }

/** Prędkości w m/s dobrane tak, by animacja była czytelna (wolniej niż w rzeczywistości). */
export const ANIM_SPEED: Record<ArrowStyle, number> = { run: 4.5, dribble: 2.6, pass: 8, lob: 7, touch: 3, shot: 12 };
const MIN_S = 0.9, GAP_S = 0.45, HOLD_S = 1.3;

export function pathLength(points: Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return l;
}

/** Punkt na łamanej w odległości frac (0–1) jej długości. */
export function pointAlong(points: Point[], frac: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const f = Math.min(1, Math.max(0, frac));
  let left = pathLength(points) * f;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= d || i === points.length - 1) { const k = d ? Math.min(1, left / d) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    left -= d;
  }
  return points[points.length - 1]!;
}

export function buildTimeline(drill: Drill): AnimTimeline {
  const order = drill.arrows.map((a, i) => ({ a, i })).sort((x, y) => (x.a.step ?? x.i + 1) - (y.a.step ?? y.i + 1) || x.i - y.i);
  const segs: AnimSeg[] = [];
  let t = 0;
  for (let n = 0; n < order.length;) {
    const first = order[n]!, phase = first.a.step ?? first.i + 1;
    const group: typeof order = [];
    while (n < order.length && (order[n]!.a.step ?? order[n]!.i + 1) === phase) group.push(order[n++]!);
    // akcje z tym samym numerem etapu są równoczesne
    const dur = Math.max(MIN_S, ...group.map(({ a }) => pathLength(a.points) / ANIM_SPEED[a.style]));
    for (const { a, i } of group) segs.push({ arrow: i, style: a.style, t0: t, t1: t + dur });
    t += dur + GAP_S;
  }
  return { segs, total: segs.length ? t - GAP_S + HOLD_S : 0 };
}

const ease = (x: number) => x * x * (3 - 2 * x);

export function stateAt(drill: Drill, tl: AnimTimeline, tRaw: number): AnimState {
  if (drill.actors?.length) return explicitStateAt(drill, tl, tRaw);
  const first = tl.segs[0] ? drill.arrows[tl.segs[0].arrow]!.points[0]! : { x: 0, y: 0 };
  if (!tl.total) return { player: first, ball: null, seg: -1, active: false };
  const t = ((tRaw % tl.total) + tl.total) % tl.total;
  let player = first;
  const ballArrow = tl.segs.map((s) => drill.arrows[s.arrow]!).find((a) => a.style !== "run");
  let ball: Point | null = ballArrow ? ballArrow.points[0]! : null;
  let seg = -1, active = false;
  for (let i = 0; i < tl.segs.length; i++) {
    const s = tl.segs[i]!, pts = drill.arrows[s.arrow]!.points;
    if (t < s.t0) break;
    seg = i;
    const done = t >= s.t1;
    const f = done ? 1 : ease((t - s.t0) / (s.t1 - s.t0));
    const pos = pointAlong(pts, f);
    if (s.style === "run" || s.style === "dribble") {
      player = pos;
      if (s.style === "dribble") {
        const ahead = pointAlong(pts, Math.min(1, f + 0.04)), back = pointAlong(pts, Math.max(0, f - 0.04));
        const dx = ahead.x - back.x, dy = ahead.y - back.y, len = Math.hypot(dx, dy) || 1;
        ball = { x: pos.x + (dx / len) * 0.9, y: pos.y + (dy / len) * 0.9 };
      }
    } else {
      ball = pos; // podanie lub strzał: piłka od razu na linii lotu, zawodnik zostaje
    }
    active = !done;
  }
  return { player, ball, seg, active };
}

/** Jawne sceny: kilka osób może biec równocześnie z podaniem. Piłka ma jeden stan. */
function explicitStateAt(drill: Drill, tl: AnimTimeline, tRaw: number): AnimState {
  const players = Object.fromEntries(drill.actors!.map((a) => [a.id, { x: a.x, y: a.y }]));
  let ball = drill.ballStart ?? null;
  const t = tl.total ? ((tRaw % tl.total) + tl.total) % tl.total : 0;
  let seg = -1, active = false;
  for (let i = 0; i < tl.segs.length; i++) {
    const s = tl.segs[i]!;
    if (t < s.t0) break;
    const a = drill.arrows[s.arrow]!, done = t >= s.t1;
    const pos = pointAlong(a.points, done ? 1 : ease((t - s.t0) / (s.t1 - s.t0)));
    if (a.style === "run" || a.style === "dribble" || a.style === "touch") players[a.actorId ?? "me"] = pos;
    if (a.style !== "run") ball = pos;
    seg = i; active = active || !done;
  }
  return { player: players.me ?? { x: 0, y: 0 }, players, ball, seg, active };
}
