import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, List } from "lucide-react";
import type { TrainingSection } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { useSessionExecution } from "@/lib/loadwise/useSessionExecution";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingFingerprint, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { CooldownCoach } from "../preparation/PreparationGuide";
import { cooldownFromExercises } from "@/lib/loadwise/preparation/protocols";
import { blockMethod, linkedLabel } from "@/lib/loadwise/blockMethod";
import {
  buildRunnerSteps,
  firstOpenStepIndex,
  runnerProgress,
  sectionLabel,
  type RunnerRow,
  type RunnerStep,
} from "@/lib/loadwise/sessionRunner/steps";
import {
  doseLine,
  restSecondsAfter,
  taskKind,
  type SessionKind,
} from "@/lib/loadwise/sessionRunner/presentation";
import {
  parseCountdown,
  startCountdown,
  type Countdown,
} from "@/lib/loadwise/sessionRunner/countdown";
import { RestCountdown } from "./runner/Countdowns";
import { RunnerCard, type RowStatus } from "./runner/RunnerCard";
import { SessionPlanList } from "./runner/SessionPlanList";
import "./runner/session-runner.css";

export interface StartAction {
  label: string;
  busy: boolean;
  error: string | null;
  onStart: () => void;
}

const parseIndex = (v: unknown) =>
  v === null
    ? null
    : typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 500
      ? v
      : undefined;
const parseSkipped = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === true)
    ? (v as Record<string, true>)
    : undefined;

/**
 * One runner for every planned session. Preview: the whole plan as a compact
 * list and one start action. Active: the current exercise, its controls,
 * "Jak wykonać" and what comes next. Marks are explicit; browsing never
 * completes anything, and skipping is a separate, visible choice.
 */
