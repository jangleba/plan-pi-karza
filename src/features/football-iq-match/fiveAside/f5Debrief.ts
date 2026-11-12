/** What the player is told after a 5v5 fragment. Lesson topic: receive and keep the ball
 * under pressure.
 *
 * Graded separately and only from your own actions in the simulator:
 * - Przyjęcie (execution): where the first touch took the ball relative to the nearest rival.
 * - Decyzja (choice): what you did with the ball under pressure. Several answers are good:
 *   a safe pass back or square, a pass forward, turning away into space, keeping it until a
 *   partner is free. A shot from a sensible distance counts too.
 * - Rezultat: how the fragment ended for the team.
 * Plus one concrete tip for the next fragment. The texts talk about space, rivals and timing
 * only: nothing about where to look or how to hold the body, and the phone's movement is never
 * described as a measure of anything.
 */
import { headingOf, sub } from "../firstPerson/fpMath";
import type { F5Event, OutcomeKind, SimState } from "./f5Sim";

export type Grade = "good" | "ok" | "poor";
export type ProblemKey =
  | "touchIntoPressure"
  | "stoppedUnderPressure"
  | "heldTooLong"
  | "blockedLane"
  | "noReaction"
  | "neverReceived"
  | "none";

export type F5Debrief = {
  outcome: OutcomeKind;
  /** Tick to start the replay from (a moment before your first ball). */
  keyTick: number;
  execution: { grade: Grade; text: string };
  choice: { grade: Grade; text: string; kind: SolutionKind | null };
  result: { text: string };
  tip: string;
  problem: ProblemKey;
};

export type SolutionKind = "safePass" | "forwardPass" | "turn" | "keep" | "shot" | "lost";

export const RESULT_TEXT: Record<OutcomeKind, string> = {
  goal: "Bramka dla twojej drużyny.",
  conceded: "Rywale strzelili bramkę.",
  shot: "Akcja skończyła się strzałem twojej drużyny.",
  shotAgainst: "Rywale oddali strzał.",
  kept: "Twoja drużyna utrzymała piłkę do końca fragmentu.",
  lost: "Rywale utrzymali piłkę po odbiorze.",
  out: "Piłka wyszła poza boisko po zagraniu twojej drużyny.",
  outAgainst: "Piłka wyszła poza boisko po zagraniu rywali.",
};

const TIPS: Record<ProblemKey, string> = {
  touchIntoPressure:
    "Pierwszym kontaktem zabieraj piłkę w stronę, z której nie nadbiega rywal. Wtedy zyskujesz czas na podanie.",
  stoppedUnderPressure:
    "Gdy rywal jest już blisko, nie zatrzymuj piłki w miejscu. Przyjmij ją w bok, w wolną przestrzeń.",
  heldTooLong:
    "Utrzymanie piłki to nie czekanie. Gdy partner wyjdzie na wolną pozycję, zagraj od razu, zanim dojdzie drugi rywal.",
  blockedLane:
    "Podawaj tylko wtedy, gdy między tobą a partnerem nie stoi rywal. Jeśli linia jest zamknięta, poczekaj, aż partner się przesunie, albo zagraj do innego.",
  noReaction:
    "Po stracie od razu zamknij najbliższą drogę do bramki albo doskocz do rywala z piłką. Pierwsze dwie sekundy decydują.",
  neverReceived:
    "Ustaw się tak, żeby między tobą a piłką nie stał żaden rywal. Wtedy bramkarz albo partner może ci podać.",
  none: "Dobrze. Następnym razem spróbuj zagrać szybciej, gdy tylko pojawi się wolny partner przed linią piłki.",
};

const CHOICE_TEXT: Record<SolutionKind, string> = {
  safePass: "Utrzymałeś piłkę bezpiecznym podaniem do wolnego partnera.",
  forwardPass: "Podałeś do przodu, do wolnego partnera, i drużyna zyskała teren.",
  turn: "Odszedłeś z piłką od rywala w wolne miejsce i utrzymałeś ją.",
  keep: "Utrzymałeś piłkę pod presją, aż drużyna mogła ją rozegrać.",
  shot: "Zakończyłeś akcję strzałem.",
  lost: "Rywal odebrał ci piłkę.",
};

type Spell = {
  start: number;
  end: number;
  ended: "pass" | "shot" | "tackled" | "lost" | "kept";
  pass: Extract<F5Event, { type: "pass" }> | null;
  completed: boolean;
  touch: Extract<F5Event, { type: "touch" }> | null;
};

