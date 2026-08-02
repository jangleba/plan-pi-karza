import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader } from "@/components/loadwise/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft,
  Gauge,
  TriangleAlert,
  Wrench,
  Clock,
  Info,
  ArrowRight,
} from "lucide-react";
import { compareWithCorrection, eatClock } from "@/lib/fuel/engine";
import {
  athleteFromProfile,
  minutesUntil,
  sessionFromPlan,
  weekLoadFromPlan,
} from "@/lib/fuel/planAdapter";
import { useFuelLocalData } from "@/lib/fuel/localData";
import type { FuelInput, MealSize } from "@/lib/fuel/types";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelCheckScreen,
});

const MEAL_LABELS: Record<MealSize, string> = {
  none: "Nic",
  liquid: "Płyn / żel",
  small: "Mała",
  medium: "Średnia",
  large: "Duża",
};

const BAND_LABELS: Record<string, string> = {
  wysoka: "Gotowość wysoka",
  dobra: "Gotowość dobra",
  srednia: "Gotowość średnia",
  niska: "Gotowość niska",
  brak_danych: "Brak danych",
};

function nowClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function NumField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          inputMode="numeric"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            onChange(raw === "" ? null : Number(raw));
          }}
          className="mt-1"
          placeholder="—"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function FuelCheckScreen() {
  const { state, todaySession, todayIso } = useLoadwise();
  const { data, update } = useFuelLocalData();
  const [clock] = useState(nowClock);

  const input: FuelInput = useMemo(() => {
    const minutesToStart = data.startClock
      ? minutesUntil(data.startClock, clock)
      : null;
    return {
      athlete: athleteFromProfile(state.profile, {
        sex: data.sex,
        bodyMassKg: data.bodyMassKg,
        heightCm: data.heightCm,
      }),
      session: sessionFromPlan(todaySession, minutesToStart),
      weekLoad: weekLoadFromPlan(state.plan, todayIso),
      intake: {
        mealSize: data.mealSize,
        plannedCarbsG: data.plannedCarbsG,
        fatFiberHeavy: data.fatFiberHeavy,
        caffeine: data.caffeine,
        fluidTodayMl: data.fluidTodayMl,
        lastMealMinutesAgo: data.lastMealMinutesAgo,
        gutIssues: data.gutIssues,
        restrictions: data.restrictions,
      },
    };
  }, [state.profile, state.plan, todayIso, todaySession, data, clock]);

  const { before, after, deltaScore } = useMemo(
    () => compareWithCorrection(input),
    [input],
  );

  const eatAt = eatClock(data.startClock, before.eatBeforeStartMin);

  return (
    <div>
      <AppHeader
        title="Fuel Check"
        subtitle="Decyzja żywieniowa policzona z Twoich danych i planu"
        right={
          <Link
            to="/start"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground"
            aria-label="Wróć"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <div className="space-y-3 px-5 pb-10">
        {/* 1. WYNIK */}
        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> Fuel Score
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-4xl font-bold leading-none">
              {before.score ?? "—"}
              {before.score != null && (
                <span className="text-lg font-medium text-muted-foreground">/100</span>
              )}
            </div>
            <div className="pb-1 text-sm font-medium text-muted-foreground">
              {BAND_LABELS[before.band]}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="Energia" value={before.energyReadiness} suffix="%" />
            <Metric label="Nawodnienie" value={before.hydrationPct} suffix="%" />
            <Metric label="Ryzyko żołądka" value={before.discomfortRisk} suffix="%" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Policzone z {before.dataCompleteness}% wymaganych danych ·{" "}
            {input.session.title ?? "brak jednostki w planie"}
            {input.session.minutesToStart != null
              ? ` · start za ${input.session.minutesToStart} min`
              : ""}
          </p>
          {before.missingData.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Brakujące dane: {before.missingData.join(", ")}.
            </p>
          )}
        </div>

        {/* 2. GŁÓWNY PROBLEM */}
        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TriangleAlert className="h-3.5 w-3.5" /> Główny problem
          </div>
          <div className="mt-1.5 text-sm font-semibold">
            {before.mainProblem?.title ?? "Brak istotnego problemu"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {before.mainProblem?.detail ??
              "Przy tych danych wybór pasuje do najbliższej jednostki."}
          </p>
        </div>

        {/* 3. NAJLEPSZA KOREKTA + PRZED/PO */}
        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" /> Najlepsza korekta
          </div>
          <div className="mt-1.5 text-sm font-semibold">
            {before.correction?.title ?? "Nic nie zmieniaj"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {before.correction?.detail ?? "Wynik jest już zgodny z regułami."}
          </p>
          {after && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground">Przed</div>
                <div className="text-lg font-bold">{before.score}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground">Po</div>
                <div className="text-lg font-bold text-primary">{after.score}</div>
              </div>
              {deltaScore != null && (
                <div className="ml-auto text-sm font-medium text-primary">
                  +{deltaScore} pkt
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. MOMENT GOTOWOŚCI */}
        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Moment gotowości
          </div>
          <div className="mt-1.5 text-sm font-semibold">
            {before.eatBeforeStartMin != null
              ? `Zjedz najpóźniej ${before.eatBeforeStartMin} min przed startem${eatAt ? ` (do ${eatAt})` : ""}`
              : "Podaj wielkość posiłku i godzinę jednostki"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cel: {before.targets.carbTargetG ?? "—"} g węglowodanów ·{" "}
            {before.targets.fluidTargetMl ?? "—"} ml płynów na dziś.
          </p>
        </div>

        {/* DANE WEJŚCIOWE */}
        <div className="soft-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dane do obliczeń
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <NumField
              label="Masa ciała"
              suffix="kg"
              value={data.bodyMassKg}
              onChange={(v) => update({ bodyMassKg: v })}
            />
            <NumField
              label="Wzrost"
              suffix="cm"
              value={data.heightCm}
              onChange={(v) => update({ heightCm: v })}
            />
            <div>
              <Label className="text-xs text-muted-foreground">Start jednostki</Label>
              <Input
                type="time"
                className="mt-1"
                value={data.startClock ?? ""}
                onChange={(e) => update({ startClock: e.target.value || null })}
              />
            </div>
            <NumField
              label="Węglowodany w posiłku"
              suffix="g"
              value={data.plannedCarbsG}
              onChange={(v) => update({ plannedCarbsG: v })}
            />
            <NumField
              label="Płyny dziś"
              suffix="ml"
              value={data.fluidTodayMl}
              onChange={(v) => update({ fluidTodayMl: v })}
            />
            <NumField
              label="Ostatni posiłek"
              suffix="min"
              value={data.lastMealMinutesAgo}
              onChange={(v) => update({ lastMealMinutesAgo: v })}
            />
          </div>

          <Label className="mt-4 block text-xs text-muted-foreground">
            Wielkość posiłku
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(MEAL_LABELS) as MealSize[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => update({ mealSize: m })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  data.mealSize === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <ToggleRow
              label="Tłusty / bogaty w błonnik"
              checked={data.fatFiberHeavy === true}
              onChange={(v) => update({ fatFiberHeavy: v })}
            />
            <ToggleRow
              label="Kofeina w tym wyborze"
              checked={data.caffeine}
              onChange={(v) => update({ caffeine: v })}
            />
            <ToggleRow
              label="Wrażliwy żołądek / problemy trawienne"
              checked={data.gutIssues === true}
              onChange={(v) => update({ gutIssues: v })}
            />
          </div>
        </div>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Wszystkie liczby wynikają z Twoich danych i jawnych reguł Fuel Engine.
          To wsparcie decyzji, nie porada medyczna.
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix: string;
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-2.5">
      <div className="text-sm font-semibold">
        {value ?? "—"}
        {value != null ? suffix : ""}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
