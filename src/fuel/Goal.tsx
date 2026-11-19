import { Sheet } from "../Sheet";
import type { Goal } from "../engine";

export const GOAL_LABEL: Record<Goal, string> = { maintain: "Utrzymanie", gain: "Masa" };
const TEXT: Record<Goal, string> = {
  maintain: "Cele w środku zakresu zaleceń.",
  gain: "Węglowodany w górnej połowie zakresu, białko 1,9–2,2 g/kg.",
};

export function GoalSheet({ goal, onPick, onClose }: { goal: Goal; onPick: (g: Goal) => void; onClose: () => void }) {
  return (
    <Sheet title="Cel żywieniowy" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
          <button key={g} onClick={() => onPick(g)} className={`rounded-2xl border px-4 py-3.5 text-left ${goal === g ? "bw-sel" : "border-hairline bg-canvas"}`}>
            <span className="block text-[15px] font-medium">{GOAL_LABEL[g]}</span>
            <span className="block text-xs text-muted">{TEXT[g]}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted">Cel przesuwa dzienne ilości w zakresie zaleceń UEFA – to podział orientacyjny, nie plan dietetyczny.</p>
    </Sheet>
  );
}
