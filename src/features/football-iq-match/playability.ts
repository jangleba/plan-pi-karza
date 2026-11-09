/** Playability audit of one IQ variant (rules v9).
 * Plays TY's first decision many different ways on the same picture and measures
 * whether the choice matters: how many choices are graded good, how many different
 * ball outcomes the choices produce, and whether the ball is lost whatever TY does.
 * Pure and deterministic; used by tests to keep the scenario bank honest.
 */
import { attackChoice } from "./attackJourney";
import { assessDecision } from "./decisionAssessment";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { bound, teamOf } from "./tacticalWorld";
import type { JourneyChoice, JourneyDefinition, JourneySession } from "./journeyTypes";

export type Playability = {
  id: string;
  /** Who has the ball at TY's first decision. */
  kind: "own" | "partner" | "rival" | "loose";
  tried: number;
  good: number;
  possible: number;
  error: number;
  /** Different ball outcomes (team + 8 m cell of the ball) after the first decision. */
  outcomes: number;
  /** TY's team still had (or never had) the ball for no choice at all. */
  forcedLoss: boolean;
};

const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];

/** A spread of legal first decisions for TY: every pass, carries/runs in 8 directions, hold/wait. */
export function sampleChoices(s: JourneySession): JourneyChoice[] {
  const at = s.world.positions.you;
  const own = s.world.carrierId === "you" && !s.world.looseBall;
  const out: JourneyChoice[] = [];
  const add = (f: () => JourneyChoice) => {
    try {
      out.push(f());
    } catch {
      // An illegal sample (e.g. a shot by the keeper) is simply not offered.
    }
  };
  const around = (r: number, a: number) =>
    bound(at.x + Math.sin((a * Math.PI) / 180) * r, at.y - Math.cos((a * Math.PI) / 180) * r);
  if (own) {
    for (const p of s.players.filter((p) => p.team === "home" && p.id !== "you"))
      for (const d of ["ground", "lofted"] as const)
        add(() => attackChoice(s, "pass", s.world.positions[p.id], p.id, d));
    for (const a of DIRECTIONS) add(() => attackChoice(s, "carry", around(10, a)));
    for (const a of [-40, 0, 40]) add(() => attackChoice(s, "pass", around(25, a)));
    add(() => attackChoice(s, "shoot", { x: 50, y: 6 }));
    add(() => attackChoice(s, "hold", at));
  } else {
    for (const r of [8, 18])
      for (const a of DIRECTIONS) add(() => attackChoice(s, "move", around(r, a)));
    add(() => attackChoice(s, "wait", at));
  }
  return out;
}

function ballCell(s: JourneySession) {
  const b = s.world.looseBall ?? s.world.positions[s.world.carrierId];
  return `${teamOf(s, s.world.carrierId)}:${Math.round(b.x / 8)}:${Math.round(b.y / 8)}`;
}

export function playability(def: JourneyDefinition): Playability {
  const start = createJourneyForRules(def, 9);
  const own = start.world.carrierId === "you" && !start.world.looseBall;
  const kind: Playability["kind"] = start.world.looseBall
    ? "loose"
    : own
      ? "own"
      : teamOf(start, start.world.carrierId) === "home"
        ? "partner"
        : "rival";
  const result: Playability = {
    id: def.id,
    kind,
    tried: 0,
    good: 0,
    possible: 0,
    error: 0,
    outcomes: 0,
    forcedLoss: false,
  };
  const cells = new Set<string>();
  let kept = 0;
  for (const c of sampleChoices(start)) {
    const next = chooseJourney(start, c.id, 3, false);
    result.tried++;
    result[assessDecision(next, 0).grade]++;
    cells.add(ballCell(next));
    if (teamOf(next, next.world.carrierId) === "home" || next.outcome === "chance") kept++;
  }
  result.outcomes = cells.size;
  result.forcedLoss = kind !== "rival" && kept === 0;
  return result;
}
