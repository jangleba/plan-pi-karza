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
import {
  answersFromProfile,
  cleanUnavailableDays,
  doubleSessionOptions,
  isoWeekday,
  onboardingPlanFacts,
  toggleFeeling,
  seasonCheck,
  suggestedSeasonPhase,
  trainingFieldsFromAnswers,
  type OnboardingAnswers,
  type PlanFact,
} from "@/lib/loadwise/onboardingFlow";
import { generatePlanAsync } from "@/lib/loadwise/generatePlanAsync";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Card,
  Chips,
  DayPicker,
  Group,
  Row,
  Segmented,
  StepTitle,
  SwitchRow,
} from "@/components/onboarding/OnboardingControls";
import {
  CURRENT_FEELING_SHORT,
  DESIRED_FEELING_SHORT,
  MAX_PITCH_FEELINGS,
  ONBOARDING_CURRENT_FEELINGS,
  ONBOARDING_DESIRED_FEELINGS,
} from "@/lib/loadwise/playerDirection";
import type { SessionDay } from "@/lib/loadwise/types";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { addDays, format } from "date-fns";
import { pl } from "date-fns/locale";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } => ({
    edit: search.edit === true || search.edit === "true" || search.edit === "1",
  }),
  component: Onboarding,
});

type StepId =
  | "consents"
  | "athlete"
  | "guardian"
  | "direction"
  | "goal"
  | "calendar"
  | "conditions"
  | "summary";

