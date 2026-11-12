import { describe, expect, it } from "vitest";
import { createSim, F5_ENGINE_VERSION, stepSim } from "./f5Sim";
import { F5_VARIANT_SEEDS, makeVariant } from "./f5Variants";
import { botInputs } from "./f5Bot";
import { buildDebrief } from "./f5Debrief";
import {
  F5_RESULT_VERSION,
  f5HistoryKey,
  loadF5History,
  saveF5Attempt,
  validF5Attempt,
  verifyF5Attempts,
  type F5Attempt,
} from "./f5Store";
import { fpHistoryKey } from "../firstPerson/fpStore";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  };
};
function attempt(id = "a1"): F5Attempt {
  const v = makeVariant(F5_VARIANT_SEEDS.left[0]!, "left");
  const s = createSim(v);
  const inputs = botInputs(s, "pass", (st, i) => stepSim(st, i));
  const d = buildDebrief(s);
  return {
    id,
    version: F5_RESULT_VERSION,
    engine: F5_ENGINE_VERSION,
    variant: v.id,
    position: "left",
    inputs,
    outcome: d.outcome,
    choice: d.choice.grade,
    execution: d.execution.grade,
    problem: d.problem,
    look: "drag",
    createdAt: "2026-11-12T08:00:00.000Z",
  };
}

describe("5v5 results", () => {
  it("saves under its own versioned key and leaves older IQ history alone", () => {
    const store = memory();
    store.setItem(fpHistoryKey("u"), "[]");
    const saved = saveF5Attempt("u", attempt(), store);
    expect(saved).toHaveLength(1);
    expect(f5HistoryKey("u")).toBe("ballwise:iq:f5:v1:u");
    expect(loadF5History("u", store)[0]!.id).toBe("a1");
    expect(store.getItem(fpHistoryKey("u"))).toBe("[]");
    // Saving the same id again replaces it (no duplicates).
    expect(saveF5Attempt("u", attempt(), store)).toHaveLength(1);
  });

  it("does not save for a guest and rejects broken rows", () => {
    const store = memory();
    saveF5Attempt(undefined, attempt(), store);
    expect(store.map.size).toBe(0);
    expect(validF5Attempt({ ...attempt(), position: "def" })).toBe(false);
    expect(
      validF5Attempt({ ...attempt(), inputs: [{ tick: -1, kind: "move", dir: 0, speed: 0 }] }),
    ).toBe(false);
    store.setItem(f5HistoryKey("u"), "{broken");
    expect(() => loadF5History("u", store)).toThrow();
    // A broken list does not block saving a new result.
    expect(saveF5Attempt("u", attempt(), store)).toHaveLength(1);
  });

  it("checks restored attempts by playing them again", () => {
    const real = attempt();
    expect(() => verifyF5Attempts([real])).not.toThrow();
    const other = real.outcome === "goal" ? "lost" : "goal";
    expect(() => verifyF5Attempts([{ ...real, outcome: other }])).toThrow(/powtórką/);
    // Another engine version is kept as it is.
    expect(() => verifyF5Attempts([{ ...real, outcome: other, engine: 99 }])).not.toThrow();
  });
});
