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
} from "@/lib/loadwise/types";
import {
  GOAL_LABELS,
  POSITION_LABELS,
  LEVEL_LABELS,
  ISO_DAY_LABELS,
  EQUIPMENT_OPTIONS,
  DOUBLE_SESSION_LABELS,
} from "@/lib/loadwise/labels";
import { CONSENTS, MEDICAL_DISCLAIMER } from "@/lib/loadwise/legal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

const positions: Position[] = ["goalkeeper", "defender", "midfielder", "forward"];
const levels: Level[] = ["beginner", "intermediate", "advanced"];
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
  const [clubDays, setClubDays] = useState<number[]>(
    existing?.clubTrainingDays ?? [],
  );
  const [matchDate, setMatchDate] = useState(existing?.matchDate ?? "");
  const [equipment, setEquipment] = useState<string[]>(
    existing?.equipment ?? [],
  );
  const [painInjury, setPainInjury] = useState(existing?.painInjury ?? false);
  const [doubleSessions, setDoubleSessions] = useState<DoubleSessions | null>(
    existing?.doubleSessionsAllowed ?? null,
  );
  const [consent, setConsent] = useState(existing?.guardianConsent ?? false);
  const [individualDays, setIndividualDays] = useState<number[]>(
    existing?.individualTrainingDays ?? [],
  );
  const [matchDayChoice, setMatchDayChoice] = useState<
    "sat" | "sun" | "other" | "none" | null
  >(
    existing
      ? existing.usualMatchDay === 6
        ? "sat"
        : existing.usualMatchDay === 7
          ? "sun"
          : existing.usualMatchDay === "no_fixed_day"
            ? "none"
            : existing.matchDate
              ? "other"
              : null
      : null,
  );

  function matchDayChoiceToValue(
    c: typeof matchDayChoice,
  ): number | "no_fixed_day" | null {
    if (c === "sat") return 6;
    if (c === "sun") return 7;
    if (c === "none") return "no_fixed_day";
    return null;
  }

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
  function toggleEquip(e: string) {
    setEquipment((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  }

  function canNext(): boolean {
    if (step === 0) return requiredConsentsOk;
    if (step === 1)
      return name.trim().length > 0 && ageNum >= 13 && ageNum <= 60;
    if (step === 2) return position !== null && level !== null;
    if (step === 3) return goal !== null;
    if (step === 4) return doubleSessions !== null && individualDays.length > 0;
    return true;
  }

  async function handleSubmit() {
    if (busy) return;
    if (!position || !level || !goal || !doubleSessions || !(ageNum >= 13)) {
      toast.error("Uzupełnij wymagane pola.");
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
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      position,
      level,
      goal,
      clubTrainingDays: clubDays,
      individualTrainingDays: individualDays,
      usualMatchDay: matchDayChoiceToValue(matchDayChoice),
      matchDate: matchDate || null,
      equipment,
      painInjury,
      doubleSessionsAllowed: doubleSessions,
      guardianConsent: isMinor ? consent : true,
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
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
              <Label>Kiedy zwykle grasz mecz?</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "sat", label: "Sobota" },
                    { key: "sun", label: "Niedziela" },
                    { key: "other", label: "Inny dzień" },
                    { key: "none", label: "Nie mam stałego dnia meczu" },
                  ] as { key: typeof matchDayChoice; label: string }[]
                ).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setMatchDayChoice(o.key)}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      matchDayChoice === o.key
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
              <Label htmlFor="match">Data najbliższego meczu (opcjonalnie)</Label>
              <Input
                id="match"
                type="date"
                min={todayStr}
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Czy możesz trenować 2 razy jednego dnia?</Label>
              <ChoiceGrid
                options={["no", "light_only", "yes_if_safe"] as DoubleSessions[]}
                value={doubleSessions}
                onChange={setDoubleSessions}
                labels={DOUBLE_SESSION_LABELS}
                cols={1}
              />
              <p className="text-xs text-muted-foreground">
                Druga sesja może pojawić się tylko wtedy, gdy nie koliduje z
                meczem, bólem, zmęczeniem ani treningiem klubowym.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Dostępny sprzęt</Label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggleEquip(e)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      equipment.includes(e)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {e}
                  </button>
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
