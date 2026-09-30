import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader } from "@/components/loadwise/ui";
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
import { PAIN_LOCATION_OPTIONS } from "@/lib/loadwise/readinessModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionRow, ConfirmDialog, Field, StatusMessage } from "@/components/ui/app-ui";
import { accountRoleLabel } from "@/lib/loadwise/agePolicy";
import { FileDown, FileText, LogOut, MessageCircleQuestion, Pencil } from "lucide-react";

export const Route = createFileRoute("/_tabs/profil")({
  component: ProfileScreen,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-4">
      <dt className="text-sm leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-base leading-6 text-foreground">{value}</dd>
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
  const { state, updateProfile } = useLoadwise();
  const { user, signOut, requestAccountEmailChange } = useAuth();
  const navigate = useNavigate();
  const profile = state.profile;
  const [transferEmail, setTransferEmail] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [transferError, setTransferError] = useState("");

  const { requestExit } = useActivityExitGuard({
    dirty: transferEmail.trim().length > 0,
    busy: transferBusy,
    description: "Adres przekazania konta nie został wysłany.",
    dispose: () => setTransferEmail(""),
  });

  if (!profile) return null;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function requestHandover() {
    const email = transferEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Podaj poprawny e-mail zawodnika.");
      return;
    }
    if (email === user?.email?.toLowerCase()) {
      toast.error("Nowy e-mail musi różnić się od e-maila opiekuna.");
      return;
    }
    setTransferError("");
    setTransferBusy(true);
    const pendingProfile = {
      ...profile!,
      ownershipTransferStatus: "pending" as const,
      ownershipTransferEmail: email,
      ownershipTransferRequestedAt: new Date().toISOString(),
    };
    try {
      await updateProfile(pendingProfile);
      const result = await requestAccountEmailChange(email);
      if (result.error) throw new Error(result.error);
      toast.success(
        "Wysłaliśmy potwierdzenie. Konto zostanie przekazane dopiero po potwierdzeniu nowego e-maila.",
      );
      setTransferEmail("");
      setTransferConfirmOpen(false);
    } catch (error) {
      try {
        await updateProfile(profile!);
      } catch {
        // The pending transfer remains visible and can be retried; do not hide
        // the original Auth error behind a best-effort rollback error.
      }
      const message =
        error instanceof Error ? error.message : "Nie udało się rozpocząć przekazania.";
      setTransferError(message);
      toast.error(message);
    } finally {
      setTransferBusy(false);
    }
  }

  const requiresGuardianOwner = profile.age >= 13 && profile.age < 16;
  const canTransferToAthlete =
    profile.age >= 16 &&
    profile.accountOwnerType === "guardian" &&
    profile.ownershipTransferStatus !== "completed";
  const painLocationLabel = (profile.painLocations ?? [])
    .map((location) => PAIN_LOCATION_OPTIONS.find((option) => option.value === location)?.label)
    .filter(Boolean)
    .join(", ");
  const currentFeelings = normalizeCurrentPitchFeelings(profile.currentPitchFeelings);
  const desiredFeelings = normalizeDesiredPitchFeelings(profile.desiredPitchFeelings);
  const usualMatchDay =
    profile.usualMatchDay === "no_fixed_day"
      ? "Brak stałego dnia"
      : typeof profile.usualMatchDay === "number"
        ? (ISO_DAY_LABELS.find((item) => item.value === profile.usualMatchDay)?.label ?? "Brak")
        : "Brak";
  const facilities = [
    { label: "Siłownia", available: profile.hasGym },
    { label: "Boisko", available: profile.hasPitch },
    { label: "Miejsce do sprintu", available: profile.hasSprintSpace },
  ];

  return (
    <section>
      <AppHeader title="Profil" brand={false} />
      <div className="bw-page-content bw-stack">
        <header className="flex flex-col items-start justify-between gap-5 sm:flex-row">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-xl font-semibold">{profile.name}</h2>
            <p className="text-base text-muted-foreground">{profile.age} lat</p>
            {user?.email && <p className="break-all text-sm text-muted-foreground">{user.email}</p>}
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={transferBusy}
            onClick={() => navigate({ to: "/onboarding", search: { edit: true } })}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edytuj profil i plan
          </Button>
        </header>

        <div className="bw-columns">
          <section className="bw-section">
            <h2 className="text-xl font-semibold">Profil sportowy</h2>
            <dl className="mt-5 space-y-4">
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
            </dl>
          </section>

          <section className="bw-section">
            <h2 className="text-xl font-semibold">Tydzień</h2>
            <dl className="mt-5 space-y-4">
              <Row label="Treningi klubowe" value={daysLabel(profile.clubTrainingDays)} />
              <Row label="Stały dzień meczu" value={usualMatchDay} />
              <Row
                label="Najbliższy mecz"
                value={profile.matchDate ? formatDate(profile.matchDate) : "Brak daty"}
              />
              <Row label="Dni niedostępne" value={daysLabel(profile.unavailableDays ?? [])} />
            </dl>
          </section>

          <section className="bw-section">
            <h2 className="text-xl font-semibold">Twój kierunek</h2>
            <dl className="mt-5 space-y-4">
              <Row
                label="Teraz"
                value={
                  currentFeelings.length
                    ? currentFeelings.map((id) => CURRENT_PITCH_FEELING_LABELS[id]).join(", ")
                    : "Nie ustawiono"
                }
              />
              <Row
                label="Buduję"
                value={
                  desiredFeelings.length
                    ? desiredFeelings.map((id) => DESIRED_PITCH_FEELING_LABELS[id]).join(", ")
                    : "Nie ustawiono"
                }
              />
            </dl>
          </section>

          <section className="bw-section">
            <h2 className="text-xl font-semibold">Warunki treningowe</h2>
            <dl className="mt-5 space-y-4">
              {facilities.map((item) => (
                <Row key={item.label} label={item.label} value={item.available ? "Tak" : "Nie"} />
              ))}
              <Row
                label="Sprzęt"
                value={
                  profile.equipment.length ? profile.equipment.join(", ") : "Nie wybrano sprzętu"
                }
              />
            </dl>
          </section>

          <section className="bw-section">
            <h2 className="text-xl font-semibold">Konto i personalizacja</h2>
            <dl className="mt-5 space-y-4">
              <Row
                label="Właściciel"
                value={accountRoleLabel(profile.accountOwnerType ?? "athlete", profile.age)}
              />
              {profile.birthDate && (
                <Row
                  label="Data urodzenia"
                  value={profile.birthDate.split("-").reverse().join(".")}
                />
              )}
              {profile.accountOwnerType === "guardian" && profile.guardianName && (
                <Row label="Opiekun" value={profile.guardianName} />
              )}
              <Row
                label="Personalizacja gotowości"
                value={
                  profile.healthPersonalizationEnabled ? "Włączona" : "Wyłączona · tryb ostrożny"
                }
              />
              <Row
                label="Fuel Precision"
                value={
                  profile.fuelPrecisionEnabled && profile.weightKg
                    ? `Włączony · ${profile.weightKg} kg`
                    : "Wyłączony · zakres ogólny"
                }
              />
            </dl>
            {profile.age < 18 && (
              <StatusMessage
                tone={requiresGuardianOwner && !profile.guardianConsent ? "error" : "neutral"}
                className="mt-4"
              >
                {requiresGuardianOwner
                  ? profile.guardianConsent
                    ? "Konto rodzica lub opiekuna potwierdzone"
                    : "Brak potwierdzenia rodzica lub opiekuna"
                  : "Płatności zatwierdza osoba dorosła"}
              </StatusMessage>
            )}
          </section>

          <section className="bw-section">
            <h2 className="text-xl font-semibold">Gotowość i bezpieczeństwo</h2>
            <StatusMessage
              tone={
                profile.healthPersonalizationEnabled && profile.painInjury ? "error" : "neutral"
              }
              className="mt-5"
            >
              {!profile.healthPersonalizationEnabled
                ? "Dane zdrowotne wyłączone — używany jest ostrożny wariant planu"
                : profile.painInjury
                  ? "Zgłoszony ból lub dyskomfort — obciążenie ograniczone"
                  : "Brak zgłoszonego bólu lub dyskomfortu"}
            </StatusMessage>
            {profile.painInjury && painLocationLabel && (
              <p className="mt-3 text-sm text-muted-foreground">Obszar: {painLocationLabel}</p>
            )}
          </section>
        </div>

        {canTransferToAthlete && (
          <section className="bw-section max-w-[42rem]">
            <h2 className="text-xl font-semibold">Przekazanie konta zawodnikowi</h2>
            <p className="mt-3 text-base leading-6 text-muted-foreground">
              Profil i historia zostaną przy tym samym koncie. Zmieni się właściciel i e-mail
              logowania; zawodnik ponownie zaakceptuje aktualne dokumenty. Płatnikiem do 18 lat
              pozostaje dorosły.
            </p>
            <div className="mt-5 space-y-4">
              <Field label="E-mail zawodnika" htmlFor="transfer-email">
                <Input
                  id="transfer-email"
                  type="email"
                  value={transferEmail}
                  onChange={(event) => setTransferEmail(event.target.value)}
                  autoComplete="email"
                  disabled={transferBusy}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={transferBusy}
                onClick={() => {
                  const email = transferEmail.trim().toLowerCase();
                  if (!/^\S+@\S+\.\S+$/.test(email)) {
                    setTransferError("Podaj poprawny e-mail zawodnika.");
                    return;
                  }
                  if (email === user?.email?.toLowerCase()) {
                    setTransferError("Nowy e-mail musi różnić się od e-maila opiekuna.");
                    return;
                  }
                  setTransferError("");
                  setTransferConfirmOpen(true);
                }}
              >
                {transferBusy ? "Wysyłam…" : "Wyślij przekazanie konta"}
              </Button>
              {profile.ownershipTransferStatus === "pending" && profile.ownershipTransferEmail && (
                <p className="break-all text-sm text-primary">
                  Oczekuje na potwierdzenie: {profile.ownershipTransferEmail}
                </p>
              )}
              {transferError && <StatusMessage tone="error">{transferError}</StatusMessage>}
            </div>
          </section>
        )}

        <section className="bw-section space-y-3">
          <h2 className="text-xl font-semibold">Pomoc i dokumenty</h2>
          <ActionRow
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            title="Pomoc i FAQ"
            disabled={transferBusy}
            onClick={() => navigate({ to: "/faq" })}
          />
          <ActionRow
            icon={<FileDown className="h-4 w-4" />}
            title="Moje dane i prawa (RODO)"
            disabled={transferBusy}
            onClick={() => navigate({ to: "/data-rights" })}
          />
          <ActionRow
            icon={<FileText className="h-4 w-4" />}
            title="Polityka prywatności"
            disabled={transferBusy}
            onClick={() => navigate({ to: "/privacy-policy" })}
          />
          <ActionRow
            icon={<FileText className="h-4 w-4" />}
            title="Regulamin"
            disabled={transferBusy}
            onClick={() => navigate({ to: "/terms" })}
          />
        </section>

        <Button
          type="button"
          variant="ghost"
          className="self-start text-destructive"
          disabled={transferBusy}
          onClick={() => requestExit(() => void handleSignOut(), "route")}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Wyloguj się
        </Button>
      </div>
      <ConfirmDialog
        open={transferConfirmOpen}
        onOpenChange={setTransferConfirmOpen}
        title="Przekazać konto zawodnikowi?"
        description={`Wysłać przekazanie konta na ${transferEmail.trim()}? Po potwierdzeniu zawodnik ponownie zaakceptuje dokumenty.`}
        confirmLabel="Wyślij przekazanie"
        busy={transferBusy}
        error={transferError}
        onConfirm={() => void requestHandover()}
      />
    </section>
  );
}
