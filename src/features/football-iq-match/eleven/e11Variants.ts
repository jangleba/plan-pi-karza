/** Starting pictures of the 11v11 lesson "play the pass at the right moment".
 *
 * Full pitch (105 × 68 m), eleven players a side, 4-4-2 against 4-4-2. Your team (home)
 * attacks the goal at y = +52.5. Every picture is one attacking fragment with the ball at
 * your feet. A variant changes the problem, not only the picture:
 *  - how high the rivals' back line stands and whether it steps up as a trap,
 *  - which of your team-mates run behind the line, when they burst and in which lane.
 * Offside is judged at the moment of the pass, so the timing of the release is the lesson.
 */
import { rng, v, type V } from "../firstPerson/fpMath";

export const E11 = {
  halfWidth: 34,
  halfLength: 52.5,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  boxDepth: 16.5,
  boxHalfWidth: 20.16,
} as const;

/** Player order everywhere (frames, inputs): home 0–10, away 11–21, keeper first. */
export const SLOTS = [
  "gk",
  "lb",
  "lcb",
  "rcb",
  "rb",
  "lm",
  "lcm",
  "rcm",
  "rm",
  "ls",
  "rs",
] as const;
export type Slot = (typeof SLOTS)[number];
export const PLAYERS_PER_TEAM = 11;
export const PLAYER_COUNT = 22;
export const slotIndex = (team: "home" | "away", slot: Slot) =>
  (team === "home" ? 0 : PLAYERS_PER_TEAM) + SLOTS.indexOf(slot);
export const SLOT_LABEL: Record<Slot, string> = {
  gk: "Bramkarz",
  lb: "Lewy obrońca",
  lcb: "Lewy stoper",
  rcb: "Prawy stoper",
  rb: "Prawy obrońca",
  lm: "Lewy pomocnik",
  lcm: "Lewy środkowy pomocnik",
  rcm: "Prawy środkowy pomocnik",
  rm: "Prawy pomocnik",
  ls: "Napastnik z lewej",
  rs: "Napastnik z prawej",
};

/** Where each slot stands when the block is in the middle of the pitch (own frame, attack +y). */
export const BASE: Record<Slot, V> = {
  gk: v(0, -49),
  lb: v(-24, -33),
  lcb: v(-9, -36),
  rcb: v(9, -36),
  rb: v(24, -33),
  lm: v(-25, -12),
  lcm: v(-8, -14),
  rcm: v(8, -14),
  rm: v(25, -12),
  ls: v(-9, 10),
  rs: v(9, 8),
};

/** Shirt numbers of a 4-4-2, used in every text and on the replay. */
export const SHIRT: Record<Slot, number> = {
  gk: 1,
  rb: 2,
  lb: 3,
  lcb: 4,
  rcb: 5,
  rcm: 6,
  rm: 7,
  lcm: 8,
  ls: 9,
  rs: 10,
  lm: 11,
};
export const shirtOf = (index: number) => SHIRT[SLOTS[index % PLAYERS_PER_TEAM]!];

export type E11Role = "mid" | "fwd" | "def";
export const ROLES: readonly E11Role[] = ["mid", "fwd", "def"];
export const ROLE_LABEL: Record<E11Role, string> = {
  mid: "Pomocnik",
  fwd: "Napastnik",
  def: "Obrońca",
};
/** The slot you play and where the ball is when the fragment starts. */
export const ROLE_START: Record<E11Role, { slot: Slot; ball: V }> = {
  mid: { slot: "rcm", ball: v(6, -4) },
  fwd: { slot: "ls", ball: v(-6, 6) },
  def: { slot: "lcb", ball: v(-10, -26) },
};

export type LineStyle = "high" | "mid" | "low";
/** World y of the rivals' deepest defender at the start (they defend y = +52.5). */
export const LINE_Y: Record<LineStyle, number> = { high: 16, mid: 26, low: 36 };

export type E11Run = {
  /** The runner (a home slot; never you). */
  slot: Slot;
  /** Tick at which the run behind the line starts (he holds level with the line until then). */
  burst: number;
  /** Lane (x) of the run and how far behind the line he is heading (m). */
  lane: number;
  depth: number;
};
export type LineStep = { tick: number; delta: number; seconds: number };

export type E11Variant = {
  id: string;
  seed: number;
  role: E11Role;
  line: LineStyle;
  /** The back line steps up (toward the ball) once, catching a runner who has stayed level. */
  trap: boolean;
  steps: LineStep[];
  runs: E11Run[];
  /** World starting positions in slot order (home 0–10, away 11–21). */
  start: V[];
  ball: V;
  /** The rivals' presser reacts this many ticks after you receive. */
  pressDelay: number;
};

