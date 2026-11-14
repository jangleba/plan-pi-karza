import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/loadwise/ui";
import { useLoadwise } from "@/lib/loadwise/store";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { SessionDay } from "@/lib/loadwise/types";
import { lockedExecutionDays } from "@/lib/loadwise/engineV2/locks";
import { getPlanStatus } from "@/lib/loadwise/engineV2/planStatus";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { useAuth } from "@/lib/loadwise/auth";
import { cycleStartRecord, stampCycleStart } from "@/lib/loadwise/cycleReview";
import { parseNextPlanIntent, type NextPlanIntent } from "@/lib/loadwise/nextPlanIntent";
import { buildPlanSummary } from "@/lib/loadwise/planSummary";
import { describeScheduleChanges, windowDiff } from "@/lib/loadwise/scheduleChange";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { buildTrainingHistory, mergeTrainingHistory } from "@/lib/progress/progress";
import { rowsToStrengthSets, useStrengthSetRows } from "@/lib/loadwise/strengthSets";
import { StrengthExperienceSetup } from "./session/StrengthExperienceSetup";
import { FeedbackAdjustmentCard } from "./FeedbackAdjustmentCard";
import { MasTestAction } from "./MasTestAction";
import "@/styles/ballwise-plan.css";

/** Preview, explicit activation and execution of the versioned training plan. */
export function PlanScreen() {
  const { state, todayIso, hydrated, syncing, activatePlanV2 } = useLoadwise();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [rebuildRequested, setRebuild] = useState(false);
  // Choices confirmed in Progress (time budget); a different saved plan voids them.
  const intentState = useTrainingLocalState<NextPlanIntent | null>(
    trainingStorageKey("next-plan-intent", user?.id),
    null,
    parseNextPlanIntent,
  );
  const [timeChoice, setTimeChoice] = useState<{ planId: string | null; minutes: number } | null>(
    null,
  );
  const planId = state.activePlanId ?? null;
  const intent =
    intentState.value && intentState.value.planId === planId ? intentState.value : null;
  const rebuild = rebuildRequested || intent !== null;
  const storedMinutes = state.plan[0]?.engineTimeBudgetMin;
  const savedBudget =
    typeof storedMinutes === "number" &&
    Number.isFinite(storedMinutes) &&
    storedMinutes >= 10 &&
    storedMinutes <= 120
      ? storedMinutes
      : 75;
  const minutes =
    timeChoice?.planId === planId ? timeChoice.minutes : (intent?.minutes ?? savedBudget);
  const effectivePlan = useMemo(
    () =>
      resolveEffectivePlan(state.plan, state.modifications, {
        completions: state.completions,
      }),
    [state.plan, state.modifications, state.completions],
  );
  const status = useMemo(
    () =>
      getPlanStatus({
        plan: effectivePlan,
        profile: state.profile,
        todayIso,
        completions: state.completions,
      }),
    [effectivePlan, state.profile, todayIso, state.completions],
  );
  const setRows = useStrengthSetRows(
    status.kind === "expired" ? user?.id : undefined,
    effectivePlan[0]?.date,
    effectivePlan[effectivePlan.length - 1]?.date,
  );
  const preview = useMemo(() => {
    if (!state.profile || (state.plan.length && !rebuild)) return null;
    try {
      // The recommendation is decided first, then handed to the one generator.
      const summary =
        state.plan.length && status.kind === "expired"
          ? buildPlanSummary({
              profile: state.profile,
              plan: effectivePlan,
              completions: state.completions,
              history: mergeTrainingHistory(
                state.history,
                buildTrainingHistory(effectivePlan, state.completions),
                state.completions,
              ),
              readiness: state.readiness,
              todayIso,
              strengthSets: setRows ? rowsToStrengthSets(setRows, state.completions) : [],
            })
          : null;
      const record = summary?.review
        ? cycleStartRecord(summary.review, state.plan[0]?.cycleId ?? null)
        : null;
      const generated = generateTrainingPlan(state.profile, {
        cycleStart: record,
        startDate: todayIso,
        previousPlan: state.plan,
        completions: state.completions,
        expectedPlanId: state.activePlanId ?? null,
        minutesPerSession: minutes,
        lockedDays: lockedExecutionDays(
          resolveEffectivePlan(state.plan, state.modifications, {
            completions: state.completions,
          }),
          state.completions,
        ),
        precedingDays: resolveEffectivePlan(state.plan, state.modifications, {
          completions: state.completions,
        }).filter((d) => d.date < todayIso),
        readiness: state.profile.healthPersonalizationEnabled ? state.readiness : undefined,
      });
      // The same record travels with the new plan, so it stays in Progress and survives rebuilds.
      const result = record
        ? { ...generated, plan: stampCycleStart(generated.plan, record) }
        : generated;
      return { result, error: null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Nie udało się przygotować planu.",
      };
    }
  }, [
    state.profile,
    state.plan,
    state.completions,
    state.readiness,
    state.modifications,
    state.activePlanId,
    state.history,
    rebuild,
    todayIso,
    minutes,
    effectivePlan,
    status.kind,
    setRows,
  ]);
  const plan = preview?.result?.plan ?? effectivePlan;
  // What changed since the saved plan was built, and what the next days would look like.
  const scheduleChanges = state.profile
    ? describeScheduleChanges(
        effectivePlan[0]?.planInputs,
        state.profile,
        preview?.result
          ? minutes
          : (effectivePlan[0]?.planInputs?.minutesPerSession ?? savedBudget),
        todayIso,
      )
    : [];
  // The write replaces the plan from today on, so the preview names both the nearest days and
  // any change further ahead before anything is saved.
  const allDiff =
    preview?.result && state.plan.length
      ? windowDiff(effectivePlan, preview.result.plan, todayIso, 28)
      : [];
  const nearEnd = new Date(`${todayIso}T12:00:00Z`);
  nearEnd.setUTCDate(nearEnd.getUTCDate() + 6);
  const nearLimit = nearEnd.toISOString().slice(0, 10);
  const nextDaysDiff = allDiff.filter((d) => d.date <= nearLimit);
  const laterDiff = allDiff.filter((d) => d.date > nearLimit);
  const issues = preview?.result?.issues ?? state.plan[0]?.enginePlanIssues ?? [];
  async function save() {
    if (!preview?.result || !activatePlanV2) return;
    setSaving(true);
    setError(null);
    try {
      await activatePlanV2(preview.result);
      setRebuild(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać planu. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }
  function open(d: SessionDay, slot: 1 | 2) {
    void navigate({ to: "/sesja/$date", params: { date: d.date }, search: { slot } });
  }
  return (
    <div className="bw-plan-screen pb-6">
      <AppHeader title="Plan" sketch="pitch" />
      <div className="px-4 space-y-4">
        {!hydrated || syncing ? <p role="status">Wczytywanie profilu…</p> : null}
        {!preview ? <FeedbackAdjustmentCard /> : null}
        {!preview ? <MasTestAction /> : null}
        {state.profile ? (
          <details className="rounded-2xl border border-black/10 p-4">
            <summary>Dopasowanie treningu</summary>
            <StrengthExperienceSetup />
            <label className="block text-sm pt-3">
              Czas na jednostkę
              <select
                aria-label="Czas na jednostkę"
                value={minutes}
                onChange={(e) => {
                  setTimeChoice({ planId, minutes: Number(e.target.value) });
                  // A new time budget is a proposal: show the preview, save only on request.
                  if (state.plan.length && Number(e.target.value) !== savedBudget) setRebuild(true);
                }}
              >
                {[...new Set([30, 45, 60, 75, 90, 120, minutes])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <option key={v} value={v}>
                      {v} minut
                    </option>
                  ))}
              </select>
            </label>
          </details>
        ) : null}
        {!state.profile && hydrated ? <p>Uzupełnij profil, aby przygotować plan.</p> : null}
        {state.plan.length > 0 && !preview ? (
          <div className="space-y-2">
            {scheduleChanges.length > 0 && status.kind === "stale" ? (
              <ul className="text-sm">
                {scheduleChanges.map((c) => (
                  <li key={c.kind}>{c.line}</li>
                ))}
              </ul>
            ) : null}
            {status.kind === "expired" ? (
              <p role="status">
                Cykl zakończony{status.endDate ? ` · ${status.endDate}` : ""}. Przygotuj kolejne 4
                tygodnie.
              </p>
            ) : status.kind === "stale" ? (
              <p role="status">
                {status.staleReason === "version"
                  ? "Dostępna jest aktualna wersja silnika. Przygotuj plan ponownie."
                  : "Profil zmienił się. Przygotuj aktualny plan przed rozpoczęciem nowej sesji."}
              </p>
            ) : null}
            <button className="text-sm underline py-2" onClick={() => setRebuild(true)}>
              {status.kind === "stale" ? "Zaktualizuj plan" : "Przygotuj kolejny plan"}
            </button>
          </div>
        ) : null}
        {preview?.result ? (
          <section className="rounded-2xl border border-black/10 p-4 space-y-3">
            <h2 className="font-semibold">Twój plan · 4 tygodnie</h2>
            <p className="text-sm text-neutral-600">
              Podgląd dopasowany do Twojego przygotowania siłowego i kalendarza. Zapisz go, aby
              rozpocząć treningi.
            </p>
            {scheduleChanges.length > 0 ? (
              <ul className="text-sm text-neutral-600">
                {scheduleChanges.map((c) => (
                  <li key={c.kind}>{c.line}</li>
                ))}
              </ul>
            ) : null}
            {state.plan.length > 0 && preview?.result ? (
              <p className="text-sm">
                Zapis zastąpi plan od {todayIso} do {preview.result.plan.at(-1)?.date}. Zmiany:{" "}
                {nextDaysDiff.length} w najbliższych 7 dniach
                {laterDiff.length > 0
                  ? `, ${laterDiff.length} w dalszych tygodniach (poniżej)`
                  : ", żadnych w dalszych tygodniach"}
                .
              </p>
            ) : null}
            {nextDaysDiff.length > 0 ? (
              <details className="text-sm">
                <summary>Najbliższe 7 dni · zmiany ({nextDaysDiff.length})</summary>
                <ul>
                  {nextDaysDiff.map((d) => (
                    <li key={d.date}>
                      {d.date}: {d.before} → {d.after}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {laterDiff.length > 0 ? (
              <details className="text-sm" open>
                <summary>Dalsze tygodnie · zmiany ({laterDiff.length})</summary>
                <ul>
                  {laterDiff.map((d) => (
                    <li key={d.date}>
                      {d.date}: {d.before} → {d.after}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {state.plan.length > 0 ? (
              <p className="text-sm text-neutral-600">
                Nowy plan rozpoczyna się {todayIso}. Zapisane wykonanie i historia treningów
                pozostają zachowane.
              </p>
            ) : null}
            {state.plan.length > 0 ? (
              <button
                type="button"
                className="text-sm underline py-2"
                onClick={() => {
                  setRebuild(false);
                  intentState.setValue(null);
                }}
              >
                Wróć do zapisanego planu
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-xl bg-neutral-900 text-white px-4 py-3"
              disabled={saving || !hydrated || syncing || !activatePlanV2}
              onClick={() => void save()}
            >
              {saving
                ? "Zapisywanie…"
                : issues.length
                  ? "Zapisz plan z pokazanymi ograniczeniami"
                  : "Zapisz plan"}
            </button>
          </section>
        ) : null}
        {error || preview?.error ? <p role="alert">{error || preview?.error}</p> : null}
        {issues.length ? (
          <details className="rounded-2xl border border-black/10 p-4">
            <summary>Ograniczenia planu · {issues.length}</summary>
            <ul className="list-disc pl-5 text-sm">
              {issues.map((x, i) => (
                <li key={i}>{x.message}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {plan.map((d) => (
          <section key={d.date} className="rounded-2xl border border-black/10 p-4 space-y-2">
            <p className="text-xs text-neutral-500">
              {d.dayName} · {d.date}
            </p>
            {[d, ...(d.secondSession ? [d.secondSession] : [])].map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{s.title}</h3>
                  {s.durationMin > 0 ? (
                    <span className="text-sm text-neutral-500">{s.durationMin} min</span>
                  ) : null}
                </div>
                {s.engineV2?.cycle &&
                ["deload", "reentry", "review"].includes(s.engineV2.cycle.state) ? (
                  <details className="text-sm text-neutral-600">
                    <summary>{s.blockPhaseLabel}</summary>
                    <p>{s.engineV2.cycle.reason}</p>
                  </details>
                ) : null}
                {s.dbId && !preview && s.dayType !== "rest" ? (
                  <button
                    className="text-sm underline py-2"
                    onClick={() => open(d, i === 0 ? 1 : 2)}
                  >
                    Otwórz trening
                  </button>
                ) : s.engineV2 ? (
                  <details className="text-sm">
                    <summary>Ćwiczenia i dawki</summary>
                    <ul className="space-y-2 py-2">
                      {s.structuredSections
                        ?.flatMap((x) => x.blocks.flatMap((b) => b.exercises))
                        .map((e) => (
                          <li key={e.id}>
                            <strong>{e.name}</strong> · {e.displayPrescription} · przerwa{" "}
                            {e.restAfterExercise}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
