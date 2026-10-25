import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import {
  activeSessionForRoute,
  activeSessionGraceDeadline,
  isActiveSessionWithinGrace,
} from "./activeSession";
import { expiredUnfinishedSessions } from "./sessionStatus";
import type { SessionCompletion } from "./types";

const previous = sessionFixture({ date: "2026-10-19" });
const started: SessionCompletion = {
  completed: false,
  status: "started",
  rpe: null,
  notes: "",
  startedAt: "2026-10-19T23:30:00Z",
};
const afterMidnight = Date.parse("2026-10-20T00:15:00Z");

describe("bounded workout continuity across midnight", () => {
  it("keeps a 23:30 workout active after midnight and out of automatic missed marking", () => {
    expect(isActiveSessionWithinGrace(previous.date, started, "2026-10-20", afterMidnight)).toBe(
      true,
    );
    expect(activeSessionGraceDeadline(previous.date, started, "2026-10-20", afterMidnight)).toBe(
      Date.parse("2026-10-20T03:30:00Z"),
    );
    expect(
      expiredUnfinishedSessions([previous], "2026-10-20", { "session-1": started }, afterMidnight),
    ).toEqual([]);
  });
  it("expires the grace at four elapsed hours, including an abandoned started log", () => {
    const now = Date.parse("2026-10-20T03:30:00Z");
    expect(isActiveSessionWithinGrace(previous.date, started, "2026-10-20", now)).toBe(false);
    expect(
      expiredUnfinishedSessions([previous], "2026-10-20", { "session-1": started }, now),
    ).toEqual([previous]);
  });
  it("does not reopen a completed result or mark it missed later", () => {
    const complete = { ...started, completed: true, status: "completed" as const };
    expect(isActiveSessionWithinGrace(previous.date, complete, "2026-10-20", afterMidnight)).toBe(
      false,
    );
    expect(
      expiredUnfinishedSessions(
        [previous],
        "2026-10-20",
        { "session-1": complete },
        afterMidnight + 8 * 3600000,
      ),
    ).toEqual([]);
  });
  it.each([
    { ...started, startedAt: null },
    { ...started, startedAt: "corrupt" },
    { ...started, startedAt: "2026-10-20T01:00:00Z" },
    { ...started, status: "missed" as const },
  ])("does not grant continuation to an invalid or non-active record", (completion) => {
    expect(isActiveSessionWithinGrace(previous.date, completion, "2026-10-20", afterMidnight)).toBe(
      false,
    );
  });
  it("does not grant an older calendar day access using a newly stamped timestamp", () => {
    expect(isActiveSessionWithinGrace("2026-10-18", started, "2026-10-20", afterMidnight)).toBe(
      false,
    );
    expect(isActiveSessionWithinGrace("2026-10-21", started, "2026-10-20", afterMidnight)).toBe(
      false,
    );
  });
  it("uses elapsed hours across the spring clock change", () => {
    const completion = { ...started, startedAt: "2026-03-28T22:30:00Z" };
    expect(
      isActiveSessionWithinGrace(
        "2026-03-28",
        completion,
        "2026-03-29",
        Date.parse("2026-03-29T01:15:00Z"),
      ),
    ).toBe(true);
    expect(
      isActiveSessionWithinGrace(
        "2026-03-28",
        completion,
        "2026-03-29",
        Date.parse("2026-03-29T02:30:00Z"),
      ),
    ).toBe(false);
  });
  it("allows only the requested active slot, not its unstarted neighbor", () => {
    const second = sessionFixture({ dbId: "second", date: previous.date, slotLabel: "Sesja 2" });
    const plan = [{ ...previous, secondSession: second }];
    expect(
      activeSessionForRoute(
        plan,
        { second: started },
        previous.date,
        1,
        "2026-10-20",
        afterMidnight,
      ),
    ).toBeNull();
    expect(
      activeSessionForRoute(
        plan,
        { second: started },
        previous.date,
        2,
        "2026-10-20",
        afterMidnight,
      )?.dbId,
    ).toBe("second");
  });
  it("resolves the pinned second-slot snapshot after the old cycle left the active plan", () => {
    const snapshot = sessionFixture({ dbId: "second", date: previous.date, executionSlot: 2 });
    const completions = { second: { ...started, executionSnapshot: snapshot } };
    expect(
      activeSessionForRoute([], completions, previous.date, 2, "2026-10-20", afterMidnight),
    ).toBe(snapshot);
    expect(
      activeSessionForRoute([], completions, previous.date, 1, "2026-10-20", afterMidnight),
    ).toBeNull();
    expect(
      activeSessionForRoute([], completions, "2026-10-20", 2, "2026-10-20", afterMidnight),
    ).toBeNull();
  });
  it("does not guess the slot of an old unlabelled snapshot", () => {
    expect(
      activeSessionForRoute(
        [],
        { "session-1": { ...started, executionSnapshot: previous } },
        previous.date,
        1,
        "2026-10-20",
        afterMidnight,
      ),
    ).toBeNull();
  });
});
