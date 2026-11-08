import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, List, BookOpen } from "lucide-react";
import type { TrainingSection } from "@/lib/loadwise/types";
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
  const rows = useMemo(
    () =>
      sections.flatMap((section) =>
        section.blocks.flatMap((block) =>
          block.exercises.map((exercise) => ({ section, block, exercise })),
        ),
      ),
    [sections],
  );
  const exercises = useMemo(() => rows.map((r) => r.exercise), [rows]);
  const fingerprint = trainingFingerprint(exercises);
  const selection = useTrainingLocalState(
    trainingStorageKey("focused", user?.id, sessionId ?? date, fingerprint),
    0,
    parseIndex,
  );
  const index = Math.min(selection.value, Math.max(0, rows.length - 1));
  const record = useSessionExecution(exercises, sessionId, date);
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
  const [planOpen, setPlanOpen] = useState(false),
    [technique, setTechnique] = useState(false),
    [busy, setBusy] = useState(false);
  const [rest, setRest] = useState({ label: "", token: 0 });
  const row = rows[index];
  if (!row) return null;
  const { exercise, section, block } = row;
  const done = record.done[exercise.id] === true;
  const strength =
    kind === "strength" &&
    !["warmup", "prep", "cooldown"].includes(section.type) &&
    plannedSets(exercise) > 0;
  const sprint =
    kind === "sprint" &&
    section.type === "main" &&
    /sprint|start|przyspiesz|akcelera|bieg lotny/i.test(exercise.name);
  const dose = compactPrescription(exercise);
  const guidedCooldown = guidedCooldowns.get(section.id);
  const stageRows = rows.filter((r) => r.section.id === section.id);
  const stageIndex = stageRows.findIndex((r) => r.exercise.id === exercise.id);
  const isLast = index === rows.length - 1;
  function go(next: number) {
    selection.setValue(Math.max(0, Math.min(rows.length - 1, next)));
    setTechnique(false);
  }
  async function complete() {
    if (!canRecord || busy) return;
    setBusy(true);
    try {
      if (!(await record.markDone(exercise.id, true))) return;
      const label = exercise.restAfterPair || exercise.restAfterExercise || block.restAfterBlock;
      if (label) setRest((r) => ({ label, token: r.token + 1 }));
      if (isLast) onFinish();
      else go(index + 1);
    } finally {
      setBusy(false);
    }
  }
  async function setSaved(finished: boolean) {
    if (finished && !(await record.markDone(exercise.id, true))) return;
    const position = block.exercises.findIndex((e) => e.id === exercise.id);
    const paired = block.exercises.length > 1 && block.exercises.some((e) => e.restAfterPair);
    if (paired) {
      const after = block.exercises.slice(position + 1).find((e) => !record.done[e.id]);
      const next =
        after ??
        block.exercises.find((e) => e.id !== exercise.id && !record.done[e.id]) ??
        (!finished ? exercise : undefined);
      const label = after
        ? exercise.restAfterExercise
        : exercise.restAfterPair || block.restAfterBlock;
      if (label) setRest((r) => ({ label, token: r.token + 1 }));
      if (next) {
        go(rows.findIndex((r) => r.exercise.id === next.id));
        return;
      }
    }
    if (finished) {
      if (isLast) onFinish();
      else go(index + 1);
    }
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
            <span>{stageRows.length} ćwiczenia</span>
          </div>
          <CooldownCoach
            protocol={guidedCooldown}
            storageKey={`${trainingStorageKey("cooldown", user?.id, sessionId ?? date, fingerprint)}${canRecord ? "" : ":preview"}`}
            onFinish={async () => {
              if (!canRecord) return;
              for (const r of stageRows) await record.markDone(r.exercise.id, true);
              const after = rows.findIndex((r, i) => i > index && r.section.id !== section.id);
              if (after === -1) onFinish();
              else go(after);
            }}
          />
        </article>
      ) : (
        <article className="bw-focus-card" key={`${fingerprint}:${exercise.id}`}>
          <div className="bw-focus-stage">
            <span>{labels[section.type] ?? section.title}</span>
            <span>
              {stageIndex + 1}/{stageRows.length}
            </span>
          </div>
          <h2>{canonicalExerciseName(exercise)}</h2>
          <p className="bw-focus-dose">{dose}</p>
          {exercise.rir && (
            <p className="bw-session-muted">
              Zapas: {exercise.rir.replace(/\s*RIR/gi, "")} powtórzeń
            </p>
          )}
          {(exercise.restAfterPair || exercise.restAfterExercise) && (
            <p className="bw-session-muted">
              Przerwa {formatRestValue(exercise.restAfterPair || exercise.restAfterExercise || "")}
            </p>
          )}
          <button type="button" className="bw-technique-open" onClick={() => setTechnique(true)}>
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
              manageRest={!block.exercises.some((e) => e.restAfterPair)}
              onClose={() => {}}
              onSetSaved={(_, finished) => {
                void setSaved(finished);
              }}
            />
          )}
          {canRecord && sprint && (
            <SprintTimingPanel
              exercise={exercise}
              sessionId={sessionId}
              onRepeat={() => {
                const label =
                  exercise.restAfterExercise || exercise.restAfterPair || block.restAfterBlock;
                if (label) setRest((r) => ({ label, token: r.token + 1 }));
              }}
            />
          )}
          {canRecord && !strength && (
            <button
              type="button"
              className="bw-session-primary"
              disabled={busy || Boolean(exercise.executionBlockedReason)}
              onClick={() => void complete()}
            >
              {busy
                ? "Zapisuję…"
                : isLast
                  ? "Gotowe · podsumowanie"
                  : done
                    ? "Następne ćwiczenie"
                    : "Wykonane · dalej"}
            </button>
          )}
          {!canRecord && (
            <p className="bw-session-muted">
              Zapis wykonania będzie dostępny po rozpoczęciu sesji.
            </p>
          )}
        </article>
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
          {index + 1}/{rows.length}
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
      <ExerciseDetailSheet exercise={exercise} open={technique} onOpenChange={setTechnique} />
      <Drawer open={planOpen} onOpenChange={setPlanOpen} initialDetent="large">
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Plan sesji</DrawerTitle>
          <div className="bw-focus-plan">
            {rows.map((r, i) => (
              <button
                type="button"
                key={r.exercise.id}
                aria-current={i === index ? "step" : undefined}
                onClick={() => {
                  go(i);
                  setPlanOpen(false);
                }}
              >
                <span>{record.done[r.exercise.id] ? <Check size={17} /> : i + 1}</span>
                <span>
                  <strong>{canonicalExerciseName(r.exercise)}</strong>
                  <small>{compactPrescription(r.exercise)}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
