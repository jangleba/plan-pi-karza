import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  CircleDot,
  Gauge,
  History,
  PersonStanding,
  Play,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { AppHeader } from "@/components/loadwise/ui";
import { LabFlow } from "@/components/lab/LabFlow";
import { useAuth } from "@/lib/loadwise/auth";
import { LAB_TESTS, getLabTest } from "@/lib/lab/definitions";
import { createAttemptPlan, FULL_PROFILE_TEST_IDS, sideLabel } from "@/lib/lab/engine";
import { getCameraCapabilities } from "@/lib/lab/nativeCamera";
import { loadLabResults, syncPendingLabResults } from "@/lib/lab/storage";
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
  jump: "SKOCZNOŚĆ",
  speed: "SZYBKOŚĆ",
  change: "ZMIANA KIERUNKU",
  ball: "Z PIŁKĄ",
};

function TestIcon({ id }: { id: LabTestId }) {
  const iconClass = "h-5 w-5";
  if (id === "cmj") return <PersonStanding className={iconClass} />;
  if (id === "single_leg_cmj") return <CircleDot className={iconClass} />;
  if (id === "cod_505") return <ArrowLeftRight className={iconClass} />;
  if (id === "sprint_10m_ball") return <Play className={iconClass} />;
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
    void getCameraCapabilities().then((capability) => {
      if (!active) return;
      setCameraReady(capability.supported && capability.fps >= 239);
      setCameraReason(capability.reason ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadLabResults(user.id).then((rows) => {
      if (active) setResults(rows);
    });
    void syncPendingLabResults(user.id).then((rows) => {
      if (active && rows.length) setResults(rows);
    });
    return () => {
      active = false;
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

  if (!user) return null;

  return (
    <main className="premium-flow min-h-screen pb-28">
      <AppHeader
        title="Lab"
        subtitle="Mierz tylko to, co telefon potrafi policzyć rzetelnie."
        right={
          <span
            className={`rounded-full px-3 py-2 text-[11px] font-semibold ${cameraReady ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
          >
            {cameraReady === null
              ? "Sprawdzanie…"
              : cameraReady
                ? "240 FPS • GOTOWE"
                : "WYMAGA iPHONE"}
          </span>
        }
      />

      <div className="px-5">
        <div className="grid grid-cols-2 rounded-2xl bg-secondary/70 p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tests"}
            onClick={() => setTab("tests")}
            className={`h-10 rounded-xl text-sm font-semibold transition ${tab === "tests" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Testy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
            className={`h-10 rounded-xl text-sm font-semibold transition ${tab === "history" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Historia
          </button>
        </div>

        {tab === "tests" ? (
          <>
            <section className="mt-5 overflow-hidden rounded-[1.6rem] bg-[#0b1f3a] p-5 text-white shadow-[0_18px_40px_-30px_rgba(8,25,51,.8)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                    PEŁNY POMIAR
                  </p>
                  <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.035em]">
                    Profil boiskowy
                  </h2>
                  <p className="mt-1 text-sm text-white/65">6 testów • 19 prób • około 25–35 min</p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <Gauge className="h-5 w-5 text-[#f4c84a]" />
                </span>
              </div>
              <button
                type="button"
                disabled={!cameraReady}
                onClick={() => start(FULL_PROFILE_TEST_IDS)}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f4c84a] text-sm font-semibold text-[#071426] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Rozpocznij profil <ChevronRight className="h-4 w-4" />
              </button>
            </section>

            {!cameraReady && cameraReady !== null && (
              <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4 text-sm leading-relaxed text-muted-foreground">
                <strong className="block text-foreground">
                  Nagrywanie testów jest zablokowane
                </strong>
                {cameraReason ?? "BallWise nie wykrył tylnej kamery obsługującej 240 FPS."}
              </div>
            )}

            <div className="mt-7 space-y-7">
              {grouped.map(([category, tests]) => (
                <section key={category}>
                  <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                    {categoryCopy[category]}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                    {tests.map((test, index) => (
                      <button
                        key={test.id}
                        type="button"
                        disabled={!cameraReady}
                        onClick={() => start([test.id])}
                        className={`flex min-h-[78px] w-full items-center gap-4 px-4 py-3 text-left disabled:opacity-45 ${index > 0 ? "border-t border-border/65" : ""}`}
                      >
                        <span className="icon-bubble grid h-11 w-11 shrink-0 place-items-center">
                          <TestIcon id={test.id} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px] font-semibold text-foreground">
                            {test.title}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {test.shortDescription}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-xs text-muted-foreground">
                            {test.sides.length * test.trialsPerSide} prób
                          </span>
                          <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground" />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-7 flex gap-3 rounded-2xl border border-border/60 bg-secondary/45 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                BallWise zapisuje wyłącznie wynik i dane kontroli pomiaru. Nagranie robocze nie jest
                wysyłane do chmury. Wyniki nie stanowią diagnozy medycznej.
              </p>
            </div>
          </>
        ) : (
          <section className="mt-5">
            {results.length === 0 ? (
              <div className="py-16 text-center">
                <History className="mx-auto h-7 w-7 text-muted-foreground" />
                <h2 className="mt-4 font-semibold">Brak zapisanych pomiarów</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pierwszy poprawny test pojawi się tutaj.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => {
                  const test = getLabTest(result.testId);
                  const value =
                    result.metrics.primaryUnit === "cm"
                      ? `${result.metrics.primaryValue.toFixed(1)} cm`
                      : `${result.metrics.primaryValue.toFixed(3)} s`;
                  return (
                    <article
                      key={result.id}
                      className="soft-card flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="font-semibold">{test.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {sideLabel(result.side) ??
                            new Date(result.recordedAt).toLocaleDateString("pl-PL")}{" "}
                          • próba {result.trialNumber}
                        </p>
                      </div>
                      <div className="text-right">
                        <strong className="block">{value}</strong>
                        <span className="text-[11px] text-muted-foreground">
                          {result.synced ? "zapisano" : "oczekuje na synchronizację"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {attempts && (
        <LabFlow
          userId={user.id}
          attempts={attempts}
          existingResults={results}
          onSaved={addResult}
          onClose={() => setAttempts(null)}
        />
      )}
    </main>
  );
}
