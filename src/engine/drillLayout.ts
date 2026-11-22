import type { Arrow, Drill, Point } from "./drill";
import { arrowsInOrder, drillStart } from "./drill";
import { pointAlong } from "./drillAnim";

/**
 * Układ rysunku ćwiczenia: jedno miejsce, które decyduje, gdzie leżą podpisy, numerki kroków, piłka i znacznik START,
 * tak żeby nic na nic nie nachodziło (renderer i test układu korzystają z tych samych liczb).
 */
export interface Box { x0: number; y0: number; x1: number; y1: number; kind: string; owner?: string }
export interface LabelSpot extends Box { tx: number; ty: number }
export interface Layout {
  /** Wszystkie elementy zajmujące miejsce (bez numerków kroków). */
  boxes: Box[];
  ball: Point | null;
  coneLabels: Map<number, LabelSpot>;
  targetLabels: Map<number, LabelSpot>;
  distanceLabels: Map<number, LabelSpot>;
  start: { box: Box; pill: LabelSpot | null } | null;
}

const hit = (a: Box, b: Box, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
const mk = (kind: string, cx: number, cy: number, hw: number, hh: number, owner?: string): Box => ({ kind, owner, x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh });
const spot = (b: Box): LabelSpot => ({ ...b, tx: (b.x0 + b.x1) / 2, ty: b.y1 - 0.22 });

/** Punkty gęsto próbkowane wzdłuż strzałki (do sprawdzania, czy coś na niej leży). */
function samples(a: Arrow): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= 40; i++) out.push(pointAlong(a.points, i / 40));
  return out;
}
const onArrow = (b: Box, arrows: Point[][], m = 0.3) => arrows.some((pts) => pts.some((p) => p.x > b.x0 - m && p.x < b.x1 + m && p.y > b.y0 - m && p.y < b.y1 + m));

/** Stożek wyznaczający start jest zasłonięty znacznikiem START – nie rysujemy go dwa razy. */
export function coneAtStart(drill: Drill, c: Point): boolean {
  const s = drillStart(drill);
  return !!s && Math.hypot(c.x - s.x, c.y - s.y) < 1.4;
}

/** Kandydaci na podpis wokół elementu: kierunki (góra, dół, prawo, lewo, skosy) w trzech odstępach. */
function around(a: Box, w: number, h: number, kind: string, gaps = [0.35, 1.3, 2.4]): Box[] {
  const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2, out: Box[] = [];
  const at = (x: number, y: number): Box => ({ kind, x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 });
  for (const g of gaps) {
    const dx = (a.x1 - a.x0) / 2 + g + w / 2, dy = (a.y1 - a.y0) / 2 + g + h / 2;
    out.push(at(cx, cy - dy), at(cx, cy + dy), at(cx + dx, cy), at(cx - dx, cy), at(cx + dx, cy - dy), at(cx - dx, cy - dy), at(cx + dx, cy + dy), at(cx - dx, cy + dy));
  }
  return out;
}
function pick(cands: Box[], taken: Box[], arrows: Point[][]): Box {
  let best = cands[0]!, bestScore = Infinity;
  cands.forEach((c, i) => {
    const score = taken.filter((t) => hit(c, t, 0.15)).length * 10 + (onArrow(c, arrows) ? 6 : 0) + i * 0.01;
    if (score < bestScore) { bestScore = score; best = c; }
  });
  return best;
}

