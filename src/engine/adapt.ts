import { EXERCISES, type Block, type SessionTemplate } from "./library";
import { swapsFrom } from "./exercise/swaps";
import { formatRx, prescribe } from "./exercise/rx";
import { VARIANTS } from "./exercise/variants";

export interface CheckIn {
  /** Regeneracja po wczorajszym dniu (trening, mecz): 1 = słabo, 2 = średnio, 3 = dobrze. */
  recovery: 1 | 2 | 3;
  /** Samopoczucie dziś: 1 = słabo, 2 = średnio, 3 = dobrze. */
  feeling: 1 | 2 | 3;
  /** „Dziś mniej" / brak czasu */
  less: boolean;
}

export const DEFAULT_CHECK_IN: CheckIn = { recovery: 3, feeling: 3, less: false };

const level = (v: unknown): 1 | 2 | 3 | null => (v === 1 || v === 2 || v === 3 ? v : null);

/**
 * Check-in z zapisu lub z chmury, bezpiecznie: zła struktura lub liczby spoza 1–3 wracają do domyślnych (bez „NaN”).
 * Starsze zapisy mają pole `sleep` (kolumna w chmurze też nazywa się `sleep`): traktujemy je jak regenerację.
 */
export function normalizeCheckIn(raw: unknown): CheckIn {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CHECK_IN };
  const r = raw as Record<string, unknown>;
  return {
    recovery: level(r.recovery) ?? level(r.sleep) ?? DEFAULT_CHECK_IN.recovery,
    feeling: level(r.feeling) ?? DEFAULT_CHECK_IN.feeling,
    less: r.less === true,
  };
}

export type Strain = "none" | "light" | "heavy";

export function strainOf(c: CheckIn): Strain {
  const bad = (3 - c.recovery) + (3 - c.feeling);
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

/** Lżejsza alternatywa: tylko zatwierdzona zamiana równoważna dla tej samej funkcji slotu (nie samo niższe cns). */
function lighterAlternative(id: string): string | null {
  const v = VARIANTS[id];
  if (!v) return null;
  const rel = swapsFrom(id).find((r) => r.scope === "equivalent_for_slot" && r.slotFn === v.functions[0] && (VARIANTS[r.to]?.cns ?? 3) < v.cns);
  return rel ? rel.to : null;
}

function reason(c: CheckIn): string {
  const parts: string[] = [];
  if (c.recovery === 1) parts.push("słaba regeneracja");
  if (c.feeling === 1) parts.push("słabe samopoczucie");
  if (c.less) parts.push("chcesz dziś mniej");
  return parts.join(", ");
}

/** Lekko: mniej serii. Mocno: mniej serii, lżejsze ćwiczenia, bez ostatniego bloku. */
export function adaptSession(t: SessionTemplate, c: CheckIn, deload = false): AdaptedSession {
  const strain = strainOf(c);
  const notes: string[] = [];
  let blocks: Block[] = t.blocks.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i })) }));

  const cut = deload || strain !== "none";
  if (cut) {
    blocks = blocks.map((b) => ({
      ...b,
      items: b.items.map((i) => ({ ...i, sets: i.sets >= 3 ? i.sets - 1 : i.sets })),
    }));
    notes.push(
      deload ? "Tydzień rozładowania: mniej serii." : `Mniej serii: ${reason(c) || "tak wyszło z check-inu"}.`,
    );
  }
  if (strain === "heavy") {
    blocks = blocks.map((b) => ({
      ...b,
      items: b.items.flatMap((i) => {
        const e = EXERCISES[i.exerciseId];
        if (e && e.cns === 3) {
          const alt = lighterAlternative(i.exerciseId);
          const v = alt ? VARIANTS[alt] : undefined;
          if (!alt || !v) return []; // brak równoważnej, lżejszej alternatywy: pomijamy zamiast zostawiać stare serie i powtórzenia
          // nowa recepta dla nowego ćwiczenia (serie z check-inu zostają, powtórzenia i obciążenie liczone od nowa)
          const rx = prescribe(v, "main_stimulus", "volume");
          return [{ exerciseId: alt, sets: i.sets, reps: formatRx(rx) }];
        }
        return [i];
      }),
    })).filter((b) => b.items.length);
    if (blocks.length > 3) blocks = blocks.slice(0, -1);
    notes.push(`Lżejsze ćwiczenia i krótsza sesja: ${reason(c)}.`);
  }
  return { name: t.name, blocks, notes };
}

/** Bardzo słaby dzień (wyraźnie lżej i słaba regeneracja po wczoraj): proponujemy regenerację zamiast sesji indywidualnej. Decyduje zawodnik. */
export function restSuggested(c: CheckIn): boolean {
  return strainOf(c) === "heavy" && c.recovery === 1;
}

/**
 * Gotowość 0–100 z check-inu (do pierścienia na Starcie).
 * Regeneracja po wczoraj i samopoczucie po równo; „dziś mniej" obniża o 10. Skala orientacyjna, nie medyczna.
 */
export function readinessScore(c: CheckIn): number {
  const base = 40 + ((c.recovery - 1) + (c.feeling - 1)) * 15; // 40–100
  return Math.max(0, base - (c.less ? 10 : 0));
}
