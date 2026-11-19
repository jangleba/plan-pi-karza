import { Sheet } from "../Sheet";
import type { Meal } from "./store";

/** Dziennik dnia: lista posiłków z możliwością usunięcia i sumą. */
export function Journal({ meals, onRemove, onClose }: { meals: Meal[]; onRemove: (id: string) => void; onClose: () => void }) {
  const sum = (k: "carb" | "protein") => Math.round(meals.reduce((a, m) => a + m[k], 0));
  return (
    <Sheet title="Dziennik" onClose={onClose}>
      {meals.length === 0 ? (
        <p className="text-sm text-muted">Dziś jeszcze nic nie dodano.</p>
      ) : (
        <>
          <ul className="rounded-2xl bg-canvas px-4">
            {[...meals].sort((a, b) => a.time.localeCompare(b.time)).map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-b border-hairline/70 py-3 last:border-0">
                <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{m.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{m.name}</span>
                  <span className="block text-xs tabular-nums text-muted">{Math.round(m.carb)} g węgli · {Math.round(m.protein)} g białka</span>
                </span>
                <button onClick={() => onRemove(m.id)} aria-label="Usuń" className="px-2 text-lg text-muted">×</button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">Razem: <span className="tabular-nums text-ink">{sum("carb")}</span> g węglowodanów · <span className="tabular-nums text-ink">{sum("protein")}</span> g białka</p>
        </>
      )}
    </Sheet>
  );
}
