import { describe, it, expect } from "vitest";
import { groupStrengthPreview } from "./strengthPreview";
import { buildStrengthStages } from "@/lib/loadwise/sessionPresentation";
import { legacyStrengthSession } from "@/components/design/__qa__/LegacyStrengthSession";
describe("legacy strength instruction preview", () => {
  it("groups repeated work without mutating any prescription or recording identity", () => {
    const session = legacyStrengthSession(),
      original = JSON.stringify(session);
    const stages = buildStrengthStages(session.structuredSections!);
    const result = groupStrengthPreview(stages);
    expect(stages.flatMap((s) => s.blocks.flatMap((b) => b.exercises))).toHaveLength(18);
    expect(result.stages.flatMap((s) => s.blocks.flatMap((b) => b.exercises))).toHaveLength(13);
    expect(result.occurrences.get("old-curl")?.map((e) => e.id)).toEqual([
      "old-curl",
      "old-extra-0",
      "old-extra-1",
      "old-extra-2",
      "old-extra-3",
    ]);
    expect(result.occurrences.get("old-landing")).toHaveLength(2);
    expect(JSON.stringify(session)).toBe(original);
    expect([...result.occurrences.values()].flat()).toHaveLength(18);
  });
  it("retains separate warmup and cooldown doses of the same movement", () => {
    const result = groupStrengthPreview(
      buildStrengthStages(legacyStrengthSession().structuredSections!),
    );
    expect(result.occurrences.get("warm-hip")).toHaveLength(1);
    expect(result.occurrences.get("cool-hip")).toHaveLength(1);
  });
});
