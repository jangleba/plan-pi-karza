import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  chooseJourney,
  createJourneyForRules,
  journeyChoice,
  journeyFrame,
  journeyPointChoice,
  journeyStep,
  sampleJourneyBeat,
} from "./journeyEngine";
import { makeJourneyAttempt, makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { agentOptions, autonomousTurn, carryAssessment, performCarry } from "./tacticalAgents";
import { controlTacticalActor, tacticalGroup, tacticalGroups } from "./tacticalJourney";
import {
  copyWorld,
  distance,
  LEGACY_TACTICAL_BANK_VERSION as TACTICAL_BANK_VERSION,
  TACTICAL_TURNS,
} from "./tacticalWorld";
import { journeyDebrief, journeyDebriefText } from "./journeyDebrief";
import type { DribbleStyle, JourneySession } from "./journeyTypes";

const createJourney = (d: Parameters<typeof createJourneyForRules>[0]) =>
  createJourneyForRules(d, 6);
const definition = advancedJourneyBank.find(
  (d) => d.role === "six" && d.concept === "third-player",
)!;
function finish(s: JourneySession) {
  while (!s.outcome) {
    const choices = journeyStep(s).choices;
    const c =
      choices.find((c) => c.quality === "good" && c.intent !== "shoot" && !c.timing) ??
      choices.find((c) => c.quality === "possible") ??
      choices[0];
    s = chooseJourney(s, c.id, 2, false);
  }
  return s;
}
function openWorld() {
  const s = createJourney(definition);
  for (const [i, p] of s.players.entries())
    s.world.positions[p.id] = p.goalkeeper
      ? { x: 50, y: p.team === "home" ? 133 : 6 }
      : p.team === "home"
        ? { x: 15 + (i % 5) * 16, y: 112 }
        : { x: 10 + (i % 5) * 18, y: 20 };
  s.world.positions.you = { x: 50, y: 90 };
  s.world.carrierId = "you";
  s.initial = copyWorld(s.world);
  return s;
}
describe("open tactical IQ v6", () => {
  it("uses 72 distinct starts, two goalkeepers and only groups that actually have options", () => {
    const starts = new Set();
    for (const d of advancedJourneyBank) {
      const s = createJourney(d),
        step = journeyStep(s);
      expect(s.rulesVersion).toBe(6);
      expect(s.definition).toEqual(d);
      expect(
        s.players
          .filter((p) => p.goalkeeper)
          .map((p) => p.team)
          .sort(),
      ).toEqual(["away", "home"]);
      expect(new Set(s.players.map((p) => p.id)).size).toBe(s.players.length);
      for (const group of tacticalGroups(s))
        expect(
          step.choices.some((c) => tacticalGroup(c) === group && !c.timing),
          `${d.id}:${group}`,
        ).toBe(true);
      expect(new Set(step.choices.map((c) => c.id)).size).toBe(step.choices.length);
      starts.add(JSON.stringify([d.role, s.initial]));
    }
    expect(starts.size).toBe(72);
  });
  it("lets a partner choose another teammate and changes that decision when the lane closes", () => {
    const s = openWorld();
    s.world.carrierId = "support";
    s.world.positions.support = { x: 50, y: 80 };
    s.world.positions.third = { x: 30, y: 55 };
    s.world.positions.you = { x: 90, y: 125 };
    s.world.positions.r0 = { x: 90, y: 124 };
    const best = agentOptions(s)[0];
    expect(best.intent).toBe("pass");
    expect(best.targetId).toBe("third");
    const closed = { ...s, world: copyWorld(s.world), beats: [] };
    closed.world.positions.r1 = { x: 40, y: 67.5 };
    expect(agentOptions(closed)[0].targetId).not.toBe("third");
    autonomousTurn(s);
    expect(s.world.carrierId).toBe("third");
    expect(s.beats[0].autonomous?.team).toBe("home");
    expect(s.beats[0].receiverId).not.toBe("you");
  });
  it("keeps other players active while TY waits or makes a decoy run without requiring a reception", () => {
    let examples = 0;
    for (const d of advancedJourneyBank) {
      let s = createJourney(d);
      const first = journeyStep(s).choices.find(
        (c) => c.intent === "pass" && c.quality !== "error" && !c.timing,
      );
      if (!first) continue;
      s = chooseJourney(s, first.id, 0, false);
      if (
        s.outcome ||
        s.world.carrierId === "you" ||
        s.players.find((p) => p.id === s.world.carrierId)!.team !== "home"
      )
        continue;
      const wait = journeyStep(s).choices.find((c) => c.intent === "wait")!;
      const next = chooseJourney(s, wait.id, 0, false);
      const events = next.beats.slice(s.beats.length).filter((b) => b.autonomous);
      expect(events.length).toBeGreaterThan(0);
      if (events.some((b) => b.kind === "pass" && b.actorId !== "you" && b.receiverId !== "you"))
        examples++;
    }
    expect(examples).toBeGreaterThan(0);
  });
  it("models six different dribbling/protection paths and reactions during the run", () => {
    const s = openWorld(),
      variants: string[] = [];
    for (const style of [
      "direct",
      "cut-left",
      "cut-right",
      "stop-go",
      "turn-back",
      "shield",
    ] as DribbleStyle[]) {
      const copy: JourneySession = { ...s, world: copyWorld(s.world), beats: [], decisions: [] };
      performCarry(copy, "you", { x: 35, y: 78 }, style);
      variants.push(JSON.stringify(copy.beats.map((b) => [b.kind, b.from, b.to, b.duration])));
      expect(
        copy.beats.some((b) =>
          s.players.some(
            (p) =>
              p.team === "away" &&
              !p.goalkeeper &&
              distance(b.before.positions[p.id], b.after.positions[p.id]) > 0,
          ),
        ),
      ).toBe(true);
    }
    expect(new Set(variants).size).toBe(6);
    const blocked = openWorld();
    blocked.world.positions.r0 = { x: 50, y: 82 };
    const a = carryAssessment(blocked, "you", { x: 50, y: 69 });
    expect(a.quality).toBe("error");
    expect(a.world.carrierId).not.toBe("you");
    expect(
      distance(a.world.positions.you, a.world.positions[a.world.carrierId]),
    ).toBeLessThanOrEqual(2.11);
  });
  it("can reward a decoy that opens another teammate without returning the ball to TY", () => {
    let observed = 0;
    for (const d of advancedJourneyBank) {
      const s = createJourney(d);
      if (
        s.world.carrierId === "you" ||
        s.players.find((p) => p.id === s.world.carrierId)!.team !== "home"
      )
        continue;
      for (const c of journeyStep(s).choices.filter(
        (c) => c.intent === "decoy" && c.quality === "good" && !c.timing,
      )) {
        const next = chooseJourney(s, c.id, 0, false);
        if (next.beats.some((b) => b.autonomous?.intent === "pass" && b.receiverId !== "you")) {
          expect(next.decisions[0].quality).toBe("good");
          expect(next.decisions[0].why).toContain("Nie musisz dostać podania");
          observed++;
        }
      }
    }
    expect(observed).toBeGreaterThan(0);
  });
  it("records the chosen moment and accepts exact user coordinates rather than snapping to options", () => {
    const s = openWorld(),
      point = { x: 39.12, y: 84.34 };
    const own = journeyPointChoice(s, point, "carry", "cut-left", "delay");
    expect(journeyChoice(s, own.id)).toEqual(own);
    expect(journeyStep(s).choices.some((c) => distance(c.point, point) < 0.01)).toBe(false);
    const next = chooseJourney(s, own.id, 1.25, false);
    expect(next.beats[0].kind).toBe("hold");
    expect(next.beats[0].duration).toBe(0.7);
    expect(next.world.positions.you).toEqual(point);
    expect(next.decisions[0].choiceId).toContain("cut-left:delay:39.12:84.34");
    expect(() => journeyPointChoice(s, { x: 60, y: 80 }, "carry", "cut-left")).toThrow();
    expect(() => journeyPointChoice(s, { x: 50, y: 80 }, "carry", "turn-back")).toThrow();
    expect(journeyChoice(s, "free6:carry:direct:now:NaN:50.00")).toBeUndefined();
    expect(journeyChoice(s, "free6:carry:direct:now:99.00:50.00")).toBeUndefined();
    const timed = journeyStep(s).choices.find(
      (c) => c.id.startsWith("delay:") && c.intent === "carry",
    )!;
    expect(chooseJourney(s, timed.id, 0, false).beats[0].duration).toBe(0.7);
  });
  it("allows an explicit single-decision takeover, then returns to TY with exact replay", () => {
    let base: JourneySession | undefined;
    for (const d of advancedJourneyBank) {
      const s = createJourney(d),
        c = journeyStep(s).choices.find(
          (c) => c.intent === "pass" && c.quality !== "error" && !c.timing,
        );
      if (!c) continue;
      const n = chooseJourney(s, c.id, 0, false);
      if (
        !n.outcome &&
        n.world.carrierId !== "you" &&
        n.players.find((p) => p.id === n.world.carrierId)!.team === "home"
      ) {
        base = n;
        break;
      }
    }
    expect(base).toBeTruthy();
    const partner = base!.world.carrierId,
      controlled = controlTacticalActor(base!, partner);
    const c = journeyStep(controlled).choices.find(
      (c) => c.intent === "pass" && c.quality !== "error",
    )!;
    expect(c.id).toMatch(new RegExp(`^as6:${partner}:`));
    const next = chooseJourney(base!, c.id, 1.5);
    expect(next.decisions.at(-1)!.actorId).toBe(partner);
    expect(next.controlledId).toBe("you");
    expect(restoreJourney(makeJourneyDraft(next, "learn", "takeover"))).toEqual(next);
    expect(() => controlTacticalActor(base!, "r0")).toThrow();
    expect(journeyChoice(base!, "as6:r0:t:hold:wait")).toBeUndefined();
    expect(journeyChoice(base!, "as6:you:t:hold:wait")).toBeUndefined();
    const p = controlled.world.positions[partner];
    const free = journeyPointChoice(controlled, { x: p.x, y: p.y + 2 }, "carry");
    const draft = makeJourneyDraft(
      chooseJourney(base!, free.id, 0, false),
      "challenge",
      "own-partner-move",
    );
    expect(restoreJourney(draft).decisions.at(-1)!.actorId).toBe(partner);
    expect(() => restoreJourney({ ...draft, mode: "learn" })).toThrow();
  });
  it("lets a close defender win a stationary ball and cancels an action delayed past the loss", () => {
    const s = openWorld();
    s.world.positions.r0 = { x: 50, y: 86.7 };
    const hold = journeyStep(s).choices.find((c) => c.intent === "hold")!;
    expect(hold.quality).toBe("error");
    const held = chooseJourney(s, hold.id, 0, false);
    expect(
      held.beats.some((b) => b.autonomous?.intent === "press" && b.after.carrierId === "r0"),
    ).toBe(true);
    const delayed = journeyPointChoice(s, { x: 40, y: 80 }, "carry", "cut-left", "delay");
    expect(delayed.quality).toBe("error");
    const late = chooseJourney(s, delayed.id, 0, false);
    expect(late.beats.some((b) => b.actorId === "you" && b.kind === "move")).toBe(false);
    expect(late.decisions[0].quality).toBe("error");
    expect(late.beats[0].duration).toBe(0.7);
  });
  it("bounds every episode and preserves continuous animation, fair decisions and versioned storage", () => {
    let teamMoves = 0,
      opponentMoves = 0;
    for (const d of advancedJourneyBank) {
      const initial = createJourney(d),
        snapshot = JSON.stringify(initial),
        final = finish(initial);
      expect(JSON.stringify(initial)).toBe(snapshot);
      expect(final.step).toBeLessThanOrEqual(TACTICAL_TURNS);
      expect(final.outcome).not.toBeNull();
      for (const [i, beat] of final.beats.entries()) {
        if (i) expect(beat.before).toEqual(final.beats[i - 1].after);
        expect(sampleJourneyBeat(beat, final.players, 0).positions).toEqual(
          journeyFrame(beat.before, final.players).positions,
        );
        expect(
          Object.fromEntries(sampleJourneyBeat(beat, final.players, beat.duration).positions),
        ).toEqual(beat.after.positions);
        for (const p of Object.values(beat.after.positions)) {
          expect(p.x).toBeGreaterThanOrEqual(4);
          expect(p.x).toBeLessThanOrEqual(96);
          expect(p.y).toBeGreaterThanOrEqual(6);
          expect(p.y).toBeLessThanOrEqual(134);
        }
        if (beat.autonomous?.team === "home") teamMoves++;
        if (beat.autonomous?.team === "away") opponentMoves++;
      }
      const attempt = makeJourneyAttempt(final, "learn", d.id);
      expect(attempt.bankVersion).toBe(TACTICAL_BANK_VERSION);
      // The replay also recomputes alternatives; compare a replay generated with the same setting.
      let canonical = createJourney(d);
      for (const dec of final.decisions)
        canonical = chooseJourney(canonical, dec.choiceId, dec.decisionSeconds);
      expect(restoreJourney(makeJourneyAttempt(canonical, "learn", d.id))).toEqual(canonical);
      const report = journeyDebrief(canonical)!;
      expect(journeyDebriefText(canonical, report)).toContain("Kiedy zmienić plan");
      expect(report.teamDecisions).toBeDefined();
    }
    expect(teamMoves).toBeGreaterThan(0);
    expect(opponentMoves).toBeGreaterThan(0);
  });
  it("keeps good offered moves consistent with their execution without mutating the original", () => {
    for (const d of advancedJourneyBank.filter((_, i) => i % 6 === 0)) {
      const s = createJourney(d),
        original = JSON.stringify(s);
      for (const c of journeyStep(s).choices) {
        expect(journeyChoice(s, c.id)).toEqual(c);
        const n = chooseJourney(s, c.id, 2, false);
        expect(n.decisions[0].choiceId).toBe(c.id);
        if (c.quality === "good")
          expect(n.decisions[0].quality, `${d.id}:${c.id}`).not.toBe("error");
        expect(chooseJourney(s, c.id, 2, false)).toEqual(n);
      }
      expect(JSON.stringify(s)).toBe(original);
    }
  });
  it("reproduces all 72 installed v5 timelines byte for byte", () => {
    const rows = advancedJourneyBank.map((d) => {
      let s = createJourneyForRules(d, 5);
      while (!s.outcome) {
        const options = journeyStep(s).choices;
        s = chooseJourney(
          s,
          (options.find((c) => c.quality === "good") ?? options[0]).id,
          2,
          false,
        );
      }
      return s;
    });
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe(
      "a51a9f42ef0a2397c8717a2f5af1655652c79e8ba205959c71fa6947353ebd81",
    );
  });
});
