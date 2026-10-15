import { describe, expect, it } from "vitest";
import { journeyBank, rolesForPosition } from "./journeyBank";
import {
  chooseJourney,
  createJourney,
  journeyDuration,
  journeyCameraPoints,
  journeyOffside,
  journeyStep,
  sampleJourney,
  sampleJourneyBeat,
} from "./journeyEngine";
import type { JourneySession } from "./journeyTypes";

function completion(session: JourneySession): JourneySession | null {
  if (session.outcome)
    return session.step === 4 && !["loss", "blocked"].includes(session.outcome) ? session : null;
  const choices = journeyStep(session).choices.sort(
    (a, b) => Number(a.quality !== "good") - Number(b.quality !== "good"),
  );
  for (const c of choices) {
    const result = completion(chooseJourney(session, c.id));
    if (result) return result;
  }
  return null;
}
describe("IQ individual action bank", () => {
  it("contains 80 topics and 240 playable contexts across all onboarding positions", () => {
    expect(journeyBank).toHaveLength(240);
    expect(new Set(journeyBank.map((s) => s.id)).size).toBe(240);
    expect(new Set(journeyBank.map((s) => s.topicId)).size).toBe(80);
    for (const role of ["gk", "cb", "fb", "six", "eight", "ten", "wing", "nine"])
      expect(journeyBank.filter((s) => s.role === role)).toHaveLength(30);
    expect(rolesForPosition("goalkeeper")).toEqual(["gk"]);
    expect(rolesForPosition("defender")).toEqual(["cb", "fb"]);
    expect(rolesForPosition("midfielder")).toEqual(["six", "eight", "ten"]);
    expect(rolesForPosition("forward")).toEqual(["wing", "nine"]);
    expect(rolesForPosition("unknown")).toHaveLength(8);
  });
  it("allows at least one full four-decision completion in every context", () => {
    const missing = journeyBank
      .filter((definition) => !completion(createJourney(definition)))
      .map((s) => ({ id: s.id, title: s.title }));
    expect(missing).toEqual([]);
  });
  it("keeps recorded frames continuous and preserves the original state", () => {
    for (const definition of journeyBank) {
      const original = createJourney(definition),
        unchanged = JSON.stringify(original),
        session = completion(original);
      expect(JSON.stringify(original)).toBe(unchanged);
      if (!session) continue;
      session.beats.forEach((beat, index) => {
        if (index) expect(beat.before).toEqual(session.beats[index - 1].after);
        const end = sampleJourneyBeat(beat, session.players, beat.duration);
        expect(Object.fromEntries(end.positions)).toEqual(beat.after.positions);
        for (const p of Object.values(beat.after.positions)) {
          expect(p.x).toBeGreaterThanOrEqual(2.2);
          expect(p.x).toBeLessThanOrEqual(97.8);
          expect(p.y).toBeGreaterThanOrEqual(3);
          expect(p.y).toBeLessThanOrEqual(137);
        }
      });
      expect(
        Object.fromEntries(sampleJourney(session, journeyDuration(session)).positions),
      ).toEqual(session.world.positions);
    }
  });
  it("records a loss at the same point shown in the replay, then forbids further choices", () => {
    const initial = journeyBank
      .map(createJourney)
      .find(
        (s) =>
          journeyStep(s).kind === "pass" &&
          journeyStep(s).choices.some((c) => c.quality === "error"),
      )!;
    const choice = journeyStep(initial).choices.find((c) => c.quality === "error")!;
    const result = chooseJourney(initial, choice.id);
    expect(result.outcome).toBe("loss");
    expect(result.world.carrierId).toMatch(/^r/);
    expect(sampleJourney(result, journeyDuration(result)).ballCarrierId).toBe(
      result.world.carrierId,
    );
    expect(() => chooseJourney(result, choice.id)).toThrow();
  });
  it("reconstructs the exact action from decisions rather than replacing it with an ideal path", () => {
    for (const definition of journeyBank) {
      const complete = completion(createJourney(definition));
      if (!complete) continue;
      let replay = createJourney(definition);
      complete.decisions.forEach((d) => {
        replay = chooseJourney(replay, d.choiceId, d.decisionSeconds);
      });
      expect(replay.world).toEqual(complete.world);
      expect(replay.beats).toEqual(complete.beats);
    }
  });
  it("keeps every offered branch executable and every suggested alternative valid", () => {
    let branches = 0;
    function visit(session: JourneySession) {
      if (session.outcome) return;
      const info = journeyStep(session);
      const camera = journeyCameraPoints(session);
      for (const c of info.choices)
        expect(camera.some((p) => p.x === c.point.x && p.y === c.point.y)).toBe(true);
      if (["pass", "finish", "carry"].includes(info.kind))
        expect(session.world.carrierId).toBe("you");
      for (const c of info.choices) {
        const next = chooseJourney(session, c.id);
        branches++;
        const decision = next.decisions.at(-1)!;
        if (decision.alternative) {
          const alternate = chooseJourney(session, decision.alternative.id, 0, false);
          expect(["loss", "blocked"]).not.toContain(alternate.outcome);
          expect(alternate.decisions.at(-1)!.quality).not.toBe("error");
        }
        visit(next);
      }
    }
    journeyBank.forEach((d) => visit(createJourney(d)));
    expect(branches).toBeGreaterThan(5000);
  });
  it("uses the supplied pass animation windup before launching the ball", () => {
    const s = createJourney(journeyBank[0]),
      c = journeyStep(s).choices.find((c) => c.quality === "good")!;
    const beat = chooseJourney(s, c.id).beats[0];
    expect(sampleJourneyBeat(beat, s.players, 0.2).ballInFlight).toBe(false);
    expect(sampleJourneyBeat(beat, s.players, 0.6).ballInFlight).toBe(true);
    expect(sampleJourneyBeat(beat, s.players, 0.2).motions.get("you")?.state).toBe("pass");
  });
  it("checks the offside line when the pass is played, while allowing a receiver behind the ball", () => {
    const s = createJourney(journeyBank.find((s) => s.role === "nine")!);
    expect(journeyOffside(s, { x: 50, y: 3 }, { x: 50, y: 30 })).toBe(true);
    expect(journeyOffside(s, { x: 50, y: 20 }, { x: 50, y: 15 })).toBe(false);
    expect(journeyOffside(s, { x: 50, y: 80 }, { x: 50, y: 100 })).toBe(false);
  });
});
