import { useEffect, useState } from "react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  exerciseKey,
  formatLastSet,
  plannedSets,
  useExerciseSetLogs,
} from "@/lib/loadwise/setLogs";

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums text-foreground outline-none"
        />
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

/**
 * Subtelne rejestrowanie serii ćwiczenia siłowego: podpowiedź „Ostatnio”,
 * uzupełnienie jednym dotknięciem i trwały zapis serii.
 */
export function SetLogger({
  exercise,
  sessionId,
}: {
  exercise: TrainingExercise;
  sessionId: string | null | undefined;
}) {
  const total = Math.max(1, plannedSets(exercise));
  const key = exerciseKey(exercise);
  const { current, previous, loading, saveSet } = useExerciseSetLogs(sessionId, key);
  const [setNumber, setSetNumber] = useState(1);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [saving, setSaving] = useState(false);

  const doneCount = Object.keys(current).length;
  const allDone = doneCount >= total;

  useEffect(() => {
    if (loading) return;
    let next = 1;
    while (next <= total && current[next]) next += 1;
    setSetNumber(Math.min(next, total));
  }, [loading, total, doneCount]);

  useEffect(() => {
    const saved = current[setNumber];
    setWeight(saved?.weightKg != null ? String(saved.weightKg) : "");
    setReps(saved?.reps != null ? String(saved.reps) : "");
    setRir(saved?.rir != null ? String(saved.rir) : "");
  }, [setNumber, loading]);

  if (loading) {
    return <div className="mt-2 h-8 animate-pulse rounded-lg bg-muted/50" />;
  }

  if (allDone) {
    return (
      <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary">
        <span>
          {doneCount}/{total} wykonane
        </span>
        <button
          type="button"
          onClick={() => setSetNumber(total)}
          className="font-medium text-primary/70"
        >
          Popraw
        </button>
      </div>
    );
  }

  const last = previous[setNumber] ?? previous[1];
  const hint = formatLastSet(last);

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-foreground/80">
          Seria {setNumber}/{total}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{hint}</span>
        {last && (
          <button
            type="button"
            onClick={() => {
              setWeight(last.weightKg != null ? String(last.weightKg) : "");
              setReps(last.reps != null ? String(last.reps) : "");
              setRir(last.rir != null ? String(last.rir) : "");
            }}
            className="shrink-0 font-semibold text-primary"
          >
            Użyj
          </button>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <NumberField label="Ciężar" value={weight} onChange={setWeight} suffix="kg" step={2.5} />
        <NumberField label="Powt." value={reps} onChange={setReps} />
        <NumberField label="RIR" value={rir} onChange={setRir} />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const ok = await saveSet({
            setNumber,
            weightKg: weight.trim() === "" ? null : Number(weight),
            reps: reps.trim() === "" ? null : Number(reps),
            rir: rir.trim() === "" ? null : Number(rir),
          });
          setSaving(false);
          if (ok && setNumber < total) setSetNumber(setNumber + 1);
        }}
        className="mt-2.5 w-full rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Zapisuję…" : "Zapisz serię"}
      </button>
    </div>
  );
}
