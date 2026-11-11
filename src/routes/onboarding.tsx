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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChoiceList,
  DayPicker,
  LevelBars,
  MultiChoiceList,
  OnboardingArt,
  Option,
  PositionGlyph,
  StepTitle,
  Toggle,
  type ArtKind,
} from "@/components/onboarding/OnboardingControls";
import {
  CURRENT_FEELING_SHORT,
  DESIRED_FEELING_SHORT,
  MAX_PITCH_FEELINGS,
  ONBOARDING_CURRENT_FEELINGS,
  ONBOARDING_DESIRED_FEELINGS,
} from "@/lib/loadwise/playerDirection";
import { addDays, format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Activity,
  BatteryLow,
  Brain,
  BrickWall,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  CircleSlash,
  Dumbbell,
  Feather,
  Flag,
  Flame,
  HeartPulse,
  Layers,
  LandPlot,
  Leaf,
  Rocket,
  RotateCcw,
  Shuffle,
  Snowflake,
  Waves,
  Sun,
  Sunrise,
  Target,
  Trophy,
  Volleyball,
  Wind,
  Zap,
} from "lucide-react";

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
  | "position"
  | "level"
  | "league"
  | "feelNow"
  | "feelWant"
  | "goal"
  | "limiter"
  | "week"
  | "match"
  | "season"
  | "conditions"
  | "equipment"
  | "doubles"
  | "summary";

const SECTION: Record<StepId, string> = {
  consents: "Start",
  athlete: "Zawodnik",
  guardian: "Zawodnik",
  position: "Twoja gra",
  level: "Twoja gra",
  league: "Twoja gra",
  feelNow: "Ty na boisku",
  feelWant: "Ty na boisku",
  goal: "Cel",
  limiter: "Cel",
  week: "Kalendarz",
  match: "Kalendarz",
  season: "Kalendarz",
  conditions: "Warunki",
  equipment: "Warunki",
  doubles: "Warunki",
  summary: "Twój plan",
};

/** Light colour and line drawing of each section. */
const SECTION_LOOK: Record<string, { tone: string; art: ArtKind }> = {
  Start: { tone: "blue", art: "pitch" },
  Zawodnik: { tone: "blue", art: "pitch" },
  "Twoja gra": { tone: "teal", art: "pitch" },
  "Ty na boisku": { tone: "violet", art: "pulse" },
  Cel: { tone: "amber", art: "track" },
  Kalendarz: { tone: "sky", art: "calendar" },
  Warunki: { tone: "green", art: "field" },
  "Twój plan": { tone: "blue", art: "pitch" },
};

const icon = (Icon: typeof Zap) => <Icon className="h-[18px] w-[18px]" />;

/** Single-choice steps go forward by themselves after a tap. */
const AUTO_ADVANCE: StepId[] = [
  "position",
  "level",
  "league",
  "goal",
  "limiter",
  "season",
  "doubles",
];

const POSITION_OPTIONS: Array<{ id: Position; title: string; glyph: React.ReactNode }> = [
  { id: "goalkeeper", title: "Bramkarz", glyph: <PositionGlyph position="goalkeeper" /> },
  { id: "defender", title: "Obrońca", glyph: <PositionGlyph position="defender" /> },
  { id: "midfielder", title: "Pomocnik", glyph: <PositionGlyph position="midfielder" /> },
  { id: "forward", title: "Napastnik", glyph: <PositionGlyph position="forward" /> },
];

const LEVEL_OPTIONS: Array<{ id: Level; title: string; desc: string; glyph: React.ReactNode }> = [
  {
    id: "beginner",
    title: "Początkujący",
    desc: "Uczę się podstaw treningu",
    glyph: <LevelBars level={1} />,
  },
  {
    id: "intermediate",
    title: "Średniozaawansowany",
    desc: "Trenuję regularnie",
    glyph: <LevelBars level={2} />,
  },
  {
    id: "advanced",
    title: "Zaawansowany",
    desc: "Znam trening siły i szybkości",
    glyph: <LevelBars level={3} />,
  },
  {
    id: "elite",
    title: "Wysoki poziom",
    desc: "Gram i trenuję bardzo intensywnie",
    glyph: <LevelBars level={4} />,
  },
];

