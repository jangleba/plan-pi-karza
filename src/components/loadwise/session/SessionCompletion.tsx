import { useEffect, useId, useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import type { SessionDay } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { useActivityExitGuard } from "../ActivityExitGuard";
import { composeCompletionNotes, parseCompletionNotes } from "@/lib/loadwise/sessionPresentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Field, StatusMessage } from "@/components/ui/app-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function LogField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange?: (next: number) => void;
}) {
  const fieldId = useId();
  const controlled = typeof value === "number" && typeof onChange === "function";
  return (
    <Field label={label} htmlFor={fieldId}>
      <Input
        id={fieldId}
        type="number"
        min={0}
        max={10}
        placeholder="0–10"
        value={controlled ? value : undefined}
        onChange={
          controlled
            ? (e) => {
                const next = Number(e.target.value);
                onChange(Number.isFinite(next) ? Math.max(0, Math.min(10, next)) : 0);
              }
            : undefined
        }
      />
    </Field>
  );
}

export function MatchStartPanel({ session, isToday }: { session: SessionDay; isToday: boolean }) {
  const { state, startSession } = useLoadwise();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const [starting, setStarting] = useState(false);
  useActivityExitGuard({ dirty: false, busy: starting });

  if (!session.dbId || session.dayType !== "match" || existing?.completed) return null;

  if (!isToday && existing?.status !== "started") {
    return (
      <div className="bw-section">
        <h2 className="bw-section-title">Zaplanowany mecz</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Przycisk rozpoczęcia będzie dostępny w dniu meczu.
        </p>
      </div>
    );
  }

  if (existing?.status === "started") {
    return (
      <div className="bw-section">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <h2 className="bw-section-title">Mecz rozpoczęty</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Po ostatnim gwizdku uzupełnij wynik obciążenia poniżej.
        </p>
      </div>
    );
  }

  async function start() {
    setStarting(true);
    try {
      await startSession(session);
      toast.success("Mecz rozpoczęty. Powodzenia!");
    } catch {
      toast.error("Nie udało się rozpocząć meczu. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="bw-section">
      <h2 className="bw-section-title">Gotowy do meczu?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Start zapisze godzinę rozpoczęcia. Dane po meczu uzupełnisz po zakończeniu.
      </p>
      <Button className="mt-3 w-full" size="lg" disabled={starting} onClick={() => void start()}>
        <Flag className="mr-2 h-4 w-4" />
        {starting ? "Rozpoczynanie…" : "Rozpocznij mecz"}
      </Button>
    </div>
  );
}

export function CompletionPanel({ session }: { session: SessionDay }) {
  const durationInputId = useId();
  const activityInputId = useId();
  const notesInputId = useId();
  const { state, completeSession } = useLoadwise();
  const healthPersonalizationEnabled = state.profile?.healthPersonalizationEnabled === true;
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const parsed = parseCompletionNotes(existing?.notes ?? "");
  const [rpe, setRpe] = useState(existing?.rpe ?? 6);
  const [pain, setPain] = useState(parsed.pain);
  const [legFatigue, setLegFatigue] = useState(parsed.legFatigue);
  const [notes, setNotes] = useState(parsed.notes);
  const externalSession = session.dayType === "club" || session.dayType === "match";
  const [durationMin, setDurationMin] = useState(
    existing?.durationMin ?? session.durationMin ?? 90,
  );
  const [activityType, setActivityType] = useState(existing?.activityType ?? "mixed");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const done = existing?.completed ?? false;
  const existingRpe = existing?.rpe ?? 6;
  const existingNotes = existing?.notes ?? "";
  useActivityExitGuard({
    dirty:
      rpe !== existingRpe ||
      (externalSession &&
        (durationMin !== (existing?.durationMin ?? session.durationMin ?? 90) ||
          activityType !== (existing?.activityType ?? "mixed"))) ||
      (healthPersonalizationEnabled &&
        (pain !== parsed.pain || legFatigue !== parsed.legFatigue || notes !== parsed.notes)),
    busy: saving,
    description: "Dane po treningu nie zostały zapisane.",
  });

  useEffect(() => {
    const next = parseCompletionNotes(existingNotes);
    setRpe(existingRpe);
    setPain(next.pain);
    setLegFatigue(next.legFatigue);
    setNotes(next.notes);
    setDurationMin(existing?.durationMin ?? session.durationMin ?? 90);
    setActivityType(existing?.activityType ?? "mixed");
  }, [
    existingRpe,
    existingNotes,
    existing?.durationMin,
    existing?.activityType,
    session.durationMin,
  ]);

  if (!session.dbId) return null;

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await completeSession(
        session,
        rpe,
        healthPersonalizationEnabled ? composeCompletionNotes(notes, pain, legFatigue) : "",
        externalSession ? { durationMin, activityType } : { durationMin: session.durationMin },
      );
      toast.success(done ? "Wpis został zaktualizowany." : "Trening zapisany w historii.");
    } catch {
      const message = "Nie udało się zapisać treningu. Spróbuj ponownie.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bw-section">
      <h2 className="bw-section-title">
        {done ? "Sesja oznaczona jako wykonana" : "Oznacz sesję jako wykonaną"}
      </h2>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-sm font-medium">Odczuwany wysiłek (RPE) 0–10</span>
          <span className="text-muted-foreground">{rpe}/10</span>
        </div>
        <Slider
          aria-label="Odczuwany wysiłek (RPE)"
          min={0}
          max={10}
          step={1}
          value={[rpe]}
          onValueChange={(v) => setRpe(v[0])}
        />
      </div>

      {externalSession && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Czas (min)" htmlFor={durationInputId}>
            <Input
              id={durationInputId}
              type="number"
              min={0}
              max={300}
              value={durationMin}
              onChange={(event) =>
                setDurationMin(Math.max(0, Math.min(300, Number(event.target.value) || 0)))
              }
            />
          </Field>
          <Field label="Charakter wysiłku" htmlFor={activityInputId}>
            <Select
              value={activityType}
              onValueChange={(value) => setActivityType(value as typeof activityType)}
            >
              <SelectTrigger id={activityInputId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technical">Głównie z piłką</SelectItem>
                <SelectItem value="mixed">Mieszany</SelectItem>
                <SelectItem value="running_endurance">Głównie biegowy / wydolnościowy</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {healthPersonalizationEnabled && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <LogField label="Ból 0–10" value={pain} onChange={setPain} />
          <LogField label="Zmęczenie nóg 0–10" value={legFatigue} onChange={setLegFatigue} />
        </div>
      )}

      {healthPersonalizationEnabled ? (
        <Field
          label="Notatki po sesji"
          htmlFor={notesInputId}
          className="mt-4"
          help="Notatka może zawierać dane o zdrowiu i jest zapisywana tylko przy aktywnej zgodzie zdrowotnej."
        >
          <Textarea
            id={notesInputId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jak poszło? Sen, ból, dodatkowe uwagi…"
            rows={2}
          />
        </Field>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Notatki i dane o zdrowiu wymagają opcjonalnej zgody. RPE, czas i rodzaj wysiłku zapisują
          się normalnie.
        </p>
      )}

      {saveError && (
        <StatusMessage tone="error" className="mt-4">
          {saveError}
        </StatusMessage>
      )}
      <Button onClick={save} disabled={saving} className="mt-5 w-full sm:w-auto">
        {saving ? "Zapisywanie…" : done ? "Zaktualizuj wpis" : "Oznacz jako wykonane"}
      </Button>
    </div>
  );
}

export function ClubMonitoring() {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      Po treningu z drużyną wpisz czas i odczuwany wysiłek.
    </p>
  );
}
