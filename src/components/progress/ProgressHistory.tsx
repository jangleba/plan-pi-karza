import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/loadwise/labels";
import {
  TIMELINE_LABELS,
  groupByWeek,
  monthKey,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/progress/dashboard";

const KINDS: (TimelineKind | "all")[] = ["all", "training", "test", "record", "match"];
const KIND_LABEL: Record<string, string> = { all: "Wszystko", ...TIMELINE_LABELS };

const PL_MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${PL_MONTHS[Number(m) - 1]} ${y}`;
}

/** Historia: jedna oś czasu treningów, testów i rekordów. */
export function ProgressHistory({ events }: { events: TimelineEvent[] }) {
  const [kind, setKind] = useState<TimelineKind | "all">("all");
  const [month, setMonth] = useState<string>("all");

  const months = useMemo(
    () => Array.from(new Set(events.map((e) => monthKey(e.date)))).sort().reverse(),
    [events],
  );

  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (kind === "all" || e.kind === kind) &&
          (month === "all" || monthKey(e.date) === month),
      ),
    [events, kind, month],
  );

  const weeks = useMemo(() => groupByWeek(filtered), [filtered]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
              kind === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {months.length > 1 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
          <Chip active={month === "all"} onClick={() => setMonth("all")} label="Cały okres" />
          {months.map((m) => (
            <Chip
              key={m}
              active={month === m}
              onClick={() => setMonth(m)}
              label={monthLabel(m)}
            />
          ))}
        </div>
      )}

      {weeks.length === 0 ? (
        <div className="soft-card px-4 py-8 text-center text-sm text-muted-foreground">
          Brak zapisanych zdarzeń w tym filtrze.
        </div>
      ) : (
        weeks.map((w) => (
          <section key={w.weekStart} className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tydzień od {formatDate(w.weekStart)}
            </h3>
            <div className="soft-card divide-y divide-border">
              {w.events.map((e) => {
                const inner = (
                  <div className="flex items-center gap-3 px-4 py-3 transition-transform duration-200 active:scale-[0.99]">
                    <div className="w-12 shrink-0 text-[11px] text-muted-foreground">
                      {formatDate(e.date)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {e.detail}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        e.kind === "record"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {TIMELINE_LABELS[e.kind]}
                    </span>
                  </div>
                );
                if (e.link.to === "session") {
                  return (
                    <Link
                      key={e.id}
                      to="/sesja/$date"
                      params={{ date: e.link.date }}
                      search={{ slot: 1 }}
                      className="block"
                    >
                      {inner}
                    </Link>
                  );
                }
                return <div key={e.id}>{inner}</div>;
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
