import { describe, expect, it } from "vitest";
import {
  CLUB_DEFAULT_MINUTES,
  activityTypeFromTags,
  clubDuration,
  effectiveActivityTags,
  estimatedSessionLoad,
  hasRunningWork,
  isNewRpe,
  isValidMatchMinutes,
  normalizeActivityTags,
} from "./sessionFeedback";

describe("activity tags", () => {
  it("normalizes, de-duplicates and drops unknown values in a stable order", () => {
    expect(normalizeActivityTags(["technical", "x", "running_endurance", "technical"])).toEqual([
      "running_endurance",
      "technical",
    ]);
    expect(normalizeActivityTags(undefined)).toBeNull();
  });
  it("keeps legacy activity_type compatible: mixed confirms nothing", () => {
    expect(effectiveActivityTags({ activityType: "running_endurance" })).toEqual([
      "running_endurance",
    ]);
    expect(effectiveActivityTags({ activityType: "technical" })).toEqual(["technical"]);
    expect(effectiveActivityTags({ activityType: "mixed" })).toEqual([]);
    expect(hasRunningWork({ activityType: "mixed" })).toBe(false);
    expect(hasRunningWork({ activityType: "running_endurance" })).toBe(true);
  });
  it("typed tags win over the legacy value, and an empty array is an answer of 'none'", () => {
    expect(effectiveActivityTags({ activityType: "running_endurance", activityTags: [] })).toEqual(
      [],
    );
    expect(hasRunningWork({ activityTags: ["running_endurance", "technical"] })).toBe(true);
  });
  it("derives a compatible legacy activity_type", () => {
    expect(activityTypeFromTags([])).toBeNull();
    expect(activityTypeFromTags(["running_endurance"])).toBe("running_endurance");
    expect(activityTypeFromTags(["running_endurance", "technical"])).toBe("mixed");
    expect(activityTypeFromTags(["technical", "tactical_game"])).toBe("technical");
  });
});

describe("estimated load", () => {
  const base = { completed: true, durationSource: null, matchMinutesPlayed: null } as const;
  it("club: 90 × RPE flagged as an assumed duration", () => {
    expect(
      estimatedSessionLoad(
        { ...base, rpe: 7, durationMin: 90, durationSource: "club_default" },
        "club",
      ),
    ).toEqual({ value: 630, minutes: 90, basis: "club_default_minutes", minutesAssumed: true });
  });
  it("keeps a real historical club time instead of 90", () => {
    expect(estimatedSessionLoad({ ...base, rpe: 5, durationMin: 73 }, "club").value).toBe(365);
    expect(clubDuration({ durationMin: 73, durationSource: null })).toEqual({
      durationMin: 73,
      durationSource: "user",
    });
    expect(clubDuration(undefined)).toEqual({
      durationMin: CLUB_DEFAULT_MINUTES,
      durationSource: "club_default",
    });
  });
  it("missing RPE or an unfinished session gives no number (never 0 or 1)", () => {
    expect(estimatedSessionLoad({ ...base, rpe: null, durationMin: 90 }, "club").value).toBeNull();
    expect(
      estimatedSessionLoad({ completed: false, rpe: 8, durationMin: 90 }, "club").value,
    ).toBeNull();
  });
  it("match: minutes played × RPE; 0 minutes is a real zero, missing minutes is no data", () => {
    expect(
      estimatedSessionLoad({ ...base, rpe: 8, durationMin: 115, matchMinutesPlayed: 25 }, "match"),
    ).toMatchObject({ value: 200, basis: "match_minutes_played", minutesAssumed: false });
    expect(
      estimatedSessionLoad({ ...base, rpe: 8, durationMin: 115, matchMinutesPlayed: 0 }, "match")
        .value,
    ).toBe(0);
    // Whole-session (stopwatch) time never substitutes for played minutes.
    expect(estimatedSessionLoad({ ...base, rpe: 8, durationMin: 115 }, "match").value).toBeNull();
  });
});

describe("validation helpers", () => {
  it("accepts 0–180 integers for match minutes only", () => {
    for (const ok of [0, 25, 80, 180]) expect(isValidMatchMinutes(ok)).toBe(true);
    for (const bad of [-1, 181, 12.5, NaN, "80", null, undefined])
      expect(isValidMatchMinutes(bad)).toBe(false);
  });
  it("new RPE is 1–10", () => {
    expect(isNewRpe(0)).toBe(false);
    expect(isNewRpe(1)).toBe(true);
    expect(isNewRpe(10)).toBe(true);
    expect(isNewRpe(11)).toBe(false);
  });
});
