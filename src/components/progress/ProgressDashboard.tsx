import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { CycleBar } from "@/components/progress/CycleBar";
import { MetricTrend } from "@/components/progress/MetricTrend";
import { LoadCard } from "@/components/progress/LoadCard";
import { EvidenceRail } from "@/components/progress/EvidenceRail";
import { DevelopmentMap } from "@/components/progress/DevelopmentMap";
import type { MetricSeries } from "@/lib/progress/progress";
import type { DirectionCard } from "@/lib/progress/center";
import type {
  AreaNode,
  CycleBar as CycleBarData,
  EvidenceCard,
  LoadReport,
} from "@/lib/progress/dashboard";

/** Pulpit rozwoju: kierunek, dowody, obciążenie, zmiana w czasie, mapa. */
export function ProgressDashboard({
  cycle,
  direction,
  evidence,
  load,
  series,
  areas,
  onNavigateTests,
}: {
  cycle: CycleBarData;
  direction: DirectionCard;
  evidence: EvidenceCard[];
  load: LoadReport;
  series: MetricSeries[];
  areas: AreaNode[];
  onNavigateTests: () => void;
}) {
  return (
    <div className="space-y-5 animate-fade-in">
      <CycleBar cycle={cycle} />

      <section className="soft-card p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Twój kierunek
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-snug">{direction.stage}</div>
        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <Row label="Wykryta zmiana" value={direction.detectedChange} />
          <Row label="Ogranicznik" value={direction.limiter} />
          <Row label="Następny krok" value={direction.nextStep} />
        </dl>
        {direction.cta.to === "session" && direction.cta.date ? (
          <Link
            to="/sesja/$date"
            params={{ date: direction.cta.date }}
            search={{ slot: 1 }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" /> {direction.cta.label}
          </Link>
        ) : (
          <Link
            to="/vision-lab"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" /> {direction.cta.label}
          </Link>
        )}
      </section>

      <EvidenceRail cards={evidence} onNavigateTests={onNavigateTests} />
      <LoadCard report={load} />
      <MetricTrend series={series} />
      <DevelopmentMap nodes={areas} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}
