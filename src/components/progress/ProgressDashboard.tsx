import { Link } from "@tanstack/react-router";
import { Clock3, Gauge, ListChecks, Route as RouteIcon, Target } from "lucide-react";
import { CycleBar } from "@/components/progress/CycleBar";
import { EvidenceRail } from "@/components/progress/EvidenceRail";
import { LoadCard } from "@/components/progress/LoadCard";
import { TrainingBalance } from "@/components/progress/TrainingBalance";
import { WeekLine } from "@/components/progress/WeekLine";
import type { DirectionCard, MicrocycleReport } from "@/lib/progress/center";
import type { CycleBar as CycleBarData, EvidenceCard, LoadReport } from "@/lib/progress/dashboard";
import type { RunningActivity } from "@/lib/running/types";
import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import { RunActivitySummary } from "@/components/running/RunActivitySummary";

export function ProgressDashboard({
  cycle,
  direction,
  evidence,
  load,
  micro,
  runningActivities,
  todayIso,
}: {
  cycle: CycleBarData;
  direction: DirectionCard;
  evidence: EvidenceCard[];
  load: LoadReport;
  micro: MicrocycleReport;
  runningActivities: Record<string, RunningActivity>;
  todayIso: string;
}) {
  const kpis = [
    {
      label: "Realizacja",
      value: micro.executionPct == null ? "—" : `${micro.executionPct}%`,
      icon: ListChecks,
    },
    {
      label: "Czas",
      value: `${micro.totalMinutes} min`,
      icon: Clock3,
    },
    {
      label: "Śr. RPE",
      value: micro.avgRpe == null ? "—" : micro.avgRpe.toFixed(1),
      icon: Gauge,
    },
  ];
  const weekStart = new Date(`${todayIso}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const recentRuns = Object.values(runningActivities)
    .filter(
      (activity) =>
        activity.date >= weekStart.toISOString().slice(0, 10) && activity.date <= todayIso,
    )
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const runningDistance = recentRuns.reduce((sum, activity) => sum + activity.distanceM, 0);
  const runningDuration = recentRuns.reduce((sum, activity) => sum + activity.durationSec, 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <CycleBar cycle={cycle} />

      <section className="soft-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Ostatnie 7 dni</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Plan i ukończone jednostki</p>
          </div>
          <span className="text-xs font-medium text-primary">
            {micro.completedCount}/{micro.plannedCount || "—"}
          </span>
        </div>
        <div className="mt-4">
          <WeekLine days={micro.days} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl bg-muted/55 p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Icon className="h-3 w-3" aria-hidden="true" /> {label}
              </div>
              <div className="mt-1 text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {recentRuns.length > 0 && (
        <section className="soft-card p-4">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Bieganie · 7 dni</h2>
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
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ostatni bieg
            </div>
            <RunActivitySummary activity={recentRuns[0]} compact showSplits={false} />
          </div>
        </section>
      )}

      <section className="soft-card p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Twój kierunek
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-snug">{direction.stage}</div>
        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <Row label="Realizacja" value={direction.execution} />
          <Row label="Obciążenie" value={direction.loadSignal} />
          <Row label="Ogranicznik" value={direction.limiter} />
          <Row label="Następny krok" value={direction.nextStep} />
        </dl>
        {direction.cta.to === "session" && direction.cta.date ? (
          <Link
            to="/sesja/$date"
            params={{ date: direction.cta.date }}
            search={{ slot: 1 }}
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

      <EvidenceRail cards={evidence} />
      <LoadCard report={load} />
      <TrainingBalance byCategory={micro.byCategory} />
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
