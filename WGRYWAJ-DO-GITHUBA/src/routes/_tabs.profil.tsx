import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import {
  POSITION_LABELS,
  LEVEL_LABELS,
  GOAL_LABELS,
  DOUBLE_SESSION_LABELS,
  SEASON_PHASE_LABELS,
  COMPETITION_LEVEL_LABELS,
} from "@/lib/loadwise/labels";
import type { DoubleSessions } from "@/lib/loadwise/types";
import {
  CURRENT_PITCH_FEELING_LABELS,
  DESIRED_PITCH_FEELING_LABELS,
  normalizeCurrentPitchFeelings,
  normalizeDesiredPitchFeelings,
} from "@/lib/loadwise/playerDirection";
import { Button } from "@/components/ui/button";
import { PlayerAnalysis } from "@/components/loadwise/PlayerAnalysis";
import {
  User,
  Target,
  Dumbbell,
  ShieldCheck,
  FileDown,
  Pencil,
  CircleCheck,
  CircleAlert,
  ShieldCheck as ShieldIcon,
  FileText,
  LogOut,
  ChevronRight,
  Compass,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/profil")({
  component: ProfilScreen,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ProfilScreen() {
  const { state, updateProfile, restartOnboarding } = useLoadwise();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const p = state.profile;

  if (!p) return null;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }


  function setDouble(v: DoubleSessions) {
    if (!p || p.doubleSessionsAllowed === v) return;
    updateProfile({ ...p, doubleSessionsAllowed: v });
    toast.success("Zaktualizowano podwójne sesje. Plan przeliczony.");
  }

  const isMinor = p.age >= 13 && p.age <= 17;
  const currentFeelings = normalizeCurrentPitchFeelings(p.currentPitchFeelings);
  const desiredFeelings = normalizeDesiredPitchFeelings(p.desiredPitchFeelings);


  return (
    <div>
      <AppHeader title="Profil" subtitle="Twoje dane i ustawienia." />

      <div className="space-y-3 px-5">
        <div className="soft-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-semibold">{p.name}</div>
              <div className="text-sm text-muted-foreground">
                {p.age} lat · {POSITION_LABELS[p.position]}
              </div>
            </div>
          </div>
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <User className="h-3.5 w-3.5" /> Podstawowe
          </div>
          <div className="mt-1 divide-y divide-border">
            <Row label="Pozycja" value={POSITION_LABELS[p.position]} />
            <Row label="Poziom" value={LEVEL_LABELS[p.level]} />
            <Row label="Cel główny" value={GOAL_LABELS[p.goal]} />
            <Row
              label="Okres sezonu"
              value={SEASON_PHASE_LABELS[p.seasonPhase]}
            />
            <Row
              label="Poziom rozgrywkowy"
              value={COMPETITION_LEVEL_LABELS[p.competitionLevel]}
            />
            <Row
              label="Najbliższy mecz"
              value={p.matchDate ?? "Brak daty"}
            />
          </div>
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Compass className="h-3.5 w-3.5" /> Twój kierunek
          </div>
          {currentFeelings.length || desiredFeelings.length ? (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Teraz
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {currentFeelings.length ? (
                    currentFeelings.map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                      >
                        {CURRENT_PITCH_FEELING_LABELS[id]}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Buduję
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {desiredFeelings.length ? (
                    desiredFeelings.map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {DESIRED_PITCH_FEELING_LABELS[id]}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Uzupełnisz swój kierunek podczas edycji profilu.
            </p>
          )}
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Podwójne sesje
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Czy możesz trenować 2 razy jednego dnia?
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {(["no", "light_only", "yes_if_safe"] as DoubleSessions[]).map(
              (opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDouble(opt)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    p.doubleSessionsAllowed === opt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {DOUBLE_SESSION_LABELS[opt]}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" /> Sprzęt
          </div>
          {p.equipment.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.equipment.map((e) => (
                <span
                  key={e}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {e}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nie wybrano sprzętu.
            </p>
          )}
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Status i zgody
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {p.painInjury ? (
                <CircleAlert className="h-4 w-4 text-destructive" />
              ) : (
                <CircleCheck className="h-4 w-4 text-primary" />
              )}
              {p.painInjury
                ? "Zgłoszony ból / uraz — plan ograniczony"
                : "Brak zgłoszonego bólu / urazu"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CircleCheck className="h-4 w-4 text-primary" />
              {isMinor
                ? p.guardianConsent
                  ? "Zgoda rodzica/opiekuna potwierdzona"
                  : "Brak zgody opiekuna"
                : "Pełnoletni — zgoda niewymagana"}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Analiza zawodnika
          </div>
          <PlayerAnalysis />
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => navigate({ to: "/onboarding", search: { edit: true } })}
        >
          <Pencil className="h-4 w-4" /> Edytuj profil
        </Button>

        <div className="soft-card divide-y divide-border p-0">
          <button
            onClick={() => navigate({ to: "/data-rights" })}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <ShieldIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Moje dane i prawa (RODO)</span>
            <FileDown className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate({ to: "/privacy-policy" })}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <FileText className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium">Polityka prywatności</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate({ to: "/terms" })}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <FileText className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium">Regulamin</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={async () => {
            await restartOnboarding();
            navigate({ to: "/onboarding" });
          }}
        >
          <Pencil className="h-4 w-4" /> Resetuj onboarding (od nowa)
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> Wyloguj się
        </Button>



      </div>

      <Disclaimer />
    </div>
  );
}
