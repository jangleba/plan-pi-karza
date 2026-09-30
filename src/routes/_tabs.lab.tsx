import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CircleDot, Gauge, PersonStanding, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionRow, Disclosure, StatusMessage, Tabs } from "@/components/ui/app-ui";
import { AppHeader } from "@/components/loadwise/ui";
import { displayLabValue, LabMeasurementDetails } from "@/components/lab/LabMeasurement";
import { LabFlow } from "@/components/lab/LabFlow";
import { useAuth } from "@/lib/loadwise/auth";
import { LAB_TESTS, getLabTest } from "@/lib/lab/definitions";
import {
  createAttemptPlan,
  FULL_PROFILE_TEST_IDS,
  isVisibleLabResult,
  sideLabel,
} from "@/lib/lab/engine";
import { getCameraCapabilities } from "@/lib/lab/nativeCamera";
import {
  listLocalLabResults,
  loadLabResults,
  mergeLabResults,
  syncPendingLabResults,
} from "@/lib/lab/storage";
import type { LabAttempt, LabResult, LabTestDefinition, LabTestId } from "@/lib/lab/types";

export const Route = createFileRoute("/_tabs/lab")({
  component: LabScreen,
  head: () => ({
    meta: [
      { title: "BallWise Lab | Testy motoryczne 240 FPS" },
      {
        name: "description",
        content: "Rzetelne pomiary skoku, sprintu i zmiany kierunku z nagrania iPhone 240 FPS.",
      },
    ],
  }),
});

type Tab = "tests" | "history";

const categoryCopy: Record<LabTestDefinition["category"], string> = {
  jump: "Skoczność",
  speed: "Szybkość",
  change: "Zmiana kierunku",
};

function TestIcon({ id }: { id: LabTestId }) {
  const iconClass = "h-5 w-5";
  if (id === "cmj") return <PersonStanding className={iconClass} />;
  if (id === "single_leg_cmj") return <CircleDot className={iconClass} />;
  if (id === "cod_505") return <ArrowLeftRight className={iconClass} />;
  if (id === "flying_10m") return <Gauge className={iconClass} />;
  return <TimerReset className={iconClass} />;
}

function LabScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("tests");
  const [attempts, setAttempts] = useState<LabAttempt[] | null>(null);
  const [results, setResults] = useState<LabResult[]>([]);
  const [cameraReady, setCameraReady] = useState<boolean | null>(null);
  const [cameraReason, setCameraReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCameraCapabilities()
      .then((capability) => {
        if (!active) return;
        setCameraReady(capability.supported && capability.fps >= 239);
        setCameraReason(capability.reason ?? null);
      })
      .catch(() => {
        if (!active) return;
        setCameraReady(false);
        setCameraReason("Nie można sprawdzić kamery. Otwórz LAB ponownie.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setResults(listLocalLabResults(user.id));
    const refresh = async () => {
      const loaded = await loadLabResults(user.id);
      if (active)
        setResults((current) =>
          mergeLabResults(
            current.filter((row) => row.userId === user.id),
            loaded,
          ),
        );
      const synced = await syncPendingLabResults(user.id);
      if (active)
        setResults((current) =>
          mergeLabResults(
            current.filter((row) => row.userId === user.id),
            synced,
          ),
        );
    };
    void refresh();
    window.addEventListener("online", refresh);

    return () => {
      active = false;
      window.removeEventListener("online", refresh);
    };
  }, [user]);

  const grouped = useMemo(() => {
    const groups = new Map<LabTestDefinition["category"], LabTestDefinition[]>();
    for (const test of LAB_TESTS)
      groups.set(test.category, [...(groups.get(test.category) ?? []), test]);
    return [...groups.entries()];
  }, []);

  function start(testIds: readonly LabTestId[]) {
    setAttempts(createAttemptPlan(testIds));
  }

  function addResult(result: LabResult) {
    setResults((rows) => [result, ...rows.filter((item) => item.id !== result.id)]);
  }

  const visibleResults = results
    .filter(isVisibleLabResult)
    .filter((row) => row.userId === user?.id);
  const profileAttempts = LAB_TESTS.reduce(
    (total, test) => total + test.trialsPerSide * test.sides.length,
    0,
  );

  if (!user) return null;

  return (
    <section className="premium-flow">
      <AppHeader title="Lab" />
      <div className="bw-page-content bw-stack">
        <Tabs
          className="[&_.is-selected]:bg-card [&_.is-selected]:text-foreground"
          value={tab}
          options={[
            { value: "tests", label: "Testy" },
            { value: "history", label: "Historia" },
          ]}
          onChange={setTab}
          label="Widok pomiarów"
          panelId="lab-panel"
        />
        <div
          id="lab-panel"
          role="tabpanel"
          aria-label={tab === "tests" ? "Testy" : "Historia pomiarów"}
        >
          {tab === "tests" ? (
            <div className="bw-stack">
              <StatusMessage tone={cameraReady ? "success" : "neutral"}>
                {cameraReady === null
                  ? "Sprawdzanie kamery…"
                  : cameraReady
                    ? "Kamera 240 FPS gotowa"
                    : (cameraReason ??
                      "Nagrywanie wymaga aplikacji BallWise na iPhone z kamerą 240 FPS.")}
              </StatusMessage>
              <section className="bw-section space-y-4 rounded-lg bg-[#0b1f3a] p-5 text-white">
                <h2 className="bw-section-title">Profil boiskowy</h2>
                <p className="text-sm text-white/65">
                  {FULL_PROFILE_TEST_IDS.length} testów · {profileAttempts} prób · 25–30 min
                </p>
                <Button
                  disabled={!cameraReady}
                  onClick={() => start(FULL_PROFILE_TEST_IDS)}
                  className="w-fit bg-[#f4c84a] text-[#071426] hover:bg-[#f4c84a]/90"
                >
                  Rozpocznij profil
                </Button>
              </section>
              <div className="bw-columns">
                {grouped.map(([category, tests]) => (
                  <section key={category} className="bw-section space-y-3">
                    <h2 className="bw-section-title">{categoryCopy[category]}</h2>
                    {tests.map((test) => (
                      <ActionRow
                        key={test.id}
                        title={test.title}
                        description={test.shortDescription}
                        icon={<TestIcon id={test.id} />}
                        trailing={
                          <span className="text-sm text-muted-foreground">
                            {test.sides.length * test.trialsPerSide} prób
                          </span>
                        }
                        onClick={cameraReady ? () => start([test.id]) : undefined}
                      />
                    ))}
                  </section>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Nagrania pozostają na urządzeniu i są usuwane po zapisaniu pomiaru. Wyniki nie
                stanowią diagnozy medycznej.
              </p>
            </div>
          ) : (
            <section className="bw-section">
              {visibleResults.length === 0 ? (
                <p className="py-6 text-muted-foreground">Brak zapisanych pomiarów.</p>
              ) : (
                visibleResults.map((result) => {
                  const test = getLabTest(result.testId);
                  return (
                    <article key={result.id} className="bw-section space-y-3 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                        <div>
                          <h2 className="font-semibold">{test.title}</h2>
                          <p className="text-sm text-muted-foreground">
                            {new Date(result.recordedAt).toLocaleDateString("pl-PL")}
                            {sideLabel(result.side) ? ` · ${sideLabel(result.side)}` : ""} · próba{" "}
                            {result.trialNumber}
                          </p>
                        </div>
                        <strong className="text-2xl font-semibold tabular-nums">
                          {displayLabValue(result.metrics.primaryValue, result.metrics.primaryUnit)}
                        </strong>
                      </div>
                      <Disclosure title="Szczegóły pomiaru">
                        <LabMeasurementDetails metrics={result.metrics} />
                      </Disclosure>
                      {!result.synced && <StatusMessage>Oczekuje na synchronizację</StatusMessage>}
                    </article>
                  );
                })
              )}
            </section>
          )}
        </div>
      </div>
      {attempts && (
        <LabFlow
          userId={user.id}
          attempts={attempts}
          onSaved={addResult}
          onClose={() => setAttempts(null)}
        />
      )}
    </section>
  );
}
