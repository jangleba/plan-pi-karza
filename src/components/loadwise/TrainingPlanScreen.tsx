import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { GymBandSetupPanel } from "./session/GymBandSetupPanel";
import { useGymEvidence } from "@/lib/loadwise/useGymEvidence";
import { gymPlanContext } from "@/lib/loadwise/gymEvidence";
import { planEvidenceIssue, planEvidenceKey } from "@/lib/loadwise/planEvidence";
import { useTrainingWriteStatus } from "@/lib/loadwise/useTrainingWriteStatus";
import { hasUnresolvedTrainingWrites } from "@/lib/loadwise/offlineTrainingQueue";
import { runningCalibrationMessage } from "@/lib/loadwise/engineV2/runningCalibrationStatus";
import { ArrowRight, ChevronRight, X } from "lucide-react";
import { PlanWeek, plDate } from "./PlanWeek";
import { NextWeekRow, NextWeekSheet } from "./NextWeekSheet";
import type { NextPlanDraft } from "@/lib/loadwise/nextPlanInterview";
import { PlanLimitations } from "./PlanLimitations";
import { WeeklyPlanningSettings, WeeklyPlanningCoverage } from "./WeeklyPlanningSettings";
import {
  savedWeeklyPlanningPreferences,
  type WeeklyPlanningPreferences,
} from "@/lib/loadwise/weeklyPlanningPreferences";
import { planUnavailableForAge } from "@/lib/loadwise/agePolicy";
import { savedSessionDurationMode } from "@/lib/loadwise/engineV2/sessionDurationPolicy";
import "@/styles/ballwise-plan.css";

const addIsoDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "1 tydzień", "2 tygodnie": the length of the plan shown. */
function planLength(days: number): string {
  const weeks = Math.max(1, Math.round(days / 7));
  return weeks === 1 ? "1 tydzień" : `${weeks} tygodnie`;
}