/** TY's spells with the ball (from receiving to giving it away), read from the events. */
export function tySpells(s: SimState): Spell[] {
  const spells: Spell[] = [];
  const ev = s.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]!;
    if (e.type !== "control" || e.by !== s.ty) continue;
    const touch =
      [...ev.slice(Math.max(0, i - 3), i + 1)]
        .reverse()
        .find(
          (x): x is Extract<F5Event, { type: "touch" }> => x.type === "touch" && x.by === s.ty,
        ) ?? null;
    // A touch away from the feet comes before control: start the spell at the touch.
    const start = touch && touch.tick <= e.tick && e.tick - touch.tick < 40 ? touch.tick : e.tick;
    if (spells.length && spells.at(-1)!.end >= start) continue;
    let end = s.tick,
      ended: Spell["ended"] = "kept",
      pass: Spell["pass"] = null,
      completed = false;
    for (let j = i + 1; j < ev.length; j++) {
      const x = ev[j]!;
      if (x.type === "pass" && x.by === s.ty) {
        end = x.tick;
        ended = "pass";
        pass = x;
        const next = ev.slice(j + 1).find((y) => y.type === "control" && y.from !== "start");
        completed = !!next && next.type === "control" && next.by < 5 && next.by !== s.ty;
        break;
      }
      if (x.type === "shot" && x.by === s.ty) {
        end = x.tick;
        ended = "shot";
        break;
      }
      if (x.type === "tackle" && x.from === s.ty && x.won) {
        end = x.tick;
        ended = "tackled";
        break;
      }
      if (x.type === "control" && x.by !== s.ty) {
        end = x.tick;
        ended = x.by >= 5 ? "lost" : "kept";
        break;
      }
    }
    spells.push({ start, end, ended, pass, completed, touch });
  }
  return spells;
}

function gradeTouch(spell: Spell): { grade: Grade; text: string; problem: ProblemKey | null } {
  const t = spell.touch;
  const lostQuick =
    (spell.ended === "tackled" || spell.ended === "lost") && spell.end - spell.start < 60;
  if (!t)
    return { grade: "ok", text: "Piłka trafiła do ciebie bez przyjęcia z podania.", problem: null };
  if (t.dir !== null) {
    if (t.away >= 1.9 && !lostQuick)
      return {
        grade: "good",
        text: "Przyjąłeś piłkę od rywala, w wolną przestrzeń.",
        problem: null,
      };
    if (t.away >= 1.2 && !lostQuick)
      return {
        grade: "ok",
        text: "Przyjąłeś piłkę w bok od rywala, ale niedaleko od niego.",
        problem: null,
      };
    return {
      grade: "poor",
      text: "Pierwszym kontaktem zabrałeś piłkę w stronę rywala.",
      problem: "touchIntoPressure",
    };
  }
  if (t.pressure > 3.5 && !lostQuick)
    return {
      grade: "good",
      text: "Zatrzymałeś piłkę, gdy rywal był jeszcze daleko.",
      problem: null,
    };
  if (t.pressure > 2 && !lostQuick)
    return { grade: "ok", text: "Zatrzymałeś piłkę przy nadbiegającym rywalu.", problem: null };
  return {
    grade: "poor",
    text: "Zatrzymałeś piłkę w miejscu z rywalem tuż obok.",
    problem: "stoppedUnderPressure",
  };
}

function gradeChoice(
  s: SimState,
  spell: Spell,
): {
  grade: Grade;
  kind: SolutionKind;
  problem: ProblemKey | null;
} {
  const held = spell.end - spell.start;
  if (spell.ended === "shot") {
    const shot = s.events.find((e) => e.type === "shot" && e.by === s.ty);
    const d = shot && shot.type === "shot" ? shot.distance : 30;
    return { grade: d < 14 ? "good" : "ok", kind: "shot", problem: null };
  }
  if (spell.ended === "pass" && spell.pass) {
    const p = spell.pass;
    const forward =
      p.to !== null &&
      (() => {
        const from = s.frames[p.tick]?.agents[s.ty];
        const to = s.frames[p.tick]?.agents[p.to];
        return !!from && !!to && to.y - from.y > 3;
      })();
    if (spell.completed) {
      if (p.lane >= 0.25)
        return { grade: "good", kind: forward ? "forwardPass" : "safePass", problem: null };
      return { grade: "ok", kind: forward ? "forwardPass" : "safePass", problem: "blockedLane" };
    }
    return {
      grade: p.lane < 0.15 ? "poor" : "ok",
      kind: "lost",
      problem: p.lane < 0.15 ? "blockedLane" : null,
    };
  }
  if (spell.ended === "tackled" || spell.ended === "lost") {
    return {
      grade: "poor",
      kind: "lost",
      problem: held > 150 ? "heldTooLong" : null,
    };
  }
  // Kept to the end of the fragment or played on by a partner after a loose touch.
  const moved = movedAway(s, spell);
  return { grade: held > 90 ? "good" : "ok", kind: moved ? "turn" : "keep", problem: null };
}

