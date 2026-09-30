import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { resolveEffectiveDay } from "@/lib/loadwise/dailyCheckin";
import {
  buildLighterSession,
  buildUnavailableSession,
  promoteSecondSession,
  readDailyPlanCheckin,
  saveDailyPlanCheckin,
  withoutSecondSession,
  type DailyPlanCheckin,
  type DailyPlanCheckinAction,
  type SecondSessionCheckinAction,
} from "@/lib/loadwise/dailyPlanCheckin";
import { resolveTrainingDecisionMode } from "@/lib/loadwise/trainingDecisionGate";
import { Button } from "@/components/ui/button";
import { ActionRow } from "@/components/ui/app-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModifySheet, type ModificationChoice } from "@/components/loadwise/ModifySheet";
import { ProfileAvatar } from "@/components/loadwise/ui";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import type { Proposal } from "@/lib/loadwise/modifications";
import type { SessionDay } from "@/lib/loadwise/types";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { decideRemovedSession, moveSessionToDay } from "@/lib/loadwise/planDecisionEngine";

export const Route = createFileRoute("/_tabs/start")({
  component: StartScreen,
});

type CheckinStep = "confirm" | "change";

function DailyPlanCheckinDialog({
  open,
  onOpenChange,
  hasTraining,
  canAddSession,
  saving,
  onAction,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  hasTraining: boolean;
  canAddSession: boolean;
  saving: boolean;
  onAction: (action: DailyPlanCheckinAction) => void;
}) {
  const [step, setStep] = useState<CheckinStep>("change");
  useEffect(() => {
    if (open) setStep("change");
  }, [open]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setStep("confirm");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm" ? "Czy dzisiejszy plan jest aktualny?" : "Co chcesz zmienić?"}
          </DialogTitle>
          <DialogDescription>
            {step === "confirm"
              ? "Potwierdź plan lub wybierz zmianę."
              : "Nie musisz podawać powodu."}
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="space-y-2 pt-2">
            <Button className="h-12 w-full" disabled={saving} onClick={() => onAction("keep")}>
              Tak — pokaż decyzję
            </Button>
            <Button
              className="h-12 w-full"
              variant="outline"
              disabled={saving}
              onClick={() => setStep("change")}
            >
              Chcę coś zmienić
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {hasTraining && (
              <CheckinOption label="Lżej" disabled={saving} onClick={() => onAction("lighter")} />
            )}
            <CheckinOption
              label="Zamień sesję"
              disabled={saving}
              onClick={() => onAction("swap")}
            />
            {canAddSession && (
              <CheckinOption
                label="Dodaj sesję"
                disabled={saving}
                onClick={() => onAction("add")}
              />
            )}
            <CheckinOption
              label="Zmień tydzień"
              disabled={saving}
              onClick={() => onAction("week_change")}
            />
            {hasTraining && (
              <CheckinOption
                label="Pomiń trening"
                disabled={saving}
                onClick={() => onAction("unavailable")}
              />
            )}
            <Button
              className="mt-2 w-full"
              variant="ghost"
              disabled={saving}
              onClick={() => setStep("confirm")}
            >
              Wróć
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SecondCheckinStep = "confirm" | "change";

function SecondSessionCheckinDialog({
  open,
  onOpenChange,
  saving,
  onAction,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  saving: boolean;
  onAction: (action: SecondSessionCheckinAction) => void;
}) {
  const [step, setStep] = useState<SecondCheckinStep>("confirm");

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setStep("confirm");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm" ? "Druga sesja" : "Co zmienić w drugiej sesji?"}
          </DialogTitle>
          <DialogDescription>Druga sesja jest opcjonalna.</DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="space-y-2 pt-2">
            <Button className="h-12 w-full" disabled={saving} onClick={() => onAction("keep")}>
              Zostaw drugą sesję
            </Button>
            <Button
              className="h-12 w-full"
              variant="outline"
              disabled={saving}
              onClick={() => setStep("change")}
            >
              Chcę coś zmienić
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={saving}
              onClick={() => onAction("remove")}
            >
              Usuń drugi trening
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <CheckinOption
              label="Druga sesja lżej"
              disabled={saving}
              onClick={() => onAction("lighter")}
            />
            <CheckinOption
              label="Zamień drugą sesję"
              disabled={saving}
              onClick={() => onAction("swap")}
            />
            <CheckinOption
              label="Nie mogę wykonać drugiej sesji"
              disabled={saving}
              onClick={() => onAction("remove")}
            />
            <Button
              className="mt-2 w-full"
              variant="ghost"
              disabled={saving}
              onClick={() => setStep("confirm")}
            >
              Wróć
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckinOption({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-base font-medium disabled:opacity-50"
    >
      {label}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function decisionCopy(checkin: DailyPlanCheckin | null, session: SessionDay) {
  if (!checkin) {
    return {
      eyebrow: "Codzienny check-in",
      title: "Potwierdź dzisiejszy plan",
      description: "Jedno pytanie. Bez danych o zdrowiu i samopoczuciu.",
    };
  }

  if (session.isUnavailable || session.dayType === "rest") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Dziś bez treningu",
      description: "Nie nadrabiamy pominiętej jednostki na siłę tego samego dnia.",
    };
  }

  if (checkin.primaryAction === "unavailable") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Zostaje tylko druga sesja",
      description:
        checkin.secondAction === "lighter"
          ? "Pierwsza sesja została usunięta, a druga jest lżejsza."
          : checkin.secondAction === "swap"
            ? "Pierwsza sesja została usunięta, a druga zamieniona."
            : "Pierwsza sesja została usunięta. Druga pozostaje w planie.",
    };
  }

  if (checkin.secondAction === "remove") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Druga sesja usunięta",
      description:
        checkin.primaryAction === "lighter"
          ? "Pierwsza sesja pozostaje w lżejszej wersji."
          : "Wykonujesz dziś tylko pierwszą sesję.",
    };
  }

  if (checkin.secondAction === "lighter") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Druga sesja jest lżejsza",
      description:
        checkin.primaryAction === "lighter"
          ? "Obie sesje mają osobno zmniejszone obciążenie."
          : "Pierwsza sesja pozostaje zgodna z Twoim wyborem.",
    };
  }

  if (checkin.secondAction === "swap") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Druga sesja została zamieniona",
      description: "Pierwsza sesja pozostaje zgodna z Twoim wyborem.",
    };
  }

  if (checkin.primaryAction === "lighter") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Pierwsza sesja jest lżejsza",
      description:
        checkin.secondAction === "keep" ? "Druga sesja pozostaje bez zmian." : session.whyToday,
    };
  }
  if (checkin.primaryAction === "swap") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Pierwsza sesja została zamieniona",
      description:
        checkin.secondAction === "keep" ? "Druga sesja pozostaje bez zmian." : session.whyToday,
    };
  }
  if (checkin.primaryAction === "add") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Dodatkowa sesja została dodana",
      description: "Plan dnia uwzględnia wybraną dodatkową jednostkę.",
    };
  }
  if (checkin.primaryAction === "week_change") {
    return {
      eyebrow: "Zmiana tygodnia",
      title: "Sprawdź zaktualizowany plan",
      description: "Plan wykorzysta zapisany kalendarz i dostępność.",
    };
  }
  return {
    eyebrow: "Decyzja BallWise",
    title: "Plan bez zmian",
    description:
      checkin.secondAction === "keep"
        ? "Obie sesje pozostają bez zmian."
        : session.whyToday || "Możesz przejść do zaplanowanej jednostki.",
  };
}

