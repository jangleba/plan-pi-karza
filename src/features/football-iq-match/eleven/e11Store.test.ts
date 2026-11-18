import { describe, expect, it } from "vitest";
import {
  E11_RESULT_VERSION,
  loadE11History,
  MAX_E11_ATTEMPTS,
  saveE11Attempt,
  validAttempt,
  variantFromId,
  type E11Attempt,
} from "./e11Store";

const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};
const attempt = (n: number): E11Attempt => ({
  id: `a${n}`,
  version: E11_RESULT_VERSION,
  engine: 1,
  variant: "e11-mid-3",
  role: "mid",
  inputs: [{ tick: 100, kind: "pass", to: 9, through: true }],
  outcome: "goal",
  timing: "inTime",
  choice: "good",
  problem: "none",
  hints: true,
  createdAt: "2026-11-18T10:00:00Z",
});

describe("11v11 results", () => {
  it("saves and reads back attempts, newest last, capped", () => {
    const store = memory();
    for (let i = 0; i < MAX_E11_ATTEMPTS + 5; i++) saveE11Attempt("u", attempt(i), store);
    const history = loadE11History("u", store);
    expect(history).toHaveLength(MAX_E11_ATTEMPTS);
    expect(history.at(-1)!.id).toBe(`a${MAX_E11_ATTEMPTS + 4}`);
  });

  it("drops damaged records instead of failing", () => {
    const store = memory();
    store.setItem("ballwise:iq:e11:v1:u", JSON.stringify([attempt(1), { id: "x" }, null, "junk"]));
    expect(loadE11History("u", store).map((a) => a.id)).toEqual(["a1"]);
    store.setItem("ballwise:iq:e11:v1:u", "not json");
    expect(loadE11History("u", store)).toEqual([]);
  });

  it("rejects an input that could not have been made", () => {
    expect(
      validAttempt({ ...attempt(1), inputs: [{ tick: 5, kind: "pass", to: 40, through: true }] }),
    ).toBe(false);
    expect(validAttempt({ ...attempt(1), outcome: "winner" })).toBe(false);
  });

  it("names the picture of a saved attempt", () => {
    expect(variantFromId("e11-fwd-8")?.role).toBe("fwd");
    expect(variantFromId("e11-fwd-8")?.seed).toBe(8);
    expect(variantFromId("f5-left-1")).toBeNull();
  });
});
