import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { formatDate, shortDayName, parseIso } from "@/lib/loadwise/labels";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import {
  buildPlanWeeks,
  computeWeekStats,
  phaseOf,
  type WeekPhase,
} from "@/lib/loadwise/planEngine";
import { AppHeader, IntensityBadge } from "@/components/loadwise/ui";
import { WeeklyGateSheet } from "@/components/loadwise/WeeklyGateSheet";
import { Button } from "@/components/ui/button";
import type { SessionDay, Intensity, Goal, PlanWeek } from "@/lib/loadwise/types";
import {
  Clock,
  ChevronRight,
  CheckCircle2,
  Flame,
  CalendarClock,
  Dumbbell,
  Users,
  Lock,
  ArrowRight,
  Layers,
  Leaf,
} from "lucide-react";



export const Route = createFileRoute("/_tabs/plan")({
  component: PlanScreen,
});

const LOAD_LABEL: Record<Intensity, string> = {
  niska: "niskie",
  umiarkowana: "umiarkowane",
  wysoka: "wysokie",
};

function pluralWeeks(n: number): string {
  if (n === 1) return "1 tydzień";
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return `${n} tygodnie`;
  }
  return `${n} tygodni`;
}

/** Krótki status dnia na karcie. */
function dayStatus(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Mecz";
    case "md-1":
      return "Aktywacja";
    case "club":
      return "Klub";
    case "recovery":
      return "Regeneracja";
    case "rest":
      return "Wolne";
    default:
      return "Trening";
  }
}

/** Jedna krótka „decyzja dnia". */
function whatToDo(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Dzień meczu — wpisz minuty, RPE i krótką ocenę.";
    case "md-1":
      return "Krótka aktywacja, świeżość przed meczem, bez zmęczenia.";
    case "club":
      return "Monitoring klubu + RPE po treningu.";
    case "recovery":
      return day.mdLabel === "MD+1"
        ? "Regeneracja po meczu, mobilność i obniżenie napięcia."
        : "Regeneracja, mobilność i obniżenie napięcia.";
    case "rest":
      return "Dzień wolny — odpoczynek, ewentualnie lekki ruch.";
    default: {
      const type = day.sessionType.toLowerCase();
      if (type.includes("wytrzymał") || type.includes("rsa"))
        return "Główne okno bodźca wytrzymałościowego.";
      if (type.includes("agility") || type.includes("cod") || type.includes("zwin"))
        return "COD i hamowanie — jakość decyzji i ruchu.";
      if (type.includes("moc"))
        return "Moc jako bodziec główny, bez nadmiaru skoków.";
      if (type.includes("siła"))
        return "Siła jako bodziec główny, bez przeciążania przed meczem.";
      if (type.includes("szybko") || type.includes("sprint"))
        return day.mdLabel === "MD-2"
          ? "Krótka jakość piłkarska i szybkościowa, bez dokładania zmęczenia."
          : "Dzień jakości szybkościowej — pełne przerwy i kontrola objętości.";
      if (type.includes("piłk") || type.includes("technik"))
        return "Praca z piłką: technika i decyzje.";
      if (type.includes("ostro"))
        return "Ostrość przed meczem — kończysz świeży.";
      if (type.includes("prehab") || type.includes("mobil"))
        return "Prehab i mobilność — odporność i jakość ruchu.";
      return "Wykonaj zaplanowany bodziec dnia.";
    }
  }
}

const PHASE_FOCUS: Record<WeekPhase, { goal: string; accent: string }> = {
  adaptation: {
    goal: "Wejście w rytm",
    accent: "Adaptacja i baza — kontrolowane wejście w blok",
  },
  development: {
    goal: "Budowanie obciążenia",
    accent: "Rozwój głównego bodźca pod cel",
  },
  peak: {
    goal: "Najmocniejszy tydzień",
    accent: "Najwyższy specyficzny bodziec, kontrolowany overload",
  },
  deload: {
    goal: "Deload i świeżość",
    accent: "Konsolidacja, mniejsza objętość, wyostrzenie",
  },
};

