import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BALL_REST_HEIGHT, PASS_WINDUP_SECONDS } from "./animation";
import { flightHeight, flightProfile } from "./ballFlight";
import { journeyBank } from "./journeyBank";
import {
  chooseJourney,
  createJourney,
  journeyDuration,
  journeyFrame,
  journeyStep,
  journeyVerdict,
  sampleJourney,
  sampleJourneyBeat,
} from "./journeyEngine";
import type { JourneySession } from "./journeyTypes";
import { makeJourneyAttempt, restoreJourney } from "./journeyHistory";

function complete(s: JourneySession): JourneySession | null {
  if (s.outcome)
    return s.step === s.definition.steps.length &&
      !s.transition &&
      !["loss", "blocked"].includes(s.outcome) &&
      s.beats.some((b) => b.delivery && b.delivery !== "ground")
      ? s
      : null;
  const choices = [...journeyStep(s).choices].sort(
    (a, b) =>
      Number(a.quality === "error") - Number(b.quality === "error") ||
      Number(!a.delivery || a.delivery === "ground") -
        Number(!b.delivery || b.delivery === "ground"),
  );
  for (const c of choices) {
    if (c.quality === "error") continue;
    const next = complete(chooseJourney(s, c.id, 2, false));
    if (next) return next;
  }
  return null;
}
function crossingLane() {
  const s = createJourney(journeyBank.find((d) => d.revision === 2 && d.pattern === "switch-air")!);
  Object.assign(s.world.positions, {
    you: { x: 20, y: 80 },
    support: { x: 10, y: 95 },
    wide: { x: 80, y: 60 },
    forward: { x: 50, y: 35 },
    r0: { x: 50, y: 70 },
    r1: { x: 10, y: 15 },
    r2: { x: 90, y: 20 },
    r3: { x: 10, y: 30 },
  });
  s.world.carrierId = "you";
  return s;
}

describe("airborne IQ actions", () => {
  it("reproduces all 240 installed legacy scenarios exactly", () => {
    const rows = journeyBank
      .filter((d) => !d.revision)
      .map((d) => {
        let s = createJourney(d);
        while (!s.outcome) {
          const cs = journeyStep(s).choices;
          s = chooseJourney(s, (cs.find((c) => c.quality === "good") ?? cs[0]).id, 2);
        }
        return s;
      });
    // Generated from the installed 32a6667 engine, before this expansion.
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe(
      "a84959adeab1f3f135e08a8fff4c8dbf21f834d4aa24fd3aa1815d7c41c7f83d",
    );
  });
  it("has a complete non-error airborne path for every new scenario", () => {
    const missing = journeyBank
      .filter((d) => d.revision === 2 && !complete(createJourney(d)))
      .map((d) => d.id);
    expect(missing).toEqual([]);
  });
  it("gives all deliveries finite, distinct flight times and heights", () => {
    for (const delivery of ["ground", "chip", "lofted", "cross"] as const) {
      expect(flightProfile(delivery, 40).flight).toBeGreaterThan(0);
      expect(flightHeight(delivery, 40, 0, 2)).toBeCloseTo(BALL_REST_HEIGHT);
      expect(flightHeight(delivery, 40, 1, 2)).toBeCloseTo(2);
      for (let t = 0; t <= 1; t += 0.05)
        expect(Number.isFinite(flightHeight(delivery, 40, t))).toBe(true);
    }
    expect(flightHeight("lofted", 40, 0.5)).toBeGreaterThan(flightHeight("chip", 40, 0.5));
    expect(flightHeight("chip", 40, 0.5)).toBeGreaterThan(flightHeight("ground", 40, 0.5) + 3);
  });
  it("allows a high pass over a ground blocker and makes the ground loss playable", () => {
    const s = crossingLane();
    const ground = chooseJourney(s, "pass:wide"),
      air = chooseJourney(s, "lofted:wide");
    expect(ground.transition).toBe("choose");
    expect(ground.world.carrierId).toBe("r0");
    expect(air.world.carrierId).toBe("wide");
    expect(air.decisions[0].quality).not.toBe("error");
    const contained = chooseJourney(ground, "transition:recover");
    expect(contained.outcome).toBe("contained");
    expect(journeyVerdict(contained)).toBe("risky");
  });
  it("does not let an aerial pass bypass offside or a contested landing", () => {
    const s = crossingLane();
    s.world.positions.r1 = { x: 76, y: 56 };
    const contested = chooseJourney(s, "lofted:wide");
    expect(contested.transition).toBe("choose");
    expect(contested.world.carrierId).toBe("r1");
    const offside = crossingLane();
    offside.world.positions.wide = { x: 80, y: 8 };
    expect(chooseJourney(offside, "lofted:wide").outcome).toBe("blocked");
  });
  it("keeps a final-step loss open for one transition decision", () => {
    const s = crossingLane();
    s.definition = { ...s.definition, steps: ["pass"] };
    const lost = chooseJourney(s, "pass:wide");
    expect(lost.step).toBe(1);
    expect(lost.outcome).toBeNull();
    expect(journeyStep(lost).kind).toBe("transition");
    expect(chooseJourney(lost, "transition:recover").outcome).toBe("contained");
  });
  it("samples every new action continuously and restores exactly after a seek", () => {
    for (const d of journeyBank.filter((d) => d.revision === 2)) {
      const s = complete(createJourney(d))!;
      for (const b of s.beats) {
        const start = sampleJourneyBeat(b, s.players, 0),
          before = journeyFrame(b.before, s.players);
        if (b.revision === 2) expect(start.ballVisual).toEqual(before.ballVisual);
        const end = sampleJourneyBeat(b, s.players, b.duration);
        expect(Object.fromEntries(end.positions)).toEqual(b.after.positions);
        if (b.delivery) {
          expect(sampleJourneyBeat(b, s.players, PASS_WINDUP_SECONDS - 0.001).ballInFlight).toBe(
            false,
          );
          const t = PASS_WINDUP_SECONDS + b.flightSeconds! * 0.5;
          const first = sampleJourneyBeat(b, s.players, t);
          sampleJourneyBeat(b, s.players, b.duration);
          expect(sampleJourneyBeat(b, s.players, t)).toEqual(first);
          expect(first.ballHeight).toBeGreaterThanOrEqual(BALL_REST_HEIGHT);
        }
      }
      expect(sampleJourney(s, journeyDuration(s)).ballCarrierId).toBe(s.world.carrierId);
      expect(restoreJourney(makeJourneyAttempt(s, "learn", d.id)).beats).toEqual(s.beats);
    }
  });
  it("executes each offered choice along every new complete path, including reaction choices", () => {
    let checked = 0;
    for (const d of journeyBank.filter((d) => d.revision === 2)) {
      const path = complete(createJourney(d))!;
      let s = createJourney(d);
      for (const recorded of path.decisions) {
        for (const choice of journeyStep(s).choices) {
          const next = chooseJourney(s, choice.id);
          checked++;
          if (next.transition === "choose")
            for (const reaction of journeyStep(next).choices) {
              const result = chooseJourney(next, reaction.id);
              expect(result.outcome).toBeTruthy();
              expect(
                restoreJourney(makeJourneyAttempt(result, "challenge", "reaction")).beats,
              ).toEqual(result.beats);
            }
          if (next.decisions.at(-1)?.alternative) {
            const alternative = chooseJourney(s, next.decisions.at(-1)!.alternative!.id);
            expect(alternative.decisions.at(-1)?.quality).not.toBe("error");
          }
        }
        s = chooseJourney(s, recorded.choiceId, recorded.decisionSeconds);
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });
});
