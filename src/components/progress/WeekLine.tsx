import type { MicrocycleDay } from "@/lib/progress/center";
import { TRAINING_CATEGORY_LABELS } from "@/lib/progress/progress";

const DOT_TONE: Record<string, string> = {
  gym: "bg-primary",
  speed: "bg-primary",
  endurance: "bg-primary/70",
  club: "bg-foreground/70",
  match: "bg-destructive",
  recovery: "bg-muted-foreground/50",
};

/** Animowana linia ostatnich 7 dni: plan, wykonanie i rodzaj jednostki. */
export function WeekLine({ days }: { days: MicrocycleDay[] }) {
  return (
    <div className="relative">
      <div className="absolute left-3 right-3 top-[26px] h-px bg-border" />
      <div className="relative flex justify-between">
        {days.map((d, i) => (
          <div
            key={d.date}
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
              className={`h-3.5 w-3.5 rounded-full border-2 transition-transform duration-200 ${
                d.completed
                  ? `${DOT_TONE[d.category ?? "gym"]} border-transparent scale-110`
                  : d.planned
                    ? "border-primary/60 bg-background"
                    : "border-border bg-background"
              }`}
            />
            <span className="text-[9px] text-muted-foreground">
              {d.completed ? `${d.durationMin || ""}` : d.planned ? "plan" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
