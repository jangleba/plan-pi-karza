import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader } from "@/components/loadwise/ui";
import { Tabs } from "@/components/ui/app-ui";
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
  { id: "dashboard", label: "Pulpit" },
  { id: "history", label: "Historia" },
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
      mergeTrainingHistory(state.history, buildTrainingHistory(effectivePlan, state.completions)),
    [state.history, effectivePlan, state.completions],
  );
  const micro = useMemo(
    () => buildMicrocycle(effectivePlan, history, todayIso),
    [effectivePlan, history, todayIso],
  );
  const nextSession = useMemo(
    () =>
      effectivePlan
        .filter((day) => day.date >= todayIso && day.dayType !== "rest" && !day.isUnavailable)
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
  const load = useMemo(() => buildLoadReport(history, todayIso), [history, todayIso]);
  const evidence = useMemo(
    () => buildEvidence(micro, history, todayIso),
    [micro, history, todayIso],
  );
  const timeline = useMemo(() => buildTimeline(history), [history]);

  return (
    <div className="premium-flow progress-premium">
      <AppHeader title="Postęp" />

      <div className="bw-page-content mb-6">
        <Tabs
          className="[&_.is-selected]:bg-transparent [&_.is-selected]:text-foreground [&_.is-selected]:font-semibold"
          value={tab}
          options={TABS.map((item) => ({ value: item.id, label: item.label }))}
          onChange={setTab}
          label="Widok postępu"
          panelId="progress-panel"
        />
      </div>

      <div
        key={tab}
        id="progress-panel"
        role="tabpanel"
        aria-label={tab === "dashboard" ? "Pulpit" : "Historia"}
        className="bw-page-content"
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
    </div>
  );
}
