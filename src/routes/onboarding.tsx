import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, CalendarIcon } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
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
          className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
            value === o
              ? "border-primary bg-primary text-primary-foreground"
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
  const { state, completeOnboarding } = useLoadwise();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const existing = state.profile;
  const isEditing = !!existing?.onboardingComplete;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Require auth.
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

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
  const [individualDays, setIndividualDays] = useState<number[]>(
    existing?.individualTrainingDays ?? [],
  );
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

  const requiredConsentsOk = CONSENTS.filter((c) => c.required).every(
    (c) => consents[c.type],
  );

  function toggleClubDay(d: number) {
    setClubDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }
  function toggleIndividualDay(d: number) {
    setIndividualDays((prev) =>
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
      return (
        doubleSessions !== null &&
        individualDays.length > 0 &&
        matchDate.trim().length > 0
      );
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
    if (individualDays.length === 0) {
      toast.error("Wybierz co najmniej jeden dzień treningu indywidualnego.");
      setStep(4);
      return;
    }
    if (!matchDate) {
      toast.error("Podaj datę najbliższego meczu");
      setStep(4);
      return;
    }
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      position,
      level,
      goal,
      secondaryLimiter,
      clubTrainingDays: clubDays,
      individualTrainingDays: individualDays,
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
    } catch {
      toast.error("Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="app-shell min-h-screen pb-10">
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

      <div className="px-5 pt-6">
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
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Twoja gra</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pozycja i poziom treningowy.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Pozycja</Label>
              <ChoiceGrid
                options={positions}
                value={position}
                onChange={setPosition}
                labels={POSITION_LABELS}
              />
            </div>
            <div className="space-y-2">
              <Label>Poziom treningowy</Label>
              <ChoiceGrid
                options={levels}
                value={level}
                onChange={setLevel}
                labels={LEVEL_LABELS}
                cols={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Okres sezonu</Label>
              <ChoiceGrid
                options={seasonPhases}
                value={seasonPhase}
                onChange={(v) => {
                  setSeasonPhase(v);
                  setSeasonStage(null);
                  // Zmiana okresu = wyjście z trybu niestandardowego do ponownej walidacji.
                  setSeasonPhaseOverride(false);
                }}
                labels={SEASON_PHASE_LABELS}
                cols={1}
              />
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
            </div>

            {(seasonPhase === "inseason" || seasonPhase === "transition") && (
              <div className="space-y-2">
                <Label>Etap w sezonie</Label>
                <ChoiceGrid
                  options={seasonStages}
                  value={seasonStage}
                  onChange={setSeasonStage}
                  labels={SEASON_STAGE_LABELS}
                  cols={1}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Poziom rozgrywkowy</Label>
              <ChoiceGrid
                options={competitionLevels}
                value={competitionLevel}
                onChange={setCompetitionLevel}
                labels={COMPETITION_LEVEL_LABELS}
                cols={1}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Główny cel</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Wybierz jeden priorytet na najbliższy czas.
              </p>
            </div>
            <ChoiceGrid
              options={goals}
              value={goal}
              onChange={setGoal}
              labels={GOAL_LABELS}
            />

            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                Co najbardziej Cię ogranicza?
              </h2>
              <p className="text-sm text-muted-foreground">
                To dodatkowe wsparcie w planie — nie zastępuje celu głównego.
              </p>
              <ChoiceGrid
                options={limiters}
                value={secondaryLimiter}
                onChange={setSecondaryLimiter}
                labels={SECONDARY_LIMITER_LABELS}
              />
              {secondaryLimiter === null && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz, co najbardziej Cię ogranicza.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kalendarz tygodnia
              </span>
              <h2 className="mt-1 text-xl font-semibold">
                Twój tydzień treningowy
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Plan musi pasować do treningów klubowych, dni indywidualnych i
                meczu. Loadwise nie powinien dokładać sesji losowo.
              </p>
            </div>

            <div className="space-y-2">
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
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>W jakie dni chcesz trenować indywidualnie z Loadwise?</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {ISO_DAY_LABELS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleIndividualDay(d.value)}
                    className={`rounded-full border py-2 text-xs font-medium transition-colors ${
                      individualDays.includes(d.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                W te dni Loadwise może zaplanować Twoje własne jednostki:
                szybkość, siłę, boisko, regenerację albo technikę.
              </p>
              {individualDays.length === 0 && (
                <p className="text-xs font-medium text-destructive">
                  Wybierz co najmniej jeden dzień treningu indywidualnego.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="match">Data najbliższego meczu</Label>
              <Input
                id="match"
                type="date"
                min={todayStr}
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
              />
              {!matchDate && (
                <p className="text-xs font-medium text-destructive">
                  Podaj datę najbliższego meczu
                </p>
              )}
            </div>

            <div className="space-y-2">
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
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Czy grasz mecze co tydzień?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: true, label: "Tak, co tydzień" },
                  { v: false, label: "Nie / nieregularnie" },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setWeeklyMatches(o.v)}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      weeklyMatches === o.v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Warunki treningowe</Label>
              <div className="space-y-2">
                {(
                  [
                    { key: "gym", label: "Mam dostęp do siłowni", v: hasGym, set: setHasGym },
                    { key: "pitch", label: "Mam dostęp do boiska", v: hasPitch, set: setHasPitch },
                  ] as { key: string; label: string; v: boolean; set: (b: boolean) => void }[]
                ).map((o) => (
                  <label
                    key={o.key}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <Checkbox
                      checked={o.v}
                      onCheckedChange={(c) => o.set(c === true)}
                    />
                    <span className="text-sm">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>


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

      <div className="px-5 pt-8">
        {step < totalSteps - 1 ? (
          <Button
            className="w-full"
            size="lg"
            disabled={!canNext()}
            onClick={() => setStep((s) => s + 1)}
          >
            Dalej
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={
              busy ||
              (isMinor && !consent) ||
              !doubleSessions ||
              !requiredConsentsOk
            }
            onClick={handleSubmit}
          >
            {busy ? "Zapisuję…" : "Zapisz i wygeneruj plan"}
          </Button>
        )}
      </div>
    </div>
  );
}