const STEP_NAME: Record<StepId, string> = {
  consents: "Start",
  athlete: "Zawodnik",
  guardian: "Opiekun",
  direction: "Ty na boisku",
  goal: "Cel",
  calendar: "Kalendarz",
  conditions: "Warunki",
  summary: "Plan",
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
  speed: "Co tydzień sprint: start, prędkość maksymalna albo bieg po łuku, plus siła nóg.",
  strength: "Dwie sesje siły w tygodniu, progresja ciężaru co blok.",
  power: "Siła z elementami eksplozywnymi: skoki, rzuty, szybkie powtórzenia.",
  endurance: "Dwie sesje wytrzymałości: tlen, interwały i bieg pozycyjny.",
  agility: "Hamowanie, zmiana kierunku i reakcja w sesji sprintu.",
  general: "Równo siła, sprint, bieg i własna praca z piłką.",
  matchready: "Świeżość na mecz: mniej objętości, więcej ostrości przed weekendem.",
  mobility: "Mobilność i stabilizacja jako główne jednostki tygodnia.",
  return: "Lżejsze wejście w trening, jedna zmiana obciążenia naraz.",
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

const FEELING_NOW_OPTIONS = ONBOARDING_CURRENT_FEELINGS.map((id) => ({
  id,
  title: CURRENT_FEELING_SHORT[id] ?? id,
}));

const FEELING_WANT_OPTIONS = ONBOARDING_DESIRED_FEELINGS.map((id) => ({
  id,
  title: DESIRED_FEELING_SHORT[id] ?? id,
}));

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

/** Short label of a plan day for the first-week preview. */
function weekCell(day: SessionDay): { kind: string; text: string } {
  if (day.dayType === "match") return { kind: "match", text: "Mecz" };
  if (day.dayType === "club") return { kind: "club", text: "Klub" };
  if (day.dayType === "rest" || day.durationMin === 0) return { kind: "rest", text: "Wolne" };
  if (day.dayType === "md-1") return { kind: "light", text: "Akty-wacja" };
  if (day.dayType === "recovery") return { kind: "light", text: "Regen." };
  const category = day.classification?.category;
  const text =
    category === "gym_strength"
      ? "Siła"
      : category === "speed_sprint"
        ? "Sprint"
        : category === "endurance_conditioning"
          ? "Bieg"
          : category === "other"
            ? "Piłka"
            : category === "mobility" || category === "recovery_prehab"
              ? "Mobil."
              : "Trening";
  return { kind: day.intensity === "niska" ? "light" : "training", text };
}

/**
 * After a failed save the athlete returns to this form with the answers kept in
 * the profile. The consents given and the place in the flow are kept here, so
 * a retry opens on the summary with the save button.
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
      "summary",
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
      // Onboarding nie zbiera danych o bólu ani urazach (dane wrażliwe, RODO art. 9).
      painInjury: false,
      painLocations: [],
      guardianConsent: isGuardianChild ? consent : accountOwnerType === "guardian" ? consent : true,
      onboardingComplete: true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  }

  // Summary: generate the first days of the plan from the answers and list the facts.
  const [facts, setFacts] = useState<PlanFact[] | null>(null);
  const [firstWeek, setFirstWeek] = useState<SessionDay[]>([]);
  useEffect(() => {
    if (stepId !== "summary") return;
    let alive = true;
    setFacts(null);
    const profile = buildProfile();
    if (!profile) return;
    generatePlanAsync(profile, today, 14)
      .then((plan) => {
        if (!alive) return;
        setFacts(onboardingPlanFacts(profile, plan));
        setFirstWeek(plan.slice(0, 7));
      })
      .catch(() => alive && setFacts([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  async function handleSubmit() {
    if (submitBusy.current) return;
    const firstInvalid = steps.findIndex((id) => !stepValid(id));
    if (firstInvalid >= 0 && steps[firstInvalid] !== "summary") {
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
      // Not cleared on return: a shown plan may still fail to save and bring the athlete back.
      await completeOnboarding(profile, consents);
      // A new plan is shown at once and saved in the background; only an edit is confirmed here.
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
            <StepTitle
              title="Plan treningowy pod Twój tydzień"
              sub="Kilka pytań o zawodnika, cel, kalendarz i warunki. Z odpowiedzi powstaje plan na najbliższe tygodnie."
            />
            <div className="ob-intro">
              <div>
                <strong>5</strong>
                <span>sekcji pytań</span>
              </div>
              <div>
                <strong>~2 min</strong>
                <span>wypełnienia</span>
              </div>
              <div>
                <strong>Pn–Nd</strong>
                <span>pełne tygodnie planu</span>
              </div>
            </div>
            <Group label="Zgody" aside="* wymagane">
              <Card>
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
                          <span className="min-w-0 flex-1 font-medium">
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
                            className="shrink-0 text-xs font-semibold text-primary"
                            aria-expanded={open}
                            onClick={(e) => {
                              e.preventDefault();
                              setOpenConsent(open ? null : c.type);
                            }}
                          >
                            {open ? "Zwiń" : "Treść"}
                          </button>
                        </span>
                        <span
                          className={`mt-0.5 text-xs leading-snug text-muted-foreground ${open ? "block" : "line-clamp-1"}`}
                        >
                          {c.text}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </Card>
              <button
                type="button"
                className="ob-note mt-2 block w-full px-1 text-left"
                aria-expanded={openConsent === "medical"}
                onClick={() => setOpenConsent(openConsent === "medical" ? null : "medical")}
              >
                <span className={openConsent === "medical" ? "block" : "line-clamp-2"}>
                  {MEDICAL_DISCLAIMER}
                </span>
              </button>
            </Group>
          </>
        );
      case "athlete":
        return (
          <>
            <StepTitle
              title="Zawodnik"
              sub="Wiek ustala bezpieczne obciążenia i progi 13, 16, 18 lat."
            />
            <Card>
              <Row label="Imię" htmlFor="name">
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Imię zawodnika"
                  autoComplete="given-name"
                />
              </Row>
              <Row
                label="Data urodzenia"
                htmlFor="birth-date"
                detail={ageNum != null && ageNum >= 13 ? `${ageNum} lat` : undefined}
              >
                <input
                  id="birth-date"
                  type="date"
                  min={birthDateForApproximateAge(80)}
                  max={birthDateForApproximateAge(13)}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </Row>
              <Row label="Poziom rozgrywek" htmlFor="league">
                <select
                  id="league"
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
              </Row>
            </Card>
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
            <Group label="Pozycja">
              <Segmented
                label="Pozycja"
                options={POSITION_OPTIONS}
                value={answers.position}
                onPick={(v) => pick("position", v)}
              />
            </Group>
            <Group
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
            <Card>
              <Row label="Imię opiekuna" htmlFor="guardian-name">
                <input
                  id="guardian-name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Imię"
                  autoComplete="given-name"
                />
              </Row>
              <label className="ob-consent">
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
            </Card>
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
              sub="Pierwsza odpowiedź w drugim pytaniu ustawia akcent planu."
            />
            <Group
              label="Jak czujesz się teraz"
              aside={`${answers.currentFeelings.length}/${MAX_PITCH_FEELINGS}`}
            >
              <Chips
                cols={2}
                options={FEELING_NOW_OPTIONS}
                value={answers.currentFeelings}
                onPick={(id) => pick("currentFeelings", toggleFeeling(answers.currentFeelings, id))}
              />
            </Group>
            <Group
              label="Jak chcesz się czuć"
              aside={`${answers.desiredFeelings.length}/${MAX_PITCH_FEELINGS}`}
            >
              <Chips
                cols={2}
                options={FEELING_WANT_OPTIONS}
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
              sub="Cel prowadzi plan. Ograniczenie dokłada jedną sesję w tygodniu."
            />
            <Group label="Główny cel" note={answers.goal ? GOAL_DETAIL[answers.goal] : undefined}>
              <Chips
                cols={3}
                options={GOAL_OPTIONS}
                value={answers.goal}
                onPick={(id) => pick("goal", id)}
              />
            </Group>
            <Group label="Co Cię najbardziej ogranicza">
              <Chips
                cols={3}
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
            <StepTitle title="Kalendarz" sub="Pozostałe dni BallWise rozplanuje sam." />
            <Group label="Treningi w klubie">
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
            </Group>
            <Group label="Dni bez treningu">
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
            <Group label="Najbliższy mecz">
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
            </Group>
            <Card>
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
            </Card>
            <Group
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
            <StepTitle title="Warunki" sub="Plan dobiera ćwiczenia do miejsca i sprzętu." />
            <Group label="Gdzie trenujesz">
              <Card>
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
              </Card>
            </Group>
            <Group label={answers.hasGym ? "Sprzęt poza siłownią" : "Własny sprzęt"}>
              <Chips
                options={OWN_EQUIPMENT_OPTIONS.map((item) => ({
                  id: item,
                  title: EQUIPMENT_LABEL[item] ?? item,
                }))}
                value={answers.equipment as (typeof OWN_EQUIPMENT_OPTIONS)[number][]}
                onPick={(item) => set("equipment", toggleList(answers.equipment, item))}
              />
            </Group>
            <Group
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
      case "summary":
        return (
          <>
            <StepTitle title="Twój plan" sub="Tak wygląda start planu z Twoich odpowiedzi." />
            <Group label="Pierwsze 7 dni">
              <Card>
                <div className="ob-week" aria-busy={facts === null}>
                  {(firstWeek.length ? firstWeek : Array.from({ length: 7 }, () => null)).map(
                    (day, i) => {
                      const cell = day ? weekCell(day) : null;
                      return (
                        <div key={day?.date ?? i}>
                          <small>
                            {day
                              ? ISO_DAY_LABELS[isoWeekday(day.date) - 1].short
                              : ISO_DAY_LABELS[(isoWeekday(stripIsos[i]) - 1) % 7].short}
                          </small>
                          {cell ? (
                            <b data-kind={cell.kind}>{cell.text.replace("-", "­")}</b>
                          ) : (
                            <b className="ob-skeleton" />
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </Card>
            </Group>
            <Group label="Co wynika z odpowiedzi">
              <Card>
                <dl aria-busy={facts === null}>
                  {facts === null
                    ? Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className="ob-fact">
                          <dt>
                            <span className="ob-skeleton block w-16" />
                          </dt>
                          <dd className="flex-1">
                            <span className="ob-skeleton block w-3/4" />
                          </dd>
                        </div>
                      ))
                    : facts.map((fact) => (
                        <div key={fact.id} className="ob-fact" data-fact={fact.id}>
                          <dt>{fact.label}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                </dl>
              </Card>
            </Group>
          </>
        );
    }
  })();

  const isLast = stepId === "summary";

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
              : "Zapisz i wygeneruj plan"}
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
