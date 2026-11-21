import type { Drill, Point } from "./drill";

/**
 * Połowa boiska (68 × 52,5 m) w układzie ekranu: linia bramkowa u góry (y = 0), linia środkowa na dole (y = 52,5),
 * x to szerokość boiska od lewej linii bocznej. Układ ćwiczeń z bramką ma bramkę u góry (y małe = blisko bramki),
 * więc trafia na boisko bez obrotu, tylko z przesunięciem.
 */
export const HALF = { w: 68, h: 52.5, goalX: 34, goalW: 7.32, boxW: 40.32, boxD: 16.5, sixW: 18.32, sixD: 5.5, spotD: 11, circleR: 9.15 } as const;

export interface Placement {
  /** Punkt w układzie ćwiczenia → punkt na połowie boiska. */
  map: (p: Point) => Point;
  /** Prostokąt pola ćwiczenia (narożniki) na boisku. */
  corners: Point[];
  /** Obwiednia pola ćwiczenia na boisku. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Gdzie na połowie boiska stoi ćwiczenie: z bramką – przed bramką (środek bramki w osi boiska), bez bramki – w środkowej
 * części połowy (strefa pomocy), wyśrodkowane w poprzek.
 */
export function placeDrill(d: Drill): Placement {
  const { width: w, height: h } = d.field;
  const goal = d.goals?.[0];
  const ox = goal ? HALF.goalX - goal.x : HALF.w / 2 - w / 2;
  const oy = goal ? 0 : 34 - h / 2;
  const map = (p: Point): Point => ({ x: p.x + ox, y: p.y + oy });
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map(map);
  return { map, corners, box: { x0: ox, y0: oy, x1: ox + w, y1: oy + h } };
}
