import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { applyReadiness } from "@/lib/loadwise/planEngine";
import {
  formatDateFull,
  formatDate,
  POSITION_LABELS,
  GOAL_LABELS,
} from "@/lib/loadwise/labels";
import { AppHeader, IntensityBadge, Disclaimer } from "@/components/loadwise/ui";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Clock, Target, CalendarClock, Activity, ChevronRight } from "lucide-react";
import type { Readiness } from "@/lib/loadwise/types";

export const Route = createFileRoute("/_tabs/start")({
  component: StartScreen,
});

const readinessFields: {
  key: keyof Omit<Readiness, "date">;
  label: string;
}[] = [
  { key: "sleep", label: "Sen" },
  { key: "energy", label: "Energia" },
  { key: "fatigue", label: "Zmęczenie" },
  { key: "soreness", label: "Bolesność mięśni" },
  { key: "jointPain", label: "Ból stawów" },
  { key: "stress", label: "Stres" },
  { key: "motivation", label: "Motywacja" },
  { key: "overall", label: "Ogólna gotowość" },
];

function ReadinessDialog({ onSaved }: { onSaved: () => void }) {
  const { todayIso, saveReadiness, state } = useLoadwise();
  const existing = state.readiness[todayIso];
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, number>>(() => ({
    sleep: existing?.sleep ?? 7,
    energy: existing?.energy ?? 7,
    fatigue: existing?.fatigue ?? 4,
    soreness: existing?.soreness ?? 3,
    jointPain: existing?.jointPain ?? 2,
    stress: existing?.stress ?? 3,
    motivation: existing?.motivation ?? 7,
    overall: existing?.overall ?? 7,
  }));

  function save() {
    saveReadiness({
      date: todayIso,
      sleep: vals.sleep,
      energy: vals.energy,
      fatigue: vals.fatigue,
      soreness: vals.soreness,
      jointPain: vals.jointPain,
      stress: vals.stress,
      motivation: vals.motivation,
      overall: vals.overall,
    });
    setOpen(false);
    toast.success("Zapisano check-in gotowości.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" size="lg">
          {existing ? "Zaktualizuj gotowość" : "Wypełnij check-in gotowości"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jak się dziś czujesz?</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {readinessFields.map((f) => (
            <div key={f.key}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="text-muted-foreground">{vals[f.key]}/10</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[vals[f.key]]}
                onValueChange={(v) =>
                  setVals((p) => ({ ...p, [f.key]: v[0] }))
                }
              />
            </div>
          ))}
          <Button className="w-full" size="lg" onClick={save}>
            Zapisz check-in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StartScreen() {
  const { state, todaySession, todayIso, profile } = useLoadwiseStart();
  const navigate = useNavigate();
  const [, force] = useState(0);

  if (!todaySession || !profile) {
    return (
      <div className="px-5 pt-10 text-sm text-muted-foreground">
        Brak planu. Przejdź do zakładki Plan.
      </div>
    );
  }

  const readiness = state.readiness[todayIso];
  const { decision } = applyReadiness(todaySession, readiness, profile);

  const matchDate = profile.matchDate;

  return (
    <div>
      <AppHeader title={`Cześć, ${profile.name}`} subtitle={formatDateFull(todayIso)} />

      <div className="space-y-4 px-5">
        {/* Decyzja dnia */}
        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Decyzja na dziś
          </div>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug">
            {decision.headline}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{decision.detail}</p>
          {decision.adjustment && (
            <p className="mt-2 rounded-lg bg-accent/40 px-3 py-2 text-xs text-accent-foreground">
              {decision.adjustment}
            </p>
          )}
        </div>

        {/* Mecz + Gotowość */}
        <div className="grid grid-cols-2 gap-3">
          <div className="soft-card p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Najbliższy mecz
            </div>
            <div className="mt-1.5 text-sm font-semibold">
              {matchDate ? formatDate(matchDate) : "Brak daty"}
            </div>
            <div className="text-xs text-muted-foreground">
              {matchDate ? "Plan ułożony pod mecz" : "Plan ogólny 7 dni"}
            </div>
          </div>
          <div className="soft-card p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Gotowość
            </div>
            <div className="mt-1.5 text-sm font-semibold">
              {readiness ? `${readiness.overall}/10` : "Nieuzupełniona"}
            </div>
            <div className="text-xs text-muted-foreground">
              {POSITION_LABELS[profile.position]} · {GOAL_LABELS[profile.goal]}
            </div>
          </div>
        </div>

        {/* Dzisiejsza sesja */}
        <Link
          to="/sesja/$date"
          params={{ date: todaySession.date }}
          className="soft-card block p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dzisiejsza sesja
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="mt-1.5 text-base font-semibold">{todaySession.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <IntensityBadge intensity={todaySession.intensity} />
            <span className="inline-flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> {todaySession.goalLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {todaySession.durationMin} min
            </span>
          </div>
        </Link>

        <ReadinessDialog onSaved={() => force((n) => n + 1)} />

        <Button
          variant="outline"
          className="w-full"
          size="lg"
          onClick={() =>
            navigate({ to: "/sesja/$date", params: { date: todaySession.date } })
          }
        >
          Otwórz dzisiejszą sesję
        </Button>
      </div>

      <Disclaimer />
    </div>
  );
}

function useLoadwiseStart() {
  const lw = useLoadwise();
  return { ...lw, profile: lw.state.profile };
}
