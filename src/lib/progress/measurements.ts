import {
  resultGroups,
  comparison,
  sameTrial,
  type BrowserResult,
} from "@/features/browser-lab/results";
import { protocolFor, sideLabel } from "@/features/browser-lab/protocols";
import type { JourneyAttempt } from "@/features/football-iq-match/journeyTypes";
import { addIsoDays } from "@/lib/isoDate";
import type { ProgressPeriod } from "./progress";

function localDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildLabProgress(
  rows: readonly BrowserResult[],
  todayIso: string,
  periodDays: ProgressPeriod,
) {
  const from = addIsoDays(todayIso, 1 - periodDays);
  const groups = resultGroups(
    rows.filter((row) => {
      const date = localDate(row.recordedAt);
      return date !== "" && date <= todayIso;
    }),
  )
    .map((group) => ({
      ...group,
      date: group.rows
        .map((row) => row.recordedAt)
        .sort()
        .at(-1)!,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set<string>();
  return groups.flatMap((group) => {
    const latest = group.best,
      key = `${latest.testId}:${latest.side ?? "both"}`;
    if (seen.has(key)) return [];
    seen.add(key);
    if (localDate(group.date) < from) return [];
    const prior = group.complete
      ? groups.find(
          (g) =>
            g.complete &&
            g.best.sessionId !== latest.sessionId &&
            g.best.testId === latest.testId &&
            g.best.side === latest.side &&
            g.best.version === latest.version &&
            g.date < group.date &&
            !g.rows.some((row) => group.rows.some((other) => sameTrial(row, other))),
        )
      : undefined;
    const compared = prior ? comparison(prior.best, latest) : null;
    return [
      {
        key,
        title: `${protocolFor(latest.testId).title}${latest.side ? ` · ${sideLabel(latest.side)}` : ""}`,
        value: latest.primaryValue,
        unit: latest.primaryUnit,
        date: localDate(group.date),
        trials: group.rows.length,
        expected: group.expected,
        complete: group.complete,
        delta: compared?.difference ?? null,
        overlaps: compared?.overlaps ?? null,
        previous: prior?.best.primaryValue ?? null,
      },
    ];
  });
}

export function buildIQProgress(
  rows: readonly JourneyAttempt[],
  todayIso: string,
  periodDays: ProgressPeriod,
) {
  const from = addIsoDays(todayIso, 1 - periodDays);
  const attempts = [...new Map(rows.map((row) => [row.id, row])).values()].filter((row) => {
    const date = localDate(row.createdAt);
    return date !== "" && date >= from && date <= todayIso;
  });
  return {
    total: attempts.length,
    scenarios: new Set(attempts.map((row) => row.scenarioId)).size,
    guided: attempts.filter((row) => row.mode === "learn").length,
    independent: attempts.filter((row) => row.mode === "challenge").length,
  };
}
