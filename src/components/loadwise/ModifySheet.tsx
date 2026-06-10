import { useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  buildProposals,
  PLACE_LABELS,
  type Place,
  type Proposal,
} from "@/lib/loadwise/modifications";
import type { SessionDay } from "@/lib/loadwise/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Clock, Gauge } from "lucide-react";

type Step = "choice" | "details" | "readiness" | "proposals";
type Choice = "add" | "swap";

const TIME_OPTIONS = [20, 30, 45, 60];
const PLACE_OPTIONS: Place[] = ["dom", "boisko", "silownia"];

const readinessFields: { key: string; label: string; def: number }[] = [
  { key: "sleep", label: "Sen", def: 7 },
  { key: "energy", label: "Energia", def: 7 },
  { key: "fatigue", label: "Zmęczenie", def: 4 },
  { key: "soreness", label: "Bolesność", def: 3 },
  { key: "jointPain", label: "Ból stawów", def: 2 },
  { key: "overall", label: "Ogólna gotowość", def: 7 },
];

export function ModifySheet({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
}) {
  const { state, saveReadiness, applyModification } = useLoadwise();
  const [step, setStep] = useState<Step>("choice");
  const [choice, setChoice] = useState<Choice>("add");
  const [time, setTime] = useState(30);
  const [place, setPlace] = useState<Place>("boisko");
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(readinessFields.map((f) => [f.key, f.def])),
  );

  const profile = state.profile;
  const readiness = state.readiness[date];

  function reset() {
    setStep("choice");
    setChoice("add");
  }

  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function pickChoice(c: Choice) {
    setChoice(c);
    setStep("details");
  }

  function continueFromDetails() {
    if (!readiness) {
      setStep("readiness");
    } else {
      setStep("proposals");
    }
  }

  function saveReadinessStep() {
    saveReadiness({
      date,
      sleep: vals.sleep,
      energy: vals.energy,
      fatigue: vals.fatigue,
      soreness: vals.soreness,
      jointPain: vals.jointPain,
      stress: 3,
      motivation: 7,
      overall: vals.overall,
    });
    setStep("proposals");
  }

  async function apply(p: Proposal) {
    const original =
      choice === "swap" ? state.plan.find((d) => d.date === date) ?? null : null;
    await applyModification(date, choice, p.session, original, p.reason);
    toast.success(
      choice === "swap" ? "Zamieniono sesję." : "Dodano sesję do dziś.",
    );
    close(false);
  }

  if (!profile) return null;

  const readinessOverall = readiness?.overall ?? null;
  const result =
    step === "proposals"
      ? buildProposals(
          state.plan,
          profile,
          date,
          readinessOverall,
          choice,
          place,
          time,
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "choice"
              ? "Co chcesz zrobić?"
              : step === "readiness"
                ? "Jak się dziś czujesz?"
                : step === "details"
                  ? choice === "swap"
                    ? "Zamień dzisiejszą sesję"
                    : "Dodaj lekką sesję"
                  : "Bezpieczne opcje na dziś"}
          </DialogTitle>
        </DialogHeader>

        {step === "choice" && (
          <div className="space-y-2.5 pt-1">
            <button
              onClick={() => pickChoice("add")}
              className="soft-card w-full p-4 text-left"
            >
              <div className="text-sm font-semibold">Dodaj lekką sesję</div>
              <div className="text-xs text-muted-foreground">
                Masz więcej czasu i chcesz dołożyć bezpieczny trening.
              </div>
            </button>
            <button
              onClick={() => pickChoice("swap")}
              className="soft-card w-full p-4 text-left"
            >
              <div className="text-sm font-semibold">Zamień dzisiejszą sesję</div>
              <div className="text-xs text-muted-foreground">
                Zaplanowana sesja dziś nie pasuje — wybierz inną.
              </div>
            </button>
            <button
              onClick={() => close(false)}
              className="soft-card w-full p-4 text-left"
            >
              <div className="text-sm font-semibold">Zostaw plan bez zmian</div>
              <div className="text-xs text-muted-foreground">
                Trzymamy się Twojego planu.
              </div>
            </button>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-5 pt-1">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" /> Ile masz
                czasu?
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTime(t)}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${
                      time === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {t} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Gauge className="h-4 w-4 text-muted-foreground" /> Gdzie możesz
                trenować?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PLACE_OPTIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlace(p)}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${
                      place === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {PLACE_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={continueFromDetails}>
              {readiness ? "Pokaż propozycje" : "Dalej — check-in"}
            </Button>
          </div>
        )}

        {step === "readiness" && (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Uzupełnij check-in, zanim dobierzemy bezpieczną sesję.
            </p>
            {readinessFields.map((f) => (
              <div key={f.key}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground">
                    {vals[f.key]}/10
                  </span>
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
            <Button className="w-full" size="lg" onClick={saveReadinessStep}>
              Zapisz i pokaż propozycje
            </Button>
          </div>
        )}

        {step === "proposals" && result && (
          <div className="space-y-3 pt-1">
            <div className="soft-card bg-primary/5 px-4 py-3 text-sm font-medium">
              {result.message}
            </div>

            {result.safe.map((p) => (
              <div key={p.id} className="soft-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {p.session.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {p.session.durationMin} min · {p.session.intensity}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.reason}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => apply(p)}>
                    {choice === "swap" ? "Zamień" : "Dodaj"}
                  </Button>
                </div>
              </div>
            ))}

            {result.safe.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Dziś nie polecamy dokładania treningu.
              </p>
            )}

            {result.blocked.length > 0 && (
              <div className="pt-1">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5" /> Niezalecane dziś
                </div>
                <div className="space-y-2">
                  {result.blocked.map((b, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-dashed border-border px-3 py-2.5"
                    >
                      <div className="text-sm font-medium text-muted-foreground">
                        {b.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function effectiveSession(
  date: string,
  planned: SessionDay,
  mods: { type: "add" | "swap"; session: SessionDay }[] | undefined,
): { primary: SessionDay; swapped: boolean } {
  const swap = mods?.find((m) => m.type === "swap");
  return { primary: swap ? swap.session : planned, swapped: Boolean(swap) };
}
