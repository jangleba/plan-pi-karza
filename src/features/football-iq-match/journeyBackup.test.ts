// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { FootballIQJourney } from "./FootballIQJourney";
vi.mock("./TacticalPitch", () => ({ TacticalPitch: () => null }));
import { journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, journeyPointChoice, journeyStep } from "./journeyEngine";
import {
  clearJourneyDataAfterBackup,
  createJourneyBackup,
  journeyDraftKey,
  journeyHistoryKey,
  loadJourneyDraft,
  loadJourneyHistory,
  makeJourneyAttempt,
  makeJourneyDraft,
  rawJourneyData,
  restoreJourney,
  restoreJourneyBackup,
  saveJourneyAttempt,
  saveJourneyDraft,
} from "./journeyHistory";
function store() {
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
function completed(free = false) {
  const definition = free
    ? journeyBank.find((row) => row.role === "wing" && row.steps[0] === "carry")!
    : journeyBank[0];
  let session = createJourney(definition);
  if (free)
    session = chooseJourney(session, journeyPointChoice(session, { x: 42.37, y: 83.91 }).id, 3.15);
  while (!session.outcome) {
    const choices = journeyStep(session).choices;
    session = chooseJourney(
      session,
      (choices.find((choice) => choice.quality === "good") ?? choices[0]).id,
      2.5,
    );
  }
  return session;
}
afterEach(() => vi.restoreAllMocks());
describe("IQ Journey backups and local write safety", () => {
  it("announces an applied draft and protects it until the user selects their active action", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    localStorage.clear();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(createElement(FootballIQJourney, { historyOwner: "a", initialScenario: 0 })),
      );
      const original = loadJourneyDraft("a")!;
      const remote = makeJourneyDraft(createJourney(journeyBank[2]), "learn", "remote");
      localStorage.setItem(journeyDraftKey("a"), JSON.stringify(remote));
      await act(async () =>
        window.dispatchEvent(
          new CustomEvent("ballwise:module-data-applied", {
            detail: { userId: "a", module: "iq", key: journeyDraftKey("a") },
          }),
        ),
      );
      expect(host.textContent).toContain("Twoja bieżąca akcja pozostaje na ekranie");
      const click = async (text: string) => {
        const button = [...host.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === text,
        )!;
        await act(async () => button.click());
      };
      await click("Bez podpowiedzi");
      expect(loadJourneyDraft("a")?.id).toBe("remote");
      await click("Zachowaj bieżącą akcję");
      expect(loadJourneyDraft("a")?.id).toBe(original.id);
      expect(loadJourneyDraft("a")?.mode).toBe("challenge");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      localStorage.clear();
      vi.unstubAllGlobals();
    }
  });
  it("does not persist the previous account's session into a newly selected account", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    localStorage.clear();
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      const draftB = makeJourneyDraft(
        createJourney(journeyBank[2]),
        "challenge",
        "account-b-draft",
      );
      localStorage.setItem(journeyDraftKey("b"), JSON.stringify(draftB));
      await act(async () =>
        root.render(createElement(FootballIQJourney, { historyOwner: "a", initialScenario: 0 })),
      );
      const beforeA = localStorage.getItem(journeyDraftKey("a"));
      await act(async () =>
        root.render(createElement(FootballIQJourney, { historyOwner: "b", initialScenario: 0 })),
      );
      expect(loadJourneyDraft("b")).toEqual(draftB);
      expect(localStorage.getItem(journeyDraftKey("a"))).toBe(beforeA);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      localStorage.clear();
      vi.unstubAllGlobals();
    }
  });
  it("preserves all 100 existing attempts when the next result exceeds capacity", () => {
    const storage = store();
    const rows = Array.from({ length: 100 }, (_, index) =>
      makeJourneyAttempt(completed(), "learn", `old-${index}`),
    );
    storage.setItem(journeyHistoryKey("a"), JSON.stringify(rows));
    const before = storage.getItem(journeyHistoryKey("a"));
    const pending = makeJourneyAttempt(completed(), "learn", "new");
    expect(() => saveJourneyAttempt("a", pending, storage)).toThrow("100 prób");
    expect(storage.getItem(journeyHistoryKey("a"))).toBe(before);
    const downloadable = createJourneyBackup([pending]);
    expect(restoreJourneyBackup("b", downloadable, storage).attempts).toEqual([pending]);
  });
  it("round trips exact free choices, decision times and the original bank version", () => {
    const storage = store();
    const free = makeJourneyAttempt(completed(true), "challenge", "free-attempt");
    const old = { ...makeJourneyAttempt(completed(), "learn", "old"), bankVersion: "2026-10-15.1" };
    const initial = createJourney(journeyBank[0]);
    const draft = makeJourneyDraft(
      chooseJourney(initial, journeyStep(initial).choices[0].id, 4.2),
      "challenge",
      "draft",
    );
    const backup = JSON.parse(JSON.stringify(createJourneyBackup([old, free], draft)));
    restoreJourneyBackup("a", backup, storage);
    expect(loadJourneyHistory("a", storage)).toEqual([old, free]);
    expect(loadJourneyHistory("b", storage)).toEqual([]);
    expect(loadJourneyDraft("a", storage)).toEqual(draft);
    expect(restoreJourney(free)).toEqual(completed(true));
    expect(free.choices[0].id).toContain("42.37:83.91");
  });
  it("merges different result IDs without double counting repeated imports", () => {
    const storage = store();
    const first = makeJourneyAttempt(completed(), "learn", "first");
    const next = makeJourneyAttempt(completed(), "learn", "next");
    saveJourneyAttempt("a", first, storage);
    expect(restoreJourneyBackup("a", createJourneyBackup([first, next]), storage).added).toBe(1);
    expect(restoreJourneyBackup("a", createJourneyBackup([first, next]), storage).added).toBe(0);
    expect(loadJourneyHistory("a", storage)).toEqual([first, next]);
  });
  it("rejects impossible results and collisions without replacing existing bytes", () => {
    const storage = store();
    const attempt = makeJourneyAttempt(completed(), "learn", "same");
    saveJourneyAttempt("a", attempt, storage);
    const before = rawJourneyData("a", storage);
    expect(() =>
      restoreJourneyBackup(
        "a",
        {
          ...createJourneyBackup([attempt]),
          attempts: [{ ...attempt, choices: [{ id: "impossible", seconds: 1 }] }],
        },
        storage,
      ),
    ).toThrow();
    const collision = { ...attempt, mode: "challenge" as const };
    expect(() => restoreJourneyBackup("a", createJourneyBackup([collision]), storage)).toThrow(
      "identyfikatorem",
    );
    expect(rawJourneyData("a", storage)).toEqual(before);
  });
  it("does not overwrite corrupt history or a corrupt draft during autosave/import", () => {
    const storage = store();
    storage.setItem(journeyHistoryKey("a"), "broken-history");
    storage.setItem(journeyDraftKey("a"), "broken-draft");
    const before = rawJourneyData("a", storage);
    expect(() =>
      saveJourneyDraft("a", createJourney(journeyBank[0]), "learn", "draft", storage),
    ).toThrow();
    expect(() => saveJourneyDraft("a", completed(), "learn", "done", storage)).toThrow();
    expect(() => restoreJourneyBackup("a", createJourneyBackup([]), storage)).toThrow();
    expect(rawJourneyData("a", storage)).toEqual(before);
  });
  it("keeps the local unfinished draft when a backup contains a different action", () => {
    const storage = store();
    const first = createJourney(journeyBank[0]);
    saveJourneyDraft("a", first, "learn", "local", storage);
    const before = rawJourneyData("a", storage);
    expect(() =>
      restoreJourneyBackup(
        "a",
        createJourneyBackup([], makeJourneyDraft(first, "learn", "remote")),
        storage,
      ),
    ).toThrow("niedokończoną akcję");
    expect(rawJourneyData("a", storage)).toEqual(before);
  });
  it("rolls back a history import if storing its draft fails", () => {
    const storage = store();
    const first = makeJourneyAttempt(completed(), "learn", "first");
    saveJourneyAttempt("a", first, storage);
    const before = rawJourneyData("a", storage);
    const baseSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.endsWith(":draft")) throw new DOMException("Quota exceeded", "QuotaExceededError");
      baseSet(key, value);
    };
    const second = makeJourneyAttempt(completed(), "learn", "second");
    expect(() =>
      restoreJourneyBackup(
        "a",
        createJourneyBackup(
          [second],
          makeJourneyDraft(createJourney(journeyBank[0]), "learn", "draft"),
        ),
        storage,
      ),
    ).toThrow("Quota");
    expect(rawJourneyData("a", storage)).toEqual(before);
  });
  it("announces exact scoped keys after successful writes and a null draft tombstone", () => {
    const storage = store();
    const changed = vi.fn();
    window.addEventListener("ballwise:module-data-changed", changed);
    try {
      saveJourneyDraft("a", createJourney(journeyBank[0]), "learn", "draft", storage);
      saveJourneyAttempt("a", makeJourneyAttempt(completed(), "learn", "done"), storage);
      saveJourneyDraft("a", completed(), "learn", "done", storage);
      const details = changed.mock.calls.map(([event]) => (event as CustomEvent).detail);
      expect(details.map((detail) => detail.key)).toEqual([
        journeyDraftKey("a"),
        journeyHistoryKey("a"),
        journeyDraftKey("a"),
      ]);
      expect(details.every((detail) => detail.userId === "a" && detail.module === "iq")).toBe(true);
      expect(details[2].value).toBeNull();
      expect(JSON.parse(details[1].value)).toHaveLength(1);
    } finally {
      window.removeEventListener("ballwise:module-data-changed", changed);
    }
  });
  it("clears only an explicitly backed-up unchanged account snapshot", () => {
    const storage = store();
    storage.setItem(journeyHistoryKey("a"), "broken");
    storage.setItem(journeyHistoryKey("b"), "other-account");
    const backedUp = rawJourneyData("a", storage);
    storage.setItem(journeyDraftKey("a"), "new-data");
    expect(() => clearJourneyDataAfterBackup("a", backedUp, storage)).toThrow("zmienił się");
    const fresh = rawJourneyData("a", storage);
    clearJourneyDataAfterBackup("a", fresh, storage);
    expect(rawJourneyData("a", storage)).toEqual({ history: null, draft: null });
    expect(storage.getItem(journeyHistoryKey("b"))).toBe("other-account");
  });
});
