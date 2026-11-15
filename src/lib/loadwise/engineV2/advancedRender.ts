import type { TrainingSection } from "../types";
import type { EngineSession } from "./model";
import { pairTitle } from "./advancedSessions";

/**
 * Advanced sessions keep the order of the notes: preparation, then the pairs and single tasks in
 * sequence, mobility at the end. Each pair becomes one linked block (X1 → 30 s → X2 → round rest),
 * run by the same superset protocol as the B/C accessory pairs.
 */
export function advancedSectionType(
  recipe: EngineSession,
  role: string,
): "warmup" | "main" | "cooldown" | null {
  if (recipe.organization !== "complex") return null;
  return role === "warmup" ? "warmup" : role === "mobility" ? "cooldown" : "main";
}

export function renderComplexPairs(sections: TrainingSection[], recipe: EngineSession): void {
  if (recipe.organization !== "complex") return;
  const main = sections.find((s) => s.type === "main");
  if (!main) return;
  for (const pair of recipe.complexPairs ?? []) {
    const blocks = pair.exerciseIds.map((id) =>
      main.blocks.find((b) => b.exercises.length === 1 && b.exercises[0].exerciseId === id),
    );
    if (!blocks[0] || !blocks[1]) continue;
    const [first, second] = blocks;
    first.exercises[0].label = `${pair.label}1`;
    second.exercises[0].label = `${pair.label}2`;
    second.exercises[0].restAfterPair = `${pair.roundRestSeconds} s`;
    const at = main.blocks.indexOf(first);
    const merged = {
      ...first,
      title: `Para ${pair.label} · ${pairTitle(pair.kind)}`,
      blockType: "superset" as const,
      executionProtocol: "superset-rounds-v1" as const,
      restAfterBlock: `${pair.roundRestSeconds} s`,
      exercises: [...first.exercises, ...second.exercises],
    };
    main.blocks = main.blocks.filter((b) => b !== first && b !== second);
    main.blocks.splice(at, 0, merged);
  }
}
