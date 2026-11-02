import { useEffect, useState } from "react";
import type { CycleBar as CycleBarData } from "@/lib/progress/dashboard";

/** Kompaktowy pasek aktualnego cyklu — cel, obszar, tydzień i postęp. */
export function CycleBar({ cycle }: { cycle: CycleBarData }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(cycle.progressPct));
    return () => cancelAnimationFrame(id);
  }, [cycle.progressPct]);

  return (
    <div className="soft-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cycle.goalLabel}</div>
          <div className="truncate text-xs text-muted-foreground">
            Obszar rozwoju: {cycle.focusLabel}
          </div>
        </div>
        <div className="shrink-0 text-[11px] font-medium text-primary">
          {cycle.hasPlan ? `Tydzień ${cycle.weekIndex} z ${cycle.weekCount}` : "Brak planu"}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          role="progressbar"
          aria-label="Upływ czasu cyklu, nie realizacja treningów"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cycle.hasPlan ? cycle.progressPct : 0}
          className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-[350ms] motion-safe:ease-out"
          style={{ width: `${cycle.hasPlan ? pct : 0}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Przebieg kalendarza · realizację pokazujemy osobno.
      </p>
    </div>
  );
}
