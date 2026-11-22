import { EXERCISES, type SessionTemplate } from "./library";

/** Sprzęt, którego zawodnik może nie mieć. Zawodnik zaznacza to, czego BRAKUJE; domyślnie zakładamy, że ma wszystko. */
export type Gear = "trapbar" | "medball" | "barbell" | "dumbbells" | "band" | "box" | "machines";

export const GEAR: Array<[Gear, string]> = [
  ["trapbar", "Trap bar"], ["barbell", "Sztanga"], ["dumbbells", "Hantle"], ["medball", "Piłka lekarska"],
  ["band", "Guma"], ["box", "Skrzynia"], ["machines", "Maszyny (prostowanie, leg press)"],
];

/** Jakiego sprzętu wymaga ćwiczenie (brak wpisu = bez sprzętu). */
export const NEEDS: Record<string, Gear> = {
  "trap-bar-deadlift": "trapbar",
  "back-squat": "barbell", "bench-press": "barbell", "bb-row": "barbell", "hang-power-clean": "barbell",
  "db-bench-press": "dumbbells", "db-row": "dumbbells", "db-rdl": "dumbbells", "goblet-squat": "dumbbells", "kb-swing": "dumbbells",
  "mb-shotput": "medball", "mb-overhead-throw": "medball",
  facepull: "band", "sl-assisted-cmj": "band",
  "box-jump": "box", "sl-box-jump": "box", "depth-jump-hurdle": "box", "depth-box-jump": "box", "step-up": "box", "weighted-step-up-jump": "box",
  "leg-press": "machines", "leg-extension": "machines", "leg-curl-machine": "machines",
};

/** Najbliższy zamiennik (przeszukiwanie zamienników wgłąb), który nie wymaga brakującego sprzętu. */
export function substituteFor(id: string, missing: ReadonlySet<Gear>, taken: ReadonlySet<string> = new Set()): string | null {
  const seen = new Set([id]);
  let layer = [id];
  for (let depth = 0; depth < 4 && layer.length; depth++) {
    const next: string[] = [];
    for (const cur of layer) {
      for (const s of EXERCISES[cur]?.substitutes ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const need = NEEDS[s];
        if ((!need || !missing.has(need)) && !taken.has(s)) return s;
        next.push(s);
      }
    }
    layer = next;
  }
  return null;
}

export interface GearResult { template: SessionTemplate; notes: string[] }

/** Zamienia ćwiczenia wymagające brakującego sprzętu na najlepsze zamienniki. Gdy zamiennika nie ma, ćwiczenie zostaje z uwagą. */
export function applyGear(t: SessionTemplate, missingList: readonly Gear[]): GearResult {
  const missing = new Set(missingList);
  if (!missing.size) return { template: t, notes: [] };
  const notes: string[] = [];
  const used = new Set(t.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)));
  const blocks = t.blocks.map((b) => ({
    ...b,
    items: b.items.map((i) => {
      const need = NEEDS[i.exerciseId];
      if (!need || !missing.has(need)) return i;
      const alt = substituteFor(i.exerciseId, missing, used);
      if (!alt) { notes.push(`${EXERCISES[i.exerciseId]?.name ?? i.exerciseId}: brak zamiennika bez Twojego sprzętu, zostaje bez zmian.`); return i; }
      used.add(alt);
      notes.push(`${EXERCISES[i.exerciseId]?.name ?? i.exerciseId} → ${EXERCISES[alt]?.name ?? alt} (brak sprzętu).`);
      const { pctRM: _drop, ...rest } = i;
      return { ...rest, exerciseId: alt };
    }),
  }));
  return { template: { ...t, blocks }, notes };
}
