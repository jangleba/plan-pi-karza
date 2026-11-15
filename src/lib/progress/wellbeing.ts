import type { Readiness } from "../loadwise/types";

/**
 * The athlete's own wellbeing trends from the daily check-ins (1–10 scales): the last period
 * against the period before it. Compared only with the athlete's own values — no norms, no
 * diagnosis. Needs the health-data consent; the caller passes nothing without it.
 */
export type WellbeingKey = "sleep" | "energy" | "fatigue" | "soreness";
export interface WellbeingTrend {
  key: WellbeingKey;
  label: string;
  current: number | null;
  previous: number | null;
  entries: number;
  /** Relative to the athlete's own previous period; null with too few check-ins. */
  direction: "better" | "worse" | "stable" | null;
}
export interface WellbeingReport {
  days: number;
  trends: WellbeingTrend[];
  /** Days with reported pain in the period (an active limitation, not an injury history). */
  painDays: number;
  entries: number;
  enough: boolean;
}

const META: Record<WellbeingKey, { label: string; higherIsBetter: boolean }> = {
  sleep: { label: "Sen", higherIsBetter: true },
  energy: { label: "Energia", higherIsBetter: true },
  fatigue: { label: "Zmęczenie", higherIsBetter: false },
  soreness: { label: "Bolesność mięśni", higherIsBetter: false },
};
const MIN_ENTRIES = 3;
/** A change below one point on a 1–10 scale is treated as normal day-to-day variation. */
const STABLE_BAND = 1;

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mean = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

export function wellbeingTrends(
  readiness: Record<string, Readiness> | undefined,
  todayIso: string,
  days = 7,
): WellbeingReport {
  const rows = Object.values(readiness ?? {}).filter(
    (r) => r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date),
  );
  const from = shift(todayIso, -(days - 1));
  const prevFrom = shift(todayIso, -(2 * days - 1));
  const current = rows.filter((r) => r.date >= from && r.date <= todayIso);
  const previous = rows.filter((r) => r.date >= prevFrom && r.date < from);
  const values = (list: Readiness[], key: WellbeingKey) =>
    list.map((r) => r[key]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 10);
  const trends = (Object.keys(META) as WellbeingKey[]).map((key) => {
    const now = values(current, key);
    const before = values(previous, key);
    const c = mean(now);
    const p = mean(before);
    let direction: WellbeingTrend["direction"] = null;
    if (c !== null && p !== null && now.length >= MIN_ENTRIES && before.length >= MIN_ENTRIES) {
      const delta = (c - p) * (META[key].higherIsBetter ? 1 : -1);
      direction = Math.abs(c - p) < STABLE_BAND ? "stable" : delta > 0 ? "better" : "worse";
    }
    return { key, label: META[key].label, current: c, previous: p, entries: now.length, direction };
  });
  return {
    days,
    trends,
    painDays: current.filter((r) => (r.jointPain ?? 0) > 0 || Boolean(r.painLocation)).length,
    entries: current.length,
    enough: current.length >= MIN_ENTRIES,
  };
}
