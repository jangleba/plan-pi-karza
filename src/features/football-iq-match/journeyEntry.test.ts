import { beforeEach, describe, expect, it } from "vitest";
import type { JourneyAttempt } from "./journeyTypes";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  freshJourneyEntry,
  journeyVisits,
  rememberJourneyEntry,
  journeyVisitsKey,
} from "./journeyEntry";
import { belongsToLocalUser, clearLocalUserData } from "@/lib/loadwise/localPrivacy";
const map = new Map<string, string>();
const storage = {
  get length() {
    return map.size;
  },
  key: (i: number) => [...map.keys()][i] ?? null,
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => {
    map.set(key, value);
  },
  removeItem: (key: string) => {
    map.delete(key);
  },
};
beforeEach(() => map.clear());
describe("fresh IQ entries", () => {
  it("uses earlier prediction mistakes even when seen entries were filtered out of candidates", () => {
    const pool = advancedJourneyBank.filter((d) => d.role === "wing");
    const failed = pool.find((d) => d.concept === "overload-switch" && d.context === 0)!;
    const current = pool.find((d) => d.concept === "press-cover" && d.context === 0)!;
    const history: JourneyAttempt[] = [failed, current].map((d) => ({
      version: 1,
      bankVersion: "2026-11-06.7",
      id: d.id,
      scenarioId: d.id,
      role: d.role,
      mode: "learn",
      createdAt: new Date().toISOString(),
      choices: [],
      outcome: "retained",
      verdict: "strong",
      ...(d === failed
        ? {
            forecasts: [
              {
                decisionIndex: 0,
                rivalId: "r0",
                predicted: "ball",
                actual: "follow",
                plan: "scan",
              } as const,
            ],
          }
        : {}),
    }));
    const next = freshJourneyEntry(pool, history, "learn", current, [failed.id, current.id]);
    expect(next.topicId).toBe(failed.topicId);
    expect(next.id).not.toBe(failed.id);
    expect(next.id).not.toBe(current.id);
  });
  it("rotates even without any completed attempt, avoids recent topics, and starts another rotation", () => {
    const pool = advancedJourneyBank.filter((d) => d.role === "wing");
    const starts: string[] = [];
    for (let i = 0; i < pool.length * 3; i++) {
      const visits = journeyVisits("a", storage);
      const next = freshJourneyEntry(pool, [], "learn", pool[0], visits);
      if (i) expect(next.id).not.toBe(starts.at(-1));
      if (i < pool.length) expect(starts).not.toContain(next.id);
      starts.push(next.id);
      rememberJourneyEntry("a", next.id, storage);
    }
    expect(journeyVisits("b", storage)).toEqual([]);
  });
  it("scopes its bounded rotation log to the account and includes it in privacy cleanup", () => {
    const key = journeyVisitsKey("account-a");
    for (let i = 0; i < 80; i++) rememberJourneyEntry("account-a", `action-${i}`, storage);
    expect(journeyVisits("account-a", storage)).toHaveLength(48);
    expect(belongsToLocalUser(key, "account-a")).toBe(true);
    expect(belongsToLocalUser(key, "account-b")).toBe(false);
    clearLocalUserData("account-a", storage);
    expect(storage.getItem(key)).toBeNull();
    expect(journeyVisits("account-a", storage)).toEqual([]);
  });
});
