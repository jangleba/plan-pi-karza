// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildJumpTimeline } from "../browser-lab/measurement";
import { createBrowserResult } from "../browser-lab/results";
import { attemptPlan } from "../browser-lab/protocols";
import {
  makeJourneyAttempt,
  journeyHistoryKey,
  journeyDraftKey,
  makeJourneyDraft,
} from "../football-iq-match/journeyHistory";
import { journeyBank } from "../football-iq-match/journeyBank";
import { createJourney, chooseJourney, journeyStep } from "../football-iq-match/journeyEngine";
import { emptyFuelData, fuelStorageKey } from "@/lib/fuel/experience";
import {
  applyModuleRestore,
  createModuleSnapshot,
  previewModuleRestore,
  rememberModuleSnapshot,
  validateModuleSnapshot,
  moduleKeys,
} from "./model";
const now = Date.parse("2026-10-18T12:00:00.000Z");
function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
function attempt(id: string) {
  let session = createJourney(journeyBank[0]);
  while (!session.outcome) {
    const choices = journeyStep(session).choices;
    session = chooseJourney(
      session,
      (choices.find((choice) => choice.quality === "good") ?? choices[0]).id,
      2,
    );
  }
  return makeJourneyAttempt(session, "learn", id, new Date(now));
}
function lab() {
  const timeline = buildJumpTimeline(
    Array.from({ length: 240 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
  );
  return createBrowserResult({
    attempt: attemptPlan(["cmj"])[0],
    sessionId: "lab-session",
    timeline,
    start: 30,
    end: 130,
    sourceName: "private-name.mov",
    sourceHash: "a".repeat(64),
    sourceBytes: 10000,
    codec: "avc1.640029",
    guidePositions: [0.5, 0.5],
    notes: "private health note",
  });
}
describe("explicit per-device module snapshots", () => {
  it("uses only exact account module keys", () => {
    expect(moduleKeys("iq", "a")).toEqual({
      history: journeyHistoryKey("a"),
      draft: journeyDraftKey("a"),
    });
    const store = memory();
    store.setItem(journeyHistoryKey("b"), "broken other account");
    store.setItem("loadwise:boot:v2:a", "private profile and GPS");
    expect(JSON.stringify(createModuleSnapshot("iq", "a", store, false, now))).not.toContain(
      "private",
    );
  });
  it("omits notes and filenames unless the user explicitly includes their text", () => {
    const store = memory();
    store.setItem(moduleKeys("lab", "a").history, JSON.stringify([lab()]));
    const plain = createModuleSnapshot("lab", "a", store, false, now);
    expect(JSON.stringify(plain)).not.toContain("private");
    expect(JSON.stringify(createModuleSnapshot("lab", "a", store, true, now))).toContain(
      "private health note",
    );
  });
  it("excludes free product descriptions by default without treating them as deleted", () => {
    const store = memory();
    const data = emptyFuelData();
    data.entries.push({
      id: "product",
      recipeId: "store-product",
      title: "private product",
      lines: [],
      contextKey: "manual",
      status: "selected",
      createdAt: now,
      eatenAt: null,
      fraction: 1,
      feedback: null,
      product: { value: { name: "private product", source: "name" }, portion: 200, unit: "g" },
    });
    store.setItem(fuelStorageKey("a"), JSON.stringify(data));
    rememberModuleSnapshot("a", createModuleSnapshot("fuel", "a", store, true, now), store);
    const plain = createModuleSnapshot("fuel", "a", store, false, now);
    expect(JSON.stringify(plain)).not.toContain("private product");
    expect(plain.omitted).toBe(1);
    expect(plain.deleted.data).toEqual([]);
  });
  it("omits custom reactive labels by default", () => {
    const store = memory();
    store.setItem(
      moduleKeys("reactive", "a").sets,
      JSON.stringify([
        {
          id: "custom",
          name: "private set",
          createdAt: new Date(now).toISOString(),
          actions: [{ id: "step", label: "private cue", direction: "left" }],
        },
      ]),
    );
    const snapshot = createModuleSnapshot("reactive", "a", store, false, now);
    expect(snapshot.omitted).toBe(1);
    expect(snapshot.records.sets).toBeNull();
  });
  it("merges history IDs and keeps both cloud and local conflicting copies available", () => {
    const store = memory();
    const local = attempt("same"),
      remote = { ...local, mode: "challenge" as const };
    store.setItem(journeyHistoryKey("source"), JSON.stringify([remote, attempt("new")]));
    const snapshot = createModuleSnapshot("iq", "source", store, false, now);
    store.setItem(journeyHistoryKey("target"), JSON.stringify([local]));
    const preview = previewModuleRestore(snapshot, "target", store, now);
    expect(preview.conflicts).toEqual(["history: same"]);
    expect(preview.added).toBe(1);
    applyModuleRestore(preview, "target", store);
    expect(JSON.parse(store.getItem(journeyHistoryKey("target"))!)).toEqual([
      local,
      attempt("new"),
    ]);
    expect((snapshot.records.history as (typeof remote)[])[0]).toEqual(remote);
  });
  it("tracks known removals and does not resurrect them from an older snapshot", () => {
    const store = memory();
    store.setItem(journeyHistoryKey("a"), JSON.stringify([attempt("old"), attempt("kept")]));
    const older = createModuleSnapshot("iq", "a", store, false, now);
    rememberModuleSnapshot("a", older, store);
    store.setItem(journeyHistoryKey("a"), JSON.stringify([attempt("kept")]));
    expect(previewModuleRestore(older, "a", store, now).skippedDeleted).toBe(1);
    const newer = createModuleSnapshot("iq", "a", store, false, now);
    expect(newer.deleted.history).toEqual(["old"]);
    rememberModuleSnapshot("a", newer, store);
    const preview = previewModuleRestore(older, "a", store, now);
    expect(preview.skippedDeleted).toBe(1);
    applyModuleRestore(preview, "a", store);
    expect(JSON.parse(store.getItem(journeyHistoryKey("a"))!)).toEqual([attempt("kept")]);
  });
  it("restores exact Fuel product portions when user text was explicitly included", () => {
    const store = memory(),
      data = emptyFuelData();
    data.entries.push({
      id: "product",
      recipeId: "store-product",
      title: "Rice drink",
      lines: [],
      contextKey: "manual",
      status: "eaten",
      createdAt: now,
      eatenAt: now,
      fraction: 0.5,
      feedback: "comfortable",
      product: {
        value: {
          name: "Rice drink",
          source: "label",
          nutritionUnit: "ml",
          nutriments: { carbohydrates100g: 12 },
        },
        portion: 375,
        unit: "ml",
      },
    });
    store.setItem(fuelStorageKey("source"), JSON.stringify(data));
    const snapshot = createModuleSnapshot("fuel", "source", store, true, now);
    applyModuleRestore(previewModuleRestore(snapshot, "target", store, now), "target", store);
    expect(JSON.parse(store.getItem(fuelStorageKey("target"))!).entries).toEqual(data.entries);
  });
  it("restores exact IQ draft choices and paused Reactive settings and phase", () => {
    const store = memory();
    const initial = createJourney(journeyBank[0]);
    const draft = makeJourneyDraft(
      chooseJourney(initial, journeyStep(initial).choices[0].id, 3.123),
      "challenge",
      "draft",
    );
    store.setItem(journeyDraftKey("source"), JSON.stringify(draft));
    applyModuleRestore(
      previewModuleRestore(
        createModuleSnapshot("iq", "source", store, false, now),
        "target",
        store,
        now,
      ),
      "target",
      store,
    );
    expect(JSON.parse(store.getItem(journeyDraftKey("target"))!)).toEqual(draft);
    const session = {
      version: 1,
      id: "session",
      phase: "paused",
      settings: {
        mode: "colors",
        level: "basic",
        intervalSec: 3,
        randomTiming: true,
        durationMin: 3,
        vibration: true,
        flashDurationMs: 800,
        activeDirections: ["left", "right"],
        activeColors: ["blue", "red"],
        sequenceLength: 2,
        customSetId: null,
      },
      stats: {
        startedAt: new Date(now).toISOString(),
        endedAt: null,
        elapsedSec: 21.5,
        cueCount: 7,
        decisionChanges: 0,
        directionCounts: { left: 0, right: 0, forward: 0, back: 0 },
        colorCounts: { blue: 3, green: 0, yellow: 0, red: 4 },
        mode: "colors",
        intervalSec: 3,
        randomTiming: true,
      },
    };
    store.setItem(moduleKeys("reactive", "source").session, JSON.stringify(session));
    applyModuleRestore(
      previewModuleRestore(
        createModuleSnapshot("reactive", "source", store, true, now),
        "target",
        store,
        now,
      ),
      "target",
      store,
    );
    expect(JSON.parse(store.getItem(moduleKeys("reactive", "target").session)!)).toEqual(session);
  });
  it("never lets a null snapshot slot delete local results", () => {
    const store = memory();
    const empty = createModuleSnapshot("iq", "source", store, false, now);
    store.setItem(journeyHistoryKey("target"), JSON.stringify([attempt("kept")]));
    applyModuleRestore(previewModuleRestore(empty, "target", store, now), "target", store);
    expect(JSON.parse(store.getItem(journeyHistoryKey("target"))!)).toEqual([attempt("kept")]);
  });
  it("keeps incoming deletion markers on a fresh device when an older copy is restored later", () => {
    const store = memory();
    store.setItem(
      journeyHistoryKey("source"),
      JSON.stringify([attempt("removed"), attempt("kept")]),
    );
    const older = createModuleSnapshot("iq", "source", store, false, now);
    rememberModuleSnapshot("source", older, store);
    store.setItem(journeyHistoryKey("source"), JSON.stringify([attempt("kept")]));
    const newer = createModuleSnapshot("iq", "source", store, false, now);
    applyModuleRestore(previewModuleRestore(newer, "fresh", store, now), "fresh", store);
    const oldPreview = previewModuleRestore(older, "fresh", store, now);
    expect(oldPreview.skippedDeleted).toBe(1);
    applyModuleRestore(oldPreview, "fresh", store);
    expect(
      JSON.parse(store.getItem(journeyHistoryKey("fresh"))!).map((row: { id: string }) => row.id),
    ).toEqual(["kept"]);
  });
  it("preserves corrupt local bytes and rejects unsupported remote slots", () => {
    const store = memory();
    const snapshot = createModuleSnapshot("iq", "source", store, false, now);
    store.setItem(journeyHistoryKey("target"), "corrupt original");
    expect(() => createModuleSnapshot("iq", "target", store, false, now)).toThrow();
    expect(() => previewModuleRestore(snapshot, "target", store, now)).toThrow();
    expect(store.getItem(journeyHistoryKey("target"))).toBe("corrupt original");
    expect(() =>
      validateModuleSnapshot({ ...snapshot, records: { profile: {} } }, "iq", "target", now),
    ).toThrow("nieobsługiwane");
  });
  it("checks local values again before apply so intervening edits survive", () => {
    const store = memory();
    store.setItem(journeyHistoryKey("source"), JSON.stringify([attempt("remote")]));
    const preview = previewModuleRestore(
      createModuleSnapshot("iq", "source", store, false, now),
      "target",
      store,
      now,
    );
    store.setItem(journeyHistoryKey("target"), JSON.stringify([attempt("later")]));
    expect(() => applyModuleRestore(preview, "target", store)).toThrow("zmieniły się");
    expect(JSON.parse(store.getItem(journeyHistoryKey("target"))!)[0].id).toBe("later");
  });
  it("rolls back earlier slots when a later write hits quota", () => {
    const store = memory();
    store.setItem(journeyHistoryKey("source"), JSON.stringify([attempt("remote")]));
    store.setItem(
      journeyDraftKey("source"),
      JSON.stringify(makeJourneyDraft(createJourney(journeyBank[0]), "learn", "draft")),
    );
    const preview = previewModuleRestore(
      createModuleSnapshot("iq", "source", store, false, now),
      "target",
      store,
      now,
    );
    const base = store.setItem;
    store.setItem = (key, value) => {
      if (key === journeyDraftKey("target")) throw new Error("quota");
      base(key, value);
    };
    expect(() => applyModuleRestore(preview, "target", store)).toThrow("quota");
    expect(store.getItem(journeyHistoryKey("target"))).toBeNull();
    expect(store.getItem(journeyDraftKey("target"))).toBeNull();
  });
  it("refuses merged capacity overflow instead of truncating history", () => {
    const store = memory();
    store.setItem(journeyHistoryKey("source"), JSON.stringify([attempt("remote")]));
    store.setItem(
      journeyHistoryKey("target"),
      JSON.stringify(Array.from({ length: 100 }, (_, index) => attempt(`local-${index}`))),
    );
    const before = store.getItem(journeyHistoryKey("target"));
    expect(() =>
      previewModuleRestore(
        createModuleSnapshot("iq", "source", store, false, now),
        "target",
        store,
        now,
      ),
    ).toThrow();
    expect(store.getItem(journeyHistoryKey("target"))).toBe(before);
  });
});