/** Preview, explicit activation and execution of the versioned training plan. */
export function PlanScreen({
  autoUpdate = false,
  openSettings = false,
}: { autoUpdate?: boolean; openSettings?: boolean } = {}) {
  const gymEvidence = useGymEvidence();
  const { state, todayIso, hydrated, syncing, activatePlanV2, updateProfile } = useLoadwise();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const unresolvedWrites = useTrainingWriteStatus(user?.id);
  const evidenceIssue = planEvidenceIssue(gymEvidence, unresolvedWrites);
  const evidenceKey = planEvidenceKey(gymEvidence);
  const liveEvidence = useRef({ gym: gymEvidence, ownerId: user?.id });
  liveEvidence.current = { gym: gymEvidence, ownerId: user?.id };
  const [rebuildRequested, setRebuild] = useState(autoUpdate);
  // Plan settings are not part of the plan screen; Profile opens them (`?ustawienia=1`).
  const [settingsOpen, setSettingsOpen] = useState(openSettings);
  const [nextOpen, setNextOpen] = useState(false);
  // Choices confirmed in Progress (time budget); a different saved plan voids them.
  const intentState = useTrainingLocalState<NextPlanIntent | null>(
    trainingStorageKey("next-plan-intent", user?.id),
    null,
    parseNextPlanIntent,
  );
  const [timeChoice, setTimeChoice] = useState<{
    ownerId: string | undefined;
    planId: string | null;
    minutes: number;
    mode: "full" | "limited";
  } | null>(null);
  const planId = state.activePlanId ?? null;
  const savedWeeklyPreferences = useMemo(
    () =>
      state.profile
        ? savedWeeklyPlanningPreferences(state.plan[0]?.planInputs, state.profile)
        : null,
    [state.profile, state.plan],
  );
  const [weeklyChoice, setWeeklyChoice] = useState<{
    ownerId: string | undefined;
    planId: string | null;
    value: WeeklyPlanningPreferences | null;
  } | null>(null);
  const weeklyPreferences =
    weeklyChoice?.ownerId === user?.id && weeklyChoice?.planId === planId
      ? weeklyChoice.value
      : savedWeeklyPreferences;
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
  const currentTimeChoice =
    timeChoice?.ownerId === user?.id && timeChoice?.planId === planId ? timeChoice : null;
  const minutes = currentTimeChoice?.minutes ?? intent?.minutes ?? savedBudget;
  const savedDurationMode = savedSessionDurationMode(state.plan);
  const legacyRebuild = rebuild && !state.plan[0]?.planInputs?.sessionDurationMode;
  const sessionDurationMode: "full" | "limited" = currentTimeChoice
    ? currentTimeChoice.mode
    : intent
      ? (intent.sessionDurationMode ?? (intent.minutes == null ? "full" : "limited"))
      : !state.plan.length || legacyRebuild
        ? "full"
        : savedDurationMode;
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
    if (!state.profile || (state.plan.length && !rebuild) || evidenceIssue) return null;
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
      const gymContext = gymPlanContext(gymEvidence.records);
      // Plans are made one week at a time, after the match of that week is confirmed. Updating a
      // plan that is still running keeps its remaining length.
      const lastDay = state.plan.length ? effectivePlan.at(-1)?.date : undefined;
      const remainingWeeks =
        status.kind !== "expired" && lastDay
          ? Math.max(
              1,
              Math.min(
                4,
                Math.ceil((Date.parse(lastDay) - Date.parse(todayIso)) / 86400000 / 7 + 1 / 7),
              ),
            )
          : 1;
      const generated = generateTrainingPlan(state.profile, {
        weeks: remainingWeeks,
        cycleStart: record,
        startDate: todayIso,
        previousPlan: state.plan,
        completions: state.completions,
        expectedPlanId: state.activePlanId ?? null,
        sessionDurationMode,
        minutesPerSession: sessionDurationMode === "limited" ? minutes : undefined,
        weeklyTargets: weeklyPreferences?.weeklyTargets,
        fillRestDays: weeklyPreferences?.fillRestDays,
        minFullRestDays: weeklyPreferences?.minFullRestDays,
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
        gymProgression: gymContext.gymProgression,
        strengthLoadResponses: gymContext.strengthLoadResponses,
      });
      // The same record travels with the new plan, so it stays in Progress and survives rebuilds.
      const result = record
        ? { ...generated, plan: stampCycleStart(generated.plan, record) }
        : generated;
      return { result, error: null, evidenceKey };
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
    sessionDurationMode,
    effectivePlan,
    status.kind,
    setRows,
    gymEvidence.records,
    evidenceIssue,
    evidenceKey,
    weeklyPreferences,
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
        preview?.result ? sessionDurationMode : savedDurationMode,
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
  const runningMessage = runningCalibrationMessage({
    profile: state.profile,
    plan: effectivePlan,
    completions: state.completions,
    todayIso,
    gym: gymEvidence,
    unresolvedWrites,
    online: typeof navigator === "undefined" || navigator.onLine !== false,
  });
  const issues = preview?.result?.issues ?? state.plan[0]?.enginePlanIssues ?? [];
  async function save() {
    if (!preview?.result || !activatePlanV2) return;
    setSaving(true);
    setError(null);
    try {
      const owner = user?.id;
      const capturedKey = preview.evidenceKey;
      const currentEvidence = () => {
        const live = liveEvidence.current;
        return (
          live.ownerId === owner &&
          !planEvidenceIssue(live.gym, !!owner && hasUnresolvedTrainingWrites(owner)) &&
          planEvidenceKey(live.gym) === capturedKey
        );
      };
      if (!currentEvidence())
        throw new Error(
          "Zapisy treningu zmieniły się. Poczekaj na synchronizację i sprawdź nowy podgląd.",
        );
      await activatePlanV2(preview.result, currentEvidence);
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
  const intervalNote =
    state.plan.length > 0 && preview?.result
      ? `Zapis zastąpi plan od ${plDate(todayIso, true)} do ${plDate(preview.result.plan.at(-1)?.date ?? todayIso, true)}. Zmiany: ${nextDaysDiff.length} w najbliższych 7 dniach${
          laterDiff.length > 0
            ? `, ${laterDiff.length} w dalszych tygodniach (poniżej)`
            : ", żadnych w dalszych tygodniach"
        }.`
      : null;
  const diffList = (rows: typeof allDiff) => (
    <ul className="bw-plan-diff">
      {rows.map((d) => (
        <li key={d.date}>
          <span>{plDate(d.date)}</span>
          <span>
            {d.before} <ArrowRight aria-hidden="true" /> {d.after}
          </span>
        </li>
      ))}
    </ul>
  );
  // Under 16: the account stays open, but there is no plan to show or settings to change.
  const ageBlock = planUnavailableForAge(state.profile);
  if (ageBlock)
    return (
      <div className="bw-plan-screen pb-6">
        <AppHeader title="Plan" sketch="pitch" />
        <div className="bw-plan-stack">
          <section className="bw-plan-card bw-plan-age" aria-label="Plan niedostępny">
            <h2>Plan niedostępny</h2>
            <p role="status">{ageBlock}</p>
          </section>
        </div>
      </div>
    );
  const statusTitle =
    status.kind === "expired"
      ? "Cykl zakończony"
      : status.kind === "stale"
        ? "Plan wymaga odświeżenia"
        : "Zapisany plan";
  // The next week opens from a row under the week, only when the date allows it (the week is
  // over); its sheet asks for the next match first.
  const nextAllowed = status.kind === "expired";
  const lastPlanDay = effectivePlan.at(-1)?.date ?? todayIso;
  const nextFrom = nextAllowed ? todayIso : addIsoDays(lastPlanDay, 1);
  const showNext =
    status.kind !== "empty" && !preview && Boolean(state.profile) && hydrated && plan.length > 0;
  async function prepareNextWeek(draft: NextPlanDraft) {
    if (draft.profileChanged) await updateProfile(draft.profile);
    const mode = draft.sessionDurationMode ?? "limited";
    intentState.setValue({
      planId: state.activePlanId ?? null,
      sessionDurationMode: mode,
      minutes: mode === "full" ? null : draft.minutes,
      createdAt: new Date().toISOString(),
    });
    setNextOpen(false);
    setRebuild(true);
  }
  const startRebuild = () => {
    if (status.kind === "expired") {
      setSettingsOpen(false);
      return;
    }
    setRebuild(true);
    setSettingsOpen(false);
  };
  return (
    <div className="bw-plan-screen pb-6">
      <AppHeader title="Plan" brand={false} />
      <div className="bw-plan-stack">
        {!hydrated || syncing ? (
          <p role="status" className="bw-plan-quiet">
            Wczytywanie profilu…
          </p>
        ) : null}
        {(!state.plan.length || rebuild) && evidenceIssue ? (
          <p role="status" className="bw-plan-quiet bw-plan-notice">
            {evidenceIssue}
          </p>
        ) : null}
        {error || preview?.error ? (
          <p role="alert" className="bw-plan-alert">
            {error || preview?.error}
          </p>
        ) : null}
        {preview?.result ? (
          <section className="bw-plan-card bw-plan-preview bw-plan-preview--compact">
            <header className="bw-plan-preview-head">
              <h2>Twój plan · {planLength(plan.length)}</h2>
              <span>Podgląd</span>
            </header>
            <p className="bw-plan-preview-meta">
              {plDate(plan[0]?.date ?? todayIso, true)} –{" "}
              {plDate(plan.at(-1)?.date ?? todayIso, true)}
              {state.plan.length > 0 ? ` · zmiany w 7 dniach: ${nextDaysDiff.length}` : ""}
            </p>
            <button
              type="button"
              className="bw-plan-button"
              disabled={saving || !hydrated || syncing || !!evidenceIssue || !activatePlanV2}
              onClick={() => void save()}
            >
              {saving
                ? "Zapisywanie…"
                : issues.length
                  ? "Zapisz plan z pokazanymi ograniczeniami"
                  : "Zapisz plan"}
            </button>
            <div className="bw-plan-preview-links">
              <button type="button" className="bw-plan-link" onClick={() => setSettingsOpen(true)}>
                Szczegóły zmian
              </button>
              {state.plan.length > 0 ? (
                <button
                  type="button"
                  className="bw-plan-link"
                  onClick={() => {
                    setRebuild(false);
                    intentState.setValue(null);
                    setWeeklyChoice(null);
                    setTimeChoice(null);
                  }}
                >
                  Wróć do zapisanego planu
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
        {!state.profile && hydrated ? (
          <p className="bw-plan-quiet">Uzupełnij profil, aby przygotować plan.</p>
        ) : null}
        {plan.length > 0 ? (
          <PlanWeek
            plan={plan}
            todayIso={todayIso}
            completions={state.completions}
            preview={Boolean(preview)}
            onOpen={open}
          />
        ) : null}
        {showNext ? (
          <NextWeekRow allowed={nextAllowed} from={nextFrom} onOpen={() => setNextOpen(true)} />
        ) : null}
      </div>
      {nextOpen && nextAllowed && state.profile ? (
        <NextWeekSheet
          profile={state.profile}
          from={todayIso}
          currentMinutes={savedBudget}
          onPrepare={prepareNextWeek}
          onClose={() => setNextOpen(false)}
        />
      ) : null}
      {state.profile ? (
        <PlanSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}>
          <section className="bw-plan-card bw-plan-status" aria-label="Stan planu">
            <div className="bw-plan-status-row">
              <p role="status">{preview?.result ? "Podgląd nowego planu" : statusTitle}</p>
              {!preview?.result && state.plan.length > 0 ? (
                <button type="button" className="bw-plan-link" onClick={startRebuild}>
                  {status.kind === "stale" || runningMessage
                    ? "Zaktualizuj plan"
                    : "Przygotuj kolejny plan"}
                </button>
              ) : null}
            </div>
            {!preview?.result && status.kind === "expired" ? (
              <p>
                Cykl zakończony{status.endDate ? ` · ${plDate(status.endDate, true)}` : ""}. Kolejny
                tydzień przygotujesz po potwierdzeniu daty meczu w karcie „Kolejny tydzień”.
              </p>
            ) : null}
            {!preview?.result && status.kind === "stale" ? (
              <p>
                {status.staleReason === "version"
                  ? "Dostępna jest aktualna wersja silnika. Przygotuj plan ponownie."
                  : "Profil zmienił się. Przygotuj aktualny plan przed rozpoczęciem nowej sesji."}
              </p>
            ) : null}
            {scheduleChanges.length > 0 && (preview?.result || status.kind === "stale") ? (
              <ul className="bw-plan-bullets">
                {scheduleChanges.map((change) => (
                  <li key={change.kind}>{change.line}</li>
                ))}
              </ul>
            ) : null}
            {preview?.result ? (
              <>
                <p>
                  Podgląd dopasowany do Twojego przygotowania siłowego i kalendarza. Zapisz go, aby
                  rozpocząć treningi.
                </p>
                {intervalNote ? <p>{intervalNote}</p> : null}
                {nextDaysDiff.length > 0 ? (
                  <details className="bw-plan-disclosure">
                    <summary>
                      Najbliższe 7 dni · zmiany ({nextDaysDiff.length})
                      <ChevronRight aria-hidden="true" />
                    </summary>
                    {diffList(nextDaysDiff)}
                  </details>
                ) : null}
                {laterDiff.length > 0 ? (
                  <details className="bw-plan-disclosure">
                    <summary>
                      Dalsze tygodnie · zmiany ({laterDiff.length})
                      <ChevronRight aria-hidden="true" />
                    </summary>
                    {diffList(laterDiff)}
                  </details>
                ) : null}
                {state.plan.length > 0 ? (
                  <p className="bw-plan-fine">
                    Nowy plan rozpoczyna się {plDate(todayIso, true)}. Zapisane wykonanie i historia
                    treningów pozostają zachowane.
                  </p>
                ) : null}
              </>
            ) : null}
            {!preview && runningMessage ? (
              <p aria-label="Aktualizacja biegania">{runningMessage}</p>
            ) : null}
          </section>
          {!preview ? <FeedbackAdjustmentCard /> : null}
          <PlanLimitations issues={issues} />
          {preview?.result || !rebuild ? (
            <WeeklyPlanningCoverage
              plan={plan}
              preferences={preview?.result ? weeklyPreferences : savedWeeklyPreferences}
            />
          ) : null}
          <section className="bw-plan-card bw-plan-settings" aria-label="Dopasowanie treningu">
            <h3 className="bw-plan-settings-title">Dopasowanie treningu</h3>
            <label className="bw-plan-select">
              Czas na jednostkę
              <select
                aria-label="Czas na jednostkę"
                value={sessionDurationMode === "full" ? "full" : String(minutes)}
                onChange={(e) => {
                  const mode = e.target.value === "full" ? "full" : "limited";
                  setTimeChoice({
                    ownerId: user?.id,
                    planId,
                    mode,
                    minutes: mode === "limited" ? Number(e.target.value) : savedBudget,
                  });
                  // A new time budget is a proposal: show the preview, save only on request.
                  if (state.plan.length) setRebuild(true);
                }}
              >
                <option value="full">Pełne jednostki · domyślnie</option>
                {[...new Set([30, 45, 60, 75, 90, 120, minutes])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <option key={v} value={v}>
                      {v} minut
                    </option>
                  ))}
              </select>
            </label>
            <WeeklyPlanningSettings
              profile={state.profile}
              value={weeklyPreferences}
              onChange={(value) => {
                setWeeklyChoice({ ownerId: user?.id, planId, value });
                if (state.plan.length) setRebuild(true);
              }}
            />
            <StrengthExperienceSetup />
          </section>
          {state.profile.hasGym && (
            <GymBandSetupPanel
              date={todayIso}
              profile={state.profile ?? undefined}
              onChanged={() => setRebuild(true)}
            />
          )}
        </PlanSettingsPanel>
      ) : null}
    </div>
  );
}

/** A full-screen settings panel in place (no portal), closed with "Gotowe" or Escape. */
function PlanSettingsPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  return (
    // Kept mounted while closed (like an iOS sheet), so unsaved choices survive closing it.
    <div
      className="bw-plan-settings-panel"
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bw-plan-settings-heading"
    >
      <header className="bw-plan-settings-head">
        <h2 id="bw-plan-settings-heading" ref={heading} tabIndex={-1}>
          Ustawienia planu
        </h2>
        <button type="button" className="bw-plan-settings-close" onClick={onClose}>
          <X aria-hidden="true" />
          Gotowe
        </button>
      </header>
      <div className="bw-plan-settings-body">{children}</div>
    </div>
  );
}
