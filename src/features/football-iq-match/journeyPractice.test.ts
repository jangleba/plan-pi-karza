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
  it("visits new topics before another context of an already successful topic", () => {
    const history = [attempt(current.id, "strong")];
    const next = nextPractice(pool, history, "learn", current, now);
    history.push(attempt(next.id, "strong"));
    const following = nextPractice(pool, history, "learn", next, now);
    expect(following.topicId).not.toBe(current.topicId);
    expect(following.topicId).not.toBe(next.topicId);
  });
  it("does not repeat an old error after a later successful attempt in that topic", () => {
    const history = [
      attempt(pool[0].id),
      attempt(pool[1].id, "strong"),
      attempt(current.id, "strong"),
      attempt(current.id, "strong"),
      attempt(current.id, "strong"),
    ];
    expect(nextPractice(pool, history, "learn", current, now).topicId).not.toBe(pool[0].topicId);
  });
  it("offers the last unseen context even when it belongs to the current topic", () => {
    const sameTopic = pool.filter((d) => d.topicId === current.topicId);
    const history = [attempt(sameTopic[0].id, "strong"), attempt(sameTopic[1].id, "strong")];
    expect(nextPractice(sameTopic, history, "learn", sameTopic[1], now).id).toBe(sameTopic[2].id);
  });
  it("balances the profile's roles and does not consume all contexts of the first topics", () => {
    const all = journeyBank.filter((d) => ["six", "eight", "ten"].includes(d.role));
    const history: JourneyAttempt[] = [];
    let definition = all.find((d) => d.revision === 2)!;
    for (let i = 0; i < 12; i++) {
      history.push({ ...attempt(definition.id, "strong"), role: definition.role });
      definition = nextPractice(all, history, "learn", definition, now);
    }
    expect(new Set(history.map((a) => all.find((d) => d.id === a.scenarioId)!.topicId)).size).toBe(
      12,
    );
    const counts = ["six", "eight", "ten"].map(
      (role) => history.filter((a) => a.role === role).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
  it("starts another rotation after exhausting a pool and handles one or no available scenarios", () => {
    const two = [pool[0], current];
    expect(
      nextPractice(
        two,
        two.map((d) => attempt(d.id, "strong")),
        "learn",
        current,
        now,
      ),
    ).toBe(pool[0]);
    expect(nextPractice([current], [], "learn", current, now)).toBe(current);
    expect(nextPractice([], [], "learn", current, now)).toBe(current);
  });
  it("prefers a different playable setup over a renamed copy of one already practiced", () => {
    const original = journeyBank.find((d) => d.id === "iqj-gk-04-0")!;
    const copy = journeyBank.find((d) => d.id === "iqj-gk-10-0")!;
    const fresh = journeyBank.find((d) => d.id === "iqj-gk-02-0")!;
    expect(
      nextPractice(
        [original, copy, fresh],
        [attempt(original.id, "strong")],
        "learn",
        original,
        now,
      ),
    ).toBe(fresh);
  });
});
