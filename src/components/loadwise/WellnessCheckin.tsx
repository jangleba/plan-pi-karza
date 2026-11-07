import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildReadiness } from "@/lib/loadwise/readinessModel";
import type { Readiness } from "@/lib/loadwise/types";

type Option = { value: number; label: string };

function Choices({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  options: Option[];
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className={`grid gap-2 ${options.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-xl border px-2 py-2 text-sm ${value === option.value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Optional daily self-report: sleep, fatigue and muscle soreness only.
 * No pain, injury or medical-symptom questions; the app is not a medical tool.
 */
export function WellnessCheckin({
  open,
  onOpenChange,
  enabled,
  date,
  previous,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
  date: string;
  previous?: Readiness;
  onSave: (readiness: Readiness) => Promise<void>;
}) {
  const [sleep, setSleep] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !enabled) return;
    // Keep unanswered questions empty. Closing the dialog never creates a record.
    setSleep(previous ? (previous.sleep >= 7 ? 8 : previous.sleep <= 2 ? 2 : 5) : null);
    setFatigue(previous ? (previous.fatigue >= 9 ? 9 : previous.fatigue <= 3 ? 2 : 5) : null);
    setSoreness(previous ? (previous.soreness >= 9 ? 9 : previous.soreness <= 3 ? 2 : 5) : null);
    setError("");
    setSaving(false);
  }, [open, enabled, date, previous]);

  if (!enabled) return null;
  const complete = sleep !== null && fatigue !== null && soreness !== null;

  async function save() {
    if (!enabled || !complete || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(
        buildReadiness(date, {
          sleep: sleep!,
          fatigue: fatigue!,
          soreness: soreness!,
          jointPain: 0,
        }),
      );
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-sm overflow-y-auto border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>Jak się dziś czujesz?</DialogTitle>
          <DialogDescription>
            Opcjonalnie. Odpowiedzi pomogą dopasować dzisiejszą sesję.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <Choices
            label="Jak spałeś?"
            value={sleep}
            disabled={saving}
            onChange={setSleep}
            options={[
              { value: 8, label: "Dobrze" },
              { value: 5, label: "Średnio" },
              { value: 2, label: "Bardzo słabo" },
            ]}
          />
          <Choices
            label="Zmęczenie"
            value={fatigue}
            disabled={saving}
            onChange={setFatigue}
            options={[
              { value: 2, label: "Małe" },
              { value: 5, label: "Średnie" },
              { value: 9, label: "Duże" },
            ]}
          />
          <Choices
            label="Obolałość mięśni"
            value={soreness}
            disabled={saving}
            onChange={setSoreness}
            options={[
              { value: 2, label: "Mała" },
              { value: 5, label: "Średnia" },
              { value: 9, label: "Duża" },
            ]}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            className="min-h-12 w-full rounded-xl"
            disabled={!complete || saving}
            onClick={() => void save()}
          >
            {saving ? "Zapisujemy…" : "Zapisz samopoczucie"}
          </Button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="min-h-11 w-full text-sm text-muted-foreground"
          >
            Pomiń
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
