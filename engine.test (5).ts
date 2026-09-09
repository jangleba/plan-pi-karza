import { describe, expect, it } from "vitest";
import {
  DEFAULT_REACTIVE_SETTINGS,
  createReactiveCue,
  decisionChangeRate,
  finishReactiveStats,
  initialReactiveStats,
  nextCueDelayMs,
  normalizeReactiveSettings,
  recordReactiveCue,
} from "./engine";
import type { ReactiveSettings } from "./types";

describe("reactive training engine", () => {
  it("ogranicza ustawienia do zatwierdzonych zakresów", () => {
    expect(normalizeReactiveSettings({
      ...DEFAULT_REACTIVE_SETTINGS,
      intervalSec: 99,
      flashDurationMs: 100,
      activeDirections: ["left"],
    })).toMatchObject({
      intervalSec: 15,
      flashDurationMs: 500,
      activeDirections: ["left", "right"],
    });
  });

  it("używa 5/10/20 procent zmian decyzji zależnie od poziomu", () => {
    expect(decisionChangeRate("basic")).toBe(0.05);
    expect(decisionChangeRate("intermediate")).toBe(0.1);
    expect(decisionChangeRate("advanced")).toBe(0.2);
  });

  it("ma stałe 5 sekund lub kontrolowany zakres losowy", () => {
    expect(nextCueDelayMs({ intervalSec: 5, randomTiming: false }, () => 0)).toBe(5_000);
    expect(nextCueDelayMs({ intervalSec: 5, randomTiming: true }, () => 0)).toBe(3_000);
    expect(nextCueDelayMs({ intervalSec: 5, randomTiming: true }, () => 1)).toBe(7_000);
  });

  it("równoważy kierunki zamiast losować serię tej samej strony", () => {
    const settings: ReactiveSettings = {
      ...DEFAULT_REACTIVE_SETTINGS,
      activeDirections: ["left", "right"],
    };
    let stats = initialReactiveStats(settings, "2026-09-06T10:00:00Z");
    const first = createReactiveCue({ settings, stats, random: () => 0 });
    stats = recordReactiveCue(stats, first);
    const second = createReactiveCue({ settings, stats, previous: first, random: () => 0 });
    expect(first.direction).toBe("left");
    expect(second.direction).toBe("right");
  });

  it("raportuje tylko dane wygenerowane przez system, bez wyniku reakcji", () => {
    const settings = { ...DEFAULT_REACTIVE_SETTINGS, mode: "opponent" as const };
    let stats = initialReactiveStats(settings, "2026-09-06T10:00:00Z");
    const cue = createReactiveCue({ settings, stats, decisionChange: true, random: () => 0 });
    stats = finishReactiveStats(recordReactiveCue(stats, cue), 61, "2026-09-06T10:01:01Z");
    expect(stats.cueCount).toBe(1);
    expect(stats.decisionChanges).toBe(1);
    expect(stats.elapsedSec).toBe(61);
    expect(stats).not.toHaveProperty("reactionTime");
    expect(stats).not.toHaveProperty("accuracy");
  });
});
