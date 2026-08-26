import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { ProgressTests } from "@/components/progress/ProgressTests";
import { ProgressHistory } from "@/components/progress/ProgressHistory";
import {
  buildTrainingHistory,
  buildMetricSeries,
  bestImprovement,
} from "@/lib/progress/progress";
import {
  buildMicrocycle,
  buildDirection,
  buildTestSummaries,
  buildVisionParameters,
  visionInterpretation,
} from "@/lib/progress/center";
import {
  buildCycleBar,
  buildLoadReport,
  buildEvidence,
  buildDevelopmentMap,
  buildTimeline,
} from "@/lib/progress/dashboard";
import { listAllResults } from "@/lib/vision/visionResultService";
import { getVisionTest } from "@/lib/vision/visionTests";
import { SUPPORTED_VISION_TESTS } from "@/lib/vision/supportedTests";
import type { VisionTestResult } from "@/lib/vision/types";

export const Route = createFileRoute("/_tabs/postep")({
  component: ProgressScreen,
  head: () => ({
    meta: [
      { title: "Pulpit rozwoju – testy i historia treningów | BallWise" },
      {
        name: "description",
        content:
          "Kierunek rozwoju, dowody postępu, obciążenie treningowe z RPE, zmiana wyników w czasie oraz pełna historia treningów i testów.",
      },
      { property: "og:title", content: "Pulpit rozwoju – BallWise" },
      {
        property: "og:description",
        content:
          "Realne dane zawodnika: obciążenie, rekordy, mapa rozwoju i historia treningów w jednym miejscu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { id: "dashboard", label: "PULPIT" },
  { id: "tests", label: "TESTY" },
  { id: "history", label: "HISTORIA" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProgressScreen() {
  const { state, todayIso } = useLoadwise();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("dashboard");
  const [vision, setVision] = useState<VisionTestResult[]>([]);

  useEffect(() => {
    let alive = true;
    listAllResults(user?.id ?? null)
      .then((r) => alive && setVision(r))
      .catch(() => alive && setVision([]));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const history = useMemo(
    () => buildTrainingHistory(state.plan, state.completions),
    [state.plan, state.completions],
  );

  const series = useMemo(
    () => buildMetricSeries(state.tests, vision),
    [state.tests, vision],
  );

  const testDates = useMemo(
    () => [
      ...state.tests.map((t) => t.date),
      ...vision.map((v) => v.createdAt.slice(0, 10)),
    ],
    [state.tests, vision],
  );

  const micro = useMemo(
    () =>
      buildMicrocycle(state.plan, state.completions, history, testDates, todayIso),
    [state.plan, state.completions, history, testDates, todayIso],
  );

  const improvement = useMemo(() => bestImprovement(series), [series]);

  const nextSession = useMemo(
    () =>
      state.plan
        .filter((d) => d.date >= todayIso && d.dayType !== "rest")
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null,
    [state.plan, todayIso],
  );

  const direction = useMemo(
    () => buildDirection(state.profile, micro, improvement, series, nextSession),
    [state.profile, micro, improvement, series, nextSession],
  );

  const cycle = useMemo(
    () => buildCycleBar(state.profile, state.plan, todayIso),
    [state.profile, state.plan, todayIso],
  );

  const load = useMemo(() => buildLoadReport(history, todayIso), [history, todayIso]);

  const evidence = useMemo(
    () => buildEvidence(micro, series, vision, history, todayIso),
    [micro, series, vision, history, todayIso],
  );

  const areas = useMemo(
    () => buildDevelopmentMap(series, micro, history, vision, todayIso),
    [series, micro, history, vision, todayIso],
  );

  const timeline = useMemo(
    () => buildTimeline(history, series, vision),
    [history, series, vision],
  );

  const testRows = useMemo(
    () => buildTestSummaries(series, vision, todayIso),
    [series, vision, todayIso],
  );

  const visionParams = useMemo(() => buildVisionParameters(vision), [vision]);

  const recommendedVisionTest = useMemo(() => {
    const measured = new Set(vision.map((v) => v.testType));
    const id =
      SUPPORTED_VISION_TESTS.find((t) => !measured.has(t)) ?? SUPPORTED_VISION_TESTS[0];
    const t = getVisionTest(id);
    return t ? { id: t.id, name: t.name } : null;
  }, [vision]);

  return (
    <div>
      <AppHeader title="Pulpit rozwoju" subtitle="Rozwój oparty na realnych danych." />

      <div className="sticky top-0 z-10 mb-4 bg-background/85 px-5 py-2 backdrop-blur">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[10px] font-semibold tracking-wide transition-all duration-200 ${
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="px-5 pb-28">
        {tab === "dashboard" && (
          <ProgressDashboard
            cycle={cycle}
            direction={direction}
            evidence={evidence}
            load={load}
            series={series}
            areas={areas}
            onNavigateTests={() => setTab("tests")}
          />
        )}
        {tab === "tests" && (
          <ProgressTests
            rows={testRows}
            visionParams={visionParams}
            visionInterpretationText={visionInterpretation(visionParams, vision.length)}
            recommendedVisionTest={recommendedVisionTest}
          />
        )}
        {tab === "history" && <ProgressHistory events={timeline} />}
      </div>

      <Disclaimer />
    </div>
  );
}
