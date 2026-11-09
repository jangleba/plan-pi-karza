import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePlanAsync, INLINE_GENERATION_MAX_DAYS } from "./generatePlanAsync";
import { buildProfile } from "./store/model";

const profile = buildProfile(
  { full_name: "Test", onboarding_completed: true },
  {
    age: 16,
    position: "forward",
    level: "intermediate",
    main_goal: "speed",
    club_training_days: [1, 3],
    match_date: "2026-11-21",
    has_gym: true,
    has_pitch: true,
    has_sprint_space: true,
  },
  null,
)!;

describe("generatePlanAsync", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a single week inline, without waiting for a worker to start", async () => {
    const Worker = vi.fn();
    vi.stubGlobal("Worker", Worker);
    const week = await generatePlanAsync(profile, new Date(2026, 10, 16), 7, 1);
    expect(week).toHaveLength(7);
    expect(Worker).not.toHaveBeenCalled();
    expect(INLINE_GENERATION_MAX_DAYS).toBeGreaterThanOrEqual(13);
  });
});
