import { describe, expect, it } from "vitest";
import { journeyBank } from "./journeyBank";
import { nextPractice, practiceToday } from "./journeyPractice";
import type { JourneyAttempt } from "./journeyTypes";
const now = new Date("2026-10-15T10:00:00Z");
function attempt(
  id: string,
  verdict: JourneyAttempt["verdict"] = "risky",
  mode: JourneyAttempt["mode"] = "learn",
): JourneyAttempt {
  return {
    version: 1,
    bankVersion: "2026-10-15.2",
    id,
    scenarioId: id,
    role: "gk",
    mode,
    createdAt: now.toISOString(),
    choices: [],
    outcome: "loss",
    verdict,
  };
}
describe("short IQ practice series", () => {
  const pool = journeyBank.filter((d) => d.role === "gk" && d.revision === 2),
    current = pool.find((d) => d.pattern === "air-control")!;
  it("revisits a difficult topic in a different context at the third action", () => {
    const history = [attempt(pool[0].id), attempt(current.id, "strong")];
    const next = nextPractice(pool, history, "learn", current, now);
    expect(next.topicId).toBe(pool[0].topicId);
    expect(next.id).not.toBe(pool[0].id);
    expect(practiceToday(history, "learn", now)).toBe(2);
  });
  it("isolates modes and counts only today's actual attempts", () => {
    const history = [
      attempt(pool[0].id, "risky", "challenge"),
      attempt(current.id, "strong"),
      { ...attempt(pool[1].id), createdAt: "2026-10-14T10:00:00Z" },
    ];
    expect(practiceToday(history, "learn", now)).toBe(1);
    expect(nextPractice(pool, history, "learn", current, now).pattern).not.toBe(current.pattern);
    expect(practiceToday(history, "challenge", now)).toBe(1);
  });
});
