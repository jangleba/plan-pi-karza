import { expect, it } from "vitest";
import { planLockScreenCues } from "./lockScreenCues";
import { recipeToProtocol } from "./recipeSession";
import { buildMasTestSession } from "../loadwise/engineV2/masTestRecipe";
import type { Profile } from "../loadwise/types";

it("does not schedule MAS main trial before explicit readiness and countdown", () => {
  const recipe = buildMasTestSession(
    { age: 24, level: "advanced" } as Profile,
    "2026-11-14",
  ).runningRecipe!;
  const protocol = recipeToProtocol(recipe);
  const cues = planLockScreenCues(protocol, 0, 0);
  expect(cues.some((c) => c.at === 600000 && c.title.includes("Bieg"))).toBe(false);
  expect(cues).toHaveLength(1);
  expect(cues[0].title).toBe("Rozgrzewka zakończona");
  expect(planLockScreenCues(protocol, 650, 0)).toEqual([]);
  const started = planLockScreenCues(protocol, 600, 0, { masTrialStarted: true });
  expect(started[0]).toMatchObject({ title: "Schłodzenie", at: 300000 });
});
