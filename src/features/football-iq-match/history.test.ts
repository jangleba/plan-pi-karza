import { describe, expect, it } from "vitest";
import { loadIQHistory, saveIQAttempt } from "./history";
import type { IQAttempt } from "./history";
function store() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    map,
  };
}
const attempt: IQAttempt = {
  id: "one",
  scenarioId: "example",
  variant: 0,
  verdict: "strong",
  createdAt: "2026-10-14T08:00:00Z",
  decisionSeconds: 4,
  mode: "learn",
};
describe("IQ history", () => {
  it("isolates users and retains results across reads", () => {
    const s = store();
    saveIQAttempt("a", attempt, s);
    expect(loadIQHistory("a", s)).toEqual([attempt]);
    expect(loadIQHistory("b", s)).toEqual([]);
  });
  it("does not duplicate a replay", () => {
    const s = store();
    saveIQAttempt("a", attempt, s);
    saveIQAttempt("a", attempt, s);
    expect(loadIQHistory("a", s)).toHaveLength(1);
  });
  it("does not replace unreadable existing history", () => {
    const s = store();
    s.map.set("ballwise:iq:v2:a", "bad");
    expect(() => saveIQAttempt("a", attempt, s)).toThrow();
    expect(s.map.get("ballwise:iq:v2:a")).toBe("bad");
  });
  it("retains only the latest 100 attempts", () => {
    const s = store();
    for (let i = 0; i < 105; i++) saveIQAttempt("a", { ...attempt, id: String(i) }, s);
    expect(loadIQHistory("a", s)).toHaveLength(100);
    expect(loadIQHistory("a", s)[0].id).toBe("5");
  });
  it("does not persist guest results", () => {
    const s = store();
    expect(saveIQAttempt(undefined, attempt, s)).toBe(false);
    expect(s.map.size).toBe(0);
  });
});
