import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { formatDateFull, professionalSessionTitle } from "@/lib/loadwise/labels";
import { statusBadgeLabel } from "@/lib/loadwise/sessionPresentation";
import { IntensityBadge } from "../ui";
import { sessionHeading, slotLabels } from "@/lib/loadwise/sessionRunner/heading";
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
  /** Without it (inside the session panel) the panel's own close button leaves. */
  onBack?: () => void;
  children: ReactNode;
}) {
  if (!onBack) return <div className="bw-unit-view space-y-3 px-5 pt-2 pb-8">{children}</div>;
  return (
    <div className="app-shell premium-flow min-h-screen pb-[140px]">
      <div className="px-5 pt-6">
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground active:opacity-60"
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
  isToday,
  preview,
  onBack,
}: {
  session: SessionDay;
  isToday: boolean;
  /** True while the screen only shows the plan (another day, or not started). */
  preview: boolean;
  /** Full page only; the session panel closes with its own button. */
  onBack?: () => void;
}) {
  const heading = sessionHeading(session);
  const status = statusBadgeLabel(session);
  return (
    <header className="bw-session-head">
      {onBack && (
        <button type="button" onClick={onBack} className="bw-session-back">
          <ChevronLeft aria-hidden="true" /> Wstecz
        </button>
      )}
      <p className="bw-session-date">
        <span data-today={isToday || undefined}>
          {isToday ? "Dziś" : formatDateFull(session.date)}
        </span>
        {isToday && <span>{formatDateFull(session.date)}</span>}
        {session.mdLabel && <span>{session.mdLabel}</span>}
        {preview && !isToday && <span className="bw-session-mode">Podgląd</span>}
      </p>
      <h1>{heading.title}</h1>
      {heading.meta.length > 0 && (
        <p className="bw-session-meta-line">{heading.meta.join(" · ")}</p>
      )}
      {status && (
        <div className="mt-2">
          <IntensityBadge intensity={session.intensity} label={status} />
        </div>
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
  const labels = slotLabels(primary, primary.secondSession);
  return (
    <div className="bw-session-slots" role="group" aria-label="Sesje tego dnia">
      {([primary, primary.secondSession] as const).map((session, index) => {
        const sessionSlot = index === 0 ? 1 : 2;
        return (
          <button
            key={sessionSlot}
            type="button"
            aria-pressed={slot === sessionSlot}
            title={professionalSessionTitle(session.title)}
            onClick={() => onSelect(sessionSlot)}
          >
            {labels[index]}
          </button>
        );
      })}
    </div>
  );
}
