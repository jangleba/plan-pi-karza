import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, BarChart3, CalendarDays, Check, ChevronRight, Info } from "lucide-react";
import { useLoadwise } from "@/lib/loadwise/store";
import { resolveEffectiveDay } from "@/lib/loadwise/dailyCheckin";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProfileAvatar } from "@/components/loadwise/ui";
import type { PainLocation } from "@/lib/loadwise/types";
import { buildReadiness, PAIN_LOCATION_OPTIONS } from "@/lib/loadwise/readinessModel";

export const Route = createFileRoute("/_tabs/start")({ component: StartScreen });

const readinessFields: {
  key: "sleep" | "energy" | "fatigue" | "jointPain";
  label: string;
}[] = [
  { key: "sleep", label: "Jakość snu" },
  { key: "energy", label: "Poziom energii" },
  { key: "fatigue", label: "Zmęczenie kończyn dolnych" },
  { key: "jointPain", label: "Dolegliwości bólowe" },
];

function DecisionSignal() {
  return (
    <div className="decision-signal" aria-hidden="true">
      <div className="decision-signal__sources">
        <span><CalendarDays /></span>
        <span><Activity /></span>
        <span><BarChart3 /></span>
      </div>
      <svg viewBox="0 0 260 196" role="presentation" preserveAspectRatio="none">
        <path className="decision-signal__path decision-signal__path--one" d="M4 30 C88 30 96 98 214 98" />
        <path className="decision-signal__path decision-signal__path--two" d="M4 98 C88 98 122 98 214 98" />
        <path className="decision-signal__path decision-signal__path--three" d="M4 166 C88 166 98 98 214 98" />
        <circle className="decision-signal__dot decision-signal__dot--one" cx="38" cy="30" r="2.5" />
        <circle className="decision-signal__dot decision-signal__dot--two" cx="78" cy="98" r="2.5" />
        <circle className="decision-signal__dot decision-signal__dot--three" cx="46" cy="166" r="2.5" />
      </svg>
      <div className="decision-signal__result"><span className="decision-signal__core" /></div>
    </div>
  );
}

