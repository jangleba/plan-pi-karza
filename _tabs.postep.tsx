import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { ProgressHistory } from "@/components/progress/ProgressHistory";
import { buildTrainingHistory, mergeTrainingHistory } from "@/lib/progress/progress";
import { buildMicrocycle, buildDirection } from "@/lib/progress/center";
import {
  buildCycleBar,
  buildLoadReport,
  buildEvidence,
  buildTimeline,
} from "@/lib/progress/dashboard";

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

  const history = useMemo(
    () => mergeTrainingHistory(state.history, buildTrainingHistory(state.plan, state.completions)),
    [state.history, state.plan, state.completions],
  );
  const micro = useMemo(
    () => buildMicrocycle(state.plan, history, todayIso),
    [state.plan, history, todayIso],
  );
  const nextSession = useMemo(
    () =>
      state.plan
        .filter((day) => day.date >= todayIso && day.dayType !== "rest" && !day.isUnavailable)
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null,
    [state.plan, todayIso],
  );
  const direction = useMemo(
    () => buildDirection(state.profile, micro, nextSession),
    [state.profile, micro, nextSession],
  );
  const cycle = useMemo(
    () => buildCycleBar(state.profile, state.plan, todayIso),
    [state.profile, state.plan, todayIso],
  );
  const load = useMemo(() => buildLoadReport(history, todayIso), [history, todayIso]);
  const evidence = useMemo(
    () => buildEvidence(micro, history, todayIso),
    [micro, history, todayIso],
  );
  const timeline = useMemo(() => buildTimeline(history), [history]);

  return (
    <div>
      <AppHeader title="Postęp" subtitle="Tylko realne dane z wykonanych treningów." />

      <div className="sticky top-0 z-10 mb-4 bg-background/85 px-5 py-2 backdrop-blur">
        <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`progress-tab-${item.id}`}
              aria-controls="progress-panel"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[10px] font-semibold tracking-wide transition-all duration-200 ${
                tab === item.id
                  ? "bg-background text-foreground shadow-sm"
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
            todayIso={todayIso}
          />
        ) : (
          <ProgressHistory events={timeline} runningActivities={state.runningActivities} />
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
