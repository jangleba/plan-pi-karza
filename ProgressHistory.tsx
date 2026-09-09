import { useMemo, useState } from "react";
import { formatDate } from "@/lib/loadwise/labels";
import {
  TIMELINE_LABELS,
  groupByWeek,
  monthKey,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/progress/dashboard";
import type { RunningActivity } from "@/lib/running/types";
import { RunActivitySummary } from "@/components/running/RunActivitySummary";

const KINDS: (TimelineKind | "all")[] = ["all", "training", "match"];
const KIND_LABEL: Record<TimelineKind | "all", string> = {
  all: "Wszystko",
  ...TIMELINE_LABELS,
};
const PL_MONTHS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${PL_MONTHS[Number(month) - 1]} ${year}`;
}

/** Historia ukończonych treningów, również z archiwalnych planów. */
export function ProgressHistory({
  events,
  runningActivities,
}: {
  events: TimelineEvent[];
  runningActivities: Record<string, RunningActivity>;
}) {
  const [kind, setKind] = useState<TimelineKind | "all">("all");
  const [month, setMonth] = useState<string>("all");
  const months = useMemo(
    () =>
      Array.from(new Set(events.map((event) => monthKey(event.date))))
        .sort()
        .reverse(),
    [events],
  );
  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (kind === "all" || event.kind === kind) &&
          (month === "all" || monthKey(event.date) === month),
      ),
    [events, kind, month],
  );
  const weeks = useMemo(() => groupByWeek(filtered), [filtered]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={kind === item}
            onClick={() => setKind(item)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
              kind === item
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {KIND_LABEL[item]}
          </button>
        ))}
      </div>

      {months.length > 1 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
          <Chip active={month === "all"} onClick={() => setMonth("all")} label="Cały okres" />
          {months.map((item) => (
            <Chip
              key={item}
              active={month === item}
              onClick={() => setMonth(item)}
              label={monthLabel(item)}
            />
          ))}
        </div>
      )}

      {weeks.length === 0 ? (
        <div className="soft-card px-4 py-8 text-center text-sm text-muted-foreground">
          Brak ukończonych treningów w tym filtrze.
        </div>
      ) : (
        weeks.map((week) => (
          <section key={week.weekStart} className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tydzień od {formatDate(week.weekStart)}
            </h3>
            <div className="soft-card divide-y divide-border">
              {week.events.map((event) => {
                const run = runningActivities[event.sessionKey];
                return (
                  <article key={event.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 shrink-0 text-[11px] text-muted-foreground">
                        {formatDate(event.date)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{event.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {event.detail}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          event.kind === "match"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TIMELINE_LABELS[event.kind]}
                      </span>
                    </div>
                    {run && (
                      <div className="mt-3 border-t border-border pt-3">
                        <RunActivitySummary activity={run} compact showSplits={false} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
