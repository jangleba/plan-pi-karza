import type { ArrowStyle, Point } from "../engine/drill";
import { pointAlong } from "../engine/drillAnim";

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Falista linia (prowadzenie piłki): zygzak o stałej fali wzdłuż całej łamanej. */
export function wavyPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, L = len(a, b) || 1;
    const n = Math.max(2, Math.round(L / 1.5));
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    for (let k = 1; k <= n; k++) {
      const t = k / n, tm = (k - 0.5) / n;
      const off = k % 2 ? 0.35 : -0.35;
      const sx = a.x + (b.x - a.x) * t, sy = a.y + (b.y - a.y) * t;
      const cx = a.x + (b.x - a.x) * tm + nx * off * 2, cy = a.y + (b.y - a.y) * tm + ny * off * 2;
      d += ` Q${cx.toFixed(2)},${cy.toFixed(2)} ${sx.toFixed(2)},${sy.toFixed(2)}`;
    }
  }
  return d;
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
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** Styl kreski: [grubość, wzór kreskowania, zaokrąglone końce]. Podanie = kreskowana, bieg = kropkowana, strzał = gruba ciągła. */
export const STROKE: Record<ArrowStyle, { w: number; dash?: string }> = {
  pass: { w: 0.32, dash: "1.3 0.9" },
  lob: { w: 0.32, dash: "1.3 0.9" },
  dribble: { w: 0.32 },
  run: { w: 0.42, dash: "0.02 0.85" },
  touch: { w: 0.5 },
  shot: { w: 0.7 },
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
