import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  exerciseKey,
  plannedSets,
  useExerciseSetLogs,
  type SetLog,
} from "@/lib/loadwise/setLogs";
import {
  fieldsForMetric,
  metricKindForExercise,
  metricUnit,
  type MetricField,
} from "@/lib/loadwise/exerciseMetrics";
import {
  PoseFigure,
  getIllustration,
  illustrationKeyForExercise,
} from "@/components/loadwise/exerciseIllustrations";
import { resolveExerciseSheetViewModel } from "@/components/loadwise/ExerciseDetailSheet";

type FieldValues = Record<MetricField["id"], string>;

const EMPTY: FieldValues = { weight: "", reps: "", rir: "", value: "" };

function toValues(log: SetLog | undefined): FieldValues {
  if (!log) return EMPTY;
  return {
    weight: log.weightKg != null ? String(log.weightKg) : "",
    reps: log.reps != null ? String(log.reps) : "",
    rir: log.rir != null ? String(log.rir) : "",
    value: log.metricValue != null ? String(log.metricValue) : "",
  };
}

function describeLog(log: SetLog | undefined, fields: MetricField[], unit: string): string {
  if (!log) return "Pierwszy zapis";
  const parts: string[] = [];
  for (const field of fields) {
    if (field.id === "weight" && log.weightKg != null) parts.push(`${log.weightKg} kg`);
    if (field.id === "reps" && log.reps != null) parts.push(`× ${log.reps}`);
    if (field.id === "rir" && log.rir != null) parts.push(`RIR ${log.rir}`);
    if (field.id === "value" && log.metricValue != null)
      parts.push(`${log.metricValue}${unit ? ` ${unit}` : ""}`);
  }
  return parts.length ? `Ostatnio: ${parts.join(" · ")}` : "Pierwszy zapis";
}

function NumberField({
  field,
  value,
  onChange,
}: {
  field: MetricField;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </span>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-3">
        <input
          type="number"
          inputMode="decimal"
          step={field.step ?? 1}
          min={0}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-lg font-semibold tabular-nums text-foreground outline-none"
        />
        {field.suffix && (
          <span className="text-[11px] text-muted-foreground">{field.suffix}</span>
        )}
      </div>
    </label>
  );
}

/**
 * Jeden reusable ekran wykonywania ćwiczenia sterowany danymi:
 * widok serii + widok „Technika”. Bez osobnego kodu per ruch.
 */
export function ExerciseRunnerScreen({
  exercise,
  sessionId,
  open,
  onClose,
}: {
  exercise: TrainingExercise;
  sessionId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<"sets" | "technique">("sets");
  const [setNumber, setSetNumber] = useState(1);
  const [values, setValues] = useState<FieldValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [frame, setFrame] = useState(0);

  const total = Math.max(1, plannedSets(exercise));
  const key = exerciseKey(exercise);
  const { current, previous, loading, saveSet } = useExerciseSetLogs(sessionId, key);
  const metricKind = useMemo(() => metricKindForExercise(exercise), [exercise]);
  const fields = useMemo(() => fieldsForMetric(metricKind), [metricKind]);
  const unit = metricUnit(metricKind);
  const illustration = getIllustration(illustrationKeyForExercise(exercise));
  const details = resolveExerciseSheetViewModel(exercise);
  const cues = details.cues.slice(0, 3);
  const doneCount = Object.keys(current).length;

  useEffect(() => {
    if (!open || loading) return;
    let next = 1;
    while (next <= total && current[next]) next += 1;
    setSetNumber(Math.min(next, total));
  }, [open, loading, total, doneCount]);

  useEffect(() => {
    setValues(toValues(current[setNumber]));
  }, [setNumber, loading, open]);

  useEffect(() => {
    if (!open) setView("sets");
  }, [open]);

  if (!open) return null;

  const last = previous[setNumber] ?? previous[1];
  const hint = describeLog(last, fields, unit);
  const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <button
          type="button"
          onClick={() => (view === "technique" ? setView("sets") : onClose())}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
          aria-label="Wróć"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">
            {exercise.name}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {view === "technique"
              ? "Technika"
              : exercise.displayPrescription || `${total} serie`}
          </div>
        </div>
      </header>

      {view === "sets" ? (
        <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
          <button
            type="button"
            onClick={() => setView("technique")}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-primary/5">
              {illustration ? (
                <PoseFigure pose={illustration.frames[0].pose} />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  Technika
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">Technika ruchu</div>
              <div className="truncate text-[12px] text-muted-foreground">
                Ilustracja, 3 wskazówki i błędy
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground/60" />
          </button>

          <div className="mt-5 flex items-center gap-1.5">
            {Array.from({ length: total }, (_, index) => index + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSetNumber(n)}
                className={`h-1.5 flex-1 rounded-full ${
                  current[n] ? "bg-primary" : n === setNumber ? "bg-primary/40" : "bg-border"
                }`}
                aria-label={`Seria ${n}`}
              />
            ))}
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-xl font-semibold tracking-tight text-foreground">
              Seria {setNumber}/{total}
            </div>
            <div className="text-[12px] font-medium text-muted-foreground">
              {doneCount}/{total} wykonane
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-[12px]">
            <span className="min-w-0 truncate text-muted-foreground">{hint}</span>
            {last && (
              <button
                type="button"
                onClick={() => setValues(toValues(last))}
                className="shrink-0 font-semibold text-primary"
              >
                Użyj
              </button>
            )}
          </div>

          <div className="mt-4 flex items-end gap-3">
            {fields.map((field) => (
              <NumberField
                key={field.id}
                field={field}
                value={values[field.id]}
                onChange={(next) => setValues((state) => ({ ...state, [field.id]: next }))}
              />
            ))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await saveSet({
                setNumber,
                weightKg: num(values.weight),
                reps: num(values.reps),
                rir: num(values.rir),
                metricKind: metricKind === "load" ? null : metricKind,
                metricValue: num(values.value),
              });
              setSaving(false);
              if (!ok) return;
              if (setNumber < total) setSetNumber(setNumber + 1);
              else onClose();
            }}
            className="mt-5 w-full rounded-xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving
              ? "Zapisuję…"
              : setNumber < total
                ? "Zapisz serię"
                : "Zapisz i zakończ"}
          </button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
          {illustration ? (
            <>
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-primary/5">
                <PoseFigure pose={illustration.frames[frame].pose} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-foreground">
                  {illustration.frames[frame].caption}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {frame + 1}/{illustration.frames.length}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {illustration.frames.map((item, index) => (
                  <button
                    key={item.caption}
                    type="button"
                    onClick={() => setFrame(index)}
                    className={`h-1.5 flex-1 rounded-full ${
                      index === frame ? "bg-primary" : "bg-border"
                    }`}
                    aria-label={`Klatka ${index + 1}`}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
              Ilustracja tego ruchu nie jest jeszcze dostępna.
            </div>
          )}

          {cues.length > 0 && (
            <ul className="mt-5 space-y-2">
              {cues.map((cue, index) => (
                <li key={index} className="flex gap-2 text-[14px] text-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>{cue}</span>
                </li>
              ))}
            </ul>
          )}

          {details.errors.length > 0 && (
            <div className="mt-5 rounded-xl border border-border/70">
              <button
                type="button"
                onClick={() => setErrorsOpen((state) => !state)}
                className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold text-foreground"
              >
                Najczęstsze błędy
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    errorsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {errorsOpen && (
                <ul className="space-y-1.5 px-4 pb-3 text-[13px] text-muted-foreground">
                  {details.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setView("sets")}
            className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground"
          >
            Wróć do serii
          </button>
        </div>
      )}
    </div>
  );
}
