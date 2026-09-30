import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { exerciseKey, plannedSets, useExerciseSetLogs, type SetLog } from "@/lib/loadwise/setLogs";
import {
  fieldsForMetric,
  metricKindForExercise,
  metricUnit,
  type MetricField,
} from "@/lib/loadwise/exerciseMetrics";
import {
  recommendNextLoad,
  saveStrengthProgressionDecision,
} from "@/lib/loadwise/strengthProgression";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { effectiveSessions, resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import {
  PoseFigure,
  getIllustration,
  illustrationKeyForExercise,
} from "@/components/loadwise/exerciseIllustrations";
import { ExerciseTechniqueContent } from "@/components/loadwise/ExerciseDetailSheet";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import { useActivityExitGuard } from "./ActivityExitGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/app-ui";

type FieldValues = Record<MetricField["id"], string>;

const EMPTY: FieldValues = { weight: "", reps: "", rir: "", value: "" };

function formatKg(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

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
      <span className="text-sm font-medium text-muted-foreground">{field.label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step={field.step ?? 1}
          min={0}
          max={field.id === "rir" ? 10 : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 text-lg font-medium tabular-nums"
        />
        {field.suffix && <span className="text-sm text-muted-foreground">{field.suffix}</span>}
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
  const viewPanelId = useId();
  const [view, setView] = useState<"sets" | "technique">("sets");
  const [setNumber, setSetNumber] = useState(1);
  const [values, setValues] = useState<FieldValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [progressionChoice, setProgressionChoice] = useState<"accepted" | "repeat" | null>(null);
  const { state } = useLoadwise();
  const { user } = useAuth();

  const total = Math.max(1, plannedSets(exercise));
  const key = exerciseKey(exercise);
  const { current, previous, recentSessions, loading, saveSet } = useExerciseSetLogs(
    sessionId,
    key,
  );
  const metricKind = useMemo(() => metricKindForExercise(exercise), [exercise]);
  const fields = useMemo(() => fieldsForMetric(metricKind), [metricKind]);
  const unit = metricUnit(metricKind);
  const illustration = getIllustration(illustrationKeyForExercise(exercise));
  const techniqueImage = getExerciseTechniqueImage(exercise.exerciseId);
  const doneCount = Object.keys(current).length;
  const hasSavedLoad = [...Object.values(previous), ...Object.values(current)].some(
    (log) => log?.weightKg != null && log.weightKg > 0,
  );
  const needsStartingLoad = metricKind === "load" && !hasSavedLoad;
  const sessionContext = useMemo(
    () =>
      effectiveSessions(resolveEffectivePlan(state.plan, state.modifications)).find(
        (item) => item.dbId === sessionId || item.sessionId === sessionId,
      ) ?? null,
    [state.plan, state.modifications, sessionId],
  );
  const recommendation = useMemo(
    () =>
      metricKind === "load"
        ? recommendNextLoad(
            recentSessions.map((item) => item.sets),
            exercise.reps,
            exercise.rir,
            {
              age: state.profile?.age,
              level: state.profile?.level,
              goal: state.profile?.goal,
              gymExperienceLevel: state.profile?.gymExperienceLevel,
              strengthTrainingMonths: state.profile?.strengthTrainingMonths,
              movementCompetence: state.profile?.movementCompetence,
              supervisionLevel: state.profile?.supervisionLevel,
              blockPhaseLabel: sessionContext?.blockPhaseLabel,
              mdLabel: sessionContext?.mdLabel,
              exercise,
            },
          )
        : null,
    [metricKind, recentSessions, exercise, state.profile, sessionContext],
  );

  useEffect(() => {
    if (!open || loading) return;
    let next = 1;
    while (next <= total && current[next]) next += 1;
    setSetNumber(Math.min(next, total));
  }, [open, loading, total, doneCount, current]);

  useEffect(() => {
    setValues(toValues(current[setNumber]));
  }, [setNumber, loading, open, current]);

  useEffect(() => {
    if (!open) {
      setView("sets");
      setProgressionChoice(null);
      setBaselineError(null);
    }
  }, [open]);

  const { requestExit } = useActivityExitGuard({
    dirty:
      open && fields.some((field) => values[field.id] !== toValues(current[setNumber])[field.id]),
    busy: open && saving,
    description: "Wartości bieżącej serii nie zostały zapisane.",
  });

  if (!open) return null;

  const last = previous[setNumber] ?? previous[1];
  const hint = describeLog(last, fields, unit);
  const num = (raw: string) => {
    if (raw.trim() === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  return (
    <div className="bw-workspace flex flex-col overflow-y-auto bg-background">
      <header className="bw-page-content sticky top-0 z-10 mx-auto flex w-full max-w-3xl items-center gap-3 bg-background pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (view === "technique" ? setView("sets") : requestExit(onClose))}
          className="-ml-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
          aria-label="Wróć"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">{exercise.name}</div>
          <div className="text-sm text-muted-foreground">
            {view === "technique" ? "Technika" : exercise.displayPrescription || `${total} serie`}
          </div>
        </div>
      </header>

      <div className="bw-page-content mx-auto w-full max-w-3xl py-3">
        <Tabs
          value={view}
          options={[
            { value: "sets", label: "Serie" },
            { value: "technique", label: "Technika" },
          ]}
          onChange={setView}
          label="Widok ćwiczenia"
          panelId={viewPanelId}
        />
      </div>

      {view === "sets" ? (
        <div
          id={viewPanelId}
          role="tabpanel"
          aria-label="Serie"
          tabIndex={0}
          className="bw-page-content mx-auto w-full max-w-3xl pb-8 pt-4"
        >
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-1.5">
            {Array.from({ length: total }, (_, index) => index + 1).map((n) => (
              <Button
                key={n}
                type="button"
                variant="ghost"
                onClick={() => requestExit(() => setSetNumber(n))}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium ${
                  current[n]
                    ? "bg-primary text-primary-foreground"
                    : n === setNumber
                      ? "bg-primary/40"
                      : "bg-border"
                }`}
                aria-label={`Seria ${n}`}
                aria-pressed={n === setNumber}
              >
                {n}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-xl font-semibold tracking-tight text-foreground">
              Seria {setNumber}/{total}
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {doneCount}/{total} wykonane
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 text-muted-foreground">{hint}</span>
            {last && (
              <Button
                type="button"
                onClick={() => setValues(toValues(last))}
                variant="ghost"
                className="shrink-0"
              >
                Użyj
              </Button>
            )}
          </div>

          {recommendation && (
            <div className="mt-5 py-2">
              <div className="text-sm font-semibold text-foreground">
                {recommendation.weightKg === null
                  ? recommendation.title
                  : `${recommendation.title}: ${formatKg(recommendation.weightKg)} kg`}
              </div>
              <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {recommendation.reason}
              </div>

              {recommendation.mode === "increase" &&
              recommendation.weightKg !== null &&
              recommendation.currentWeightKg !== null ? (
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setValues((currentValues) => ({
                        ...currentValues,
                        weight: String(recommendation.weightKg),
                      }));
                      setProgressionChoice("accepted");
                      if (user && sessionId) {
                        saveStrengthProgressionDecision(user.id, {
                          sessionId,
                          exerciseKey: key,
                          decision: "accepted",
                          currentWeightKg: recommendation.currentWeightKg!,
                          proposedWeightKg: recommendation.weightKg!,
                          decidedAt: new Date().toISOString(),
                        });
                      }
                    }}
                    className="h-auto min-h-11 whitespace-normal"
                  >
                    Akceptuję {formatKg(recommendation.weightKg)} kg
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setValues((currentValues) => ({
                        ...currentValues,
                        weight: String(recommendation.currentWeightKg),
                      }));
                      setProgressionChoice("repeat");
                      if (user && sessionId) {
                        saveStrengthProgressionDecision(user.id, {
                          sessionId,
                          exerciseKey: key,
                          decision: "repeat",
                          currentWeightKg: recommendation.currentWeightKg!,
                          proposedWeightKg: recommendation.weightKg!,
                          decidedAt: new Date().toISOString(),
                        });
                      }
                    }}
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal"
                  >
                    Jeszcze jedna sesja tym ciężarem
                  </Button>
                </div>
              ) : recommendation.weightKg !== null ? (
                <Button
                  type="button"
                  onClick={() =>
                    setValues((currentValues) => ({
                      ...currentValues,
                      weight: String(recommendation.weightKg),
                    }))
                  }
                  variant="ghost"
                  className="mt-2"
                >
                  Ustaw {formatKg(recommendation.weightKg)} kg
                </Button>
              ) : null}

              {progressionChoice && (
                <div className="mt-2 text-sm font-medium text-primary">
                  {progressionChoice === "accepted"
                    ? "Propozycja ustawiona."
                    : "Zostajemy przy obecnym ciężarze i ocenimy kolejną sesję."}
                </div>
              )}
            </div>
          )}

          {needsStartingLoad && (
            <div className="mt-5 py-2">
              <div className="text-sm font-semibold text-foreground">Ustal ciężar startowy</div>
              <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                Wpisz ciężar, którym wykonujesz dziś poprawnie zaplanowaną liczbę powtórzeń.
                Zapiszemy go jako punkt wyjścia.
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {fields.map((field) => (
              <NumberField
                key={field.id}
                field={field}
                value={values[field.id]}
                onChange={(next) => {
                  setValues((state) => ({ ...state, [field.id]: next }));
                  if (field.id === "weight") setBaselineError(null);
                }}
              />
            ))}
          </div>

          {baselineError && (
            <div className="mt-2 text-sm font-medium text-destructive">{baselineError}</div>
          )}

          <Button
            disabled={saving}
            onClick={async () => {
              const weightKg = num(values.weight);
              if (metricKind === "load" && (!weightKg || weightKg <= 0)) {
                setBaselineError("Wpisz używany ciężar, aby zapisać punkt wyjścia.");
                return;
              }
              setBaselineError(null);
              setSaving(true);
              const ok = await saveSet({
                setNumber,
                weightKg,
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
            className="mt-6"
          >
            {saving ? "Zapisuję…" : setNumber < total ? "Zapisz serię" : "Zapisz i zakończ"}
          </Button>
        </div>
      ) : (
        <div
          id={viewPanelId}
          role="tabpanel"
          aria-label="Technika"
          tabIndex={0}
          className="bw-page-content mx-auto w-full max-w-3xl pb-8 pt-4"
        >
          <ExerciseTechniqueContent
            exercise={exercise}
            visual={
              <>
                {techniqueImage ? (
                  <div className="aspect-[3/2] w-full overflow-hidden bg-[#faf9f5]">
                    <img
                      src={techniqueImage.src}
                      alt={techniqueImage.alt}
                      loading="eager"
                      decoding="async"
                      width={768}
                      height={512}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : illustration ? (
                  <>
                    <div className="aspect-square w-full overflow-hidden bg-primary/5">
                      <PoseFigure pose={illustration.frames[frame].pose} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {illustration.frames[frame].caption}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {frame + 1}/{illustration.frames.length}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-1.5">
                      {illustration.frames.map((item, index) => (
                        <Button
                          key={item.caption}
                          type="button"
                          variant="ghost"
                          onClick={() => setFrame(index)}
                          className={`min-h-11 flex-1 rounded-lg text-sm font-medium ${
                            index === frame ? "bg-primary text-primary-foreground" : "bg-border"
                          }`}
                          aria-label={`Klatka ${index + 1}`}
                          aria-pressed={index === frame}
                        >
                          {index + 1}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-sm text-muted-foreground">
                    Ilustracja tego ruchu nie jest jeszcze dostępna.
                  </div>
                )}
              </>
            }
          />

          <Button onClick={() => setView("sets")} className="mt-6 w-full sm:w-auto">
            Wróć do serii
          </Button>
        </div>
      )}
    </div>
  );
}
