import { Clock3, Gauge, Route } from "lucide-react";
import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";

type ActivityLike = RunningActivity | RunningActivityDraft;

export function RunActivitySummary({
  activity,
}: {
  activity: ActivityLike;
  /** Zachowane dla zgodności starszych wywołań; podsumowanie zawsze ma ten sam zakres. */
  compact?: boolean;
  /** Splity nigdy nie są już wyświetlane ani zapisywane zdalnie. */
  showSplits?: boolean;
}) {
  const stats = [
    { label: "Dystans", value: formatDistance(activity.distanceM), icon: Route },
    { label: "Czas", value: formatRunDuration(activity.durationSec), icon: Clock3 },
    { label: "Śr. tempo", value: formatPace(activity.avgPaceSecPerKm), icon: Gauge },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl bg-muted/60 p-3">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          <div className="mt-2 truncate text-sm font-semibold tabular-nums">{value}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}
