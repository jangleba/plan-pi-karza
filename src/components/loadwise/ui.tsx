import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Intensity, DayType } from "@/lib/loadwise/types";
import { ShieldAlert, Waves, User } from "lucide-react";
import { useLoadwise } from "@/lib/loadwise/store";

/** Avatar w prawym górnym rogu — wejście do profilu, konta i ustawień. */
export function ProfileAvatar() {
  const { state } = useLoadwise();
  const initial = state.profile?.name?.trim().slice(0, 1).toUpperCase();
  return (
    <Link
      to="/profil"
      aria-label="Profil, konto i ustawienia"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
    >
      {initial || <User className="h-4 w-4" />}
    </Link>
  );
}

export function AppHeader({
  title,
  subtitle,
  right,
  brand = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  brand?: boolean;
}) {
  return (
    <header className="px-5 pb-3 pt-5">
      {brand && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="icon-bubble h-8 w-8">
              <Waves className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">
              Loadwise
            </span>
          </div>
          <div className="flex items-center gap-2">
            {right}
            <ProfileAvatar />
          </div>
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-none tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {!brand && right}
      </div>
    </header>
  );
}

const intensityStyles: Record<Intensity, string> = {
  niska: "bg-secondary text-secondary-foreground",
  umiarkowana: "bg-accent text-accent-foreground",
  wysoka: "bg-destructive/10 text-destructive",
};

export function IntensityBadge({
  intensity,
  label,
}: {
  intensity: Intensity;
  label?: string | null;
}) {
  const isOverride = Boolean(label);
  const classes = isOverride
    ? label === "Wstrzymaj trening"
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary"
    : intensityStyles[intensity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {label ?? intensity}
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
