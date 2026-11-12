import { describe, expect, it } from "vitest";
import {
  fpHistoryKey,
  FP_RESULT_VERSION,
  loadFpHistory,
  saveFpAttempt,
  verifyFpAttempts,
  type FpAttempt,
} from "./fpStore";
import { FP_ENGINE_VERSION, runSim } from "./fpSim";
import { FP_VARIANT_SEEDS, makeVariant } from "./fpVariants";
import { modelInputs, principleFor } from "./fpDebrief";
import {
  applyModuleRestore,
  createModuleSnapshot,
  previewModuleRestore,
} from "../../module-backup/model";
import { journeyHistoryKey } from "../journeyHistory";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

function attempt(id = "fp-1"): FpAttempt {
  const v = makeVariant(FP_VARIANT_SEEDS[1]);
  const inputs = modelInputs(v, principleFor(v));
  const s = runSim(v, inputs, { record: false });
  return {
    id,
    version: FP_RESULT_VERSION,
    engine: FP_ENGINE_VERSION,
    variant: v.id,
    principle: principleFor(v),
    inputs,
    outcome: s.outcome!.kind,
    choice: "good",
    execution: "good",
    look: "motion",
    createdAt: "2026-11-11T20:00:00.000Z",
  };
}

describe("first-person results", () => {
  it("saves versioned results under their own key and leaves the old IQ history alone", () => {
    const store = memory();
    store.setItem(journeyHistoryKey("a"), "[]");
    saveFpAttempt("a", attempt(), store);
    expect(loadFpHistory("a", store)).toHaveLength(1);
    expect(loadFpHistory("a", store)[0]!.version).toBe(1);
    expect(store.getItem(journeyHistoryKey("a"))).toBe("[]");
    expect(fpHistoryKey("a")).toBe("ballwise:iq:fp:v1:a");
  });

  it("keeps nothing for a guest and rejects a broken record", () => {
    const store = memory();
    saveFpAttempt(undefined, attempt(), store);
    expect(store.length).toBe(0);
    store.setItem(fpHistoryKey("a"), JSON.stringify([{ ...attempt(), outcome: "goal" }]));
    expect(() => loadFpHistory("a", store)).toThrow();
    // A broken list does not block saving a new result.
    saveFpAttempt("a", attempt("fp-2"), store);
    expect(loadFpHistory("a", store).map((r) => r.id)).toEqual(["fp-2"]);
  });

  it("replays each attempt: a result that does not follow from the inputs is rejected", () => {
    expect(() => verifyFpAttempts([attempt()])).not.toThrow();
    const real = attempt();
    const fake: FpAttempt = { ...real, outcome: real.outcome === "chance" ? "loss" : "chance" };
    expect(() => verifyFpAttempts([fake])).toThrow(/powtórką/);
  });

  it("travels with the IQ account copy and is checked on restore", () => {
    const from = memory(),
      to = memory();
    saveFpAttempt("a", attempt("fp-copy"), from);
    const snapshot = createModuleSnapshot("iq", "a", from, false);
    const preview = previewModuleRestore(snapshot, "a", to);
    applyModuleRestore(preview, "a", to);
    expect(loadFpHistory("a", to).map((r) => r.id)).toEqual(["fp-copy"]);
    const tampered = JSON.parse(JSON.stringify(snapshot));
    tampered.records.firstPerson[0].id = "fp-other";
    tampered.records.firstPerson[0].outcome =
      tampered.records.firstPerson[0].outcome === "chance" ? "loss" : "chance";
    expect(() => previewModuleRestore(tampered, "a", memory())).toThrow();
  });
});
