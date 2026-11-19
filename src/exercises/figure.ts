/**
 * Minimalistyczna sylwetka z kresek (widok z boku, patrzy w prawo) do pętli animacji ćwiczeń.
 * Pozycje podajemy w układzie „sceny”: x do przodu, y w górę od podłoża; nogi i ręce liczone
 * odwrotną kinematyką (dwa człony), więc stopy naprawdę stoją tam, gdzie je ustawimy.
 */
export type Vec = [number, number];

export const LEN = { thigh: 25, shank: 25, trunk: 36, neck: 6, head: 6.5, upper: 15, fore: 14, foot: 14 } as const;
export const REACH_LEG = LEN.thigh + LEN.shank;
export const REACH_ARM = LEN.upper + LEN.fore;

export interface Pose {
  /** Biodro (środek miednicy). */
  hip: Vec;
  /** Pochylenie tułowia od pionu w stopniach; dodatnie = do przodu (w prawo). */
  trunk: number;
  /** Kostka bliższej (A) i dalszej (B) nogi; B domyślnie jak A. */
  ankA: Vec;
  ankB?: Vec;
  /** Kąt stopy: ile stopni palce są niżej niż kostka (domyślnie stopa płasko na ziemi). */
  toeA?: number;
  toeB?: number;
  /** Strona ugięcia kolana: +1 do przodu, −1 do tyłu. */
  kneeA?: 1 | -1;
  kneeB?: 1 | -1;
  /** Nadgarstek względem barku (x do przodu, y w górę) albo bezwzględnie (abs*). */
  handA?: Vec;
  handB?: Vec;
  absA?: Vec;
  absB?: Vec;
  /** Strona ugięcia łokcia: −1 do tyłu/dołu (domyślnie), +1 do przodu/góry. */
  elb?: 1 | -1;
  /** Przechył głowy względem tułowia (stopnie). */
  head?: number;
}

export interface Joints {
  head: Vec; neck: Vec; shoulder: Vec; hip: Vec;
  kneeA: Vec; ankleA: Vec; toeA: Vec;
  kneeB: Vec; ankleB: Vec; toeB: Vec;
  elbowA: Vec; wristA: Vec; elbowB: Vec; wristB: Vec;
}

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const len = (a: Vec) => Math.hypot(a[0], a[1]);

/** Dwuczłonowa kinematyka odwrotna: środkowy staw (kolano/łokieć) i faktyczny koniec (gdy cel poza zasięgiem – ścięty). */
export function ik(a: Vec, b: Vec, l1: number, l2: number, bend: 1 | -1): { mid: Vec; end: Vec } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01, min = Math.abs(l1 - l2) + 0.01;
  if (d < 1e-6) return { mid: [a[0], a[1] - l1], end: [a[0], a[1]] };
  const ux = dx / d, uy = dy / d;
  d = Math.max(min, Math.min(max, d));
  const x = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const nx = -uy, ny = ux;
  return {
    mid: [a[0] + ux * x + nx * h * bend, a[1] + uy * x + ny * h * bend],
    end: [a[0] + ux * d, a[1] + uy * d],
  };
}

export function solve(p: Pose): Joints {
  const t = rad(p.trunk);
  const up: Vec = [Math.sin(t), Math.cos(t)];
  const hip = p.hip;
  const shoulder = add(hip, [up[0] * LEN.trunk, up[1] * LEN.trunk]);
  const hd = rad(p.trunk + (p.head ?? 0));
  const neck = add(shoulder, [Math.sin(hd) * LEN.neck, Math.cos(hd) * LEN.neck]);
  const head = add(neck, [Math.sin(hd) * LEN.head, Math.cos(hd) * LEN.head]);

  const leg = (ank: Vec, bend: 1 | -1, toe: number | undefined) => {
    const r = ik(hip, ank, LEN.thigh, LEN.shank, bend);
    const ang = rad(toe ?? Math.asin(Math.min(1, 6 / LEN.foot)) * (180 / Math.PI));
    const t2: Vec = [r.end[0] + Math.cos(ang) * LEN.foot, r.end[1] - Math.sin(ang) * LEN.foot];
    return { knee: r.mid, ankle: r.end, toe: t2 };
  };
  const a = leg(p.ankA, p.kneeA ?? 1, p.toeA);
  const b = leg(p.ankB ?? p.ankA, p.kneeB ?? p.kneeA ?? 1, p.toeB ?? p.toeA);

  const arm = (rel: Vec | undefined, abs: Vec | undefined) => {
    const target = abs ?? add(shoulder, rel ?? [3, -27]);
    const r = ik(shoulder, target, LEN.upper, LEN.fore, p.elb ?? -1);
    return { elbow: r.mid, wrist: r.end };
  };
  const ha = arm(p.handA, p.absA);
  const hb = arm(p.handB ?? p.handA, p.absB ?? p.absA);

  return {
    head, neck, shoulder, hip,
    kneeA: a.knee, ankleA: a.ankle, toeA: a.toe,
    kneeB: b.knee, ankleB: b.ankle, toeB: b.toe,
    elbowA: ha.elbow, wristA: ha.wrist, elbowB: hb.elbow, wristB: hb.wrist,
  };
}

/** Pomocnik: tułów i biodro tak, by ciało było prostą linią od kostki do barku (deski, wiosłowanie w podwieszeniu). */
export function bodyLine(ankle: Vec, shoulder: Vec): { hip: Vec; trunk: number } {
  const d: Vec = [shoulder[0] - ankle[0], shoulder[1] - ankle[1]];
  const l = len(d) || 1;
  const hip: Vec = [ankle[0] + (d[0] / l) * REACH_LEG * 0.99, ankle[1] + (d[1] / l) * REACH_LEG * 0.99];
  const trunk = (Math.atan2(shoulder[0] - hip[0], shoulder[1] - hip[1]) * 180) / Math.PI;
  return { hip, trunk };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpV = (a: Vec, b: Vec, k: number): Vec => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const opt = (a: Vec | undefined, b: Vec | undefined, k: number) => (a && b ? lerpV(a, b, k) : (k < 0.5 ? a : b));
const optN = (a: number | undefined, b: number | undefined, k: number) => (a !== undefined && b !== undefined ? lerp(a, b, k) : (k < 0.5 ? a : b));

/** Interpolacja dwóch póz (k = 0…1). Strony ugięcia (kolana, łokcie) bierzemy z pozy źródłowej. */
export function mix(a: Pose, b: Pose, k: number): Pose {
  return {
    hip: lerpV(a.hip, b.hip, k),
    trunk: lerp(a.trunk, b.trunk, k),
    ankA: lerpV(a.ankA, b.ankA, k),
    ankB: opt(a.ankB ?? a.ankA, b.ankB ?? b.ankA, k),
    toeA: optN(a.toeA, b.toeA, k),
    toeB: optN(a.toeB ?? a.toeA, b.toeB ?? b.toeA, k),
    kneeA: a.kneeA, kneeB: a.kneeB,
    handA: opt(a.handA, b.handA, k),
    handB: opt(a.handB ?? a.handA, b.handB ?? b.handA, k),
    absA: opt(a.absA, b.absA, k),
    absB: opt(a.absB ?? a.absA, b.absB ?? b.absA, k),
    elb: a.elb,
    head: optN(a.head, b.head, k),
  };
}

export const ease = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);
