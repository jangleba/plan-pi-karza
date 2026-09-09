import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import { expiredUnfinishedSessions } from "./sessionStatus";

const session = {
  date: "2026-09-05",
  dbId: "s1",
  dayType: "training",
  secondSession: null,
} as SessionDay;

describe("expired sessions", () => {
  it("oznacza jako pominiętą tylko przeszłą niewykonaną sesję", () => {
    expect(expiredUnfinishedSessions([session], "2026-09-06", {})).toHaveLength(1);
    expect(expiredUnfinishedSessions([session], "2026-09-05", {})).toHaveLength(0);
    expect(expiredUnfinishedSessions([session], "2026-09-06", { s1: { completed: true, rpe: 7, notes: "" } })).toHaveLength(0);
  });
});
