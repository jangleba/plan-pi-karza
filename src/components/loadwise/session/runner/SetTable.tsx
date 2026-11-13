import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Docked } from "./Dock";

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
  title,
  facts = null,
  restNote = false,
  docked = false,
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
  onSetSaved: (
    setNumber: number,
    savedCount: number,
    isNew: boolean,
    next?: { label: string; detail?: string },
  ) => void;
  finishing?: boolean;
  /** Marks the exercise after the minimum of a range, or retries a failed final mark. */
  onFinish?: () => void;
  /** The exercise name shown at the top of the card. */
  title: ReactNode;
  /** Short plan facts (tempo, rest) under the name. */
  facts?: ReactNode;
  /** Shows "Po zapisie rozpocznie się przerwa" above the save button. */
  restNote?: boolean;
  /** The save button sticks to the bottom of the screen (single exercise). */
  docked?: boolean;
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

  /** Saves one set; true once it is stored. */
  async function save(n: number): Promise<boolean> {
    if (!canRecord || lock.current) return false;
    const values = valuesFor(n);
    const validation = validateTrainingFields(values, metricKind, kind === "bodyweight");
    if (validation) {
      setError({ set: n, text: validation });
      return false;
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
        return false;
      }
      drafts.setValue((all) => {
        const next = { ...all };
        delete next[String(n)];
        return next;
      });
      setEditing(null);
      if (!isNew) onSetSaved(n, savedCount, false);
      return true;
    } catch {
      setError({ set: n, text: "Nie zapisano serii. Wpis został — spróbuj ponownie." });
      return false;
    } finally {
      lock.current = false;
      setSaving(null);
    }
  }

  const recommendation = useLoadRecommendation(exercise, sessionId, date, logKey, kind, logs);
  const missingKg = (n: number) => kind === "load" && !valuesFor(n).weight.trim();
  const active = editing ?? nextOpen;
  const activeValues = active !== null ? valuesFor(active) : EMPTY;
  const busy = !canRecord || saving !== null;
  // "Poprzednio": this session's previous set, else the same set last time.
  const earlier =
    active === null || editing !== null
      ? null
      : current[active - 1]
        ? { log: current[active - 1], rir: true }
        : previous[active]
          ? { log: previous[active], rir: false }
          : null;
  const lastPlanned = active !== null && active >= sets.max;

  async function saveActive() {
    if (active === null) return;
    const n = active;
    const wasNew = !current[n];
    const following = numbers.find((m) => m > n && !current[m]) ?? null;
    const values = valuesFor(n);
    const ok = await save(n);
    if (!ok || !wasNew) return;
    const savedTotal = savedCount + 1;
    onSetSaved(
      n,
      savedTotal,
      true,
      following !== null && following <= sets.max
        ? {
            label: `Następnie: seria ${following} z ${sets.max}`,
            detail: nextDetail(values, kind, unilateral),
          }
        : undefined,
    );
  }

  return (
    <div className="bw-set-table-wrap">
      <div className="bw-set-card" data-locked={!canRecord || undefined}>
        <header className="bw-set-head">
          <div className="bw-set-heading">
            <h2 className="bw-set-name">{title}</h2>
            <p className="bw-set-sub">
              {active === null
                ? "Wszystkie serie zapisane"
                : editing !== null
                  ? `Popraw serię ${active}`
                  : `Seria ${active} z ${sets.max}`}
              {active !== null && editing === null && active > sets.min && !current[active]
                ? " · opcjonalna"
                : ""}
            </p>
          </div>
          <ol className="bw-set-dots" aria-label="Serie">
            {numbers.map((n) => {
              const saved = current[n];
              const state = saved ? "done" : n === active ? "current" : "open";
              return (
                <li key={n} data-state={state} data-editing={editing === n || undefined}>
                  {saved ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Seria ${n} zapisana, popraw`}
                      title={savedLine(saved, kind, unilateral)}
                      onClick={() => setEditing(editing === n ? null : n)}
                    >
                      {editing === n ? n : <Check aria-hidden="true" />}
                    </button>
                  ) : (
                    <span aria-label={n === active ? `Seria ${n}, teraz` : `Seria ${n}`}>{n}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </header>
        {facts}
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
        {active !== null && (
          <div
            className="bw-log-entry"
            role="group"
            aria-label={`Seria ${active}`}
            data-locked={!canRecord || undefined}
          >
            <div className="bw-set-fields" data-count={kind === "load" ? 2 : 1}>
              {kind === "load" && (
                <Stepper
                  title="Ciężar"
                  label={`Seria ${active}: ciężar w kg`}
                  unit="kg"
                  step={2.5}
                  value={activeValues.weight}
                  disabled={busy}
                  onChange={(v) => edit(active, "weight", v)}
                />
              )}
              {kind !== "hold" && (
                <Stepper
                  title={unilateral ? "Powtórzenia / str." : "Powtórzenia"}
                  label={`Seria ${active}: powtórzenia`}
                  unit=""
                  step={1}
                  value={activeValues.reps}
                  disabled={busy}
                  onChange={(v) => edit(active, "reps", v)}
                />
              )}
              {kind === "hold" && (
                <Stepper
                  title={unilateral ? "Czas / str." : "Czas"}
                  label={`Seria ${active}: czas w sekundach`}
                  unit="s"
                  step={5}
                  value={activeValues.value}
                  disabled={busy}
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
                      disabled={busy}
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
          </div>
        )}
        {earlier && active !== null && (
          <div className="bw-set-previous">
            <span>Poprzednio: {savedLine(earlier.log, kind, unilateral)}</span>
            {canRecord && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  drafts.setValue((all) => ({
                    ...all,
                    [String(active)]: {
                      ...fromLog(earlier.log),
                      rir: earlier.rir ? fromLog(earlier.log).rir : "",
                    },
                  }))
                }
              >
                Użyj poprzednich
              </button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="bw-runner-error" role="alert">
          Seria {error.set}: {error.text}
        </p>
      )}
      {!drafts.available && (
        <p className="bw-runner-muted" role="status">
          Szkic wpisów działa tylko do zamknięcia ekranu.
        </p>
      )}
      <Docked enabled={docked}>
        <div className="bw-set-dock" data-docked={docked || undefined}>
          {active !== null && editing === null && restNote && !lastPlanned && (
            <p className="bw-set-dock-note">Po zapisie rozpocznie się przerwa</p>
          )}
          {active !== null && (
            <button
              type="button"
              className="bw-runner-primary"
              disabled={busy || loading}
              aria-label={
                editing !== null ? `Zapisz poprawkę serii ${active}` : `Zatwierdź serię ${active}`
              }
              onClick={() => void saveActive()}
            >
              {saving === active
                ? "Zapisuję…"
                : editing !== null
                  ? "Zapisz poprawkę"
                  : "Zapisz serię"}
            </button>
          )}
          {editing !== null && (
            <button type="button" className="bw-log-cancel" onClick={() => setEditing(null)}>
              Anuluj
            </button>
          )}
          {onFinish && canRecord && editing === null && savedCount >= Math.max(1, sets.min) && (
            <button
              type="button"
              className={active === null ? "bw-runner-primary" : "bw-set-dock-link"}
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
        </div>
      </Docked>
    </div>
  );
}

/** The next set's planned entry in one line: "60 kg × 8", "8 powt.", "30 s". */
function nextDetail(values: Values, kind: SetTableKind, unilateral: boolean): string | undefined {
  const side = unilateral ? " / str." : "";
  const num = parseTrainingNumber;
  if (kind === "hold")
    return num(values.value) != null ? `${kg(num(values.value)!)} s${side}` : undefined;
  const reps = num(values.reps);
  if (reps == null) return undefined;
  const weight = num(values.weight);
  return kind === "load" && weight != null && weight > 0
    ? `${kg(weight)} kg × ${reps}${side}`
    : `${reps} powt.${side}`;
}

function Stepper({
  title,
  label,
  unit,
  step,
  value,
  disabled,
  onChange,
}: {
  title: string;
  label: string;
  unit: string;
  step: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bw-stepper">
      <span className="bw-stepper-title" aria-hidden="true">
        {title}
      </span>
      <div className="bw-stepper-box">
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
          {unit && <span aria-hidden="true">{unit}</span>}
        </label>
        <div className="bw-stepper-buttons">
          <button
            type="button"
            aria-label={`${label}: mniej`}
            disabled={disabled || (parseTrainingNumber(value) ?? 0) <= 0}
            onClick={() => onChange(stepValue(value, -step))}
          >
            <Minus aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`${label}: więcej`}
            disabled={disabled}
            onClick={() => onChange(stepValue(value, step))}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>
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