export const E11_VARIANT_VERSION = 1;
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;

export function makeVariant(seed: number, role: E11Role): E11Variant {
  const r = rng(seed * 7919 + 101 + ROLES.indexOf(role) * 1301);
  const line = pick(r, ["high", "mid", "low"] as const);
  const trap = r() < 0.5;
  const startLine = LINE_Y[line];
  const tySlot0 = ROLE_START[role].slot;
  // Never you: the striker you play does not run for himself.
  const sets: Slot[][] = [["ls"], ["rs"], ["ls", "rm"], ["rs", "lm"], ["ls", "rs"]];
  const options = sets.filter((set) => !set.includes(tySlot0));
  const runners = pick(r, options);
  const burst0 = 190 + Math.floor(r() * 100); // 3–5 s after the whistle
  const runs: E11Run[] = runners.map((slot, i) => ({
    slot,
    burst: burst0 + i * (24 + Math.floor(r() * 30)),
    lane: (slot.startsWith("l") ? -1 : 1) * (6 + r() * 14),
    depth: 12 + r() * 6,
  }));
  const steps: LineStep[] = [];
  if (trap) {
    // Steps up just as the first runner is about to burst: if he stays level he is caught.
    steps.push({
      tick: runs[0]!.burst - 40 - Math.floor(r() * 20),
      delta: -(4 + r() * 2),
      seconds: 0.6,
    });
  } else if (r() < 0.5) {
    // Or drops off a little: more room behind, the same timing.
    steps.push({ tick: runs[0]!.burst - 60, delta: 2 + r() * 2, seconds: 1.2 });
  }
  const j = (m = 1) => (r() - 0.5) * 2 * m;
  const { slot: tySlot, ball: roleBall } = ROLE_START[role];
  // A higher line means a higher block: you start further back, so nobody is on top of you.
  const ball = v(roleBall.x, roleBall.y + (startLine - LINE_Y.low) * 0.55);
  const start: V[] = [];
  for (const team of ["home", "away"] as const) {
    for (const slot of SLOTS) {
      const base = BASE[slot];
      let x = base.x + j(1.5);
      let y = base.y + j(1.5);
      if (team === "home") {
        // Your attackers start level with the rivals' line (onside), never beyond it.
        if (slot === "ls" || slot === "rs") y = startLine - 0.6 - r();
        else if (slot === "lm" || slot === "rm") y = startLine - 3 - r() * 2;
        if (slot === "lcm" || slot === "rcm") y = Math.max(y, ball.y - 8);
        if (slot === tySlot) {
          x = ball.x - 0.7;
          y = ball.y - 0.2;
        }
        start.push(v(clamp(x, -32, 32), clamp(y, -48, startLine - 0.6)));
      } else {
        // Rivals in their own frame, mirrored: they defend y = +52.5.
        let ay: number;
        if (slot === "gk") ay = 49;
        else if (slot === "lb" || slot === "lcb" || slot === "rcb" || slot === "rb")
          ay = startLine + j(0.6);
        else if (slot === "lm" || slot === "lcm" || slot === "rcm" || slot === "rm")
          ay = Math.min(startLine - 8, ball.y + 14) + j(1.5);
        else ay = Math.min(startLine - 14, ball.y + 20) + j(2);
        start.push(v(clamp(-x, -32, 32), ay));
      }
    }
  }
  return {
    id: `e11-${role}-${seed}`,
    seed,
    role,
    line,
    trap,
    steps,
    runs,
    start,
    ball: v(ball.x, ball.y),
    pressDelay: 300 + Math.floor(r() * 100),
  };
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Validated starting pictures: with each of these a through ball released as the runner starts
 * leads to a clear chance, and the same ball released after he has got ahead of the line is
 * offside (see e11Variants.test.ts). Seeds outside the list are playable but unchecked.
 */
export const E11_VARIANT_SEEDS: Record<E11Role, readonly number[]> = {
  mid: [1, 3, 9, 10, 20, 21, 23, 25, 27, 29, 30, 31],
  fwd: [1, 3, 8, 10, 15, 17, 22, 27, 28, 29, 30, 31],
  def: [2, 3, 6, 9, 14, 16, 22, 23, 25, 27, 37, 39],
};
/** Next picture for a role: validated seeds in turn, never the one just played twice in a row. */
export function nextVariantSeed(role: E11Role, last: number | null, played: number): number {
  const list = E11_VARIANT_SEEDS[role];
  let seed = list[played % list.length]!;
  if (seed === last) seed = list[(played + 1) % list.length]!;
  return seed;
}