function ReadinessDialog({ open, onOpenChange, trigger }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const { todayIso, saveReadiness, state } = useLoadwise();
  const existing = state.readiness[todayIso];
  const [values, setValues] = useState<Record<string, number>>(() => ({
    sleep: existing?.sleep ?? 7,
    energy: existing?.energy ?? 7,
    fatigue: existing?.fatigue ?? 4,
    jointPain: existing?.jointPain ?? 0,
  }));
  const [painLocation, setPainLocation] = useState<PainLocation | null>(existing?.painLocation ?? null);

  async function save() {
    try {
      await saveReadiness(buildReadiness(todayIso, {
        sleep: values.sleep,
        energy: values.energy,
        fatigue: values.fatigue,
        jointPain: values.jointPain,
        painLocation,
      }));
      onOpenChange(false);
      toast.success("Zapisano ocenę gotowości.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać oceny gotowości.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[88vh] overflow-y-auto border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>Ocena gotowości do treningu</DialogTitle>
          <DialogDescription>
            Odpowiedz zgodnie z aktualnym samopoczuciem. Zajmie to około 20 sekund.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {readinessFields.map((field) => (
            <div key={field.key}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{field.label}</span>
                <span className="tabular-nums text-muted-foreground">{values[field.key]}/10</span>
              </div>
              <Slider
                min={field.key === "jointPain" ? 0 : 1}
                max={10}
                step={1}
                value={[values[field.key]]}
                onValueChange={(next) => setValues((current) => ({ ...current, [field.key]: next[0] }))}
              />
            </div>
          ))}
          {values.jointPain > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Którego obszaru dotyczy dyskomfort?</span>
              <Select value={painLocation ?? "other"} onValueChange={(value) => setPainLocation(value as PainLocation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAIN_LOCATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Informacja służy wyłącznie do dobrania bezpieczniejszego wariantu obciążenia danego obszaru.
              </p>
            </div>
          )}
          <Button className="w-full" size="lg" onClick={save}>Zapisz ocenę</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function decisionCopy(readinessCompleted: boolean, override?: string | null) {
  if (!readinessCompleted) {
    return { eyebrow: "Plan przygotowany", title: "Oceń gotowość", description: "Potwierdź samopoczucie przed treningiem." };
  }
  if (override === "Wstrzymaj trening") {
    return { eyebrow: "Wymagana decyzja", title: "Wstrzymaj jednostkę", description: "Najpierw skonsultuj zgłoszone dolegliwości." };
  }
  if (override === "Ogranicz obciążenie") {
    return { eyebrow: "Plan zaktualizowany", title: "Obciążenie ograniczone", description: "Jednostka została dopasowana do aktualnej gotowości." };
  }
  return { eyebrow: "Decyzja BallWise", title: "Plan bez zmian", description: "Możesz przejść do zaplanowanej jednostki." };
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
        <div className="h-4 w-44 animate-pulse rounded-full bg-secondary" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-secondary" />
        <p className="pt-2 text-center text-sm text-muted-foreground">Przygotowujemy Twój tydzień…</p>
      </section>
    </main>
  );
}

function StartScreen() {
  const { state, todaySession, todayIso, hydrated, planGenerating, refreshPlanIfNeeded } =
    useLoadwise();
  const profile = state.profile;
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const autoGenerateRef = useRef(false);

  const planMissing = hydrated && Boolean(profile?.onboardingComplete) && !todaySession;

  // Brak planu po ukończonym onboardingu = jednorazowa, bezpieczna regeneracja.
  // Ref blokuje ponowne uruchomienie przy każdym renderze.
  useEffect(() => {
    if (!planMissing || planGenerating || autoGenerateRef.current) return;
    autoGenerateRef.current = true;
    refreshPlanIfNeeded();
  }, [planMissing, planGenerating, refreshPlanIfNeeded]);

  useEffect(() => {
    if (todaySession) autoGenerateRef.current = false;
  }, [todaySession]);

  if (!hydrated || planGenerating || (planMissing && autoGenerateRef.current)) {
    return <PlanLoadingState />;
  }

  if (!todaySession || !profile) {
    return <PlanLoadingState />;
  }

  const session = todaySession;
  const readiness = state.readiness[todayIso];
  const adjusted = resolveEffectiveDay(session, readiness, profile, state.modifications[todayIso] ?? []);
  const healthEnabled = profile.healthPersonalizationEnabled;
  const copy = decisionCopy(Boolean(readiness) || !healthEnabled, adjusted.loadLabelOverride);

  function openSession() {
    navigate({ to: "/sesja/$date", params: { date: session.date }, search: { slot: 1 } });
  }

  return (
    <main className="start-decision-screen px-6 pb-32 pt-6">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-medium tracking-[-0.025em]">BallWise</span>
        <ProfileAvatar />
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-sm flex-col justify-center py-8">
        <div className="mb-7 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[oklch(0.78_0.04_151)] text-white">
            <Check className="h-3 w-3" strokeWidth={2.4} />
          </span>
          {copy.eyebrow}
        </div>
        <DecisionSignal />

        <div className="mt-10 text-center">
          <div className="flex items-center justify-center gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Decyzja BallWise</p>
            <Dialog open={explanationOpen} onOpenChange={setExplanationOpen}>
              <DialogTrigger asChild>
                <button type="button" aria-label="Wyjaśnienie decyzji" className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent className="border-border/70 bg-popover">
                <DialogHeader>
                  <DialogTitle>Dlaczego taka decyzja?</DialogTitle>
                  <DialogDescription className="leading-relaxed">
                    {adjusted.whyToday ?? adjusted.safetyNote ?? copy.description}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
          <h1 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.035em]">{copy.title}</h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">{copy.description}</p>
        </div>

        <div className="mt-9 space-y-3">
          {healthEnabled && !readiness ? (
            <ReadinessDialog open={dialogOpen} onOpenChange={setDialogOpen} trigger={<Button className="h-12 w-full rounded-xl text-[15px]">Oceń gotowość</Button>} />
          ) : (
            <Button className="h-12 w-full rounded-xl text-[15px]" onClick={openSession}>
              Przejdź do jednostki <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {healthEnabled && readiness ? (
            <ReadinessDialog open={dialogOpen} onOpenChange={setDialogOpen} trigger={
              <button className="flex h-11 w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                Zaktualizuj gotowość <ChevronRight className="h-3.5 w-3.5" />
              </button>
            } />
          ) : healthEnabled ? (
            <button type="button" onClick={openSession} className="flex h-11 w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Przejdź do jednostki <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
