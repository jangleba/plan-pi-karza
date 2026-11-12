/** Scripted player for tests and checks: plays TY through the same inputs as the screen.
 * Three different ways to keep the ball under pressure, so tests can show that more than
 * one sensible decision is accepted. Never shown to the user as "the right move". */
import { angleDiff, dist, headingOf, sub } from "../firstPerson/fpMath";
import { laneMargin, nearestRival, type F5Input, type SimState } from "./f5Sim";

export type BotStyle = "pass" | "turn" | "shield" | "idle" | "careless";

/** Quantised joystick, as the screen sends it: 1/256 turn and 5% of speed. */
export const quantMove = (dir: number, speed: number) => ({
  dir: (Math.round((dir / (Math.PI * 2)) * 256) / 256) * Math.PI * 2,
  speed: Math.round(Math.max(0, Math.min(1, speed)) * 20) / 20,
});

export function createBot(style: BotStyle) {
  let move = { dir: 0, speed: 0 };
  let since = -1;
  let pressed = -1000;
  return (s: SimState): F5Input[] => {
    if (style === "idle") return [];
    const out: F5Input[] = [];
    const ty = s.players[s.ty]!;
    const setMove = (dir: number, speed: number) => {
      const q = quantMove(dir, speed);
      if (
        Math.abs(q.speed - move.speed) > 1e-9 ||
        (q.speed > 0 && Math.abs(angleDiff(q.dir, move.dir)) > 0.02)
      ) {
        move = q;
        out.push({ tick: s.tick, kind: "move", ...q });
      }
    };
    const rival = nearestRival(s, ty.pos, "home");
    const away = rival.player ? headingOf(sub(ty.pos, rival.player.pos)) : 0;
    if (s.ball.owner === s.ty) {
      if (since < 0) since = s.tick;
      const held = s.tick - since;
      const waitFor = style === "pass" ? 10 : style === "turn" ? 45 : style === "shield" ? 75 : 4;
      if (style === "careless")
        setMove(rival.player ? headingOf(sub(rival.player.pos, ty.pos)) : 0, 0.5);
      else if (style === "turn") setMove(away, 0.55);
      else if (style === "shield") setMove(away, rival.d < 2.5 ? 0.25 : 0);
      else setMove(0, 0);
      if (held >= waitFor && !s.kicks.some((k) => k.by === s.ty)) {
        let best = -1,
          bestM = style === "careless" ? -Infinity : 0.3;
        for (const i of [1, 2, 3, 4, 0]) {
          if (i === s.ty) continue;
          const m = laneMargin(s, ty.pos, s.players[i]!.pos, "home");
          if (m > bestM) {
            bestM = m;
            best = i;
          }
        }
        if (best >= 0) {
          const t = s.players[best]!;
          out.push({
            tick: s.tick,
            kind: "kick",
            type: "pass",
            dir: headingOf(sub(t.pos, ty.pos)),
            pitch: -0.2,
            power: 0.5,
            target: best,
          });
        }
      }
      return out;
    }
    since = -1;
    if (s.ball.owner === null && s.passTo === s.ty) {
      // Ball on its way: a touch away from the nearest rival (turn) or stop it (others).
      const close = dist(ty.pos, s.ball.pos) < 3;
      setMove(away, style === "turn" && close ? 0.6 : 0);
      return out;
    }
    const carrier = s.ball.owner !== null ? s.players[s.ball.owner]! : null;
    if (carrier && carrier.team === "away" && style !== "careless") {
      const d = dist(ty.pos, s.ball.pos);
      if (d < 8 && s.tick - pressed > 70) {
        pressed = s.tick;
        out.push({ tick: s.tick, kind: "press" });
      }
      if (d < 1.2) out.push({ tick: s.tick, kind: "tackle" });
      return out;
    }
    setMove(0, 0);
    return out;
  };
}

/** Plays a whole fragment with the bot and returns the inputs it sent. */
export function botInputs(s: SimState, style: BotStyle, step: (s: SimState, i: F5Input[]) => void) {
  const bot = createBot(style);
  const all: F5Input[] = [];
  while (s.phase !== "done") {
    const inputs = bot(s);
    all.push(...inputs);
    step(s, inputs);
  }
  return all;
}
