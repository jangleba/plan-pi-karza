import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { TrainingSection } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { useSessionExecution } from "@/lib/loadwise/useSessionExecution";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingFingerprint, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
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
import { RestCountdown, RestScreen } from "./runner/Countdowns";
import { DockSlot } from "./runner/Dock";
import { RowPlan, RunnerCard, type RowStatus } from "./runner/RunnerCard";
import { HowToPanel } from "./runner/HowToSection";
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
const parseView = (v: unknown) => (v === "list" || v === "exercise" ? v : undefined);
const parseSkipped = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === true)
    ? (v as Record<string, true>)
    : undefined;

type RunnerView = "list" | "exercise";
type ExerciseTab = "trening" | "technika";

/** The nearest scrolling panel (the session sheet) or the page. */
function scrollToTop(from: HTMLElement | null) {
  const panel = from?.closest<HTMLElement>(".bw-sheet-scroll");
  if (panel) panel.scrollTo?.({ top: 0, behavior: "smooth" });
  else window.scrollTo?.({ top: 0, behavior: "smooth" });
}

/**
 * One runner for every planned session. The session is a flat list of
 * exercises with their doses; one tap opens an exercise with two tabs:
 * "Trening" (what to do and the entry of sets, bouts or sides) and "Technika"
 * (animation and a short instruction). Marks are explicit; browsing never
 * completes anything, and skipping is a separate, visible choice. The open
 * view, marks, drafts and the rest clock are stored per session, so closing
 * the panel and opening it again resumes in the same place.
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
  const view = useTrainingLocalState<RunnerView>(
    trainingStorageKey("runner-view", user?.id, scope, fingerprint),
    "exercise",
    parseView,
  );
  // Preview has no progress to keep; its open exercise is plain screen state.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<ExerciseTab>("trening");
  const rootRef = useRef<HTMLDivElement>(null);
  /** The exercise open in the preview when "Rozpocznij" was tapped; the session opens on it. */
  const pendingStart = useRef<number | null>(null);
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
    if (canRecord && !wasRecording.current) {
      selection.setValue(pendingStart.current);
      pendingStart.current = null;
      view.setValue("exercise");
      setTab("trening");
    }
    wasRecording.current = canRecord;
  }, [canRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!steps.length) return null;

  function go(next: number) {
    selection.setValue(Math.max(0, Math.min(steps.length - 1, next)));
    view.setValue("exercise");
    setTab("trening");
    scrollToTop(rootRef.current);
  }

  function showList() {
    view.setValue("list");
    scrollToTop(rootRef.current);
  }

  function startRest(
    seconds: number | null,
    label: string,
    extra: { detail?: string; stepKey?: string } = {},
  ) {
    if (seconds && seconds > 0)
      rest.setValue(startCountdown(seconds, label, Date.now(), Date.now(), extra));
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
      return `Następnie: ${linkedLabel(partner.block, partner.exercise) ?? ""} ${canonicalExerciseName(partner.exercise)}`.replace(
        /\s+/g,
        " ",
      );
    return taskKind(row.exercise, row.section, kind) === "sprint"
      ? "Następnie: kolejny odcinek"
      : "Następnie: kolejna seria";
  }

  /** After a set or bout: rest per plan, never an automatic mark. */
  function afterSet(
    current: RunnerStep,
    row: RunnerRow,
    next?: { label: string; detail?: string },
  ) {
    const partnerOpen =
      current.kind === "linked" &&
      current.rows.indexOf(row) < current.rows.length - 1 &&
      current.rows.some((r) => r !== row && !closed(r));
    const own = current.kind === "single" && next;
    startRest(
      restSecondsAfter(row.block, row.exercise, current.kind === "linked", partnerOpen),
      own ? next.label : nextLabel(current, row),
      { detail: own ? next.detail : undefined, stepKey: current.key },
    );
  }

  /** "Zakończ ćwiczenie" during a rest: mark it, keep the running rest for what follows. */
  async function finishExercise(current: RunnerStep) {
    const row = current.rows[0];
    const ok = await mark(row, true);
    if (!ok) return;
    const stepIndex = steps.indexOf(current);
    const following = steps[stepIndex + 1];
    if (!following) {
      rest.setValue(null);
      onFinish();
      return;
    }
    rest.setValue((value) =>
      value
        ? {
            endsAt: value.endsAt,
            pausedLeft: value.pausedLeft,
            total: value.total,
            id: value.id,
            label: `Następnie: ${canonicalExerciseName(following.rows[0].exercise)}`,
          }
        : value,
    );
    go(stepIndex + 1);
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
        `Następnie: ${canonicalExerciseName(following.rows[0].exercise)}`,
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

  const startHere = () => {
    pendingStart.current = previewIndex;
    start?.onStart();
  };
  const startAction = start && (
    <div className="bw-runner-start">
      <button type="button" className="bw-runner-primary" disabled={start.busy} onClick={startHere}>
        {start.busy ? "Rozpoczynanie…" : start.label}
      </button>
      {start.error && (
        <p role="alert" className="bw-runner-error">
          {start.error}
        </p>
      )}
    </div>
  );

  if (!canRecord) {
    const openIndex =
      previewIndex === null ? null : Math.min(previewIndex, Math.max(0, steps.length - 1));
    const opened = openIndex === null ? null : steps[openIndex];
    return (
      <div
        ref={rootRef}
        className="bw-runner"
        data-mode="preview"
        data-view={opened ? "exercise" : "list"}
        data-session-runner={kind}
      >
        {opened && openIndex !== null ? (
          <ExerciseView
            active={false}
            step={opened}
            index={openIndex}
            total={steps.length}
            tab={tab}
            onTab={setTab}
            onList={() => {
              setPreviewIndex(null);
              scrollToTop(rootRef.current);
            }}
            guidedLabel={null}
            training={
              <div className="bw-unit-plan">
                {opened.rows.map((row) => (
                  <div key={row.key} className="bw-unit-plan-row">
                    {opened.rows.length > 1 && (
                      <h3>
                        {linkedLabel(row.block, row.exercise) && (
                          <span className="bw-runner-label">
                            {linkedLabel(row.block, row.exercise)}
                          </span>
                        )}
                        {canonicalExerciseName(row.exercise)}
                        <small>{doseLine(row.exercise)}</small>
                      </h3>
                    )}
                    <RowPlan row={row} linked={opened.kind === "linked"} sessionKind={kind} />
                  </div>
                ))}
              </div>
            }
            nav={
              <nav className="bw-runner-nav" aria-label="Ćwiczenia">
                <button
                  type="button"
                  disabled={openIndex === 0}
                  onClick={() => {
                    setPreviewIndex(openIndex - 1);
                    setTab("trening");
                  }}
                >
                  <ChevronLeft aria-hidden="true" /> Poprzednie
                </button>
                <span />
                <button
                  type="button"
                  disabled={openIndex === steps.length - 1}
                  onClick={() => {
                    setPreviewIndex(openIndex + 1);
                    setTab("trening");
                  }}
                >
                  Następne <ChevronRight aria-hidden="true" />
                </button>
              </nav>
            }
          />
        ) : (
          <>
            {previewNote && <p className="bw-runner-note">{previewNote}</p>}
            <SessionPlanList
              steps={steps}
              status={status}
              onSelect={(i) => {
                setPreviewIndex(i);
                setTab("trening");
                scrollToTop(rootRef.current);
              }}
            />
          </>
        )}
        {startAction}
      </div>
    );
  }

  const isLast = index === steps.length - 1;
  const method = step.kind === "linked" ? blockMethod(step.rows[0].block) : null;
  const guided = step.kind === "guided" ? guidedCooldowns.get(step.section.id) : undefined;
  const stepOpen = step.rows.some((row) => !closed(row));
  const listView = view.value === "list";
  // Continue where the athlete was (a half-done exercise), else the first open one.
  const resumeIndex = stepOpen ? index : Math.min(autoIndex, Math.max(0, steps.length - 1));

  const exerciseTop = (
    <div className="bw-runner-top" data-view="exercise">
      <p className="bw-runner-position">
        Ćwiczenie {index + 1} z {steps.length}
      </p>
      <ol
        className="bw-runner-segments"
        aria-label={`Wykonane ${progress.done} z ${progress.total}${progress.skipped > 0 ? `, pominięte ${progress.skipped}` : ""}`}
      >
        {steps.map((item, i) => (
          <li
            key={item.key}
            data-state={
              item.rows.every((row) => status(row) === "done")
                ? "done"
                : item.rows.every(closed)
                  ? "skipped"
                  : i === index
                    ? "current"
                    : "open"
            }
          />
        ))}
      </ol>
    </div>
  );

  const progressBar = (
    <div className="bw-runner-top">
      <div className="bw-runner-count">
        {listView ? (
          <span />
        ) : (
          <button type="button" className="bw-unit-back" onClick={showList}>
            <ChevronLeft aria-hidden="true" /> Lista ćwiczeń
          </button>
        )}
        <span>
          Wykonane <strong>{progress.done}</strong> z {progress.total}
          {progress.skipped > 0 && <small> · pominięte {progress.skipped}</small>}
        </span>
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
  );

  const restDock = rest.value && (
    <div className="bw-runner-rest-dock">
      <RestCountdown countdown={rest.value} onChange={(next) => rest.setValue(next)} />
    </div>
  );

  const syncNotice = (
    <>
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
    </>
  );

  if (listView) {
    return (
      <div
        ref={rootRef}
        className="bw-runner"
        data-mode="active"
        data-view="list"
        data-session-runner={kind}
      >
        {progressBar}
        <SessionPlanList
          steps={steps}
          status={status}
          currentIndex={allClosed ? undefined : resumeIndex}
          onSelect={go}
        />
        {syncNotice}
        {!allClosed && (
          <button type="button" className="bw-runner-finish-early" onClick={() => onFinish()}>
            Zakończ trening teraz
          </button>
        )}
        {!record.cloud && (
          <p className="bw-runner-muted">Oznaczenia zapisują się na tym urządzeniu.</p>
        )}
        <div className="bw-runner-start">
          {restDock}
          <button
            type="button"
            className="bw-runner-primary"
            onClick={() => (allClosed ? onFinish() : go(resumeIndex))}
          >
            {allClosed ? (
              <>
                <Check aria-hidden="true" /> Zakończ trening
              </>
            ) : (
              `Kontynuuj: ${canonicalExerciseName(steps[resumeIndex].rows[0].exercise)}`
            )}
          </button>
        </div>
      </div>
    );
  }

  const cardFor = (row: RunnerRow, linked: boolean) => (
    <RunnerCard
      key={row.key}
      row={row}
      step={step}
      linked={linked}
      bare={false}
      status={status(row)}
      sessionKind={kind}
      sessionId={sessionId}
      date={date}
      scope={scope}
      isLastStep={linked ? isLast && step.rows.every((r) => r === row || closed(r)) : isLast}
      onSetDone={(next) => afterSet(step, row, next)}
      onComplete={() => completeRow(step, row)}
      onUndo={() => void mark(row, false)}
      onUnskip={() => unskip(row)}
    />
  );

  // The rest takes the screen on the exercise it belongs to (or the next one); elsewhere it stays docked.
  const ownRest = Boolean(rest.value && rest.value.stepKey === step.key && stepOpen);
  const restScreen = rest.value && !guided && (ownRest || !rest.value.stepKey) ? rest.value : null;
  const sprintStep = taskKind(step.rows[0].exercise, step.rows[0].section, kind) === "sprint";
  const restDockButtons = restScreen && (
    <>
      <p className="bw-set-dock-note">Przerwa nie rozpoczyna serii automatycznie</p>
      <button type="button" className="bw-runner-primary" onClick={() => rest.setValue(null)}>
        {!ownRest
          ? "Rozpocznij ćwiczenie"
          : sprintStep
            ? "Rozpocznij kolejny odcinek"
            : "Rozpocznij kolejną serię"}
      </button>
      {ownRest && step.kind === "single" && (
        <button
          type="button"
          className="bw-set-dock-link"
          onClick={() => void finishExercise(step)}
        >
          Zakończ ćwiczenie
        </button>
      )}
    </>
  );

  return (
    <div
      ref={rootRef}
      className="bw-runner"
      data-mode="active"
      data-view="exercise"
      data-session-runner={kind}
    >
      {tab === "trening" || guided ? exerciseTop : null}
      <ExerciseView
        key={`${fingerprint}:${step.key}`}
        active
        dock={restDockButtons || null}
        step={step}
        index={index}
        total={steps.length}
        tab={tab}
        onTab={setTab}
        onList={null}
        status={step.kind === "single" ? status(step.rows[0]) : undefined}
        guidedLabel={guided ? sectionLabel(step.section) : null}
        training={
          restScreen ? (
            <RestScreen
              countdown={restScreen}
              saved={ownRest ? (sprintStep ? "Odcinek zaliczony" : "Seria zapisana") : null}
              onChange={(next) => rest.setValue(next)}
            />
          ) : guided ? (
            <article className="bw-runner-card">
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
            <section className="bw-runner-linked" aria-label={method?.name}>
              {step.rows.map((row) => cardFor(row, true))}
            </section>
          ) : (
            cardFor(step.rows[0], false)
          )
        }
        nav={
          <>
            {syncNotice}
            <button type="button" className="bw-runner-others" onClick={showList}>
              Pozostałe ćwiczenia
            </button>
            <nav className="bw-runner-nav" data-quiet="" aria-label="Ćwiczenia">
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
          </>
        }
      />
      {!restScreen && restDock}
    </div>
  );
}

