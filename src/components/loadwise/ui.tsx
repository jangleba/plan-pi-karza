import type { ReactNode } from "react";
import type { Intensity, DayType } from "@/lib/loadwise/types";
import { ShieldAlert } from "lucide-react";

export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="px-5 pb-3 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

const intensityStyles: Record<Intensity, string> = {
  niska: "bg-secondary text-secondary-foreground",
  umiarkowana: "bg-accent text-accent-foreground",
  wysoka: "bg-destructive/10 text-destructive",
};

export function IntensityBadge({ intensity }: { intensity: Intensity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${intensityStyles[intensity]}`}
    >
      {intensity}
    </span>
  );
}

const dayTypeLabels: Record<DayType, string> = {
  match: "Mecz",
  "md-1": "Przedmeczowy",
  club: "Klub",
  training: "Trening",
  recovery: "Regeneracja",
  rest: "Wolne",
};

export function DayTypeTag({ type }: { type: DayType }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {dayTypeLabels[type]}
    </span>
  );
}

export function Disclaimer() {
  return (
    <div className="mx-5 mb-28 mt-4 flex gap-2.5 rounded-2xl bg-muted/60 p-3.5">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Loadwise pomaga podejmować mądrzejsze decyzje treningowe w piłce nożnej.
        Nie diagnozuje, nie leczy i nie zastępuje konsultacji medycznej.
      </p>
    </div>
  );
}
