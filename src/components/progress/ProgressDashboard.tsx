import { Link } from "@tanstack/react-router";
import { Route as RouteIcon, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricGroup, StatusMessage } from "@/components/ui/app-ui";
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
    },
    {
      label: "Czas",
      value: `${micro.totalMinutes} min`,
    },
    {
      label: "Śr. RPE",
      value: micro.avgRpe == null ? "—" : micro.avgRpe.toFixed(1),
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
    <div className="bw-stack">
      <CycleBar cycle={cycle} />

      <section className="bw-section space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="bw-section-title">Ostatnie 7 dni</h2>
          </div>
          <span className="text-sm font-medium text-primary">
            {micro.completedCount}/{micro.plannedCount || "—"}
          </span>
        </div>
        <div className="mt-4">
          <WeekLine days={micro.days} />
        </div>
        <MetricGroup className="mt-6" items={kpis} />
      </section>

      {recentRuns.length > 0 && (
        <section className="bw-section space-y-4">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <h2 className="bw-section-title">Bieganie · 7 dni</h2>
              <p className="text-sm text-muted-foreground">
                {recentRuns.length} {recentRuns.length === 1 ? "zapisany bieg" : "zapisane biegi"}
              </p>
            </div>
          </div>
          <MetricGroup
            items={[
              { label: "Dystans", value: formatDistance(runningDistance) },
              { label: "Czas", value: formatRunDuration(runningDuration) },
              {
                label: "Tempo",
                value: formatPace(
                  runningDistance >= 100 ? runningDuration / (runningDistance / 1_000) : null,
                ),
              },
            ]}
          />
          <div className="bw-stack">
            <div className="mb-2 text-sm font-semibold text-muted-foreground">Ostatni bieg</div>
            <RunActivitySummary activity={recentRuns[0]} compact showSplits={false} />
          </div>
        </section>
      )}

      <section className="bw-section space-y-4">
        <h2 className="bw-section-title text-primary">Twój kierunek</h2>
        <div className="mt-0.5 text-sm font-semibold leading-snug">{direction.stage}</div>
        <dl className="bw-key-values text-sm">
          <Row label="Następny krok" value={direction.nextStep} />
          {direction.limiter !== "Brak wskazanego ogranicznika" &&
            direction.limiter !== "Nieokreślony" && (
              <Row label="Ogranicznik" value={direction.limiter} />
            )}
        </dl>
        <Button asChild className="w-fit">
          {direction.cta.to === "session" && direction.cta.date ? (
            <Link to="/sesja/$date" params={{ date: direction.cta.date }} search={{ slot: 1 }}>
              <Target />
              {direction.cta.label}
            </Link>
          ) : (
            <Link to="/plan">
              <Target />
              {direction.cta.label}
            </Link>
          )}
        </Button>
      </section>

      {micro.completedCount > 0 && <EvidenceRail cards={evidence} />}
      {micro.completedCount > 0 ? (
        <div className="bw-columns">
          <LoadCard report={load} />
          <TrainingBalance byCategory={micro.byCategory} />
        </div>
      ) : (
        <StatusMessage>
          Ukończ trening i zapisz RPE, aby zobaczyć obciążenie i rozkład treningów.
        </StatusMessage>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}
