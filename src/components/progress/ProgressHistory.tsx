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
import { ChoiceGroup } from "@/components/ui/app-ui";
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
    <div className="bw-stack">
      <div className="flex flex-wrap items-end gap-4">
        <ChoiceGroup
          label="Rodzaj treningu"
          value={kind}
          options={KINDS.map((item) => ({ value: item, label: KIND_LABEL[item] }))}
          onChange={setKind}
        />
        {months.length > 1 && (
          <label className="bw-field text-sm">
            <span className="bw-field-label">Miesiąc</span>
            <select
              className="min-h-12 rounded-lg border border-[var(--bw-control-border)] bg-[var(--bw-control-fill)] px-3 text-base focus-visible:border-[var(--bw-control-focus-border)]"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="all">Cały okres</option>
              {months.map((item) => (
                <option key={item} value={item}>
                  {monthLabel(item)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {weeks.length === 0 ? (
        <p className="py-6 text-muted-foreground" role="status">
          Brak ukończonych treningów w tym okresie.
        </p>
      ) : (
        weeks.map((week) => (
          <section key={week.weekStart} className="bw-section">
            <h2 className="bw-section-title">Tydzień od {formatDate(week.weekStart)}</h2>
            <div className="bw-stack">
              {week.events.map((event) => {
                const run = runningActivities[event.sessionKey];
                return (
                  <article key={event.id} className="bw-stack py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <div className="min-w-0">
                        <h3 className="font-medium">{event.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(event.date)} · {event.detail}
                        </p>
                      </div>
                      <span
                        className={`text-sm ${event.kind === "match" ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {TIMELINE_LABELS[event.kind]}
                      </span>
                    </div>
                    {run && <RunActivitySummary activity={run} compact showSplits={false} />}
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
