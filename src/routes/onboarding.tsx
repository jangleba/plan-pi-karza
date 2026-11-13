import { PROFILE_SAVE_LABELS } from "@/lib/loadwise/profileSave";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  CompetitionLevel,
  SecondaryLimiter,
  DoubleSessions,
} from "@/lib/loadwise/types";
import { ISO_DAY_LABELS, SEASON_PHASE_LABELS, localToday } from "@/lib/loadwise/labels";
import { CONSENTS, MEDICAL_DISCLAIMER } from "@/lib/loadwise/legal";
import {
  accountSetupIsAllowed,
  ageOnDate,
  birthDateForApproximateAge,
  policyForAge,
  type AccountOwnerType,
} from "@/lib/loadwise/agePolicy";
import { OWN_EQUIPMENT_OPTIONS } from "@/lib/loadwise/equipmentOptions";
import { healthFieldsForOnboarding } from "@/lib/loadwise/onboardingHealth";
import {
  answersFromProfile,
  cleanUnavailableDays,
  doubleSessionOptions,
  isoWeekday,
  toggleFeeling,
  seasonCheck,
  suggestedSeasonPhase,
  trainingFieldsFromAnswers,
  type OnboardingAnswers,
} from "@/lib/loadwise/onboardingFlow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Chips,
  DayPicker,
  Field,
  Group,
  InfoRow,
  Rows,
  Segmented,
  StepTitle,
  SubLabel,
  SwitchRow,
} from "@/components/onboarding/OnboardingControls";
import {
  CURRENT_FEELING_SHORT,
  DESIRED_FEELING_SHORT,
  MAX_PITCH_FEELINGS,
  ONBOARDING_CURRENT_BODY,
  ONBOARDING_CURRENT_MIND,
  ONBOARDING_DESIRED_BODY,
  ONBOARDING_DESIRED_MIND,
} from "@/lib/loadwise/playerDirection";
import {
  Activity,
  Brain,
  CalendarDays,
  ChevronLeft,
  Dumbbell,
  Gauge,
  Layers,
  ListChecks,
  MapPin,
  Repeat,
  Shirt,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Trophy,
  UserRound,
} from "lucide-react";
import { addDays, format } from "date-fns";
import { pl } from "date-fns/locale";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } => ({
    edit: search.edit === true || search.edit === "true" || search.edit === "1",
  }),
  component: Onboarding,
});

type StepId =
  "consents" | "athlete" | "guardian" | "direction" | "goal" | "calendar" | "conditions";

const STEP_NAME: Record<StepId, string> = {
  consents: "Start",
  athlete: "Zawodnik",
  guardian: "Opiekun",
  direction: "Ty na boisku",
  goal: "Cel",
  calendar: "Kalendarz",
  conditions: "Warunki",
};

const POSITION_OPTIONS: Array<{ id: Position; title: string }> = [
  { id: "goalkeeper", title: "Bramkarz" },
  { id: "defender", title: "Obrońca" },
  { id: "midfielder", title: "Pomocnik" },
  { id: "forward", title: "Napastnik" },
];

const LEVEL_OPTIONS: Array<{ id: Level; title: string }> = [
  { id: "beginner", title: "Podstawy" },
  { id: "intermediate", title: "Regularnie" },
  { id: "advanced", title: "Zaawans." },
  { id: "elite", title: "Wysoki" },
];

const LEVEL_DETAIL: Record<Level, string> = {
  beginner: "Uczysz się podstaw siłowni i sprintu.",
  intermediate: "Trenujesz regularnie, znasz podstawowe ćwiczenia.",
  advanced: "Znasz trening siły i szybkości z obciążeniem.",
  elite: "Grasz i trenujesz na wysokim poziomie.",
};

const LEAGUE_OPTIONS: Array<{ id: CompetitionLevel; title: string }> = [
  { id: "academy", title: "Akademia" },
  { id: "b_klasa", title: "B klasa" },
  { id: "a_klasa", title: "A klasa" },
  { id: "okregowka", title: "Okręgówka" },
  { id: "iv_liga", title: "IV liga" },
  { id: "iii_liga", title: "III liga" },
  { id: "ii_liga_plus", title: "II liga i wyżej" },
  { id: "semi_pro", title: "Półprofesjonalnie" },
  { id: "pro", title: "Profesjonalnie" },
];

