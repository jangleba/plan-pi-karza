import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  buildProposals,
  PLACE_LABELS,
  type Place,
  type Proposal,
} from "@/lib/loadwise/modifications";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, Disclosure, ResponsiveDialog, StatusMessage } from "@/components/ui/app-ui";

type Step = "choice" | "details" | "proposals";
export type ModificationChoice = "add" | "swap";

const TIME_OPTIONS = [20, 30, 45, 60];
const PLACE_OPTIONS: Place[] = ["dom", "boisko", "silownia"];

export function ModifySheet({
  open,
  onOpenChange,
  date,
  initialChoice,
  context = "primary",
  onSelectProposal,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  initialChoice?: ModificationChoice;
  context?: "primary" | "second";
  onSelectProposal?: (proposal: Proposal, choice: ModificationChoice) => Promise<void>;
  onApplied?: (choice: ModificationChoice) => void;
}) {
  const { state, applyModification } = useLoadwise();
  const [step, setStep] = useState<Step>("choice");
  const [choice, setChoice] = useState<ModificationChoice>(initialChoice ?? "add");
  const [time, setTime] = useState(30);
  const [place, setPlace] = useState<Place>("boisko");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = state.profile;

  useEffect(() => {
    if (!open) return;
    setChoice(initialChoice ?? "add");
    setStep(initialChoice ? "details" : "choice");
    setError(null);
  }, [initialChoice, open]);

  function reset() {
    setStep("choice");
    setChoice("add");
  }

  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function pickChoice(c: ModificationChoice) {
    setChoice(c);
    setStep("details");
  }

  function continueFromDetails() {
    setStep("proposals");
  }

  async function apply(p: Proposal) {
    if (applying) return;
    setApplying(true);
    setError(null);
    try {
      if (onSelectProposal) await onSelectProposal(p, choice);
      else {
        const original =
          choice === "swap" ? (state.plan.find((day) => day.date === date) ?? null) : null;
        await applyModification(date, choice, p.session, original, p.reason);
      }
      toast.success(
        context === "second"
          ? "Druga sesja została zaktualizowana."
          : choice === "swap"
            ? "Zamieniono sesję."
            : "Dodano sesję do dziś.",
      );
      onApplied?.(choice);
      close(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zmienić sesji. Spróbuj ponownie.",
      );
    } finally {
      setApplying(false);
    }
  }

  if (!profile) return null;

  const result =
    step === "proposals"
      ? buildProposals(state.plan, profile, date, null, choice, place, time)
      : null;

  const title =
    step === "choice"
      ? "Zmień plan"
      : step === "details"
        ? choice === "swap"
          ? context === "second"
            ? "Zamień drugą sesję"
            : "Zamień sesję"
          : "Dodaj lekką sesję"
        : "Wybierz sesję";
  return (
    <ResponsiveDialog open={open} onOpenChange={close} title={title} dismissible={!applying}>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {step === "choice" && (
        <div className="bw-stack">
          <Button variant="outline" onClick={() => pickChoice("add")}>
            Dodaj lekką sesję
          </Button>
          <Button variant="outline" onClick={() => pickChoice("swap")}>
            Zamień sesję
          </Button>
          <Button variant="ghost" onClick={() => close(false)}>
            Anuluj
          </Button>
        </div>
      )}
      {step === "details" && (
        <div className="bw-stack">
          <ChoiceGroup
            label="Czas"
            selectedClassName="bg-primary text-primary-foreground"
            value={String(time)}
            options={TIME_OPTIONS.map((value) => ({ value: String(value), label: `${value} min` }))}
            onChange={(value) => setTime(Number(value))}
          />
          <ChoiceGroup
            label="Miejsce"
            selectedClassName="bg-primary text-primary-foreground"
            value={place}
            options={PLACE_OPTIONS.map((value) => ({ value, label: PLACE_LABELS[value] }))}
            onChange={setPlace}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={continueFromDetails}>Pokaż propozycje</Button>
            <Button
              variant="ghost"
              onClick={() => (initialChoice ? close(false) : setStep("choice"))}
            >
              Wróć
            </Button>
          </div>
        </div>
      )}
      {step === "proposals" && result && (
        <div className="bw-stack">
          <StatusMessage>{result.message}</StatusMessage>
          {result.safe.map((proposal) => (
            <div
              key={proposal.id}
              className="flex flex-wrap items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{proposal.session.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {proposal.session.durationMin} min · {proposal.session.intensity}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{proposal.reason}</p>
              </div>
              <Button disabled={applying} onClick={() => void apply(proposal)}>
                {applying ? "Zapisywanie…" : choice === "swap" ? "Zamień" : "Dodaj"}
              </Button>
            </div>
          ))}
          {result.safe.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Dziś nie ma zalecanej sesji dla tych parametrów.
            </p>
          )}
          {result.blocked.length > 0 && (
            <Disclosure title="Niezalecane dziś">
              <div className="bw-stack">
                {result.blocked.map((item, index) => (
                  <div key={index}>
                    <h3 className="text-sm font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}
          <Button variant="ghost" disabled={applying} onClick={() => setStep("details")}>
            Zmień parametry
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
