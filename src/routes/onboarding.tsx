import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import type {
  Profile,
  Position,
  Level,
  Goal,
  SeasonPhase,
  SeasonStage,
  CompetitionLevel,
  SecondaryLimiter,
  CurrentPitchFeeling,
  DesiredPitchFeeling,
  PainLocation,
} from "@/lib/loadwise/types";
import {
  CURRENT_PITCH_FEELINGS,
  DESIRED_PITCH_FEELINGS,
  CURRENT_PITCH_FEELING_LABELS,
  DESIRED_PITCH_FEELING_LABELS,
  normalizeCurrentPitchFeelings,
  normalizeDesiredPitchFeelings,
  togglePitchFeeling,
} from "@/lib/loadwise/playerDirection";
import {
  POSITION_LABELS,
  ISO_DAY_LABELS,
  SEASON_PHASE_LABELS,
  SEASON_STAGE_LABELS,
  COMPETITION_LEVEL_LABELS,
} from "@/lib/loadwise/labels";
import { CONSENTS, MEDICAL_DISCLAIMER } from "@/lib/loadwise/legal";
import {
  accountSetupIsAllowed,
  ageOnDate,
  birthDateForApproximateAge,
  policyForAge,
  type AccountOwnerType,
} from "@/lib/loadwise/agePolicy";
import { validateSeason } from "@/lib/loadwise/seasonValidation";
import { PAIN_LOCATION_OPTIONS } from "@/lib/loadwise/readinessModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceGroup, ConfirmDialog, Field, StatusMessage } from "@/components/ui/app-ui";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, CalendarIcon } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } => ({
    edit: search.edit === true || search.edit === "true" || search.edit === "1",
  }),
  component: Onboarding,
});

const positions: Position[] = ["goalkeeper", "defender", "midfielder", "forward"];
const levels: Level[] = ["beginner", "intermediate", "advanced", "elite"];
const seasonPhases: SeasonPhase[] = [
  "offseason",
  "preseason",
  "inseason",
  "transition",
  "return_injury",
];
const seasonStages: SeasonStage[] = [
  "season_start",
  "season_mid",
  "season_end",
  "winter_break",
  "between_rounds",
  "no_match_week",
  "match_week",
];
const competitionLevels: CompetitionLevel[] = [
  "academy",
  "b_klasa",
  "a_klasa",
  "okregowka",
  "iv_liga",
  "iii_liga",
  "ii_liga_plus",
  "semi_pro",
  "pro",
];
const limiters: SecondaryLimiter[] = [
  "speed",
  "strength",
  "endurance",
  "cod",
  "power",
  "ball",
  "fatigue",
  "return",
];

// Kolejność celów w UI (spójna z oczekiwaną listą).
const goalOrder: Goal[] = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "matchready",
  "return",
];

// Krótkie, czysto polskie etykiety celów (bez mieszania języków).
const GOAL_SHORT_LABELS: Record<Goal, string> = {
  speed: "Szybkość",
  strength: "Siła",
  endurance: "Wytrzymałość",
  power: "Moc",
  agility: "Zwrotność i hamowanie",
  general: "Gra z piłką",
  mobility: "Mobilność i prehab",
  return: "Powrót po przerwie",
  matchready: "Gotowość meczowa",
};

// Krótkie etykiety ograniczeń (bez slashy).
const LIMITER_SHORT_LABELS: Record<SecondaryLimiter, string> = {
  speed: "Szybkość",
  strength: "Siła",
  endurance: "Wytrzymałość",
  cod: "Zwrotność",
  power: "Moc",
  ball: "Gra z piłką",
  fatigue: "Zmęczenie",
  return: "Powrót po przerwie",
};

// Etykiety i opisy poziomu treningowego (czysto polskie).
const LEVEL_CARD_LABELS: Record<Level, { label: string; desc: string }> = {
  beginner: { label: "Początkujący", desc: "Uczę się podstaw treningu." },
  intermediate: {
    label: "Średniozaawansowany",
    desc: "Trenuję regularnie.",
  },
  advanced: {
    label: "Zaawansowany",
    desc: "Mam doświadczenie w treningu siły i szybkości.",
  },
  elite: {
    label: "Wysoki poziom",
    desc: "Gram i trenuję na wysokiej intensywności.",
  },
};

function Onboarding() {
  const { hydrated } = useLoadwise();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && hydrated && !user) navigate({ to: "/auth", replace: true });
  }, [loading, hydrated, user, navigate]);

  // Mount the draft once authenticated profile hydration has finished. Later
  // profile refreshes must not replace a draft the player has already edited.
  if (loading || !hydrated || !user) return <AppLaunchScreen />;
  return <OnboardingForm />;
}

