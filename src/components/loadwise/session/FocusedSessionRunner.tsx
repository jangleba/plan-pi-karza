import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, List, BookOpen } from "lucide-react";
import type { TrainingBlock, TrainingExercise, TrainingSection } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { useSessionExecution } from "@/lib/loadwise/useSessionExecution";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingFingerprint, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { plannedSets } from "@/lib/loadwise/setLogs";
import {
  canonicalExerciseName,
  compactPrescription,
  formatRestValue,
} from "@/lib/loadwise/sessionPresentation";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SprintRestTimer } from "./SprintRestTimer";
import { SprintTimingPanel } from "./SprintTimingPanel";
import { CooldownCoach } from "../preparation/PreparationGuide";
import { cooldownFromExercises } from "@/lib/loadwise/preparation/protocols";
import {
  blockMethod,
  isLinkedBlock,
  linkedLabel,
  linkedNextStep,
} from "@/lib/loadwise/blockMethod";

const parseIndex = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 500 ? v : undefined;
const labels: Record<string, string> = {
  warmup: "Rozgrzewka",
  prep: "Przygotowanie",
  main: "Część główna",
  accessory: "Uzupełnienie",
  footballTransfer: "Z piłką",
  cooldown: "Zakończenie",
};
type Row = { section: TrainingSection; block: TrainingBlock; exercise: TrainingExercise };
/** One screen: a single exercise, a whole superset/contrast pair, or a guided cool-down. */
type Step = { kind: "single" | "linked" | "guided"; section: TrainingSection; rows: Row[] };