const GOAL_OPTIONS: Array<{ id: Goal; title: string }> = [
  { id: "speed", title: "Szybkość" },
  { id: "strength", title: "Siła" },
  { id: "power", title: "Moc" },
  { id: "endurance", title: "Wytrzymałość" },
  { id: "agility", title: "Zwrotność" },
  { id: "general", title: "Gra z piłką" },
  { id: "matchready", title: "Forma na mecz" },
  { id: "mobility", title: "Mobilność" },
  { id: "return", title: "Powrót" },
];

const GOAL_DETAIL: Record<Goal, string> = {
  speed: "Akcent na przyspieszenie i siłę nóg, dopasowany do przygotowania, miejsca i kalendarza.",
  strength:
    "Priorytet siły. Ciężar dobierasz do techniki i zapasu powtórzeń; propozycje zmian wynikają z wykonanych sesji.",
  power: "Siła i dopasowane elementy mocy, np. skoki albo rzuty.",
  endurance:
    "Dwie sesje wytrzymałości: spokojny bieg, a przy odpowiednim przygotowaniu i aktualnym teście także interwały.",
  agility: "Przygotowanie siłowe i szybkościowe wspierające zwrotność.",
  general: "Siła, sprint, bieg i własna praca z piłką dopasowane do warunków.",
  matchready: "Plan podporządkowany meczom: ograniczanie obciążenia i lekka aktywacja przed grą.",
  mobility: "Akcent na mobilność i stabilizację w połączeniu z pozostałym przygotowaniem.",
  return:
    "Lżejsze wejście po przerwie. Powrót po urazie wymaga osobnej oceny i nie jest układany automatycznie.",
};

const LIMITER_OPTIONS: Array<{ id: SecondaryLimiter; title: string }> = [
  { id: "speed", title: "Szybkość" },
  { id: "strength", title: "Siła" },
  { id: "power", title: "Moc" },
  { id: "endurance", title: "Wytrzymałość" },
  { id: "cod", title: "Zwrotność" },
  { id: "ball", title: "Gra z piłką" },
  { id: "fatigue", title: "Zmęczenie" },
  { id: "return", title: "Powrót" },
];

const feelingOptions = <T extends string>(ids: readonly T[], labels: Record<T, string>) =>
  ids.map((id) => ({ id, title: labels[id] }));

const FEELING_NOW_BODY = feelingOptions(ONBOARDING_CURRENT_BODY, CURRENT_FEELING_SHORT);
const FEELING_NOW_MIND = feelingOptions(ONBOARDING_CURRENT_MIND, CURRENT_FEELING_SHORT);
const FEELING_WANT_BODY = feelingOptions(ONBOARDING_DESIRED_BODY, DESIRED_FEELING_SHORT);
const FEELING_WANT_MIND = feelingOptions(ONBOARDING_DESIRED_MIND, DESIRED_FEELING_SHORT);

const SEASON_OPTIONS: Array<{ id: SeasonPhase; title: string }> = [
  { id: "inseason", title: "Sezon" },
  { id: "preseason", title: "Przygot." },
  { id: "offseason", title: "Przerwa" },
  { id: "transition", title: "Roztren." },
];

const DOUBLE_OPTIONS: Record<DoubleSessions, string> = {
  no: "Jedna",
  light_only: "+ lekka",
  yes_if_safe: "Dwie",
};

const DOUBLE_DETAIL: Record<DoubleSessions, string> = {
  no: "Nigdy dwóch treningów tego samego dnia.",
  light_only: "Druga sesja tylko lekka, np. mobilność.",
  yes_if_safe: "Pełna druga sesja, gdy obciążenie na to pozwala.",
};

const EQUIPMENT_LABEL: Record<string, string> = {
  "Bramka lub mini-bramka": "Bramka",
  "Skrzynia plyometryczna": "Skrzynia",
};

const STEP_ERROR: Partial<Record<StepId, string>> = {
  consents: "Zaznacz wymagane zgody (*).",
  athlete: "Uzupełnij imię, datę urodzenia, pozycję, poziom i ligę.",
  guardian: "Uzupełnij dane opiekuna i potwierdź oświadczenie.",
  direction: "Wybierz po jednej odpowiedzi w obu pytaniach.",
  goal: "Wybierz cel i to, co Cię ogranicza.",
  calendar: "Wybierz datę meczu albo „Brak meczu” i sprawdź okres.",
};

