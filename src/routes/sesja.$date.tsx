import { FocusedSessionRunner } from "@/components/loadwise/session/FocusedSessionRunner";
import { RunClock } from "@/components/running/RunClock";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import "@/components/loadwise/session/session-focus.css";
import { TrainingMethodPanel } from "@/components/loadwise/session/TrainingMethodPanel";
import { MethodExecutionCoach } from "@/components/loadwise/session/MethodExecutionCoach";
import { hasCurrentMethodRecipe } from "@/lib/loadwise/methods/planner";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import { applyExerciseReplacements, useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { useInstantBack, useDelayedFlag } from "@/lib/loadwise/uiHooks";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { activeSessionForRoute, isActiveSessionWithinGrace } from "@/lib/loadwise/activeSession";
import { repairRuntimeSpeedDay } from "@/lib/loadwise/runtimeSpeedRepair";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import { ModifySheet } from "@/components/loadwise/ModifySheet";
import { Button } from "@/components/ui/button";
import type { SessionDay, TrainingSection } from "@/lib/loadwise/types";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import { ArrowRight, Plus, Repeat, Undo2 } from "lucide-react";
import { EnduranceRunTracker } from "@/components/running/EnduranceRunTracker";
import { isTrackableEnduranceRun, normalizeRunningPreparation } from "@/lib/running/session";
import { isBallTechnicalSession, isStrengthSession } from "@/lib/loadwise/sessionClassification";
import {
  canShowPostSessionForm,
  matchCanBeCompleted,
  shortDecisionNote,
} from "@/lib/loadwise/sessionPresentation";
import { isSprintRunnerSession } from "@/lib/loadwise/sprintPresentation";
import { enforceStrengthEligibility } from "@/lib/loadwise/strengthEligibility";
import { enforceSprintOnlyContent } from "@/lib/loadwise/sprintContentPolicy";
import { StrengthExperienceSetup } from "@/components/loadwise/session/StrengthExperienceSetup";
import { RecoveryCoach, WarmupCoach } from "@/components/loadwise/preparation/PreparationGuide";
import {
  canGuideRecoverySession,
  recoveryContextForSession,
} from "@/lib/loadwise/preparation/protocols";
import { SessionStartPanel } from "@/components/loadwise/session/SessionStartPanel";
import {
  ClubMonitoring,
  CompletionPanel,
  MatchStartPanel,
} from "@/components/loadwise/session/SessionCompletion";
import {
  SessionHeader,
  SessionScreenShell,
  SessionSkeleton,
  SessionSlotSwitcher,
} from "@/components/loadwise/session/SessionChrome";

const searchSchema = (search: Record<string, unknown>): { slot: number; mod?: string } => ({
  slot: Number(search.slot) === 2 ? 2 : 1,
  mod: typeof search.mod === "string" && search.mod ? search.mod : undefined,
});

export const Route = createFileRoute("/sesja/$date")({
  validateSearch: searchSchema,
  component: SessionDetail,
});

function SessionDetail() {
  const { date } = Route.useParams();
  const { slot, mod } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const {
    state,
    hydrated,
    todayIso,
    undoModification,
    undoExerciseReplacement,
    saveRunningActivity,
    deleteRunningActivity,
  } = useLoadwise();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [runMode, setRunMode] = useState<"gps" | "timer">("gps");
  const [runBusy, setRunBusy] = useState(false);
  const [clockDuration, setClockDuration] = useState<number | null>(null);
  const [recoveryDuration, setRecoveryDuration] = useState<number | null>(null);
  const goBack = useInstantBack("/plan");
  useEffect(() => {
    setFinishOpen(false);
    setRunBusy(false);
    setClockDuration(null);
    setRecoveryDuration(null);
  }, [date, slot, mod]);
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth", replace: true });
  }, [authLoading, user, navigate]);

  const resolvedPlan = selectEffectivePlan(state.plan, state.modifications, {
    profile: state.profile,
    readiness: state.readiness,
    completions: state.completions,
  });
  const storedDay = state.plan.find((p) => p.date === date);
  const activeFallback = activeSessionForRoute(
    resolvedPlan,
    state.completions,
    date,
    slot === 2 ? 2 : 1,
    todayIso,
  );
  const day = storedDay ?? activeFallback;
  // Dane jeszcze się ładują (np. po odświeżeniu / deep link) — nie pokazuj
  // pustego białego ekranu. Skeleton w tym samym layoucie, z krótkim delay.
  const stillLoading = !hydrated;
  const showSkeleton = useDelayedFlag(stillLoading);

  const effectiveDay = resolvedPlan.find((item) => item.date === date) ?? day;
  const primary = useMemo(
    () =>
      effectiveDay && state.profile && hydrated
        ? repairRuntimeSpeedDay(effectiveDay, state.profile, {
            today: todayIso,
            completions: state.completions,
            modifications: state.modifications,
            plan: state.plan,
          })
        : null,
    [
      effectiveDay,
      state.profile,
      hydrated,
      todayIso,
      state.completions,
      state.modifications,
      state.plan,
    ],
  );

  if (authLoading || !user) {
    return <AppLaunchScreen />;
  }

  if (stillLoading) {
    return (
      <SessionScreenShell onBack={goBack}>
        {showSkeleton ? <SessionSkeleton /> : null}
      </SessionScreenShell>
    );
  }

  if (!day || !state.profile || !primary) {
    // Dane dotarły, ale sesji nie ma — czytelny stan błędu zamiast wiszącego loadera.
    return (
      <SessionScreenShell onBack={goBack}>
        <div className="soft-card p-5 text-center">
          <p className="text-sm font-medium text-foreground">Nie znaleziono tej sesji.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mogła zostać zmieniona w planie. Wróć do planu tygodnia.
          </p>
          <Button className="mt-4" onClick={goBack}>
            Wróć do planu
          </Button>
        </div>
      </SessionScreenShell>
    );
  }

  const isToday = date === todayIso;
  const mods = state.modifications[date] ?? [];
  const swapMod = mods.find((m) => m.type === "swap");
  const addMods = mods.filter((m) => m.type === "add");
  const selectedAdd = addMods.find((item) => item.id === mod) ?? null;

  let session: SessionDay = selectedAdd
    ? ([primary, primary.secondSession].find((item) => item?.dbId === selectedAdd.session.dbId) ??
      selectedAdd.session)
    : primary;
  if (!selectedAdd && slot === 2 && !(activeFallback && !storedDay)) {
    if (!primary.secondSession) {
      return (
        <SessionScreenShell onBack={goBack}>
          <h1 className="text-xl font-semibold text-foreground">Plan dnia został zaktualizowany</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ten drugi slot nie występuje już w aktualnym planie. Nie oznacza to automatycznie, że
            trening jest za blisko meczu — plan mógł zostać przebudowany po zmianie kalendarza albo
            ocenie gotowości.
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              navigate({
                to: "/sesja/$date",
                params: { date },
                search: { slot: 1 },
              })
            }
          >
            Otwórz aktualną sesję dnia
          </Button>
        </SessionScreenShell>
      );
    }
    session = primary.secondSession;
  }

  const isClub = session.dayType === "club";
  const shortNote = shortDecisionNote(session);

  const hasFlatSectionContent =
    session.sections.warmup.length +
      session.sections.main.length +
      session.sections.accessory.length +
      session.sections.footballTransfer.length +
      session.sections.cooldown.length >
    0;

  const fallbackExercises = hasFlatSectionContent ? [] : (session.exercises ?? []);
  const replacedSession = applyExerciseReplacements(
    session,
    state.exerciseReplacements[date] ?? [],
  );
  const completed = session.dbId && state.completions[session.dbId]?.status === "completed";
  const executionStarted = session.dbId && state.completions[session.dbId]?.status === "started";
  const displayedSession =
    completed || executionStarted
      ? replacedSession
      : normalizeRunningPreparation(
          enforceSprintOnlyContent(enforceStrengthEligibility(replacedSession, state.profile)),
        );

  // Strukturalne sekcje: wygenerowane bloki, inaczej fallback z płaskich danych.
  const structured: TrainingSection[] =
    displayedSession.structuredSections && displayedSession.structuredSections.length
      ? displayedSession.structuredSections
      : hasFlatSectionContent
        ? flatToStructured(displayedSession.sections)
        : fallbackExercises.length
          ? flatToStructured({
              warmup: [],
              main: fallbackExercises,
              accessory: [],
              footballTransfer: [],
              cooldown: [],
            })
          : [];
  const sprintRunner =
    isSprintRunnerSession(session) && structured.length > 0 && !hasCurrentMethodRecipe(session);
  const strengthRunner = isStrengthSession(session) && structured.length > 0;
  const enduranceSession =
    isTrackableEnduranceRun(session) &&
    !["M30", "M31"].includes(session.trainingMethods?.primary ?? "");
  const trackableEndurance = enduranceSession && Boolean(session.dbId);
  const enduranceWarmup = structured
    .filter((s) => s.type === "warmup" || s.type === "prep")
    .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
  const ballTechnicalSession = isBallTechnicalSession(session);
  const recoveryRunner =
    !isClub && !sprintRunner && !strengthRunner && canGuideRecoverySession(session);
  const recoveryContext = recoveryContextForSession(
    session,
    state.plan,
    state.completions,
    state.readiness?.[date]?.fatigue,
  );

  const presentedSession =
    recoveryRunner && recoveryDuration != null
      ? { ...session, durationMin: recoveryDuration }
      : session;
  const completion = session.dbId ? state.completions[session.dbId] : undefined;
  const hasStarted = completion?.status === "started" || !!completion?.completed;
  const canExecute =
    !!completion?.completed ||
    (hasStarted && (isToday || isActiveSessionWithinGrace(session.date, completion, todayIso)));

  async function undo(dateToUndo: string, id: string) {
    try {
      await undoModification(dateToUndo, id);
      toast.success("Zmiana została cofnięta.");
    } catch {
      toast.error("Nie udało się cofnąć zmiany.");
    }
  }

  return (
    <div
      className={`app-shell bw-session-page bw-session-66 min-h-screen pb-[100px] ${sprintRunner ? "bw-sprint-page" : strengthRunner ? "bw-training-page" : ""}`}
    >
      <SessionHeader session={presentedSession} strengthRunner isToday={isToday} onBack={goBack} />
      <div className="bw-session-body space-y-3 px-5">
        {/* Sesje dnia — przełącznik gdy są dwie */}
        <SessionSlotSwitcher
          primary={primary}
          slot={slot}
          onSelect={(nextSlot) =>
            router.navigate({ to: "/sesja/$date", params: { date }, search: { slot: nextSlot } })
          }
        />

        {/* Krótki komunikat decyzji — max 1 zdanie */}
        {shortNote &&
          ((!strengthRunner && !sprintRunner) ||
            session.loadLabelOverride ||
            session.safetyNote) && <div className="bw-session-notice">{shortNote}</div>}
        {state.equipmentNotice && (
          <div className="soft-card px-4 py-3 text-sm text-muted-foreground">
            {state.equipmentNotice}
          </div>
        )}

        <details className="bw-session-settings">
          <summary>Opcje i metoda treningu</summary>
          <div className={strengthRunner ? "bw-strength-session-tools" : undefined}>
            {strengthRunner && !completed && <StrengthExperienceSetup compact />}
            <TrainingMethodPanel
              key={`methods:${session.dbId ?? `${date}:${slot}`}`}
              session={displayedSession}
              wholeDay={primary}
              slot={session.dbId && session.dbId === primary.secondSession?.dbId ? 2 : 1}
              locked={
                !!completed ||
                !!session.executionProtected ||
                hasStarted ||
                !!(
                  selectedAdd &&
                  session.dbId !== primary.dbId &&
                  session.dbId !== primary.secondSession?.dbId
                )
              }
            />
          </div>
        </details>
        {session.dayType === "match" ? (
          <MatchStartPanel session={session} isToday={isToday} />
        ) : (
          <SessionStartPanel session={displayedSession} canStart={isToday} />
        )}

        {/* Teaching remains available in previews; each runner gates its recording controls. */}
        <div className="min-w-0 space-y-3">
          {ballTechnicalSession && (
            <Link
              to="/reakcja"
              aria-disabled={!canExecute}
              tabIndex={canExecute ? 0 : -1}
              onClick={(event) => {
                if (!canExecute) event.preventDefault();
              }}
              className="flex items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
            >
              <div>
                <p className="text-sm font-bold">Uruchom Trenera reakcji</p>
                <p className="mt-0.5 text-xs text-primary-foreground/75">
                  Włącz bodźce w wybranym fragmencie własnego treningu.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          )}

          {!strengthRunner &&
            !enduranceSession &&
            structured
              .flatMap((s) => s.blocks.flatMap((b) => b.exercises))
              .filter((e) => e.methodExecution)
              .map((e) => (
                <MethodExecutionCoach
                  key={e.id}
                  plan={e.methodExecution!}
                  context={`${session.dbId ?? date}:${e.id}`}
                  enabled={canExecute && !completion?.completed}
                />
              ))}
          {ballTechnicalSession && (
            <div className="bw-method-reflection">
              Jedna rzecz na ten blok: spójrz przed przyjęciem. Po próbie nazwij sygnał, który
              zmienił Twój wybór — ustawienie rywala, partnera albo wolną przestrzeń.
            </div>
          )}
          {trackableEndurance &&
            session.dbId &&
            hasStarted &&
            session.loadLabelOverride !== "Wstrzymaj trening" && (
              <>
                {session.classification?.subcategory !== "field_mas_test" && (
                  <div className="bw-run-mode" role="group" aria-label="Sposób pomiaru biegu">
                    <button
                      type="button"
                      disabled={runBusy}
                      aria-pressed={runMode === "gps"}
                      onClick={() => setRunMode("gps")}
                    >
                      Z GPS
                    </button>
                    <button
                      type="button"
                      disabled={runBusy}
                      aria-pressed={runMode === "timer"}
                      onClick={() => setRunMode("timer")}
                    >
                      Bez GPS
                    </button>
                  </div>
                )}
                {runMode === "timer" && session.classification?.subcategory !== "field_mas_test" ? (
                  <RunClock
                    key={`${user.id}:${session.dbId}`}
                    session={session}
                    enabled={canExecute && !completion?.completed}
                    onBusy={setRunBusy}
                    onFinish={(seconds) => {
                      setClockDuration(seconds / 60);
                      setFinishOpen(true);
                    }}
                  />
                ) : (
                  <EnduranceRunTracker
                    key={`${user.id}:${session.dbId}`}
                    ownerId={user.id}
                    session={session}
                    sessionId={session.dbId}
                    date={session.date}
                    canRecord={canExecute && !completion?.completed}
                    activity={state.runningActivities[session.dbId] ?? null}
                    onSave={saveRunningActivity}
                    onDelete={deleteRunningActivity}
                    onRecordingChange={setRunBusy}
                    onFinish={() => setFinishOpen(true)}
                  />
                )}
              </>
            )}
          {enduranceSession && (
            <details className="bw-session-extra">
              <summary>Rozgrzewka i zakończenie</summary>
              {enduranceWarmup.length > 0 && (
                <WarmupCoach
                  key={`${session.dbId ?? date}:warmup`}
                  exercises={enduranceWarmup}
                  kind={
                    /spokojny|easy aerobic|baza tlenowa/i.test(
                      `${session.title} ${session.sessionType}`,
                    )
                      ? "easy"
                      : "intervals"
                  }
                  storageKey={`ballwise:warmup:${user.id}:${session.dbId ?? date}${canExecute ? "" : ":preview"}`}
                />
              )}
              <FocusedSessionRunner
                sections={structured.filter((s) => s.type === "cooldown")}
                sessionId={session.dbId}
                date={date}
                canRecord={canExecute && !completion?.completed}
                onFinish={() => setFinishOpen(true)}
              />
            </details>
          )}
          {session.loadLabelOverride === "Wstrzymaj trening" ? (
            <div className="soft-card p-4" role="alert">
              Wstrzymaj dalszy wysiłek. Zapis wcześniejszej części sesji pozostaje w historii.
            </div>
          ) : isClub ? (
            <>
              <fieldset className="min-w-0" disabled={!canExecute}>
                <ClubMonitoring session={presentedSession} />
              </fieldset>
              {structured.length > 0 && (
                <details className="soft-card px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">Informacje o sesji</summary>
                  <div className="mt-3 space-y-3 text-xs text-muted-foreground">
                    {structured
                      .flatMap((section) => section.blocks.flatMap((block) => block.exercises))
                      .map((exercise) => (
                        <p key={exercise.id}>
                          <strong>{exercise.name}</strong>
                          <br />
                          {exercise.displayPrescription ?? exercise.reps ?? exercise.technique}
                        </p>
                      ))}
                  </div>
                </details>
              )}
            </>
          ) : recoveryRunner ? (
            <fieldset className="min-w-0" disabled={!canExecute}>
              <RecoveryCoach
                key={session.dbId ?? `${date}:${slot}:${mod ?? "primary"}`}
                storageKey={`ballwise:recovery:${user.id}:${session.dbId ?? `${date}:${slot}:${mod ?? "primary"}`}`}
                context={recoveryContext}
                sessionId={session.dbId}
                blocked={session.loadLabelOverride === "Wstrzymaj trening"}
                onDurationChange={setRecoveryDuration}
                onFinish={() => setFinishOpen(true)}
              />
            </fieldset>
          ) : enduranceSession ? null : (
            <FocusedSessionRunner
              sections={structured}
              sessionId={session.dbId}
              date={date}
              kind={strengthRunner ? "strength" : sprintRunner ? "sprint" : "general"}
              canRecord={canExecute && !completion?.completed}
              onFinish={() => setFinishOpen(true)}
            />
          )}
        </div>

        {(state.exerciseReplacements[date] ?? []).length > 0 && (
          <div className="soft-card flex flex-wrap items-center gap-3 p-3 text-xs">
            <span className="text-muted-foreground">
              {(state.exerciseReplacements[date] ?? []).length === 1
                ? "Ćwiczenie zostało zamienione."
                : "Ćwiczenia zostały zamienione."}
            </span>
            {(state.exerciseReplacements[date] ?? []).map((replacement) => (
              <span key={replacement.id} className="inline-flex items-center gap-2">
                <span className="text-muted-foreground">
                  {replacement.original.name} → {replacement.replacement.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void undoExerciseReplacement(date, replacement.id)
                      .then(() => toast.success("Przywrócono poprzednie ćwiczenie."))
                      .catch(() => toast.error("Nie udało się cofnąć zamiennika."));
                  }}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-primary"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Cofnij
                </button>
              </span>
            ))}
          </div>
        )}

        {canShowPostSessionForm(session) &&
          hasStarted &&
          matchCanBeCompleted(session, completion?.status) &&
          (session.classification?.subcategory !== "field_mas_test" ||
            Boolean(session.dbId && state.runningActivities[session.dbId])) && (
            <>
              <button
                type="button"
                className="bw-session-finish-trigger"
                disabled={runBusy}
                onClick={() => setFinishOpen(true)}
              >
                {completion?.completed ? "Edytuj podsumowanie" : "Zakończ trening"}
              </button>
              <Drawer open={finishOpen} onOpenChange={setFinishOpen} initialDetent="large">
                <DrawerContent aria-describedby={undefined}>
                  <DrawerTitle>Podsumowanie treningu</DrawerTitle>
                  <CompletionPanel
                    key={session.dbId}
                    session={clockDuration != null ? { ...presentedSession } : presentedSession}
                    suggestedDurationMin={clockDuration ?? undefined}
                    onSaved={() => {
                      setFinishOpen(false);
                      void navigate({
                        to: "/postep",
                        search: { view: "history", session: session.dbId ?? undefined },
                      });
                    }}
                  />
                </DrawerContent>
              </Drawer>
            </>
          )}

        {/* Status zmiany + cofnij */}
        {swapMod && slot === 1 && !selectedAdd && (
          <div className="soft-card flex items-center justify-between p-3 text-xs">
            <span className="text-muted-foreground">Sesja zamieniona. {swapMod.reason}</span>
            <button
              type="button"
              onClick={() => void undo(date, swapMod.id)}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <Undo2 className="h-3.5 w-3.5" /> Cofnij
            </button>
          </div>
        )}

        {/* Sesje dodane przez zawodnika */}
        {addMods
          .filter((item) => item.id !== selectedAdd?.id)
          .map((m) => (
            <div key={m.id} className="soft-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-primary">
                    Dodana sesja
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {professionalSessionTitle(m.session.title)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.session.durationMin} min · {m.session.intensity}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void undo(date, m.id)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Cofnij
                </button>
              </div>
              <Link
                to="/sesja/$date"
                params={{ date }}
                search={{ slot: 1, mod: m.id }}
                className="bw-session-primary"
              >
                Otwórz dodaną sesję
              </Link>
            </div>
          ))}

        <details className="bw-training-tools">
          <summary>Opcje treningu</summary>
          {/* Dodaj / zamień sesję */}
          {!isClub && session.dayType !== "match" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setModifyOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Dodaj trening
              </Button>
              <Button variant="outline" onClick={() => setModifyOpen(true)}>
                <Repeat className="mr-1 h-4 w-4" /> Zamień sesję
              </Button>
            </div>
          )}
        </details>
      </div>

      <ModifySheet open={modifyOpen} onOpenChange={setModifyOpen} date={date} />
    </div>
  );
}
