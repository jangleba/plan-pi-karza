import type { ReactNode } from "react";
import { ChevronLeft, Clock, Flag, Target } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { formatDateFull, professionalSessionTitle } from "@/lib/loadwise/labels";
import { statusBadgeLabel } from "@/lib/loadwise/sessionPresentation";
import { IntensityBadge, DayTypeTag } from "../ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function SessionScreenShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell premium-flow min-h-screen pb-[140px]">
      <div className="px-5 pt-6">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground active:opacity-60"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>
      </div>
      <div className="space-y-3 px-5">{children}</div>
    </div>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function SessionSkeleton() {
  return (
    <>
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar className="h-8 w-56" />
      <div className="flex gap-2">
        <SkeletonBar className="h-6 w-20" />
        <SkeletonBar className="h-6 w-20" />
        <SkeletonBar className="h-6 w-24" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="soft-card space-y-3 p-4">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-5/6" />
          <SkeletonBar className="h-4 w-2/3" />
        </div>
      ))}
    </>
  );
}

// Logika decyzji — schowana w accordionie, domyślnie zamknięta.
export function DecisionLogic({ session }: { session: SessionDay }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Cel sesji", value: session.goalOfSession },
    { label: "Dlaczego dziś", value: session.whyToday },
    { label: "Zarządzane ryzyko", value: session.riskManaged },
    { label: "Czego unikać", value: session.avoidToday },
    { label: "Bezpieczeństwo", value: session.safetyNote },
  ].filter((r) => r.value);

  if (!rows.length) return null;

  return (
    <Accordion type="single" collapsible className="soft-card px-4">
      <AccordionItem value="logic" className="border-0">
        <AccordionTrigger className="py-3 text-sm font-medium text-muted-foreground hover:no-underline">
          Logika decyzji
        </AccordionTrigger>
        <AccordionContent className="space-y-2 pb-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="text-xs font-semibold text-foreground">{r.label}</div>
              <p className="text-xs text-muted-foreground">{r.value}</p>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function SessionHeader({
  session,
  strengthRunner,
  isToday,
  onBack,
}: {
  session: SessionDay;
  strengthRunner: boolean;
  isToday: boolean;
  onBack: () => void;
}) {
  return (
    <div className="px-5 pt-6">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground active:opacity-60"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>

      {strengthRunner ? (
        <>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-foreground">
            {professionalSessionTitle(session.title)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span>{formatDateFull(session.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{session.durationMin} min</span>
            {session.mdLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span>{session.mdLabel}</span>
              </>
            )}
          </div>
          {statusBadgeLabel(session) && (
            <div className="mt-3">
              <IntensityBadge intensity={session.intensity} label={statusBadgeLabel(session)} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {formatDateFull(session.date)}
            {session.mdLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium">
                <Flag className="h-3 w-3" /> {session.mdLabel}
              </span>
            )}
            {isToday && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Dziś
              </span>
            )}
          </div>

          {session.slotLabel && (
            <div className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {session.slotLabel}
            </div>
          )}

          <h1 className="mt-1.5 text-[24px] font-medium leading-tight tracking-[-0.03em]">
            {professionalSessionTitle(session.title)}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DayTypeTag type={session.dayType} />
            <IntensityBadge intensity={session.intensity} label={statusBadgeLabel(session)} />
            <span className="inline-flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> {session.sessionType}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {session.durationMin} min
            </span>
          </div>
        </>
      )}
    </div>
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
    <div className="sticky top-2 z-10 flex gap-1 rounded-full border border-border bg-background/90 p-1 backdrop-blur">
      {([primary, primary.secondSession] as const).map((session, index) => {
        const sessionSlot = index === 0 ? 1 : 2;
        return (
          <button
            key={sessionSlot}
            onClick={() => onSelect(sessionSlot)}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-1.5 text-center text-xs font-semibold leading-tight ${
              slot === sessionSlot ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {professionalSessionTitle(session.title)}
          </button>
        );
      })}
    </div>
  );
}
