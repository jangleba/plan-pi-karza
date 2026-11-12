import { Check, ChevronRight, Minus } from "lucide-react";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { blockMethod, linkedLabel } from "@/lib/loadwise/blockMethod";
import { sectionLabel, type RunnerRow, type RunnerStep } from "@/lib/loadwise/sessionRunner/steps";
import { doseLine } from "@/lib/loadwise/sessionRunner/presentation";
import type { RowStatus } from "./RunnerCard";

type Group = { key: string; title: string; items: { step: RunnerStep; index: number }[] };

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
          <ul>
            {group.items.map(({ step, index }) => {
              const method = step.kind === "linked" ? blockMethod(step.rows[0].block) : null;
              const current = index === currentIndex;
              return (
                <li key={step.key} data-linked={step.kind === "linked" || undefined}>
                  {method && <p className="bw-rplan-method">{method.name}</p>}
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
          </ul>
        </section>
      ))}
    </div>
  );
}
