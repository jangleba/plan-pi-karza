import { describe, expect, it } from "vitest";
import { journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, journeyStep } from "./journeyEngine";
import {
  loadJourneyDraft,
  loadJourneyHistory,
  makeJourneyAttempt,
  restoreJourney,
  saveJourneyAttempt,
  saveJourneyDraft,
} from "./journeyHistory";
function store() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
function finished() {
  let s = createJourney(journeyBank[0]);
  while (!s.outcome) {
    const choices = journeyStep(s).choices;
    const c = choices.find((c) => c.quality === "good") ?? choices[0];
    s = chooseJourney(s, c.id, 2);
  }
  return s;
}
describe("IQ journey persistence", () => {
  it("isolates accounts, preserves mode, and does not double count replay", () => {
    const storage = store(),
      session = finished();
    for (const mode of ["learn", "challenge"] as const) {
      const a = makeJourneyAttempt(session, mode, mode);
      saveJourneyAttempt("a", a, storage);
      saveJourneyAttempt("a", a, storage);
    }
    expect(loadJourneyHistory("a", storage)).toHaveLength(2);
    expect(loadJourneyHistory("b", storage)).toEqual([]);
    expect(loadJourneyHistory("a", storage).map((a) => a.mode)).toEqual(["learn", "challenge"]);
  });
  it("resumes choices and the exact world after refresh", () => {
    const storage = store(),
      s = createJourney(journeyBank[2]),
      next = chooseJourney(s, journeyStep(s).choices[0].id, 3);
    if (next.outcome) return;
    saveJourneyDraft("a", next, "challenge", "draft", storage);
    const draft = loadJourneyDraft("a", storage)!;
    expect(restoreJourney(draft).world).toEqual(next.world);
    expect(draft.mode).toBe("challenge");
    expect(loadJourneyDraft("b", storage)).toBeNull();
  });
  it("does not overwrite corrupt history", () => {
    const storage = store();
    storage.data.set("ballwise:iq:journeys:v1:a", "broken");
    expect(() =>
      saveJourneyAttempt("a", makeJourneyAttempt(finished(), "learn", "one"), storage),
    ).toThrow();
    expect(storage.data.get("ballwise:iq:journeys:v1:a")).toBe("broken");
  });
  it("rejects tampered or impossible paths and does not store guests", () => {
    const storage = store(),
      a = makeJourneyAttempt(finished(), "learn", "one");
    expect(() => restoreJourney({ ...a, choices: [{ id: "unavailable", seconds: 1 }] })).toThrow();
    expect(saveJourneyAttempt(undefined, a, storage)).toBe(false);
    expect(storage.data.size).toBe(0);
  });
  it("removes a finished draft and keeps existing legacy history untouched", () => {
    const storage = store();
    storage.data.set("ballwise:iq:v2:a", "legacy");
    saveJourneyDraft("a", createJourney(journeyBank[0]), "learn", "one", storage);
    saveJourneyDraft("a", finished(), "learn", "one", storage);
    expect(loadJourneyDraft("a", storage)).toBeNull();
    expect(storage.data.get("ballwise:iq:v2:a")).toBe("legacy");
  });
});
