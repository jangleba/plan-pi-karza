import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { formatDateFull, professionalSessionTitle } from "@/lib/loadwise/labels";
import { statusBadgeLabel } from "@/lib/loadwise/sessionPresentation";
import { IntensityBadge } from "../ui";
import { Button } from "@/components/ui/button";

export function SessionScreenShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <section className="app-shell bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Button variant="ghost" onClick={onBack} className="mb-6">
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </Button>
      <div className="bw-stack">{children}</div>
    </section>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function SessionSkeleton() {
  return (
    <div className="bw-stack" aria-busy="true" aria-label="Wczytywanie sesji">
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar className="h-8 w-56" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3 py-5">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function DecisionLogic({ session }: { session: SessionDay }) {
  const rows = [
    { label: "Cel", value: session.goalOfSession },
    { label: "Dlaczego dziś", value: session.whyToday },
    { label: "Zarządzane ryzyko", value: session.riskManaged },
    { label: "Czego unikać", value: session.avoidToday },
  ].filter((row) => row.value);
  if (!rows.length) return null;
  return (
    <details className="bw-disclosure">
      <summary>Dlaczego ten trening?</summary>
      <dl className="mt-4 grid gap-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-sm font-semibold">{row.label}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function SessionHeader({
  session,
  isToday,
  onBack,
}: {
  session: SessionDay;
  strengthRunner: boolean;
  isToday: boolean;
  onBack: () => void;
}) {
  const status = statusBadgeLabel(session);
  return (
    <header>
      <Button variant="ghost" onClick={onBack} className="mb-6">
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </Button>
      <h1 className="bw-page-title">{professionalSessionTitle(session.title)}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span>{formatDateFull(session.date)}</span>
        {session.durationMin > 0 && <span>{session.durationMin} min</span>}
        {session.mdLabel && <span>{session.mdLabel}</span>}
        {isToday && <span className="font-medium text-primary">Dziś</span>}
        {session.slotLabel && <span>{session.slotLabel}</span>}
      </div>
      {status && (
        <div className="mt-3">
          <IntensityBadge intensity={session.intensity} label={status} />
        </div>
      )}
      {session.safetyNote && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{session.safetyNote}</p>
      )}
    </header>
  );
}

export function SessionSlotSwitcher({
  primary,
  slot,
  onSelect,
}: {
  primary: SessionDay;
  slot: number;
  onSelect: (slot: 1 | 2) => void;
}) {
  if (!primary.secondSession) return null;
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label="Sesje dnia">
      {([primary, primary.secondSession] as const).map((session, index) => {
        const sessionSlot = index === 0 ? 1 : 2;
        return (
          <Button
            key={sessionSlot}
            variant={slot === sessionSlot ? "default" : "ghost"}
            aria-pressed={slot === sessionSlot}
            onClick={() => onSelect(sessionSlot)}
            className="h-auto min-h-11 whitespace-normal text-left"
          >
            {professionalSessionTitle(session.title)}
          </Button>
        );
      })}
    </div>
  );
}
