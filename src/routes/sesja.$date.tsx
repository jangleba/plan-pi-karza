import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import { applyExerciseReplacements, useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { useInstantBack, useDelayedFlag } from "@/lib/loadwise/uiHooks";
import { resolveEffectiveDay } from "@/lib/loadwise/dailyCheckin";
import { repairRuntimeSpeedDay } from "@/lib/loadwise/runtimeSpeedRepair";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import { ModifySheet } from "@/components/loadwise/ModifySheet";
import { Button } from "@/components/ui/button";
import type { SessionDay, TrainingSection } from "@/lib/loadwise/types";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import { ArrowRight, Plus, Repeat, Undo2 } from "lucide-react";
import { EnduranceRunTracker } from "@/components/running/EnduranceRunTracker";
import { isTrackableEnduranceRun } from "@/lib/running/session";
import { isBallTechnicalSession, isStrengthSession } from "@/lib/loadwise/sessionClassification";
import { resolveTrainingDecisionMode } from "@/lib/loadwise/trainingDecisionGate";
import { readDailyPlanCheckin } from "@/lib/loadwise/dailyPlanCheckin";
import {
  canShowPostSessionForm,
  matchCanBeCompleted,
  shortDecisionNote,
} from "@/lib/loadwise/sessionPresentation";
import { isSprintRunnerSession } from "@/lib/loadwise/sprintPresentation";
import { StructuredSections } from "@/components/loadwise/session/GenericRunner";
import { SprintStructuredSections } from "@/components/loadwise/session/SprintRunner";
import { StrengthStructuredSections } from "@/components/loadwise/session/StrengthRunner";
import {
  ClubMonitoring,
  CompletionPanel,
  MatchStartPanel,
} from "@/components/loadwise/session/SessionCompletion";
import {
  DecisionLogic,
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
  const [showSprintCompletion, setShowSprintCompletion] = useState(false);
  const [showStrengthCompletion, setShowStrengthCompletion] = useState(false);
  const [dailyCheckinLoaded, setDailyCheckinLoaded] = useState(false);
  const [hasDailyCheckin, setHasDailyCheckin] = useState(false);
  const goBack = useInstantBack("/plan");
  useEffect(() => {
    setShowSprintCompletion(false);
    setShowStrengthCompletion(false);
  }, [date, slot, mod]);
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth", replace: true });
  }, [authLoading, user, navigate]);
  useEffect(() => {
    if (!user) {
      setHasDailyCheckin(false);
      setDailyCheckinLoaded(false);
      return;
    }
    setHasDailyCheckin(Boolean(readDailyPlanCheckin(user.id, todayIso)));
    setDailyCheckinLoaded(true);
  }, [todayIso, user]);

  const day = state.plan.find((p) => p.date === date);
  // Dane jeszcze się ładują (np. po odświeżeniu / deep link) — nie pokazuj
  // pustego białego ekranu. Skeleton w tym samym layoucie, z krótkim delay.
  const stillLoading =
    !hydrated ||
    (!day && !state.profile) ||
    (date === todayIso && Boolean(user) && !dailyCheckinLoaded);
  const showSkeleton = useDelayedFlag(stillLoading);

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

  if (!day || !state.profile) {
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
  const decisionMode = resolveTrainingDecisionMode({
    isToday,
    hasTodayCheckin: hasDailyCheckin,
  });

  if (decisionMode === "checkin_required") {
    return (
      <SessionScreenShell onBack={goBack}>
        <div className="soft-card p-5 text-center">
          <h1 className="text-xl font-semibold text-foreground">Najpierw check-in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Potwierdź plan albo wybierz jedną zmianę. Nie pytamy o zdrowie ani samopoczucie.
          </p>
          <Button className="mt-4 w-full" onClick={() => navigate({ to: "/start" })}>
            Przejdź do check-inu
          </Button>
        </div>
      </SessionScreenShell>
    );
  }

  const mods = state.modifications[date] ?? [];
  const swapMod = mods.find((m) => m.type === "swap");
  const addMods = mods.filter((m) => m.type === "add");
  const selectedAdd = addMods.find((item) => item.id === mod) ?? null;

  // Sesja główna: zamieniona (jeśli jest) lub zaplanowana.
  const effectiveDay = resolveEffectiveDay(day, undefined, state.profile, mods);
  // Ostatnia bariera przed runnerem: ekran nie zależy od powodzenia zapisu
  // migracji i nigdy nie dostaje historycznie uciętego slotu sprintowego.
  const primary = repairRuntimeSpeedDay(effectiveDay, state.profile, {
    today: todayIso,
    completions: state.completions,
    modifications: state.modifications,
    plan: state.plan,
  });

  let session: SessionDay = selectedAdd?.session ?? primary;
  if (!selectedAdd && slot === 2) {
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
  const displayedSession = applyExerciseReplacements(
    session,
    state.exerciseReplacements[date] ?? [],
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
  const sprintRunner = isSprintRunnerSession(session) && structured.length > 0;
  const strengthRunner = isStrengthSession(session) && structured.length > 0;
  const trackableEndurance = isTrackableEnduranceRun(session) && Boolean(session.dbId);
  const ballTechnicalSession = isBallTechnicalSession(session);

  async function undo(dateToUndo: string, id: string) {
    try {
      await undoModification(dateToUndo, id);
      toast.success("Zmiana została cofnięta.");
    } catch {
      toast.error("Nie udało się cofnąć zmiany.");
    }
  }

  return (
    <div className="app-shell min-h-screen pb-[140px]">
      <SessionHeader
        session={session}
        strengthRunner={strengthRunner}
        isToday={isToday}
        onBack={goBack}
      />

      <div className="mt-5 space-y-3 px-5">
        {/* Sesje dnia — przełącznik gdy są dwie */}
        <SessionSlotSwitcher
          primary={primary}
          slot={slot}
          onSelect={(nextSlot) =>
            router.navigate({ to: "/sesja/$date", params: { date }, search: { slot: nextSlot } })
          }
        />

        {/* Krótki komunikat decyzji — max 1 zdanie */}
        {shortNote && (
          <div className="soft-card bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
            {shortNote}
          </div>
        )}
        {state.equipmentNotice && (
          <div className="soft-card px-4 py-3 text-sm text-muted-foreground">
            {state.equipmentNotice}
          </div>
        )}

        {ballTechnicalSession && (
          <Link
            to="/reakcja"
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

        {trackableEndurance && session.dbId && (
          <EnduranceRunTracker
            session={session}
            sessionId={session.dbId}
            date={session.date}
            canRecord={isToday}
            activity={state.runningActivities[session.dbId] ?? null}
            onSave={saveRunningActivity}
            onDelete={deleteRunningActivity}
          />
        )}

        {isClub ? (
          <>
            <ClubMonitoring />
            {structured.length > 0 && (
              <StructuredSections sections={structured} date={date} sessionId={session.dbId} />
            )}
          </>
        ) : sprintRunner ? (
          <SprintStructuredSections
            sections={structured}
            date={date}
            session={session}
            onFinish={() => setShowSprintCompletion(true)}
          />
        ) : strengthRunner ? (
          <StrengthStructuredSections
            sections={structured}
            date={date}
            sessionId={session.dbId}
            onFinish={() => setShowStrengthCompletion(true)}
          />
        ) : (
          <>
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Do wykonania
            </div>
            <StructuredSections sections={structured} date={date} sessionId={session.dbId} />
          </>
        )}

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

        {session.dayType === "match" && <MatchStartPanel session={session} isToday={isToday} />}

        {canShowPostSessionForm(session) &&
          matchCanBeCompleted(
            session,
            session.dbId ? state.completions[session.dbId]?.status : undefined,
          ) &&
          (session.classification?.subcategory !== "field_mas_test" ||
            Boolean(session.dbId && state.runningActivities[session.dbId])) &&
          (!sprintRunner || showSprintCompletion) &&
          (!strengthRunner || showStrengthCompletion) && <CompletionPanel session={session} />}

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
              <StructuredSections sections={flatToStructured(m.session.sections)} date={date} />
            </div>
          ))}

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

        {/* Logika decyzji — schowana, domyślnie zamknięta */}
        <DecisionLogic session={session} />
      </div>

      <ModifySheet open={modifyOpen} onOpenChange={setModifyOpen} date={date} />
    </div>
  );
}