export function FocusedSessionRunner({
  sections,
  date,
  sessionId,
  canRecord = false,
  kind = "general",
  onFinish,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
  canRecord?: boolean;
  kind?: "strength" | "sprint" | "general";
  onFinish: () => void;
}) {
  const { user } = useAuth();
  // A cool-down made only of guided movements runs as one timed sequence:
  // side, switch, set and rest are announced, so the phone can stay down.
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
    () =>
      sections.flatMap((section): Step[] => {
        const rows = section.blocks.flatMap((block) =>
          block.exercises.map((exercise) => ({ section, block, exercise })),
        );
        if (!rows.length) return [];
        if (guidedCooldowns.has(section.id)) return [{ kind: "guided", section, rows }];
        return section.blocks.flatMap((block): Step[] =>
          isLinkedBlock(block)
            ? [{ kind: "linked", section, rows: rows.filter((r) => r.block === block) }]
            : block.exercises.map((exercise) => ({
                kind: "single",
                section,
                rows: [{ section, block, exercise }],
              })),
        );
      }),
    [sections, guidedCooldowns],
  );
  const rows = useMemo(() => steps.flatMap((step) => step.rows), [steps]);
  const exercises = useMemo(() => rows.map((r) => r.exercise), [rows]);
  const fingerprint = trainingFingerprint(exercises);
  const selection = useTrainingLocalState(
    trainingStorageKey("focused-step", user?.id, sessionId ?? date, fingerprint),
    0,
    parseIndex,
  );
  const index = Math.min(selection.value, Math.max(0, steps.length - 1));
  const record = useSessionExecution(exercises, sessionId, date);
  const [planOpen, setPlanOpen] = useState(false),
    [technique, setTechnique] = useState<TrainingExercise | null>(null),
    [busy, setBusy] = useState(false);
  const [rest, setRest] = useState({ label: "", token: 0 });
  const step = steps[index];
  if (!step) return null;
  const { section } = step;
  const isLast = index === steps.length - 1;
  const stageSteps = steps.filter((s) => s.section.id === section.id);
  const stageIndex = stageSteps.indexOf(step);
  const linkedBlock = step.kind === "linked" ? step.rows[0].block : null;
  const method = linkedBlock ? blockMethod(linkedBlock) : null;
  const guidedCooldown = step.kind === "guided" ? guidedCooldowns.get(section.id) : undefined;
  function go(next: number) {
    selection.setValue(Math.max(0, Math.min(steps.length - 1, next)));
    setTechnique(null);
  }
  function startRest(label: string | undefined) {
    if (label) setRest((r) => ({ label, token: r.token + 1 }));
  }
  function advanceWhenDone(doneIds: Set<string>) {
    if (!step.rows.every((r) => doneIds.has(r.exercise.id))) return;
    if (isLast) onFinish();
    else go(index + 1);
  }
  const doneIds = (extra?: string) =>
    new Set([
      ...rows.filter((r) => record.done[r.exercise.id]).map((r) => r.exercise.id),
      extra ?? "",
    ]);
  async function complete(row: Row) {
    if (!canRecord || busy) return;
    setBusy(true);
    try {
      if (!(await record.markDone(row.exercise.id, true))) return;
      const { exercise, block } = row;
      const next = step.rows.find((r) => r !== row && !record.done[r.exercise.id]);
      startRest(
        next
          ? exercise.restAfterExercise
          : exercise.restAfterPair || exercise.restAfterExercise || block.restAfterBlock,
      );
      advanceWhenDone(doneIds(exercise.id));
    } finally {
      setBusy(false);
    }
  }
  async function setSaved(row: Row, finished: boolean) {
    const { exercise, block } = row;
    if (finished && !(await record.markDone(exercise.id, true))) return;
    if (step.kind === "linked") {
      const position = block.exercises.findIndex((e) => e.id === exercise.id);
      const after = block.exercises.slice(position + 1).find((e) => !record.done[e.id]);
      startRest(
        after ? exercise.restAfterExercise : exercise.restAfterPair || block.restAfterBlock,
      );
    }
    if (finished) advanceWhenDone(doneIds(exercise.id));
  }
  function tile(row: Row) {
    const { exercise, block } = row;
    const done = record.done[exercise.id] === true;
    const label = linkedLabel(block, exercise);
    const strength =
      kind === "strength" &&
      !["warmup", "prep", "cooldown"].includes(section.type) &&
      plannedSets(exercise) > 0;
    const sprint =
      kind === "sprint" &&
      section.type === "main" &&
      /sprint|start|przyspiesz|akcelera|bieg lotny/i.test(exercise.name);
    const lastOfStep = step.rows.every((r) => r === row || record.done[r.exercise.id]);
    return (
      <article
        className={`bw-focus-card${step.kind === "linked" ? " bw-focus-tile" : ""}`}
        key={`${fingerprint}:${exercise.id}`}
        data-done={done || undefined}
      >
        {step.kind === "single" && (
          <div className="bw-focus-stage">
            <span>{labels[section.type] ?? section.title}</span>
            <span>
              {stageIndex + 1}/{stageSteps.length}
            </span>
          </div>
        )}
        <h2>
          {label && <span className="bw-focus-label">{label}</span>}
          {canonicalExerciseName(exercise)}
          {done && <Check className="bw-focus-done" size={18} aria-label="Wykonane" />}
        </h2>
        <p className="bw-focus-dose">{compactPrescription(exercise)}</p>
        {exercise.rir && (
          <p className="bw-session-muted">
            Zapas: {exercise.rir.replace(/\s*RIR/gi, "")} powtórzeń
          </p>
        )}
        {step.kind === "linked" ? (
          <p className="bw-session-muted">{linkedNextStep(block, exercise)}</p>
        ) : (
          (exercise.restAfterPair || exercise.restAfterExercise) && (
            <p className="bw-session-muted">
              Przerwa {formatRestValue(exercise.restAfterPair || exercise.restAfterExercise || "")}
            </p>
          )
        )}
        <button type="button" className="bw-technique-open" onClick={() => setTechnique(exercise)}>
          <BookOpen size={17} /> Technika i animacja <ChevronRight size={16} />
        </button>
        {exercise.executionBlockedReason && (
          <p role="status" className="bw-training-error">
            {exercise.executionBlockedReason}
          </p>
        )}
        {canRecord && strength && !exercise.executionBlockedReason && (
          <ExerciseRunnerScreen
            exercise={exercise}
            sessionId={sessionId}
            date={date}
            open
            inline
            showVisuals={false}
            manageRest={step.kind !== "linked"}
            onClose={() => {}}
            onSetSaved={(_, finished) => {
              void setSaved(row, finished);
            }}
          />
        )}
        {canRecord && sprint && (
          <SprintTimingPanel
            exercise={exercise}
            sessionId={sessionId}
            onRepeat={() =>
              startRest(
                exercise.restAfterExercise || exercise.restAfterPair || block.restAfterBlock,
              )
            }
          />
        )}
        {canRecord && !strength && (
          <button
            type="button"
            className="bw-session-primary"
            disabled={busy || Boolean(exercise.executionBlockedReason)}
            onClick={() => void complete(row)}
          >
            {busy
              ? "Zapisuję…"
              : done
                ? "Następne ćwiczenie"
                : lastOfStep && isLast
                  ? "Gotowe · podsumowanie"
                  : "Wykonane · dalej"}
          </button>
        )}
      </article>
    );
  }
  return (
    <div className="bw-focused-runner" data-session-runner={kind}>
      <div className="bw-focus-navigation">
        <span>
          {exercises.filter((e) => record.done[e.id]).length}/{rows.length} oznaczonych
        </span>
        <button type="button" onClick={() => setPlanOpen(true)}>
          <List size={16} /> Plan sesji
        </button>
      </div>
      {guidedCooldown ? (
        <article className="bw-focus-card" key={`${fingerprint}:${section.id}:guided`}>
          <div className="bw-focus-stage">
            <span>{labels[section.type] ?? section.title}</span>
            <span>{step.rows.length} ćwiczenia</span>
          </div>
          <CooldownCoach
            protocol={guidedCooldown}
            storageKey={`${trainingStorageKey("cooldown", user?.id, sessionId ?? date, fingerprint)}${canRecord ? "" : ":preview"}`}
            onFinish={async () => {
              if (!canRecord) return;
              for (const r of step.rows) await record.markDone(r.exercise.id, true);
              if (isLast) onFinish();
              else go(index + 1);
            }}
          />
        </article>
      ) : step.kind === "linked" ? (
        <section className="bw-focus-linked" aria-label={method?.name}>
          <div className="bw-focus-stage">
            <span>
              {labels[section.type] ?? section.title} · {method?.name}
            </span>
            <span>
              {stageIndex + 1}/{stageSteps.length}
            </span>
          </div>
          {step.rows.map(tile)}
        </section>
      ) : (
        tile(step.rows[0])
      )}
      {!canRecord && (
        <p className="bw-session-muted">Zapis wykonania będzie dostępny po rozpoczęciu sesji.</p>
      )}
      {rest.label && (
        <div className="bw-focus-rest">
          <SprintRestTimer label={rest.label} compact startToken={rest.token} />
        </div>
      )}
      <div className="bw-focus-browse">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} /> Wstecz
        </button>
        <span>
          {index + 1}/{steps.length}
        </span>
        <button type="button" disabled={isLast} onClick={() => go(index + 1)}>
          Dalej <ChevronRight size={18} />
        </button>
      </div>
      {record.notice && (
        <p className="bw-session-muted" role="status">
          {record.notice}
        </p>
      )}
      {!record.cloud && canRecord && (
        <p className="bw-session-muted">Oznaczenia na tym urządzeniu.</p>
      )}
      {technique && (
        <ExerciseDetailSheet
          exercise={technique}
          open
          onOpenChange={(open) => !open && setTechnique(null)}
        />
      )}
      <Drawer open={planOpen} onOpenChange={setPlanOpen} initialDetent="large">
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Plan sesji</DrawerTitle>
          <div className="bw-focus-plan">
            {steps.map((planStep, i) =>
              planStep.rows.map((r) => (
                <button
                  type="button"
                  key={r.exercise.id}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => {
                    go(i);
                    setPlanOpen(false);
                  }}
                >
                  <span>
                    {record.done[r.exercise.id] ? (
                      <Check size={17} />
                    ) : (
                      (linkedLabel(r.block, r.exercise) ?? i + 1)
                    )}
                  </span>
                  <span>
                    <strong>{canonicalExerciseName(r.exercise)}</strong>
                    <small>
                      {[
                        planStep.kind === "linked" ? blockMethod(r.block)?.name : null,
                        compactPrescription(r.exercise),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              )),
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
