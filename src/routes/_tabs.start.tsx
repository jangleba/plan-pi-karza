import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  buildCannotTodayDay,
  checkinBase,
  isSessionLocked,
  readDailyPlanCheckin,
  restorePlannedDay,
  sameDayPlan,
  saveDailyPlanCheckin,
  type DailyPlanCheckin,
  type DailyPlanCheckinAction,
} from "@/lib/loadwise/dailyPlanCheckin";
import { buildTimeVariants, ownDayMinutes, type TimeVariant } from "@/lib/loadwise/dailyTimeBudget";
import { resolveTrainingDecisionMode } from "@/lib/loadwise/trainingDecisionGate";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/loadwise/ui";
import type { SessionDay } from "@/lib/loadwise/types";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { StartDashboard } from "@/components/loadwise/StartDashboard";
import {
  completeFieldTask,
  openFieldTask,
  type FieldTask,
} from "@/features/football-iq-match/fieldTask";
import { focusAim, loadMastery, type AimProgress } from "@/features/football-iq-match/masteryStore";
import { UpcomingWeekPrompt } from "@/components/loadwise/UpcomingWeekPrompt";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const Route = createFileRoute("/_tabs/start")({
  component: StartScreen,
});

type CheckinStep = "choose" | "time";

/**
 * Minimal bottom panel: three answers only. No questions about health,
 * pain, sleep, stress, mood or motivation.
 */
