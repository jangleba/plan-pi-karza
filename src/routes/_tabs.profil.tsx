import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import {
  COMPETITION_LEVEL_LABELS,
  GOAL_LABELS,
  ISO_DAY_LABELS,
  LEVEL_LABELS,
  POSITION_LABELS,
  SECONDARY_LIMITER_LABELS,
  SEASON_PHASE_LABELS,
  formatDate,
} from "@/lib/loadwise/labels";
import {
  CURRENT_PITCH_FEELING_LABELS,
  DESIRED_PITCH_FEELING_LABELS,
  normalizeCurrentPitchFeelings,
  normalizeDesiredPitchFeelings,
} from "@/lib/loadwise/playerDirection";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Compass,
  Dumbbell,
  FileDown,
  FileText,
  LogOut,
  Pencil,
  ShieldCheck,
  User,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/profil")({
  component: ProfileScreen,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[58%] text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function daysLabel(days: number[]): string {
  if (days.length === 0) return "Brak";
  return days
    .map((day) => ISO_DAY_LABELS.find((item) => item.value === day)?.short)
    .filter(Boolean)
    .join(", ");
}

function ProfileScreen() {
  const { state } = useLoadwise();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const profile = state.profile;

  if (!profile) return null;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }


  const isMinor = profile.age >= 13 && profile.age <= 17;
  const currentFeelings = normalizeCurrentPitchFeelings(profile.currentPitchFeelings);
  const desiredFeelings = normalizeDesiredPitchFeelings(profile.desiredPitchFeelings);
  const usualMatchDay =
    profile.usualMatchDay === "no_fixed_day"
      ? "Brak stałego dnia"
      : typeof profile.usualMatchDay === "number"
        ? ISO_DAY_LABELS.find((item) => item.value === profile.usualMatchDay)?.label ?? "Brak"
        : "Brak";
  const facilities = [
    { label: "Siłownia", available: profile.hasGym },
    { label: "Boisko", available: profile.hasPitch },
    { label: "Miejsce do sprintu", available: profile.hasSprintSpace },
  ];

  return (
    <div>
      <AppHeader title="Profil" subtitle="Dane, które sterują Twoim planem." />

      <div className="space-y-3 px-5">
        <section className="soft-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{profile.name}</div>
              <div className="truncate text-sm text-muted-foreground">
                {profile.age} lat · {POSITION_LABELS[profile.position]}
              </div>
              {user?.email && (
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              )}
            </div>
          </div>
        </section>

        <section className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <User className="h-3.5 w-3.5" aria-hidden="true" /> Profil sportowy
          </div>
          <div className="mt-1 divide-y divide-border">
            <Row label="Pozycja" value={POSITION_LABELS[profile.position]} />
            <Row label="Poziom" value={LEVEL_LABELS[profile.level]} />
            <Row label="Cel główny" value={GOAL_LABELS[profile.goal]} />
            <Row
              label="Ogranicznik"
              value={
                profile.secondaryLimiter
                  ? SECONDARY_LIMITER_LABELS[profile.secondaryLimiter]
                  : "Nie wskazano"
              }
            />
            <Row label="Okres sezonu" value={SEASON_PHASE_LABELS[profile.seasonPhase]} />
            <Row
              label="Poziom rozgrywkowy"
              value={COMPETITION_LEVEL_LABELS[profile.competitionLevel]}
            />
          </div>
        </section>

        <section className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Tydzień
          </div>
          <div className="mt-1 divide-y divide-border">
            <Row label="Treningi klubowe" value={daysLabel(profile.clubTrainingDays)} />
            <Row label="Stały dzień meczu" value={usualMatchDay} />
            <Row
              label="Najbliższy mecz"
              value={profile.matchDate ? formatDate(profile.matchDate) : "Brak daty"}
            />
            <Row
              label="Dni niedostępne"
              value={daysLabel(profile.unavailableDays ?? [])}
            />
          </div>
        </section>

        <section className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" /> Twój kierunek
          </div>
          <div className="mt-3 space-y-3">
            <DirectionTags
              label="Teraz"
              values={currentFeelings.map((id) => CURRENT_PITCH_FEELING_LABELS[id])}
              tone="secondary"
            />
            <DirectionTags
              label="Buduję"
              values={desiredFeelings.map((id) => DESIRED_PITCH_FEELING_LABELS[id])}
              tone="primary"
            />
          </div>
        </section>

        <section className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" /> Warunki treningowe
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {facilities.map((item) => (
              <span
                key={item.label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  item.available
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {item.available ? "✓ " : "— "}
                {item.label}
              </span>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sprzęt
            </div>
            {profile.equipment.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.equipment.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Nie wybrano sprzętu.</p>
            )}
          </div>
        </section>

        <section className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Bezpieczeństwo
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {profile.painInjury ? (
                <CircleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
              ) : (
                <CircleCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              {profile.painInjury
                ? "Zgłoszony ból lub uraz — plan ograniczony"
                : "Brak zgłoszonego bólu lub urazu"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {isMinor && !profile.guardianConsent ? (
                <CircleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
              ) : (
                <CircleCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              {isMinor
                ? profile.guardianConsent
                  ? "Zgoda rodzica lub opiekuna potwierdzona"
                  : "Brak zgody rodzica lub opiekuna"
                : "Pełnoletni — zgoda opiekuna niewymagana"}
            </div>
          </div>
        </section>

        <Button
          className="w-full gap-2"
          onClick={() => navigate({ to: "/onboarding", search: { edit: true } })}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" /> Edytuj profil i plan
        </Button>

        <div className="soft-card divide-y divide-border p-0">
          <SettingsLink
            icon={FileDown}
            label="Moje dane i prawa (RODO)"
            onClick={() => navigate({ to: "/data-rights" })}
          />
          <SettingsLink
            icon={FileText}
            label="Polityka prywatności"
            onClick={() => navigate({ to: "/privacy-policy" })}
          />
          <SettingsLink
            icon={FileText}
            label="Regulamin"
            onClick={() => navigate({ to: "/terms" })}
          />
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Wyloguj się
        </Button>
      </div>

      <Disclaimer />
    </div>
  );
}

function DirectionTags({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: "primary" | "secondary";
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tone === "primary"
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Nie ustawiono</span>
        )}
      </div>
    </div>
  );
}

function SettingsLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 p-4 text-left"
    >
      <Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
