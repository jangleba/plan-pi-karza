import { EXERCISES, type Block, type SessionTemplate } from "./library";

export interface CheckIn {
  /** 1 = słabo, 2 = średnio, 3 = dobrze */
  sleep: 1 | 2 | 3;
  feeling: 1 | 2 | 3;
  /** „Dziś mniej" / brak czasu */
  less: boolean;
}

export type Strain = "none" | "light" | "heavy";

export function strainOf(c: CheckIn): Strain {
  const bad = (3 - c.sleep) + (3 - c.feeling);
  if (bad >= 3) return "heavy";
  if (bad >= 1 || c.less) return "light";
  return "none";
}

export interface AdaptedSession {
  name: string;
  blocks: Block[];
  /** Zmiany pokazywane zawodnikowi. */
  notes: string[];
}

function lighterAlternative(id: string): string {
  const e = EXERCISES[id];
  if (!e) return id;
  const better = e.substitutes.find((s) => (EXERCISES[s]?.cns ?? 3) < e.cns);
  return better ?? id;
}

function reason(c: CheckIn): string {
  const parts: string[] = [];
  if (c.sleep === 1) parts.push("słabo spałeś");
  if (c.feeling === 1) parts.push("słabo się czujesz");
  if (c.less) parts.push("chcesz dziś mniej");
  return parts.join(", ");
}

/** Lekko: mniej serii. Mocno: mniej serii, lżejsze ćwiczenia, bez ostatniego bloku. */
export function adaptSession(t: SessionTemplate, c: CheckIn, deload = false): AdaptedSession {
  const strain = strainOf(c);
  const notes: string[] = [];
  let blocks: Block[] = t.blocks.map((b) => ({ items: b.items.map((i) => ({ ...i })) }));

  const cut = deload || strain !== "none";
  if (cut) {
    blocks = blocks.map((b) => ({
      items: b.items.map((i) => ({ ...i, sets: i.sets >= 3 ? i.sets - 1 : i.sets })),
    }));
    notes.push(
      deload ? "Tydzień rozładowania: mniej serii." : `Mniej serii, bo ${reason(c) || "tak wyszło z check-inu"}.`,
    );
  }
  if (strain === "heavy") {
    blocks = blocks.map((b) => ({
      items: b.items.map((i) => {
        const e = EXERCISES[i.exerciseId];
        if (e && e.cns === 3) {
          const alt = lighterAlternative(i.exerciseId);
          if (alt !== i.exerciseId) return { ...i, exerciseId: alt, pctRM: undefined };
        }
        return i;
      }),
    }));
    if (blocks.length > 3) blocks = blocks.slice(0, -1);
    notes.push(`Lżejszy dobór ćwiczeń i krótsza sesja, bo ${reason(c)}.`);
  }
  return { name: t.name, blocks, notes };
}

/**
 * Gotowość 0–100 z check-inu (do pierścienia na Starcie).
 * Sen i samopoczucie po równo; „dziś mniej" obniża o 10. Skala orientacyjna, nie medyczna.
 */
export function readinessScore(c: CheckIn): number {
  const base = 40 + ((c.sleep - 1) + (c.feeling - 1)) * 15; // 40–100
  return Math.max(0, base - (c.less ? 10 : 0));
}
