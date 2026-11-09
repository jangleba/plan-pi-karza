import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { attackChoice } from "./attackJourney";
import {
  assessAction,
  assessDecision,
  keyMoment,
  lessonAim,
  momentRange,
  type DecisionAssessment,
} from "./decisionAssessment";
import { decisionOptions } from "./decisionOptions";
import { makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { chooseJourney, createJourneyForRules, journeyDuration } from "./journeyEngine";
import type { JourneySession } from "./journeyTypes";
import { situationBank } from "./situationBank";

const wing = advancedJourneyBank.find((d) => d.id === "iqx-wing-0-0")!;

function shotFrom(x: number, y: number) {
  const s = createJourneyForRules(wing, 9);
  s.world.carrierId = "you";
  s.world.positions.you = { x, y };
  for (const p of s.players)
    if (!p.goalkeeper && p.id !== "you") s.world.positions[p.id] = { x: 10 + p.number * 2, y: 90 };
  const keeper = s.players.find((p) => p.goalkeeper && p.team === "away")!;
  s.world.positions[keeper.id] = { x: 50, y: 8 };
  return s;
}

/** Deterministic plays through every hand-placed situation with the ready-made options. */
function plays(seeds = 1) {
  const out: JourneySession[] = [];
  for (const def of situationBank)
    for (let seed = 0; seed < seeds; seed++) {
      let s: JourneySession = { ...createJourneyForRules(def, 9), controlledId: "you" };
      let r = def.ordinal * 31 + seed * 7;
      for (let i = 0; i < 6 && !s.outcome; i++) {
        const options = decisionOptions(s);
        if (!options.length) break;
        r = (r * 1103515245 + 12345) % 2147483648;
        s = { ...chooseJourney(s, options[r % options.length].choice.id, 1), controlledId: "you" };
      }
      out.push(s);
    }
  return out;
}

const BODY_CUES = /głow|ramię|ramie|bioder|ręk|spójrz|spojrz|wzrok|ostatniego obrońcy/i;

describe("TY's own contribution", () => {
  it("every simulation event is typed and names who did it", () => {
    for (const s of plays().slice(0, 12))
      for (const e of s.beats.flatMap((b) => b.events ?? [])) {
        expect(e.type).toBeTruthy();
        if (e.type !== "loose" && e.type !== "approach") expect(e.actorId).toBeTruthy();
      }
  }, 120_000);

  it("a shot from a good place is a good decision even when the keeper saves it", () => {
    const s = shotFrom(50, 18);
    const next = chooseJourney(s, attackChoice(s, "shoot", { x: 50, y: 0 }).id, 1);
    expect(next.attack?.finish).toBeUndefined();
    const a = assessDecision(next, 0);
    expect(a.facts.shot?.result).toBe("save");
    expect(a.grade).toBe("good");
    expect(a.happened).toContain("Bramkarz broni");
    expect(a.happened).not.toContain("przecina");
  });

  it("a shot from the side that misses is not graded as good", () => {
    const s = shotFrom(36, 18);
    const next = chooseJourney(s, attackChoice(s, "shoot", { x: 36, y: 0 }).id, 1);
    const a = assessDecision(next, 0);
    expect(a.facts.shot?.result).toBe("miss");
    expect(a.grade).not.toBe("good");
    expect(a.problem).toBe("shot-angle");
    expect(a.task).toBeTruthy();
  });

  it("without the ball, only TY's own offside is an error — never the team losing the ball", () => {
    let partner = 0;
    for (const s of plays(2))
      for (const a of assessAction(s)) {
        if (a.facts.kind !== "partner") continue;
        partner++;
        if (a.grade === "error") expect(a.facts.youOffside).toBe(true);
      }
    expect(partner).toBeGreaterThan(40);
  }, 240_000);

  it("is replay-safe: the same choices give the same assessment after restoring", () => {
    for (const s of plays().slice(0, 8)) {
      const restored = restoreJourney(makeJourneyDraft(s, "learn", "check"));
      expect(assessAction(restored)).toEqual(assessAction(s));
    }
  }, 120_000);

  it("explains with tactics only and always says what happened, why and what to do next", () => {
    const seen = new Set<string>();
    for (const s of plays())
      for (const a of assessAction(s)) {
        for (const text of [a.did, a.happened, a.why, a.task, a.rivalReaction ?? ""]) {
          expect(text).not.toMatch(BODY_CUES);
          expect(text).not.toMatch(/undefined|NaN/);
        }
        expect(a.did && a.happened && a.why && a.task).toBeTruthy();
        expect(a.source.url).toMatch(/^https:\/\//);
        seen.add(a.grade);
      }
    expect(seen).toEqual(new Set(["good", "possible", "error"]));
  }, 240_000);

  it("the key moment is the first error, and the task comes from its problem", () => {
    const list = [
      { index: 0, grade: "good", problem: null, task: "a" },
      { index: 1, grade: "possible", problem: "marked", task: "b" },
      { index: 2, grade: "error", problem: "lane-closed", task: "c" },
      { index: 3, grade: "error", problem: "offside-run", task: "d" },
    ] as unknown as DecisionAssessment[];
    expect(keyMoment(list)?.index).toBe(2);
    expect(keyMoment(list.slice(0, 2))?.index).toBe(1);
    expect(keyMoment(list.slice(0, 1))?.index).toBe(0);
    expect(keyMoment([])).toBeNull();
  });

  it("'Pokaż moment' covers exactly that decision on the action timeline", () => {
    const s = plays()[0];
    // The action opens with a short beat before the first decision.
    let end = s.beats[0].duration;
    s.decisions.forEach((_, i) => {
      const { from, to } = momentRange(s, i);
      expect(from).toBeCloseTo(end, 6);
      expect(to).toBeGreaterThan(from);
      end = to;
    });
    expect(end).toBeCloseTo(journeyDuration(s), 6);
  }, 60_000);

  it("every hand-placed situation has a lesson aim", () => {
    for (const def of situationBank) expect(lessonAim(def)).toBeTruthy();
    expect(lessonAim(situationBank.find((d) => d.topicId === "iqs-nine-depth")!)).toBe(
      "run-behind",
    );
    expect(lessonAim(situationBank.find((d) => d.topicId === "iqs-gk-sweep")!)).toBe("sweep");
  });
});
