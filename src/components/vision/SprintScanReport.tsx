import { Timer, Waypoints, Activity, Crosshair, ArrowRight, Camera } from "lucide-react";
import type {
  SprintPerformanceScan,
  MechanicMetric,
} from "@/features/vision-analysis/sprint/types";

/**
 * Sekcje raportu „Analiza sprintu”. Renderujemy wyłącznie te bloki, dla
 * których silnik dostarczył realne dane — brak danych oznacza brak sekcji
 * albo uczciwy komunikat, nigdy wypełniacz.
 */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Timer;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="soft-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ m }: { m: MechanicMetric }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{m.label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">
        {m.value}
        {m.unit}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {m.rangeMin}–{m.rangeMax}
          {m.unit}
        </span>
      </span>
    </div>
  );
}

export function SprintScanReport({ scan }: { scan: SprintPerformanceScan }) {
  const hasSplits = scan.splits.length > 0;
  const hasPhases = scan.phases.length > 0;
  const hasMechanics = scan.mechanics.availability === "AVAILABLE" && scan.mechanics.metrics.length > 0;

  return (
    <div className="space-y-3">
      {hasSplits && (
        <Section icon={Timer} title="Splity i profil przyspieszenia">
          <div className="space-y-1">
            {scan.splits.map((s) => (
              <div
                key={`${s.role}-${s.distanceM}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0"
              >
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {s.cumulativeTimeS.toFixed(2)} s
                  {s.segmentSpeedMs != null && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {s.segmentSpeedMs} m/s
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {scan.velocityProfile && (
            <p className="mt-3 text-xs text-muted-foreground">
              Szczyt prędkości: {scan.velocityProfile.peakSegmentSpeedMs} m/s (
              {scan.velocityProfile.peakSegmentLabel})
              {scan.velocityProfile.peakAtLastSegment ? " — bieg nadal przyspieszał." : "."}
            </p>
          )}
        </Section>
      )}

      {hasPhases && (
        <Section icon={Waypoints} title="Co dzieje się w Twoim biegu">
          <ol className="space-y-2">
            {scan.phases.map((p) => (
              <li key={`${p.id}-${p.frameStart}`} className="flex items-baseline gap-3">
                <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary" />
                <span className="text-sm text-foreground">{p.label}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {p.startTimeS.toFixed(2)}–{p.endTimeS.toFixed(2)} s
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {hasMechanics && (
        <Section icon={Activity} title="Mechanika biegu">
          <div>
            {scan.mechanics.metrics.map((m) => (
              <MetricRow key={m.key} m={m} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Wartości to zakresy obserwacji z {scan.mechanics.framesUsed} klatek, nie pojedynczy pomiar.
          </p>
        </Section>
      )}

      <Section icon={Crosshair} title="Główny limiter">
        {scan.limiter ? (
          <div>
            <div className="text-sm font-semibold text-foreground">{scan.limiter.label}</div>
            <p className="mt-1 text-xs text-muted-foreground">{scan.limiter.summary}</p>
            <ul className="mt-3 space-y-1">
              {scan.limiter.evidence.slice(0, 3).map((e) => (
                <li key={e.metricKey} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{e.label}</span>
                  <span className="text-xs tabular-nums text-foreground">
                    {e.value}
                    {e.unit}
                    {e.frameIndex != null && (
                      <span className="ml-2 text-muted-foreground">klatka {e.frameIndex}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{scan.limiterReason}</p>
        )}
      </Section>

      {scan.recommendation && (
        <Section icon={ArrowRight} title="Następne działanie">
          <p className="text-sm text-foreground">{scan.recommendation.cue}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scan.recommendation.exerciseIds.map((id) => (
              <span
                key={id}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {id}
              </span>
            ))}
          </div>
        </Section>
      )}

      {scan.needsCloseUpForMechanics && (
        <Section icon={Camera} title="Dograj ujęcie mechaniki">
          <p className="text-xs text-muted-foreground">
            Czas jest poprawny, ale sylwetka w kadrze jest za mała do analizy techniki. Nagraj krótkie,
            bliższe ujęcie tego samego biegu, aby dodać mechanikę do tej próby.
          </p>
        </Section>
      )}
    </div>
  );
}
