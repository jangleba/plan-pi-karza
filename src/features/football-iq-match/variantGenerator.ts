/** Seeded variants of the hand-placed IQ situations (rules v9).
 *
 * A variant changes the decision problem, not the picture: who presses the ball and from
 * where, which passing lane is closed, which team-mate is free, how high the line behind
 * the ball stands, and where TY starts. Mirroring or shifting everyone is not a variant.
 *
 * The output is a pure function of (situation, seed). Saved attempts replay from it, so
 * this file must not change the layout of an already published seed: a change to the
 * transforms needs a new GENERATOR_VERSION (new definition ids), never an edit in place.
 */
import type { Point } from "./types";

export const GENERATOR_VERSION = 1;

export type VariantLayout = {
  carrier: string;
  positions: Record<string, Point>;
  numbers: Record<string, number>;
};

export type TransformKind = "press" | "space" | "lane" | "free" | "line" | "you";
export type Transform = { kind: TransformKind; detail: string };
export type Variant = { seed: number; layout: VariantLayout; transforms: Transform[] };

/** Small, well-known 32-bit PRNG; the same seed gives the same numbers everywhere. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEEPER_IDS = new Set(["keeper", "home-keeper"]);
const isAway = (id: string) => id === "keeper" || /^r\d+$/.test(id);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (n: number) => Math.round(n * 2) / 2;
/** Inside the pitch with room to move; goalkeepers keep their own spots. */
const clampField = (p: Point): Point => ({
  x: round(Math.max(6, Math.min(94, p.x))),
  y: round(Math.max(10, Math.min(130, p.y))),
});
const polar = (from: Point, angle: number, r: number): Point => ({
  x: from.x + Math.sin(angle) * r,
  y: from.y + Math.cos(angle) * r,
});

/** Nearest player who stands too close to the carrier to be ignored is pushed back to this. */
export const MIN_PRESS_GAP = 3.5;
const MIN_GAP = 2.5;

type Ctx = {
  pos: Record<string, Point>;
  carrier: string;
  rand: () => number;
};
const pick = <T>(rand: () => number, list: T[]) => list[Math.floor(rand() * list.length)];
const outfield = (ctx: Ctx) => Object.keys(ctx.pos).filter((id) => !KEEPER_IDS.has(id));
const opponentsOfCarrier = (ctx: Ctx) =>
  outfield(ctx).filter((id) => isAway(id) !== isAway(ctx.carrier));
const mates = (ctx: Ctx) =>
  outfield(ctx).filter((id) => isAway(id) === isAway(ctx.carrier) && id !== ctx.carrier);
/** y direction in which the carrier's team attacks (home attacks toward y = 6). */
const forward = (ctx: Ctx) => (isAway(ctx.carrier) ? 1 : -1);
const byDistance = (ctx: Ctx, ids: string[], to: Point) =>
  [...ids].sort((a, b) => dist(ctx.pos[a], to) - dist(ctx.pos[b], to));
/** The defender TY's choice is not about: never TY, so TY's own start stays authored. */
const presserOf = (ctx: Ctx) =>
  byDistance(
    ctx,
    opponentsOfCarrier(ctx).filter((id) => id !== "you"),
    ctx.pos[ctx.carrier],
  )[0];

