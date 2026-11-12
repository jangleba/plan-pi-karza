import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { useExerciseSetLogs, type SetLog } from "@/lib/loadwise/setLogs";
import { verifyExerciseHistory, type ExerciseSessionLog } from "@/lib/loadwise/setLogHistory";
import {
  parseTrainingNumber,
  trainingStorageKey,
  validateTrainingFields,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { effectiveSessions } from "@/lib/loadwise/effectivePlan";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { recentSessionFeedback } from "@/lib/loadwise/postSessionFeedback";
import {
  recommendNextLoad,
  saveStrengthProgressionDecision,
} from "@/lib/loadwise/strengthProgression";
import type { Range } from "@/lib/loadwise/sessionRunner/presentation";

export type SetTableKind = "load" | "bodyweight" | "hold";
type Values = { weight: string; reps: string; rir: string; value: string };
const EMPTY: Values = { weight: "", reps: "", rir: "", value: "" };
type Drafts = Record<string, Values>;

const parseDrafts = (value: unknown): Drafts | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Drafts = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{1,2}$/.test(key) || !raw || typeof raw !== "object") return undefined;
    const v = raw as Record<string, unknown>;
    if (
      !["weight", "reps", "rir", "value"].every(
        (f) => typeof v[f] === "string" && (v[f] as string).length <= 32,
      )
    )
      return undefined;
    out[key] = v as Values;
  }
  return out;
};

function fromLog(log: SetLog | undefined): Values {
  if (!log) return EMPTY;
  return {
    weight: log.weightKg != null ? String(log.weightKg) : "",
    reps: log.reps != null ? String(log.reps) : "",
    rir: log.rir != null ? String(log.rir) : "",
    value: log.metricValue != null ? String(log.metricValue) : "",
  };
}

const kg = (value: number) => value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

/** "60 kg × 5", "× 8 / str.", "30 s" — one saved set in one line. */
function savedLine(log: SetLog, kind: SetTableKind, unilateral: boolean): string {
  const side = unilateral ? " / str." : "";
  if (kind === "hold") return `${log.metricValue != null ? kg(log.metricValue) : "–"} s${side}`;
  if (kind === "load" && log.weightKg != null)
    return `${kg(log.weightKg)} kg × ${log.reps ?? "–"}${side}`;
  return `${log.reps ?? "–"} powt.${side}`;
}

/** Adds a step to a typed number, never below zero; empty starts from zero. */
function stepValue(raw: string, delta: number): string {
  const current = parseTrainingNumber(raw) ?? 0;
  const next = Math.max(0, Math.round((current + delta) * 100) / 100);
  return String(next).replace(".", ",");
}

/**
 * Easy set entry: one set at a time with steppers prefilled from the previous
 * set or last session, an optional "zapas" pick, and one save button that
 * starts the rest. Saved sets stay above as rows; tapping one corrects it
 * under the same set number. Only the fields this exercise records.
 */
