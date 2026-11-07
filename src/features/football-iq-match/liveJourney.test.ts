import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  chooseJourney,
  createJourneyForRules,
  journeyDuration,
  journeyFrame,
  journeyStep,
  sampleJourney,
} from "./journeyEngine";
import { liveChoice, parseLiveChoice } from "./liveJourney";
import {
  makeJourneyAttempt,
  makeJourneyDraft,
  restoreJourney,
} from "./journeyHistory";
import { LIVE_BANK_VERSION } from "./liveLesson";
const definition = advancedJourneyBank.find((d) => d.id === "iqx-wing-0-0")!;
const fixture = () => createJourneyForRules(definition, 8);

describe("live teaching episode", () => {
  it("starts without the ball, with a pressure cue and a separate observation", () => {
    const s = fixture();
    expect(s.world.carrierId).toBe("support");
    expect(s.decisions).toHaveLength(0);
    expect(s.beats[0].live!.length).toBeGreaterThan(10);
    expect(s.beats[0].events).toHaveLength(1);
  });
  it("permits a pass into arbitrary space, rather than turning it into dribbling", () => {
    const s = fixture();
    s.world.carrierId = "you";
    const c = liveChoice(s, "pass", { x: 12.37, y: 39.81 });
    expect(c.targetId).toBeUndefined();
    expect(c.intent).toBe("pass");
    expect(parseLiveChoice(s, c.id)).toEqual(c);
    expect(
      chooseJourney(s, c.id)
        .beats.at(-1)!
        .live!.some((r) => r.inFlight),
    ).toBe(true);
  });
  it("moves multiple other players while the pass is actually in flight", () => {
    const s = fixture();
    const next = chooseJourney(s, liveChoice(s, "move", { x: 36, y: 52 }).id);
    expect(next.scenario.players).toBe(s.scenario.players);
    expect(next.players).toBe(s.players);
    const rows = next.beats.at(-1)!.live!.filter((r) => r.inFlight);
    expect(rows.length).toBeGreaterThan(4);
    const first = rows[0],
      last = rows.at(-1)!;
    const moving = s.players.filter(
      (p) =>
        p.id !== "you" &&
        Math.hypot(
          first.world.positions[p.id].x - last.world.positions[p.id].x,
          first.world.positions[p.id].y - last.world.positions[p.id].y,
        ) > 0.5,
    );
    expect(moving.filter((p) => p.team === "away").length).toBeGreaterThan(1);
    expect(moving.filter((p) => p.team === "home").length).toBeGreaterThan(1);
  });
  it("cannot take over or teleport an opponent", () => {
    const s = fixture();
    expect(
      parseLiveChoice(s, "live8:r0:move:ground:now:20.00:40.00:space"),
    ).toBeUndefined();
    const next = chooseJourney(s, liveChoice(s, "move", { x: 36, y: 52 }).id);
    const rows = next.beats.at(-1)!.live!;
    for (let i = 1; i < rows.length; i++)
      for (const p of s.players) {
        const a = rows[i - 1].world.positions[p.id],
          b = rows[i].world.positions[p.id];
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(0.36);
      }
  });
  it("reconstructs a short independent episode, including every reaction, from a draft", () => {
    let s = fixture();
    while (!s.outcome) s = chooseJourney(s, journeyStep(s).choices[0].id, 1);
    expect(s.step).toBeLessThanOrEqual(3);
    const draft = makeJourneyDraft(s, "challenge", "live-test");
    expect(draft.bankVersion).toBe(LIVE_BANK_VERSION);
    expect(restoreJourney(draft)).toEqual(s);
    expect(makeJourneyAttempt(s, "challenge", "live-test").outcome).toBe(
      s.outcome,
    );
    expect(sampleJourney(s, journeyDuration(s))).toEqual(
      journeyFrame(s.world, s.players, journeyDuration(s)),
    );
  });
  it("changes defender trajectories between transfer variants", () => {
    const a = fixture(),
      b = createJourneyForRules(
        advancedJourneyBank.find((d) => d.id === "iqx-wing-0-1")!,
        8,
      );
    const aa = chooseJourney(a, liveChoice(a, "move", { x: 6, y: 35 }).id);
    const bb = chooseJourney(b, liveChoice(b, "move", { x: 6, y: 35 }).id);
    expect(aa.world.positions.r1).not.toEqual(bb.world.positions.r1);
  });
  it("keeps finite bounded worlds and finishable episodes for each role and concept", () => {
    for (const def of advancedJourneyBank) {
      let s = createJourneyForRules(def, 8);
      while (!s.outcome)
        s = chooseJourney(s, journeyStep(s).choices.at(-1)!.id, 0);
      expect(s.step).toBeLessThanOrEqual(3);
      for (const beat of s.beats)
        for (const row of beat.live!)
          for (const p of Object.values(row.world.positions)) {
            expect(p.x).toBeGreaterThanOrEqual(4);
            expect(p.x).toBeLessThanOrEqual(96);
            expect(p.y).toBeGreaterThanOrEqual(6);
            expect(p.y).toBeLessThanOrEqual(134);
          }
      expect(restoreJourney(makeJourneyDraft(s, "learn", "test"))).toEqual(s);
    }
  }, 30000);
});
