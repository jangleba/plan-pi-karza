import { Clock3, Gauge, Repeat2, Route } from "lucide-react";
import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { RouteMap } from "./RouteMap";

type ActivityLike = RunningActivity | RunningActivityDraft;

export function RunActivitySummary({
  activity,
  compact = false,
  showSplits = true,
}: {
  activity: ActivityLike;
  compact?: boolean;
  showSplits?: boolean;
}) {
  const stats = [
    { label: "Dystans", value: formatDistance(activity.distanceM), icon: Route },
    { label: "Czas", value: formatRunDuration(activity.durationSec), icon: Clock3 },
    { label: "Śr. tempo", value: formatPace(activity.avgPaceSecPerKm), icon: Gauge },
  ];
  return (
    <div className="space-y-3">
      <RouteMap route={activity.route} compact={compact} />
      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-muted/60 p-3">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div className="mt-2 truncate text-sm font-semibold tabular-nums">{value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      {showSplits && activity.intervalResults.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" /> Odcinki interwałowe
          </div>
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {activity.intervalResults
              .filter((result) => result.kind === "work")
              .map((result) => (
                <div
                  key={result.stepId}
                  className="flex items-center justify-between gap-3 bg-card px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      Odcinek {result.repeatIndex}/{result.repeatTotal}
                    </span>
                    {!result.completed && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        niepełny
                      </span>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {result.targetLabel} · {formatRunDuration(result.durationSec)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">
                      {result.distanceM < 1_000
                        ? `${Math.round(result.distanceM)} m`
                        : formatDistance(result.distanceM)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatPace(result.paceSecPerKm)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {showSplits && activity.splits.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Splity
          </div>
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {activity.splits.map((split) => (
              <div
                key={`${split.kilometer}-${split.distanceM}`}
                className="flex items-center justify-between bg-card px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {split.isPartial
                    ? `${Math.round(split.distanceM)} m`
                    : `${split.kilometer}. kilometr`}
                </span>
                <span className="font-semibold tabular-nums">{formatPace(split.paceSecPerKm)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
