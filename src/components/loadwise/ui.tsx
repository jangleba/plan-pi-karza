import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Intensity, DayType } from "@/lib/loadwise/types";
import { User } from "lucide-react";
import { useLoadwise } from "@/lib/loadwise/store";

/** Avatar w prawym górnym rogu — wejście do profilu, konta i ustawień. */
export function ProfileAvatar() {
  const { state } = useLoadwise();
  const initials = (state.profile?.name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  return (
    <Link
      to="/profil"
      preload="intent"
      aria-label="Profil, konto i ustawienia"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/75 bg-card text-sm font-semibold text-foreground"
    >
      {initials || <User className="h-4 w-4" />}
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
    <header className="bw-page-header">
        <div className="min-w-0">
          <h1 className="bw-page-title text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="bw-page-subtitle">
              {subtitle}
            </p>
          )}
        </div>
      <div className="flex shrink-0 items-center gap-2">{right}{brand && <ProfileAvatar />}</div>
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
      className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${classes}`}
    >
      {label ?? intensity}
    </span>
  );
}

const dayTypeLabels: Record<DayType, string> = {
  match: "Mecz",
  "md-1": "Aktywacja przedmeczowa",
  club: "Trening klubowy",
  training: "Jednostka treningowa",
  recovery: "Regeneracja",
  rest: "Dzień wolny",
};

export function DayTypeTag({ type }: { type: DayType }) {
  return (
    <span className="inline-flex items-center rounded bg-card/70 px-2 py-1 text-sm font-medium text-muted-foreground">
      {dayTypeLabels[type]}
    </span>
  );
}

export function Disclaimer() {
  return (
    <div className="bw-page-content mt-8 pb-6">
      <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        BallWise pomaga podejmować mądrzejsze decyzje treningowe w piłce nożnej. Nie diagnozuje, nie
        leczy, nie prowadzi rehabilitacji ani nie wyznacza powrotu do gry. Te decyzje należą do
        lekarza lub fizjoterapeuty.
      </p>
    </div>
  );
}
