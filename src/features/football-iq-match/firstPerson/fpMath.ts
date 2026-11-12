/** Small 2D vector helpers for the first-person 3v2 simulator.
 *
 * Pitch coordinates are metres: x across (-34 … 34), y along the pitch
 * (-52.5 … 52.5). The attacking goal is at y = +52.5.
 * A heading is atan2(dx, dy): 0 faces the attacking goal, +π/2 faces +x.
 */
export type V = { x: number; y: number };

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const norm = (a: V): V => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const lerpV = (a: V, b: V, t: number): V => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const headingOf = (d: V) => Math.atan2(d.x, d.y);
export const dirOf = (heading: number): V => ({ x: Math.sin(heading), y: Math.cos(heading) });
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Signed smallest difference b − a, in (−π, π]. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;
/** Distance from p to the segment a–b, plus the position t (0…1) of the closest point. */
export function segmentDistance(p: V, a: V, b: V) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-9 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0;
  return { d: dist(p, add(a, scale(ab, t))), t };
}

/** Deterministic random numbers (mulberry32). Same seed, same sequence on every device. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Roughly normal noise in [−1, 1] made from three uniform draws. */
export const gauss = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

export const PITCH = {
  halfWidth: 34,
  halfLength: 52.5,
  boxDepth: 16.5,
  boxHalfWidth: 20.16,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
} as const;
