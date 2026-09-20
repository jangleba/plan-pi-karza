import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { ProgressHistory } from "@/components/progress/ProgressHistory";
import {
  buildTrainingHistory,
  mergeTrainingHistory,
} from "@/lib/progress/progress";
import { buildMicrocycle, buildDirection } from "@/lib/progress/center";
import {
  buildCycleBar,
  buildLoadReport,
  buildEvidence,
  buildTimeline,
} from "@/lib/progress/dashboard";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";

export const Route = createFileRoute("/_tabs/postep")({
  component: ProgressScreen,
  head: () => ({
    meta: [
      { title: "Postęp i historia treningów | BallWise" },
      {
        name: "description",
        content:
          "Realizacja planu, obciążenie z czasu i RPE, balans treningu oraz pełna historia ukończonych jednostek.",
      },
      { property: "og:title", content: "Postęp treningowy – BallWise" },
      {
        property: "og:description",
        content: "Realne dane z ukończonych treningów w jednym miejscu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { id: "dashboard", label: "PULPIT" },
  { id: "history", label: "HISTORIA" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProgressScreen() {
  const { state, todayIso } = useLoadwise();
  const [tab, setTab] = useState<TabId>("dashboard");
  const effectivePlan = useMemo(
    () => resolveEffectivePlan(state.plan, state.modifications),
    [state.plan, state.modifications],
  );

  const history = useMemo(
    () =>
      mergeTrainingHistory(
        state.history,
        buildTrainingHistory(effectivePlan, state.completions),
      ),
    [state.history, effectivePlan, state.completions],
  );
  const micro = useMemo(
    () => buildMicrocycle(effectivePlan, history, todayIso),
    [effectivePlan, history, todayIso],
  );
  const nextSession = useMemo(
    () =>
      effectivePlan
        .filter(
          (day) =>
            day.date >= todayIso &&
            day.dayType !== "rest" &&
            !day.isUnavailable,
        )
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null,
    [effectivePlan, todayIso],
  );
  const direction = useMemo(
    () => buildDirection(state.profile, micro, nextSession),
    [state.profile, micro, nextSession],
  );
  const cycle = useMemo(
    () => buildCycleBar(state.profile, effectivePlan, todayIso),
    [state.profile, effectivePlan, todayIso],
  );
  const load = useMemo(
    () => buildLoadReport(history, todayIso),
    [history, todayIso],
  );
  const evidence = useMemo(
    () => buildEvidence(micro, history, todayIso),
    [micro, history, todayIso],
  );
  const timeline = useMemo(() => buildTimeline(history), [history]);

  return (
    <div className="premium-flow progress-premium">
      <AppHeader
        title="Postęp"
        subtitle="Tylko realne dane z wykonanych treningów."
      />

      <div className="sticky top-0 z-10 mb-4 bg-background/85 px-5 py-2 backdrop-blur">
        <div className="flex border-b border-border" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`progress-tab-${item.id}`}
              aria-controls="progress-panel"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`relative flex-1 px-2 py-2.5 text-[11px] font-medium tracking-[0.08em] transition-colors duration-200 ${
                tab === item.id
                  ? "text-foreground after:absolute after:inset-x-5 after:-bottom-px after:h-0.5 after:bg-primary"
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        key={tab}
        id="progress-panel"
        role="tabpanel"
        aria-labelledby={`progress-tab-${tab}`}
        className="px-5 pb-28"
      >
        {tab === "dashboard" ? (
          <ProgressDashboard
            cycle={cycle}
            direction={direction}
            evidence={evidence}
            load={load}
            micro={micro}
            runningActivities={state.runningActivities}
            history={history}
            todayIso={todayIso}
          />
        ) : (
          <ProgressHistory
            events={timeline}
            runningActivities={state.runningActivities}
          />
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
