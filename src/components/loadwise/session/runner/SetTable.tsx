import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Minus, Plus } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { useExerciseSetLogs, type SetLog } from "@/lib/loadwise/setLogs";
import { useLoadwise } from "@/lib/loadwise/store";
import { strengthPreference } from "@/lib/loadwise/strengthCheckIn";
import { useGymEvidence } from "@/lib/loadwise/useGymEvidence";
import {
  equipmentFor,
  equipmentHistory,
  equipmentKey,
  gymStrengthResponses,
  type GymLoadResponse,
} from "@/lib/loadwise/gymEvidence";
import { exercisePrescriptionKey } from "@/lib/loadwise/setLogHistory";
import { GymEquipmentEditor } from "../GymEquipmentEditor";
import { verifyExerciseHistory } from "@/lib/loadwise/setLogHistory";
import {
  comparablePreviousSets,
  recommendStrengthProgression,
} from "@/lib/loadwise/engineV2/progression";
import {
  parseTrainingNumber,
  trainingStorageKey,
  validateTrainingFields,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { useAuth } from "@/lib/loadwise/auth";
import type { Range } from "@/lib/loadwise/sessionRunner/presentation";
import { Docked } from "./Dock";
import { chooseStrengthFocus, strengthWeekContext } from "@/lib/loadwise/engineV2/strengthPolicy";
import {
  nextSetLoadAdvice,
  type StrengthLoadContext,
} from "@/lib/loadwise/engineV2/loadAutoregulation";

export type SetTableKind = "load" | "bodyweight" | "hold";
type Values = { weight: string; reps: string; rir: string; value: string };
const EMPTY: Values = { weight: "", reps: "", rir: "", value: "" };
type Drafts = Record<string, Values>;
type LoadChoice = Pick<GymLoadResponse, "decision" | "reason">;
const parseChoice = (v: unknown): LoadChoice | null | undefined =>
  v === null
    ? null
    : v &&
        typeof v === "object" &&
        ["accept", "hold", "lighter"].includes((v as LoadChoice).decision) &&
        ((v as LoadChoice).reason === undefined ||
          ["preference", "not_ready", "unable"].includes((v as LoadChoice).reason!))
      ? (v as LoadChoice)
      : undefined;

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
  onlySetNumber,
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
  /** A contrast coordinator owns the round; the real set number remains the log identity. */
  onlySetNumber?: number;
}) {
  const { user } = useAuth();
  const logs = useExerciseSetLogs(sessionId, logKey);
  const { current, loading, saveSet } = logs;
  const store = useLoadwise();
  const gym = useGymEvidence();
  const choice = useTrainingLocalState<LoadChoice | null>(
    trainingStorageKey("load-response", user?.id, sessionId ?? date, logKey),
    null,
    parseChoice,
  );
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const scopeKey = `${sessionId}:${logKey}`;
  const recordedResponse = gym.records.find(
    (r) => r.record_key === `response:${sessionId}:${exercise.exerciseId}`,
  )?.payload;
  const equipment =
    recordedResponse?.kind === "response"
      ? recordedResponse.equipment
      : exercise.exerciseId
        ? equipmentFor(gym.records, exercise.exerciseId)
        : undefined;
  const checkedHistory = verifyExerciseHistory(
    logs.recentSessions ?? [],
    logKey,
    store.state?.completions ?? {},
  );
  const verifiedHistory =
    kind === "load"
      ? equipment && exercise.exerciseId
        ? equipmentHistory(checkedHistory, gym.records, exercise.exerciseId, equipment)
        : checkedHistory.map((s) => ({ ...s, verification: undefined }))
      : checkedHistory;
  const lastResponse = gym.records
    .filter((r) => {
      const d = r.payload;
      const c = d.kind === "response" ? store.state?.completions[d.sessionId] : undefined;
      return (
        d.kind === "response" &&
        d.sessionId !== sessionId &&
        d.exerciseId === exercise.exerciseId &&
        equipment &&
        equipmentKey(d.equipment) === equipmentKey(equipment) &&
        c?.completed &&
        c.executionSnapshot &&
        c.executionSnapshot.date <= (store.todayIso ?? date)
      );
    })
    .sort((a, b) => {
      const da = a.payload as GymLoadResponse,
        db = b.payload as GymLoadResponse;
      return (store.state?.completions[db.sessionId]?.executionSnapshot?.date ?? "").localeCompare(
        store.state?.completions[da.sessionId]?.executionSnapshot?.date ?? "",
      );
    })[0]?.payload;
  const profile = store.state?.profile;
  const weekContext = useMemo(
    () =>
      kind === "load" && profile && Array.isArray(profile.clubTrainingDays)
        ? strengthWeekContext(profile, date, {
            startDate: store.todayIso ?? date,
            asOfDate: store.todayIso ?? date,
            completions: store.state.completions,
            readiness: store.state.readiness,
            previousPlan: store.state.plan,
            strengthLoadResponses: gymStrengthResponses(gym.records),
          })
        : undefined,
    [kind, profile, date, store.todayIso, store.state, gym.records],
  );
  const liveFocus =
    weekContext && profile
      ? chooseStrengthFocus(
          profile,
          exercise.progressionPhase === "reduced" ? "deload" : "development",
          weekContext,
        )
      : undefined;
  const loadContext: StrengthLoadContext | undefined =
    weekContext && profile
      ? {
          ...weekContext,
          age: profile.age,
          equipmentConfigured: !!equipment,
          ...(equipment?.incrementKg !== undefined ? { incrementKg: equipment.incrementKg } : {}),
          ...(equipment?.availableWeightsKg
            ? { availableWeightsKg: equipment.availableWeightsKg }
            : {}),
          declinedIncrease:
            reviewKey !== scopeKey &&
            lastResponse?.kind === "response" &&
            ["hold", "lighter"].includes(lastResponse.decision) &&
            (lastResponse.suggestedKg ?? 0) > lastResponse.chosenKg,
          loadPreference:
            sessionId && store.state.completions[sessionId]?.executionSnapshot
              ? strengthPreference(store.state.completions[sessionId].executionSnapshot!)
              : undefined,
          mode:
            liveFocus && ["deload", "reentry", "maintenance"].includes(liveFocus.mode)
              ? liveFocus.mode
              : (exercise.strengthFocus?.mode ?? liveFocus!.mode),
        }
      : undefined;
  const sessionRecommendation =
    kind !== "hold"
      ? recommendStrengthProgression(exercise, verifiedHistory, date, loadContext)
      : null;
  const previous = exercise.engineDose
    ? comparablePreviousSets(exercise, verifiedHistory)
    : logs.previous;
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
  const numbers = onlySetNumber ? [onlySetNumber] : Array.from({ length: total }, (_, i) => i + 1);
  const savedCount = numbers.filter((n) => current[n]).length;
  const nextOpen = numbers.find((n) => !current[n]) ?? null;
  const metricKind = kind === "hold" ? "hold" : "load";

  const valuesFor = (n: number): Values => {
    const draft = drafts.value[String(n)];
    if (draft) return draft;
    if (current[n]) return fromLog(current[n]);
    // Prefill with this session's previous set, else the same set last time (without its RIR).
    if (current[n - 1]) {
      const within = loadContext ? nextSetLoadAdvice(exercise, current[n - 1], loadContext) : null;
      return {
        ...fromLog(current[n - 1]),
        ...(within?.weightKg !== undefined ? { weight: String(within.weightKg) } : {}),
        rir: "",
      };
    }
    if (loadContext && sessionRecommendation?.action === "calibrate") return EMPTY;
    if (
      loadContext &&
      sessionRecommendation?.weightKg !== undefined &&
      sessionRecommendation.action !== "increase"
    )
      return {
        ...EMPTY,
        ...(previous[n] ? fromLog(previous[n]) : {}),
        weight: String(sessionRecommendation.weightKg),
        rir: "",
      };
    return previous[n] ? { ...fromLog(previous[n]), rir: "" } : EMPTY;
  };

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
      let responseSaveFailed = false;
      if (
        kind === "load" &&
        equipment &&
        exercise.exerciseId &&
        sessionId &&
        date === store.todayIso &&
        editing === null &&
        gym.available
      ) {
        const chosenKg = num(values.weight);
        if (chosenKg !== null) {
          try {
            await gym.save({
              kind: "response",
              version: 1,
              sessionId,
              exerciseId: exercise.exerciseId,
              prescriptionKey: exercisePrescriptionKey(exercise),
              suggestionKey: JSON.stringify([
                exercisePrescriptionKey(exercise),
                recommendation?.action,
                recommendation?.weightKg,
              ]),
              decision:
                choice.value?.decision ??
                (recordedResponse?.kind === "response" ? recordedResponse.decision : "unanswered"),
              ...(choice.value?.reason ? { reason: choice.value.reason } : {}),
              ...(recommendation?.weightKg !== undefined
                ? { suggestedKg: recommendation.weightKg }
                : {}),
              chosenKg,
              equipment,
            });
          } catch {
            responseSaveFailed = true;
          }
        }
      }
      const ok = await saveSet(log);
      if (!ok) {
        setError({ set: n, text: "Nie zapisano serii. Wpis został — spróbuj ponownie." });
        return false;
      }
      if (responseSaveFailed)
        setError({
          set: n,
          text: "Seria zapisana. Nie potwierdzono zapisu decyzji o ciężarze; sprawdź synchronizację.",
        });
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

  const missingKg = (n: number) => kind === "load" && !valuesFor(n).weight.trim();
  const active = editing ?? nextOpen;
  const recommendation =
    active === null || editing !== null
      ? null
      : loadContext
        ? (nextSetLoadAdvice(exercise, current[active - 1], loadContext) ?? sessionRecommendation)
        : sessionRecommendation;
  const activeValues = active !== null ? valuesFor(active) : EMPTY;
  function chooseLoad(decision: "accept" | "hold" | "lighter") {
    if (active === null) return;
    choice.setValue({ decision });
    if (decision === "accept" && recommendation?.weightKg !== undefined)
      edit(active, "weight", String(recommendation.weightKg));
    if (decision === "lighter") {
      const reference = parseTrainingNumber(activeValues.weight);
      const lower =
        reference !== null
          ? equipment?.availableWeightsKg
            ? [...equipment.availableWeightsKg]
                .filter((n) => n < reference)
                .sort((a, b) => b - a)[0]
            : equipment?.incrementKg
              ? Math.round((reference - equipment.incrementKg) * 100) / 100
              : undefined
          : undefined;
      edit(active, "weight", lower !== undefined && lower > 0 ? String(lower) : "");
    }
  }
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
    const upcoming = loadContext
      ? nextSetLoadAdvice(
          exercise,
          {
            setNumber: n,
            weightKg: parseTrainingNumber(values.weight),
            reps: parseTrainingNumber(values.reps),
            rir: parseTrainingNumber(values.rir),
          },
          loadContext,
        )
      : null;
    onSetSaved(
      n,
      savedTotal,
      true,
      following !== null && following <= sets.max
        ? {
            label: `Następnie: seria ${following} z ${sets.max}`,
            detail: nextDetail(
              upcoming?.weightKg !== undefined
                ? { ...values, weight: String(upcoming.weightKg) }
                : values,
              kind,
              unilateral,
            ),
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
        {kind === "load" && (
          <GymEquipmentEditor
            exerciseId={exercise.exerciseId}
            disabled={saving !== null || !canRecord}
          />
        )}
        {kind === "load" && equipment && (
          <p className="bw-runner-muted">
            Kg:{" "}
            {equipment.convention === "per_hand"
              ? "jedna hantla / jedna ręka"
              : equipment.convention === "total"
                ? "cały ciężar"
                : "wskazanie tego stanowiska"}
            .
          </p>
        )}
        {recommendation ? (
          <div className="text-sm text-neutral-600">
            <p>{recommendation.label}</p>
            <details>
              <summary>Dlaczego taki ciężar?</summary>
              <p>{recommendation.reason}</p>
            </details>
            {canRecord &&
              active !== null &&
              editing === null &&
              date === store.todayIso &&
              recommendation.weightKg !== undefined && (
                <>
                  <p className="mt-2 text-xs">
                    To sugestia. Wybierz ciężar, który chcesz sprawdzić; zawsze możesz wpisać inny.
                  </p>
                  <div
                    role="group"
                    aria-label="Twój wybór ciężaru"
                    className="my-2 flex flex-wrap gap-2"
                  >
                    {(
                      [
                        ["accept", "Spróbuję"],
                        ["hold", "Zostaję przy swoim"],
                        ["lighter", "Dziś mniej"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className="min-h-11 rounded-lg border px-3"
                        disabled={busy}
                        aria-pressed={choice.value?.decision === value}
                        onClick={() => chooseLoad(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {choice.value && choice.value.decision !== "accept" && (
                    <label className="block text-xs">
                      Powód · opcjonalnie
                      <select
                        className="ml-2 rounded-lg border p-2"
                        value={choice.value.reason ?? ""}
                        onChange={(e) =>
                          choice.setValue({
                            ...choice.value!,
                            reason: e.target.value
                              ? (e.target.value as LoadChoice["reason"])
                              : undefined,
                          })
                        }
                      >
                        <option value="">Bez podawania powodu</option>
                        <option value="preference">Wolę bez podwyżki</option>
                        <option value="not_ready">Jeszcze nie czuję się gotowy</option>
                        <option value="unable">Ten ciężar jest za duży</option>
                      </select>
                    </label>
                  )}
                  <p className="text-xs">
                    Wybór zapisze się razem z serią. Nie zastępuje zapisu faktycznych powtórzeń i
                    zapasu.
                  </p>
                </>
              )}
            {loadContext?.declinedIncrease && canRecord && (
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => setReviewKey(scopeKey)}
              >
                Sprawdź możliwość podwyżki
              </button>
            )}
          </div>
        ) : null}
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
                  step={equipment?.incrementKg ?? 0.5}
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
            {kind === "load" && active === 1 && missingKg(1) && (
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
                      rir: "",
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
          {onFinish &&
            canRecord &&
            editing === null &&
            (onlySetNumber
              ? Boolean(current[onlySetNumber])
              : savedCount >= Math.max(1, sets.min)) && (
              <button
                type="button"
                className={active === null ? "bw-runner-primary" : "bw-set-dock-link"}
                disabled={finishing}
                onClick={onFinish}
              >
                {finishing
                  ? "Zapisuję…"
                  : onlySetNumber
                    ? "Seria zapisana — kontynuuj rundę"
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