export function SetTable({
  exercise,
  sessionId,
  date,
  logKey,
  kind,
  sets,
  withRir,
  unilateral,
  canRecord,
  onSetSaved,
  finishing = false,
  onFinish,
}: {
  exercise: TrainingExercise;
  sessionId?: string | null;
  date: string;
  logKey: string;
  kind: SetTableKind;
  sets: Range;
  withRir: boolean;
  unilateral: boolean;
  canRecord: boolean;
  onSetSaved: (setNumber: number, savedCount: number, isNew: boolean) => void;
  finishing?: boolean;
  /** Marks the exercise after the minimum of a range, or retries a failed final mark. */
  onFinish?: () => void;
}) {
  const { user } = useAuth();
  const logs = useExerciseSetLogs(sessionId, logKey);
  const { current, previous, loading, saveSet } = logs;
  const drafts = useTrainingLocalState<Drafts>(
    trainingStorageKey("set-table", user?.id, sessionId ?? date, logKey),
    {},
    parseDrafts,
  );
  const [saving, setSaving] = useState<number | null>(null);
  /** A saved set opened for correction; otherwise the entry shows the next open set. */
  const [editing, setEditing] = useState<number | null>(null);
  const rirId = useId();
  const [error, setError] = useState<{ set: number; text: string } | null>(null);
  const lock = useRef(false);
  const total = Math.max(
    sets.max,
    ...Object.keys(current)
      .map(Number)
      .filter((n) => n <= 20),
  );
  const numbers = Array.from({ length: total }, (_, i) => i + 1);
  const savedCount = numbers.filter((n) => current[n]).length;
  const nextOpen = numbers.find((n) => !current[n]) ?? null;
  const metricKind = kind === "hold" ? "hold" : "load";

  const valuesFor = useCallback(
    (n: number): Values => {
      const draft = drafts.value[String(n)];
      if (draft) return draft;
      if (current[n]) return fromLog(current[n]);
      // Prefill with this session's previous set, else the same set last time (without its RIR).
      if (current[n - 1]) return fromLog(current[n - 1]);
      return previous[n] ? { ...fromLog(previous[n]), rir: "" } : EMPTY;
    },
    [drafts.value, current, previous],
  );

  function edit(n: number, field: keyof Values, value: string) {
    drafts.setValue((all) => ({ ...all, [String(n)]: { ...valuesFor(n), [field]: value } }));
    if (error?.set === n) setError(null);
  }

  async function save(n: number) {
    if (!canRecord || lock.current) return;
    const values = valuesFor(n);
    const validation = validateTrainingFields(values, metricKind, kind === "bodyweight");
    if (validation) {
      setError({ set: n, text: validation });
      return;
    }
    const isNew = !current[n];
    lock.current = true;
    setSaving(n);
    setError(null);
    const num = parseTrainingNumber;
    const log: SetLog = {
      setNumber: n,
      exerciseName: exercise.name,
      weightKg: kind === "load" ? num(values.weight) : null,
      reps: kind === "hold" ? null : num(values.reps),
      rir: kind === "hold" ? null : num(values.rir),
      metricKind: kind === "hold" ? "hold" : null,
      metricValue: kind === "hold" ? num(values.value) : null,
    };
    try {
      const ok = await saveSet(log);
      if (!ok) {
        setError({ set: n, text: "Nie zapisano serii. Wpis został — spróbuj ponownie." });
        return;
      }
      drafts.setValue((all) => {
        const next = { ...all };
        delete next[String(n)];
        return next;
      });
      setEditing(null);
      onSetSaved(n, savedCount + (isNew ? 1 : 0), isNew);
    } catch {
      setError({ set: n, text: "Nie zapisano serii. Wpis został — spróbuj ponownie." });
    } finally {
      lock.current = false;
      setSaving(null);
    }
  }

  const recommendation = useLoadRecommendation(exercise, sessionId, date, logKey, kind, logs);
  const missingKg = (n: number) => kind === "load" && !valuesFor(n).weight.trim();
  const active = editing ?? nextOpen;
  const activeValues = active !== null ? valuesFor(active) : EMPTY;

  return (
    <div className="bw-set-table-wrap">
      {kind === "load" && recommendation && (
        <div className="bw-load-hint">
          <span>
            {recommendation.weightKg != null
              ? `${recommendation.title}: ${kg(recommendation.weightKg)} kg`
              : recommendation.title}
          </span>
          {recommendation.weightKg != null && canRecord && nextOpen !== null && (
            <button
              type="button"
              onClick={() => {
                drafts.setValue((all) => {
                  const next = { ...all };
                  for (const n of numbers)
                    if (!current[n])
                      next[String(n)] = {
                        ...valuesFor(n),
                        weight: String(recommendation.weightKg),
                      };
                  return next;
                });
                if (user && sessionId && recommendation.currentWeightKg != null)
                  saveStrengthProgressionDecision(user.id, {
                    sessionId,
                    exerciseKey: logKey,
                    decision: "accepted",
                    currentWeightKg: recommendation.currentWeightKg,
                    proposedWeightKg: recommendation.weightKg!,
                    decidedAt: new Date().toISOString(),
                  });
              }}
            >
              Ustaw
            </button>
          )}
        </div>
      )}
      {numbers.some((n) => current[n]) && (
        <ol className="bw-log-done" aria-label="Zapisane serie">
          {numbers
            .filter((n) => current[n])
            .map((n) => {
              const saved = current[n];
              return (
                <li key={n} data-editing={editing === n || undefined}>
                  <button
                    type="button"
                    disabled={!canRecord || saving !== null}
                    aria-label={`Seria ${n} zapisana, popraw`}
                    onClick={() => setEditing(editing === n ? null : n)}
                  >
                    <span className="bw-log-n">{n}</span>
                    <span className="bw-log-result">{savedLine(saved, kind, unilateral)}</span>
                    {saved.rir != null && <span className="bw-log-rir">zapas {saved.rir}</span>}
                    <Check aria-hidden="true" />
                  </button>
                </li>
              );
            })}
        </ol>
      )}
      {active !== null && (
        <div
          className="bw-log-entry"
          role="group"
          aria-label={`Seria ${active}`}
          data-locked={!canRecord || undefined}
        >
          <p className="bw-log-title">
            {editing !== null ? `Popraw serię ${active}` : `Seria ${active}`}
            <small>
              {editing !== null ? "" : ` z ${sets.max}`}
              {active > sets.min && !current[active] ? " · opcjonalna" : ""}
            </small>
          </p>
          <div className="bw-log-fields">
            {kind === "load" && (
              <Stepper
                label={`Seria ${active}: ciężar w kg`}
                unit="kg"
                step={2.5}
                value={activeValues.weight}
                disabled={!canRecord || saving !== null}
                onChange={(v) => edit(active, "weight", v)}
              />
            )}
            {kind !== "hold" && (
              <Stepper
                label={`Seria ${active}: powtórzenia`}
                unit={unilateral ? "powt. / str." : "powt."}
                step={1}
                value={activeValues.reps}
                disabled={!canRecord || saving !== null}
                onChange={(v) => edit(active, "reps", v)}
              />
            )}
            {kind === "hold" && (
              <Stepper
                label={`Seria ${active}: czas w sekundach`}
                unit={unilateral ? "s / str." : "s"}
                step={5}
                value={activeValues.value}
                disabled={!canRecord || saving !== null}
                onChange={(v) => edit(active, "value", v)}
              />
            )}
          </div>
          {withRir && kind !== "hold" && (
            <div className="bw-log-rir-pick">
              <span id={`${rirId}-label`}>Zapas powtórzeń</span>
              <div role="group" aria-labelledby={`${rirId}-label`}>
                {["0", "1", "2", "3", "4", "5"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Seria ${active}: zapas ${option}`}
                    aria-pressed={parseTrainingNumber(activeValues.rir) === Number(option)}
                    disabled={!canRecord || saving !== null}
                    onClick={() =>
                      edit(
                        active,
                        "rir",
                        parseTrainingNumber(activeValues.rir) === Number(option) ? "" : option,
                      )
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind === "load" && !recommendation && active === 1 && missingKg(1) && (
            <p className="bw-runner-muted">0 kg = bez obciążenia.</p>
          )}
          <button
            type="button"
            className="bw-runner-primary"
            disabled={!canRecord || saving !== null || loading}
            aria-label={
              editing !== null ? `Zapisz poprawkę serii ${active}` : `Zatwierdź serię ${active}`
            }
            onClick={() => void save(active)}
          >
            {saving === active
              ? "Zapisuję…"
              : editing !== null
                ? "Zapisz poprawkę"
                : `Zapisz serię ${active}`}
          </button>
          {editing !== null && (
            <button type="button" className="bw-log-cancel" onClick={() => setEditing(null)}>
              Anuluj
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="bw-runner-error" role="alert">
          Seria {error.set}: {error.text}
        </p>
      )}
      {onFinish && canRecord && savedCount >= Math.max(1, sets.min) && (
        <button
          type="button"
          className="bw-runner-secondary"
          disabled={finishing}
          onClick={onFinish}
        >
          {finishing
            ? "Zapisuję…"
            : savedCount >= sets.max
              ? "Oznacz jako wykonane"
              : `Zakończ po ${savedCount} ${savedCount === 1 ? "serii" : "seriach"}`}
        </button>
      )}
      {!drafts.available && (
        <p className="bw-runner-muted" role="status">
          Szkic wpisów działa tylko do zamknięcia ekranu.
        </p>
      )}
    </div>
  );
}

function Stepper({
  label,
  unit,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  step: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bw-stepper">
      <button
        type="button"
        aria-label={`${label}: mniej`}
        disabled={disabled || (parseTrainingNumber(value) ?? 0) <= 0}
        onClick={() => onChange(stepValue(value, -step))}
      >
        <Minus aria-hidden="true" />
      </button>
      <label>
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={8}
          placeholder="0"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <span aria-hidden="true">{unit}</span>
      </label>
      <button
        type="button"
        aria-label={`${label}: więcej`}
        disabled={disabled}
        onClick={() => onChange(stepValue(value, step))}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

/** The existing load progression, shown as one line above the table. */
function useLoadRecommendation(
  exercise: TrainingExercise,
  sessionId: string | null | undefined,
  date: string,
  logKey: string,
  kind: SetTableKind,
  logs: ReturnType<typeof useExerciseSetLogs>,
) {
  const { state, todayIso } = useLoadwise();
  const recentHistory = "recentSessions" in logs ? logs.recentSessions : undefined;
  const recent = useMemo(
    () =>
      Array.isArray(recentHistory)
        ? verifyExerciseHistory(recentHistory as ExerciseSessionLog[], logKey, state.completions)
        : [],
    [recentHistory, logKey, state.completions],
  );
  const context = useMemo(
    () =>
      effectiveSessions(
        selectEffectivePlan(state.plan, state.modifications, {
          profile: state.profile,
          readiness: state.readiness,
          completions: state.completions,
        }),
      ).find((item) => item.dbId === sessionId || item.sessionId === sessionId) ?? null,
    [state.plan, state.modifications, state.profile, state.readiness, state.completions, sessionId],
  );
  const feedback = recentSessionFeedback(
    state.profile,
    state.completions,
    context?.date ?? date ?? todayIso,
    sessionId ?? undefined,
  );
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(!logs.loading), [logs.loading]);
  return useMemo(
    () =>
      ready &&
      kind === "load" &&
      !["M15", "M39"].includes(exercise.methodExecution?.methodId ?? "") &&
      exercise.exerciseId !== "band_resisted_squat"
        ? recommendNextLoad(recent, exercise.reps, exercise.rir, {
            age: state.profile?.age,
            level: state.profile?.level,
            goal: state.profile?.goal,
            gymExperienceLevel: state.profile?.gymExperienceLevel,
            strengthTrainingMonths: state.profile?.strengthTrainingMonths,
            movementCompetence: state.profile?.movementCompetence,
            supervisionLevel: state.profile?.supervisionLevel,
            blockPhaseLabel: context?.blockPhaseLabel,
            mdLabel: context?.mdLabel,
            exercise,
            recentSessionRpe: feedback?.rpe,
          })
        : null,
    [ready, kind, recent, exercise, state.profile, context, feedback?.rpe],
  );
}
