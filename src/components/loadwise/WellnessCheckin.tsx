import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildReadiness,
  PAIN_LOCATION_OPTIONS,
  READINESS_RED_FLAG_OPTIONS,
} from "@/lib/loadwise/readinessModel";
import type { PainLocation, Readiness } from "@/lib/loadwise/types";

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

/** Optional self-report, collected only with explicit health-personalization consent. */
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
  const [pain, setPain] = useState<number | null>(null);
  const [location, setLocation] = useState<PainLocation | "">("");
  const [altersMovement, setAltersMovement] = useState(false);
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !enabled) return;
    // Keep unanswered questions empty. Closing the dialog never creates a record.
    setSleep(previous ? (previous.sleep >= 7 ? 8 : previous.sleep <= 2 ? 2 : 5) : null);
    setFatigue(previous ? (previous.fatigue >= 9 ? 9 : previous.fatigue <= 3 ? 2 : 5) : null);
    setSoreness(previous ? (previous.soreness >= 9 ? 9 : previous.soreness <= 3 ? 2 : 5) : null);
    setPain(
      previous
        ? previous.jointPain >= 7
          ? 8
          : previous.jointPain >= 4
            ? 5
            : previous.jointPain > 0
              ? 2
              : 0
        : null,
    );
    setLocation(previous?.painLocation ?? "");
    setAltersMovement(previous?.altersMovement ?? false);
    setRedFlags(previous?.redFlags ?? []);
    setError("");
    setSaving(false);
  }, [open, enabled, date, previous]);

  if (!enabled) return null;
  const complete =
    sleep !== null &&
    fatigue !== null &&
    soreness !== null &&
    pain !== null &&
    (pain === 0 || location !== "");
  const stop =
    redFlags.length > 0 ||
    (pain !== null && pain >= 7) ||
    (pain !== null && pain > 0 && altersMovement);

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
          jointPain: pain!,
          painLocation: location || null,
          altersMovement: pain! > 0 && altersMovement,
          redFlags,
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
          <Choices
            label="Ból poza zwykłymi zakwasami"
            value={pain}
            disabled={saving}
            onChange={setPain}
            options={[
              { value: 0, label: "Brak" },
              { value: 2, label: "Lekki" },
              { value: 5, label: "Wyraźny" },
              { value: 8, label: "Silny" },
            ]}
          />
          {pain !== null && pain > 0 && (
            <div className="space-y-3">
              <label className="block space-y-2 text-sm font-medium">
                <span>Gdzie odczuwasz ból?</span>
                <select
                  value={location}
                  disabled={saving}
                  onChange={(event) => setLocation(event.target.value as PainLocation | "")}
                  className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
                >
                  <option value="">Wybierz miejsce</option>
                  {PAIN_LOCATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={altersMovement}
                  disabled={saving}
                  onChange={(event) => setAltersMovement(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-primary"
                />
                Ból zmienia mój chód lub ruch
              </label>
            </div>
          )}
          <details className="rounded-xl border border-border px-3">
            <summary className="cursor-pointer py-3 text-sm font-medium">
              Niepokojące objawy
            </summary>
            <div className="pb-2">
              {READINESS_RED_FLAG_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed"
                >
                  <input
                    type="checkbox"
                    checked={redFlags.includes(option.value)}
                    disabled={saving}
                    onChange={(event) =>
                      setRedFlags((current) =>
                        event.target.checked
                          ? [...current, option.value]
                          : current.filter((value) => value !== option.value),
                      )
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </details>
          {stop && (
            <p role="status" className="rounded-xl bg-destructive/10 p-3 text-sm">
              Wstrzymaj wysiłek i ustal dalsze postępowanie z lekarzem. W nagłym zagrożeniu wezwij
              pomoc.
            </p>
          )}
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
