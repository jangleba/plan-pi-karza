import { describe, expect, it } from "vitest";
import { journeyBank } from "./journeyBank";
import {
  chooseJourney,
  createJourney,
  journeyCameraPoints,
  journeyChoice,
  journeyPointChoice,
  journeyStep,
  sampleJourney,
  journeyDuration,
} from "./journeyEngine";
import {
  makeJourneyAttempt,
  restoreJourney,
  saveJourneyDraft,
  loadJourneyDraft,
} from "./journeyHistory";

function carry() {
  const s = createJourney(journeyBank.find((d) => d.role === "wing" && d.steps[0] === "carry")!);
  Object.assign(s.world.positions, {
    you: { x: 20, y: 100 },
    support: { x: 10, y: 120 },
    wide: { x: 80, y: 100 },
    forward: { x: 50, y: 60 },
    r0: { x: 10, y: 20 },
    r1: { x: 90, y: 20 },
    r2: { x: 20, y: 30 },
    r3: { x: 80, y: 30 },
  });
  s.world.carrierId = "you";
  return s;
}
describe("fully independent IQ destinations", () => {
  it("records the chosen coordinates instead of snapping to authored circles", () => {
    const s = carry(),
      p = { x: 42.371, y: 83.912 },
      c = journeyPointChoice(s, p);
    expect(c.point).toEqual({ x: 42.37, y: 83.91 });
    expect(c.id).toBe("free:carry:42.37:83.91");
    expect(
      journeyStep(s).choices.some((a) => a.point.x === c.point.x && a.point.y === c.point.y),
    ).toBe(false);
    const next = chooseJourney(s, c.id, 3);
    expect(next.beats[0].to).toEqual(c.point);
    expect(next.world.positions.you).toEqual(c.point);
    expect(next.decisions[0].quality).toBe("good");
    const other = chooseJourney(s, journeyPointChoice(s, { x: 43.1, y: 84.2 }).id);
    expect(other.world.positions.you).not.toEqual(next.world.positions.you);
  });
  it("stops a carry at an opponent on the route even if the requested endpoint is clear", () => {
    const s = carry();
    s.definition = { ...s.definition, revision: 2, steps: ["carry"] };
    s.world.positions.r0 = { x: 40, y: 100 };
    const next = chooseJourney(s, journeyPointChoice(s, { x: 60, y: 100 }).id);
    expect(next.world.positions.you).toEqual({ x: 40, y: 100 });
    expect(next.world.carrierId).toBe("r0");
    expect(next.decisions[0].quality).toBe("error");
    expect(next.transition).toBe("choose");
    const reaction = chooseJourney(next, journeyPointChoice(next, { x: 40, y: 102 }).id);
    expect(reaction.outcome).toBe("recovered");
    expect(reaction.decisions[1].choiceId).toBe("free:transition:40.00:102.00");
  });
  it("evaluates return positions geometrically rather than marking any retreat as safe", () => {
    const s = carry();
    s.transition = "choose";
    s.world.carrierId = "r0";
    s.world.positions.r0 = { x: 50, y: 70 };
    s.world.positions.you = { x: 30, y: 95 };
    const covered = chooseJourney(s, journeyPointChoice(s, { x: 50, y: 100 }).id);
    expect(covered.outcome).toBe("contained");
    const opened = chooseJourney(s, journeyPointChoice(s, { x: 5, y: 50 }).id);
    expect(opened.outcome).toBe("loss");
    expect(opened.decisions[0].quality).toBe("error");
  });
  it("accepts free movement for every positional scenario without inventing pass targets", () => {
    let count = 0;
    for (const d of journeyBank) {
      let s = createJourney(d);
      while (!s.outcome && !s.transition) {
        const step = journeyStep(s);
        if (!["pass", "finish"].includes(step.kind)) {
          const c = journeyPointChoice(s, { x: 32.17, y: 86.43 });
          const n = chooseJourney(s, c.id, 1, false);
          expect(n.decisions.at(-1)!.choiceId).toBe(c.id);
          expect(n.beats[n.decisions.at(-1)!.firstBeat].to.x).toBeGreaterThanOrEqual(3);
          expect(sampleJourney(n, journeyDuration(n)).positions.get("you")).toEqual(
            n.world.positions.you,
          );
          count++;
        }
        const c = step.choices.find((c) => c.quality === "good") ?? step.choices[0];
        s = chooseJourney(s, c.id, 0, false);
      }
    }
    expect(count).toBeGreaterThan(900);
    const pass = createJourney(journeyBank[0]);
    expect(() => journeyPointChoice(pass, { x: 50, y: 60 })).toThrow();
  });
  it("rejects malformed, out-of-pitch and stale-coordinate action IDs", () => {
    const s = carry();
    for (const p of [
      { x: NaN, y: 50 },
      { x: 50, y: Infinity },
      { x: 1, y: 50 },
      { x: 98, y: 50 },
      { x: 50, y: 137 },
    ])
      expect(() => journeyPointChoice(s, p)).toThrow();
    for (const id of [
      "free:carry:42:83",
      "free:move:42.37:83.91",
      "free:carry:042.37:83.91",
      "free:carry:99.00:83.91",
      "free:carry:NaN:83.91",
    ])
      expect(() => chooseJourney(s, id)).toThrow();
    const c = journeyPointChoice(s, { x: 42.37, y: 83.91 });
    expect(journeyChoice(s, c.id)).toEqual(c);
  });
  it("keeps exact free coordinates through draft restoration, completed history and seeking", () => {
    const s = carry(),
      c = journeyPointChoice(s, { x: 42.37, y: 83.91 }),
      next = chooseJourney(s, c.id, 2);
    // This fixture modifies initial positions, so restoration uses a normal authored session.
    const d = journeyBank.find((d) => d.role === "wing" && d.steps[0] === "carry")!;
    const actual = chooseJourney(
      createJourney(d),
      journeyPointChoice(createJourney(d), { x: 42.37, y: 83.91 }).id,
      2,
    );
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    if (!actual.outcome) {
      saveJourneyDraft("a", actual, "challenge", "free-draft", storage);
      expect(restoreJourney(loadJourneyDraft("a", storage)!).beats).toEqual(actual.beats);
    }
    let finished = actual;
    while (!finished.outcome) {
      const cs = journeyStep(finished).choices;
      finished = chooseJourney(finished, (cs.find((c) => c.quality === "good") ?? cs[0]).id, 2);
    }
    const attempt = makeJourneyAttempt(finished, "challenge", "free-attempt");
    expect(restoreJourney(attempt)).toEqual(finished);
    expect(() => restoreJourney({ ...attempt, bankVersion: "2026-10-15.2" })).toThrow();
    expect(() => restoreJourney({ ...attempt, mode: "learn" })).toThrow();
    expect(next.decisions[0].choiceId).toBe(c.id);
  });
  it("keeps independent camera framing free of authored answer locations", () => {
    const s = carry();
    expect(journeyCameraPoints(s, true).length - journeyCameraPoints(s, false).length).toBe(
      journeyStep(s).choices.length,
    );
  });
});
