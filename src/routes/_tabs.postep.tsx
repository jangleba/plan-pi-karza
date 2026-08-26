import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { ProgressSummary } from "@/components/progress/ProgressSummary";
import { ProgressTests } from "@/components/progress/ProgressTests";
import { ProgressOpportunities } from "@/components/progress/ProgressOpportunities";
import { ProgressCareer } from "@/components/progress/ProgressCareer";
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
import type { OpportunityFilters } from "@/lib/progress/opportunities";
import { listAllResults } from "@/lib/vision/visionResultService";
import { getVisionTest } from "@/lib/vision/visionTests";
import { SUPPORTED_VISION_TESTS } from "@/lib/vision/supportedTests";
import type { VisionTestResult } from "@/lib/vision/types";

export const Route = createFileRoute("/_tabs/postep")({
  component: ProgressScreen,
  head: () => ({
    meta: [
      { title: "Centrum zawodnika – postęp, testy i szanse | BallWise" },
      {
        name: "description",
        content:
          "Mikrocykl, kierunek rozwoju, pełne podsumowanie testów, dopasowane nabory klubowe i oś kariery w jednym miejscu.",
      },
      { property: "og:title", content: "Centrum zawodnika – BallWise" },
      {
        property: "og:description",
        content:
          "Realne dane z treningów i testów: wykonanie mikrocyklu, zmiany wyników, szanse klubowe i tracker zgłoszeń.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { id: "summary", label: "PODSUMOWANIE" },
  { id: "tests", label: "TESTY" },
  { id: "opportunities", label: "SZANSE" },
  { id: "career", label: "KARIERA" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProgressScreen() {
  const { state, todayIso } = useLoadwise();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("summary");
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

  const filters: OpportunityFilters = useMemo(
    () => ({
      city: "",
      radiusKm: 50,
      age: state.profile?.age ?? null,
      position: state.profile?.position ?? null,
      gender: "any",
    }),
    [state.profile],
  );

  return (
    <div>
      <AppHeader title="Centrum zawodnika" subtitle="Rozwój oparty na realnych danych." />

      {/* Wewnętrzne widoki */}
      <div className="sticky top-0 z-10 -mx-0 mb-4 bg-background/85 px-5 py-2 backdrop-blur">
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
        {tab === "summary" && (
          <ProgressSummary direction={direction} micro={micro} series={series} />
        )}
        {tab === "tests" && (
          <ProgressTests
            rows={testRows}
            visionParams={visionParams}
            visionInterpretationText={visionInterpretation(visionParams, vision.length)}
            recommendedVisionTest={recommendedVisionTest}
          />
        )}
        {tab === "opportunities" && (
          <ProgressOpportunities defaults={filters} todayIso={todayIso} />
        )}
        {tab === "career" && (
          <ProgressCareer history={history} tests={testRows} filters={filters} />
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
