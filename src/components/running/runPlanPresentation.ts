import type { RunningIntervalProtocol, RunningIntervalStep } from "@/lib/running/types";
import { durationLabel, goalOf } from "./runGuideText";

interface RunningPreviewRow {
  id: string;
  kind: string;
  title: string;
  tone: "motion" | "warning" | "recovery";
  details: string[];
}
const signature = (step: RunningIntervalStep) =>
  JSON.stringify([step.target, step.label, step.instruction, step.effort, step.setTotal]);
/** A compressed set dose must describe every set, not an average of unequal sets. */
function repetitionsPerCompleteSet(group: RunningIntervalStep[]): number | null {
  const sets = group[0].setTotal;
  if (!sets || !Number.isInteger(sets) || sets < 2 || group.length % sets !== 0) return null;
  const repetitions = group.length / sets;
  const counts = new Map<number, number>();
  for (const step of group) {
    const index = step.setIndex;
    if (index === undefined || !Number.isInteger(index) || index < 1 || index > sets) return null;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return counts.size === sets && [...counts.values()].every((count) => count === repetitions)
    ? repetitions
    : null;
}

/** Only main-phase recoveries are rests between work bouts. */
export function runningPreviewRows(protocol: RunningIntervalProtocol): RunningPreviewRow[] {
  const rows: RunningPreviewRow[] = [];
  const phaseRow = (phase: "warmup" | "cooldown", label: string) => {
    for (const step of protocol.steps.filter((s) => s.phase === phase))
      rows.push({
        id: step.id,
        kind: label,
        title:
          step.target.mode === "time" ? durationLabel(step.target.value ?? 0) : step.target.label,
        tone: "recovery",
        details: step.instruction ? [step.instruction] : [],
      });
  };
  phaseRow("warmup", "Rozgrzewka");
  const work = protocol.steps.filter((s) => (s.phase ?? "main") === "main" && s.kind === "work");
  const groups: RunningIntervalStep[][] = [];
  for (const step of work) {
    const previous = groups.at(-1);
    if (previous && signature(previous[0]) === signature(step)) previous.push(step);
    else groups.push([step]);
  }
  for (const group of groups) {
    const step = group[0];
    const target =
      step.target.mode === "time" && /^\d+:\d\d$/.test(step.target.label)
        ? durationLabel(step.target.value ?? 0)
        : step.target.label;
    const repetitions = repetitionsPerCompleteSet(group);
    const dose =
      repetitions !== null
        ? `${step.setTotal} serie · ${repetitions} × ${target}`
        : group.length > 1
          ? `${group.length} × ${target}`
          : target;
    const goal = step.target.paceTarget || step.effort ? goalOf(step) : null;
    rows.push({
      id: step.id,
      kind: "Bieg",
      title: dose,
      tone: "motion",
      details: [
        goal ? `${step.target.paceTarget ? "Tempo" : "Wysiłek"} ${goal.value}` : null,
        step.instruction || goal?.note,
      ].filter((value): value is string => Boolean(value)),
    });
  }
  const rests = protocol.steps.filter(
    (s) => (s.phase ?? "main") === "main" && s.kind === "recovery",
  );
  const restGroups = new Map<string, RunningIntervalStep[]>();
  for (const rest of rests) {
    const key = signature(rest);
    restGroups.set(key, [...(restGroups.get(key) ?? []), rest]);
  }
  for (const group of restGroups.values()) {
    const step = group[0];
    const betweenSets = /między seriami/i.test(step.label);
    rows.push({
      id: step.id,
      kind: "Przerwa",
      title:
        step.target.mode === "time" ? durationLabel(step.target.value ?? 0) : step.target.label,
      tone: "warning",
      details: [
        `${betweenSets ? "Między seriami" : "Między odcinkami"} · ${group.length} ${group.length === 1 ? "raz" : "razy"}`,
        step.instruction,
      ].filter(Boolean),
    });
  }
  phaseRow("cooldown", "Schłodzenie");
  return rows;
}
