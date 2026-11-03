import { Link } from "@tanstack/react-router";
import { Clock3, Gauge, ListChecks, Route as RouteIcon, Target } from "lucide-react";
import { CycleBar } from "@/components/progress/CycleBar";
import { LoadCard } from "@/components/progress/LoadCard";
import { TrainingBalance } from "@/components/progress/TrainingBalance";
import { WeekLine } from "@/components/progress/WeekLine";
import type { DirectionCard, MicrocycleReport } from "@/lib/progress/center";
import type { CycleBar as CycleBarData, LoadReport } from "@/lib/progress/dashboard";
import type { RunningActivity } from "@/lib/running/types";
import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import { RunActivitySummary } from "@/components/running/RunActivitySummary";
import type { ProgressSessionTarget } from "@/lib/progress/navigation";

export function ProgressDashboard({
  cycle,
  direction,
  load,
  micro,
  runningActivities,
  todayIso,
  onHistory,
  missingRpeTarget,
}: {
  cycle: CycleBarData;
  direction: DirectionCard;
  load: LoadReport;
  micro: MicrocycleReport;
  runningActivities: Record<string, RunningActivity>;
  todayIso: string;
  onHistory: (missingRpe?: boolean) => void;
  missingRpeTarget?: ProgressSessionTarget;
}) {
  const kpis = [
    {
      label: "Plan aktywny",
      value: micro.executionPct == null ? "—" : `${micro.executionPct}%`,
      icon: ListChecks,
    },
    {
      label: "Czas sesji",
      value: `${micro.estimatedDurationCount ? "≈ " : ""}${micro.totalMinutes} min`,
      icon: Clock3,
    },
    {
      label: "Śr. RPE",
      value: micro.avgRpe == null ? "—" : micro.avgRpe.toFixed(1),
      icon: Gauge,
    },
  ];
  const weekStart = new Date(`${todayIso}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - micro.periodDays + 1);
  const recentRuns = Object.values(runningActivities)
    .filter(
      (activity) =>
        Number.isFinite(activity.distanceM) &&
        activity.distanceM >= 0 &&
        Number.isFinite(activity.durationSec) &&
        activity.durationSec >= 0 &&
        activity.date >= weekStart.toISOString().slice(0, 10) &&
        activity.date <= todayIso,
    )
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const runningDistance = recentRuns.reduce((sum, activity) => sum + activity.distanceM, 0);
  const runningDuration = recentRuns.reduce((sum, activity) => sum + activity.durationSec, 0);

  return (
    <div className="space-y-3 animate-fade-in" data-progress-period={micro.periodDays}>
      <section className="soft-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Ostatnie {micro.periodDays} dni</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {micro.loggedCount} zapisanych sesji · {micro.fromIso.slice(8)}.
              {micro.fromIso.slice(5, 7)}–{todayIso.slice(8)}.{todayIso.slice(5, 7)}
            </p>
          </div>
          <span
            className={`text-xs font-medium ${
              micro.plannedCount > 0 && micro.completedCount >= micro.plannedCount
                ? "bw-tone--success"
                : "text-primary"
            }`}
          >
            Plan: {micro.completedCount}/{micro.plannedCount || "—"}
          </span>
        </div>
        <div className="mt-4">{micro.periodDays === 7 && <WeekLine days={micro.days} />}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          {kpis.map(({ label, value, icon: Icon }, index) => {
            const content = (
              <>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Icon className="hidden h-3 w-3 min-[400px]:block" aria-hidden="true" />{" "}
                  <span className="min-w-0">{label}</span> <span aria-hidden="true">›</span>
                </div>
                <div className="mt-1 text-sm font-semibold">{value}</div>
              </>
            );
            const className =
              "min-h-14 rounded-2xl bg-muted/55 p-2.5 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
            return index === 0 ? (
              <Link
                key={label}
                to="/plan"
                className={className}
                aria-label={`Otwórz plan: ${value}`}
              >
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                onClick={() => onHistory()}
                className={className}
                aria-label={
                  index === 2 ? "Pokaż RPE z tego okresu" : "Pokaż treningi z tego okresu"
                }
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>

      {recentRuns.length > 0 && (
        <section className="soft-card p-4">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Bieganie · {micro.periodDays} dni</h2>
              <p className="text-xs text-muted-foreground">
                {recentRuns.length} {recentRuns.length === 1 ? "zapisany bieg" : "zapisane biegi"}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <RunningKpi label="Dystans" value={formatDistance(runningDistance)} />
            <RunningKpi label="Czas" value={formatRunDuration(runningDuration)} />
            <RunningKpi
              label="Tempo"
              value={formatPace(
                runningDistance >= 100 ? runningDuration / (runningDistance / 1_000) : null,
              )}
            />
          </div>
          <details className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-medium">Ostatni bieg</summary>
            <RunActivitySummary activity={recentRuns[0]} compact showSplits={false} />
          </details>
        </section>
      )}

      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Co dalej</h2>
        <p className="mt-1 text-sm leading-relaxed">{direction.nextStep}</p>
        {micro.loggedCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            RPE zapisano dla {micro.rpeCount}/{micro.loggedCount} sesji. Brak oceny nie oznacza
            lekkiego treningu.
          </p>
        )}
        {missingRpeTarget && (
          <Link
            to="/sesja/$date"
            params={{ date: missingRpeTarget.date }}
            search={{ slot: missingRpeTarget.slot, mod: missingRpeTarget.mod }}
            hash={`session-completion-${missingRpeTarget.sessionId}`}
            className="bw-tone--warning mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Uzupełnij RPE →
          </Link>
        )}
        {direction.cta.to === "session" && direction.cta.date ? (
          <Link
            to="/sesja/$date"
            params={{ date: direction.cta.date }}
            search={{ slot: direction.cta.slot ?? 1 }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" aria-hidden="true" /> {direction.cta.label}
          </Link>
        ) : (
          <Link
            to="/plan"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" aria-hidden="true" /> {direction.cta.label}
          </Link>
        )}
      </section>

      <LoadCard report={load} />
      <details className="soft-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Cel i rozkład treningów</summary>
        <div className="mt-3 space-y-3">
          <CycleBar cycle={cycle} />
          <dl className="space-y-2">
            <Row label="Priorytet z profilu" value={direction.limiter} />
          </dl>
          <TrainingBalance byCategory={micro.byCategory} periodDays={micro.periodDays} />
          <p className="text-xs text-muted-foreground">
            Realizacja dotyczy aktywnego planu. Archiwalne treningi wliczamy do zapisanej pracy, ale
            nie zaliczają nowych jednostek. Upływ czasu cyklu nie oznacza poprawy formy.
          </p>
        </div>
      </details>
    </div>
  );
}

function RunningKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/55 p-2.5">
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}
