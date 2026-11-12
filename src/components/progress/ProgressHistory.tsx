import { SessionResultDetails } from "./SessionResultDetails";
import type { SessionCompletion } from "@/lib/loadwise/types";
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
import { historyRoute, loadRunHistory } from "@/lib/running/routeHistory";
import { Link } from "@tanstack/react-router";
import type { ProgressSessionTarget } from "@/lib/progress/navigation";

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

/** Trasa i międzyczasy z tego telefonu (na koncie jest tylko wynik). */
function withLocalRoute(
  run: RunningActivity | undefined,
  local: ReturnType<typeof loadRunHistory>[number] | undefined,
): RunningActivity | undefined {
  if (!run || !local || run.route?.length) return run;
  return { ...run, route: historyRoute(local), splits: local.splits };
}

/** Historia ukończonych treningów, również z archiwalnych planów. */
export function ProgressHistory({
  events,
  runningActivities,
  targets = {},
  initialMissingRpe = false,
  ownerId,
  completions = {},
  focusSessionId,
}: {
  events: TimelineEvent[];
  runningActivities: Record<string, RunningActivity>;
  targets?: Record<string, ProgressSessionTarget>;
  initialMissingRpe?: boolean;
  ownerId?: string;
  completions?: Record<string, SessionCompletion>;
  focusSessionId?: string;
}) {
  const [kind, setKind] = useState<TimelineKind | "all">("all");
  const [month, setMonth] = useState<string>("all");
  const [visible, setVisible] = useState(20);
  const [missingRpe, setMissingRpe] = useState(initialMissingRpe);
  const localRuns = useMemo(
    () => new Map(ownerId ? loadRunHistory(ownerId).map((entry) => [entry.sessionId, entry]) : []),
    [ownerId],
  );
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
          (!missingRpe || event.rpe === null) &&
          (month === "all" || !months.includes(month) || monthKey(event.date) === month),
      ),
    [events, kind, month, months, missingRpe],
  );
  const weeks = useMemo(() => groupByWeek(filtered.slice(0, visible)), [filtered, visible]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={kind === item}
            onClick={() => {
              setKind(item);
              setVisible(20);
            }}
            className={`min-h-11 shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
              kind === item
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {KIND_LABEL[item]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={missingRpe}
          onClick={() => {
            setMissingRpe((v) => !v);
            setVisible(20);
          }}
          className={`min-h-11 shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${missingRpe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Brak RPE
        </button>
      </div>

      {months.length > 1 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
          <Chip
            active={month === "all" || !months.includes(month)}
            onClick={() => {
              setMonth("all");
              setVisible(20);
            }}
            label="Cały okres"
          />
          {months.map((item) => (
            <Chip
              key={item}
              active={month === item}
              onClick={() => {
                setMonth(item);
                setVisible(20);
              }}
              label={monthLabel(item)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground" aria-live="polite">
        Wpisy: {filtered.length}
      </p>
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
                const run = withLocalRoute(
                  runningActivities[event.sessionKey],
                  localRuns.get(event.sessionKey),
                );
                const target = targets[event.sessionKey];
                return (
                  <article
                    key={event.id}
                    id={`session-result-${event.sessionKey}`}
                    className={`px-4 py-3 ${focusSessionId === event.sessionKey ? "bg-primary/[.035]" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 shrink-0 text-[11px] text-muted-foreground">
                        {formatDate(event.date)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {target ? (
                          <Link
                            to="/sesja/$date"
                            params={{ date: target.date }}
                            search={{ slot: target.slot, mod: target.mod }}
                            hash={`session-completion-${target.sessionId}`}
                            aria-label={`Otwórz trening: ${event.title}`}
                            className="inline-flex min-h-11 items-center gap-1 break-words text-sm font-semibold text-primary"
                          >
                            {event.title}
                            <span aria-hidden="true"> ›</span>
                          </Link>
                        ) : (
                          <div className="break-words text-sm font-medium">{event.title}</div>
                        )}
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
                    <ResultDisclosure
                      ownerId={ownerId}
                      sessionId={event.sessionKey}
                      completion={completions[event.sessionKey]}
                      completions={completions}
                    />
                    {run && (
                      <details className="mt-3 border-t border-border pt-3">
                        <summary className="cursor-pointer text-xs font-medium">
                          Szczegóły biegu
                        </summary>
                        <RunActivitySummary activity={run} compact showSplits />
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
      {filtered.length > visible && (
        <button
          type="button"
          className="min-h-11 w-full rounded-xl border border-border px-3 text-sm font-medium"
          onClick={() => setVisible((n) => n + 20)}
        >
          Pokaż kolejne {Math.min(20, filtered.length - visible)}
        </button>
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
      className={`min-h-11 shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ResultDisclosure(props: React.ComponentProps<typeof SessionResultDetails>) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-2 border-t border-border pt-2"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="min-h-10 cursor-pointer text-xs font-medium">Wyniki sesji</summary>
      {open && <SessionResultDetails {...props} />}
    </details>
  );
}