const TRANSFORMS: Record<TransformKind, (ctx: Ctx) => Transform | null> = {
  /** The nearest opponent closes the ball from a different side. */
  press(ctx) {
    const id = presserOf(ctx);
    if (!id) return null;
    const ball = ctx.pos[ctx.carrier];
    const sides = [
      { detail: "od bramki", angle: forward(ctx) > 0 ? 0 : Math.PI },
      { detail: "od środka", angle: ball.x < 50 ? Math.PI / 2 : -Math.PI / 2 },
      { detail: "od linii bocznej", angle: ball.x < 50 ? -Math.PI / 2 : Math.PI / 2 },
      { detail: "od tyłu", angle: forward(ctx) > 0 ? Math.PI : 0 },
    ];
    const side = pick(ctx.rand, sides);
    ctx.pos[id] = clampField(polar(ball, side.angle, 4 + ctx.rand() * 2.5));
    return { kind: "press", detail: `doskok ${side.detail}` };
  },
  /** No immediate pressure: the nearest opponent drops off and guards space instead. */
  space(ctx) {
    const id = presserOf(ctx);
    if (!id) return null;
    const ball = ctx.pos[ctx.carrier];
    const goalSide = { x: ball.x + (50 - ball.x) * 0.3, y: ball.y - forward(ctx) * 11 };
    ctx.pos[id] = clampField({ x: goalSide.x + (ctx.rand() - 0.5) * 6, y: goalSide.y });
    return { kind: "space", detail: "rywal odpuszcza doskok" };
  },
  /** An opponent stands in the lane to one team-mate of the carrier. */
  lane(ctx) {
    const ball = ctx.pos[ctx.carrier];
    const receivers = mates(ctx).filter((id) => dist(ctx.pos[id], ball) > 9);
    if (!receivers.length) return null;
    const target = pick(ctx.rand, receivers);
    const presser = presserOf(ctx);
    const blockers = byDistance(
      ctx,
      opponentsOfCarrier(ctx).filter((id) => id !== presser && id !== "you"),
      ctx.pos[target],
    );
    if (!blockers.length) return null;
    const t = 0.45 + ctx.rand() * 0.2;
    const lanePoint = {
      x: ball.x + (ctx.pos[target].x - ball.x) * t,
      y: ball.y + (ctx.pos[target].y - ball.y) * t,
    };
    ctx.pos[blockers[0]] = clampField({ x: lanePoint.x + (ctx.rand() - 0.5) * 2, y: lanePoint.y });
    return { kind: "lane", detail: `zamknięta linia do ${target}` };
  },
  /** One team-mate of the carrier moves into the freest nearby space. */
  free(ctx) {
    const candidates = mates(ctx).filter((id) => id !== "you");
    if (!candidates.length) return null;
    const id = pick(ctx.rand, candidates);
    const from = ctx.pos[id];
    const others = Object.keys(ctx.pos).filter((o) => o !== id && isAway(o) !== isAway(id));
    let best = from,
      bestGap = -1;
    for (let k = 0; k < 8; k++) {
      const spot = clampField(
        polar(from, (k / 8) * Math.PI * 2 + ctx.rand() * 0.4, 7 + ctx.rand() * 4),
      );
      const gap = Math.min(...others.map((o) => dist(ctx.pos[o], spot)));
      if (gap > bestGap) [best, bestGap] = [spot, gap];
    }
    ctx.pos[id] = best;
    return { kind: "free", detail: `wolny ${id}` };
  },
  /** The line behind the ball (opponents between the ball and their goal) steps up or drops. */
  line(ctx) {
    const ball = ctx.pos[ctx.carrier];
    const dir = forward(ctx);
    const behind = opponentsOfCarrier(ctx).filter(
      (id) => id !== "you" && (ctx.pos[id].y - ball.y) * dir > 3,
    );
    if (!behind.length) return null;
    const up = ctx.rand() < 0.5;
    const shift = (up ? -1 : 1) * dir * (6 + ctx.rand() * 4);
    for (const id of behind) ctx.pos[id] = clampField({ ...ctx.pos[id], y: ctx.pos[id].y + shift });
    return { kind: "line", detail: up ? "wysoka linia" : "niska linia" };
  },
  /** TY starts somewhere else, so TY's own problem changes, not only the rivals'. */
  you(ctx) {
    if (!ctx.pos.you) return null;
    const angle = ctx.rand() * Math.PI * 2;
    ctx.pos.you = clampField(polar(ctx.pos.you, angle, 8 + ctx.rand() * 4));
    return { kind: "you", detail: "inne miejsce startu" };
  },
};
export const TRANSFORM_KINDS = Object.keys(TRANSFORMS) as TransformKind[];

/** Keeps the picture legal: nobody on top of anybody, and the carrier gets a first touch. */
function settle(ctx: Ctx) {
  const ids = Object.keys(ctx.pos);
  for (let pass = 0; pass < 4; pass++)
    for (const a of ids)
      for (const b of ids) {
        if (a >= b || KEEPER_IDS.has(b)) continue;
        const pa = ctx.pos[a],
          pb = ctx.pos[b];
        const gap = dist(pa, pb);
        const minGap =
          (a === ctx.carrier || b === ctx.carrier) && isAway(a) !== isAway(b)
            ? MIN_PRESS_GAP
            : MIN_GAP;
        if (gap >= minGap) continue;
        // Move b (or a, when b is the carrier) straight away from the other one.
        const [still, moving] = b === ctx.carrier ? [b, a] : [a, b];
        if (KEEPER_IDS.has(moving)) continue;
        const from = ctx.pos[still],
          at = ctx.pos[moving];
        const angle = gap > 0.01 ? Math.atan2(at.x - from.x, at.y - from.y) : 0.7;
        ctx.pos[moving] = clampField(polar(from, angle, minGap + 0.5));
      }
}

/** Two different transforms per seed, then a settling pass. */
export function generateVariant(base: VariantLayout, seed: number): Variant {
  const rand = mulberry32(seed * 7919 + GENERATOR_VERSION);
  const ctx: Ctx = { pos: structuredClone(base.positions), carrier: base.carrier, rand };
  const kinds = [...TRANSFORM_KINDS];
  const transforms: Transform[] = [];
  while (transforms.length < 2 && kinds.length) {
    const kind = kinds.splice(Math.floor(rand() * kinds.length), 1)[0];
    const done = TRANSFORMS[kind](ctx);
    if (!done) continue;
    transforms.push(done);
    // Pressing and dropping off are two answers to the same question: never both.
    if (kind === "press" || kind === "space")
      kinds.splice(kinds.indexOf(kind === "press" ? "space" : "press"), 1);
  }
  settle(ctx);
  return { seed, transforms, layout: { ...base, positions: ctx.pos } };
}

/** The transform pair with its details (pressing side, closed lane, line height...) as a
 * key: variants of one situation must not repeat one. */
export const variantShape = (v: Variant) =>
  v.transforms
    .map((t) => `${t.kind}(${t.detail})`)
    .sort()
    .join("+");
