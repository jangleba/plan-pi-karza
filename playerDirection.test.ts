import { describe, it, expect } from "vitest";
import {
  CURRENT_PITCH_FEELINGS,
  DESIRED_PITCH_FEELINGS,
  CURRENT_PITCH_FEELING_LABELS,
  DESIRED_PITCH_FEELING_LABELS,
  MAX_PITCH_FEELINGS,
  normalizeCurrentPitchFeelings,
  normalizeDesiredPitchFeelings,
  togglePitchFeeling,
  currentPitchFeelingLabels,
} from "./playerDirection";

describe("playerDirection", () => {
  it("ma komplet identyfikatorów i polskie etykiety", () => {
    expect(CURRENT_PITCH_FEELINGS).toHaveLength(7);
    expect(DESIRED_PITCH_FEELINGS).toHaveLength(6);
    for (const id of CURRENT_PITCH_FEELINGS)
      expect(CURRENT_PITCH_FEELING_LABELS[id]).toBeTruthy();
    for (const id of DESIRED_PITCH_FEELINGS)
      expect(DESIRED_PITCH_FEELING_LABELS[id]).toBeTruthy();
  });

  it("normalizuje: odrzuca nieznane, duplikaty i ogranicza do 2", () => {
    expect(
      normalizeCurrentPitchFeelings([
        "lacking_speed",
        "lacking_speed",
        "nope",
        42,
        "stagnating",
        "lacking_confidence",
      ]),
    ).toEqual(["lacking_speed", "stagnating"]);
    expect(normalizeDesiredPitchFeelings(null)).toEqual([]);
    expect(normalizeDesiredPitchFeelings(undefined)).toEqual([]);
    expect(normalizeDesiredPitchFeelings(["fast_and_light"])).toEqual([
      "fast_and_light",
    ]);
  });

  it("toggle dodaje, usuwa i sygnalizuje limit", () => {
    const a = togglePitchFeeling<"a" | "b" | "c">([], "a");
    expect(a).toEqual({ value: ["a"], limitReached: false });
    const b = togglePitchFeeling<"a" | "b" | "c">(["a"], "a");
    expect(b).toEqual({ value: [], limitReached: false });
    const c = togglePitchFeeling<"a" | "b" | "c">(["a", "b"], "c");
    expect(c.limitReached).toBe(true);
    expect(c.value).toEqual(["a", "b"]);
    expect(MAX_PITCH_FEELINGS).toBe(2);
  });

  it("mapuje identyfikatory na etykiety", () => {
    expect(currentPitchFeelingLabels(["stagnating"])).toEqual([
      "Czuję, że stoję w miejscu",
    ]);
  });
});
