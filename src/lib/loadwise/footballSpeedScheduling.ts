export type FootballSpeedDateIssue =
  | "match_day"
  | "match_minus_one"
  | "duplicate_date"
  | "consecutive_date";

export interface FootballSpeedDateValidation {
  valid: boolean;
  issues: FootballSpeedDateIssue[];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Validates ISO calendar dates without converting them through the device timezone. */
export function validateFootballSpeedDate(
  date: string,
  options: {
    matchDate?: string | null;
    speedDates?: Iterable<string>;
  } = {},
): FootballSpeedDateValidation {
  const speedDates = new Set(options.speedDates ?? []);
  const issues: FootballSpeedDateIssue[] = [];
  if (options.matchDate === date) issues.push("match_day");
  if (options.matchDate === addDays(date, 1)) issues.push("match_minus_one");
  if (speedDates.has(date)) issues.push("duplicate_date");
  if (speedDates.has(addDays(date, -1)) || speedDates.has(addDays(date, 1))) {
    issues.push("consecutive_date");
  }
  return { valid: issues.length === 0, issues };
}

export function nearestFutureValidFootballSpeedDate(
  sourceDate: string,
  horizon: Iterable<string>,
  options: {
    matchDate?: string | null;
    speedDates?: Iterable<string>;
  } = {},
): string | null {
  const speedDates = new Set(options.speedDates ?? []);
  return [...horizon]
    .filter((date) => date > sourceDate)
    .sort()
    .find(
      (date) =>
        validateFootballSpeedDate(date, {
          matchDate: options.matchDate,
          speedDates,
        }).valid,
    ) ?? null;
}