/** Akcent fazy dopasowany do celu zawodnika. */
function focusFor(phase: WeekPhase, goal: Goal): { goal: string; accent: string } {
  const base = PHASE_FOCUS[phase];
  const accents: Partial<Record<Goal, Record<WeekPhase, string>>> = {
    endurance: {
      adaptation: "Baza tlenowa i tempo",
      development: "Wytrzymałość specjalna i interwały",
      peak: "RSA / wysoka specyfika wytrzymałościowa",
      deload: "Ostrość wytrzymałościowa, mała objętość",
    },
    speed: {
      adaptation: "Technika biegu i kontrolowana akceleracja",
      development: "Dwie ekspozycje szybkościowe + moc",
      peak: "Najwyższa jakość sprintu i reakcja",
      deload: "Krótka szybkość, świeżość i piłka",
    },
    strength: {
      adaptation: "Technika siły i baza ruchu",
      development: "Budowanie siły + podtrzymanie szybkości",
      peak: "Najmocniejszy bodziec siłowo-mocowy",
      deload: "Siła podtrzymująca i świeżość",
    },
    power: {
      adaptation: "Baza siły i lekka moc",
      development: "Moc + sprint + wsparcie siłowe",
      peak: "Najwyższy bodziec mocy i COD",
      deload: "Moc podtrzymująca, niska objętość",
    },
    agility: {
      adaptation: "Hamowanie, kontrola i decyzja",
      development: "COD + akceleracja + piłka",
      peak: "Najwyższa specyfika zwinności",
      deload: "Lekka zwinność i konsolidacja ruchu",
    },
    general: {
      adaptation: "Technika, baza siły i tlen",
      development: "Zbalansowany rozwój piłkarski",
      peak: "Najmocniejszy mieszany bodziec",
      deload: "Konsolidacja i świeżość",
    },
  };
  return { goal: base.goal, accent: accents[goal]?.[phase] ?? base.accent };
}

/** Tygodniowe podsumowanie / periodyzacja. */
function weekSummary(
  weekIndex: number,
  totalWeeks: number,
  week: PlanWeek,
  goal: Goal,
) {
  const phase = phaseOf(weekIndex, totalWeeks);
  const block = focusFor(phase, goal);
  const stats = computeWeekStats(week);

  return {
    ...block,
    stats,
    focus: week.focus,
    matchDate: week.matchDate,
    reasons: week.reasons,
    load: stats.weeklyLoadLabel,
  };
}


