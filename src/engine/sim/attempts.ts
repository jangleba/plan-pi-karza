import type { AttemptClass, FirstAction } from "./coach";

/** Zapis jednej próby w scenariuszu „Wyjście spod pressingu” (do Progresu). */
export interface Attempt {
  date: string;
  variant: number;
  cls: AttemptClass;
  first: FirstAction | null;
  /** Czas straty piłki (s), gdy była. */
  lossAt: number | null;
}

export interface AttemptStats {
  total: number;
  clean: number;
  recovered: number;
  conceded: number;
  /** % udanych wyjść (bez straty) ze wszystkich prób i z ostatnich 5. */
  cleanPct: number;
  lastPct: number | null;
  byVariant: Array<{ variant: number; total: number; clean: number }>;
  /** Najczęstsza pierwsza decyzja przy próbach ze stratą (≥ 2 razy), np. „podanie do: Napastnik”. */
  mistake: { text: string; count: number } | null;
}

export function mistakeLabel(a: Attempt, nameOf: (id: string) => string): string {
  const f = a.first;
  if (!f) return "brak decyzji (czas minął)";
  if (f.kind === "pass") return `podanie do: ${nameOf(f.target)}`;
  if (f.kind === "shot") return "strzał z własnej połowy";
  return "strata piłki przed podaniem (za długo z piłką)";
}

export function attemptStats(all: Attempt[], nameOf: (id: string) => string): AttemptStats | null {
  if (!all.length) return null;
  const count = (c: AttemptClass) => all.filter((a) => a.cls === c).length;
  const clean = count("clean");
  const last = all.slice(-5);
  const variants = [...new Set(all.map((a) => a.variant))].sort((a, b) => a - b);
  const groups = new Map<string, number>();
  for (const a of all.filter((x) => x.cls !== "clean")) { const k = mistakeLabel(a, nameOf); groups.set(k, (groups.get(k) ?? 0) + 1); }
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total: all.length, clean, recovered: count("recovered"), conceded: count("conceded"),
    cleanPct: Math.round((clean / all.length) * 100),
    lastPct: last.length >= 3 ? Math.round((last.filter((a) => a.cls === "clean").length / last.length) * 100) : null,
    byVariant: variants.map((v) => ({ variant: v, total: all.filter((a) => a.variant === v).length, clean: all.filter((a) => a.variant === v && a.cls === "clean").length })),
    mistake: top && top[1] >= 2 ? { text: top[0], count: top[1] } : null,
  };
}
