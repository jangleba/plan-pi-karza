import type { ArrowStyle, Point } from "../engine/drill";
import { pointAlong } from "../engine/drillAnim";

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Gładka krzywa przez punkty (Catmull-Rom → Béziery). Dla dwóch punktów: lekki łuk (8% długości), żeby ruch nie był sztywną linijką. */
export function smoothPath(points: Point[], bow = 0.08): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    const a = points[0]!, b = points[1]!, L = len(a, b) || 1;
    const c = { x: (a.x + b.x) / 2 - ((b.y - a.y) / L) * L * bow, y: (a.y + b.y) / 2 + ((b.x - a.x) / L) * L * bow };
    return `M${a.x},${a.y} Q${c.x.toFixed(2)},${c.y.toFixed(2)} ${b.x},${b.y}`;
  }
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Punkty gładkiej łamanej (do kreślenia fali prowadzenia wzdłuż krzywej). */
function sampleSmooth(points: Point[], step = 0.35): Point[] {
  if (points.length === 2) { const L = len(points[0]!, points[1]!); const n = Math.max(2, Math.round(L / step)); return Array.from({ length: n + 1 }, (_, i) => lerp(points[0]!, points[1]!, i / n)); }
  const out: Point[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[i + 2] ?? p2;
    const n = Math.max(4, Math.round(len(p1, p2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, c_: number, d_: number) => 0.5 * (2 * b + (-a + c_) * t + (2 * a - 5 * b + 4 * c_ - d_) * t2 + (-a + 3 * b - 3 * c_ + d_) * t3);
      out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Falista linia (prowadzenie piłki): delikatna fala wzdłuż gładkiej trasy, wygaszona na końcach (bez zygzaka). */
export function wavyPath(points: Point[]): string {
  const base = sampleSmooth(points);
  if (base.length < 3) return smoothPath(points, 0);
  const lens = [0]; for (let i = 1; i < base.length; i++) lens.push(lens[i - 1]! + len(base[i - 1]!, base[i]!));
  const total = lens[lens.length - 1]!;
  const lambda = 2.4, amp = 0.34;
  let d = "";
  base.forEach((p, i) => {
    const a = base[Math.max(0, i - 1)]!, b = base[Math.min(base.length - 1, i + 1)]!, L = len(a, b) || 1;
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    const s = lens[i]!, env = Math.min(1, s / 1.2, (total - s) / 1.6);
    const off = amp * Math.sin((s / lambda) * Math.PI * 2) * Math.max(0, env);
    d += `${i === 0 ? "M" : "L"}${(p.x + nx * off).toFixed(2)},${(p.y + ny * off).toFixed(2)} `;
  });
  return d.trim();
}

/** Łuk podania górą: jedna krzywa od pierwszego do ostatniego punktu, wygięta w bok o ok. 28% długości. Zwraca też szczyt łuku. */
export function lobPath(points: Point[]): { d: string; apex: Point } {
  const a = points[0]!, b = points[points.length - 1]!, L = len(a, b) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const c = { x: (a.x + b.x) / 2 + nx * L * 0.28, y: (a.y + b.y) / 2 + ny * L * 0.28 };
  const apex = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  return { d: `M${a.x},${a.y} Q${c.x.toFixed(2)},${c.y.toFixed(2)} ${b.x},${b.y}`, apex };
}

export function arrowPath(style: ArrowStyle, points: Point[]): string {
  if (style === "dribble") return wavyPath(points);
  if (style === "lob") return lobPath(points).d;
  if (style === "run") return smoothPath(points);
  if (points.length > 2) return smoothPath(points, 0);
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** Styl kreski: [grubość, wzór kreskowania, zaokrąglone końce]. Podanie = kreskowana, bieg = kropkowana, strzał = gruba ciągła. */
export const STROKE: Record<ArrowStyle, { w: number; dash?: string }> = {
  pass: { w: 0.22, dash: "1.1 0.75" },
  lob: { w: 0.22, dash: "1.1 0.75" },
  dribble: { w: 0.24 },
  run: { w: 0.3, dash: "0.02 0.62" },
  touch: { w: 0.36 },
  shot: { w: 0.42 },
};

/** Miejsce numerka kroku: środek strzałki przesunięty w bok, żeby nie zasłaniał linii (dla krótkich strzałek dalej). */
export function badgePos(style: ArrowStyle, points: Point[]): Point {
  const mid = style === "lob" ? lobPath(points).apex : pointAlong(points, 0.5);
  const a = pointAlong(points, 0.45), b = pointAlong(points, 0.55);
  const L = len(a, b) || 1;
  const total = points.reduce((s, p, i) => s + (i ? len(points[i - 1]!, p) : 0), 0);
  const off = total < 3 ? 1.9 : 1.4;
  return { x: mid.x + (-(b.y - a.y) / L) * off, y: mid.y + ((b.x - a.x) / L) * off };
}

/** Łuk pola karnego (część poza polem): ścieżka SVG dla środka (cx, spotY) i promienia r od linii pola karnego `boxY`. */
export function penaltyArc(cx: number, spotY: number, r: number, boxY: number): string {
  const dy = boxY - spotY, th = Math.acos(Math.min(1, dy / r)), dx = r * Math.sin(th);
  return `M${(cx - dx).toFixed(2)},${boxY} A${r},${r} 0 0 0 ${(cx + dx).toFixed(2)},${boxY}`;
}

/** Rozsuwa numerki kroków, które nachodzą na siebie (kilka przebiegów odpychania, każdy numerek w bok od swojej strzałki). */
export function spreadBadges(pos: Point[], minDist = 2.3): Point[] {
  const out = pos.map((p) => ({ ...p }));
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!, d = len(a, b);
      if (d >= minDist) continue;
      const nx = d > 1e-6 ? (b.x - a.x) / d : 1, ny = d > 1e-6 ? (b.y - a.y) / d : 0;
      const push = (minDist - d) / 2 + 0.05;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
  }
  return out;
}
