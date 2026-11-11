/** Seeded variants of the one 3v2 situation: receive under pressure, read the picture, pass.
 *
 * A variant changes the decision problem, not only the picture: where the pass comes from,
 * from where the nearest rival presses and which side he shuts, how the partners move and
 * how the second rival covers. Positions get a small seeded jitter on top.
 * The validated list of seeds lives in FP_VARIANT_SEEDS (see fpVariants.test.ts).
 */
import { rng, type V } from "./fpMath";

export type PressFrom = "back" | "inside" | "outside";
/** Which side the pressing rival shuts with his run: the runner's side or the passer's side. */
export type PressCloses = "runner" | "passer";
export type RunnerMove = "depth" | "drop" | "wide";
export type SupportMove = "short" | "overlap";
export type CoverStyle = "tight" | "zone";

export type FpVariant = {
  id: string;
  seed: number;
  /** +1: passer on the left, runner on the right; −1 mirrored. */
  side: 1 | -1;
  lane: "centre" | "half";
  passer: "behind" | "wide";
  press: PressFrom;
  closes: PressCloses;
  runner: RunnerMove;
  support: SupportMove;
  cover: CoverStyle;
  start: Record<"ty" | "support" | "runner" | "d1" | "d2" | "gk", V>;
};

export const FP_VARIANT_VERSION = 1;
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;

export function makeVariant(seed: number): FpVariant {
  const r = rng(seed * 7919 + 17);
  const side = pick(r, [1, -1] as const);
  const lane = pick(r, ["centre", "half"] as const);
  const passer = pick(r, ["behind", "wide"] as const);
  const press = pick(r, ["back", "inside", "outside"] as const);
  const closes = pick(r, ["runner", "passer"] as const);
  const runner = pick(r, ["depth", "drop", "wide"] as const);
  const support = pick(r, ["short", "overlap"] as const);
  const cover = pick(r, ["tight", "zone"] as const);
  const j = () => (r() - 0.5) * 2; // ±1 m jitter
  // Built for side = +1 (passer left, runner right) and mirrored afterwards.
  const tyX = lane === "centre" ? -1.5 + j() * 0.8 : -8 + j();
  const ty = { x: tyX, y: 12 + j() };
  const supportStart =
    passer === "behind" ? { x: tyX - 3 + j(), y: -4 + j() } : { x: tyX - 15 + j(), y: 5 + j() };
  const runnerStart =
    runner === "drop"
      ? { x: tyX + 12 + j(), y: 27.5 + j() * 0.5 }
      : { x: tyX + 15 + j(), y: 26.5 + j() * 0.5 };
  // The pressing rival starts 5.5–8 m away, goal side of the receiver.
  const d1 =
    press === "back"
      ? { x: tyX + 0.6 * j(), y: ty.y + 6 + j() * 0.5 }
      : press === "inside"
        ? { x: tyX + (tyX <= 0 ? 6.5 : -6.5), y: ty.y + 4.5 + j() * 0.5 }
        : { x: tyX + (tyX <= 0 ? -6.5 : 6.5), y: ty.y + 4.5 + j() * 0.5 };
  const d2 =
    cover === "tight"
      ? { x: runnerStart.x - 1.5, y: runnerStart.y + 2 }
      : { x: (tyX + runnerStart.x) / 2 + 2, y: 29.5 + j() * 0.5 };
  const gk = { x: 0, y: 48 };
  const mirror = (p: V): V => ({ x: p.x * side, y: p.y });
  return {
    id: `fp${FP_VARIANT_VERSION}-${seed}`,
    seed,
    side,
    lane,
    passer,
    press,
    closes,
    runner,
    support,
    cover,
    start: {
      ty: mirror(ty),
      support: mirror(supportStart),
      runner: mirror(runnerStart),
      d1: mirror(d1),
      d2: mirror(d2),
      gk,
    },
  };
}

export function variantFromId(id: string): FpVariant | null {
  const match = /^fp(\d+)-(\d+)$/.exec(id);
  if (!match || Number(match[1]) !== FP_VARIANT_VERSION) return null;
  return makeVariant(Number(match[2]));
}

/** The problem dimensions a learner notices. Two variants differ when at least two of them change. */
export function variantDimensions(v: FpVariant) {
  return [v.press, v.closes, v.runner, v.support, v.cover, v.passer] as const;
}
export function changedDimensions(a: FpVariant, b: FpVariant) {
  const x = variantDimensions(a),
    y = variantDimensions(b);
  return x.filter((value, i) => value !== y[i]).length;
}

/** Seeds checked by fpVariants.test.ts: without a decision the action is lost, a clean model
 * action gives at least a forward pass, and at least two options make sense at that moment.
 * Regenerate when the engine changes (FP_ENGINE_VERSION). */
export const FP_VARIANT_SEEDS = [
  2, 4, 10, 14, 16, 19, 23, 28, 32, 41, 42, 44, 47, 52, 56, 57, 58, 66, 67, 71, 82, 91, 96, 98, 100,
  101, 106, 112, 115, 116, 119, 120, 132, 133, 137, 140, 143, 145, 146, 149, 150, 151, 155, 165,
  167, 169, 172, 173,
] as const;

/** The next variant changes at least two parts of the problem (pressing, partners, cover…). */
export function nextVariantSeed(previous: number | null, played: number): number {
  const list = FP_VARIANT_SEEDS;
  const start = Math.abs(played * 7) % list.length;
  if (previous === null) return list[start]!;
  const before = makeVariant(previous);
  for (let i = 0; i < list.length; i++) {
    const seed = list[(start + i) % list.length]!;
    if (seed !== previous && changedDimensions(before, makeVariant(seed)) >= 2) return seed;
  }
  return list[(start + 1) % list.length]!;
}

/** A different variant that shows the same problem, for the short demonstration. */
export function siblingSeed(seed: number, same: (v: FpVariant) => boolean): number {
  const list = FP_VARIANT_SEEDS;
  const from = Math.max(0, list.indexOf(seed as (typeof list)[number]));
  for (let i = 1; i < list.length; i++) {
    const candidate = list[(from + i * 5) % list.length]!;
    if (candidate !== seed && same(makeVariant(candidate))) return candidate;
  }
  return list[(from + 1) % list.length]!;
}
