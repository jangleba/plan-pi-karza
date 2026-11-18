import type { TrainingSection } from "../types";
import type { EngineSession } from "./model";
import { pairLabelAt, pairTitle } from "./advancedSessions";

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
    if (blocks.length < 2 || blocks.some((b) => !b)) continue;
    const found = blocks as NonNullable<(typeof blocks)[number]>[];
    found.forEach((b, i) => (b.exercises[0].label = pairLabelAt(pair, i)));
    found[found.length - 1].exercises[0].restAfterPair = `${pair.roundRestSeconds} s`;
    const at = main.blocks.indexOf(found[0]);
    const merged = {
      ...found[0],
      title: `${found.length === 2 ? "Superseria" : "Seria"} ${pair.no ?? pair.label} · ${pairTitle(pair.kind)}`,
      blockType: "superset" as const,
      executionProtocol: "superset-rounds-v1" as const,
      restAfterBlock: `${pair.roundRestSeconds} s`,
      exercises: found.flatMap((b) => b.exercises),
    };
    main.blocks = main.blocks.filter((b) => !found.includes(b));
    main.blocks.splice(at, 0, merged);
  }
}
