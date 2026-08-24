import { useState } from "react";
import { useCareerJournal } from "@/lib/loadwise/careerJournal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/loadwise/labels";
import { BookMarked, Plus, Trash2, Lock } from "lucide-react";

export function CareerJournal() {
  const { entries, addEntry, removeEntry } = useCareerJournal();
  const [open, setOpen] = useState(false);
  const [club, setClub] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stage, setStage] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextStep, setNextStep] = useState("");

  function save() {
    if (!club.trim() || !date) return;
    addEntry({
      club: club.trim(),
      date,
      stage: stage.trim(),
      outcome: outcome.trim(),
      nextStep: nextStep.trim(),
    });
    setClub("");
    setStage("");
    setOutcome("");
    setNextStep("");
    setOpen(false);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BookMarked className="h-4 w-4 text-primary" /> Dziennik kariery
        </h2>
        {!open && (
          <button
            className="text-xs font-medium text-primary"
            onClick={() => setOpen(true)}
          >
            Dodaj wpis
          </button>
        )}
      </div>

      {open && (
        <div className="soft-card space-y-2 p-4">
          <Input
            value={club}
            onChange={(e) => setClub(e.target.value)}
            placeholder="Klub lub organizator"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="Etap (np. testy, obóz, mecz sparingowy)"
          />
          <Textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Wynik lub feedback"
            rows={3}
          />
          <Textarea
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            placeholder="Kolejny krok"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!club.trim()}>
              <Plus className="h-4 w-4" /> Zapisz
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 && !open ? (
        <div className="soft-card px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Brak wpisów. Zapisz swoje testy klubowe, obozy i sparingi, żeby mieć
            własną historię prób.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="soft-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{e.club}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(e.date)}
                    {e.stage ? ` · ${e.stage}` : ""}
                  </div>
                </div>
                <button
                  aria-label="Usuń wpis"
                  onClick={() => removeEntry(e.id)}
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {e.outcome && (
                <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                  {e.outcome}
                </p>
              )}
              {e.nextStep && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Kolejny krok: {e.nextStep}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Wpisy są prywatne i widoczne tylko na tym
        koncie.
      </p>
    </section>
  );
}
