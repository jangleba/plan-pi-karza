import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { formatDate } from "@/lib/loadwise/labels";
import {
  TrendingUp,
  CheckCircle2,
  Gauge,
  ClipboardList,
  Activity,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/progress")({
  component: ProgressScreen,
});

/** Pusty stan — brak danych do realnej analizy progresu. */
function EmptyProgress() {
  return (
    <div className="soft-card flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span className="icon-bubble h-12 w-12">
        <Inbox className="h-6 w-6" strokeWidth={2} />
      </span>
      <p className="text-sm font-medium text-foreground">
        Brakuje danych do pełnej analizy.
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Wykonaj testy i zapisz minimum kilka treningów, aby zobaczyć swój realny
        progres. Nie pokazujemy wyników demonstracyjnych.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ProgressScreen() {
  const { state } = useLoadwise();

  const metrics = useMemo(() => {
    const completions = Object.values(state.completions);
    const completedList = completions.filter((c) => c.completed);
    const completedCount = completedList.length;

    const rpes = completedList
      .map((c) => c.rpe)
      .filter((r): r is number => typeof r === "number");
    const avgRpe =
      rpes.length > 0
        ? rpes.reduce((a, b) => a + b, 0) / rpes.length
        : null;

    const readinessEntries = Object.values(state.readiness).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const recentReadiness = readinessEntries.slice(-7);
    const avgReadiness =
      recentReadiness.length > 0
        ? recentReadiness.reduce((a, b) => a + b.overall, 0) /
          recentReadiness.length
        : null;

    const tests = [...state.tests].sort((a, b) => b.date.localeCompare(a.date));
    const transitions = Object.values(state.transitions);

    const hasData =
      completedCount > 0 || tests.length > 0 || readinessEntries.length > 0;

    return {
      completedCount,
      avgRpe,
      avgReadiness,
      readinessCount: readinessEntries.length,
      recentReadiness,
      tests,
      weeksTracked: transitions.length,
      hasData,
    };
  }, [state]);

  return (
    <div>
      <AppHeader
        title="Progress"
        subtitle="Twój realny rozwój — z treningów, testów i gotowości."
      />

      <div className="space-y-3 px-5">
        {!metrics.hasData ? (
          <EmptyProgress />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={CheckCircle2}
                label="Ukończone sesje"
                value={String(metrics.completedCount)}
                hint="zapisane treningi"
              />
              <StatCard
                icon={Gauge}
                label="Śr. RPE"
                value={metrics.avgRpe !== null ? metrics.avgRpe.toFixed(1) : "—"}
                hint="odczuwany wysiłek"
              />
              <StatCard
                icon={Activity}
                label="Gotowość (7 dni)"
                value={
                  metrics.avgReadiness !== null
                    ? metrics.avgReadiness.toFixed(1)
                    : "—"
                }
                hint={`${metrics.readinessCount} wpisów`}
              />
              <StatCard
                icon={ClipboardList}
                label="Testy"
                value={String(metrics.tests.length)}
                hint="wykonane pomiary"
              />
            </div>

            {metrics.recentReadiness.length > 0 && (
              <div className="soft-card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Gotowość — ostatnie dni
                </div>
                <div className="mt-3 flex items-end justify-between gap-1.5">
                  {metrics.recentReadiness.map((r) => (
                    <div
                      key={r.date}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div className="flex h-24 w-full items-end">
                        <div
                          className="w-full rounded-t-md bg-primary"
                          style={{ height: `${(r.overall / 10) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-foreground">
                        {r.overall}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {r.date.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {metrics.tests.length > 0 && (
              <div className="soft-card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5" /> Historia testów
                </div>
                <div className="mt-2 divide-y divide-border">
                  {metrics.tests.slice(0, 8).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize">
                          {t.type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(t.date)}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {t.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
