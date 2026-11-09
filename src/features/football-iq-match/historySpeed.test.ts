import { describe, expect, it } from "vitest";
import { decisionOptions } from "./decisionOptions";
import {
  journeyHistoryKey,
  loadJourneyHistory,
  makeJourneyAttempt,
  readJourneyBackup,
  verifyJourneyAttempts,
} from "./journeyHistory";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import type { JourneyAttempt, JourneySession } from "./journeyTypes";
import { situationBank } from "./situationBank";

function finished(k: number): JourneyAttempt | null {
  let s: JourneySession = createJourneyForRules(situationBank[(k * 7) % situationBank.length], 9);
  let r = k * 13 + 1;
  for (let i = 0; i < 80 && !s.outcome; i++) {
    const options = decisionOptions({ ...s, controlledId: "you" });
    if (!options.length) break;
    r = (r * 1103515245 + 12345) % 2147483648;
    s = chooseJourney({ ...s, controlledId: "you" }, options[r % options.length].choice.id, 1);
  }
  return s.outcome ? makeJourneyAttempt(s, "learn", `speed-${k}`) : null;
}

describe("IQ history reads stay fast as the history grows", () => {
  const attempts = Array.from({ length: 8 }, (_, k) => finished(k)).filter(
    (a): a is JourneyAttempt => !!a,
  );
  const store = new Map([[journeyHistoryKey("u"), JSON.stringify(attempts)]]);
  const storage = { getItem: (key: string) => store.get(key) ?? null };

  it("reading the local history does not replay every action", () => {
    expect(attempts.length).toBeGreaterThan(3);
    const replayStart = performance.now();
    verifyJourneyAttempts(attempts);
    const replay = performance.now() - replayStart;
    const readStart = performance.now();
    expect(loadJourneyHistory("u", storage)).toHaveLength(attempts.length);
    const read = performance.now() - readStart;
    // Reading is a structure check: a small fraction of replaying the same actions.
    expect(read).toBeLessThan(replay / 10);
  }, 240_000);

  it("actions from outside are still replayed: a changed result is rejected", () => {
    const changed = {
      ...attempts[0],
      verdict: attempts[0].verdict === "strong" ? "risky" : "strong",
    } as JourneyAttempt;
    expect(() => verifyJourneyAttempts([changed])).toThrow();
    expect(() =>
      readJourneyBackup({ schema: "ballwise.iq.journey-backup.v1", attempts: [changed] }),
    ).toThrow();
  }, 120_000);
});
