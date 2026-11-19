import type { Anim } from "./anims";
import { ease, mix, solve, type Joints, type Pose } from "./figure";

/** Całkowity czas jednej pętli (s). */
export function loopLength(a: Anim): number {
  const sum = a.frames.reduce((s, f) => s + f[1] + (f[2] ?? 0), 0);
  // „fade”: pierwsza poza jest startem (bez czasu dojścia), na końcu 0,5 s zanikania i pojawiania się
  return a.loop === "fade" ? sum - a.frames[0]![1] + 0.5 : sum;
}

/** Poza i przezroczystość animacji w chwili t (s) – pętla od początku. */
export function poseAt(a: Anim, tRaw: number): { pose: Pose; alpha: number } {
  const total = loopLength(a);
  const t = ((tRaw % total) + total) % total;
  const n = a.frames.length;
  let acc = 0;
  // „cycle”: segment i prowadzi z ramki i−1 do i (dla i = 0 – z ostatniej do pierwszej)
  // „fade”: pierwsza poza jest startem (czas dojścia 0), po ostatniej – zanikanie
  for (let i = 0; i < n; i++) {
    const [pose, d, hold = 0] = a.frames[i]!;
    const move = a.loop === "fade" && i === 0 ? 0 : d;
    if (t < acc + move) {
      const prev = a.frames[(i + n - 1) % n]![0];
      return { pose: mix(prev, pose, ease((t - acc) / move)), alpha: 1 };
    }
    acc += move;
    if (t < acc + hold) return { pose, alpha: 1 };
    acc += hold;
  }
  // koniec pętli „fade”: zanik i pojawienie się pierwszej pozy
  const k = (t - acc) / 0.5;
  const last = a.frames[n - 1]![0];
  return k < 0.5 ? { pose: last, alpha: 1 - k * 2 } : { pose: a.frames[0]![0], alpha: (k - 0.5) * 2 };
}

export function jointsAt(a: Anim, t: number): { j: Joints; alpha: number } {
  const { pose, alpha } = poseAt(a, t);
  return { j: solve(pose), alpha };
}