/**
 * After a failed save the athlete returns to this form with the answers kept in
 * the profile. The consents given and the place in the flow are kept here, so
 * a retry opens on the last step with the save button.
 */
let pendingRetry: { userId: string; consents: Record<string, boolean> } | null = null;

function Onboarding() {
  const { state, hydrated, completeOnboarding, profileSaveStage } = useLoadwise();
  const { user, loading, resendSignupConfirmation } = useAuth();
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const existing = state.profile;
  const isEditing = Boolean(edit && existing?.onboardingComplete);
  const [busy, setBusy] = useState(false);
  const submitBusy = useRef(false);

  // Require auth.
  useEffect(() => {
    if (loading || !hydrated) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (state.profile?.onboardingComplete && !edit && !busy) {
      navigate({ to: "/start", replace: true });
    }
  }, [loading, hydrated, user, state.profile?.onboardingComplete, edit, navigate, busy]);

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
  const [consent, setConsent] = useState(existing?.guardianConsent ?? false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => answersFromProfile(existing));
  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  // Legal consents (RODO/GDPR).
  const retry =
    pendingRetry &&
    user &&
    pendingRetry.userId === user.id &&
    existing &&
    !existing.onboardingComplete
      ? pendingRetry
      : null;
  const [consents, setConsents] = useState<Record<string, boolean>>(
    () =>
      retry?.consents ?? {
        health_data: existing?.healthPersonalizationEnabled === true,
      },
  );
  const [openConsent, setOpenConsent] = useState<string | null>(null);
  const requiredConsentsOk = CONSENTS.filter((c) => c.required).every((c) => consents[c.type]);

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

  const steps = useMemo<StepId[]>(
    () => [
      "consents",
      "athlete",
      ...(accountOwnerType === "guardian" ? (["guardian"] as const) : []),
      "direction",
      "goal",
      "calendar",
      "conditions",
    ],
    [accountOwnerType],
  );
  const [index, setIndex] = useState(() => (retry ? steps.length - 1 : 0));
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [showError, setShowError] = useState(false);
  const stepId = steps[Math.min(index, steps.length - 1)];

  // Local calendar day: a UTC date would allow yesterday after midnight in Poland.
  const today = localToday();
  const season = seasonCheck(answers, today);
  const seasonBlocks = !answers.seasonPhaseOverride && season.status === "invalid";

  function stepValid(id: StepId): boolean {
    switch (id) {
      case "consents":
        return requiredConsentsOk;
      case "athlete":
        return (
          name.trim().length > 0 &&
          answers.position !== null &&
          answers.level !== null &&
          answers.competitionLevel !== null &&
          ageNum != null &&
          ageNum >= 13 &&
          ageNum <= 80 &&
          (!agePolicy?.guardianMustOwnAccount || accountOwnerType === "guardian")
        );
      case "guardian":
        return guardianName.trim().length >= 2 && consent && guardianEmailVerified;
      case "direction":
        return answers.currentFeelings.length > 0 && answers.desiredFeelings.length > 0;
      case "goal":
        return answers.goal !== null && answers.secondaryLimiter !== null;
      case "calendar":
        return (
          (answers.noMatch || answers.matchDate.length > 0) &&
          answers.seasonPhase !== null &&
          !seasonBlocks
        );
      default:
        return true;
    }
  }

  function goTo(next: number) {
    setDir(next < index ? "back" : "forward");
    setShowError(false);
    setIndex(Math.max(0, Math.min(next, steps.length - 1)));
  }

  function goNext() {
    if (!stepValid(stepId)) {
      setShowError(true);
      return;
    }
    goTo(index + 1);
  }

  function pick<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) {
    set(key, value);
    setShowError(false);
  }

  // The season question starts on what the calendar and the next match point to.
  useEffect(() => {
    if (stepId === "calendar" && answers.seasonPhase === null)
      set("seasonPhase", suggestedSeasonPhase(answers, today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  function buildProfile(): Profile | null {
    if (ageNum == null || ageNum < 13) return null;
    let training;
    try {
      training = trainingFieldsFromAnswers(answers, existing, today);
    } catch {
      return null;
    }
    return {
      ...existing,
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
      fuelAllergyStatus: "unconfirmed",
      foodAllergies: [],
      foodIntolerances: [],
      foodExclusions: [],
      ...training,
      // General answers do not clear previously reported pain while health consent remains active.
      ...healthFieldsForOnboarding(existing, Boolean(consents.health_data)),
      guardianConsent: isGuardianChild ? consent : accountOwnerType === "guardian" ? consent : true,
      onboardingComplete: true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  }

  async function handleSubmit() {
    if (submitBusy.current) return;
    const firstInvalid = steps.findIndex((id) => !stepValid(id));
    if (firstInvalid >= 0) {
      toast.error(STEP_ERROR[steps[firstInvalid]] ?? "Uzupełnij wymagane pola.");
      goTo(firstInvalid);
      setShowError(true);
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
    const profile = buildProfile();
    if (!profile) {
      toast.error("Uzupełnij wymagane pola.");
      return;
    }
    submitBusy.current = true;
    setBusy(true);
    try {
      pendingRetry = { userId: user!.id, consents };
      // Keep the answers and consents available if the profile write needs a retry.
      await completeOnboarding(profile, consents);
      // Plan shows a preview; activating it requires a separate, explicit save.
      if (isEditing) toast.success("Profil zaktualizowany.");
      navigate({ to: isEditing ? "/profil" : "/plan", replace: true });
    } catch (error) {
      console.error("[onboarding] save failed", error);
      const raw = error instanceof Error ? error.message : "Nieznany błąd";
      const message =
        raw
          .replace(/^\[[^\]]+\]\s*/, "")
          .split(" | ")[0]
          ?.trim() || "Nieznany błąd";
      toast.error(`Nie udało się zapisać. ${message}`);
    } finally {
      submitBusy.current = false;
      setBusy(false);
    }
  }

  if (loading || !hydrated || !user) {
    return <AppLaunchScreen />;
  }

  const stripDays = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const stripIsos = stripDays.map((d) => format(d, "yyyy-MM-dd"));
  const matchOutsideStrip =
    !answers.noMatch && answers.matchDate !== "" && !stripIsos.includes(answers.matchDate);
  const matchDayName = answers.matchDate
    ? ISO_DAY_LABELS.find((d) => d.value === isoWeekday(answers.matchDate))?.label.toLowerCase()
    : null;
  const toggleList = <T extends string>(list: readonly T[], id: T): T[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const body = (() => {
    switch (stepId) {
      case "consents":
        return (
          <>
            <div className="ob-brand">
              <span className="ob-brand__word">
                BallWise<span aria-hidden="true">.</span>
              </span>
              <span className="ob-brand__tag">TWÓJ PLAN. TWOJA GRA.</span>
            </div>
            <StepTitle
              title="Ustawienia planu"
              sub="Kilka krótkich sekcji. Z odpowiedzi powstaje plan na pełne tygodnie, Pn–Nd."
            />
            <Group icon={ListChecks} label="Co ustawisz">
              <Rows>
                <InfoRow icon={UserRound} title="Zawodnik" detail="Wiek, pozycja, poziom, liga" />
                <InfoRow
                  icon={Brain}
                  title="Ty na boisku"
                  detail="Jak się czujesz teraz i jak chcesz się czuć"
                />
                <InfoRow icon={Target} title="Cel" detail="Co rozwijasz i co Cię ogranicza" />
                <InfoRow
                  icon={CalendarDays}
                  title="Kalendarz i warunki"
                  detail="Klub, mecz, okres, miejsce i sprzęt"
                />
              </Rows>
            </Group>
            <Group icon={ShieldCheck} label="Zgody" aside="* wymagane">
              <Rows>
                {CONSENTS.map((c) => {
                  const open = openConsent === c.type;
                  return (
                    <label key={c.type} className="ob-consent">
                      <Checkbox
                        checked={!!consents[c.type]}
                        onCheckedChange={(v) =>
                          setConsents((prev) => ({ ...prev, [c.type]: v === true }))
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1">
                            {c.type === "terms" ? (
                              <Link
                                to="/terms"
                                onClick={(e) => e.stopPropagation()}
                                className="underline underline-offset-2"
                              >
                                Regulamin
                              </Link>
                            ) : c.type === "privacy" ? (
                              <Link
                                to="/privacy-policy"
                                onClick={(e) => e.stopPropagation()}
                                className="underline underline-offset-2"
                              >
                                {c.title}
                              </Link>
                            ) : c.type === "health_data" ? (
                              "Personalizacja (dane o zdrowiu)"
                            ) : (
                              c.title.replace(/\s*\((opcjonalna|opcjonalne)\)/, "")
                            )}
                            {c.required && <span className="text-destructive"> *</span>}
                          </span>
                          <button
                            type="button"
                            className="ob-link shrink-0 text-xs"
                            aria-expanded={open}
                            onClick={(e) => {
                              e.preventDefault();
                              setOpenConsent(open ? null : c.type);
                            }}
                          >
                            {open ? "Zwiń" : "Treść"}
                          </button>
                        </span>
                        {open && (
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                            {c.text}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </Rows>
            </Group>
            <button
              type="button"
              className="ob-note block w-full px-1 text-left"
              aria-expanded={openConsent === "medical"}
              onClick={() => setOpenConsent(openConsent === "medical" ? null : "medical")}
            >
              <span className={openConsent === "medical" ? "block" : "line-clamp-2"}>
                {MEDICAL_DISCLAIMER}
              </span>
            </button>
          </>
        );
      case "athlete":
        return (
          <>
            <StepTitle
              title="Zawodnik"
              sub="Wiek ustala bezpieczne obciążenia i progi 13, 16 i 18 lat."
              sketch="play"
            />
            <Group icon={UserRound} label="Dane">
              <div className="ob-fields">
                <div className="ob-field--wide">
                  <Field label="Imię" htmlFor="name">
                    <input
                      id="name"
                      className="ob-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Imię zawodnika"
                      autoComplete="given-name"
                    />
                  </Field>
                </div>
                <Field
                  label="Data urodzenia"
                  htmlFor="birth-date"
                  detail={ageNum != null && ageNum >= 13 ? `${ageNum} lat` : undefined}
                >
                  <input
                    id="birth-date"
                    type="date"
                    className="ob-input"
                    min={birthDateForApproximateAge(80)}
                    max={birthDateForApproximateAge(13)}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </Field>
                <Field label="Liga" htmlFor="league">
                  <select
                    id="league"
                    className="ob-input"
                    value={answers.competitionLevel ?? ""}
                    onChange={(e) => pick("competitionLevel", e.target.value as CompetitionLevel)}
                  >
                    <option value="" disabled>
                      Wybierz
                    </option>
                    {LEAGUE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Group>
            {birthDate !== "" && (ageNum == null || ageNum < 13) && (
              <p className="ob-warn">
                Konto jest dostępne od 13 lat. Młodszy zawodnik może użyć tylko demo bez zapisu
                danych.
              </p>
            )}
            {agePolicy?.guardianMustOwnAccount && accountOwnerType !== "guardian" && (
              <div className="ob-warn">
                Zawodnik 13–15 korzysta z konta rodzica lub opiekuna.
                <button
                  type="button"
                  className="ob-link mt-1 block"
                  onClick={() => setAccountOwnerType("guardian")}
                >
                  To konto należy do opiekuna
                </button>
              </div>
            )}
            <Group icon={Shirt} label="Pozycja">
              <Segmented
                label="Pozycja"
                options={POSITION_OPTIONS}
                value={answers.position}
                onPick={(v) => pick("position", v)}
              />
            </Group>
            <Group
              icon={Gauge}
              label="Doświadczenie treningowe"
              note={
                answers.level
                  ? LEVEL_DETAIL[answers.level]
                  : "Od tego zależą ćwiczenia z obciążeniem."
              }
            >
              <Segmented
                label="Doświadczenie treningowe"
                options={LEVEL_OPTIONS}
                value={answers.level}
                onPick={(v) => pick("level", v)}
              />
            </Group>
          </>
        );
      case "guardian":
        return (
          <>
            <StepTitle title="Opiekun konta" sub={`E-mail konta: ${user.email ?? "brak"}`} />
            <Group icon={ShieldCheck} label="Opiekun">
              <Field label="Imię opiekuna" htmlFor="guardian-name">
                <input
                  id="guardian-name"
                  className="ob-input"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Imię"
                  autoComplete="given-name"
                />
              </Field>
              <label className="ob-consent mt-2">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Jestem rodzicem lub opiekunem zawodnika i mogę prowadzić jego profil.
                  {isGuardianChild && <span className="text-destructive"> *</span>}
                </span>
              </label>
            </Group>
            {!guardianEmailVerified && (
              <div className="ob-warn">
                Najpierw potwierdź e-mail właściciela konta.
                <button
                  type="button"
                  className="ob-link mt-1 block"
                  onClick={async () => {
                    if (!user.email) return;
                    const result = await resendSignupConfirmation(user.email);
                    if (result.error) toast.error(result.error);
                    else toast.success("Wysłaliśmy nową wiadomość. Sprawdź skrzynkę e-mail.");
                  }}
                >
                  Wyślij wiadomość ponownie
                </button>
              </div>
            )}
          </>
        );
      case "direction":
        return (
          <>
            <StepTitle
              title="Ty na boisku"
              sub="Ciało i głowa. Wybierz do dwóch odpowiedzi w każdym pytaniu."
              sketch="pitch"
            />
            <Group
              icon={Activity}
              label="Jak czujesz się teraz"
              aside={`${answers.currentFeelings.length}/${MAX_PITCH_FEELINGS}`}
            >
              <SubLabel>Ciało</SubLabel>
              <Chips
                cols={2}
                label="Jak czujesz się teraz: ciało"
                options={FEELING_NOW_BODY}
                value={answers.currentFeelings}
                onPick={(id) => pick("currentFeelings", toggleFeeling(answers.currentFeelings, id))}
              />
              <SubLabel>Głowa</SubLabel>
              <Chips
                cols={2}
                label="Jak czujesz się teraz: głowa"
                options={FEELING_NOW_MIND}
                value={answers.currentFeelings}
                onPick={(id) => pick("currentFeelings", toggleFeeling(answers.currentFeelings, id))}
              />
            </Group>
            <Group
              icon={Sparkles}
              label="Jak chcesz się czuć"
              aside={`${answers.desiredFeelings.length}/${MAX_PITCH_FEELINGS}`}
              note="Pierwsza odpowiedź ustawia akcent planu."
            >
              <SubLabel>Ciało</SubLabel>
              <Chips
                cols={2}
                label="Jak chcesz się czuć: ciało"
                options={FEELING_WANT_BODY}
                value={answers.desiredFeelings}
                onPick={(id) => pick("desiredFeelings", toggleFeeling(answers.desiredFeelings, id))}
              />
              <SubLabel>Głowa</SubLabel>
              <Chips
                cols={2}
                label="Jak chcesz się czuć: głowa"
                options={FEELING_WANT_MIND}
                value={answers.desiredFeelings}
                onPick={(id) => pick("desiredFeelings", toggleFeeling(answers.desiredFeelings, id))}
              />
            </Group>
          </>
        );
      case "goal":
        return (
          <>
            <StepTitle
              title="Cel"
              sub="Cel prowadzi plan. Ograniczenie dodaje akcent, jeśli pozwalają czas i kalendarz."
              sketch="strength"
            />
            <Group
              icon={Target}
              label="Główny cel"
              note={answers.goal ? GOAL_DETAIL[answers.goal] : "Na tym opiera się cały tydzień."}
            >
              <Chips
                cols={3}
                label="Główny cel"
                options={GOAL_OPTIONS}
                value={answers.goal}
                onPick={(id) => pick("goal", id)}
              />
            </Group>
            <Group icon={TrendingDown} label="Co Cię najbardziej ogranicza">
              <Chips
                cols={3}
                label="Co Cię najbardziej ogranicza"
                options={LIMITER_OPTIONS}
                value={answers.secondaryLimiter}
                onPick={(id) => pick("secondaryLimiter", id)}
              />
            </Group>
          </>
        );
      case "calendar":
        return (
          <>
            <StepTitle
              title="Kalendarz"
              sub="Pozostałe dni BallWise rozplanuje sam."
              sketch="measure"
            />
            <Group icon={CalendarDays} label="Tydzień">
              <SubLabel>Treningi w klubie</SubLabel>
              <DayPicker
                label="Treningi w klubie"
                value={answers.clubDays}
                onToggle={(d) =>
                  setAnswers((prev) => {
                    const clubDays = prev.clubDays.includes(d)
                      ? prev.clubDays.filter((x) => x !== d)
                      : [...prev.clubDays, d].sort((a, b) => a - b);
                    return {
                      ...prev,
                      clubDays,
                      unavailableDays: cleanUnavailableDays(prev.unavailableDays, clubDays),
                    };
                  })
                }
              />
              <SubLabel>Dni bez treningu</SubLabel>
              <DayPicker
                label="Dni, w które nie możesz trenować"
                tone="off"
                value={answers.unavailableDays}
                disabledDays={answers.clubDays}
                onToggle={(d) =>
                  set(
                    "unavailableDays",
                    (answers.unavailableDays.includes(d)
                      ? answers.unavailableDays.filter((x) => x !== d)
                      : [...answers.unavailableDays, d]
                    ).sort((a, b) => a - b),
                  )
                }
              />
            </Group>
            <Group icon={Trophy} label="Najbliższy mecz">
              <div className="ob-dates" role="group" aria-label="Data meczu">
                {stripDays.slice(0, 7).map((d, i) => {
                  const iso = stripIsos[i];
                  const active = !answers.noMatch && answers.matchDate === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className="ob-date"
                      aria-pressed={active}
                      aria-label={format(d, "EEEE d MMMM", { locale: pl })}
                      onClick={() => {
                        setAnswers((prev) => ({ ...prev, matchDate: iso, noMatch: false }));
                        setShowError(false);
                      }}
                    >
                      <small>{i === 0 ? "dziś" : ISO_DAY_LABELS[isoWeekday(iso) - 1].short}</small>
                      <strong>{format(d, "d")}</strong>
                    </button>
                  );
                })}
              </div>
              <div className="ob-link-row">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="ob-chip flex-1"
                      aria-pressed={matchOutsideStrip}
                    >
                      <CalendarDays className="mr-1.5 inline h-4 w-4 align-[-3px]" />
                      {matchOutsideStrip
                        ? format(new Date(`${answers.matchDate}T00:00:00`), "EEE d MMM", {
                            locale: pl,
                          })
                        : "Inna data"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={pl}
                      selected={
                        answers.matchDate ? new Date(`${answers.matchDate}T00:00:00`) : undefined
                      }
                      onSelect={(d) => {
                        if (d) {
                          setAnswers((prev) => ({
                            ...prev,
                            matchDate: format(d, "yyyy-MM-dd"),
                            noMatch: false,
                          }));
                          setShowError(false);
                        }
                      }}
                      disabled={(d) => d < today}
                      initialFocus
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  className="ob-chip flex-1"
                  aria-pressed={answers.noMatch}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, noMatch: !prev.noMatch, matchDate: "" }));
                    setShowError(false);
                  }}
                >
                  Brak meczu
                </button>
              </div>
              <div className="mt-1">
                <SwitchRow
                  label="Mecz co tydzień"
                  detail={
                    matchDayName
                      ? `Zawsze w ${matchDayName === "niedziela" || matchDayName === "środa" || matchDayName === "sobota" ? matchDayName.replace(/a$/, "ę") : matchDayName}`
                      : "Wybierz datę meczu"
                  }
                  checked={!answers.noMatch && answers.matchDate !== "" && answers.weeklyMatches}
                  disabled={answers.noMatch || answers.matchDate === ""}
                  onChange={(v) => set("weeklyMatches", v)}
                />
              </div>
            </Group>
            <Group
              icon={Layers}
              label="Okres"
              note={
                answers.seasonPhase === "return_injury"
                  ? SEASON_PHASE_LABELS.return_injury
                  : undefined
              }
            >
              <Segmented
                label="Okres"
                options={SEASON_OPTIONS}
                value={answers.seasonPhase}
                onPick={(v) =>
                  setAnswers((prev) => ({ ...prev, seasonPhase: v, seasonPhaseOverride: false }))
                }
              />
              {answers.seasonPhase && seasonBlocks && (
                <div className="ob-warn mt-2">
                  Ten okres nie pasuje do daty meczu.
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {season.suggestion && (
                      <button
                        type="button"
                        className="ob-link"
                        onClick={() => pick("seasonPhase", season.suggestion!)}
                      >
                        Ustaw: {SEASON_PHASE_LABELS[season.suggestion]}
                      </button>
                    )}
                    <button
                      type="button"
                      className="ob-link"
                      onClick={() => set("seasonPhaseOverride", true)}
                    >
                      Mam nietypowy sezon
                    </button>
                  </span>
                </div>
              )}
            </Group>
          </>
        );
      case "conditions":
        return (
          <>
            <StepTitle
              title="Warunki"
              sub="Plan dobiera ćwiczenia do miejsca i sprzętu."
              sketch="track"
            />
            <Group icon={MapPin} label="Gdzie trenujesz">
              <Rows>
                <SwitchRow
                  label="Siłownia"
                  checked={answers.hasGym}
                  onChange={(v) => set("hasGym", v)}
                />
                <SwitchRow
                  label="Boisko"
                  checked={answers.hasPitch}
                  onChange={(v) => set("hasPitch", v)}
                />
                <SwitchRow
                  label="Prosta do sprintu"
                  detail="30 m z miejscem na hamowanie"
                  checked={answers.hasSprintSpace}
                  onChange={(v) => set("hasSprintSpace", v)}
                />
                <SwitchRow
                  label="Ściana do podań"
                  detail="albo odbojnik"
                  checked={answers.hasWall}
                  onChange={(v) => set("hasWall", v)}
                />
              </Rows>
            </Group>
            <Group
              icon={Dumbbell}
              label={answers.hasGym ? "Sprzęt poza siłownią" : "Własny sprzęt"}
            >
              <Chips
                label={answers.hasGym ? "Sprzęt poza siłownią" : "Własny sprzęt"}
                options={OWN_EQUIPMENT_OPTIONS.map((item) => ({
                  id: item,
                  title: EQUIPMENT_LABEL[item] ?? item,
                }))}
                value={answers.equipment as (typeof OWN_EQUIPMENT_OPTIONS)[number][]}
                onPick={(item) => set("equipment", toggleList(answers.equipment, item))}
              />
            </Group>
            <Group
              icon={Repeat}
              label="Treningi jednego dnia"
              note={DOUBLE_DETAIL[answers.doubleSessionsAllowed]}
            >
              <Segmented
                label="Treningi jednego dnia"
                options={doubleSessionOptions(answers.level).map((id) => ({
                  id,
                  title: DOUBLE_OPTIONS[id],
                }))}
                value={answers.doubleSessionsAllowed}
                onPick={(v) => pick("doubleSessionsAllowed", v)}
              />
            </Group>
          </>
        );
    }
  })();

  const isLast = index >= steps.length - 1;

  return (
    <div className="app-shell onboarding-premium ob">
      <div className="ob__top">
        <div className="ob__bar">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="ob__back"
              aria-label="Wstecz"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : (
            <span />
          )}
          <div className="ob__step">
            {STEP_NAME[stepId]} · {index + 1} z {steps.length}
          </div>
          <span />
        </div>
        <div
          className="ob__progress"
          role="progressbar"
          aria-label="Postęp"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          {steps.map((id, i) => (
            <span key={id} data-on={i <= index} />
          ))}
        </div>
      </div>
      <main className="ob__body">
        <div key={stepId} className="ob-step" data-dir={dir} data-step={stepId}>
          {body}
        </div>
      </main>
      <div className="ob__foot">
        <p className="ob__hint" aria-live="polite">
          {showError ? (STEP_ERROR[stepId] ?? "") : ""}
        </p>
        {isLast ? (
          <Button className="h-12 w-full" size="lg" disabled={busy} onClick={handleSubmit}>
            {busy
              ? profileSaveStage
                ? PROFILE_SAVE_LABELS[profileSaveStage]
                : "Przygotowuję zapis…"
              : "Zapisz"}
          </Button>
        ) : (
          <Button className="h-12 w-full" size="lg" onClick={goNext}>
            Dalej
          </Button>
        )}
      </div>
    </div>
  );
}
