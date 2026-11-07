import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  createJourneyForRules,
  chooseJourney,
  journeyStep,
  sampleJourney,
  journeyDuration,
} from "./journeyEngine";
import { attackChoice, parseAttackChoice } from "./attackJourney";
import {
  makeJourneyDraft,
  restoreJourney,
  makeJourneyAttempt,
  createJourneyBackup,
  readJourneyBackup,
} from "./journeyHistory";
import { ATTACK_BANK_VERSION } from "./liveLesson";
import { attackReplay } from "./attackReplay";
const def = advancedJourneyBank.find((d) => d.id === "iqx-wing-0-0")!;
const start = () => createJourneyForRules(def, 9);
function shotFixture(x: number) {
  const s = start();
  s.world.carrierId = "you";
  s.world.positions.you = { x, y: 18 };
  for (const p of s.players)
    if (!p.goalkeeper && p.id !== "you")
      s.world.positions[p.id] = { x: 10 + p.number * 2, y: 90 };
  const keeper = s.players.find((p) => p.goalkeeper && p.team === "away")!;
  s.world.positions[keeper.id] = { x: 50, y: 8 };
  return s;
}
const goalPath = [
  "attack9:support:pass:ground:now:18.00:75.00:you",
  "attack9:third:carry:ground:now:74.90:47.26:space",
  "attack9:third:carry:ground:now:84.27:29.31:space",
  "attack9:third:shoot:ground:now:43.50:0.00:space",
];
describe("full attacking episodes", () => {
  it("continues beyond the old three-decision cap", () => {
    let s = start();
    for (let i = 0; i < 4; i++)
      s = chooseJourney(s, journeyStep(s).choices.at(-1)!.id, 1);
    expect(s.step).toBe(4);
    expect(s.outcome).toBeNull();
    expect(s.attack?.finish).toBeUndefined();
  });
  it("finishes an actual sequence from the real starting situation with a goal", () => {
    let s = start();
    for (const id of goalPath) s = chooseJourney(s, id, 1);
    expect(s.attack?.finish).toBe("goal");
    expect(s.attack?.home).toBe(1);
    const ball = sampleJourney(s, journeyDuration(s)).ball;
    expect(ball.y).toBeLessThanOrEqual(2.35);
    expect(ball.x).toBeGreaterThan(42.65);
    expect(ball.x).toBeLessThan(57.35);
    expect(restoreJourney(makeJourneyDraft(s, "learn", "goal"))).toEqual(s);
  });
  it("a central shot can be saved and play continues", () => {
    const s = shotFixture(50),
      next = chooseJourney(s, attackChoice(s, "shoot", { x: 50, y: 0 }).id, 1);
    expect(next.attack?.home).toBe(0);
    expect(next.outcome).toBeNull();
    expect(
      next.beats.at(-1)?.events?.some((e) => e.text.includes("Bramkarz broni")),
    ).toBe(true);
  });
  it("a shot outside the posts is a miss rather than a goal", () => {
    const s = shotFixture(36),
      next = chooseJourney(s, attackChoice(s, "shoot", { x: 36, y: 0 }).id, 1);
    expect(next.attack?.finish).toBe("miss");
    expect(next.attack?.home).toBe(0);
  });
  it("supports more than ten persisted choices without changing old bank limits", () => {
    let s = start();
    while (s.step < 12 && !s.outcome)
      s = chooseJourney(s, journeyStep(s).choices.at(-1)!.id, 1);
    expect(s.step).toBeGreaterThan(10);
    const draft = makeJourneyDraft(s, "challenge", "long");
    expect(draft.bankVersion).toBe(ATTACK_BANK_VERSION);
    expect(restoreJourney(draft)).toEqual(s);
    if (s.outcome)
      expect(
        readJourneyBackup(
          createJourneyBackup([makeJourneyAttempt(s, "challenge", "long")]),
        ).attempts,
      ).toHaveLength(1);
    else
      expect(readJourneyBackup(createJourneyBackup([], draft)).draft).toEqual(
        draft,
      );
  });
  it("never allows manual control of an opponent", () => {
    const s = start();
    expect(
      parseAttackChoice(s, "attack9:r0:carry:ground:now:50.00:20.00:space"),
    ).toBeUndefined();
  });
  it("analysis arrows come from observed motion, including the ball flight", () => {
    const s = chooseJourney(start(), goalPath[0], 1),
      a = attackReplay(s, s.beats.length - 1);
    expect(a.some((p) => p.type === "pass")).toBe(true);
    expect(new Set(a.map((p) => p.analysisColor)).size).toBeGreaterThan(1);
  });
});