function PlanScreen() {
  const { state, todayIso } = useLoadwise();
  const plan = state.plan;
  const completions = state.completions;
  const profile = state.profile;
  const transitions = state.transitions;
  const [activeWeek, setActiveWeek] = useState(0);
  const [gateWeek, setGateWeek] = useState<number | null>(null);

  const weeks = buildPlanWeeks(plan);


  // Tydzień 0 zawsze dostępny. Kolejny tydzień i dostępny tylko po
  // potwierdzeniu weekly gate (transitions[i]).
  const canAccess = (i: number) => i === 0 || !!transitions[i];

  // Najwcześniejszy nieodblokowany tydzień na drodze do i.
  const firstLockedUpTo = (i: number): number | null => {
    for (let j = 1; j <= i; j++) {
      if (!transitions[j]) return j;
    }
    return null;
  };

  const openTab = (i: number) => {
    if (canAccess(i)) {
      setActiveWeek(i);
      return;
    }
    const locked = firstLockedUpTo(i);
    if (locked !== null) setGateWeek(locked);
  };

  const monthGoal =
    GOAL_LABELS[profile?.goal ?? "matchready"] ?? "gotowość meczowa";
  const current = weeks[Math.min(activeWeek, weeks.length - 1)] ?? null;
  const summary = current
    ? weekSummary(activeWeek, weeks.length, current, profile?.goal ?? "matchready")
    : null;


  // Czy istnieje kolejny tydzień po aktywnym?
  const nextIndex = activeWeek + 1;
  const hasNext = nextIndex < weeks.length;
  const nextConfirmed = !!transitions[nextIndex];
  const nextTransition = transitions[nextIndex];

  // Granice kolejnego tygodnia (dla bramki).
  const gateNextIndex = gateWeek;
  const gateWeekData = gateNextIndex !== null ? weeks[gateNextIndex] ?? null : null;


  return (
    <div className="pb-[calc(120px+env(safe-area-inset-bottom))]">
      <AppHeader
        title="Plan treningowy"
        subtitle={`${pluralWeeks(weeks.length)} · cel: ${monthGoal}`}
      />

      {plan.length === 0 && (
        <p className="px-5 text-sm text-muted-foreground">
          Generujemy Twój plan… Jeśli to się utrzymuje, uzupełnij profil w
          onboardingu.
        </p>
      )}

      {/* Przełącznik tygodni */}
      {weeks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1 pr-8 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weeks.map((week, i) => {
            const locked = !canAccess(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => openTab(i)}
                className={`flex shrink-0 flex-col items-start gap-0.5 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors ${
                  i === activeWeek
                    ? "bg-primary text-primary-foreground"
                    : locked
                      ? "bg-secondary/60 text-muted-foreground"
                      : "bg-secondary text-secondary-foreground"
                }`}
              >
                {locked && <Lock className="h-3.5 w-3.5" />}
                <span>Tydzień {i + 1}</span>
                <span className="text-[11px] opacity-80">
                  {formatDate(week.startDate)}–{formatDate(week.endDate)}
                </span>
              </button>
            );
          })}
        </div>
      )}


      {/* Karta podsumowania tygodnia */}
      {summary && (
        <div className="px-5 pt-3">
          <div className="soft-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Fokus tygodnia · Tydzień {activeWeek + 1}
                </div>
                <h2 className="mt-1 text-lg font-semibold leading-tight">
                  {summary.goal}
                </h2>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                Obciążenie: {LOAD_LABEL[summary.load]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <Flame className="h-3.5 w-3.5" /> {summary.focus}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Mecz: {summary.stats.matchDateLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <Dumbbell className="h-3.5 w-3.5" /> {summary.stats.ownTrainingCount} własne
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <Users className="h-3.5 w-3.5" /> {summary.stats.clubTrainingCount} klubowe
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <Leaf className="h-3.5 w-3.5" /> Recovery: {summary.stats.recoveryPrehabCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <Layers className="h-3.5 w-3.5" /> Podwójne dni: {summary.stats.doubleDayCount}
              </span>
            </div>

            {summary.reasons.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Plan skrócony: {summary.reasons[0]}.
              </p>
            )}

          </div>
        </div>
      )}

      {/* Dni tygodnia */}
      <div
        className="space-y-3 px-5 pt-4"
        style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom))" }}
      >
        {current?.days.map(({ source: day, outsideActivePlan }) => {
          if (outsideActivePlan) {
            return (
              <div key={day.date} className="soft-card p-4 opacity-70">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {shortDayName(parseIso(day.date))} · {formatDate(day.date)}
                </div>
                <h3 className="mt-1 text-base font-semibold">Poza aktywnym planem</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Plan zaczyna się w trakcie tygodnia — ten dzień nie liczy się do obciążenia.
                </p>
              </div>
            );
          }
          const isToday = day.date === todayIso;
          const hasTwo = !!day.secondSession;
          const done = day.dbId ? completions[day.dbId]?.completed : false;
          const mods = state.modifications[day.date] ?? [];
          const swapped = mods.some((m) => m.type === "swap");
          const added = mods.some((m) => m.type === "add");
          return (
            <div
              key={day.date}
              className={`soft-card p-4 ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              <Link
                to="/sesja/$date"
                params={{ date: day.date }}
                search={{ slot: 1 }}
                className="block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {shortDayName(parseIso(day.date))} · {formatDate(day.date)}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Dziś
                        </span>
                      )}
                      {swapped && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          Zamieniona
                        </span>
                      )}
                      {added && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          + Dodana
                        </span>
                      )}
                      {done && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <CheckCircle2 className="h-3 w-3" /> Wykonane
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium text-muted-foreground">
                      {dayStatus(day)}
                    </div>
                    <h3 className="mt-0.5 truncate text-base font-semibold">
                      {day.title}
                    </h3>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>


                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <IntensityBadge intensity={day.intensity} />
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {day.durationMin} min
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {whatToDo(day)}
                </p>
              </Link>

              {hasTwo && day.secondSession && (
                <div className="mt-3 rounded-xl bg-muted/60 p-2.5">
                  <div className="px-1 pb-1.5 text-xs font-semibold">
                    2 sesje dziś
                  </div>
                  <Link
                    to="/sesja/$date"
                    params={{ date: day.date }}
                    search={{ slot: 1 }}
                    className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-xs font-medium"
                  >
                    <span className="truncate">1. {day.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    to="/sesja/$date"
                    params={{ date: day.date }}
                    search={{ slot: 2 }}
                    className="mt-1.5 flex items-center justify-between rounded-lg bg-card px-3 py-2 text-xs font-medium"
                  >
                    <span className="truncate">2. {day.secondSession.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Podsumowanie tygodnia + weekly gate */}
      {hasNext && current && (
        <div className="px-5 pt-5">
          <div className="soft-card p-4">
            <h3 className="text-base font-semibold">Podsumowanie tygodnia</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {nextConfirmed
                ? nextTransition?.noMatchNextWeek
                  ? "Brak meczu — tydzień bez taperu."
                  : `Kolejny mecz: ${formatDate(nextTransition!.nextMatchDate!)}.`
                : "Ustaw datę kolejnego meczu."}
            </p>

            <Button
              className="mt-3 w-full"
              onClick={() => {
                if (nextConfirmed) setActiveWeek(nextIndex);
                else setGateWeek(nextIndex);
              }}
            >
              Przejdź do kolejnego tygodnia
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>

            {nextConfirmed && (
              <button
                type="button"
                onClick={() => setGateWeek(nextIndex)}
                className="mt-2 w-full text-center text-xs font-medium text-primary"
              >
                Zmień datę meczu
              </button>
            )}
          </div>
        </div>
      )}

      {gateWeek !== null && gateWeekData && (
        <WeeklyGateSheet
          open={gateWeek !== null}
          onOpenChange={(v) => {
            if (!v) setGateWeek(null);
          }}
          weekNumber={gateWeek}
          nextWeekStart={gateWeekData.startDate}
          nextWeekEnd={gateWeekData.endDate}
          onConfirmed={() => {
            const target = gateWeek;
            setGateWeek(null);
            if (target !== null) setActiveWeek(target);
          }}
        />
      )}

      <div className="h-[140px]" />
    </div>

  );
}
