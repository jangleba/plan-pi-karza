import { describe, expect, it } from "vitest";
import { decisionOptions } from "./decisionOptions";
import { makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { chooseJourney, createJourneyForRules, sampleJourneyBeat } from "./journeyEngine";
import type { JourneySession } from "./journeyTypes";
import { ATTACK_BANK_VERSION, ATTACK_BANK_VERSION_V9 } from "./liveLesson";
import { situationBank } from "./situationBank";

function play(s: JourneySession, seed: number) {
  let r = seed;
  for (let i = 0; i < 6 && !s.outcome; i++) {
    const options = decisionOptions({ ...s, controlledId: "you" });
    if (!options.length) break;
    r = (r * 1103515245 + 12345) % 2147483648;
    s = chooseJourney({ ...s, controlledId: "you" }, options[r % options.length].choice.id, 1);
  }
  return s;
}

describe("balls in the air (rules v9 revision 2)", () => {
  it("partners switch, chip and cross, and players head the ball", () => {
    const kinds = new Set<string>();
    let headers = 0;
    for (const def of situationBank) {
      const s = play(createJourneyForRules(def, 9), def.ordinal);
      for (const beat of s.beats) {
        for (const f of beat.live ?? []) if (f.kickDelivery) kinds.add(f.kickDelivery);
        for (const e of beat.events ?? [])
          if (e.text.includes("głową")) {
            headers++;
            const frame = sampleJourneyBeat(beat, s.players, e.time);
            expect(frame.motions.get(e.actorId!)?.state).toBe("header");
          }
      }
    }
    expect([...kinds].sort()).toEqual(["chip", "cross", "lofted"]);
    expect(headers).toBeGreaterThan(0);
  }, 120_000);

  it("a long switch is offered as a lofted pass", () => {
    const def = situationBank.find((d) => d.id === "iqs-gk-switch-0")!;
    const switchPass = decisionOptions({
      ...createJourneyForRules(def, 9),
      controlledId: "you",
    }).find((o) => o.label.includes("przerzutem"));
    expect(switchPass?.choice.id).toContain(":lofted:");
  });

  it("actions saved before revision 2 replay with their original rules", () => {
    const def = situationBank.find((d) => d.id === "iqs-cross-0")!;
    const old = createJourneyForRules(def, 9);
    delete old.attackRevision;
    const played = play(old, 7);
    const draft = makeJourneyDraft(played, "learn", "old");
    expect(draft.bankVersion).toBe(ATTACK_BANK_VERSION_V9);
    expect(restoreJourney(draft)).toEqual(played);
    expect(
      played.beats.flatMap((b) => b.live ?? []).some((f) => f.kickDelivery && f.kicker !== "you"),
    ).toBe(false);

    const current = play(createJourneyForRules(def, 9), 7);
    const fresh = makeJourneyDraft(current, "learn", "new");
    expect(fresh.bankVersion).toBe(ATTACK_BANK_VERSION);
    expect(restoreJourney(fresh)).toEqual(current);
  }, 60_000);
});