function movedAway(s: SimState, spell: Spell) {
  const a = s.frames[spell.start]?.agents[s.ty];
  const b = s.frames[Math.min(spell.end, s.frames.length - 1)]?.agents[s.ty];
  return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) > 4;
}

/** After the team lost the ball: did you close the ball down or get goal side within 2 s? */
export function reactionAfterLoss(s: SimState): "good" | "poor" | null {
  const loss = s.events.find(
    (e, i) => e.type === "possession" && e.team === "away" && i > 1 && e.tick > 30,
  );
  if (!loss || s.frames.length < loss.tick + 2) return null;
  const end = Math.min(s.frames.length - 1, loss.tick + 120);
  if (end - loss.tick < 60) return null;
  if (
    s.events.some(
      (e) =>
        (e.type === "press" || e.type === "tackle") &&
        e.by === s.ty &&
        e.tick >= loss.tick &&
        e.tick <= end,
    )
  )
    return "good";
  const f0 = s.frames[loss.tick]!,
    f1 = s.frames[end]!;
  const d = (f: typeof f0) =>
    Math.hypot(f.agents[s.ty]!.x - f.ball.x, f.agents[s.ty]!.y - f.ball.y);
  // Closer to the ball, or back towards the own goal (goal side of the ball).
  const closer = d(f0) - d(f1) > 2;
  const back = f0.agents[s.ty]!.y - f1.agents[s.ty]!.y > 3 && f1.agents[s.ty]!.y < f1.ball.y;
  return closer || back ? "good" : "poor";
}

export function buildDebrief(s: SimState): F5Debrief {
  const outcome = s.outcome?.kind ?? "kept";
  const spells = tySpells(s);
  const first = spells[0] ?? null;
  const firstTouch = s.events.find((e) => e.type === "touch" && e.by === s.ty);
  const keyTick = Math.max(0, (first?.start ?? firstTouch?.tick ?? 60) - 90);
  const result = { text: RESULT_TEXT[outcome] };
  if (!first) {
    return {
      outcome,
      keyTick,
      execution: { grade: "poor", text: "Piłka do ciebie nie dotarła." },
      choice: { grade: "poor", text: "Nie miałeś piłki w tym fragmencie.", kind: null },
      result,
      tip: TIPS.neverReceived,
      problem: "neverReceived",
    };
  }
  const touch = gradeTouch(first);
  const choice = gradeChoice(s, first);
  const reaction = reactionAfterLoss(s);
  // One tip: the first problem in the order the action happened.
  const problem: ProblemKey =
    touch.problem ?? choice.problem ?? (reaction === "poor" ? "noReaction" : null) ?? "none";
  let choiceText = CHOICE_TEXT[choice.kind];
  if (choice.kind === "lost" && first.pass) choiceText = "Podanie przejął rywal.";
  if (problem === "blockedLane" && choice.grade === "ok" && first.completed)
    choiceText += " Rywal był jednak blisko linii podania.";
  if (reaction === "good" && choice.kind === "lost")
    choiceText += " Po stracie od razu wróciłeś do gry.";
  return {
    outcome,
    keyTick,
    execution: { grade: touch.grade, text: touch.text },
    choice: { grade: choice.grade, text: choiceText, kind: choice.kind },
    result,
    tip: TIPS[problem],
    problem,
  };
}

/** Heading from TY to the passer of the first ball: where the view starts. */
export function startYaw(s: SimState) {
  const ty = s.players[s.ty]!.pos,
    gk = s.players[0]!.pos;
  return -headingOf(sub(gk, ty));
}
