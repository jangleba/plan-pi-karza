import type { LabMetrics } from "@/lib/lab/types";

export function displayLabValue(value: number, unit: "cm" | "s") {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", {
    minimumFractionDigits: unit === "cm" ? 1 : 3,
    maximumFractionDigits: unit === "cm" ? 1 : 3,
  })} ${unit}`;
}

export function LabMeasurementDetails({ metrics }: { metrics: LabMetrics }) {
  return (
    <div className="mt-2 space-y-1 text-xs font-normal text-muted-foreground tabular-nums">
      {metrics.flightTimeSeconds !== undefined && (
        <p>Czas lotu: {displayLabValue(metrics.flightTimeSeconds, "s")}</p>
      )}
      {metrics.distanceMeters !== undefined && <p>Odcinek: {metrics.distanceMeters} m</p>}
      {metrics.averageSpeedMps !== undefined && metrics.speedKmh !== undefined && (
        <p>
          Średnia prędkość na odcinku: {metrics.averageSpeedMps.toFixed(2)} m/s ·{" "}
          {metrics.speedKmh.toFixed(1)} km/h
        </p>
      )}
    </div>
  );
}