export function layoutOf(drill: Drill, opts: { startPill?: boolean } = {}): Layout {
  const arrows = arrowsInOrder(drill).map(samples);
  const boxes: Box[] = [];
  drill.cones.forEach((c, i) => { if (!coneAtStart(drill, c)) boxes.push({ kind: "stożek", owner: `c${i}`, x0: c.x - 0.85, x1: c.x + 0.85, y0: c.y - 0.95, y1: c.y + 0.7 }); });
  const s = drillStart(drill);
  const startBox = s ? mk("start", s.x, s.y, 1.1, 1.1) : null;
  if (startBox) boxes.push(startBox);
  for (const a of drill.actors ?? []) if (a.id !== "me") boxes.push(mk(`zawodnik ${a.label}`, a.x, a.y, 1.1, 1.1));
  for (const r of drill.rebounders ?? []) boxes.push(mk("rebounder", r.x, r.y, (r.width ?? 2.6) / 2 + 0.15, 0.8));
  for (const r of drill.stations ?? []) boxes.push(mk("stacja", r.x, r.y, 1.55, 0.8));
  for (const g of drill.goals ?? []) boxes.push({ kind: "bramka", x0: g.x - g.width / 2, x1: g.x + g.width / 2, y0: -2.3, y1: 0.4 });
  // goal drawn even when drill has none (pitch layout): the default goal sits at HALF.goalX, outside drill space – ignored.

  // piłka stojąca przy zawodniku – obok niego
  let ball: Point | null = drill.ballStart ?? null;
  if (ball && (drill.actors ?? []).some((a) => Math.hypot(a.x - ball!.x, a.y - ball!.y) < 1.6)) {
    const b0 = ball;
    const spots = [[1.9, 0.8], [-1.9, 0.8], [0, 2.3], [1.9, -0.8], [-1.9, -0.8], [0, -2.3], [2.6, 1.6], [-2.6, 1.6]] as const;
    const found = spots.find(([dx, dy]) => !boxes.some((o) => hit(mk("piłka", b0.x + dx, b0.y + dy, 0.7, 0.7), o, 0.1)));
    ball = found ? { x: b0.x + found[0], y: b0.y + found[1] } : { x: b0.x + 1.9, y: b0.y + 0.8 };
  }
  if (ball) boxes.push(mk("piłka", ball.x, ball.y, 0.7, 0.7));

  const taken = [...boxes];
  // START
  let pill: LabelSpot | null = null;
  if (s && opts.startPill !== false) {
    const c = [{ kind: "START", x0: s.x - 1.7, x1: s.x + 1.7, y0: s.y + 1.4, y1: s.y + 2.65 }, ...around(mk("start", s.x, s.y, 1.1, 1.1), 3.4, 1.25, "START", [0.3, 1.0, 1.8])];
    const b = pick(c, taken, arrows); pill = spot(b); taken.push(b); boxes.push(b);
  }
  // podpisy celu
  const targetLabels = new Map<number, LabelSpot>();
  (drill.targets ?? []).forEach((t, i) => {
    const hw = Math.max(1.4, t.label.length * 0.3), top = t.y - t.height / 2, bot = t.y + t.height / 2;
    const c = around({ kind: "cel", x0: t.x - t.width / 2, x1: t.x + t.width / 2, y0: top, y1: bot }, 2 * hw, 1.15, "podpis celu");
    const b = pick(c, taken, arrows); targetLabels.set(i, spot(b)); taken.push(b); boxes.push(b);
  });
  // podpisy stożków
  const coneLabels = new Map<number, LabelSpot>();
  drill.cones.forEach((c0, i) => {
    if (!c0.label || coneAtStart(drill, c0)) return;
    const hw = Math.max(0.9, c0.label.length * 0.3);
    const c = around({ kind: "s", x0: c0.x - 0.85, x1: c0.x + 0.85, y0: c0.y - 0.95, y1: c0.y + 0.7 }, 2 * hw, 1.1, "podpis stożka", [0.1, 1.2, 2.2]).map((b) => ({ ...b, owner: `c${i}` }));
    const own = taken.filter((t) => t.owner !== `c${i}`);
    const b = pick(c, own, arrows); coneLabels.set(i, spot(b)); taken.push(b); boxes.push(b);
  });
  // odległości: etykieta ślizga się po linii
  const distanceLabels = new Map<number, LabelSpot>();
  (drill.distances ?? []).forEach((d, i) => {
    const L = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) || 1, nx = -(d.to.y - d.from.y) / L, ny = (d.to.x - d.from.x) / L;
    const c = [0, 1.4, -1.4].flatMap((off) => [0.5, 0.38, 0.62, 0.26, 0.74, 0.16, 0.84].map((t) => mk("odległość", d.from.x + (d.to.x - d.from.x) * t + nx * off, d.from.y + (d.to.y - d.from.y) * t + ny * off, 1.5, 0.7)));
    const b = pick(c, taken, arrows); distanceLabels.set(i, spot(b)); taken.push(b); boxes.push(b);
  });
  return { boxes, ball, coneLabels, targetLabels, distanceLabels, start: startBox ? { box: startBox, pill } : null };
}

/** Zgodność wsteczna: piłka obok zawodnika. */
export const ballSpot = (drill: Drill): Point | null => layoutOf(drill).ball;

export const BADGE_R = 0.95;
const LINE_CLEAR = 1.3;

function distToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}
const circleBox = (p: Point, r: number): Box => ({ kind: "numer", x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r });
const lenOf = (a: Arrow) => a.points.reduce((s, p, i) => s + (i ? Math.hypot(p.x - a.points[i - 1]!.x, p.y - a.points[i - 1]!.y) : 0), 0);

