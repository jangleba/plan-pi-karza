import type { Anim } from "./anims";
import { LEN, solve, mix, type Joints, type Vec } from "./figure";

export type Shape =
  | { k: "line"; a: Vec; b: Vec; w: number; role: "near" | "far" | "prop" }
  | { k: "circle"; c: Vec; r: number; role: "near" | "far" | "prop"; fill?: boolean };

export interface View {
  /** viewBox „x y w h” w współrzędnych SVG (scena z odwróconą osią y). */
  box: [number, number, number, number];
  /** Mnożnik grubości kresek (większa scena → grubsze kreski, ten sam wygląd). */
  unit: number;
  /** Zakres poziomy poziomej linii podłoża. */
  floor: [number, number];
}

const sv = (p: Vec): Vec => [p[0], -p[1]];

function jointPoints(j: Joints): Vec[] {
  return [j.head, j.neck, j.shoulder, j.hip, j.kneeA, j.ankleA, j.toeA, j.kneeB, j.ankleB, j.toeB, j.elbowA, j.wristA, j.elbowB, j.wristB];
}

/** Kadr dopasowany do ruchu: obejmuje wszystkie pozy (także pośrednie) i rekwizyty; proporcje 4 : 3. */
export function viewFor(anim: Anim): View {
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  const take = (p: Vec, r = 0) => { minX = Math.min(minX, p[0] - r); maxX = Math.max(maxX, p[0] + r); maxY = Math.max(maxY, p[1] + r); };
  const n = anim.frames.length;
  for (let i = 0; i < n; i++) {
    const a = anim.frames[i]![0], b = anim.frames[(i + 1) % n]![0];
    for (let k = 0; k <= 6; k++) {
      const j = solve(mix(a, b, k / 6));
      for (const p of jointPoints(j)) take(p);
      take(j.head, LEN.head);
    }
  }
  for (const p of anim.props ?? []) {
    if (p.t === "rect") { take([p.x, p.y]); take([p.x + p.w, p.y + p.h]); }
    else if (p.t === "line") { take(p.a); take(p.b); }
    else if (p.t === "dot") take(p.at, p.r);
    else if (p.t === "tie") take(p.to);
  }
  const needW = maxX - minX + 28, needH = maxY + 26;
  const W = Math.max(needW, (needH * 4) / 3, 110);
  const H = (W * 3) / 4;
  const cx = (minX + maxX) / 2;
  return { box: [cx - W / 2, -(H - 12), W, H], unit: W / 160, floor: [cx - W / 2, cx + W / 2] };
}

/** Zamienia pozę i rekwizyty w listę kształtów do narysowania (kolejność = od tyłu do przodu). */
export function shapesFor(j: Joints, anim: Anim, view: View): Shape[] {
  const v = sv;
  const u = view.unit;
  const out: Shape[] = [];
  out.push({ k: "line", a: [view.floor[0], 0], b: [view.floor[1], 0], w: 1 * u, role: "prop" });
  for (const p of anim.props ?? []) {
    if (p.t === "rect") {
      const a = v([p.x, p.y + p.h]), b = v([p.x + p.w, p.y + p.h]), c = v([p.x + p.w, p.y]), d = v([p.x, p.y]);
      const w = 1.6 * u;
      out.push({ k: "line", a, b, w, role: "prop" }, { k: "line", a: b, b: c, w, role: "prop" }, { k: "line", a: c, b: d, w, role: "prop" }, { k: "line", a: d, b: a, w, role: "prop" });
    } else if (p.t === "line") out.push({ k: "line", a: v(p.a), b: v(p.b), w: 1.6 * u, role: "prop" });
    else if (p.t === "dot") out.push({ k: "circle", c: v(p.at), r: p.r * u, role: "prop", fill: true });
    else if (p.t === "tie") {
      const from = p.from === "wristA" ? j.wristA : p.from === "ankleA" ? j.ankleA : j.hip;
      out.push({ k: "line", a: v(from), b: v(p.to), w: 1 * u, role: "prop" });
    }
  }
  const L = (a: Vec, b: Vec, role: "near" | "far", w = 3.6): Shape => ({ k: "line", a: v(a), b: v(b), w: w * u, role });
  out.push(L(j.hip, j.kneeB, "far"), L(j.kneeB, j.ankleB, "far"), L(j.ankleB, j.toeB, "far"), L(j.shoulder, j.elbowB, "far"), L(j.elbowB, j.wristB, "far"));
  out.push(L(j.hip, j.shoulder, "near", 4.4), L(j.shoulder, j.neck, "near"), { k: "circle", c: v(j.head), r: LEN.head, role: "near" });
  out.push(L(j.hip, j.kneeA, "near"), L(j.kneeA, j.ankleA, "near"), L(j.ankleA, j.toeA, "near"), L(j.shoulder, j.elbowA, "near"), L(j.elbowA, j.wristA, "near"));
  for (const p of anim.props ?? []) {
    if (p.t === "plate") {
      const at = p.at === "shoulder" ? j.shoulder : j.wristA;
      out.push({ k: "circle", c: v(at), r: 6.5, role: "prop" }, { k: "circle", c: v(at), r: 1.6, role: "near", fill: true });
    }
  }
  return out;
}
