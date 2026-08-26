import { useEffect, useState } from "react";
import { TRAINING_CATEGORY_LABELS, type TrainingCategoryKey } from "@/lib/progress/progress";
import type { LoadReport } from "@/lib/progress/dashboard";

const CAT_COLOR: Record<TrainingCategoryKey, string> = {
  gym: "bg-primary",
  speed: "bg-primary/70",
  endurance: "bg-primary/50",
  club: "bg-muted-foreground/60",
  match: "bg-destructive/70",
  recovery: "bg-primary/25",
};

/** Obciążenie treningowe: minuty × RPE z realnych logów. */
export function LoadCard({ report }: { report: LoadReport }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!report.hasData) {
    return (
      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Obciążenie treningowe</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Obciążenie liczymy z czasu trwania i RPE zapisanych sesji. Zamknij trening
          i zapisz RPE, aby zobaczyć wykres.
        </p>
      </section>
    );
  }

  const diff =
    report.previousTotal > 0
      ? Math.round(((report.total - report.previousTotal) / report.previousTotal) * 100)
      : null;

  return (
    <section className="soft-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Obciążenie treningowe</h2>
        <span className="text-[11px] text-muted-foreground">
          {report.total} j.
          {diff != null && (
            <span className={diff >= 0 ? " text-primary" : " text-muted-foreground"}>
              {" "}
              {diff >= 0 ? "+" : ""}
              {diff}%
            </span>
          )}
        </span>
      </div>

      <div className="mt-3 flex h-24 items-end gap-1.5">
        {report.days.map((d) => {
          const cats = Object.entries(d.byCategory) as [TrainingCategoryKey, number][];
          const h = ready ? (d.load / report.maxDayLoad) * 100 : 0;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-md motion-safe:transition-[height] motion-safe:duration-300 motion-safe:ease-out"
                  style={{ height: `${h}%`, minHeight: d.load > 0 ? 4 : 0 }}
                >
                  {cats.map(([k, v]) => (
                    <div
                      key={k}
                      className={CAT_COLOR[k]}
                      style={{ height: `${(v / d.load) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">{d.weekdayLabel}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(report.byCategory) as TrainingCategoryKey[])
          .filter((k) => report.byCategory[k] > 0)
          .map((k) => (
            <span
              key={k}
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <i className={`h-2 w-2 rounded-full ${CAT_COLOR[k]}`} />
              {TRAINING_CATEGORY_LABELS[k]}
            </span>
          ))}
      </div>

      {report.insight && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {report.insight}
        </p>
      )}
    </section>
  );
}
