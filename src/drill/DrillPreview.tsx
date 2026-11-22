import type { Drill } from "../engine/drill";
import { DrillBoard } from "./DrillBoard";

/** Mały podgląd ćwiczenia na liście; dotknięcie otwiera pełny ekran z odtwarzaniem. */
export function DrillPreview({ drill, onOpen }: { drill: Drill; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative block w-full overflow-hidden rounded-2xl text-left active:scale-[0.99]" aria-label={`Otwórz ćwiczenie: ${drill.title}`}>
      <DrillBoard drill={drill} compact />
      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">Otwórz ›</span>
    </button>
  );
}
