import type { Profile, SessionDay } from "@/lib/loadwise/types";
import { GOAL_LABELS, SECONDARY_LIMITER_LABELS } from "@/lib/loadwise/labels";
import {
  TRAINING_CATEGORY_LABELS,
  type CompletedSessionEntry,
  type TrainingCategoryKey,
} from "@/lib/progress/progress";
import type { MicrocycleReport } from "@/lib/progress/center";

export interface CycleBar {
  goalLabel: string;
  focusLabel: string;
  weekIndex: number;
  weekCount: number;
  progressPct: number;
  hasPlan: boolean;
}

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const dayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOffset);
  return date.toISOString().slice(0, 10);
}

function weeksBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / (7 * 86400000),
  );
}

export function buildCycleBar(
  profile: Profile | null,
  plan: SessionDay[],
  todayIso: string,
): CycleBar {
  const dates = plan.map((day) => day.date).sort();
  const goalLabel = profile?.goal ? GOAL_LABELS[profile.goal] : "Cel nieustawiony";
  const focusLabel = profile?.secondaryLimiter
    ? SECONDARY_LIMITER_LABELS[profile.secondaryLimiter]
    : goalLabel;

  if (dates.length === 0) {
    return {
      goalLabel,
      focusLabel,
      weekIndex: 0,
      weekCount: 0,
      progressPct: 0,
      hasPlan: false,
    };
  }

  const firstMonday = mondayOf(dates[0]!);
  const lastMonday = mondayOf(dates[dates.length - 1]!);
  const weekCount = Math.max(1, weeksBetween(firstMonday, lastMonday) + 1);
  const rawIndex = weeksBetween(firstMonday, mondayOf(todayIso)) + 1;
  const weekIndex = Math.min(weekCount, Math.max(1, rawIndex));
  const total =
    Date.parse(`${dates[dates.length - 1]!}T00:00:00Z`) - Date.parse(`${dates[0]!}T00:00:00Z`);
  const elapsed = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dates[0]!}T00:00:00Z`);
  const progressPct =
    total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;

  return { goalLabel, focusLabel, weekIndex, weekCount, progressPct, hasPlan: true };
}

export interface LoadDay {
  date: string;
  weekdayLabel: string;
  load: number;
  byCategory: Partial<Record<TrainingCategoryKey, number>>;
}

export interface LoadReport {
  days: LoadDay[];
  total: number;
  previousTotal: number;
  maxDayLoad: number;
  byCategory: Record<TrainingCategoryKey, number>;
  insight: string | null;
  hasData: boolean;
}

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

function isoMinus(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildLoadReport(history: CompletedSessionEntry[], todayIso: string): LoadReport {
  const dates = Array.from({ length: 7 }, (_, index) => isoMinus(todayIso, 6 - index));
  const byCategory: Record<TrainingCategoryKey, number> = {
    gym: 0,
    speed: 0,
    endurance: 0,
    ball: 0,
    club: 0,
    match: 0,
    recovery: 0,
  };
  const loadOf = (item: CompletedSessionEntry) =>
    item.rpe != null && item.durationMin > 0 ? item.durationMin * item.rpe : 0;

  const days: LoadDay[] = dates.map((date) => {
    const categoryLoad: Partial<Record<TrainingCategoryKey, number>> = {};
    let load = 0;
    for (const item of history.filter((entry) => entry.date === date)) {
      const value = loadOf(item);
      if (value <= 0) continue;
      load += value;
      categoryLoad[item.category] = (categoryLoad[item.category] ?? 0) + value;
      byCategory[item.category] += value;
    }
    return {
      date,
      weekdayLabel: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      load,
      byCategory: categoryLoad,
    };
  });

  const total = days.reduce((sum, day) => sum + day.load, 0);
  const previousFrom = isoMinus(todayIso, 13);
  const previousTo = isoMinus(todayIso, 7);
  const previousTotal = history
    .filter((item) => item.date >= previousFrom && item.date <= previousTo)
    .reduce((sum, item) => sum + loadOf(item), 0);
  const ranked = (Object.keys(byCategory) as TrainingCategoryKey[])
    .filter((key) => byCategory[key] > 0)
    .sort((a, b) => byCategory[b] - byCategory[a]);

  let insight: string | null = null;
  if (total > 0 && previousTotal > 0 && total > previousTotal * 1.3) {
    insight = "Obciążenie wzrosło wyraźnie względem poprzedniego tygodnia.";
  } else if (total > 0 && previousTotal > 0 && total < previousTotal * 0.7) {
    insight = "Obciążenie spadło względem poprzedniego tygodnia.";
  } else if (ranked[0]) {
    insight = `Najwięcej obciążenia dał obszar: ${TRAINING_CATEGORY_LABELS[
      ranked[0]
    ].toLowerCase()}.`;
  }

  return {
    days,
    total,
    previousTotal,
    maxDayLoad: Math.max(1, ...days.map((day) => day.load)),
    byCategory,
    insight,
    hasData: total > 0,
  };
}

export type EvidenceKind = "training" | "regularity" | "match";

export interface EvidenceCard {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  value?: number;
  suffix?: string;
}

export function buildEvidence(
  micro: MicrocycleReport,
  history: CompletedSessionEntry[],
  todayIso: string,
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  const weekAgo = isoMinus(todayIso, 6);
  const recent = history.filter((item) => item.date >= weekAgo && item.date <= todayIso);

  if (recent.length > 0) {
    cards.push({
      id: "trainings-week",
      kind: "training",
      title: "Wykonana praca",
      detail: `${recent.reduce((sum, item) => sum + item.durationMin, 0)} min w ostatnich 7 dniach`,
      value: recent.length,
      suffix: recent.length === 1 ? "jednostka" : "jednostki",
    });
  }

  if (micro.executionPct != null && micro.plannedCount > 0) {
    cards.push({
      id: "regularity",
      kind: "regularity",
      title: "Realizacja planu",
      detail: `${micro.completedCount}/${micro.plannedCount} jednostek`,
      value: micro.executionPct,
      suffix: "%",
    });
  }

  const matches = recent.filter((item) => item.category === "match");
  if (matches.length > 0) {
    cards.push({
      id: "matches-week",
      kind: "match",
      title: "Zapisane mecze",
      detail: "Ostatnie 7 dni",
      value: matches.length,
    });
  }

  return cards;
}

export type TimelineKind = "training" | "match";

export const TIMELINE_LABELS: Record<TimelineKind, string> = {
  training: "Trening",
  match: "Mecz",
};

export interface TimelineEvent {
  id: string;
  sessionKey: string;
  date: string;
  kind: TimelineKind;
  title: string;
  detail: string;
}

export function buildTimeline(history: CompletedSessionEntry[]): TimelineEvent[] {
  return history
    .map((item) => ({
      id: `training:${item.key}`,
      sessionKey: item.key,
      date: item.date,
      kind: item.category === "match" ? ("match" as const) : ("training" as const),
      title: item.title,
      detail: [
        TRAINING_CATEGORY_LABELS[item.category],
        item.durationMin ? `${item.durationMin} min` : null,
        item.rpe != null ? `RPE ${item.rpe}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface TimelineWeek {
  weekStart: string;
  events: TimelineEvent[];
}

export function groupByWeek(events: TimelineEvent[]): TimelineWeek[] {
  const grouped = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const week = mondayOf(event.date);
    grouped.set(week, [...(grouped.get(week) ?? []), event]);
  }
  return Array.from(grouped.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, weekEvents]) => ({ weekStart, events: weekEvents }));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
