/** Small-sided pitch and seeded starting pictures of the 5v5 lesson
 * "receive and keep the ball under pressure".
 *
 * Coordinates are metres: x across (−12.5 … 12.5), y along the pitch (−20 … 20).
 * The home team (yours) attacks the goal at y = +20.
 *
 * A variant changes the problem, not only the picture: the side the nearest rival presses
 * from, when he jumps, how the rest of the rivals defend (man-marking high or a compact block)
 * and how your partners spread. Every fragment starts with your goalkeeper's distribution to
 * you. The validated seeds live in F5_VARIANT_SEEDS (see f5Variants.test.ts).
 */
import { rng, type V } from "../firstPerson/fpMath";

/** 40 × 25 m pitch with 3.66 × 1.83 m goals (a common 5-a-side size). No offside. */
export const F5_PITCH = {
  halfWidth: 12.5,
  halfLength: 20,
  goalHalfWidth: 1.83,
  goalHeight: 1.83,
  boxDepth: 6,
  boxHalfWidth: 7,
  centreRadius: 3,
} as const;

export const POSITIONS = ["def", "left", "right", "pivot"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<Position, string> = {
  def: "Obrońca",
  left: "Lewy skrzydłowy",
  right: "Prawy skrzydłowy",
  pivot: "Napastnik",
};

/** Player order everywhere (frames, inputs): home 0–4, away 5–9, keeper first. */
export const SLOTS = ["gk", "def", "left", "right", "pivot"] as const;
export type Slot = (typeof SLOTS)[number];
export const PLAYER_COUNT = 10;
export const slotIndex = (team: "home" | "away", slot: Slot) =>
  (team === "home" ? 0 : 5) + SLOTS.indexOf(slot);

export type PressFrom = "inside" | "outside" | "behind";
/** early: already close · onPass: jumps when the keeper releases · late: waits for the touch. */
export type PressTiming = "early" | "onPass" | "late";
/** high: every rival marks a man · block: compact zone, one rival presses. */
export type RivalShape = "high" | "block";
/** wide: wingers hold the touchlines · inside: wingers come inside, the pivot drops. */
export type HomeShape = "wide" | "inside";

export type F5Variant = {
  id: string;
  seed: number;
  position: Position;
  press: PressFrom;
  timing: PressTiming;
  rivals: RivalShape;
  shape: HomeShape;
  /** World starting positions in slot order (home 0–4, away 5–9). */
  start: V[];
};

export const F5_VARIANT_VERSION = 1;
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;

/** Away player who presses the receiver: the direct opponent of his position. */
export const PRESSER_FOR: Record<Position, Slot> = {
  def: "pivot",
  left: "right",
  right: "left",
  pivot: "def",
};

export function makeVariant(seed: number, position: Position): F5Variant {
  const r = rng(seed * 6151 + 29 + POSITIONS.indexOf(position) * 977);
  const press = pick(r, ["inside", "outside", "behind"] as const);
  const timing = pick(r, ["early", "onPass", "late"] as const);
  const rivals = pick(r, ["high", "block"] as const);
  const shape = pick(r, ["wide", "inside"] as const);
  const j = (m = 1) => (r() - 0.5) * 2 * m;

  const home: Record<Slot, V> = {
    gk: { x: 0, y: -19 },
    def: { x: j(1.5), y: -12 + j() },
    left: shape === "wide" ? { x: -10 + j(0.6), y: -6 + j(1.5) } : { x: -7 + j(), y: -4 + j(1.5) },
    right: shape === "wide" ? { x: 10 + j(0.6), y: -6 + j(1.5) } : { x: 7 + j(), y: -4 + j(1.5) },
    pivot: shape === "wide" ? { x: j(2), y: 4 + j(2) } : { x: j(2), y: -1 + j(1.5) },
  };
  // The receiver comes towards the keeper a little: the first ball must be playable.
  const ty = home[position];
  if (position === "pivot") ty.y = Math.min(ty.y, -2 + j());
  if (position === "left" || position === "right") ty.y = Math.min(ty.y, -5 + j());

  // The presser starts goal side of the receiver; distance by timing, side by `press`.
  const towardCentre = ty.x === 0 ? 1 : -Math.sign(ty.x);
  const distance = timing === "early" ? 3.2 : timing === "onPass" ? 6 : 7.5;
  const offset =
    press === "behind"
      ? { x: j(0.6), y: distance }
      : press === "inside"
        ? { x: towardCentre * distance * 0.75, y: distance * 0.65 }
        : { x: -towardCentre * distance * 0.75, y: distance * 0.65 };
  const presserSlot = PRESSER_FOR[position];
  const presserPos = clampPitch({ x: ty.x + offset.x, y: ty.y + offset.y });

  // Rivals (attacking −y). High: each marks his direct opponent goal side. Block: a compact
  // zone in front of their goal.
  const markOf = (slot: Slot): V => {
    const target =
      home[
        ({ def: "pivot", left: "right", right: "left", pivot: "def" } as const)[
          slot as Exclude<Slot, "gk">
        ]
      ];
    return { x: target.x + j(0.8), y: target.y + 2.6 + j(0.6) };
  };
  const away: Record<Slot, V> =
    rivals === "high"
      ? {
          gk: { x: 0, y: 19 },
          def: markOf("def"),
          left: markOf("left"),
          right: markOf("right"),
          pivot: markOf("pivot"),
        }
      : {
          gk: { x: 0, y: 19 },
          def: { x: j(1.5), y: 11 + j() },
          left: { x: 5.5 + j(), y: 5 + j() },
          right: { x: -5.5 + j(), y: 5 + j() },
          pivot: { x: j(2), y: 0 + j() },
        };
  away[presserSlot] = presserPos;

  const start = [
    ...SLOTS.map((s) => clampPitch(home[s])),
    ...SLOTS.map((s) => clampPitch(away[s])),
  ];
  return {
    id: `f5v${F5_VARIANT_VERSION}-${position}-${seed}`,
    seed,
    position,
    press,
    timing,
    rivals,
    shape,
    start,
  };
}

function clampPitch(p: V): V {
  return {
    x: Math.max(-F5_PITCH.halfWidth + 0.8, Math.min(F5_PITCH.halfWidth - 0.8, p.x)),
    y: Math.max(-F5_PITCH.halfLength + 0.8, Math.min(F5_PITCH.halfLength - 0.8, p.y)),
  };
}

export function variantFromId(id: string): F5Variant | null {
  const m = /^f5v1-(def|left|right|pivot)-(\d{1,6})$/.exec(id);
  if (!m) return null;
  return makeVariant(Number(m[2]), m[1] as Position);
}

/** Validated seeds per position: the keeper's first ball reaches you (with no input from
 * you) and the fragment ends by itself. Checked by f5Variants.test.ts; regenerate when the
 * engine changes. */
export const F5_VARIANT_SEEDS: Readonly<Record<Position, readonly number[]>> = {
  def: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 17, 18, 19, 21, 23, 24, 26, 27, 29, 30, 31],
  left: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  right: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 21, 22, 23, 25, 26, 27, 28],
  pivot: [
    1, 3, 5, 6, 7, 10, 16, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36,
  ],
};

const dims = (v: F5Variant) => [v.press, v.timing, v.rivals, v.shape];
/** The next variant changes at least two parts of the problem (not only the picture). */
export function nextVariantSeed(
  position: Position,
  previous: F5Variant | null,
  played: number,
): number {
  const seeds = F5_VARIANT_SEEDS[position];
  const startAt = Math.abs(played * 7 + (previous?.seed ?? 0)) % seeds.length;
  for (let k = 0; k < seeds.length; k++) {
    const seed = seeds[(startAt + k) % seeds.length]!;
    if (!previous) return seed;
    if (seed === previous.seed) continue;
    const next = makeVariant(seed, position);
    const changed = dims(next).filter((d, i) => d !== dims(previous)[i]).length;
    if (changed >= 2) return seed;
  }
  return seeds[startAt]!;
}
