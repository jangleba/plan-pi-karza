import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { MetricGroup } from "@/components/ui/app-ui";

export function RunActivitySummary({
  activity,
}: {
  activity: RunningActivity | RunningActivityDraft;
  compact?: boolean;
  showSplits?: boolean;
}) {
  return (
    <MetricGroup
      items={[
        { label: "Dystans", value: formatDistance(activity.distanceM) },
        { label: "Czas", value: formatRunDuration(activity.durationSec) },
        { label: "Śr. tempo", value: formatPace(activity.avgPaceSecPerKm) },
      ]}
    />
  );
}
