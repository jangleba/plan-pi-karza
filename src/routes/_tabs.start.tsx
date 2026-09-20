import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Info } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ModifySheet,
  type ModificationChoice,
} from "@/components/loadwise/ModifySheet";
import { ProfileAvatar } from "@/components/loadwise/ui";
import type { Proposal } from "@/lib/loadwise/modifications";
import type { SessionDay } from "@/lib/loadwise/types";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import {
  decideRemovedSession,
  moveSessionToDay,
} from "@/lib/loadwise/planDecisionEngine";

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
  const [step, setStep] = useState<CheckinStep>("confirm");

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setStep("confirm");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm"
              ? "Czy dzisiejszy plan jest aktualny?"
              : "Co chcesz zmienić?"}
          </DialogTitle>
          <DialogDescription>
            {step === "confirm"
              ? "Jedno potwierdzenie i pokażemy decyzję na dziś."
              : "Wybierz jedną zmianę. Nie musisz podawać powodu."}
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="space-y-2 pt-2">
            <Button
              className="h-12 w-full"
              disabled={saving}
              onClick={() => onAction("keep")}
            >
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
              <CheckinOption
                label="Dzisiaj chcę trenować lżej"
                disabled={saving}
                onClick={() => onAction("lighter")}
              />
            )}
            <CheckinOption
              label="Chcę zamienić dzisiejszą sesję"
              disabled={saving}
              onClick={() => onAction("swap")}
            />
            {canAddSession && (
              <CheckinOption
                label="Chcę dodać sesję"
                disabled={saving}
                onClick={() => onAction("add")}
              />
            )}
            <CheckinOption
              label="Zmienił się mój tydzień"
              disabled={saving}
              onClick={() => onAction("week_change")}
            />
            {hasTraining && (
              <CheckinOption
                label="Nie mogę wykonać dzisiejszego treningu"
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

type SecondCheckinStep = "want" | "confirm" | "change";

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
  const [step, setStep] = useState<SecondCheckinStep>("want");

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setStep("want");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>
            {step === "want"
              ? "Czy chcesz dziś wykonać również drugi trening?"
              : step === "confirm"
                ? "Czy plan drugiej sesji jest aktualny?"
                : "Co zmienić w drugiej sesji?"}
          </DialogTitle>
          <DialogDescription>
            {step === "want"
              ? "Wybierz tylko to, co dotyczy drugiej sesji."
              : step === "confirm"
                ? "Możesz ją zostawić albo zmienić niezależnie od pierwszej."
                : "Jedna zmiana, bez podawania powodu."}
          </DialogDescription>
        </DialogHeader>

        {step === "want" ? (
          <div className="space-y-2 pt-2">
            <Button
              className="h-12 w-full"
              disabled={saving}
              onClick={() => setStep("confirm")}
            >
              Tak
            </Button>
            <Button
              className="h-12 w-full"
              variant="outline"
              disabled={saving}
              onClick={() => onAction("remove")}
            >
              Nie — usuń drugi trening
            </Button>
          </div>
        ) : step === "confirm" ? (
          <div className="space-y-2 pt-2">
            <Button
              className="h-12 w-full"
              disabled={saving}
              onClick={() => onAction("keep")}
            >
              Tak — zostaw bez zmian
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
      className="soft-card flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left text-sm font-medium disabled:opacity-50"
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
      description:
        "Nie nadrabiamy pominiętej jednostki na siłę tego samego dnia.",
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
        checkin.secondAction === "keep"
          ? "Druga sesja pozostaje bez zmian."
          : session.whyToday,
    };
  }
  if (checkin.primaryAction === "swap") {
    return {
      eyebrow: "Plan zaktualizowany",
      title: "Pierwsza sesja została zamieniona",
      description:
        checkin.secondAction === "keep"
          ? "Druga sesja pozostaje bez zmian."
          : session.whyToday,
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
    <main className="px-6 pb-32 pt-6" aria-busy="true">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-medium tracking-[-0.025em]">
          BallWise
        </span>
        <ProfileAvatar />
      </header>
      <section className="mx-auto mt-16 max-w-sm space-y-4">
        <div className="h-4 w-28 animate-pulse rounded-full bg-secondary" />
        <div className="h-40 w-full animate-pulse rounded-2xl bg-secondary" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-secondary" />
        <p className="pt-2 text-center text-sm text-muted-foreground">
          Przygotowujemy Twój tydzień…
        </p>
      </section>
    </main>
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
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<"primary" | "second" | null>(
    null,
  );
  const [modifyChoice, setModifyChoice] = useState<ModificationChoice | null>(
    null,
  );
  const [pendingPrimaryAction, setPendingPrimaryAction] =
    useState<DailyPlanCheckinAction | null>(null);
  const [checkin, setCheckin] = useState<DailyPlanCheckin | null>(null);
  const [checkinLoaded, setCheckinLoaded] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [pendingRescue, setPendingRescue] = useState<{
    removed: SessionDay;
    recommended: SessionDay;
    alternative: SessionDay;
  } | null>(null);
  const autoGenerateRef = useRef(false);
  const openingSessionRef = useRef(false);
  const [autoGenerateTried, setAutoGenerateTried] = useState(false);

  const planMissing =
    hydrated && Boolean(profile?.onboardingComplete) && !todaySession;

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
      <div className="px-6 pt-12 text-sm text-muted-foreground">
        Dokończ konfigurację profilu, aby otrzymać plan tygodnia.
      </div>
    );
  }

  if (!todaySession || !profile || !user) {
    if (!autoGenerateTried) return <PlanLoadingState />;
    return (
      <div className="space-y-4 px-6 pt-12">
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
    const record = saveDailyPlanCheckin(
      user.id,
      todayIso,
      primaryAction,
      secondAction,
    );
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
      profile,
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się przenieść sesji.",
      );
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
      toast.error(
        error instanceof Error ? error.message : "Nie udało się zmienić planu.",
      );
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
        action === "keep"
          ? "Plan obu sesji potwierdzony."
          : "Druga sesja została zaktualizowana.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nie udało się zmienić planu.",
      );
    } finally {
      setSavingAction(false);
    }
  }

  async function applySelectedProposal(
    proposal: Proposal,
    choice: ModificationChoice,
  ) {
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

  function openSession() {
    if (decisionMode === "checkin_required" || !hasTraining) return;
    if (openingSessionRef.current) return;
    openingSessionRef.current = true;
    void navigate({
      to: "/sesja/$date",
      params: { date: session.date },
      search: { slot: 1 },
    }).finally(() => {
      window.setTimeout(() => {
        openingSessionRef.current = false;
      }, 220);
    });
  }

  return (
    <>
      <main className="start-decision-screen px-6 pb-32 pt-6">
        <header className="flex items-center justify-between">
          <span className="text-[17px] font-medium tracking-[-0.025em]">
            BallWise
          </span>
          <ProfileAvatar />
        </header>

        <section className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-sm flex-col justify-center py-8">
          <div className="mb-7 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[oklch(0.78_0.04_151)] text-white">
              <Check className="h-3 w-3" strokeWidth={2.4} />
            </span>
            {copy.eyebrow}
          </div>

          <div className="text-center">
            {decisionMode !== "checkin_required" && (
              <Dialog open={explanationOpen} onOpenChange={setExplanationOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Dlaczego? <Info className="h-3.5 w-3.5" />
                  </button>
                </DialogTrigger>
                <DialogContent className="border-border/70 bg-popover">
                  <DialogHeader>
                    <DialogTitle>Dlaczego taka decyzja?</DialogTitle>
                    <DialogDescription className="leading-relaxed">
                      {adjusted.whyToday || copy.description}
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            )}
            <h1 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.035em]">
              {copy.title}
            </h1>
            <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">
              {copy.description}
            </p>
          </div>

          <div className="mt-9">
            {decisionMode === "checkin_required" ? (
              <Button
                className="h-12 w-full rounded-xl text-[15px]"
                onClick={() => setCheckinOpen(true)}
              >
                Zrób check-in
              </Button>
            ) : !hasTraining ? (
              <Button
                className="h-12 w-full rounded-xl text-[15px]"
                onClick={() => navigate({ to: "/plan" })}
              >
                Zobacz tydzień <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="h-12 w-full rounded-xl text-[15px]"
                onClick={openSession}
              >
                Start <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </section>
      </main>

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
                onClick={() =>
                  void applyRescueTarget(pendingRescue.recommended)
                }
              >
                {pendingRescue.recommended.dayName} — polecane
              </Button>
              <Button
                variant="outline"
                disabled={savingAction}
                onClick={() =>
                  void applyRescueTarget(pendingRescue.alternative)
                }
              >
                {pendingRescue.alternative.dayName}
              </Button>
              <button
                type="button"
                disabled={savingAction}
                onClick={() => setPendingRescue(null)}
                className="px-3 py-2 text-sm font-medium text-muted-foreground"
              >
                Nie nadrabiaj
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