function OnboardingForm() {
  const { state, hydrated, completeOnboarding } = useLoadwise();
  const { user, loading, resendSignupConfirmation } = useAuth();
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const existing = state.profile;
  const isEditing = Boolean(edit && existing?.onboardingComplete);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveDestination, setSaveDestination] = useState<"/profil" | "/plan" | null>(null);
  const [seasonConfirmOpen, setSeasonConfirmOpen] = useState(false);

  // Require auth.
  useEffect(() => {
    if (loading || !hydrated) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (state.profile?.onboardingComplete && !edit && !busy && !saveDestination) {
      navigate({ to: "/start", replace: true });
    }
  }, [
    loading,
    hydrated,
    user,
    state.profile?.onboardingComplete,
    edit,
    busy,
    saveDestination,
    navigate,
  ]);

  const metadataOwner =
    user?.user_metadata?.account_owner_type === "guardian" ? "guardian" : "athlete";
  const [accountOwnerType, setAccountOwnerType] = useState<AccountOwnerType>(
    existing?.accountOwnerType ?? metadataOwner,
  );
  const ownerName = (user?.user_metadata?.full_name as string | undefined)?.trim() ?? "";
  const [guardianName, setGuardianName] = useState(
    existing?.guardianName ?? (metadataOwner === "guardian" ? ownerName : ""),
  );
  const [name, setName] = useState(
    existing?.name ?? (accountOwnerType === "athlete" ? ownerName : ""),
  );
  const metadataBirthDate =
    typeof user?.user_metadata?.athlete_birth_date === "string"
      ? user.user_metadata.athlete_birth_date
      : "";
  const [birthDate, setBirthDate] = useState(
    existing?.birthDate ||
      metadataBirthDate ||
      (existing?.age ? birthDateForApproximateAge(existing.age) : ""),
  );
  const [position, setPosition] = useState<Position | null>(existing?.position ?? null);
  const [level, setLevel] = useState<Level | null>(existing?.level ?? null);
  const [goal, setGoal] = useState<Goal | null>(existing?.goal ?? null);
  const [secondaryLimiter, setSecondaryLimiter] = useState<SecondaryLimiter | null>(
    existing?.secondaryLimiter ?? null,
  );
  const [clubDays, setClubDays] = useState<number[]>(existing?.clubTrainingDays ?? []);
  const [matchDate, setMatchDate] = useState(existing?.matchDate ?? "");
  const [noMatch, setNoMatch] = useState(!existing?.matchDate && existing?.weeklyMatches === false);
  const equipment: string[] = existing?.equipment ?? [];
  const [painInjury, setPainInjury] = useState(existing?.painInjury ?? false);
  const [painLocations, setPainLocations] = useState<PainLocation[]>(existing?.painLocations ?? []);
  const [consent, setConsent] = useState(existing?.guardianConsent ?? false);
  const [unavailableDays, setUnavailableDays] = useState<number[]>(existing?.unavailableDays ?? []);
  const [matchDateTouched, setMatchDateTouched] = useState(false);
  const [triedNext, setTriedNext] = useState(false);
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(existing?.seasonPhase ?? null);
  const [seasonStage, setSeasonStage] = useState<SeasonStage | null>(existing?.seasonStage ?? null);
  const [competitionLevel, setCompetitionLevel] = useState<CompetitionLevel | null>(
    existing?.competitionLevel ?? null,
  );
  const [weeklyMatches, setWeeklyMatches] = useState(existing?.weeklyMatches ?? true);
  const [hasGym, setHasGym] = useState(existing?.hasGym ?? false);
  const [hasPitch, setHasPitch] = useState(existing?.hasPitch ?? true);
  const [hasSprintSpace] = useState(existing?.hasSprintSpace ?? true);
  const [seasonPhaseOverride, setSeasonPhaseOverride] = useState(
    existing?.seasonPhaseOverride ?? false,
  );
  const [currentFeelings, setCurrentFeelings] = useState<CurrentPitchFeeling[]>(
    normalizeCurrentPitchFeelings(existing?.currentPitchFeelings),
  );
  const [desiredFeelings, setDesiredFeelings] = useState<DesiredPitchFeeling[]>(
    normalizeDesiredPitchFeelings(existing?.desiredPitchFeelings),
  );

  function toggleCurrentFeeling(id: CurrentPitchFeeling) {
    const next = togglePitchFeeling(currentFeelings, id);
    if (next.limitReached) {
      toast.info("Możesz wybrać maksymalnie 2 odpowiedzi");
      return;
    }
    setCurrentFeelings(next.value);
  }

  function toggleDesiredFeeling(id: DesiredPitchFeeling) {
    const next = togglePitchFeeling(desiredFeelings, id);
    if (next.limitReached) {
      toast.info("Możesz wybrać maksymalnie 2 odpowiedzi");
      return;
    }
    setDesiredFeelings(next.value);
  }

  // Walidacja spójności stanu sezonu z kalendarzem i datą meczu.
  const seasonValidation = validateSeason({
    seasonPhase,
    seasonStage,
    nextMatchDate: noMatch ? null : matchDate || null,
    weeklyMatches: noMatch ? false : weeklyMatches,
    seasonPhaseOverride,
  });
  const seasonBlocksContinue = !seasonPhaseOverride && seasonValidation.status === "invalid";

  // Legal consents (RODO/GDPR).
  const [consents, setConsents] = useState<Record<string, boolean>>({
    health_data: existing?.healthPersonalizationEnabled === true,
  });

  const ageNum = birthDate ? ageOnDate(birthDate) : null;
  const agePolicy = ageNum == null ? null : policyForAge(ageNum);
  const guardianEmailVerified = Boolean(user?.email_confirmed_at);
  const guardianDeclarationAccepted = accountOwnerType === "guardian" && consent;
  const ageAccountIsValid =
    ageNum != null &&
    accountSetupIsAllowed({
      age: ageNum,
      accountOwnerType,
      guardianEmailVerified,
      guardianDeclarationAccepted,
    }) &&
    (accountOwnerType !== "guardian" || (guardianEmailVerified && consent));
  const isGuardianChild = ageNum != null && ageNum >= 13 && ageNum < 16;

  const totalSteps = 6;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Każdy krok zawsze startuje od samej góry.
  useEffect(() => {
    const toTop = (el: { scrollTo: (o: ScrollToOptions) => void } | null) => {
      if (!el) return;
      try {
        el.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        el.scrollTo({ top: 0, behavior: "auto" });
      }
    };
    if (typeof window !== "undefined") toTop(window);
    setShowErrors(false);
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function goNext() {
    if (!canNext()) {
      setShowErrors(true);
      if (step === 4) setTriedNext(true);
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-error="true"]');
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus({ preventScroll: true });
      });
      return;
    }
    setStep((s) => s + 1);
  }

  const requiredConsentsOk = CONSENTS.filter((c) => c.required).every((c) => consents[c.type]);

  function toggleClubDay(d: number) {
    setClubDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }
  function toggleUnavailableDay(d: number) {
    setUnavailableDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }
  function togglePainLocation(location: PainLocation) {
    setPainLocations((current) =>
      current.includes(location)
        ? current.filter((item) => item !== location)
        : [...current, location],
    );
  }

  function canNext(): boolean {
    if (step === 0) return requiredConsentsOk;
    if (step === 1)
      return (
        name.trim().length > 0 &&
        ageNum != null &&
        ageNum >= 13 &&
        ageNum <= 80 &&
        (accountOwnerType !== "guardian" || guardianName.trim().length >= 2) &&
        (!agePolicy?.guardianMustOwnAccount || accountOwnerType === "guardian")
      );
    if (step === 2)
      return (
        position !== null &&
        level !== null &&
        seasonPhase !== null &&
        competitionLevel !== null &&
        !seasonBlocksContinue
      );
    if (step === 3) return goal !== null && secondaryLimiter !== null;
    if (step === 4)
      return (noMatch || matchDate.trim().length > 0) && (!painInjury || painLocations.length > 0);
    if (step === 5) return currentFeelings.length > 0 && desiredFeelings.length > 0;
    return true;
  }

  async function handleSubmit() {
    if (busy) return;
    if (!position || !level || !goal || ageNum == null || ageNum < 13) {
      toast.error("Uzupełnij wymagane pola.");
      return;
    }
    if (!secondaryLimiter) {
      toast.error("Wybierz, co najbardziej Cię ogranicza.");
      setStep(3);
      return;
    }
    if (!seasonPhase || !competitionLevel) {
      toast.error("Wybierz okres sezonu i poziom rozgrywkowy.");
      setStep(2);
      return;
    }
    if (seasonBlocksContinue) {
      toast.error(
        "Okres sezonu nie pasuje do kalendarza. Popraw go albo włącz tryb niestandardowego sezonu.",
      );
      setStep(2);
      return;
    }
    if (!ageAccountIsValid) {
      toast.error(
        isGuardianChild
          ? "Dla zawodnika 13–15 konto musi należeć do rodzica lub opiekuna z potwierdzonym e-mailem."
          : "Nie można aktywować tego profilu dla wybranego wieku i właściciela konta.",
      );
      return;
    }
    if (!requiredConsentsOk) {
      toast.error("Zaakceptuj wymagane zgody, aby kontynuować.");
      return;
    }
    if (!noMatch && !matchDate) {
      toast.error("Podaj datę najbliższego meczu, żeby dobrze ustawić obciążenia.");
      setTriedNext(true);
      setStep(4);
      return;
    }
    if (painInjury && painLocations.length === 0) {
      toast.error("Wybierz obszar bólu lub dyskomfortu.");
      setStep(4);
      return;
    }
    if (currentFeelings.length === 0 || desiredFeelings.length === 0) {
      toast.error("Wybierz, jak czujesz się teraz i jak chcesz się czuć.");
      setShowErrors(true);
      setStep(5);
      return;
    }
    // BallWise sam decyduje o dniach — dostępne są wszystkie dni poza niedostępnymi.
    const availableDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => !unavailableDays.includes(d));
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      birthDate,
      accountOwnerType,
      subscriptionPayerType: ageNum < 18 ? "guardian" : "self",
      guardianName: accountOwnerType === "guardian" ? guardianName.trim() : null,
      guardianEmail: accountOwnerType === "guardian" ? (user?.email ?? null) : null,
      guardianVerifiedAt:
        accountOwnerType === "guardian" && guardianEmailVerified
          ? (existing?.guardianVerifiedAt ?? user?.email_confirmed_at ?? new Date().toISOString())
          : null,
      guardianConsentAt:
        accountOwnerType === "guardian" && consent
          ? (existing?.guardianConsentAt ?? new Date().toISOString())
          : null,
      ownershipTransferStatus:
        accountOwnerType === "guardian" && ageNum >= 16 && ageNum < 18
          ? (existing?.ownershipTransferStatus ?? "not_requested")
          : (existing?.ownershipTransferStatus ?? "not_applicable"),
      ownershipTransferEmail: existing?.ownershipTransferEmail ?? null,
      ownershipTransferRequestedAt: existing?.ownershipTransferRequestedAt ?? null,
      ownershipTransferredAt: existing?.ownershipTransferredAt ?? null,
      healthPersonalizationEnabled: Boolean(consents.health_data),
      fuelPrecisionEnabled: existing?.fuelPrecisionEnabled ?? false,
      weightKg: existing?.fuelPrecisionEnabled ? (existing.weightKg ?? null) : null,
      fuelAllergyStatus: existing?.fuelAllergyStatus ?? "unconfirmed",
      foodAllergies: existing?.foodAllergies ?? [],
      foodIntolerances: existing?.foodIntolerances ?? [],
      foodExclusions: existing?.foodExclusions ?? [],
      position,
      level,
      goal,
      secondaryLimiter,
      clubTrainingDays: clubDays,
      individualTrainingDays: availableDays,
      unavailableDays,
      usualMatchDay: null,
      matchDate: noMatch ? null : matchDate || null,
      equipment,
      painInjury: Boolean(consents.health_data && painInjury),
      painLocations: consents.health_data && painInjury ? painLocations : [],
      doubleSessionsAllowed: level === "beginner" ? "light_only" : "yes_if_safe",
      guardianConsent: isGuardianChild ? consent : accountOwnerType === "guardian" ? consent : true,
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
      seasonPhase,
      seasonStage: seasonStage,
      competitionLevel,
      weeklyMatches: noMatch ? false : weeklyMatches,
      seasonPhaseOverride,
      seasonValidationStatus: seasonPhaseOverride ? "override" : seasonValidation.status,
      hasGym,
      hasPitch,
      hasSprintSpace,
      currentPitchFeelings: normalizeCurrentPitchFeelings(currentFeelings),
      desiredPitchFeelings: normalizeDesiredPitchFeelings(desiredFeelings),
    };
    setSaveError("");
    setBusy(true);
    try {
      await completeOnboarding(profile, consents);
      toast.success(isEditing ? "Profil zaktualizowany." : "Profil zapisany. Tworzę Twój plan…");
      setSaveDestination(isEditing ? "/profil" : "/plan");
    } catch (error) {
      console.error("[onboarding] save failed", error);
      const raw = error instanceof Error ? error.message : "Nieznany błąd";
      const message =
        raw
          .replace(/^\[[^\]]+\]\s*/, "")
          .split(" | ")[0]
          ?.trim() || "Nieznany błąd";
      setSaveError(`Nie udało się zapisać. ${message}`);
      toast.error(`Nie udało się zapisać. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const draftSnapshot = JSON.stringify({
    accountOwnerType,
    guardianName,
    name,
    birthDate,
    position,
    level,
    goal,
    secondaryLimiter,
    clubDays,
    matchDate,
    noMatch,
    painInjury,
    painLocations,
    consent,
    unavailableDays,
    seasonPhase,
    seasonStage,
    competitionLevel,
    weeklyMatches,
    hasGym,
    hasPitch,
    seasonPhaseOverride,
    currentFeelings,
    desiredFeelings,
    consents,
  });
  const initialDraft = useRef(draftSnapshot);
  const exitGuard = useActivityExitGuard({
    dirty: isEditing && !saveDestination && draftSnapshot !== initialDraft.current,
    busy,
    description: "Zmiany profilu nie zostały zapisane.",
  });

  useEffect(() => {
    if (saveDestination && !busy) navigate({ to: saveDestination, replace: true });
  }, [saveDestination, busy, navigate]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const stepTitles = [
    "Zgody i prywatność",
    "Dane zawodnika",
    "Profil sportowy",
    "Cel treningowy",
    "Tydzień i warunki",
    "Twój kierunek",
  ];

  if (loading || !hydrated || !user) return <AppLaunchScreen />;

  return (
    <section className="bw-form-page bw-page-content bw-stack">
      <header className="space-y-5">
        <div className="flex min-h-11 items-center justify-between gap-4">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setStep((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Wstecz
            </Button>
          ) : isEditing ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => exitGuard.requestExit(() => navigate({ to: "/profil" }), "route")}
            >
              Anuluj
            </Button>
          ) : (
            <span className="text-base font-semibold">BallWise</span>
          )}
          <p className="text-sm text-muted-foreground">
            Krok {step + 1} z {totalSteps}
          </p>
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="bw-page-title focus:outline-none">
          {stepTitles[step]}
        </h1>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step < totalSteps - 1) goNext();
          else {
            setTriedNext(true);
            setShowErrors(true);
            void handleSubmit();
          }
        }}
        className="bw-stack"
        aria-busy={busy}
      >
        <fieldset disabled={busy} className="min-w-0 space-y-8">
          {step === 0 && (
            <div className="space-y-6">
              <p className="rounded-lg bg-accent/30 p-3 text-sm leading-5 text-muted-foreground">
                {MEDICAL_DISCLAIMER}
              </p>
              <div
                className="space-y-5"
                data-error={showErrors && !requiredConsentsOk ? "true" : undefined}
              >
                {CONSENTS.map((item) => (
                  <label
                    key={item.type}
                    className="flex min-h-12 cursor-pointer items-start gap-3 py-2"
                  >
                    <Checkbox
                      checked={!!consents[item.type]}
                      onCheckedChange={(checked) =>
                        setConsents((previous) => ({ ...previous, [item.type]: checked === true }))
                      }
                      className="mt-1"
                      aria-label={item.title}
                    />
                    <span className="text-base leading-6">
                      <span className="mb-1 block text-sm font-semibold">
                        {item.type === "terms" ? (
                          <Link
                            to="/terms"
                            onClick={(event) => event.stopPropagation()}
                            className="underline underline-offset-4"
                          >
                            {item.title}
                          </Link>
                        ) : item.type === "privacy" ? (
                          <Link
                            to="/privacy-policy"
                            onClick={(event) => event.stopPropagation()}
                            className="underline underline-offset-4"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                        {item.required && <span className="text-destructive"> *</span>}
                      </span>
                      <span className="text-muted-foreground">{item.text}</span>
                    </span>
                  </label>
                ))}
                {showErrors && !requiredConsentsOk && (
                  <StatusMessage tone="error">
                    Zaakceptuj wymagane zgody, aby kontynuować.
                  </StatusMessage>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Pola oznaczone * są wymagane.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div data-error={showErrors && !name.trim() ? "true" : undefined}>
                <Field
                  label="Imię zawodnika"
                  htmlFor="name"
                  error={showErrors && !name.trim() ? "Podaj imię zawodnika." : undefined}
                >
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="given-name"
                    aria-invalid={showErrors && !name.trim()}
                  />
                </Field>
              </div>
              <div
                data-error={
                  showErrors && (ageNum == null || ageNum < 13 || ageNum > 80) ? "true" : undefined
                }
              >
                <Field
                  label="Data urodzenia zawodnika"
                  htmlFor="birth-date"
                  error={showErrors && !birthDate ? "Podaj datę urodzenia zawodnika." : undefined}
                >
                  <Input
                    id="birth-date"
                    type="date"
                    min={birthDateForApproximateAge(80)}
                    max={birthDateForApproximateAge(13)}
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </Field>
              </div>
              {birthDate !== "" && (ageNum == null || ageNum < 13) && (
                <StatusMessage tone="error">
                  Spersonalizowane konto jest dostępne od 13 lat. Młodszy zawodnik może użyć tylko
                  publicznego demo bez zapisu danych.
                </StatusMessage>
              )}
              {agePolicy?.guardianMustOwnAccount && accountOwnerType !== "guardian" && (
                <div data-error="true" className="space-y-3">
                  <StatusMessage tone="error">
                    Zawodnik 13–15 musi korzystać z konta należącego do rodzica lub opiekuna.
                  </StatusMessage>
                  <Button
                    type="button"
                    variant="link"
                    className="whitespace-normal text-left"
                    onClick={() => setAccountOwnerType("guardian")}
                  >
                    Potwierdzam, że ten e-mail i konto należą do opiekuna
                  </Button>
                </div>
              )}
              {accountOwnerType === "guardian" && (
                <div data-error={showErrors && guardianName.trim().length < 2 ? "true" : undefined}>
                  <Field
                    label="Imię rodzica lub opiekuna"
                    htmlFor="guardian-name"
                    help={`E-mail właściciela konta: ${user.email ?? "brak"}`}
                    error={
                      showErrors && guardianName.trim().length < 2
                        ? "Podaj imię rodzica lub opiekuna."
                        : undefined
                    }
                  >
                    <Input
                      id="guardian-name"
                      value={guardianName}
                      onChange={(event) => setGuardianName(event.target.value)}
                      autoComplete="given-name"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <section data-error={showErrors && !position ? "true" : undefined}>
                <ChoiceGroup
                  selectedClassName="bg-primary/[0.08] text-primary"
                  label="Pozycja"
                  value={position}
                  onChange={setPosition}
                  options={positions.map((value) => ({ value, label: POSITION_LABELS[value] }))}
                />
                {showErrors && !position && (
                  <StatusMessage tone="error">Wybierz pozycję.</StatusMessage>
                )}
              </section>
              <section data-error={showErrors && !level ? "true" : undefined}>
                <ChoiceGroup
                  selectedClassName="bg-primary/[0.08] text-primary"
                  label="Poziom treningowy"
                  value={level}
                  onChange={setLevel}
                  options={levels.map((value) => ({
                    value,
                    label: LEVEL_CARD_LABELS[value].label,
                    description: LEVEL_CARD_LABELS[value].desc,
                  }))}
                />
                {showErrors && !level && (
                  <StatusMessage tone="error">Wybierz poziom treningowy.</StatusMessage>
                )}
              </section>
              <section data-error={showErrors && !seasonPhase ? "true" : undefined}>
                <ChoiceGroup
                  selectedClassName="bg-primary text-primary-foreground"
                  label="Okres sezonu"
                  value={seasonPhase}
                  onChange={(value) => {
                    setSeasonPhase(value);
                    setSeasonStage(null);
                    setSeasonPhaseOverride(false);
                  }}
                  options={seasonPhases.map((value) => ({
                    value,
                    label: SEASON_PHASE_LABELS[value],
                  }))}
                />
                {showErrors && !seasonPhase && (
                  <StatusMessage tone="error">Wybierz okres sezonu.</StatusMessage>
                )}
                {seasonPhase !== null &&
                  !seasonPhaseOverride &&
                  (seasonValidation.status === "invalid" ||
                    seasonValidation.status === "incomplete") && (
                    <div
                      className="mt-4 space-y-3"
                      data-error={seasonBlocksContinue ? "true" : undefined}
                    >
                      <StatusMessage tone="error">{seasonValidation.message}</StatusMessage>
                      <div className="flex flex-wrap gap-3">
                        {seasonValidation.suggestion &&
                          seasonValidation.suggestion !== seasonPhase && (
                            <Button
                              type="button"
                              onClick={() => {
                                setSeasonPhase(seasonValidation.suggestion);
                                setSeasonStage(null);
                                setSeasonPhaseOverride(false);
                              }}
                            >
                              Ustaw sugerowany: {SEASON_PHASE_LABELS[seasonValidation.suggestion]}
                            </Button>
                          )}
                        {seasonValidation.needsConfirm && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSeasonConfirmOpen(true)}
                          >
                            Niestandardowy sezon
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                {seasonPhaseOverride && (
                  <p className="mt-3 text-sm text-primary">
                    Tryb niestandardowego sezonu włączony — plan korzysta z Twojego kalendarza i
                    daty meczu.
                  </p>
                )}
              </section>
              {(seasonPhase === "inseason" || seasonPhase === "transition") && (
                <ChoiceGroup
                  selectedClassName="bg-primary text-primary-foreground"
                  label="Etap w sezonie"
                  value={seasonStage}
                  onChange={setSeasonStage}
                  options={seasonStages.map((value) => ({
                    value,
                    label: SEASON_STAGE_LABELS[value],
                  }))}
                />
              )}
              <div data-error={showErrors && !competitionLevel ? "true" : undefined}>
                <Field
                  label="Poziom rozgrywkowy"
                  htmlFor="competition-level"
                  error={
                    showErrors && !competitionLevel ? "Wybierz poziom rozgrywkowy." : undefined
                  }
                >
                  <Select
                    value={competitionLevel ?? undefined}
                    onValueChange={(value) => setCompetitionLevel(value as CompetitionLevel)}
                  >
                    <SelectTrigger id="competition-level">
                      <SelectValue placeholder="Wybierz poziom" />
                    </SelectTrigger>
                    <SelectContent>
                      {competitionLevels.map((value) => (
                        <SelectItem key={value} value={value}>
                          {COMPETITION_LEVEL_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8">
              <section data-error={showErrors && !goal ? "true" : undefined}>
                <ChoiceGroup
                  selectedClassName="bg-primary/[0.08] text-primary"
                  label="Cel główny"
                  value={goal}
                  onChange={setGoal}
                  options={goalOrder.map((value) => ({ value, label: GOAL_SHORT_LABELS[value] }))}
                />
                {showErrors && !goal && (
                  <StatusMessage tone="error">Wybierz główny cel.</StatusMessage>
                )}
              </section>
              <section data-error={showErrors && !secondaryLimiter ? "true" : undefined}>
                <ChoiceGroup
                  selectedClassName="bg-primary/[0.08] text-primary"
                  label="Co najbardziej Cię ogranicza?"
                  value={secondaryLimiter}
                  onChange={setSecondaryLimiter}
                  options={limiters.map((value) => ({ value, label: LIMITER_SHORT_LABELS[value] }))}
                />
                {showErrors && !secondaryLimiter && (
                  <StatusMessage tone="error">Wybierz, co najbardziej Cię ogranicza.</StatusMessage>
                )}
              </section>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8">
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold">Treningi klubowe</legend>
                <div className="flex flex-wrap gap-2">
                  {ISO_DAY_LABELS.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant="outline"
                      aria-pressed={clubDays.includes(day.value)}
                      aria-label={day.label}
                      onClick={() => toggleClubDay(day.value)}
                      className={`min-w-11 flex-1 px-2 ${clubDays.includes(day.value) ? "border-primary bg-primary/[0.08] text-primary" : "border-border bg-background text-foreground"}`}
                    >
                      {day.short}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <section
                className="space-y-4"
                data-error={
                  (triedNext || matchDateTouched) && !matchDate && !noMatch ? "true" : undefined
                }
              >
                <Field
                  label="Data najbliższego meczu"
                  htmlFor="match-date"
                  error={
                    (triedNext || matchDateTouched) && !matchDate && !noMatch
                      ? "Podaj datę najbliższego meczu, żeby dobrze ustawić obciążenia."
                      : undefined
                  }
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="match-date"
                        type="button"
                        variant="outline"
                        onClick={() => setMatchDateTouched(true)}
                        className={`w-full justify-start bg-background text-left ${(triedNext || matchDateTouched) && !matchDate && !noMatch ? "border-destructive" : "border-border"}`}
                        aria-invalid={(triedNext || matchDateTouched) && !matchDate && !noMatch}
                      >
                        <CalendarIcon
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span
                          className={
                            matchDate && !noMatch ? "text-foreground" : "text-muted-foreground"
                          }
                        >
                          {matchDate && !noMatch
                            ? format(new Date(`${matchDate}T00:00:00`), "d MMMM yyyy", {
                                locale: pl,
                              })
                            : "Wybierz datę meczu"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={pl}
                        selected={matchDate ? new Date(`${matchDate}T00:00:00`) : undefined}
                        defaultMonth={matchDate ? new Date(`${matchDate}T00:00:00`) : undefined}
                        onSelect={(date) => {
                          setMatchDateTouched(true);
                          if (date) {
                            setMatchDate(format(date, "yyyy-MM-dd"));
                            setNoMatch(false);
                          }
                        }}
                        disabled={(date) => date < new Date(`${todayStr}T00:00:00`)}
                        autoFocus
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
                <label className="flex min-h-12 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={noMatch}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setNoMatch(next);
                      if (next) {
                        setMatchDate("");
                        setWeeklyMatches(false);
                      }
                    }}
                  />
                  <span>Nie mam teraz zaplanowanego meczu</span>
                </label>
                {!noMatch && matchDate && (
                  <label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={weeklyMatches}
                      onCheckedChange={(checked) => setWeeklyMatches(checked === true)}
                    />
                    <span>W tym okresie zwykle gram mecz co tydzień</span>
                  </label>
                )}
              </section>
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold">Warunki treningowe</legend>
                <label className="flex min-h-12 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={hasGym}
                    onCheckedChange={(checked) => setHasGym(checked === true)}
                  />
                  <span>Mam dostęp do siłowni</span>
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={hasPitch}
                    onCheckedChange={(checked) => setHasPitch(checked === true)}
                  />
                  <span>Mam dostęp do boiska</span>
                </label>
              </fieldset>
              <section className="space-y-4">
                {consents.health_data ? (
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
                    <Checkbox
                      checked={painInjury}
                      onCheckedChange={(checked) => setPainInjury(checked === true)}
                      className="mt-1"
                    />
                    <span>
                      Mam aktualnie ból lub dyskomfort
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Ograniczymy obciążenie treningowe. BallWise nie diagnozuje urazu, nie
                        prowadzi rehabilitacji i nie wyznacza powrotu do gry.
                      </span>
                    </span>
                  </label>
                ) : (
                  <StatusMessage>
                    Personalizacja danymi o bólu jest wyłączona. Aplikacja pozostanie dostępna i
                    zastosuje ostrożny wariant planu.
                  </StatusMessage>
                )}
                {consents.health_data && painInjury && (
                  <fieldset
                    className="space-y-4"
                    data-error={painLocations.length === 0 ? "true" : undefined}
                  >
                    <legend className="mb-2 text-sm font-semibold">
                      Gdzie odczuwasz ból lub dyskomfort?
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      Wybierz wszystkie pasujące obszary. Służy to tylko do ograniczenia obciążenia
                      ćwiczeń.
                    </p>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {PAIN_LOCATION_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`bw-choice ${painLocations.includes(option.value) ? "bg-primary/[0.08] text-primary" : "bg-background text-foreground"}`}
                        >
                          <Checkbox
                            checked={painLocations.includes(option.value)}
                            onCheckedChange={() => togglePainLocation(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {painLocations.length === 0 && (
                      <StatusMessage tone="error">Wybierz przynajmniej jeden obszar.</StatusMessage>
                    )}
                  </fieldset>
                )}
              </section>
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold">Dni całkowicie niedostępne</legend>
                <div className="flex flex-wrap gap-2">
                  {ISO_DAY_LABELS.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant="outline"
                      aria-pressed={unavailableDays.includes(day.value)}
                      aria-label={day.label}
                      onClick={() => toggleUnavailableDay(day.value)}
                      className={`min-w-11 flex-1 px-2 ${unavailableDays.includes(day.value) ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-card text-foreground"}`}
                    >
                      {day.short}
                    </Button>
                  ))}
                </div>
              </fieldset>
              {accountOwnerType === "guardian" && ageNum != null && ageNum < 18 && (
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg bg-accent/30 p-3">
                  <Checkbox
                    checked={consent}
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    className="mt-1"
                  />
                  <span>
                    Oświadczenie rodzica lub opiekuna
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Oświadczam, że jestem rodzicem lub opiekunem zawodnika i mogę utworzyć oraz
                      prowadzić jego profil. Dla wieku 13–15 jest to wymagane.
                    </span>
                  </span>
                </label>
              )}
              {isGuardianChild && !guardianEmailVerified && (
                <div className="space-y-3">
                  <StatusMessage tone="error">
                    Najpierw potwierdź e-mail właściciela konta. Bez tego profil zawodnika 13–15 nie
                    zostanie aktywowany.
                  </StatusMessage>
                  <Button
                    type="button"
                    variant="link"
                    className="whitespace-normal text-left"
                    onClick={async () => {
                      if (!user.email) return;
                      const result = await resendSignupConfirmation(user.email);
                      if (result.error) toast.error(result.error);
                      else toast.success("Wysłaliśmy nową wiadomość. Sprawdź skrzynkę e-mail.");
                    }}
                  >
                    Wyślij wiadomość potwierdzającą ponownie
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8">
              <fieldset
                className="space-y-4"
                data-error={showErrors && currentFeelings.length === 0 ? "true" : undefined}
              >
                <legend className="mb-2 text-sm font-semibold">
                  Jak czujesz się teraz na boisku?
                </legend>
                <p className="text-sm text-muted-foreground">Wybierz 1–2 odpowiedzi.</p>
                {CURRENT_PITCH_FEELINGS.map((id) => (
                  <label
                    key={id}
                    className={`bw-choice ${currentFeelings.includes(id) ? "bg-primary/[0.08] text-primary" : "bg-card text-foreground"}`}
                  >
                    <Checkbox
                      checked={currentFeelings.includes(id)}
                      onCheckedChange={() => toggleCurrentFeeling(id)}
                    />
                    <span>{CURRENT_PITCH_FEELING_LABELS[id]}</span>
                  </label>
                ))}
                {showErrors && currentFeelings.length === 0 && (
                  <StatusMessage tone="error">Wybierz przynajmniej jedną odpowiedź.</StatusMessage>
                )}
              </fieldset>
              <fieldset
                className="space-y-4"
                data-error={showErrors && desiredFeelings.length === 0 ? "true" : undefined}
              >
                <legend className="mb-2 text-sm font-semibold">
                  Jak chcesz się czuć na boisku?
                </legend>
                <p className="text-sm text-muted-foreground">Wybierz 1–2 odpowiedzi.</p>
                {DESIRED_PITCH_FEELINGS.map((id) => (
                  <label
                    key={id}
                    className={`bw-choice ${desiredFeelings.includes(id) ? "bg-primary/[0.08] text-primary" : "bg-card text-foreground"}`}
                  >
                    <Checkbox
                      checked={desiredFeelings.includes(id)}
                      onCheckedChange={() => toggleDesiredFeeling(id)}
                    />
                    <span>{DESIRED_PITCH_FEELING_LABELS[id]}</span>
                  </label>
                ))}
                {showErrors && desiredFeelings.length === 0 && (
                  <StatusMessage tone="error">Wybierz przynajmniej jedną odpowiedź.</StatusMessage>
                )}
              </fieldset>
            </div>
          )}
        </fieldset>
        {saveError && <StatusMessage tone="error">{saveError}</StatusMessage>}
        <div className="bw-sticky-actions bg-background py-4">
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Zapisuję…" : step < totalSteps - 1 ? "Dalej" : "Zapisz i wygeneruj plan"}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={seasonConfirmOpen}
        onOpenChange={setSeasonConfirmOpen}
        title="Niestandardowy sezon"
        description="Ten okres sezonu nie pasuje do kalendarza. Czy na pewno masz niestandardowy harmonogram (turniej, liga zagraniczna, akademia, plan indywidualny)?"
        confirmLabel="Potwierdź harmonogram"
        onConfirm={() => {
          setSeasonPhaseOverride(true);
          setSeasonConfirmOpen(false);
        }}
      />
    </section>
  );
}
