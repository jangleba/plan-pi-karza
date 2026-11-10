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
  /** Different ball outcomes one window later (TY then holds or stays): whether the first
   * choice still shapes the play once partners and rivals have reacted to it. */
  laterOutcomes: number;
  /** TY's team still had (or never had) the ball for no choice at all. */
  forcedLoss: boolean;
  /** Classes (action + target or 10 m cell) of the first decisions graded good. */
  goodKeys: string[];
};

const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];

/** A spread of legal first decisions for TY: every pass, carries/runs in 8 directions, shot,
 * shielding or staying, and in defence a press on the carrier and a mark on each rival. */
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
    add(() => attackChoice(s, "shield", at));
  } else {
    for (const r of [8, 18])
      for (const a of DIRECTIONS) add(() => attackChoice(s, "move", around(r, a)));
    // Defending: press the carrier, or close the pass to each other outfield rival.
    if (!s.world.looseBall && teamOf(s, s.world.carrierId) === "away")
      for (const p of s.players.filter((p) => p.team === "away" && !p.goalkeeper))
        add(() =>
          attackChoice(
            s,
            p.id === s.world.carrierId ? "press" : "mark",
            s.world.positions[p.id],
            p.id,
          ),
        );
    add(() => attackChoice(s, "wait", at));
  }
  return out;
}

/** What a choice is, coarsely: the same action to the same player or 10 m cell. */
export function choiceClass(c: JourneyChoice) {
  const where = c.targetId ?? `${Math.round(c.point.x / 10)}:${Math.round(c.point.y / 10)}`;
  return `${c.intent ?? "move"}:${c.delivery ?? ""}:${where}`;
}

function ballCell(s: JourneySession) {
  const b = s.world.looseBall ?? s.world.positions[s.world.carrierId];
  return `${teamOf(s, s.world.carrierId)}:${Math.round(b.x / 8)}:${Math.round(b.y / 8)}`;
}

/** One more window in which TY keeps the ball (or stays) and everyone else plays on. */
function stayOn(s: JourneySession): JourneySession {
  const own = s.world.carrierId === "you" && !s.world.looseBall;
  const at = s.world.positions.you;
  return chooseJourney(s, attackChoice(s, own ? "hold" : "wait", at).id, 3, false);
}

/** `revision` replays the audit under an older rules revision (for before/after comparisons). */
export function playability(def: JourneyDefinition, revision?: 2 | 3): Playability {
  const start = createJourneyForRules(def, 9);
  if (revision) start.attackRevision = revision;
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
    laterOutcomes: 0,
    forcedLoss: false,
    goodKeys: [],
  };
  const cells = new Set<string>(),
    later = new Set<string>();
  let kept = 0;
  const good = new Set<string>();
  for (const c of sampleChoices(start)) {
    const next = chooseJourney(start, c.id, 3, false);
    result.tried++;
    const grade = assessDecision(next, 0).grade;
    result[grade]++;
    if (grade === "good") good.add(choiceClass(c));
    cells.add(ballCell(next));
    later.add(next.outcome ? `end:${ballCell(next)}` : ballCell(stayOn(next)));
    if (teamOf(next, next.world.carrierId) === "home" || next.outcome === "chance") kept++;
  }
  result.outcomes = cells.size;
  result.laterOutcomes = later.size;
  result.forcedLoss = kind !== "rival" && kept === 0;
  result.goodKeys = [...good].sort();
  return result;
}

/** A variant worth playing: TY's first choice changes where the ball goes, at least one
 * choice is good and at least one is not, and the ball is not lost whatever TY does. */
export const isPlayable = (r: Playability) =>
  r.outcomes >= 2 && r.good >= 1 && r.good < r.tried && !r.forcedLoss;