/** Rozmieszcza numerki kroków tak, żeby nie dotykały niczego: innych numerków, sprzętu, podpisów ani cudzych strzałek. */
export function placeBadges(drill: Drill, ordered: Arrow[], opts: { startPill?: boolean; bounds?: Box; layout?: Layout } = {}): Point[] {
  const statics = (opts.layout ?? layoutOf(drill, opts)).boxes;
  const placed: Point[] = [];
  const out: Point[] = new Array(ordered.length);
  const FR = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];
  const OFF = [1.5, -1.5, 2.2, -2.2, 3, -3, 4, -4, 5, -5];
  const idx = ordered.map((_, i) => i).sort((a, b) => lenOf(ordered[a]!) - lenOf(ordered[b]!));
  for (const i of idx) {
    const a = ordered[i]!;
    let best: Point = pointAlong(a.points, 0.5), bestCost = Infinity;
    for (let fi = 0; fi < FR.length; fi++) for (let oi = 0; oi < OFF.length; oi++) {
      const f = FR[fi]!, off = OFF[oi]!;
      const m = pointAlong(a.points, f), p1 = pointAlong(a.points, Math.max(0, f - 0.04)), p2 = pointAlong(a.points, Math.min(1, f + 0.04));
      const L = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const p = { x: m.x + (-(p2.y - p1.y) / L) * off, y: m.y + ((p2.x - p1.x) / L) * off };
      let cost = fi * 0.15 + Math.abs(off) * 0.12;
      const cb = circleBox(p, BADGE_R);
      for (const s of statics) if (hit(cb, s, 0.25)) cost += 50;
      for (const q of placed) if (Math.hypot(p.x - q.x, p.y - q.y) < BADGE_R * 2 + 0.6) cost += 50;
      ordered.forEach((o, j) => { const d = distToPolyline(p, o.points); if (d < (j === i ? 1.1 : LINE_CLEAR)) cost += j === i ? 20 : 12; });
      if (opts.bounds && (p.x < opts.bounds.x0 + 1 || p.x > opts.bounds.x1 - 1 || p.y < opts.bounds.y0 + 1 || p.y > opts.bounds.y1 - 1)) cost += 30;
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    out[i] = best; placed.push(best);
  }
  return out;
}

/** Lista naruszeń: pary elementów, które się nakładają (do testów i kontroli ręcznej). */
export function audit(drill: Drill, opts: { startPill?: boolean } = {}): string[] {
  const issues: string[] = [];
  const ordered = arrowsInOrder(drill);
  const lay = layoutOf(drill, opts);
  const arrows = ordered.map(samples);
  const { boxes } = lay;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i]!.owner && boxes[i]!.owner === boxes[j]!.owner) continue;
    if (hit(boxes[i]!, boxes[j]!, 0.05)) issues.push(`${boxes[i]!.kind} ↔ ${boxes[j]!.kind}`);
  }
  // napisy nie mogą leżeć na strzałkach
  for (const b of boxes) if (/podpis|odległość|START/.test(b.kind) && onArrow(b, arrows, 0.3)) issues.push(`${b.kind} na strzałce`);
  const badges = placeBadges(drill, ordered, { ...opts, layout: lay });
  badges.forEach((p, i) => {
    const cb = circleBox(p, BADGE_R);
    for (const s of boxes) if (hit(cb, s, 0.2)) issues.push(`numer ${i + 1} ↔ ${s.kind}`);
    badges.forEach((q, j) => { if (j > i && Math.hypot(p.x - q.x, p.y - q.y) < BADGE_R * 2 + 0.3) issues.push(`numer ${i + 1} ↔ numer ${j + 1}`); });
    ordered.forEach((o, j) => { if (distToPolyline(p, o.points) < 1.05) issues.push(`numer ${i + 1} na strzałce ${j + 1}`); });
  });
  return issues;
}

/** Przesuwa stożki tak, by nie wchodziły na zawodników, sprzęt ani na siebie. */
export function nudgeCones(drill: Drill): Drill {
  const cones = drill.cones.map((c) => ({ ...c }));
  const field = drill.field;
  const conflicts = (i: number) => {
    const lay = layoutOf({ ...drill, cones }, { startPill: false });
    const mine = lay.boxes.filter((b) => b.owner === `c${i}`), others = lay.boxes.filter((b) => b.owner !== `c${i}`);
    return mine.some((m) => others.some((o) => hit(m, o, 0.1)));
  };
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < cones.length; i++) {
    if (!conflicts(i)) continue;
    const c = cones[i]!;
    const cand: Array<[number, number]> = [];
    for (let r = 0.5; r <= 4.5; r += 0.5) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; cand.push([+(c.x + Math.cos(a) * r).toFixed(2), +(c.y + Math.sin(a) * r).toFixed(2)]); }
    for (const [x, y] of cand) {
      if (x < 1 || x > field.width - 1 || y < 1.6 || y > field.height - 0.8) continue;
      cones[i] = { ...c, x, y };
      if (!conflicts(i)) break;
      cones[i] = c;
    }
  }
  return { ...drill, cones };
}
