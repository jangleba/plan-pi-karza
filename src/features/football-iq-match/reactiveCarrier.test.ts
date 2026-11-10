import { describe, expect, it } from "vitest";
import { attackChoice } from "./attackJourney";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { ATTACK_BANK_VERSION, ATTACK_BANK_VERSION_R2 } from "./liveLesson";
import { playability } from "./playability";
import { situationBank } from "./situationBank";
import { bound } from "./tacticalWorld";
import type { JourneySession } from "./journeyTypes";

const def = (id: string) => situationBank.find((d) => d.id === id)!;
function play(s: JourneySession, n: number) {
  for (let i = 0; i < n && !s.outcome; i++) {
    const own = s.world.carrierId === "you" && !s.world.looseBall;
    const at = s.world.positions.you;
    s = chooseJourney(s, attackChoice(s, own ? "carry" : "move", bound(at.x + 6, at.y - 8)).id, 1);
  }
  return s;
}

describe("rules v9 revision 3: the play reacts to TY", () => {
  it("new actions use revision 3 and every revision replays with its own rules", () => {
    const fresh = createJourneyForRules(def("iqs-ten-behind-1"), 9);
    expect(fresh.attackRevision).toBe(3);
    const now = play(fresh, 4);
    const draft = makeJourneyDraft(now, "learn", "r3");
    expect(draft.bankVersion).toBe(ATTACK_BANK_VERSION);
    expect(restoreJourney(draft)).toEqual(now);

    const older = createJourneyForRules(def("iqs-ten-behind-1"), 9);
    older.attackRevision = 2;
    const then = play(older, 4);
    const saved = makeJourneyDraft(then, "learn", "r2");
    expect(saved.bankVersion).toBe(ATTACK_BANK_VERSION_R2);
    const restored = restoreJourney(saved);
    expect(restored.attackRevision).toBe(2);
    expect(restored).toEqual(then);
  }, 60_000);

  it("the partner with the ball reads TY's run, so different runs lead to different passes", () => {
    // Under revision 2 the carrier passed to the same receiver whatever TY did here.
    const id = "iqs-eight-third-man-0";
    expect(playability(def(id), 2).outcomes).toBe(1);
    expect(playability(def(id), 3).outcomes).toBeGreaterThan(1);
  }, 30_000);

  it("a defender chasing from behind does not win the ball; a goal-side one can", () => {
    const s = createJourneyForRules(def("iqs-wide-1v1-0"), 9);
    expect(s.world.carrierId).toBe("you");
    const at = s.world.positions.you;
    // Carry straight away from the nearest rival towards the goal: nobody goal-side, no tackle.
    const next = chooseJourney(s, attackChoice(s, "carry", bound(at.x, at.y - 10)).id, 1, false);
    const tackles = next.beats.at(-1)!.events!.filter((e) => e.type === "tackle");
    for (const t of tackles) {
      const tackler = next.beats.at(-1)!.live!.find((f) => f.time >= t.time)!.world.positions[
        t.actorId!
      ];
      const carrier = next.beats.at(-1)!.live!.find((f) => f.time >= t.time)!.world.positions[
        t.targetId!
      ];
      expect(tackler.y).toBeLessThan(carrier.y + 1.2);
    }
  }, 30_000);
});