const LEAGUE_OPTIONS: Array<{ id: CompetitionLevel; title: string }> = [
  { id: "academy", title: "Akademia" },
  { id: "b_klasa", title: "B klasa" },
  { id: "a_klasa", title: "A klasa" },
  { id: "okregowka", title: "Okręgówka" },
  { id: "iv_liga", title: "IV liga" },
  { id: "iii_liga", title: "III liga" },
  { id: "ii_liga_plus", title: "II liga +" },
  { id: "semi_pro", title: "Półprofi" },
  { id: "pro", title: "Profi" },
];

const GOAL_OPTIONS: Array<{ id: Goal; title: string; icon: React.ReactNode }> = [
  { id: "speed", title: "Szybkość", icon: icon(Zap) },
  { id: "strength", title: "Siła", icon: icon(Dumbbell) },
  { id: "endurance", title: "Wytrzymałość", icon: icon(HeartPulse) },
  { id: "power", title: "Moc", icon: icon(Flame) },
  { id: "agility", title: "Zwrotność", icon: icon(Shuffle) },
  { id: "general", title: "Gra z piłką", icon: icon(Volleyball) },
  { id: "mobility", title: "Mobilność", icon: icon(Waves) },
  { id: "matchready", title: "Forma na mecz", icon: icon(Trophy) },
  { id: "return", title: "Powrót po przerwie", icon: icon(RotateCcw) },
];

const LIMITER_OPTIONS: Array<{ id: SecondaryLimiter; title: string; icon: React.ReactNode }> = [
  { id: "speed", title: "Szybkość", icon: icon(Zap) },
  { id: "strength", title: "Siła", icon: icon(Dumbbell) },
  { id: "endurance", title: "Wytrzymałość", icon: icon(HeartPulse) },
  { id: "cod", title: "Zwrotność", icon: icon(Shuffle) },
  { id: "power", title: "Moc", icon: icon(Flame) },
  { id: "ball", title: "Gra z piłką", icon: icon(Volleyball) },
  { id: "fatigue", title: "Zmęczenie", icon: icon(BatteryLow) },
  { id: "return", title: "Powrót po przerwie", icon: icon(RotateCcw) },
];

const FEELING_NOW_ICONS: Record<string, React.ReactNode> = {
  lacking_speed: icon(Zap),
  lacking_duel_strength: icon(Dumbbell),
  fading_late_in_match: icon(BatteryLow),
  slow_to_turn: icon(Shuffle),
  feeling_stiff: icon(Waves),
  lacking_confidence: icon(Volleyball),
};

const FEELING_WANT_ICONS: Record<string, React.ReactNode> = {
  fast_and_light: icon(Feather),
  strong_in_duels: icon(Dumbbell),
  explosive_first_steps: icon(Rocket),
  agile_in_turns: icon(Shuffle),
  ready_full_match: icon(HeartPulse),
  loose_in_movement: icon(Wind),
  confident_in_decisions: icon(Brain),
};

const FEELING_NOW_OPTIONS = ONBOARDING_CURRENT_FEELINGS.map((id) => ({
  id,
  title: CURRENT_FEELING_SHORT[id] ?? id,
  icon: FEELING_NOW_ICONS[id],
}));

const FEELING_WANT_OPTIONS = ONBOARDING_DESIRED_FEELINGS.map((id) => ({
  id,
  title: DESIRED_FEELING_SHORT[id] ?? id,
  icon: FEELING_WANT_ICONS[id],
}));

const SEASON_OPTIONS: Array<{
  id: SeasonPhase;
  title: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  { id: "inseason", title: "W sezonie", desc: "Gram mecze ligowe", icon: icon(Sun) },
  { id: "preseason", title: "Przygotowania", desc: "Okres przed rundą", icon: icon(Sunrise) },
  { id: "offseason", title: "Przerwa", desc: "Po sezonie, bez meczów", icon: icon(Snowflake) },
  { id: "transition", title: "Roztrenowanie", desc: "Lżejszy okres po rundzie", icon: icon(Leaf) },
  {
    id: "return_injury",
    title: "Powrót po przerwie",
    desc: "Wracam po dłuższej przerwie",
    icon: icon(RotateCcw),
  },
];

const DOUBLE_OPTIONS: Record<
  DoubleSessions,
  { title: string; desc: string; icon: React.ReactNode }
