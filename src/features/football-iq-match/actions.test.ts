import { describe, expect, it } from "vitest";
import { attackChoice } from "./attackJourney";
import { assessDecision } from "./decisionAssessment";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { situationBank } from "./situationBank";
import { distance, segment } from "./tacticalWorld";

const start = (id: string) =>
  createJourneyForRules(
    situationBank.find((d) => d.id === id)!,
    9,
  );

describe("rules v9 actions: press, mark and shielding", () => {
  it("a press follows the rival with the ball instead of running to where he stood", () => {
    const s = start("iqs-ten-press-0");
    const carrier = s.world.carrierId;
    expect(s.players.find((p) => p.id === carrier)!.team).toBe("away");
    const target = s.world.positions[carrier];
    const pressed = chooseJourney(s, attackChoice(s, "press", target, carrier).id, 1, false);
    const ran = chooseJourney(s, attackChoice(s, "move", target).id, 1, false);
    // Distance to the rival carrier just before he can release the ball (0.8 s).
    const gap = (x: typeof pressed) => {
      const f = x.beats.at(-1)!.live!.find((f) => f.time >= 0.75)!;
      return distance(f.world.positions.you, f.world.positions[carrier]);
    };
    expect(gap(pressed)).toBeLessThan(gap(ran));
    expect(assessDecision(pressed, 0).did).toMatch(/^Doskoczyłeś do nr \d+\./);
  });

  it("a mark stands on the line between the ball and the marked rival", () => {
    const s = start("iqs-six-screen-0");
    // The rival whose pass lane is nearest to TY (but not already closed).
    const ball = s.world.positions[s.world.carrierId];
    const receiver = s.players
      .filter((p) => p.team === "away" && !p.goalkeeper && p.id !== s.world.carrierId)
      .map((p) => ({ p, gap: segment(s.world.positions.you, ball, s.world.positions[p.id]).gap }))
      .filter((r) => r.gap > 2)
      .sort((a, b) => a.gap - b.gap)[0].p;
    const next = chooseJourney(
      s,
      attackChoice(s, "mark", s.world.positions[receiver.id], receiver.id).id,
      1,
      false,
    );
    const stay = chooseJourney(s, attackChoice(s, "wait", s.world.positions.you).id, 1, false);
    // TY gets closer to the lane from the ball to that rival than by staying.
    const laneGap = (x: typeof next) =>
      Math.min(
        ...x.beats
          .at(-1)!
          .live!.filter((f) => !f.inFlight && f.time <= 1.2)
          .map((f) => segment(f.world.positions.you, f.ball, f.world.positions[receiver.id]).gap),
      );
    expect(laneGap(next)).toBeLessThan(laneGap(stay) - 1);
    expect(assessDecision(next, 0).did).toBe(`Zamknąłeś podanie do nr ${receiver.number}.`);
  });

  it("shielding keeps the ball where standing still loses it", () => {
    const s = start("iqs-hold-up-1");
    const at = s.world.positions.you;
    const held = chooseJourney(s, attackChoice(s, "hold", at).id, 1, false);
    const shielded = chooseJourney(s, attackChoice(s, "shield", at).id, 1, false);
    expect(held.world.carrierId).not.toBe("you");
    expect(shielded.world.carrierId).toBe("you");
    expect(assessDecision(shielded, 0).did).toBe("Osłoniłeś piłkę.");
  });

  it("rejects targets that do not fit the action", () => {
    const s = start("iqs-ten-press-0");
    const other = s.players.find(
      (p) => p.team === "away" && !p.goalkeeper && p.id !== s.world.carrierId,
    )!;
    expect(() => attackChoice(s, "press", s.world.positions[other.id], other.id)).toThrow();
    expect(() =>
      attackChoice(s, "mark", s.world.positions[s.world.carrierId], s.world.carrierId),
    ).toThrow();
    expect(() => attackChoice(s, "press", s.world.positions.support, "support")).toThrow();
    const own = start("iqs-hold-up-1");
    expect(() => attackChoice(own, "shield", own.world.positions.you)).not.toThrow();
    expect(() => attackChoice(s, "shield", s.world.positions.you)).toThrow();
  });

  it("new actions are saved and replay exactly", () => {
    let s = start("iqs-six-screen-0");
    const carrier = s.world.carrierId;
    s = chooseJourney(s, attackChoice(s, "press", s.world.positions[carrier], carrier).id, 2);
    const draft = makeJourneyDraft(s, "learn", "actions");
    expect(restoreJourney(draft)).toEqual(s);
  });
});
