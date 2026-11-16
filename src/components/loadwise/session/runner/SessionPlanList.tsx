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
  const after = restSecondsAfter(block, last, true, false);
  const rest = [
    between ? `${seconds(between)} między` : "bez przerwy między",
    after ? `${seconds(after)} po rundzie` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { letter, rounds: Number.isFinite(sets) && sets > 0 ? roundsWord(sets) : null, rest };
}

/** Linked steps stand alone; consecutive single exercises share one card. */
function cards(items: Item[]): Item[][] {
  const out: Item[][] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.step.kind !== "linked" && last && last[0].step.kind !== "linked") last.push(item);
    else out.push([item]);
  }
  return out;
}

function groups(steps: RunnerStep[]): Group[] {
  const out: Group[] = [];
  steps.forEach((step, index) => {
    const title = sectionLabel(step.section);
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
            <small>{group.items.reduce((n, item) => n + item.step.rows.length, 0)}</small>
          </h3>
          {cards(group.items).map((card) => {
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
