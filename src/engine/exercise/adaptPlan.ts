import { strainOf, type CheckIn } from "../adapt";
import { allItems } from "./generate";
import { qualify } from "./qualify";
import { formatRx, prescribe } from "./rx";
import { VARIANTS } from "./variants";
import { swapsFrom } from "./swaps";
import type { AthleteContext, GeneratedSession, Omitted, PlannedBlock, PlannedItem } from "./types";

function reason(c: CheckIn): string {
  const p: string[] = [];
  if (c.recovery === 1) p.push("słaba regeneracja");
  if (c.feeling === 1) p.push("słabe samopoczucie");
  if (c.less) p.push("chcesz dziś mniej");
  return p.join(", ");
}

/**
 * Adaptacja z check-inu na wygenerowanej sesji. Lżejsza alternatywa musi mieć tę samą funkcję slotu (relacja `equivalent_for_slot`),
 * przejść tę samą kwalifikację i dostaje NOWĄ receptę; bez takiej alternatywy ćwiczenie jest pomijane z powodem.
 */
export function adaptPlanned(s: GeneratedSession, c: CheckIn, deload: boolean, ctx: AthleteContext, phase: "volume" | "intensity" = "volume"): GeneratedSession {
  const strain = strainOf(c);
  const notes = [...s.notes];
  const omitted: Omitted[] = [...s.omitted];
  let blocks: PlannedBlock[] = s.blocks.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, rx: { ...i.rx } })) }));
  const cut = deload || strain !== "none";
  if (cut) {
    blocks = blocks.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, rx: { ...i.rx, sets: i.rx.sets >= 3 ? i.rx.sets - 1 : i.rx.sets } })) }));
    notes.push(deload ? "Tydzień rozładowania: mniej serii." : `Mniej serii: ${reason(c) || "tak wyszło z check-inu"}.`);
  }
  if (strain === "heavy") {
    const used = new Set(allItems({ ...s, blocks }).map((i) => i.variantId));
    blocks = blocks.map((b) => ({
      ...b,
      items: b.items.flatMap((i): PlannedItem[] => {
        const v = VARIANTS[i.variantId];
        if (!v || v.cns < 3) return [i];
        const alt = swapsFrom(i.variantId)
          .filter((r) => r.scope === "equivalent_for_slot" && r.slotFn === i.slot.fn)
          .map((r) => VARIANTS[r.to]).find((t) => t && t.cns < v.cns && !used.has(t.id) && qualify(t, ctx).ok);
        if (!alt) {
          omitted.push({ itemId: i.itemId, slot: i.slot, plannedVariantId: i.variantId, code: "too_heavy_no_alternative", messagePl: "Dziś za ciężkie, a nie ma lżejszego ćwiczenia o tym samym celu, które spełnia wymagania." });
          return [];
        }
        used.add(alt.id);
        return [{ ...i, variantId: alt.id, variantVersion: alt.version, rx: { ...prescribe(alt, i.slot.role, deload ? "deload" : phase), sets: i.rx.sets }, note: undefined }];
      }),
    })).filter((b) => b.items.length);
    if (blocks.length > 3) blocks = blocks.slice(0, -1);
    notes.push(`Lżejsze ćwiczenia i krótsza sesja: ${reason(c)}.`);
  }
  return { ...s, blocks, omitted, notes };
}
export { formatRx };
