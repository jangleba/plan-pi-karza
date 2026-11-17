import { Check, ChevronRight, Minus } from "lucide-react";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { blockMethod, linkedLabel } from "@/lib/loadwise/blockMethod";
import { sectionLabel, type RunnerRow, type RunnerStep } from "@/lib/loadwise/sessionRunner/steps";
import { doseLine, restSecondsAfter, singleRest } from "@/lib/loadwise/sessionRunner/presentation";
import type { RowStatus } from "./RunnerCard";

type Item = { step: RunnerStep; index: number };
type Group = { key: string; title: string; items: Item[] };

/** Rest under a single exercise; a zero rest ("0 s") is not worth a line. */
function restLabel(exercise: RunnerRow["exercise"]): string | null {
  // The last exercise of a round rests as long as the plan says after the round (postRestSeconds),
  // exactly what the runner times; the short between-exercise rest is not shown for it.
  const post = exercise.engineDose?.postRestSeconds;
  if (post && exercise.engineDose?.circuit) return `Przerwa ${seconds(post)}`;
  const text = singleRest(exercise);
  return text && !/^Przerwa 0\s*s\b/.test(text) ? text : null;
}

/** "30 s", "2 min", "2 min 30 s". */
function seconds(value: number): string {
  if (value < 60) return `${value} s`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
function roundsWord(n: number): string {
  if (n === 1) return "1 runda";
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return `${n} ${!teen && last >= 2 && last <= 4 ? "rundy" : "rund"}`;
}

/** Rounds and the two rests of a linked block, as the runner will time them. */
export function linkedSummary(step: RunnerStep): {
  letter: string;
  rounds: string | null;
  rest: string | null;
} {
  const block = step.rows[0].block;
  const first = step.rows[0].exercise;
  const last = step.rows[step.rows.length - 1].exercise;
  const letter = linkedLabel(block, first)?.[0] ?? "A";
  const sets = Number(String(first.sets ?? "").match(/\d+/)?.[0]);
  const between = restSecondsAfter(block, first, true, true);
  // Same value the runner starts after the last exercise of a round (postRestSeconds first).
  const after = restSecondsAfter(block, last, true, false, true);
  const rest = [
    between ? `${seconds(between)} między` : "bez przerwy między",
    after ? `${seconds(after)} po rundzie` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { letter, rounds: Number.isFinite(sets) && sets > 0 ? roundsWord(sets) : null, rest };
}

const circuitOf = (item: Item) => item.step.rows[0].exercise.engineDose?.circuit;

/**
 * Linked steps stand alone; consecutive single exercises share one card; the occurrences of one
 * round circuit (A-March, Ankling, A-Skip × 3 rounds) form one card with the occurrences kept.
 */
type Card = { kind: "items"; items: Item[] } | { kind: "circuit"; items: Item[] };
function cards(items: Item[]): Card[] {
  const out: Card[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    const circuit = circuitOf(item);
    if (circuit) {
      if (last?.kind === "circuit" && circuitOf(last.items[0])?.id === circuit.id)
        last.items.push(item);
      else out.push({ kind: "circuit", items: [item] });
    } else if (
      item.step.kind !== "linked" &&
      last?.kind === "items" &&
      last.items[0].step.kind !== "linked"
    )
      last.items.push(item);
    else out.push({ kind: "items", items: [item] });
  }
  return out;
}

/** One entry per exercise of the circuit; its occurrences in every round stay separate rows. */
export function circuitTasks(items: Item[]) {
  const tasks = new Map<number, Item[]>();
  for (const item of items) {
    const task = circuitOf(item)?.task ?? 1;
    tasks.set(task, [...(tasks.get(task) ?? []), item]);
  }
  return [...tasks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([task, occurrences]) => ({ task, occurrences }));
}

/** Parts of a sprint session, in the order they are done. */
const SPRINT_PHASE_TITLE: Record<string, string> = {
  preparation: "Przygotowanie",
  technical: "Technika",
  buildup: "Przebieżki",
  resisted: "Główny sprint",
  main: "Główny sprint",
  addition: "Dodatki",
  cooldown: "Zakończenie",
};
const stageOf = (step: RunnerStep) => step.rows[0].exercise.engineDose?.speedStage;
const isSprintPlan = (steps: RunnerStep[]) =>
  steps.length > 0 &&
  steps.every((step) => !!stageOf(step) && !!SPRINT_PHASE_TITLE[stageOf(step)!]);

function groups(steps: RunnerStep[]): Group[] {
  const out: Group[] = [];
  const sprint = isSprintPlan(steps);
  steps.forEach((step, index) => {
    const title = sprint ? SPRINT_PHASE_TITLE[stageOf(step)!] : sectionLabel(step.section);
    const last = out[out.length - 1];
    // Consecutive sections with one label ("Część główna" + ball transfer) read as one part.
    if (last && last.title === title) last.items.push({ step, index });
    else out.push({ key: step.section.id, title, items: [{ step, index }] });
  });
  return out;
}

/**
 * The whole session as one flat list grouped by its real parts: name and dose
 * on each row, a status mark, and one tap opens the exercise with its
 * "Trening" and "Technika" tabs. Nothing expands in place.
 */
export function SessionPlanList({
  steps,
  status,
  currentIndex,
  onSelect,
}: {
  steps: RunnerStep[];
  status: (row: RunnerRow) => RowStatus;
  /** The exercise to continue with (active session only). */
  currentIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="bw-rplan">
      {groups(steps).map((group) => (
        <section key={group.key} className="bw-rplan-group" aria-label={group.title}>
          <h3>
            {group.title}
            <small>
              {cards(group.items).reduce(
                (n, entry) =>
                  n +
                  (entry.kind === "circuit"
                    ? circuitTasks(entry.items).length
                    : entry.items.reduce((m, item) => m + item.step.rows.length, 0)),
                0,
              )}
            </small>
          </h3>
          {cards(group.items).map((entry) => {
            if (entry.kind === "circuit")
              return (
                <CircuitCard
                  key={entry.items[0].step.key}
                  items={entry.items}
                  status={status}
                  currentIndex={currentIndex}
                  onSelect={onSelect}
                />
              );
            const card = entry.items;
            const linked = card[0].step.kind === "linked";
            const method = linked ? blockMethod(card[0].step.rows[0].block) : null;
            const summary = linked ? linkedSummary(card[0].step) : null;
            return (
              <ul
                key={card[0].step.key}
                className="bw-rplan-card"
                data-linked={linked || undefined}
                aria-label={method && summary ? `${method.name} ${summary.letter}` : undefined}
              >
                {method && summary && (
                  <li className="bw-rplan-head" aria-hidden="true">
                    <p className="bw-rplan-method">
                      {method.name} {summary.letter}
                      {summary.rounds && <span> · {summary.rounds}</span>}
                    </p>
                  </li>
                )}
                {card.map(({ step, index }) => {
                  const current = index === currentIndex;
                  return (
                    <li key={step.key} data-linked={step.kind === "linked" || undefined}>
                      {step.rows.map((row) => {
                        const state = status(row);
                        const label = linkedLabel(row.block, row.exercise);
                        return (
                          <div
                            key={row.key}
                            className="bw-rplan-row"
                            data-current={current || undefined}
                          >
                            <button
                              type="button"
                              aria-current={current ? "step" : undefined}
                              onClick={() => onSelect(index)}
                            >
                              <span className="bw-rplan-mark" data-state={state}>
                                {state === "done" ? (
                                  <Check aria-label="Wykonane" />
                                ) : state === "skipped" ? (
                                  <Minus aria-label="Pominięte" />
                                ) : (
                                  (label ?? "")
                                )}
                              </span>
                              <span className="bw-rplan-text">
                                <strong>{canonicalExerciseName(row.exercise)}</strong>
                                <small>{doseLine(row.exercise)}</small>
                                {!linked && restLabel(row.exercise) ? (
                                  <small className="bw-rplan-row-rest">
                                    {restLabel(row.exercise)}
                                  </small>
                                ) : null}
                              </span>
                              {current && state === "open" && (
                                <span className="bw-rplan-now">Teraz</span>
                              )}
                              <ChevronRight aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </li>
                  );
                })}
                {summary?.rest && (
                  <li className="bw-rplan-rest">
                    <span>Przerwa</span> {summary.rest}
                  </li>
                )}
              </ul>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/**
 * "Technika biegu · 3 rundy": the exercises of one round circuit as one block. Every occurrence
 * keeps its own step, id and log; here a row is done only when all its rounds are, and a tap
 * opens the first round still open.
 */
function CircuitCard({
  items,
  status,
  currentIndex,
  onSelect,
}: {
  items: Item[];
  status: (row: RunnerRow) => RowStatus;
  currentIndex?: number;
  onSelect: (index: number) => void;
}) {
  const tasks = circuitTasks(items);
  const circuit = circuitOf(items[0])!;
  const rounds = Math.max(circuit.rounds ?? 1, ...items.map((item) => circuitOf(item)?.round ?? 1));
  const technical = items[0].step.rows[0].exercise.engineDose?.speedStage === "technical";
  const title = `${technical ? "Technika biegu" : (SPRINT_PHASE_TITLE[stageOf(items[0].step) ?? ""] ?? "Seria")} · ${roundsWord(rounds)}`;
  const firstDose = tasks[0].occurrences[0].step.rows[0].exercise.engineDose;
  const lastDose = tasks[tasks.length - 1].occurrences[0].step.rows[0].exercise.engineDose;
  const between = firstDose?.restSeconds ?? 0;
  const after = lastDose?.postRestSeconds ?? circuit.roundRestSeconds ?? 0;
  const rest = [
    between ? `${seconds(between)} między ćwiczeniami` : null,
    after ? `${seconds(after)} po rundzie` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ul className="bw-rplan-card" data-linked data-circuit aria-label={title}>
      <li className="bw-rplan-head" aria-hidden="true">
        <p className="bw-rplan-method">{title}</p>
      </li>
      {tasks.map(({ task, occurrences }) => {
        const states = occurrences.map((item) => status(item.step.rows[0]));
        const state: RowStatus = states.every((value) => value === "done")
          ? "done"
          : states.every((value) => value !== "open")
            ? "skipped"
            : "open";
        const open = occurrences.find((_, i) => states[i] === "open") ?? occurrences[0];
        const current = occurrences.find((item) => item.index === currentIndex);
        const exercise = occurrences[0].step.rows[0].exercise;
        const doneRounds = states.filter((value) => value !== "open").length;
        return (
          <li key={task} data-linked>
            <div className="bw-rplan-row" data-current={current ? true : undefined}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(open.index)}
              >
                <span className="bw-rplan-mark" data-state={state}>
                  {state === "done" ? (
                    <Check aria-label="Wykonane" />
                  ) : state === "skipped" ? (
                    <Minus aria-label="Pominięte" />
                  ) : (
                    task
                  )}
                </span>
                <span className="bw-rplan-text">
                  <strong>{canonicalExerciseName(exercise)}</strong>
                  <small>
                    {doseLine(exercise)} · {doneRounds} z {occurrences.length} rund
                  </small>
                </span>
                {current && state === "open" && <span className="bw-rplan-now">Teraz</span>}
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
      {rest && (
        <li className="bw-rplan-rest">
          <span>Przerwa</span> {rest}
        </li>
      )}
    </ul>
  );
}
