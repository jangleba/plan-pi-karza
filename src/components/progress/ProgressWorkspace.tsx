import { lazy, Suspense, useId, useMemo, useState } from "react";
import { AppHeader } from "@/components/loadwise/ui";
import type { LoadwiseState } from "@/lib/loadwise/types";
import {
  buildTrainingHistory,
  mergeTrainingHistory,
  type ProgressPeriod,
} from "@/lib/progress/progress";
import { buildMicrocycle, buildDirection, nextActionableSession } from "@/lib/progress/center";
import { buildCycleBar, buildLoadReport, buildTimeline } from "@/lib/progress/dashboard";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { getPlanStatus } from "@/lib/loadwise/engineV2/planStatus";
import { buildPlanSummary } from "@/lib/loadwise/planSummary";
import type { NextPlanDraft } from "@/lib/loadwise/nextPlanInterview";
import { PlanEndSummary } from "./PlanEndSummary";
import { ProgressDashboard } from "./ProgressDashboard";
import { ProgressHistory } from "./ProgressHistory";
import { CycleReviewHistory } from "./CycleReviewHistory";
import { progressSessionTargets } from "@/lib/progress/navigation";

const Measurements = lazy(() => import("./ProgressMeasurements"));

export function ProgressWorkspace({
  state,
  todayIso,
  ownerId,
  brand = true,
  loading = false,
  initialTab,
  focusSessionId,
  planEnd,
}: {
  state: LoadwiseState;
  todayIso: string;
  ownerId?: string;
  brand?: boolean;
  loading?: boolean;
  initialTab?: "history";
  focusSessionId?: string;
  /** Provided by the route: lets the end-of-plan summary prepare the next preview. */
  planEnd?: { currentMinutes: number; onPrepare: (draft: NextPlanDraft) => Promise<void> };
}) {
  const [tab, setTab] = useState<"dashboard" | "history">(initialTab ?? "dashboard");
  const [period, setPeriod] = useState<ProgressPeriod>(7);
  const [measurements, setMeasurements] = useState(false);
  const [historyScope, setHistoryScope] = useState(false);
  const [historyMissingRpe, setHistoryMissingRpe] = useState(false);
  const id = useId();
  const plan = useMemo(
    () =>
      selectEffectivePlan(state.plan, state.modifications, {
        profile: state.profile,
        readiness: state.readiness,
        completions: state.completions,
      }),
    [state.plan, state.modifications, state.profile, state.readiness, state.completions],
  );
  const history = useMemo(
    () =>
      mergeTrainingHistory(
        state.history,
        buildTrainingHistory(plan, state.completions),
        state.completions,
      ),
    [state.history, plan, state.completions],
  );
  const micro = useMemo(
    () => buildMicrocycle(plan, history, todayIso, period),
    [plan, history, todayIso, period],
  );
  const next = useMemo(
    () => nextActionableSession(plan, state.completions, todayIso),
    [plan, state.completions, todayIso],
  );
  const direction = useMemo(
    () => buildDirection(state.profile, micro, next),
    [state.profile, micro, next],
  );
  const cycle = useMemo(
    () => buildCycleBar(state.profile, plan, todayIso),
    [state.profile, plan, todayIso],
  );
  const load = useMemo(
    () => buildLoadReport(history, todayIso, period),
    [history, todayIso, period],
  );
  const timeline = useMemo(
    () => buildTimeline(history.filter((row) => row.date <= todayIso)),
    [history, todayIso],
  );
  const targets = useMemo(
    () => progressSessionTargets(plan, state.modifications),
    [plan, state.modifications],
  );
  const planSummary = useMemo(() => {
    if (!planEnd || !state.profile) return null;
    const status = getPlanStatus({
      plan,
      profile: state.profile,
      todayIso,
      completions: state.completions,
    });
    if (status.kind !== "expired") return null;
    return buildPlanSummary({
      profile: state.profile,
      plan,
      completions: state.completions,
      history,
      readiness: state.readiness,
      todayIso,
    });
  }, [planEnd, state.profile, state.completions, state.readiness, plan, history, todayIso]);
  const missingRpe = history.find(
    (row) =>
      row.rpe === null && row.date >= micro.fromIso && row.date <= todayIso && targets[row.key],
  );
  function showHistory(missingRpe = false) {
    setHistoryScope(true);
    setHistoryMissingRpe(missingRpe);
    setTab("history");
    queueMicrotask(() => document.getElementById(`${id}-history`)?.focus());
  }
  const tabs = [
    { id: "dashboard", label: "Podsumowanie" },
    { id: "history", label: "Historia" },
  ] as const;
  return (
    <div className="premium-flow progress-premium" data-progress-workspace>
      <AppHeader
        title="Postęp"
        subtitle="Wykonanie, obciążenie i Twoje pomiary"
        sketch="pitch"
        brand={brand}
      />
      <div className="sticky top-0 z-10 mb-3 bg-background/95 px-5 py-2 backdrop-blur">
        <div className="bw-segmented" role="tablist" aria-label="Widok postępu">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${id}-${item.id}`}
              aria-controls={`${id}-panel`}
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={`min-h-11 rounded-lg px-2 text-sm font-medium ${tab === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => {
                setHistoryScope(false);
                setHistoryMissingRpe(false);
                setTab(item.id);
              }}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                setHistoryScope(false);
                setHistoryMissingRpe(false);
                const target = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index;
                setTab(tabs[target].id);
                document.getElementById(`${id}-${tabs[target].id}`)?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        className="space-y-3 px-5 pb-28"
      >
        {loading && (
          <p role="status" className="text-xs text-muted-foreground">
            Odświeżam dane treningowe…
          </p>
        )}
        {(!loading || state.plan.length > 0 || history.length > 0) && (
          <>
            {tab === "dashboard" ? (
              <>
                {planSummary && planEnd && state.profile && (
                  <PlanEndSummary
                    summary={planSummary}
                    profile={state.profile}
                    currentMinutes={planEnd.currentMinutes}
                    onPrepare={planEnd.onPrepare}
                  />
                )}
                <CycleReviewHistory ownerId={ownerId} plan={state.plan} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Zapisane treningi</span>
                  <div className="bw-segmented" role="group" aria-label="Okres podsumowania">
                    {([7, 28] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        aria-pressed={period === days}
                        onClick={() => setPeriod(days)}
                        className={`min-h-11 rounded-lg px-3 text-xs font-medium ${period === days ? "bg-card text-foreground" : "text-muted-foreground"}`}
                      >
                        {days} dni
                      </button>
                    ))}
                  </div>
                </div>
                <ProgressDashboard
                  cycle={cycle}
                  direction={direction}
                  load={load}
                  micro={micro}
                  runningActivities={state.runningActivities}
                  todayIso={todayIso}
                  onHistory={showHistory}
                  missingRpeTarget={missingRpe ? targets[missingRpe.key] : undefined}
                />
                {ownerId && (
                  <details
                    className="soft-card p-4"
                    onToggle={(event) => setMeasurements(event.currentTarget.open)}
                  >
                    <summary className="cursor-pointer text-sm font-semibold">
                      Pomiary Lab i trening IQ
                    </summary>
                    {measurements && (
                      <Suspense
                        fallback={<p className="mt-3 text-xs">Wczytuję zapisane wyniki…</p>}
                      >
                        <Measurements
                          key={ownerId}
                          ownerId={ownerId}
                          todayIso={todayIso}
                          periodDays={period}
                        />
                      </Suspense>
                    )}
                  </details>
                )}
              </>
            ) : (
              <>
                {historyScope && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Ostatnie {period} dni</span>
                    <button
                      type="button"
                      className="min-h-11 px-2 font-medium text-primary"
                      onClick={() => {
                        setHistoryScope(false);
                        setHistoryMissingRpe(false);
                      }}
                    >
                      Cała historia →
                    </button>
                  </div>
                )}
                <ProgressHistory
                  focusSessionId={focusSessionId}
                  ownerId={ownerId}
                  completions={state.completions}
                  key={`${historyScope}:${historyMissingRpe}`}
                  events={
                    historyScope ? timeline.filter((row) => row.date >= micro.fromIso) : timeline
                  }
                  runningActivities={state.runningActivities}
                  targets={targets}
                  initialMissingRpe={historyMissingRpe}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
