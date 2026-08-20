import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import type {
  Profile,
  Position,
  Level,
  Goal,
  DoubleSessions,
  SeasonPhase,
  SeasonStage,
  CompetitionLevel,
  SecondaryLimiter,
} from "@/lib/loadwise/types";
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
import { validateSeason } from "@/lib/loadwise/seasonValidation";
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
  const { user, loading } = useAuth();
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

  const [name, setName] = useState(
    existing?.name ?? (user?.user_metadata?.full_name as string) ?? "",
  );
  const [age, setAge] = useState(existing ? String(existing.age) : "");
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
  const equipment: string[] = existing?.equipment ?? [];
  const [painInjury, setPainInjury] = useState(existing?.painInjury ?? false);
  const [doubleSessions, setDoubleSessions] = useState<DoubleSessions | null>(
    existing?.doubleSessionsAllowed ?? null,
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

  // Walidacja spójności stanu sezonu z kalendarzem i datą meczu.
  const seasonValidation = validateSeason({
    seasonPhase,
    seasonStage,
    nextMatchDate: matchDate || null,
    weeklyMatches,
    seasonPhaseOverride,
  });
  const seasonBlocksContinue =
    !seasonPhaseOverride && seasonValidation.status === "invalid";



  // Legal consents (RODO/GDPR).
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  const ageNum = parseInt(age, 10);
  const isMinor = ageNum >= 13 && ageNum <= 17;

  const totalSteps = 5;

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

  function canNext(): boolean {
    if (step === 0) return requiredConsentsOk;
    if (step === 1)
      return name.trim().length > 0 && ageNum >= 13 && ageNum <= 60;
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
      return doubleSessions !== null && matchDate.trim().length > 0;
    return true;
  }

  async function handleSubmit() {
    if (busy) return;
    if (!position || !level || !goal || !doubleSessions || !(ageNum >= 13)) {
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
    if (isMinor && !consent) {
      toast.error("Potrzebna jest zgoda rodzica/opiekuna.");
      return;
    }
    if (!requiredConsentsOk) {
      toast.error("Zaakceptuj wymagane zgody, aby kontynuować.");
      return;
    }
    if (!matchDate) {
      toast.error(
        "Podaj datę najbliższego meczu, żeby dobrze ustawić obciążenia.",
      );
      setTriedNext(true);
      setStep(4);
      return;
    }
    // Loadwise sam decyduje o dniach — dostępne są wszystkie dni poza niedostępnymi.
    const availableDays = [1, 2, 3, 4, 5, 6, 7].filter(
      (d) => !unavailableDays.includes(d),
    );
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      position,
      level,
      goal,
      secondaryLimiter,
      clubTrainingDays: clubDays,
      individualTrainingDays: availableDays,
      unavailableDays,
      usualMatchDay: null,
      matchDate: matchDate || null,
      equipment,
      painInjury,
      doubleSessionsAllowed: doubleSessions,
      guardianConsent: isMinor ? consent : true,
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
      seasonPhase,
      seasonStage: seasonStage,
      competitionLevel,
      weeklyMatches,
      seasonPhaseOverride,
      seasonValidationStatus: seasonPhaseOverride
        ? "override"
        : seasonValidation.status,
      hasGym,
      hasPitch,
      hasSprintSpace,
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
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
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
              <div className="text-xl font-semibold text-primary">Loadwise</div>
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
                Kilka podstawowych informacji o Tobie.
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
              <Label htmlFor="age">Wiek</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={13}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="np. 16"
              />
              {age !== "" && (ageNum < 13 || isNaN(ageNum)) && (
                <p className="text-xs text-destructive">
                  Aplikacja jest dla zawodników od 13 lat.
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
                Zaznacz stałe elementy tygodnia. Loadwise dopasuje do nich
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
                        (triedNext || matchDateTouched) && !matchDate
                          ? "border-destructive"
                          : "border-border"
                      }`}
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span
                        className={
                          matchDate ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {matchDate
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
                        if (d) setMatchDate(format(d, "yyyy-MM-dd"));
                      }}
                      disabled={(d) =>
                        d < new Date(`${todayStr}T00:00:00`)
                      }
                      initialFocus
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
                {(triedNext || matchDateTouched) && !matchDate && (
                  <p className="text-xs font-medium text-destructive">
                    Podaj datę najbliższego meczu, żeby dobrze ustawić
                    obciążenia.
                  </p>
                )}
              </div>

              {/* Dwa treningi dziennie */}
              <div className="space-y-2.5">
                <Label>Czy możesz trenować 2 razy jednego dnia?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "yes_if_safe", label: "Tak" },
                      { v: "no", label: "Nie" },
                    ] as { v: DoubleSessions; label: string }[]
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setDoubleSessions(o.v)}
                      className={`rounded-full border px-3 py-2.5 text-sm font-medium transition-colors ${
                        doubleSessions === o.v
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Np. siłownia rano i trening klubowy wieczorem. Loadwise nie
                  połączy dwóch ciężkich bodźców bez sensu.
                </p>
              </div>
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
              <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                <Checkbox
                  checked={painInjury}
                  onCheckedChange={(v) => setPainInjury(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Mam aktualnie ból lub uraz
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Dostosujemy plan i ograniczymy ryzykowne obciążenia.
                  </span>
                </span>
              </label>
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

            {isMinor && (
              <label className="flex items-start gap-3 rounded-xl border border-accent bg-accent/30 p-3.5">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Zgoda rodzica/opiekuna
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Mam zgodę rodzica lub opiekuna na korzystanie z aplikacji
                    (wymagane dla wieku 13–17).
                  </span>
                </span>
              </label>
            )}
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

            <div className="space-y-2.5">
              {CONSENTS.map((c) => (
                <label
                  key={c.type}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <Checkbox
                    checked={!!consents[c.type]}
                    onCheckedChange={(v) =>
                      setConsents((prev) => ({ ...prev, [c.type]: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    {c.title}
                    {c.required && (
                      <span className="text-destructive"> *</span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
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
