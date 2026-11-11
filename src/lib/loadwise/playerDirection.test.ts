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
  directionQualities,
  ONBOARDING_CURRENT_FEELINGS,
  ONBOARDING_CURRENT_MIND,
  ONBOARDING_DESIRED_FEELINGS,
  ONBOARDING_DESIRED_MIND,
} from "./playerDirection";

describe("playerDirection", () => {
  it("ma komplet identyfikatorów i polskie etykiety", () => {
    expect(CURRENT_PITCH_FEELINGS).toHaveLength(11);
    expect(DESIRED_PITCH_FEELINGS).toHaveLength(10);
    for (const id of CURRENT_PITCH_FEELINGS) expect(CURRENT_PITCH_FEELING_LABELS[id]).toBeTruthy();
    for (const id of DESIRED_PITCH_FEELINGS) expect(DESIRED_PITCH_FEELING_LABELS[id]).toBeTruthy();
  });

  it("onboarding oferuje wszystkie odpowiedzi, w tym o głowie", () => {
    expect([...ONBOARDING_CURRENT_FEELINGS].sort()).toEqual([...CURRENT_PITCH_FEELINGS].sort());
    expect([...ONBOARDING_DESIRED_FEELINGS].sort()).toEqual([...DESIRED_PITCH_FEELINGS].sort());
    expect(ONBOARDING_CURRENT_MIND).toContain("tense_under_pressure");
    expect(ONBOARDING_DESIRED_MIND).toContain("brave_on_ball");
  });

  it("presja i strach przed błędem kierują plan na grę z piłką", () => {
    expect(
      directionQualities({
        currentPitchFeelings: ["tense_under_pressure", "afraid_of_mistakes"],
        desiredPitchFeelings: ["brave_on_ball"],
      }),
    ).toEqual(["ball"]);
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
    expect(normalizeDesiredPitchFeelings(["fast_and_light"])).toEqual(["fast_and_light"]);
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
    expect(currentPitchFeelingLabels(["stagnating"])).toEqual(["Czuję, że stoję w miejscu"]);
  });
});
