import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionCompletion } from "./types";
import { buildStartSessionSummary } from "./startSessionSummary";

const today = "2026-10-21";
const now = Date.parse(`${today}T00:15:00Z`);
const primary = sessionFixture({ date: today });
const second = sessionFixture({ date: today, dbId: "second" });
const started: SessionCompletion = {
  completed: false,
  status: "started",
  rpe: null,
  notes: "",
  startedAt: `${today}T00:00:00Z`,
};
const done: SessionCompletion = { ...started, completed: true, status: "completed" };

describe("Start links to the actual workout without changing its state", () => {
  it("opens today's primary slot without requiring or inventing a completion", () => {
    const completions = {};
    expect(buildStartSessionSummary([primary], completions, today, now)).toEqual({
      kind: "ready",
      session: primary,
      slot: 1,
    });
    expect(completions).toEqual({});
  });

  it("opens the second slot when the first is completed", () => {
    expect(
      buildStartSessionSummary(
        [{ ...primary, secondSession: second }],
        { "session-1": done },
        today,
        now,
      ),
    ).toMatchObject({ kind: "ready", session: { dbId: "second" }, slot: 2 });
  });

  it("resumes the started second slot ahead of the unstarted primary", () => {
    expect(
      buildStartSessionSummary(
        [{ ...primary, secondSession: second }],
        { second: started },
        today,
        now,
      ),
    ).toMatchObject({ kind: "active", session: { dbId: "second" }, slot: 2 });
  });

  it("resumes the most recently started eligible slot", () => {
    expect(
      buildStartSessionSummary(
        [{ ...primary, secondSession: second }],
        {
          "session-1": { ...started, startedAt: `${today}T00:05:00Z` },
          second: started,
        },
        today,
        now,
      ),
    ).toMatchObject({ kind: "active", session: { dbId: "session-1" }, slot: 1 });
  });

  it("recovers the exact pinned second slot after midnight and a cycle rollover", () => {
    const previous = sessionFixture({
      date: "2026-10-20",
      dbId: "old-second",
      executionSlot: 2,
    });
    expect(
      buildStartSessionSummary(
        [primary],
        {
          "old-second": {
            ...started,
            startedAt: "2026-10-20T23:30:00Z",
            executionSnapshot: previous,
          },
        },
        today,
        now,
      ),
    ).toEqual({
      kind: "active",
      session: previous,
      slot: 2,
      expiresAt: Date.parse("2026-10-21T03:30:00Z"),
    });
  });

  it.each([
    { ...started, completed: true, status: "completed" as const },
    { ...started, status: "missed" as const },
    { ...started, startedAt: "2026-10-20T20:00:00Z" },
    { ...started, startedAt: "invalid" },
    { ...started, startedAt: "2026-10-21T01:00:00Z" },
  ])("does not offer continuation from an expired, finished or invalid snapshot", (completion) => {
    const snapshot = sessionFixture({ date: "2026-10-20", executionSlot: 1, dbId: "old" });
    expect(
      buildStartSessionSummary(
        [primary],
        { old: { ...completion, executionSnapshot: snapshot } },
        today,
        now,
      ),
    ).toMatchObject({ kind: "ready", session: { dbId: "session-1" }, slot: 1 });
  });

  it("never routes an orphaned snapshot to a different workout occupying its old slot", () => {
    const snapshot = sessionFixture({ date: today, executionSlot: 1, dbId: "replaced" });
    expect(
      buildStartSessionSummary(
        [primary],
        { replaced: { ...started, executionSnapshot: snapshot } },
        today,
        now,
      ),
    ).toMatchObject({ kind: "ready", session: { dbId: "session-1" }, slot: 1 });
  });

  it("does not guess the slot of an unlabelled snapshot", () => {
    const snapshot = sessionFixture({ date: "2026-10-20", dbId: "old" });
    expect(
      buildStartSessionSummary(
        [primary],
        { old: { ...started, executionSnapshot: snapshot } },
        today,
        now,
      ),
    ).toMatchObject({ kind: "ready", slot: 1 });
  });

  it("puts today's safety stop ahead of resuming a started second slot", () => {
    expect(
      buildStartSessionSummary(
        [
          {
            ...primary,
            loadLabelOverride: "Wstrzymaj trening",
            secondSession: second,
          },
        ],
        { second: started },
        today,
        now,
      ),
    ).toMatchObject({ kind: "blocked", session: { dbId: "session-1" }, slot: 1 });
  });

  it.each([
    [{ ...primary, dayType: "rest" as const }, "rest"],
    [{ ...primary, isUnavailable: true }, "unavailable"],
  ])("offers no workout for rest or unavailable days", (session, kind) => {
    expect(buildStartSessionSummary([session], {}, today, now)).toEqual({ kind });
  });

  it("does not mistake one completed session for a completed double day", () => {
    expect(
      buildStartSessionSummary(
        [{ ...primary, secondSession: second }],
        { "session-1": done, second: done },
        today,
        now,
      ),
    ).toEqual({ kind: "completed" });
  });

  it("does not label missed work completed or recommend a future day as today's workout", () => {
    expect(
      buildStartSessionSummary(
        [primary],
        { "session-1": { ...started, status: "missed" } },
        today,
        now,
      ),
    ).toEqual({ kind: "review" });
    expect(buildStartSessionSummary([{ ...primary, date: "2026-10-22" }], {}, today, now)).toEqual({
      kind: "missing",
    });
  });
});
