import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { applyReadiness } from "@/lib/loadwise/planEngine";
import { formatDateFull, formatDate } from "@/lib/loadwise/labels";
import { AppHeader } from "@/components/loadwise/ui";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CalendarClock,
  Activity,
  Gauge,
  ChevronRight,
  Plus,
  Repeat,
  Undo2,
} from "lucide-react";
import { ModifySheet } from "@/components/loadwise/ModifySheet";
import type { Readiness, SessionDay, Intensity } from "@/lib/loadwise/types";

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

const LOAD_LABEL: Record<Intensity, string> = {
  niska: "Niskie",
  umiarkowana: "Umiarkowane",
  wysoka: "Wysokie",
};

/** Duży tytuł decyzji dnia. */
function dayHeadline(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Dziś: mecz";
    case "md-1":
      return "Dziś: aktywacja przedmeczowa";
    case "club":
      return "Dziś: trening klubowy";
    case "recovery":
      return "Dziś: regeneracja";
    case "rest":
      return "Dziś: dzień wolny";
    default: {
      const t = day.sessionType.toLowerCase();
      if (t.includes("szybk")) return "Dziś: szybkość";
      if (t.includes("sił")) return "Dziś: siła";
      if (t.includes("wytrzym")) return "Dziś: wytrzymałość";
      if (t.includes("piłk") || t.includes("techn")) return "Dziś: trening z piłką";
      return "Dziś: trening";
    }
  }
}

/** Jedno krótkie zdanie pod tytułem. */
function dayOneLiner(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Dzień meczowy. Bez dodatkowego treningu.";
    case "md-1":
      return "Tylko aktywacja. Po treningu oceń RPE.";
    case "club":
      return "To główne obciążenie dnia. Po treningu oceń RPE.";
    case "recovery":
      return "Lekka regeneracja. Bez intensywności.";
    case "rest":
      return "Odpoczynek — wróć jutro do planu.";
    default:
      return "To główne obciążenie dnia. Po treningu oceń RPE.";
  }
}

function ReadinessDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const { todayIso, saveReadiness, state } = useLoadwise();
  const existing = state.readiness[todayIso];
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
    onOpenChange(false);
    toast.success("Zapisano check-in gotowości.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
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
                onValueChange={(v) => setVals((p) => ({ ...p, [f.key]: v[0] }))}
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
  const lw = useLoadwise();
  const { state, todaySession, todayIso, undoModification } = lw;
  const profile = state.profile;
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);


  if (!todaySession || !profile) {
    return (
      <div className="px-5 pt-10 text-sm text-muted-foreground">
        Brak planu. Przejdź do zakładki Plan.
      </div>
    );
  }

  const session = todaySession;
  const readiness = state.readiness[todayIso];
  const { session: adjustedToday } = applyReadiness(session, readiness, profile);

  const matchDate = profile.matchDate;
  const isMatch = session.dayType === "match";
  const isRestLike =
    session.dayType === "rest" || session.dayType === "recovery";

  function openSession() {
    navigate({
      to: "/sesja/$date",
      params: { date: session.date },
      search: { slot: 1 },
    });
  }

  return (
    <div>
      <AppHeader title={`Cześć, ${profile.name}`} subtitle={formatDateFull(todayIso)} />

      <div className="space-y-4 px-5">
        {/* Główna decyzja dnia */}
        <div className="soft-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Decyzja na dziś
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
            {dayHeadline(adjustedToday)}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {dayOneLiner(adjustedToday)}
          </p>
        </div>

        {/* 3 kluczowe informacje */}
        <div className="grid grid-cols-3 gap-3">
          <div className="soft-card p-3">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <div className="mt-1.5 text-[11px] text-muted-foreground">Mecz</div>
            <div className="text-sm font-semibold leading-tight">
              {matchDate ? formatDate(matchDate) : "Brak"}
            </div>
          </div>
          <div className="soft-card p-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Gotowość
            </div>
            <div className="text-sm font-semibold leading-tight">
              {readiness ? "Uzupełniona" : "Brak"}
            </div>
          </div>
          <div className="soft-card p-3">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Obciążenie
            </div>
            <div className="text-sm font-semibold leading-tight">
              {LOAD_LABEL[adjustedToday.intensity]}
            </div>
          </div>
        </div>

        {/* Główne CTA */}
        {isMatch ? (
          <Button className="w-full" size="lg" onClick={openSession}>
            Zobacz zalecenia meczowe
          </Button>
        ) : isRestLike ? (
          <Button className="w-full" size="lg" onClick={openSession}>
            Zobacz regenerację
          </Button>
        ) : readiness ? (
          <Button className="w-full" size="lg" onClick={openSession}>
            Otwórz dzisiejszy trening
          </Button>
        ) : (
          <ReadinessDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            trigger={
              <Button className="w-full" size="lg">
                Wypełnij check-in
              </Button>
            }
          />
        )}

        {/* Druga sesja dziś */}
        {adjustedToday.secondSession && (
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/sesja/$date",
                params: { date: session.date },
                search: { slot: 2 },
              })
            }
            className="soft-card flex w-full items-center justify-between p-4 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                2. sesja dziś (lekka)
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold">
                {adjustedToday.secondSession.title}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {/* Drugorzędne CTA: aktualizacja gotowości, gdy już uzupełniona */}
        {readiness && !isMatch && !isRestLike && (
          <ReadinessDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            trigger={
              <Button variant="outline" className="w-full" size="lg">
                Zaktualizuj gotowość
              </Button>
            }
          />
        )}
      </div>

      <div className="h-[120px]" />
    </div>
  );
}
