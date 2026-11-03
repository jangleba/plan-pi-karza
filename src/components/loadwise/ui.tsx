import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import type { Intensity, DayType } from "@/lib/loadwise/types";
import { ShieldAlert, User } from "lucide-react";
import { useLoadwise } from "@/lib/loadwise/store";
import { PageHeader } from "./PageHeader";
import type { SketchKind } from "@/components/design/SurfaceSketch";

/** Avatar w prawym górnym rogu — wejście do profilu, konta i ustawień. */
export function ProfileAvatar() {
  const router = useRouter();
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
      onPointerDown={() => {
        void router.preloadRoute({ to: "/profil" }).catch(() => undefined);
      }}
      aria-label="Profil, konto i ustawienia"
      className="bw-avatar"
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
  sketch,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  brand?: boolean;
  sketch?: SketchKind;
}) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      sketch={sketch}
      actions={
        brand ? (
          <>
            {right}
            <ProfileAvatar />
          </>
        ) : (
          right
        )
      }
    />
  );
}

const intensityStyles: Record<Intensity, string> = {
  niska: "bw-status--neutral",
  umiarkowana: "bw-status--info",
  wysoka: "bw-status--warning",
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
      ? "bw-status--error"
      : "bw-status--info"
    : intensityStyles[intensity];

  return <span className={`bw-status ${classes}`}>{label ?? intensity}</span>;
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
    <span className="inline-flex items-center rounded-full border border-border/80 bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {dayTypeLabels[type]}
    </span>
  );
}

export function Disclaimer() {
  return (
    <div className="mx-5 mb-28 mt-4 flex gap-2.5 rounded-2xl border border-border/60 bg-muted/55 p-3.5">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        BallWise pomaga podejmować mądrzejsze decyzje treningowe w piłce nożnej. Nie diagnozuje, nie
        leczy, nie prowadzi rehabilitacji ani nie wyznacza powrotu do gry. Te decyzje należą do
        lekarza lub fizjoterapeuty.
      </p>
    </div>
  );
}