> = {
  no: {
    title: "Jedna sesja dziennie",
    desc: "Nigdy dwóch tego samego dnia",
    icon: icon(CircleSlash),
  },
  light_only: {
    title: "Druga tylko lekka",
    desc: "Np. mobilność albo spokojny bieg",
    icon: icon(Feather),
  },
  yes_if_safe: {
    title: "Dwie, gdy to bezpieczne",
    desc: "Pełna druga sesja w dobre dni",
    icon: icon(Layers),
  },
};

const FACT_ICONS: Record<string, React.ReactNode> = {
  week: <CalendarRange className="h-3.5 w-3.5" />,
  first: <Flag className="h-3.5 w-3.5" />,
  match: <Trophy className="h-3.5 w-3.5" />,
  strength: <Dumbbell className="h-3.5 w-3.5" />,
  focus: <Target className="h-3.5 w-3.5" />,
  direction: <Activity className="h-3.5 w-3.5" />,
  off: <CircleSlash className="h-3.5 w-3.5" />,
};

const STEP_ERROR: Partial<Record<StepId, string>> = {
  consents: "Zaznacz wymagane zgody (*).",
  athlete: "Podaj imię i datę urodzenia zawodnika.",
  guardian: "Uzupełnij dane opiekuna i potwierdź oświadczenie.",
  position: "Wybierz pozycję.",
  level: "Wybierz poziom.",
  league: "Wybierz poziom rozgrywkowy.",
  goal: "Wybierz główny cel.",
  limiter: "Wybierz, co Cię ogranicza.",
  feelNow: "Wybierz jedną albo dwie odpowiedzi.",
  feelWant: "Wybierz jedną albo dwie odpowiedzi.",
  match: "Wybierz datę meczu albo „Nie mam meczu”.",
  season: "Okres nie pasuje do kalendarza — popraw go.",
};

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
      "position",
      "level",
      "league",
      "feelNow",
      "feelWant",
      "goal",
      "limiter",
      "week",
      "match",
      "season",
      "conditions",
      "equipment",
      "doubles",
      "summary",
    ],
    [accountOwnerType],
  );
  const [index, setIndex] = useState(() => (retry ? steps.length - 1 : 0));
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [showError, setShowError] = useState(false);
  const stepId = steps[Math.min(index, steps.length - 1)];
  const advanceTimer = useRef<number | null>(null);

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
          ageNum != null &&
          ageNum >= 13 &&
          ageNum <= 80 &&
          (!agePolicy?.guardianMustOwnAccount || accountOwnerType === "guardian")
        );
      case "guardian":
        return guardianName.trim().length >= 2 && consent && guardianEmailVerified;
      case "position":
        return answers.position !== null;
      case "level":
        return answers.level !== null;
      case "league":
        return answers.competitionLevel !== null;
      case "goal":
        return answers.goal !== null;
      case "limiter":
        return answers.secondaryLimiter !== null;
      case "feelNow":
        return answers.currentFeelings.length > 0;
      case "feelWant":
        return answers.desiredFeelings.length > 0;
      case "match":
        return answers.noMatch || answers.matchDate.length > 0;
      case "season":
        return answers.seasonPhase !== null && !seasonBlocks;
      default:
        return true;
    }
  }

  function goTo(next: number) {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
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

  /** Records a single choice and moves on shortly after, so the selection is visible. */
  function pick<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) {
    set(key, value);
    setShowError(false);
    if (!AUTO_ADVANCE.includes(stepId)) return;
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const from = index;
    advanceTimer.current = window.setTimeout(() => {
      setDir("forward");
      setIndex((current) => (current === from ? from + 1 : current));
    }, 320);
  }

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  // The season question starts on what the calendar and the next match point to.
  useEffect(() => {
    if (stepId === "season" && answers.seasonPhase === null)
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
  useEffect(() => {
    if (stepId !== "summary") return;
    let alive = true;
    setFacts(null);
    const profile = buildProfile();
    if (!profile) return;
    generatePlanAsync(profile, today, 14)
      .then((plan) => alive && setFacts(onboardingPlanFacts(profile, plan)))
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
  const progress = ((index + 1) / steps.length) * 100;

  const body = (() => {
    switch (stepId) {
      case "consents":
        return (
          <>
            <StepTitle title="Zanim zaczniemy" sub="Zaznacz zgody (* wymagane)." />
            <div className="ob-gap ob-stagger">
              {CONSENTS.map((c, i) => {
                const open = openConsent === c.type;
                return (
                  <label key={c.type} className="ob-consent" style={{ ["--i" as string]: i }}>
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
                              className="font-medium underline underline-offset-2"
                            >
                              Regulamin
                            </Link>
                          ) : c.type === "privacy" ? (
                            <Link
                              to="/privacy-policy"
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium underline underline-offset-2"
                            >
                              {c.title}
                            </Link>
                          ) : (
                            <span className="font-medium">
                              {c.type === "health_data"
                                ? "Personalizacja (dane o zdrowiu)"
                                : c.title.replace(/\s*\((opcjonalna|opcjonalne)\)/, "")}
                            </span>
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
            </div>
            <button
              type="button"
              className="ob-note mt-3 block w-full text-left"
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
              title="Kto trenuje?"
              sub="Data urodzenia służy tylko progom wieku 13, 16 i 18 lat."
            />
            <div className="ob-gap space-y-4 ob-stagger">
              <div className="space-y-1.5">
                <Label htmlFor="name">Imię zawodnika</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Imię"
                  autoComplete="given-name"
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="birth-date">Data urodzenia</Label>
                <Input
                  id="birth-date"
                  type="date"
                  min={birthDateForApproximateAge(80)}
                  max={birthDateForApproximateAge(13)}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="h-12"
                />
              </div>
              {ageNum != null && ageNum >= 13 && (
                <span className="ob-chip">
                  <Check className="h-3.5 w-3.5 text-primary" /> {ageNum} lat
                </span>
              )}
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
            </div>
          </>
        );
      case "guardian":
        return (
          <>
            <StepTitle title="Opiekun konta" sub={`E-mail konta: ${user.email ?? "brak"}`} />
            <div className="ob-gap space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="guardian-name">Imię rodzica lub opiekuna</Label>
                <Input
                  id="guardian-name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Imię"
                  autoComplete="given-name"
                  className="h-12"
                />
              </div>
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
            </div>
          </>
        );
      case "position":
        return (
          <>
            <StepTitle title="Na jakiej pozycji grasz?" />
            <div className="ob-gap">
              <ChoiceList
                cols={2}
                variant="tile"
                options={POSITION_OPTIONS}
                value={answers.position}
                onPick={(v) => pick("position", v)}
              />
            </div>
          </>
        );
      case "level":
        return (
          <>
            <StepTitle title="Jak zaawansowany jest Twój trening?" />
            <div className="ob-gap">
              <ChoiceList
                options={LEVEL_OPTIONS}
                value={answers.level}
                onPick={(v) => pick("level", v)}
              />
            </div>
          </>
        );
      case "league":
        return (
          <>
            <StepTitle
              title="Na jakim poziomie grasz?"
              sub="Liga albo akademia, w której grasz teraz."
            />
            <div className="ob-gap">
              <ChoiceList
                cols={3}
                options={LEAGUE_OPTIONS}
                value={answers.competitionLevel}
                onPick={(v) => pick("competitionLevel", v)}
              />
            </div>
          </>
        );
      case "feelNow":
        return (
          <>
            <StepTitle title="Jak czujesz się teraz na boisku?" />
            <div className="ob-count">
              <b>{answers.currentFeelings.length}</b>/{MAX_PITCH_FEELINGS} · wybierz 1–2
            </div>
            <div className="ob-gap">
              <MultiChoiceList
                variant="compact"
                options={FEELING_NOW_OPTIONS}
                value={answers.currentFeelings}
                onToggle={(id) => {
                  set("currentFeelings", toggleFeeling(answers.currentFeelings, id));
                  setShowError(false);
                }}
              />
            </div>
          </>
        );
      case "feelWant":
        return (
          <>
            <StepTitle title="Jak chcesz się czuć na boisku?" />
            <div className="ob-count">
              <b>{answers.desiredFeelings.length}</b>/{MAX_PITCH_FEELINGS} · pierwsza odpowiedź
              ustawia akcent planu
            </div>
            <div className="ob-gap">
              <MultiChoiceList
                cols={2}
                variant="compact"
                options={FEELING_WANT_OPTIONS}
                value={answers.desiredFeelings}
                onToggle={(id) => {
                  set("desiredFeelings", toggleFeeling(answers.desiredFeelings, id));
                  setShowError(false);
                }}
              />
            </div>
          </>
        );
      case "goal":
        return (
          <>
            <StepTitle title="Co chcesz poprawić najbardziej?" sub="Jeden główny cel." />
            <div className="ob-gap">
              <ChoiceList
                cols={2}
                variant="compact"
                options={GOAL_OPTIONS}
                value={answers.goal}
                onPick={(v) => pick("goal", v)}
              />
            </div>
          </>
        );
      case "limiter":
        return (
          <>
            <StepTitle
              title="Co Cię teraz najbardziej ogranicza?"
              sub="Dodatkowy akcent obok celu."
            />
            <div className="ob-gap">
              <ChoiceList
                cols={2}
                variant="compact"
                options={LIMITER_OPTIONS}
                value={answers.secondaryLimiter}
                onPick={(v) => pick("secondaryLimiter", v)}
              />
            </div>
          </>
        );
      case "week":
        return (
          <>
            <StepTitle title="Twój tydzień" sub="Resztę dni BallWise ułoży sam." />
            <div className="ob-gap space-y-6 ob-stagger">
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
              <DayPicker
                label="Dni, w które nie możesz trenować"
                tone="off"
                value={answers.unavailableDays}
                disabledDays={answers.clubDays}
                onToggle={(d) =>
                  set(
                    "unavailableDays",
                    answers.unavailableDays.includes(d)
                      ? answers.unavailableDays.filter((x) => x !== d)
                      : [...answers.unavailableDays, d].sort((a, b) => a - b),
                  )
                }
              />
            </div>
          </>
        );
      case "match":
        return (
          <>
            <StepTitle title="Kiedy najbliższy mecz?" />
            <div className="ob-gap ob-dates ob-stagger" role="group" aria-label="Data meczu">
              {stripDays.map((d, i) => {
                const iso = stripIsos[i];
                const active = !answers.noMatch && answers.matchDate === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    className="ob-date"
                    aria-pressed={active}
                    aria-label={format(d, "EEEE d MMMM", { locale: pl })}
                    style={{ ["--i" as string]: i % 7 }}
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
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="ob-option ob-option--center gap-2"
                    aria-pressed={matchOutsideStrip}
                  >
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span className="ob-option__title">
                      {matchOutsideStrip
                        ? format(new Date(`${answers.matchDate}T00:00:00`), "d MMM", {
                            locale: pl,
                          })
                        : "Inna data"}
                    </span>
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
              <Option
                variant="center"
                title="Nie mam meczu"
                selected={answers.noMatch}
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, noMatch: !prev.noMatch, matchDate: "" }));
                  setShowError(false);
                }}
              />
            </div>
            <div className="mt-4">
              <Toggle
                label={matchDayName ? `Gram co tydzień (${matchDayName})` : "Gram mecz co tydzień"}
                checked={!answers.noMatch && answers.matchDate !== "" && answers.weeklyMatches}
                disabled={answers.noMatch || answers.matchDate === ""}
                onChange={(v) => set("weeklyMatches", v)}
              />
            </div>
          </>
        );
      case "season":
        return (
          <>
            <StepTitle title="Jaki masz teraz okres?" />
            <div className="ob-gap">
              <ChoiceList
                options={SEASON_OPTIONS}
                value={answers.seasonPhase}
                onPick={(v) => {
                  setAnswers((prev) => ({ ...prev, seasonPhaseOverride: false }));
                  const ok =
                    seasonCheck({ ...answers, seasonPhase: v, seasonPhaseOverride: false }, today)
                      .status !== "invalid";
                  if (ok) pick("seasonPhase", v);
                  else set("seasonPhase", v);
                }}
              />
            </div>
            {answers.seasonPhase && seasonBlocks && (
              <div className="ob-warn mt-3">
                Ten okres nie pasuje do daty i meczów.
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
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
                </div>
              </div>
            )}
          </>
        );
      case "conditions":
        return (
          <>
            <StepTitle title="Gdzie możesz trenować?" sub="Zaznacz wszystko, co masz." />
            <div className="ob-gap ob-grid ob-grid--2 ob-stagger">
              <Option
                index={0}
                variant="tile"
                icon={<Dumbbell className="h-4 w-4" />}
                title="Siłownia"
                selected={answers.hasGym}
                onClick={() => set("hasGym", !answers.hasGym)}
              />
              <Option
                index={1}
                variant="tile"
                icon={<LandPlot className="h-4 w-4" />}
                title="Boisko"
                selected={answers.hasPitch}
                onClick={() => set("hasPitch", !answers.hasPitch)}
              />
              <Option
                index={2}
                variant="tile"
                icon={<Zap className="h-4 w-4" />}
                title="Prosta do sprintu"
                desc="z miejscem na hamowanie"
                selected={answers.hasSprintSpace}
                onClick={() => set("hasSprintSpace", !answers.hasSprintSpace)}
              />
              <Option
                index={3}
                variant="tile"
                icon={<BrickWall className="h-4 w-4" />}
                title="Ściana do podań"
                desc="albo odbojnik"
                selected={answers.hasWall}
                onClick={() => set("hasWall", !answers.hasWall)}
              />
            </div>
          </>
        );
      case "equipment":
        return (
          <>
            <StepTitle
              title={answers.hasGym ? "Co masz poza siłownią?" : "Jaki masz sprzęt?"}
              sub="Możesz nic nie zaznaczać."
            />
            <div className="ob-gap ob-grid ob-grid--2 ob-stagger">
              {OWN_EQUIPMENT_OPTIONS.map((item, i) => (
                <Option
                  key={item}
                  index={i}
                  variant="center"
                  title={
                    item === "Bramka lub mini-bramka"
                      ? "Bramka"
                      : item === "Skrzynia plyometryczna"
                        ? "Skrzynia"
                        : item
                  }
                  selected={answers.equipment.includes(item)}
                  onClick={() =>
                    set(
                      "equipment",
                      answers.equipment.includes(item)
                        ? answers.equipment.filter((x) => x !== item)
                        : [...answers.equipment, item],
                    )
                  }
                />
              ))}
            </div>
          </>
        );
      case "doubles":
        return (
          <>
            <StepTitle title="Dwa treningi jednego dnia?" />
            <div className="ob-gap">
              <ChoiceList
                options={doubleSessionOptions(answers.level).map((id) => ({
                  id,
                  ...DOUBLE_OPTIONS[id],
                }))}
                value={answers.doubleSessionsAllowed}
                onPick={(v) => pick("doubleSessionsAllowed", v)}
              />
            </div>
          </>
        );
      case "summary":
        return (
          <>
            <StepTitle title="Co wynika z Twoich odpowiedzi" />
            <dl className="ob-facts" aria-busy={facts === null}>
              {facts === null
                ? Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="ob-fact" style={{ ["--i" as string]: i }}>
                      <dt>
                        <span className="ob-skeleton block w-16" />
                      </dt>
                      <dd className="flex-1">
                        <span className="ob-skeleton block w-3/4" />
                      </dd>
                    </div>
                  ))
                : facts.map((fact, i) => (
                    <div
                      key={fact.id}
                      className="ob-fact"
                      style={{ ["--i" as string]: i }}
                      data-fact={fact.id}
                    >
                      <dt>
                        <span className="ob-fact__icon" aria-hidden="true">
                          {FACT_ICONS[fact.id]}
                        </span>
                        {fact.label}
                      </dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
            </dl>
          </>
        );
    }
  })();

  const isLast = stepId === "summary";
  const look = SECTION_LOOK[SECTION[stepId]] ?? SECTION_LOOK.Start;
  const autoStep = AUTO_ADVANCE.includes(stepId);

  return (
    <div className="app-shell onboarding-premium ob" data-tone={look.tone}>
      <OnboardingArt key={look.art} kind={look.art} />
      <div className="ob__head">
        <div className="ob__bar">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="ob__back"
              aria-label="Wstecz"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="ob__brand">BallWise</div>
          )}
          <div className="ob__section">
            {index + 1}/{steps.length}
          </div>
        </div>
        <div
          className="ob__progress"
          role="progressbar"
          aria-label="Postęp"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <main className="ob__body">
        <div key={stepId} className="ob-step" data-dir={dir} data-step={stepId}>
          <div className="ob-kicker">{SECTION[stepId]}</div>
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
          <Button
            className="h-12 w-full"
            size="lg"
            variant={autoStep && !stepValid(stepId) ? "outline" : "default"}
            onClick={goNext}
          >
            Dalej
          </Button>
        )}
      </div>
    </div>
  );
}
