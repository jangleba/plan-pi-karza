import { EXERCISES, choiceNote, estimatedRM } from "./engine";
import type { Block, WeightLog } from "./engine";

const LETTERS = ["a", "b", "c", "d"];

/** Podpis pod nagłówkiem bloku: jak wykonać ćwiczenia z bloku. */
export function blockHint(count: number, mode: "alternate" | "sequence"): string | null {
  if (count < 2) return null;
  const chain = LETTERS.slice(0, count).join(" → ");
  return mode === "alternate" ? `Na zmianę: ${chain}` : `Po kolei: ${chain}`;
}

interface Props {
  blocks: Block[];
  mode: "alternate" | "sequence";
  log: WeightLog;
  weights: Record<string, string>;
  onWeight: (key: string, value: string) => void;
  onOpen?: (exerciseId: string, note?: string) => void;
  /** Zmiana ćwiczenia (zamiana, usunięcie) – dostępne tylko dla pozycji z identyfikatorem. */
  onChange?: (itemId: string) => void;
}

/** Sesja jako ponumerowane bloki trenera: nagłówek, literki a / b / c, jedna linia „jak robić”. */
export function SessionBlocks({ blocks, mode, log, weights, onWeight, onOpen, onChange }: Props) {
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {blocks.map((b, bi) => {
        const hint = blockHint(b.items.length, mode);
        return (
          <li key={bi}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                <span className="tabular-nums">{bi + 1}</span> · {b.title ?? "Blok"}
              </h3>
              {hint && <span className="text-xs text-muted">{hint}</span>}
            </div>
            <div className="rounded-2xl bg-canvas p-3">
              {b.items.map((i, ii) => {
                const e = EXERCISES[i.exerciseId];
                const key = i.id ?? `${bi}-${ii}`;
                const prev = log[i.exerciseId];
                const placeholder = prev ? String(prev.next ?? prev.kg) : "kg";
                const rm = estimatedRM(prev); // tylko z potwierdzonego wykonania wszystkich powtórzeń
                const target = i.pctRM && rm ? Math.round(rm * ((i.pctRM[0] + i.pctRM[1]) / 200) * 2) / 2 : null;
                const many = b.items.length > 1;
                return (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                    <button type="button" onClick={() => onOpen?.(i.exerciseId, i.note)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                      {many && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hairline/80 text-[11px] font-medium text-muted">{LETTERS[ii]}</span>}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{e?.name ?? i.exerciseId}</span>
                        <span className="block text-xs text-muted">
                          {i.sets} × {i.reps}
                          {i.pctRM ? ` · ${i.pctRM[0]}–${i.pctRM[1]}% maks.${target ? ` (≈ ${target} kg, orientacyjnie)` : ""}` : ""}
                          {i.note ? ` · ${i.note}` : ""}
                        </span>
                        {choiceNote(prev) && <span className="block text-xs text-ink/80">{choiceNote(prev)}</span>}
                      </span>
                    </button>
                    {i.id && onChange && (
                      <button type="button" onClick={() => onChange(i.id!)} className="shrink-0 rounded-lg bg-card px-2 py-1.5 text-xs text-muted" aria-label={`Zmień: ${e?.name ?? i.exerciseId}`}>Zmień</button>
                    )}
                    {e?.loaded && (
                      <input
                        inputMode="decimal"
                        placeholder={placeholder}
                        value={weights[key] ?? ""}
                        onChange={(ev) => onWeight(key, ev.target.value)}
                        className="w-16 rounded-lg bg-card px-2 py-1.5 text-right text-sm outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