function PlanLoadingState() {
  return (
    <section
      className="bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]"
      aria-busy="true"
    >
      <header className="flex items-center justify-between">
        <h1 className="bw-page-title">Start</h1>
        <ProfileAvatar />
      </header>
      <section className="bw-section mt-8 grid max-w-xl gap-4">
        <div className="h-5 w-48 animate-pulse rounded-md bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded-md bg-secondary" />
        <div className="h-4 w-3/4 animate-pulse rounded-md bg-secondary" />
        <p className="pt-2 text-sm text-muted-foreground">Przygotowujemy Twój tydzień…</p>
      </section>
    </section>
  );
}

function StartScreen() {
  const { user } = useAuth();
  const {
    state,
    todaySession,
    todayIso,
    hydrated,
    planGenerating,
    refreshPlanIfNeeded,
    applyModification,
  } = useLoadwise();
  const profile = state.profile;
  const navigate = useNavigate();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [secondCheckinOpen, setSecondCheckinOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<"primary" | "second" | null>(null);
  const [modifyChoice, setModifyChoice] = useState<ModificationChoice | null>(null);
  const [pendingPrimaryAction, setPendingPrimaryAction] = useState<DailyPlanCheckinAction | null>(
    null,
  );
  const [checkin, setCheckin] = useState<DailyPlanCheckin | null>(null);
  const [checkinLoaded, setCheckinLoaded] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [pendingRescue, setPendingRescue] = useState<{
    removed: SessionDay;
    recommended: SessionDay;
    alternative: SessionDay;
  } | null>(null);
  const autoGenerateRef = useRef(false);
  const [autoGenerateTried, setAutoGenerateTried] = useState(false);
  useActivityExitGuard({ dirty: false, busy: savingAction });

  const planMissing = hydrated && Boolean(profile?.onboardingComplete) && !todaySession;

  useEffect(() => {
    if (!user) {
      setCheckin(null);
      setCheckinLoaded(false);
      return;
    }
    setCheckin(readDailyPlanCheckin(user.id, todayIso));
    setCheckinLoaded(true);
  }, [todayIso, user]);

  useEffect(() => {
    if (!planMissing || planGenerating || autoGenerateRef.current) return;
    autoGenerateRef.current = true;
    setAutoGenerateTried(true);
    refreshPlanIfNeeded();
  }, [planMissing, planGenerating, refreshPlanIfNeeded]);

  useEffect(() => {
    if (todaySession) {
      autoGenerateRef.current = false;
      setAutoGenerateTried(false);
    }
  }, [todaySession]);

  if (!hydrated || !checkinLoaded || (planGenerating && !todaySession)) {
    return <PlanLoadingState />;
  }

  if (!profile?.onboardingComplete) {
    return (
      <div className="bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] text-sm text-muted-foreground">
        Dokończ konfigurację profilu, aby otrzymać plan tygodnia.
      </div>
    );
  }

  if (!todaySession || !profile || !user) {
    if (!autoGenerateTried) return <PlanLoadingState />;
    return (
      <div className="bw-page-content space-y-4 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-sm text-muted-foreground">
          Nie udało się przygotować dzisiejszej jednostki. Spróbuj ponownie.
        </p>
        <Button
          onClick={() => {
            autoGenerateRef.current = false;
            setAutoGenerateTried(false);
          }}
        >
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  const session = todaySession;
  const userId = user.id;
  const activeProfile = profile;
  const adjusted = resolveEffectiveDay(
    session,
    undefined,
    profile,
    state.modifications[todayIso] ?? [],
  );
  const decisionMode = resolveTrainingDecisionMode({
    isToday: true,
    hasTodayCheckin: Boolean(checkin),
  });
  const copy = decisionCopy(checkin, adjusted);
  const hasTraining = !adjusted.isUnavailable && adjusted.dayType !== "rest";
  const hasPlannedSecond = Boolean(adjusted.secondSession);

  function completeCheckin(
    primaryAction: DailyPlanCheckinAction,
    secondAction: SecondSessionCheckinAction | null,
  ) {
    const record = saveDailyPlanCheckin(userId, todayIso, primaryAction, secondAction);
    setCheckin(record);
    setCheckinOpen(false);
    setSecondCheckinOpen(false);
    setPendingPrimaryAction(null);
  }

  function continueAfterPrimary(action: DailyPlanCheckinAction) {
    setPendingPrimaryAction(action);
    setCheckinOpen(false);
    if (hasPlannedSecond) {
      setSecondCheckinOpen(true);
    } else {
      completeCheckin(action, null);
    }
  }

  async function handleRemovedStimulus(removed: SessionDay) {
    const decision = decideRemovedSession({
      effectivePlan: resolveEffectivePlan(state.plan, state.modifications),
      removed,
      todayIso,
      profile: activeProfile,
    });
    if (decision.action === "already_covered" || decision.action === "drop") {
      toast.info(decision.reason);
      return;
    }
    if (decision.action === "ask") {
      setPendingRescue({
        removed,
        recommended: decision.recommended,
        alternative: decision.alternative,
      });
      return;
    }
    if (decision.action !== "move") return;
    await applyModification(
      decision.target.date,
      "swap",
      moveSessionToDay(removed, decision.target),
      decision.target,
      `[engine:auto-move] ${decision.reason}`,
    );
    toast.success(`Sesja przeniesiona na ${decision.target.dayName}.`);
  }

  async function applyRescueTarget(target: SessionDay) {
    if (!pendingRescue || savingAction) return;
    setSavingAction(true);
    try {
      await applyModification(
        target.date,
        "swap",
        moveSessionToDay(pendingRescue.removed, target),
        target,
        "[engine:athlete-choice] Przeniesiono brakujący bodziec po jednej decyzji zawodnika.",
      );
      setPendingRescue(null);
      toast.success(`Sesja przeniesiona na ${target.dayName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się przenieść sesji.");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleCheckinAction(action: DailyPlanCheckinAction) {
    if (savingAction) return;

    if (action === "swap" || action === "add") {
      setCheckinOpen(false);
      setPendingPrimaryAction(action);
      setModifyTarget("primary");
      setModifyChoice(action);
      setModifyOpen(true);
      return;
    }

    if (action === "week_change") {
      completeCheckin(action, null);
      void navigate({ to: "/onboarding", search: { edit: true } });
      return;
    }

    setSavingAction(true);
    try {
      if (action === "lighter") {
        const lighter = buildLighterSession(adjusted);
        await applyModification(
          todayIso,
          "swap",
          lighter,
          adjusted,
          "[daily-checkin:lighter] Zawodnik wybrał lżejszy wariant.",
        );
      } else if (action === "unavailable" && !hasPlannedSecond) {
        const unavailable = buildUnavailableSession(adjusted);
        await applyModification(
          todayIso,
          "swap",
          unavailable,
          adjusted,
          "[daily-checkin:unavailable] Dzisiejsza sesja jest niedostępna.",
        );
        await handleRemovedStimulus(adjusted);
      }
      continueAfterPrimary(action);
      toast.success(
        action === "keep" && !hasPlannedSecond
          ? "Plan potwierdzony."
          : hasPlannedSecond
            ? "Pierwsza decyzja zapisana."
            : "Plan został zaktualizowany.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zmienić planu.");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleSecondSessionAction(action: SecondSessionCheckinAction) {
    if (savingAction || !pendingPrimaryAction) return;

    if (action === "swap") {
      setSecondCheckinOpen(false);
      setModifyTarget("second");
      setModifyChoice("swap");
      setModifyOpen(true);
      return;
    }

    const secondSession = adjusted.secondSession;
    if (!secondSession && action !== "remove") return;

    setSavingAction(true);
    try {
      if (pendingPrimaryAction === "unavailable") {
        const replacement =
          action === "remove"
            ? buildUnavailableSession(adjusted)
            : promoteSecondSession(
                adjusted,
                action === "lighter" && secondSession
                  ? buildLighterSession(secondSession)
                  : secondSession,
              );
        await applyModification(
          todayIso,
          "swap",
          replacement,
          adjusted,
          action === "remove"
            ? "[daily-checkin:both-unavailable] Obie sesje zostały usunięte."
            : `[daily-checkin:promote-second-${action}] Pozostaje tylko druga sesja.`,
        );
        await handleRemovedStimulus(adjusted);
      } else if (action === "remove") {
        await applyModification(
          todayIso,
          "swap",
          withoutSecondSession(adjusted),
          adjusted,
          "[daily-checkin:remove-second] Druga sesja została usunięta.",
        );
        if (secondSession) await handleRemovedStimulus(secondSession);
      } else if (action === "lighter" && secondSession) {
        await applyModification(
          todayIso,
          "swap",
          withoutSecondSession(adjusted),
          adjusted,
          "[daily-checkin:replace-second] Aktualizacja drugiej sesji.",
        );
        await applyModification(
          todayIso,
          "add",
          {
            ...buildLighterSession(secondSession),
            slotLabel: "Sesja 2",
            secondSession: null,
          },
          null,
          "[daily-checkin:second-lighter] Druga sesja w lżejszej wersji.",
        );
      }

      completeCheckin(pendingPrimaryAction, action);
      toast.success(
        action === "keep" ? "Plan obu sesji potwierdzony." : "Druga sesja została zaktualizowana.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zmienić planu.");
    } finally {
      setSavingAction(false);
    }
  }

  async function applySelectedProposal(proposal: Proposal, choice: ModificationChoice) {
    if (modifyTarget === "second") {
      const selectedSecond: SessionDay = {
        ...proposal.session,
        date: adjusted.date,
        dayName: adjusted.dayName,
        dayOfWeek: adjusted.dayOfWeek,
        mdRelation: adjusted.mdRelation,
        mdLabel: adjusted.mdLabel,
        slotLabel: pendingPrimaryAction === "unavailable" ? null : "Sesja 2",
        secondSession: null,
      };

      if (pendingPrimaryAction === "unavailable") {
        await applyModification(
          todayIso,
          "swap",
          promoteSecondSession(adjusted, selectedSecond),
          adjusted,
          "[daily-checkin:promote-second-swap] Pozostaje zamieniona druga sesja.",
        );
      } else {
        await applyModification(
          todayIso,
          "swap",
          withoutSecondSession(adjusted),
          adjusted,
          "[daily-checkin:replace-second] Aktualizacja drugiej sesji.",
        );
        await applyModification(
          todayIso,
          "add",
          selectedSecond,
          null,
          `[daily-checkin:second-swap] ${proposal.reason}`,
        );
      }
      return;
    }

    if (choice === "add") {
      await applyModification(
        todayIso,
        "add",
        proposal.session,
        null,
        `[daily-checkin:add] ${proposal.reason}`,
      );
      return;
    }

    const replacement: SessionDay = {
      ...proposal.session,
      date: adjusted.date,
      dayName: adjusted.dayName,
      dayOfWeek: adjusted.dayOfWeek,
      dayDbId: adjusted.dayDbId,
      mdRelation: adjusted.mdRelation,
      mdLabel: adjusted.mdLabel,
      slotLabel: adjusted.secondSession ? "Sesja 1" : null,
      secondSession: adjusted.secondSession,
    };
    await applyModification(
      todayIso,
      "swap",
      replacement,
      adjusted,
      `[daily-checkin:swap] ${proposal.reason}`,
    );
  }

  const checkinComplete = decisionMode !== "checkin_required";

  return (
    <>
      <section className="bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-4">
          <h1 className="bw-page-title">Start</h1>
          <ProfileAvatar />
        </header>

        <div className="bw-columns mt-8">
          <section className="bw-section" aria-labelledby="start-checkin-title">
            <h2 id="start-checkin-title" className="text-xl font-semibold">
              {checkinComplete ? copy.title : "Czy dzisiejszy plan jest aktualny?"}
            </h2>
            {checkinComplete && (
              <div className="mt-4 space-y-4">
                {[adjusted, ...(adjusted.secondSession ? [adjusted.secondSession] : [])].map(
                  (selected, index) => (
                    <div key={index}>
                      <h3 className="text-lg font-semibold">
                        {professionalSessionTitle(selected.title)}
                      </h3>
                      {selected.durationMin > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {adjusted.secondSession ? `Sesja ${index + 1} · ` : ""}
                          {selected.durationMin} min · Intensywność {selected.intensity}
                        </p>
                      )}
                    </div>
                  ),
                )}
                {!hasTraining && (
                  <p className="text-sm text-muted-foreground">{copy.description}</p>
                )}
              </div>
            )}
            {!checkinComplete && (
              <p className="mt-3 text-sm text-muted-foreground">
                Potwierdzenie planu nie wymaga danych o zdrowiu.
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {checkinComplete ? (
                <>
                  <Button
                    onClick={() =>
                      navigate(
                        hasTraining
                          ? { to: "/sesja/$date", params: { date: todayIso }, search: { slot: 1 } }
                          : { to: "/plan" },
                      )
                    }
                  >
                    {hasTraining ? "Otwórz trening" : "Zobacz plan"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={savingAction}
                    onClick={() => setCheckinOpen(true)}
                  >
                    Zmień plan
                  </Button>
                </>
              ) : (
                <>
                  <Button disabled={savingAction} onClick={() => void handleCheckinAction("keep")}>
                    Potwierdź plan
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={savingAction}
                    onClick={() => setCheckinOpen(true)}
                  >
                    Zmień plan
                  </Button>
                </>
              )}
            </div>
          </section>

          <section className="bw-section" aria-labelledby="start-tools-title">
            <h2 id="start-tools-title" className="text-lg font-semibold">
              Narzędzia
            </h2>
            <div className="mt-4 grid gap-2">
              {[
                { to: "/plan" as const, label: "Plan tygodnia" },
                { to: "/lab" as const, label: "Testy i pomiary" },
                { to: "/reakcja" as const, label: "Trener reakcji" },
              ].map((item) => (
                <ActionRow
                  key={item.to}
                  title={item.label}
                  onClick={() => navigate({ to: item.to })}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
      <DailyPlanCheckinDialog
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        hasTraining={hasTraining}
        canAddSession={!hasPlannedSecond}
        saving={savingAction}
        onAction={(action) => void handleCheckinAction(action)}
      />

      <SecondSessionCheckinDialog
        open={secondCheckinOpen}
        onOpenChange={setSecondCheckinOpen}
        saving={savingAction}
        onAction={(action) => void handleSecondSessionAction(action)}
      />

      <ModifySheet
        open={modifyOpen}
        onOpenChange={setModifyOpen}
        date={todayIso}
        initialChoice={modifyChoice ?? undefined}
        context={modifyTarget === "second" ? "second" : "primary"}
        onSelectProposal={applySelectedProposal}
        onApplied={(choice) => {
          if (modifyTarget === "second" && pendingPrimaryAction) {
            completeCheckin(pendingPrimaryAction, "swap");
          } else if (choice === "add") {
            completeCheckin("add", null);
          } else {
            continueAfterPrimary("swap");
          }
          setModifyChoice(null);
          setModifyTarget(null);
        }}
      />

      <Dialog
        open={Boolean(pendingRescue)}
        onOpenChange={(open) => {
          if (!open) setPendingRescue(null);
        }}
      >
        <DialogContent className="border-border/70 bg-popover">
          <DialogHeader>
            <DialogTitle>Gdzie przenieść brakujący bodziec?</DialogTitle>
            <DialogDescription>
              Dwa terminy są podobnie bezpieczne. Polecamy wcześniejszy.
            </DialogDescription>
          </DialogHeader>
          {pendingRescue && (
            <div className="grid gap-2">
              <Button
                disabled={savingAction}
                onClick={() => void applyRescueTarget(pendingRescue.recommended)}
              >
                {pendingRescue.recommended.dayName} — polecane
              </Button>
              <Button
                variant="outline"
                disabled={savingAction}
                onClick={() => void applyRescueTarget(pendingRescue.alternative)}
              >
                {pendingRescue.alternative.dayName}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={savingAction}
                onClick={() => setPendingRescue(null)}
                className="text-muted-foreground"
              >
                Nie nadrabiaj
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
