import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus } from "lucide-react";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { blockMethod, linkedLabel } from "@/lib/loadwise/blockMethod";
import { sectionLabel, type RunnerRow, type RunnerStep } from "@/lib/loadwise/sessionRunner/steps";
import {
  doseLine,
  keyCue,
  pairedNext,
  taskKind,
  type SessionKind,
} from "@/lib/loadwise/sessionRunner/presentation";
import { HowToSection } from "./HowToSection";
import { rowFacts, type RowStatus } from "./RunnerCard";

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
 * The whole session as a compact list grouped by its real parts. In preview a
 * row opens its details in place; in "Cały plan" a row jumps to that exercise.
 * No inactive entry fields, no per-row notices.
 */
export function SessionPlanList({
  steps,
  status,
  mode,
  sessionKind,
  currentIndex,
  onSelect,
}: {
  steps: RunnerStep[];
  status: (row: RunnerRow) => RowStatus;
  mode: "preview" | "navigate";
  sessionKind: SessionKind;
  currentIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="bw-rplan" data-mode={mode}>
      {groups(steps).map((group) => (
        <section key={group.key} className="bw-rplan-group" aria-label={group.title}>
          <h3>
            {group.title}
            <small>{group.items.reduce((n, item) => n + item.step.rows.length, 0)}</small>
          </h3>
          <ul>
            {group.items.map(({ step, index }) => {
              const method = step.kind === "linked" ? blockMethod(step.rows[0].block) : null;
              return (
                <li key={step.key} data-linked={step.kind === "linked" || undefined}>
                  {method && <p className="bw-rplan-method">{method.name}</p>}
                  {step.rows.map((row) => {
                    const state = status(row);
                    const label = linkedLabel(row.block, row.exercise);
                    const expanded = open === row.key;
                    const content = (
                      <>
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
                        {mode === "preview" ? (
                          <ChevronDown
                            aria-hidden="true"
                            className={expanded ? "is-open" : undefined}
                          />
                        ) : (
                          <ChevronRight aria-hidden="true" />
                        )}
                      </>
                    );
                    return (
                      <div
                        key={row.key}
                        className="bw-rplan-row"
                        data-current={index === currentIndex || undefined}
                      >
                        {mode === "preview" ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : row.key)}
                          >
                            {content}
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-current={index === currentIndex ? "step" : undefined}
                            onClick={() => onSelect?.(index)}
                          >
                            {content}
                          </button>
                        )}
                        {mode === "preview" && expanded && (
                          <RowDetails
                            row={row}
                            linked={step.kind === "linked"}
                            sessionKind={sessionKind}
                          />
                        )}
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

function RowDetails({
  row,
  linked,
  sessionKind,
}: {
  row: RunnerRow;
  linked: boolean;
  sessionKind: SessionKind;
}) {
  const kind = taskKind(row.exercise, row.section, sessionKind);
  const facts = rowFacts(row, kind, linked);
  const cue = keyCue(row.exercise);
  return (
    <div className="bw-rplan-details">
      {facts.length > 0 && (
        <dl className="bw-runner-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {cue && <p className="bw-runner-cue">{cue}</p>}
      {linked && <p className="bw-runner-muted">{pairedNext(row.block, row.exercise)}</p>}
      <HowToSection exercise={row.exercise} />
    </div>
  );
}
