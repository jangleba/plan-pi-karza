import { Clock3, Gauge, Route } from "lucide-react";
import { formatDistance, formatPace, formatRunDuration } from "@/lib/running/metrics";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { RunRouteMap } from "./RunRouteMap";
import "./run-route.css";

type ActivityLike = RunningActivity | RunningActivityDraft;

export function RunActivitySummary({
  activity,
  showSplits = false,
}: {
  activity: ActivityLike;
  /** Zachowane dla zgodności starszych wywołań; podsumowanie zawsze ma ten sam zakres. */
  compact?: boolean;
  /** Pokaż zapisane odcinki receptury. Mapa i międzyczasy tylko z prawdziwej trasy. */
  showSplits?: boolean;
}) {
  const stats = [
    { label: "Dystans", value: formatDistance(activity.distanceM), icon: Route },
    { label: "Czas", value: formatRunDuration(activity.durationSec), icon: Clock3 },
    { label: "Śr. tempo", value: formatPace(activity.avgPaceSecPerKm), icon: Gauge },
  ];

  const route = activity.route ?? [];
  const splits = activity.splits ?? [];
  return (
    <div className="space-y-3">
      {route.length > 1 && <RunRouteMap route={route} />}
      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-muted/60 p-3">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div className="mt-2 truncate text-sm font-semibold tabular-nums">{value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      {activity.avgPaceSecPerKm != null && activity.avgPaceSecPerKm > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Średnia prędkość:{" "}
          {(3600 / activity.avgPaceSecPerKm).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}{" "}
          km/h
        </p>
      )}
      {splits.length > 0 && (
        <div className="bw-run-splits">
          <div className="bw-run-splits-head">
            <span>km</span>
            <span>Tempo</span>
            <span>Czas</span>
          </div>
          <ol>
            {splits.map((split) => (
              <li key={split.kilometer}>
                <span>
                  {split.isPartial
                    ? (split.distanceM / 1000).toLocaleString("pl-PL", {
                        maximumFractionDigits: 2,
                      })
                    : split.kilometer}
                </span>
                <span>{formatPace(split.paceSecPerKm)}</span>
                <span>{formatRunDuration(split.durationSec)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {showSplits && activity.intervalResults?.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-10 cursor-pointer text-xs font-medium">
            Odcinki i przerwy · {activity.intervalResults.length}
          </summary>
          <ol className="space-y-2 text-xs text-muted-foreground">
            {activity.intervalResults.map((r, i) => (
              <li key={i}>
                {r.kind === "work" ? `Odcinek ${r.repeatIndex}` : "Przerwa"} ·{" "}
                {formatRunDuration(r.durationSec)} · {formatDistance(r.distanceM)}
                {r.paceSecPerKm == null ? "" : ` · ${formatPace(r.paceSecPerKm)}`}
                {r.completed ? "" : " · częściowo"}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
