import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
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
import { resolveExerciseSheetViewModel } from "@/components/loadwise/ExerciseDetailSheet";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import {
  parseTrainingFields,
  parseTrainingNumber,
  trainingStorageKey,
  validateTrainingFields,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { ExercisePersonalNote } from "./session/ExercisePersonalNote";
import { SprintRestTimer } from "./session/SprintRestTimer";
import { NextExercisePreview } from "./session/SessionQuickTools";

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
  disabled,
}: {
  field: MetricField;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </span>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-3">
        <input
          type="text"
          inputMode="decimal"
          maxLength={32}
          aria-label={field.label}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-lg font-semibold tabular-nums text-foreground outline-none"
        />
        {field.suffix && <span className="text-[11px] text-muted-foreground">{field.suffix}</span>}
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
  onComplete,
  nextExercise,
  date,
}: {
  exercise: TrainingExercise;
  sessionId?: string | null;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  nextExercise?: TrainingExercise;
  date?: string;
}) {
  const [view, setView] = useState<"sets" | "technique">("sets");
  const [setNumber, setSetNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const [progressionChoice, setProgressionChoice] = useState<"accepted" | "repeat" | null>(null);
  const { state } = useLoadwise();
  const { user } = useAuth();
  const selectedContext = useRef<string | null>(null);
  const activeContext = useRef<string>("");
  const isOpen = useRef(open);
  isOpen.current = open;
  const [restToken, setRestToken] = useState(0);

  const total = Math.max(1, plannedSets(exercise));
  const key = exerciseKey(exercise);
  const logs = useExerciseSetLogs(sessionId, key);
  const { current, previous, loading, saveSet } = logs;
  const recentSessions =
    "recentSessions" in logs && Array.isArray(logs.recentSessions)
      ? (logs.recentSessions as { sets: SetLog[] }[])
      : [{ sets: Object.values(previous) }];
  const context = trainingStorageKey("screen", user?.id, sessionId ?? date ?? "unattached", key);
  activeContext.current = context;
  const draft = useTrainingLocalState(
    trainingStorageKey(
      "draft",
      user?.id,
      sessionId ?? date ?? "unattached",
      key,
      String(setNumber),
    ),
    toValues(current[setNumber]),
    parseTrainingFields,
  );
  const values = draft.value;
  const setValues = draft.setValue;
  const metricKind = useMemo(() => metricKindForExercise(exercise), [exercise]);
  const fields = useMemo(() => fieldsForMetric(metricKind), [metricKind]);
  const unit = metricUnit(metricKind);
  const illustration = getIllustration(illustrationKeyForExercise(exercise));
  const techniqueImage = getExerciseTechniqueImage(exercise.exerciseId);
  const frameIndex = Math.min(frame, Math.max(0, (illustration?.frames.length ?? 1) - 1));
  const details = resolveExerciseSheetViewModel(exercise);
  const cues = details.cues.slice(0, 3);
  const doneCount = Array.from({ length: total }, (_, index) => index + 1).filter(
    (number) => current[number],
  ).length;
  const hasSavedLoad = [...Object.values(previous), ...Object.values(current)].some(
    (log) => log?.weightKg != null && log.weightKg >= 0,
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
    if (!open) {
      selectedContext.current = null;
      return;
    }
    if (loading || selectedContext.current === context) return;
    selectedContext.current = context;
    let next = 1;
    while (next <= total && current[next]) next += 1;
    setSetNumber(Math.min(next, total));
  }, [open, loading, total, context, current]);

  useEffect(() => {
    if (!open) {
      setView("sets");
      setProgressionChoice(null);
      setBaselineError(null);
      setRestToken(0);
    }
  }, [open, context]);
  useEffect(() => {
    setBaselineError(null);
    setProgressionChoice(null);
    setRestToken(0);
    setFrame(0);
  }, [context]);

  if (!open) return null;

  const last = previous[setNumber];
  const hint = loading ? "Wczytuję historię…" : describeLog(last, fields, unit);
  const num = parseTrainingNumber;
  const willComplete = Array.from({ length: total }, (_, index) => index + 1).every(
    (number) => number === setNumber || current[number],
  );
  const rest = exercise.restAfterPair || exercise.restAfterExercise;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <button
          type="button"
          disabled={saving}
          onClick={() => (view === "technique" ? setView("sets") : onClose())}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
          aria-label="Wróć"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{exercise.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {view === "technique" ? "Technika" : exercise.displayPrescription || `${total} serie`}
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
              {techniqueImage ? (
                <img
                  src={techniqueImage.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={768}
                  height={512}
                  className="h-full w-full object-contain"
                />
              ) : illustration ? (
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
                className={`min-h-11 flex-1 rounded-xl text-xs font-semibold ${
                  current[n]
                    ? "bg-primary text-primary-foreground"
                    : n === setNumber
                      ? "bg-primary/40"
                      : "bg-border"
                }`}
                aria-label={`Seria ${n}`}
                aria-pressed={n === setNumber}
                disabled={saving || loading}
              >
                {n}
              </button>
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
            <span className="min-w-0 text-muted-foreground">{hint}</span>
            {last && !loading && (
              <button
                type="button"
                onClick={() => setValues(toValues(last))}
                className="shrink-0 font-semibold text-primary"
              >
                Użyj
              </button>
            )}
          </div>

          {recommendation && (
            <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-3">
              <div className="text-[13px] font-semibold text-foreground">
                {recommendation.weightKg === null
                  ? recommendation.title
                  : `${recommendation.title}: ${formatKg(recommendation.weightKg)} kg`}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {recommendation.reason}
              </div>

              {recommendation.mode === "increase" &&
              recommendation.weightKg !== null &&
              recommendation.currentWeightKg !== null ? (
                <div className="mt-3 grid gap-2">
                  <button
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
                    className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground"
                  >
                    Akceptuję {formatKg(recommendation.weightKg)} kg
                  </button>
                  <button
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
                    className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-semibold text-foreground"
                  >
                    Jeszcze jedna sesja tym ciężarem
                  </button>
                </div>
              ) : recommendation.weightKg !== null ? (
                <button
                  type="button"
                  onClick={() =>
                    setValues((currentValues) => ({
                      ...currentValues,
                      weight: String(recommendation.weightKg),
                    }))
                  }
                  className="mt-2 text-[12px] font-semibold text-primary"
                >
                  Ustaw {formatKg(recommendation.weightKg)} kg
                </button>
              ) : null}

              {progressionChoice && (
                <div className="mt-2 text-[11px] font-medium text-primary">
                  {progressionChoice === "accepted"
                    ? "Propozycja ustawiona."
                    : "Zostajemy przy obecnym ciężarze i ocenimy kolejną sesję."}
                </div>
              )}
            </div>
          )}

          {needsStartingLoad && (
            <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-3">
              <div className="text-[13px] font-semibold text-foreground">Ustal ciężar startowy</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Wpisz ciężar, którym wykonujesz dziś poprawnie zaplanowaną liczbę powtórzeń.
                Zapiszemy go jako punkt wyjścia.
              </div>
            </div>
          )}

          <div className="mt-4 flex items-end gap-3">
            {fields.map((field) => (
              <NumberField
                key={field.id}
                field={field}
                value={values[field.id]}
                disabled={saving || loading}
                onChange={(next) => {
                  setValues((state) => ({ ...state, [field.id]: next }));
                  if (field.id === "weight") setBaselineError(null);
                }}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {metricKind === "load"
              ? "0 kg oznacza brak dodatkowego obciążenia. RIR to liczba powtórzeń pozostających w zapasie."
              : "Zapisz faktycznie wykonaną wartość."}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" role="status">
            {draft.available
              ? "Niezapisany wpis zachowujemy na tym urządzeniu."
              : "Zapis szkicu niedostępny — wpis pozostaje w otwartym ekranie."}
          </p>
          <ExercisePersonalNote exercise={exercise} />
          {rest && (
            <div className="mt-3 rounded-xl border border-border/60 bg-card p-3">
              <SprintRestTimer
                key={context}
                label={rest}
                startToken={exercise.restAfterPair ? undefined : restToken}
                nextLabel={`seria ${setNumber} z ${total}`}
              />
              {exercise.restAfterPair && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Przerwę po parze uruchom po wykonaniu obu ćwiczeń.
                </p>
              )}
            </div>
          )}
          <div className="mt-3">
            <NextExercisePreview exercise={nextExercise} />
          </div>

          {baselineError && (
            <div className="mt-2 text-[12px] font-medium text-destructive">{baselineError}</div>
          )}

          <button
            type="button"
            disabled={saving || loading}
            onClick={async () => {
              const validationError = validateTrainingFields(values, metricKind);
              if (validationError) {
                setBaselineError(validationError);
                return;
              }
              const weightKg = num(values.weight);
              setBaselineError(null);
              setSaving(true);
              const savingContext = context;
              const log: SetLog = {
                setNumber,
                weightKg: metricKind === "load" ? weightKg : null,
                reps: metricKind === "load" ? num(values.reps) : null,
                rir: metricKind === "load" || metricKind === "contacts" ? num(values.rir) : null,
                metricKind: metricKind === "load" ? null : metricKind,
                metricValue: metricKind === "load" ? null : num(values.value),
              };
              try {
                const ok = await saveSet(log);
                if (activeContext.current !== savingContext || !isOpen.current) return;
                if (!ok) {
                  setBaselineError(
                    "Nie udało się zapisać serii. Wpis zachowaliśmy — spróbuj ponownie.",
                  );
                  return;
                }
                draft.clear();
                const saved = { ...current, [setNumber]: log };
                const next = Array.from({ length: total }, (_, index) => index + 1).find(
                  (number) => !saved[number],
                );
                if (next !== undefined) {
                  setSetNumber(next);
                  setRestToken((token) => token + 1);
                } else {
                  onComplete?.();
                  onClose();
                }
              } catch {
                if (activeContext.current === savingContext && isOpen.current)
                  setBaselineError("Zapis nie powiódł się. Wpis zachowaliśmy — spróbuj ponownie.");
              } finally {
                setSaving(false);
              }
            }}
            className="mt-5 w-full rounded-xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving
              ? "Zapisuję…"
              : loading
                ? "Wczytuję…"
                : willComplete
                  ? "Zapisz i zakończ"
                  : "Zapisz serię"}
          </button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
          {techniqueImage ? (
            <div className="aspect-[3/2] w-full overflow-hidden rounded-2xl border border-border/60 bg-[#faf9f5]">
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
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-primary/5">
                <PoseFigure pose={illustration.frames[frameIndex].pose} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-foreground">
                  {illustration.frames[frameIndex].caption}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {frameIndex + 1}/{illustration.frames.length}
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