/**
 * One exercise (or an A1/A2 pair). During training the card itself carries
 * the name; the plan preview shows it above. "Jak wykonać?" opens the
 * animation and short instruction in place (mounted only while shown), and
 * going back never touches entries, marks or the rest. The bottom action area
 * holds the main button of the open card.
 */
function ExerciseView({
  active,
  step,
  index,
  total,
  tab,
  onTab,
  onList,
  status,
  guidedLabel,
  training,
  nav,
  dock = null,
}: {
  /** Started session: the card shows the name, the top row shows the position. */
  active: boolean;
  step: RunnerStep;
  index: number;
  total: number;
  tab: ExerciseTab;
  onTab: (tab: ExerciseTab) => void;
  /** Back to the list (preview); the active view has "Pozostałe ćwiczenia". */
  onList: (() => void) | null;
  status?: RowStatus;
  /** A guided cool-down runs as one timed sequence with its own instructions. */
  guidedLabel: string | null;
  training: ReactNode;
  nav: ReactNode;
  /** Buttons for the bottom action area besides those the card sends there. */
  dock?: ReactNode;
}) {
  const [techniqueRow, setTechniqueRow] = useState(0);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const linked = step.kind === "linked";
  const method = linked ? blockMethod(step.rows[0].block) : null;
  const first = step.rows[0];
  const shownTab: ExerciseTab = guidedLabel ? "trening" : tab;
  const techniqueFor = step.rows[Math.min(techniqueRow, step.rows.length - 1)];

  if (shownTab === "technika")
    return (
      <section className="bw-unit-exercise" aria-label="Jak wykonać">
        <div className="bw-runner-count">
          <button
            type="button"
            className="bw-unit-back"
            aria-label="Zamknij instrukcję"
            onClick={() => onTab("trening")}
          >
            <ChevronLeft aria-hidden="true" /> Wróć
          </button>
        </div>
        <header className="bw-unit-exercise-head">
          <p className="bw-runner-eyebrow">Jak wykonać?</p>
          <h2>
            <span className="bw-runner-name">{canonicalExerciseName(techniqueFor.exercise)}</span>
          </h2>
        </header>
        {step.rows.length > 1 && (
          <div className="bw-unit-pick" role="group" aria-label="Technika ćwiczenia">
            {step.rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                aria-pressed={row === techniqueFor}
                onClick={() => setTechniqueRow(i)}
              >
                {linkedLabel(row.block, row.exercise) ?? canonicalExerciseName(row.exercise)}
              </button>
            ))}
          </div>
        )}
        <div className="bw-unit-panel">
          <HowToPanel key={techniqueFor.key} exercise={techniqueFor.exercise} />
        </div>
      </section>
    );

  const showHead = !active || guidedLabel !== null || linked;
  return (
    <section className="bw-unit-exercise" aria-label="Ćwiczenie">
      {onList && (
        <div className="bw-runner-count">
          <button type="button" className="bw-unit-back" onClick={onList}>
            <ChevronLeft aria-hidden="true" /> Lista ćwiczeń
          </button>
          <span>
            {index + 1} z {total}
          </span>
        </div>
      )}
      {showHead && (
        <header className="bw-unit-exercise-head">
          <p className="bw-runner-eyebrow">
            {sectionLabel(step.section)}
            {method && ` · ${method.name}`}
          </p>
          <h2>
            <span className="bw-runner-name">
              {guidedLabel
                ? `${guidedLabel} · ${step.rows.length} ćw.`
                : linked
                  ? step.rows.map((row) => canonicalExerciseName(row.exercise)).join(" + ")
                  : canonicalExerciseName(first.exercise)}
            </span>
            {status === "done" && <Check className="bw-runner-done-icon" aria-label="Wykonane" />}
          </h2>
          {!linked && !guidedLabel && <p className="bw-runner-dose">{doseLine(first.exercise)}</p>}
        </header>
      )}
      <DockSlot.Provider value={active ? slot : null}>
        <div className="bw-unit-panel">{training}</div>
      </DockSlot.Provider>
      {!guidedLabel && (
        <button type="button" className="bw-unit-howto" onClick={() => onTab("technika")}>
          <span>Jak wykonać?</span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
      {nav}
      {active && (
        <div className="bw-runner-dock" ref={setSlot}>
          {dock}
        </div>
      )}
    </section>
  );
}
