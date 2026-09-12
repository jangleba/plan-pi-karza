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
  GOAL_LABELS,
  SECONDARY_LIMITER_LABELS,
  POSITION_LABELS,
  LEVEL_LABELS,
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
const goals: Goal[] = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "return",
  "matchready",
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

function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  labels,
  cols = 2,
}: {
  options: T[];
  value: T | null;
  onChange: (v: T) => void;
  labels: Record<T, string>;
  cols?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex min-h-[56px] items-center justify-center rounded-2xl border px-3 py-3 text-center text-sm font-medium transition-all ${
            value === o
              ? "border-primary bg-primary text-primary-foreground shadow-md"
              : "border-border bg-card text-foreground"
          }`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function Onboarding() {
  const { state, hydrated, completeOnboarding } = useLoadwise();
  const { user, loading, resendSignupConfirmation } = useAuth();
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const existing = state.profile;
  const isEditing = Boolean(edit && existing?.onboardingComplete);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Require auth.
  useEffect(() => {
    if (loading || !hydrated) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (state.profile?.onboardingComplete && !edit) {
      navigate({ to: "/start", replace: true });
    }
  }, [loading, hydrated, user, state.profile?.onboardingComplete, edit, navigate]);

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
  const [position, setPosition] = useState<Position | null>(
    existing?.position ?? null,
  );
  const [level, setLevel] = useState<Level | null>(existing?.level ?? null);
  const [goal, setGoal] = useState<Goal | null>(existing?.goal ?? null);
  const [secondaryLimiter, setSecondaryLimiter] =
    useState<SecondaryLimiter | null>(existing?.secondaryLimiter ?? null);
  const [clubDays, setClubDays] = useState<number[]>(
    existing?.clubTrainingDays ?? [],
  );
  const [matchDate, setMatchDate] = useState(existing?.matchDate ?? "");
  const [noMatch, setNoMatch] = useState(
    !existing?.matchDate && existing?.weeklyMatches === false,
  );
  const equipment: string[] = existing?.equipment ?? [];
  const [painInjury, setPainInjury] = useState(existing?.painInjury ?? false);
  const [painLocations, setPainLocations] = useState<PainLocation[]>(
    existing?.painLocations ?? [],
  );
  const [consent, setConsent] = useState(existing?.guardianConsent ?? false);
  const [unavailableDays, setUnavailableDays] = useState<number[]>(
    existing?.unavailableDays ?? [],
  );
  const [matchDateTouched, setMatchDateTouched] = useState(false);
  const [triedNext, setTriedNext] = useState(false);
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(
    existing?.seasonPhase ?? null,
  );
  const [seasonStage, setSeasonStage] = useState<SeasonStage | null>(
    existing?.seasonStage ?? null,
  );
  const [competitionLevel, setCompetitionLevel] =
    useState<CompetitionLevel | null>(existing?.competitionLevel ?? null);
  const [weeklyMatches, setWeeklyMatches] = useState(
    existing?.weeklyMatches ?? true,
  );
  const [hasGym, setHasGym] = useState(
    existing?.hasGym ?? false,
  );
  const [hasPitch, setHasPitch] = useState(existing?.hasPitch ?? true);
  const [hasSprintSpace, setHasSprintSpace] = useState(
    existing?.hasSprintSpace ?? true,
  );
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
  const seasonBlocksContinue =
    !seasonPhaseOverride && seasonValidation.status === "invalid";



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

  const scrollRef = useRef<HTMLDivElement>(null);
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
    toTop(scrollRef.current);
    if (typeof window !== "undefined") toTop(window);
    setShowErrors(false);
  }, [step]);

  function goNext() {
    if (!canNext()) {
      setShowErrors(true);
      if (step === 4) setTriedNext(true);
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-error="true"]');
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setStep((s) => s + 1);
  }

  const requiredConsentsOk = CONSENTS.filter((c) => c.required).every(
    (c) => consents[c.type],
  );

  function toggleClubDay(d: number) {
    setClubDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
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
    if (step === 5)
      return currentFeelings.length > 0 && desiredFeelings.length > 0;
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
      toast.error(
        "Podaj datę najbliższego meczu, żeby dobrze ustawić obciążenia.",
      );
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
    const availableDays = [1, 2, 3, 4, 5, 6, 7].filter(
      (d) => !unavailableDays.includes(d),
    );
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      birthDate,
      accountOwnerType,
      subscriptionPayerType: ageNum < 18 ? "guardian" : "self",
      guardianName:
        accountOwnerType === "guardian" ? guardianName.trim() : null,
      guardianEmail: accountOwnerType === "guardian" ? user?.email ?? null : null,
      guardianVerifiedAt:
        accountOwnerType === "guardian" && guardianEmailVerified
          ? existing?.guardianVerifiedAt ?? user?.email_confirmed_at ?? new Date().toISOString()
          : null,
      guardianConsentAt:
        accountOwnerType === "guardian" && consent
          ? existing?.guardianConsentAt ?? new Date().toISOString()
          : null,
      ownershipTransferStatus:
        accountOwnerType === "guardian" && ageNum >= 16 && ageNum < 18
          ? existing?.ownershipTransferStatus ?? "not_requested"
          : existing?.ownershipTransferStatus ?? "not_applicable",
      ownershipTransferEmail: existing?.ownershipTransferEmail ?? null,
      ownershipTransferRequestedAt: existing?.ownershipTransferRequestedAt ?? null,
      ownershipTransferredAt: existing?.ownershipTransferredAt ?? null,
      healthPersonalizationEnabled: Boolean(consents.health_data),
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
      seasonValidationStatus: seasonPhaseOverride
        ? "override"
        : seasonValidation.status,
      hasGym,
      hasPitch,
      hasSprintSpace,
      currentPitchFeelings: normalizeCurrentPitchFeelings(currentFeelings),
      desiredPitchFeelings: normalizeDesiredPitchFeelings(desiredFeelings),
    };
    setBusy(true);
    try {
      await completeOnboarding(profile, consents);
      toast.success(
        isEditing
          ? "Profil zaktualizowany."
          : "Profil zapisany. Tworzę Twój plan…",
      );
      navigate({ to: isEditing ? "/profil" : "/plan", replace: true });
    } catch (error) {
      console.error("[onboarding] save failed", error);
      const raw = error instanceof Error ? error.message : "Nieznany błąd";
      const message = raw.replace(/^\[[^\]]+\]\s*/, "").split(" | ")[0]?.trim() || "Nieznany błąd";
      toast.error(`Nie udało się zapisać. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  if (loading || !hydrated || !user) {
    return <AppLaunchScreen />;
  }

  return (
    <div className="app-shell flex h-[100dvh] flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ overflowAnchor: "none" }}
      >
        <div className="px-5 pt-6">
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-full border border-border p-1.5 text-foreground"
                aria-label="Wstecz"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="text-xl font-semibold text-primary">BallWise</div>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              Krok {step + 1} z {totalSteps}
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="px-5 pt-6 pb-36">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Zaczynamy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dane dotyczą zawodnika. Data urodzenia służy wyłącznie do zastosowania progów 13, 16 i 18 lat.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Imię</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Twoje imię"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth-date">Data urodzenia zawodnika</Label>
              <Input
                id="birth-date"
                type="date"
                min={birthDateForApproximateAge(80)}
                max={birthDateForApproximateAge(13)}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
              {birthDate !== "" && (ageNum == null || ageNum < 13) && (
                <p className="text-xs text-destructive">
                  Spersonalizowane konto jest dostępne od 13 lat. Młodszy zawodnik może użyć tylko publicznego demo bez zapisu danych.
                </p>
              )}
              {agePolicy?.guardianMustOwnAccount && accountOwnerType !== "guardian" && (
                <div data-error="true" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-xs font-medium text-destructive">
                    Zawodnik 13–15 musi korzystać z konta należącego do rodzica lub opiekuna.
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-primary underline"
                    onClick={() => setAccountOwnerType("guardian")}
                  >
                    Potwierdzam, że ten e-mail i konto należą do opiekuna
                  </button>
                </div>
              )}
              {accountOwnerType === "guardian" && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="guardian-name">Imię rodzica lub opiekuna</Label>
                  <Input
                    id="guardian-name"
                    value={guardianName}
                    onChange={(event) => setGuardianName(event.target.value)}
                    placeholder="Imię właściciela konta"
                    autoComplete="given-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    E-mail właściciela konta: {user.email ?? "brak"}
                  </p>
                </div>
              )}
              {ageNum != null && ageNum >= 16 && (
                <p className="text-xs text-muted-foreground">
                  Wiek zawodnika: {ageNum} lat. Może posiadać własne konto.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold">Twoja gra</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Dopasujemy plan do pozycji, poziomu i etapu sezonu.
              </p>
            </div>

            {/* Pozycja */}
            <section
              className="space-y-3"
              data-error={showErrors && !position ? "true" : undefined}
            >
              <Label>Pozycja</Label>
              <ChoiceGrid
                options={positions}
                value={position}
                onChange={setPosition}
                labels={POSITION_LABELS}
                cols={2}
              />
              {showErrors && !position && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz pozycję.
                </p>
              )}
            </section>

            {/* Poziom treningowy */}
            <section
              className="space-y-3"
              data-error={showErrors && !level ? "true" : undefined}
            >
              <Label>Poziom treningowy</Label>
              <div className="grid gap-2">
                {levels.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLevel(lv)}
                    className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-all ${
                      level === lv
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    <span className="text-sm font-semibold">
                      {LEVEL_CARD_LABELS[lv].label}
                    </span>
                    <span
                      className={`mt-0.5 text-xs ${
                        level === lv
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {LEVEL_CARD_LABELS[lv].desc}
                    </span>
                  </button>
                ))}
              </div>
              {showErrors && !level && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz poziom treningowy.
                </p>
              )}
            </section>

            {/* Okres sezonu */}
            <section
              className="space-y-3"
              data-error={showErrors && !seasonPhase ? "true" : undefined}
            >
              <Label>Okres sezonu</Label>
              <div className="overflow-hidden rounded-2xl border border-border">
                {seasonPhases.map((ph, i) => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => {
                      setSeasonPhase(ph);
                      setSeasonStage(null);
                      setSeasonPhaseOverride(false);
                    }}
                    className={`flex w-full items-center px-4 py-3 text-sm font-medium transition-colors ${
                      i > 0 ? "border-t border-border" : ""
                    } ${
                      seasonPhase === ph
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground"
                    }`}
                  >
                    {SEASON_PHASE_LABELS[ph]}
                  </button>
                ))}
              </div>
              {showErrors && !seasonPhase && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz okres sezonu.
                </p>
              )}
              {seasonPhase !== null &&
                !seasonPhaseOverride &&
                (seasonValidation.status === "invalid" ||
                  seasonValidation.status === "incomplete") && (
                  <div className="space-y-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-xs font-medium text-destructive">
                      {seasonValidation.message}
                    </p>
                    {seasonValidation.suggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          setSeasonPhase(seasonValidation.suggestion);
                          setSeasonStage(null);
                          setSeasonPhaseOverride(false);
                        }}
                        className="rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                      >
                        Ustaw sugerowany:{" "}
                        {SEASON_PHASE_LABELS[seasonValidation.suggestion]}
                      </button>
                    )}
                    {seasonValidation.needsConfirm && (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            "Ten okres sezonu nie pasuje do kalendarza. Czy na pewno masz niestandardowy harmonogram (turniej, liga zagraniczna, akademia, plan indywidualny)?",
                          );
                          if (ok) setSeasonPhaseOverride(true);
                        }}
                        className="ml-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        Tryb niestandardowego sezonu
                      </button>
                    )}
                  </div>
                )}
              {seasonPhaseOverride && (
                <p className="text-xs font-medium text-primary">
                  Tryb niestandardowego sezonu włączony — plan korzysta z Twojego
                  kalendarza i daty meczu.
                </p>
              )}
            </section>

            {(seasonPhase === "inseason" || seasonPhase === "transition") && (
              <section className="space-y-3">
                <Label>Etap w sezonie</Label>
                <div className="overflow-hidden rounded-2xl border border-border">
                  {seasonStages.map((sg, i) => (
                    <button
                      key={sg}
                      type="button"
                      onClick={() => setSeasonStage(sg)}
                      className={`flex w-full items-center px-4 py-3 text-sm font-medium transition-colors ${
                        i > 0 ? "border-t border-border" : ""
                      } ${
                        seasonStage === sg
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground"
                      }`}
                    >
                      {SEASON_STAGE_LABELS[sg]}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Poziom rozgrywkowy */}
            <section
              className="space-y-3"
              data-error={showErrors && !competitionLevel ? "true" : undefined}
            >
              <Label>Poziom rozgrywkowy</Label>
              <Select
                value={competitionLevel ?? undefined}
                onValueChange={(v) =>
                  setCompetitionLevel(v as CompetitionLevel)
                }
              >
                <SelectTrigger className="h-14 rounded-2xl">
                  <SelectValue placeholder="Wybierz poziom" />
                </SelectTrigger>
                <SelectContent>
                  {competitionLevels.map((cl) => (
                    <SelectItem key={cl} value={cl}>
                      {COMPETITION_LEVEL_LABELS[cl]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors && !competitionLevel && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz poziom rozgrywkowy.
                </p>
              )}
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold">Główny cel</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Wybierz jeden priorytet. Ograniczenie potraktujemy jako dodatkowe
                wsparcie, nie zamiennik celu.
              </p>
            </div>

            {/* Priorytet */}
            <section
              className="space-y-3"
              data-error={showErrors && !goal ? "true" : undefined}
            >
              <Label>Priorytet</Label>
              <ChoiceGrid
                options={goalOrder}
                value={goal}
                onChange={setGoal}
                labels={GOAL_SHORT_LABELS}
                cols={2}
              />
              {showErrors && !goal && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz główny cel.
                </p>
              )}
            </section>

            {/* Ograniczenie */}
            <section
              className="space-y-3"
              data-error={showErrors && !secondaryLimiter ? "true" : undefined}
            >
              <Label>Co najbardziej Cię ogranicza?</Label>
              <p className="text-sm text-muted-foreground">
                To pomaga dobrać akcenty w planie. Nie zastępuje celu głównego.
              </p>
              <ChoiceGrid
                options={limiters}
                value={secondaryLimiter}
                onChange={setSecondaryLimiter}
                labels={LIMITER_SHORT_LABELS}
                cols={2}
              />
              {showErrors && !secondaryLimiter && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz, co najbardziej Cię ogranicza.
                </p>
              )}
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kalendarz tygodnia
              </span>
              <h2 className="mt-1 text-2xl font-semibold">
                Twój tydzień treningowy
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Zaznacz stałe elementy tygodnia. BallWise dopasuje do nich
                obciążenia, regenerację i dni mocniejsze.
              </p>
            </div>

            {/* Główna karta kalendarza */}
            <div className="space-y-7 rounded-2xl border border-border bg-card p-5">
              {/* Treningi klubowe */}
              <div className="space-y-2.5">
                <Label>W jakie dni masz treningi klubowe?</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ISO_DAY_LABELS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleClubDay(d.value)}
                      className={`rounded-full border py-2 text-xs font-medium transition-colors ${
                        clubDays.includes(d.value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground"
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data meczu */}
              <div className="space-y-2.5">
                <Label>Data najbliższego meczu</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setMatchDateTouched(true)}
                      className={`flex w-full items-center gap-3 rounded-xl border bg-background px-4 py-3 text-left text-sm transition-colors ${
                        (triedNext || matchDateTouched) && !matchDate && !noMatch
                          ? "border-destructive"
                          : "border-border"
                      }`}
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={pl}
                      selected={
                        matchDate ? new Date(`${matchDate}T00:00:00`) : undefined
                      }
                      onSelect={(d) => {
                        setMatchDateTouched(true);
                        if (d) {
                          setMatchDate(format(d, "yyyy-MM-dd"));
                          setNoMatch(false);
                        }
                      }}
                      disabled={(d) =>
                        d < new Date(`${todayStr}T00:00:00`)
                      }
                      initialFocus
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
                <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
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
                    className="mt-0.5"
                  />
                  <span className="text-sm">Nie mam teraz zaplanowanego meczu</span>
                </label>
                {!noMatch && matchDate && (
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
                    <Checkbox
                      checked={weeklyMatches}
                      onCheckedChange={(checked) => setWeeklyMatches(checked === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">W tym okresie zwykle gram mecz co tydzień</span>
                  </label>
                )}
                {(triedNext || matchDateTouched) && !matchDate && !noMatch && (
                  <p className="text-xs font-medium text-destructive">
                    Podaj datę najbliższego meczu, żeby dobrze ustawić
                    obciążenia.
                  </p>
                )}
              </div>

              <p className="rounded-xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
                Liczbę sesji dobiera BallWise z poziomu zawodnika i obciążenia tygodnia.
                Początkujący nie dostanie dwóch mocnych treningów jednego dnia.
              </p>
            </div>

            {/* Warunki treningowe */}
            <div className="space-y-2.5">
              <Label>Warunki treningowe</Label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
                <Checkbox
                  checked={hasGym}
                  onCheckedChange={(c) => setHasGym(c === true)}
                />
                <span className="text-sm">Mam dostęp do siłowni</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
                <Checkbox
                  checked={hasPitch}
                  onCheckedChange={(c) => setHasPitch(c === true)}
                />
                <span className="text-sm">Mam dostęp do boiska</span>
              </label>
              {consents.health_data ? (
                <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                  <Checkbox
                    checked={painInjury}
                    onCheckedChange={(v) => setPainInjury(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    Mam aktualnie ból lub dyskomfort
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Ograniczymy obciążenie treningowe. BallWise nie diagnozuje
                      urazu, nie prowadzi rehabilitacji i nie wyznacza powrotu do gry.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="rounded-xl border border-border bg-card p-3.5 text-xs text-muted-foreground">
                  Personalizacja danymi o bólu jest wyłączona. Aplikacja pozostanie dostępna i zastosuje ostrożny wariant planu.
                </p>
              )}
              {consents.health_data && painInjury && (
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-sm font-medium">Gdzie odczuwasz ból lub dyskomfort?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Wybierz wszystkie pasujące obszary. Służy to tylko do ograniczenia obciążenia ćwiczeń.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {PAIN_LOCATION_OPTIONS.map((option) => {
                      const selected = painLocations.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePainLocation(option.value)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {painLocations.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      Wybierz przynajmniej jeden obszar.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Dni całkowicie niedostępne */}
            <div className="space-y-2.5">
              <Label>Dni całkowicie niedostępne</Label>
              <p className="text-xs text-muted-foreground">
                Zaznacz tylko dni, w które w ogóle nie możesz trenować.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {ISO_DAY_LABELS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleUnavailableDay(d.value)}
                    className={`rounded-full border py-2 text-xs font-medium transition-colors ${
                      unavailableDays.includes(d.value)
                        ? "border-destructive bg-destructive text-destructive-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>

            {accountOwnerType === "guardian" && ageNum != null && ageNum < 18 && (
              <label className="flex items-start gap-3 rounded-xl border border-accent bg-accent/30 p-3.5">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Oświadczenie rodzica lub opiekuna
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Oświadczam, że jestem rodzicem lub opiekunem zawodnika i mogę utworzyć oraz prowadzić jego profil. Dla wieku 13–15 jest to wymagane.
                  </span>
                </span>
              </label>
            )}
            {isGuardianChild && !guardianEmailVerified && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
                <p className="text-xs font-medium text-destructive">
                  Najpierw potwierdź e-mail właściciela konta. Bez tego profil zawodnika 13–15 nie zostanie aktywowany.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-primary underline"
                  onClick={async () => {
                    if (!user.email) return;
                    const result = await resendSignupConfirmation(user.email);
                    if (result.error) toast.error(result.error);
                    else toast.success("Wysłaliśmy nową wiadomość. Sprawdź skrzynkę e-mail.");
                  }}
                >
                  Wyślij wiadomość potwierdzającą ponownie
                </button>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-8">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Twój kierunek
              </span>
              <h2 className="mt-1 text-2xl font-semibold">
                Jak chcesz się czuć na boisku?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                To Twój punkt startu. Nie zmienia obciążeń — pomaga nazwać, po
                co trenujesz.
              </p>
            </div>

            <section className="space-y-3">
              <Label>Jak czujesz się teraz na boisku?</Label>
              <p className="text-xs text-muted-foreground">
                Wybierz 1–2 odpowiedzi.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {CURRENT_PITCH_FEELINGS.map((id) => {
                  const active = currentFeelings.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCurrentFeeling(id)}
                      aria-pressed={active}
                      className={`rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      {CURRENT_PITCH_FEELING_LABELS[id]}
                    </button>
                  );
                })}
              </div>
              {showErrors && currentFeelings.length === 0 && (
                <p data-error="true" className="text-xs font-medium text-destructive">
                  Wybierz przynajmniej jedną odpowiedź.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <Label>Jak chcesz się czuć na boisku?</Label>
              <p className="text-xs text-muted-foreground">
                Wybierz 1–2 odpowiedzi.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {DESIRED_PITCH_FEELINGS.map((id) => {
                  const active = desiredFeelings.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleDesiredFeeling(id)}
                      aria-pressed={active}
                      className={`rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      {DESIRED_PITCH_FEELING_LABELS[id]}
                    </button>
                  );
                })}
              </div>
              {showErrors && desiredFeelings.length === 0 && (
                <p data-error="true" className="text-xs font-medium text-destructive">
                  Wybierz przynajmniej jedną odpowiedź.
                </p>
              )}
            </section>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Punkt startu
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
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

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Twój kierunek
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
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

              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Twój plan będzie prowadził Cię w tym kierunku — zgodnie z celem,
                kalendarzem i aktualną gotowością.
              </p>
            </div>
          </div>
        )}

        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Zgody i prywatność</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Zanim zaczniemy, potrzebujemy Twoich zgód (RODO).
              </p>
            </div>

            <div className="rounded-xl border border-accent bg-accent/30 p-3.5 text-xs leading-relaxed text-muted-foreground">
              {MEDICAL_DISCLAIMER}
            </div>

            <div className="space-y-2">
              {CONSENTS.map((c) => (
                <label
                  key={c.type}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <Checkbox
                    checked={!!consents[c.type]}
                    onCheckedChange={(v) =>
                      setConsents((prev) => ({ ...prev, [c.type]: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-snug">
                    {c.type === "terms" ? (
                      <Link to="/terms" onClick={(event) => event.stopPropagation()} className="font-medium underline underline-offset-2">
                        {c.title}
                      </Link>
                    ) : c.type === "privacy" ? (
                      <Link to="/privacy-policy" onClick={(event) => event.stopPropagation()} className="font-medium underline underline-offset-2">
                        {c.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.title}</span>
                    )}
                    {c.required && (
                      <span className="text-destructive"> *</span>
                    )}
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {c.text}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Pełne dokumenty:{" "}
              <Link to="/terms" className="underline">
                Regulamin
              </Link>{" "}
              ·{" "}
              <Link to="/privacy-policy" className="underline">
                Polityka prywatności
              </Link>
              . Pola oznaczone * są wymagane.
            </p>
          </div>
        )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/95 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur">
        {step < totalSteps - 1 ? (
          <Button className="w-full" size="lg" onClick={goNext}>
            Dalej
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={busy}
            onClick={() => {
              setTriedNext(true);
              setShowErrors(true);
              handleSubmit();
            }}
          >
            {busy ? "Zapisuję…" : "Zapisz i wygeneruj plan"}
          </Button>
        )}
      </div>
    </div>
  );
}
