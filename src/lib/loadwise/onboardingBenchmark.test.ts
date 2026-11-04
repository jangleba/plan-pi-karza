import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { generatePlan } from "./planEngine";
import { prepareMonthlyPlan } from "./persist";
import { buildProfile } from "./store/model";
it("measures the complete onboarding payload without writing to a backend", () => {
  const results = [];
  for (const [level, gym, club, goal] of [
    ["beginner", true, [1, 3], "endurance"],
    ["intermediate", true, [1, 3], "speed"],
    ["advanced", true, [], "strength"],
    ["beginner", false, [], "endurance"],
  ] as const) {
    const p = buildProfile(
      { full_name: "Test", onboarding_completed: false },
      {
        age: 22,
        position: "forward",
        level,
        main_goal: goal,
        club_training_days: club,
        match_date: "2026-11-08",
        has_gym: gym,
        has_pitch: true,
        has_sprint_space: true,
      },
      null,
    )!;
    Object.assign(p, {
      individualTrainingDays: [1, 2, 3, 4, 5, 6],
      guardianConsent: true,
      healthPersonalizationEnabled: false,
      unavailableDays: [],
      onboardingComplete: true,
    });
    const at = performance.now(),
      plan = generatePlan(p, new Date(2026, 10, 4)),
      generationMs = performance.now() - at;
    const before = performance.now(),
      prepared = prepareMonthlyPlan("10000000-0000-4000-8000-000000000001", p, plan),
      prepareMs = performance.now() - before;
    const json = JSON.stringify(prepared.args);
    results.push({
      level,
      gym,
      club,
      goal,
      generationMs,
      prepareMs,
      days: plan.length,
      bytes: Buffer.byteLength(json),
      parts: Object.fromEntries(
        Object.entries(prepared.args).map(([k, v]) => [
          k,
          Buffer.byteLength(JSON.stringify(v) ?? ""),
        ]),
      ),
    });
  }
  expect(results.every((r) => r.days === 28 && r.bytes > 0)).toBe(true);
  if (process.env.BALLWISE_BENCHMARK_OUTPUT)
    writeFileSync(process.env.BALLWISE_BENCHMARK_OUTPUT, JSON.stringify(results, null, 2));
});
