import type { TrainingSection } from "../types";
import type { EngineSession, Role } from "./model";

/** Product organisation, not a claim that supersets improve power more than straight sets.
 * Only accessories are paired. Main lower strength and jumps retain full recovery. */
export function arrangeStrengthPairs(recipe: EngineSession, enabled: boolean): EngineSession {
  if (!enabled) return recipe;
  const pairs: NonNullable<EngineSession["strengthPairs"]> = [];
  const add = (roles: [Role, Role], label: string, roundRestSeconds: number) => {
    const rows = roles.map((role) => recipe.exercises.find((e) => e.role === role));
    if (!rows[0] || !rows[1] || rows[0].dose.sets !== rows[1].dose.sets) return;
    const transitionSeconds = 30;
    rows[0].dose.restSeconds = transitionSeconds;
    rows[1].dose.restSeconds = roundRestSeconds;
    rows[1].dose.postRestSeconds = roundRestSeconds;
    pairs.push({ roles, label, transitionSeconds, roundRestSeconds });
  };
  // Follow the existing A/B order, so the numeric timeline and screen remain identical.
  add(recipe.roles.includes("strengthA") ? ["push", "pull"] : ["pull", "push"], "B", 180);
  add(recipe.roles.includes("strengthA") ? ["adductor", "trunk"] : ["trunk", "adductor"], "C", 180);
  if (pairs.length) recipe.strengthPairs = pairs;
  // The builder recalculates the numeric time after pairing; it never adds volume to fill it.
  return recipe;
}

/** Merge canonical rows, preserving numeric dose and history identities. */
export function renderStrengthPairs(sections: TrainingSection[], recipe: EngineSession): void {
  const accessory = sections.find((s) => s.type === "accessory");
  if (!accessory) return;
  for (const pair of recipe.strengthPairs ?? []) {
    const ids = pair.roles.map((role) => recipe.exercises.find((e) => e.role === role)?.exerciseId);
    const blocks = ids.map((id) =>
      accessory.blocks.find((b) => b.exercises.length === 1 && b.exercises[0].exerciseId === id),
    );
    if (!blocks[0] || !blocks[1]) continue;
    const first = blocks[0],
      second = blocks[1];
    first.exercises[0].label = `${pair.label}1`;
    second.exercises[0].label = `${pair.label}2`;
    second.exercises[0].restAfterPair = `${pair.roundRestSeconds} s`;
    const at = accessory.blocks.indexOf(first);
    const merged = {
      ...first,
      title:
        pair.label === "B"
          ? "Superseria · pchanie i przyciąganie"
          : "Superseria · tułów i przywodziciele",
      blockType: "superset" as const,
      executionProtocol: "superset-rounds-v1" as const,
      restAfterBlock: `${pair.roundRestSeconds} s`,
      exercises: [...first.exercises, ...second.exercises],
    };
    accessory.blocks = accessory.blocks.filter((b) => b !== first && b !== second);
    accessory.blocks.splice(at, 0, merged);
  }
}