export function FocusedSessionRunner({
  sections,
  date,
  sessionId,
  canRecord = false,
  kind = "general",
  onFinish,
  start = null,
  previewNote = null,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
  canRecord?: boolean;
  kind?: SessionKind;
  onFinish: () => void;
  /** Main preview action ("Rozpocznij trening"); null when the session cannot start here. */
  start?: StartAction | null;
  /** One line about the preview, e.g. another day's session. */
  previewNote?: string | null;
}) {
  const { user } = useAuth();
  // A cool-down made only of guided movements runs as one timed sequence.
  const guidedCooldowns = useMemo(
    () =>
      new Map(
        sections
          .filter((s) => s.type === "cooldown")
          .map((s) => [s.id, cooldownFromExercises(s.blocks.flatMap((b) => b.exercises))] as const)
          .filter((entry) => entry[1] !== undefined),
      ),
    [sections],
  );
  const steps = useMemo(
    () => buildRunnerSteps(sections, (section) => guidedCooldowns.has(section.id)),
    [sections, guidedCooldowns],
  );
  const rows = useMemo(() => steps.flatMap((step) => step.rows), [steps]);
  const exercises = useMemo(() => rows.map((r) => r.exercise), [rows]);
  const fingerprint = trainingFingerprint(exercises);
  const scope = sessionId ?? date;
  const record = useSessionExecution(exercises, sessionId, date);
  const skipped = useTrainingLocalState<Record<string, true>>(
    trainingStorageKey("skipped", user?.id, scope, fingerprint),
    {},
    parseSkipped,
  );
  const selection = useTrainingLocalState<number | null>(
    trainingStorageKey("focused-step:v2", user?.id, scope, fingerprint),
    null,
    parseIndex,
  );
  const rest = useTrainingLocalState<Countdown | null>(
    trainingStorageKey("rest", user?.id, scope),
    null,
    (value) => (value === null ? null : parseCountdown(value)),
  );
  const [planOpen, setPlanOpen] = useState(false);
  const [failed, setFailed] = useState<RunnerRow | null>(null);
  const marking = useRef(false);

  const status = useCallback(
    (row: RunnerRow): RowStatus =>
      record.done[row.exercise.id] ? "done" : skipped.value[row.key] ? "skipped" : "open",
    [record.done, skipped.value],
  );
  const closed = useCallback((row: RunnerRow) => status(row) !== "open", [status]);
  const progress = runnerProgress(steps, status);
  const autoIndex = firstOpenStepIndex(steps, closed);
  const index = Math.min(selection.value ?? autoIndex, Math.max(0, steps.length - 1));
  const step = steps[index];
  const allClosed = progress.done + progress.skipped >= progress.total;

  // Opening a started session lands on the first unfinished task, warm-up included.
  const wasRecording = useRef(canRecord);
  useEffect(() => {
    if (canRecord && !wasRecording.current) selection.setValue(null);
    wasRecording.current = canRecord;
  }, [canRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!steps.length) return null;

  function go(next: number) {
    selection.setValue(Math.max(0, Math.min(steps.length - 1, next)));
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function startRest(seconds: number | null, label: string) {
    if (seconds && seconds > 0) rest.setValue(startCountdown(seconds, label));
  }

  async function mark(row: RunnerRow, value: boolean): Promise<boolean> {
    if (!canRecord || marking.current) return false;
    marking.current = true;
    try {
      const ok = await record.markDone(row.exercise.id, value);
      setFailed(ok ? null : row);
      if (ok && value && skipped.value[row.key])
        skipped.setValue((all) => {
          const next = { ...all };
          delete next[row.key];
          return next;
        });
      return ok;
    } finally {
      marking.current = false;
    }
  }

  function nextLabel(current: RunnerStep, row: RunnerRow): string {
    const partner =
      current.kind === "linked" ? current.rows.find((r) => r !== row && !closed(r)) : null;
    if (partner)
      return `Dalej: ${linkedLabel(partner.block, partner.exercise) ?? ""} ${canonicalExerciseName(partner.exercise)}`.replace(
        /\s+/g,
        " ",
      );
    return taskKind(row.exercise, row.section, kind) === "sprint"
      ? "Dalej: kolejny odcinek"
      : "Dalej: kolejna seria";
  }

  /** After a set or bout: rest per plan, never an automatic mark. */
  function afterSet(current: RunnerStep, row: RunnerRow) {
    const partnerOpen =
      current.kind === "linked" &&
      current.rows.indexOf(row) < current.rows.length - 1 &&
      current.rows.some((r) => r !== row && !closed(r));
    startRest(
      restSecondsAfter(row.block, row.exercise, current.kind === "linked", partnerOpen),
      nextLabel(current, row),
    );
  }

  /** Final confirmation of a row: mark it, rest before what follows, move on when the step is closed. */
  async function completeRow(current: RunnerStep, row: RunnerRow): Promise<boolean> {
    const ok = await mark(row, true);
    if (!ok) return false;
    const stepIndex = steps.indexOf(current);
    const othersOpen = current.rows.some((r) => r !== row && !closed(r));
    const following = steps[stepIndex + 1];
    if (!othersOpen && following) {
      startRest(
        restSecondsAfter(row.block, row.exercise, current.kind === "linked", false),
        `Dalej: ${canonicalExerciseName(following.rows[0].exercise)}`,
      );
      go(stepIndex + 1);
    }
    if (!othersOpen && !following && stepIndex === steps.length - 1) onFinish();
    return true;
  }

  function skip(current: RunnerStep) {
    skipped.setValue((all) => {
      const next = { ...all };
      for (const row of current.rows) if (!record.done[row.exercise.id]) next[row.key] = true;
      return next;
    });
    const stepIndex = steps.indexOf(current);
    if (stepIndex < steps.length - 1) go(stepIndex + 1);
  }

  function unskip(row: RunnerRow) {
    skipped.setValue((all) => {
      const next = { ...all };
      delete next[row.key];
      return next;
    });
  }

  if (!canRecord) {
    return (
      <div className="bw-runner" data-mode="preview" data-session-runner={kind}>
        {previewNote && <p className="bw-runner-note">{previewNote}</p>}
        <SessionPlanList steps={steps} status={status} mode="preview" sessionKind={kind} />
        {start && (
          <div className="bw-runner-start">
            <button
              type="button"
              className="bw-runner-primary"
              disabled={start.busy}
              onClick={start.onStart}
            >
              {start.busy ? "Rozpoczynanie…" : start.label}
            </button>
            {start.error && (
              <p role="alert" className="bw-runner-error">
                {start.error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const isLast = index === steps.length - 1;
  const method = step.kind === "linked" ? blockMethod(step.rows[0].block) : null;
  const guided = step.kind === "guided" ? guidedCooldowns.get(step.section.id) : undefined;
  const following = steps[index + 1];
  const stepOpen = step.rows.some((row) => !closed(row));

  return (
    <div className="bw-runner" data-mode="active" data-session-runner={kind}>
      <div className="bw-runner-top">
        <div className="bw-runner-count">
          <span>
            Wykonane <strong>{progress.done}</strong> z {progress.total}
            {progress.skipped > 0 && <small> · pominięte {progress.skipped}</small>}
          </span>
          <button type="button" onClick={() => setPlanOpen(true)}>
            <List aria-hidden="true" /> Cały plan
          </button>
        </div>
        <div
          className="bw-runner-bar"
          role="progressbar"
          aria-label="Wykonane ćwiczenia"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <span
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {guided ? (
        <article className="bw-runner-card" key={`${fingerprint}:${step.key}`}>
          <div className="bw-runner-eyebrow">{sectionLabel(step.section)}</div>
          <CooldownCoach
            protocol={guided}
            storageKey={trainingStorageKey("cooldown", user?.id, scope, fingerprint)}
            onFinish={async () => {
              for (const r of step.rows) if (!record.done[r.exercise.id]) await mark(r, true);
              if (isLast) onFinish();
              else go(index + 1);
            }}
          />
        </article>
      ) : step.kind === "linked" ? (
        <section
          className="bw-runner-linked"
          aria-label={method?.name}
          key={`${fingerprint}:${step.key}`}
        >
          <div className="bw-runner-eyebrow">
            {sectionLabel(step.section)} · {method?.name}
          </div>
          {step.rows.map((row) => (
            <RunnerCard
              key={row.key}
              row={row}
              step={step}
              linked
              status={status(row)}
              sessionKind={kind}
              sessionId={sessionId}
              date={date}
              scope={scope}
              isLastStep={isLast && step.rows.every((r) => r === row || closed(r))}
              onSetDone={() => afterSet(step, row)}
              onComplete={() => completeRow(step, row)}
              onUndo={() => void mark(row, false)}
              onUnskip={() => unskip(row)}
            />
          ))}
        </section>
      ) : (
        <RunnerCard
          key={`${fingerprint}:${step.key}`}
          row={step.rows[0]}
          step={step}
          status={status(step.rows[0])}
          sessionKind={kind}
          sessionId={sessionId}
          date={date}
          scope={scope}
          isLastStep={isLast}
          onSetDone={() => afterSet(step, step.rows[0])}
          onComplete={() => completeRow(step, step.rows[0])}
          onUndo={() => void mark(step.rows[0], false)}
          onUnskip={() => unskip(step.rows[0])}
        />
      )}

      {failed && (
        <div className="bw-runner-sync" role="alert">
          <span>{record.notice ?? "Nie zapisano oznaczenia."}</span>
          <button type="button" onClick={() => void mark(failed, true)}>
            Ponów zapis
          </button>
        </div>
      )}
      {!failed && record.notice && (
        <p className="bw-runner-muted" role="status">
          {record.notice}
        </p>
      )}

      {following && (
        <p className="bw-runner-next">
          <span>Następnie</span>
          <strong>
            {following.kind === "guided"
              ? `${sectionLabel(following.section)} · ${following.rows.length} ćw.`
              : canonicalExerciseName(following.rows[0].exercise)}
          </strong>
          {following.kind !== "guided" && <small>{doseLine(following.rows[0].exercise)}</small>}
        </p>
      )}

      <nav className="bw-runner-nav" aria-label="Ćwiczenia">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft aria-hidden="true" /> Poprzednie
        </button>
        {stepOpen && !guided ? (
          <button type="button" className="bw-runner-skip" onClick={() => skip(step)}>
            Pomiń
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={isLast} onClick={() => go(index + 1)}>
          Następne <ChevronRight aria-hidden="true" />
        </button>
      </nav>
      {(allClosed || isLast) && (
        <button type="button" className="bw-runner-primary" onClick={onFinish}>
          {allClosed ? (
            <>
              <Check aria-hidden="true" /> Zakończ trening
            </>
          ) : (
            "Zakończ trening"
          )}
        </button>
      )}
      {!record.cloud && (
        <p className="bw-runner-muted">Oznaczenia zapisują się na tym urządzeniu.</p>
      )}

      {rest.value && (
        <div className="bw-runner-rest-dock">
          <RestCountdown countdown={rest.value} onChange={(next) => rest.setValue(next)} />
        </div>
      )}

      <Drawer open={planOpen} onOpenChange={setPlanOpen} initialDetent="large">
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Cały plan</DrawerTitle>
          <SessionPlanList
            steps={steps}
            status={status}
            mode="navigate"
            sessionKind={kind}
            currentIndex={index}
            onSelect={(i) => {
              go(i);
              setPlanOpen(false);
            }}
          />
          {!allClosed && (
            <button
              type="button"
              className="bw-runner-finish-early"
              onClick={() => {
                setPlanOpen(false);
                onFinish();
              }}
            >
              Zakończ trening teraz
            </button>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