function DailyCheckinPanel({
  open,
  onOpenChange,
  summary,
  variants,
  shortened,
  plannedMinutes,
  saving,
  onTrain,
  onCannot,
  onVariant,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  summary: string;
  variants: TimeVariant[];
  shortened: boolean;
  plannedMinutes: number;
  saving: boolean;
  onTrain: () => void;
  onCannot: () => void;
  onVariant: (variant: TimeVariant) => void;
  onRestore: () => void;
}) {
  const [step, setStep] = useState<CheckinStep>("choose");

  useEffect(() => {
    if (open) setStep("choose");
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <div className="space-y-1 px-1">
          <SheetTitle className="text-[17px] font-medium tracking-[-0.01em]">
            {step === "choose" ? "Dzisiejszy trening" : "Ile masz dziś czasu?"}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {step === "choose"
              ? summary
              : "Skracamy tylko pracę. Rozgrzewka i pełne przerwy zostają."}
          </SheetDescription>
        </div>

        {step === "choose" ? (
          <div className="mt-4 grid gap-2" role="group" aria-label="Decyzja dnia">
            <CheckinChoice
              label="Trenuję"
              hint="Plan bez zmian"
              tone="primary"
              disabled={saving}
              onClick={onTrain}
            />
            <CheckinChoice
              label="Mam mniej czasu"
              hint="Krótsza praca, bez skracania przerw"
              disabled={saving}
              onClick={() => setStep("time")}
            />
            <CheckinChoice
              label="Dziś nie mogę"
              hint="Bez automatycznego nadrabiania"
              disabled={saving}
              onClick={onCannot}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {variants.map((variant) => (
              <CheckinChoice
                key={variant.id}
                label={variant.label}
                hint={variant.detail}
                disabled={saving}
                onClick={() => onVariant(variant)}
              />
            ))}
            {variants.length === 0 && (
              <p className="rounded-xl border border-border/60 px-4 py-3 text-sm text-muted-foreground">
                Nie ma krótszego wariantu, który zachowuje rozgrzewkę i pełne przerwy. Możesz
                wykonać pełny plan albo wybrać „Dziś nie mogę”.
              </p>
            )}
            {shortened && (
              <CheckinChoice
                label={`Pełny plan · ok. ${plannedMinutes} min`}
                hint="Wróć do planu sprzed dzisiejszej zmiany"
                disabled={saving}
                onClick={onRestore}
              />
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep("choose")}
              className="mt-1 h-10 rounded-xl text-sm font-medium text-muted-foreground"
            >
              Wróć
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CheckinChoice({
  label,
  hint,
  tone = "neutral",
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  tone?: "primary" | "neutral";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 " +
        (tone === "primary"
          ? "border-primary/25 bg-primary/[0.06] hover:bg-primary/[0.1]"
          : "border-border/60 bg-transparent hover:bg-secondary/60")
      }
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function decisionTitle(checkin: DailyPlanCheckin | null, day: SessionDay): string {
  if (!checkin) return "Sprawdź lub zmień";
  if (checkin.action === "cannot_today")
    return day.isUnavailable ? "Dziś bez treningu" : "Dziś bez nierozpoczętej sesji";
  if (checkin.action === "less_time")
    return checkin.minutes ? `Krótszy wariant · ok. ${checkin.minutes} min` : "Krótszy wariant";
  return "Trenuję według planu";
}

function daySummary(day: SessionDay): string {
  const slots = [day, day.secondSession].filter(Boolean) as SessionDay[];
  const own = ownDayMinutes(day);
  if (day.isUnavailable || slots.every((slot) => slot.dayType === "rest"))
    return "Dziś nie masz zaplanowanego treningu.";
  const names = slots.map((slot) => slot.title).join(" + ");
  return own > 0 ? `${names} · ok. ${own} min` : names;
}

function PlanLoadingState() {
  return (
    <main className="px-6 pb-32 pt-6" aria-busy="true">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-medium tracking-[-0.025em]">BallWise</span>
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
  const [iqTask, setIqTask] = useState<FieldTask | null>(null);
  const [iqGoal, setIqGoal] = useState<AimProgress | null>(null);
  useEffect(() => {
    // Read after mount: storage is browser-only.
    setIqTask(openFieldTask(user?.id));
    setIqGoal(user?.id ? focusAim(loadMastery(user.id)) : null);
  }, [user?.id]);
  const {
    state,
    todaySession,
    todayIso,
    hydrated,
    syncing,
    hydrationError,
    planGenerating,
    refreshPlanIfNeeded,
    applyModification,
  } = useLoadwise();
  const profile = state.profile;
  const effectivePlan = useMemo(
    () =>
      selectEffectivePlan(state.plan, state.modifications, {
        profile,
        readiness: state.readiness,
        completions: state.completions,
      }),
    [state.plan, state.modifications, profile, state.readiness, state.completions],
  );
  const commandPlan = useMemo(
    () => selectEffectivePlan(state.plan, state.modifications),
    [state.plan, state.modifications],
  );
  const navigate = useNavigate();
  const router = useRouter();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkin, setCheckin] = useState<DailyPlanCheckin | null>(() =>
    user ? readDailyPlanCheckin(user.id, todayIso) : null,
  );
  const [checkinLoaded, setCheckinLoaded] = useState(Boolean(user));
  const [savingAction, setSavingAction] = useState(false);
  const autoGenerateRef = useRef(false);
  const [autoGenerateTried, setAutoGenerateTried] = useState(false);

  // A failed read does not prove the server has no plan. Re-read it before any
  // generation, so optimistic locking and existing training history stay intact.
  const planMissing =
    hydrated &&
    !syncing &&
    !hydrationError &&
    Boolean(profile?.onboardingComplete) &&
    !todaySession;

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
  }, [planMissing, planGenerating, autoGenerateTried, refreshPlanIfNeeded]);

  useEffect(() => {
    if (todaySession) {
      autoGenerateRef.current = false;
      setAutoGenerateTried(false);
    }
  }, [todaySession]);

  if (!hydrated || !checkinLoaded || ((syncing || planGenerating) && !todaySession)) {
    return <PlanLoadingState />;
  }

  if (hydrationError && !todaySession) {
    return (
      <main className="space-y-4 px-6 pt-12" role="status">
        <p className="text-sm text-muted-foreground">
          Nie udało się wczytać planu. Sprawdź połączenie i spróbuj ponownie.
        </p>
        <Button
          onClick={() => {
            autoGenerateRef.current = false;
            setAutoGenerateTried(false);
            window.dispatchEvent(new Event("ballwise:server-state-changed"));
          }}
        >
          Spróbuj ponownie
        </Button>
      </main>
    );
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
  const userId = user.id;
  const adjusted = effectivePlan.find((day) => day.date === todayIso) ?? session;
  const commandDay = commandPlan.find((day) => day.date === todayIso) ?? session;
  const decisionMode = resolveTrainingDecisionMode({
    isToday: true,
    hasTodayCheckin: Boolean(checkin),
  });
  const locked = (slot: SessionDay) => isSessionLocked(slot, state.completions);
  const timeVariants = buildTimeVariants(commandDay, locked);
  const shortened = Boolean(commandDay.checkinBaseSession);
  const plannedMinutes = ownDayMinutes(checkinBase(commandDay));

  function remember(action: DailyPlanCheckinAction, minutes: number | null = null) {
    setCheckin(saveDailyPlanCheckin(userId, todayIso, action, minutes));
    setCheckinOpen(false);
  }

  /** Writes only a real change; the same decision applied again is a no-op. */
  async function applyDay(next: SessionDay, tag: string, message: string) {
    if (sameDayPlan(next, commandDay)) return false;
    await applyModification(
      todayIso,
      "swap",
      next,
      commandDay,
      `[daily-checkin:${tag}] ${message}`,
    );
    return true;
  }

  async function run(action: () => Promise<void>) {
    if (savingAction) return;
    setSavingAction(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zmienić planu.");
    } finally {
      setSavingAction(false);
    }
  }

  // „Trenuję” confirms the current plan. It never increases the dose.
  function handleTrain() {
    remember("train");
    toast.success("Plan potwierdzony.");
  }

  function handleVariant(variant: TimeVariant) {
    void run(async () => {
      await applyDay(variant.day, "less-time", `Zawodnik ma dziś ok. ${variant.minutes} min.`);
      remember("less_time", variant.minutes);
      toast.success(`Plan na ok. ${variant.minutes} min.`);
    });
  }

  function handleRestore() {
    void run(async () => {
      await applyDay(restorePlannedDay(commandDay), "restore", "Powrót do pełnego planu dnia.");
      remember("train");
      toast.success("Przywrócono pełny plan dnia.");
    });
  }

  function handleCannot() {
    const next = buildCannotTodayDay(commandDay, state.completions);
    if (next === commandDay) {
      toast.info("Sesja jest rozpoczęta lub wykonana. Jej zapis pozostaje bez zmian.");
      return;
    }
    void run(async () => {
      await applyDay(next, "cannot-today", "Zawodnik dziś nie może trenować.");
      remember("cannot_today");
      toast.success("Dziś bez treningu. Nie przenosimy tej pracy automatycznie na kolejny dzień.");
    });
  }

  const firstName = profile.name.trim().split(/\s+/)[0] || "Zawodniku";
  const checkinComplete = decisionMode === "confirmed";

  return (
    <>
      <StartDashboard
        name={firstName}
        avatar={<ProfileAvatar />}
        plan={effectivePlan}
        completions={state.completions}
        todayIso={todayIso}
        checkinComplete={checkinComplete}
        busy={savingAction}
        checkinDetail={decisionTitle(checkin, adjusted)}
        onCheckin={() => setCheckinOpen(true)}
        onPlan={() => void navigate({ to: "/plan" })}
        onLab={() => void navigate({ to: "/lab" })}
        onReaction={() => void navigate({ to: "/reakcja" })}
        iqTask={
          iqTask
            ? {
                text: iqTask.text,
                onDone: () => {
                  completeFieldTask(user?.id);
                  setIqTask(null);
                },
              }
            : undefined
        }
        iqGoal={
          iqGoal
            ? {
                label: iqGoal.label,
                percent: Math.round(iqGoal.score * 100),
                onOpen: () => void navigate({ to: "/football-iq" }),
              }
            : undefined
        }
        onPrepareLab={() => {
          void Promise.all([
            router.preloadRoute({ to: "/lab" }),
            import("@/features/browser-lab/BrowserLab"),
          ]).catch(() => undefined);
        }}
        onPrepareReaction={() => {
          void router.preloadRoute({ to: "/reakcja" }).catch(() => undefined);
        }}
        onPrepare={(date, slot) => {
          void router
            .preloadRoute({ to: "/sesja/$date", params: { date }, search: { slot } })
            .catch(() => undefined);
        }}
        onOpen={(date, slot) =>
          void navigate({ to: "/sesja/$date", params: { date }, search: { slot } })
        }
      />
      <UpcomingWeekPrompt
        onConfirmed={(week) => void navigate({ to: "/plan", search: { week } })}
      />
      <DailyCheckinPanel
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        summary={daySummary(adjusted)}
        variants={timeVariants}
        shortened={shortened}
        plannedMinutes={plannedMinutes}
        saving={savingAction}
        onTrain={handleTrain}
        onCannot={handleCannot}
        onVariant={handleVariant}
        onRestore={handleRestore}
      />
    </>
  );
}
