import type { MicrocycleDay } from "@/lib/progress/center";
import { TRAINING_CATEGORY_LABELS } from "@/lib/progress/progress";
import { Check } from "lucide-react";

/** Animowana linia ostatnich 7 dni: plan, wykonanie i rodzaj jednostki. */
export function WeekLine({ days }: { days: MicrocycleDay[] }) {
  return (
    <div className="relative">
      <div className="absolute left-3 right-3 top-[26px] h-px bg-border" />
      <div className="relative flex justify-between">
        {days.map((d, i) => (
          <div
            key={d.date}
            aria-label={`${d.date}: ${d.completed ? `zapisane ${d.durationMin} min` : d.planned ? "zaplanowany trening" : "brak wpisu"}`}
            className="flex w-9 flex-col items-center gap-1 animate-fade-in"
            style={{ animationDelay: `${i * 45}ms`, animationFillMode: "backwards" }}
          >
            <span
              className={`text-[10px] ${d.isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {d.weekdayLabel}
            </span>
            <span
              title={d.category ? TRAINING_CATEGORY_LABELS[d.category] : undefined}
              className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-transform duration-200 ${
                d.completed
                  ? "border-transparent bg-[var(--bw-success)] text-white"
                  : d.planned
                    ? "border-primary/60 bg-background"
                    : "border-border bg-background"
              }`}
            >
              {d.completed && <Check size={10} strokeWidth={2} aria-hidden="true" />}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {d.completed ? `${d.durationMin || ""}` : d.planned ? "plan" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
