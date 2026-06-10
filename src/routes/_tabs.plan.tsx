import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { formatDate, shortDayName, parseIso } from "@/lib/loadwise/labels";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import { AppHeader, IntensityBadge } from "@/components/loadwise/ui";
import { WeeklyGateSheet } from "@/components/loadwise/WeeklyGateSheet";
import { Button } from "@/components/ui/button";
import type { SessionDay, Intensity } from "@/lib/loadwise/types";
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
} from "lucide-react";

export const Route = createFileRoute("/_tabs/plan")({
  component: PlanScreen,
});

const LOAD_LABEL: Record<Intensity, string> = {
  niska: "Niskie",
  umiarkowana: "Umiarkowane",
  wysoka: "Wysokie",
};

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

/** Jedna linia „co robić". */
function whatToDo(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Co robić: zagraj mecz i wpisz minuty oraz RPE.";
    case "md-1":
      return "Co robić: tylko aktywacja, zostań świeży.";
    case "club":
      return "Co robić: zrób trening klubowy i wpisz RPE.";
    case "recovery":
      return "Co robić: lekka regeneracja, bez intensywności.";
    case "rest":
      return "Co robić: odpocznij.";
    default:
      return "Co robić: wejdź w sesję i wykonaj plan.";
  }
}

/** Tygodniowe podsumowanie / periodyzacja. */
function weekSummary(
  weekIndex: number,
  totalWeeks: number,
  week: SessionDay[],
) {
  const blocks = [
    { goal: "Wejście w rytm", accent: "Technika + monitoring obciążenia" },
    { goal: "Budowanie bodźca", accent: "Siła i szybkość" },
    { goal: "Najmocniejszy tydzień", accent: "Akcent pod cel" },
    { goal: "Deload / taper", accent: "Regeneracja i wyostrzenie" },
  ];
  // Ostatni tydzień zawsze deload/taper.
  const block =
    weekIndex === totalWeeks - 1
      ? blocks[3]
      : blocks[Math.min(weekIndex, 2)];

  const ownSessions = week.filter((d) => d.dayType === "training").length;
  const clubSessions = week.filter((d) => d.dayType === "club").length;
  const doubleDays = week.filter((d) => !!d.secondSession).length;
  const microSessions = week.filter((d) => !!d.secondSession).length;
  const matchDay = week.find((d) => d.dayType === "match");

  // Obciążenie tygodnia = najwyższa częsta intensywność.
  const hasHigh = week.some((d) => d.intensity === "wysoka");
  const hasMod = week.some((d) => d.intensity === "umiarkowana");
  const load: Intensity = hasHigh ? "wysoka" : hasMod ? "umiarkowana" : "niska";

  return {
    ...block,
    ownSessions,
    clubSessions,
    doubleDays,
    microSessions,
    matchDay,
    load,
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

  const weeks: SessionDay[][] = [];
  for (let i = 0; i < plan.length; i += 7) {
    weeks.push(plan.slice(i, i + 7));
  }

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

  const monthGoal = profile ? GOAL_LABELS[profile.goal] : "gotowość meczowa";
  const current = weeks[Math.min(activeWeek, weeks.length - 1)] ?? [];
  const summary = current.length
    ? weekSummary(activeWeek, weeks.length, current)
    : null;

  // Czy istnieje kolejny tydzień po aktywnym?
  const nextIndex = activeWeek + 1;
  const hasNext = nextIndex < weeks.length;
  const nextConfirmed = !!transitions[nextIndex];
  const nextTransition = transitions[nextIndex];

  // Granice kolejnego tygodnia (dla bramki).
  const gateNextIndex = gateWeek;
  const gateWeekDays =
    gateNextIndex !== null ? weeks[gateNextIndex] ?? [] : [];


  return (
    <div>
      <AppHeader
        title="Plan treningowy"
        subtitle={`${weeks.length} ${weeks.length === 1 ? "tydzień" : "tygodnie"} · cel: ${monthGoal}`}
      />

      {plan.length === 0 && (
        <p className="px-5 text-sm text-muted-foreground">
          Generujemy Twój plan… Jeśli to się utrzymuje, uzupełnij profil w
          onboardingu.
        </p>
      )}

      {/* Przełącznik tygodni */}
      {weeks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weeks.map((_, i) => {
            const locked = !canAccess(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => openTab(i)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  i === activeWeek
                    ? "bg-primary text-primary-foreground"
                    : locked
                      ? "bg-secondary/60 text-muted-foreground"
                      : "bg-secondary text-secondary-foreground"
                }`}
              >
                {locked && <Lock className="h-3.5 w-3.5" />}
                Tydzień {i + 1}
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
                  Tydzień {activeWeek + 1}
                </div>
                <h2 className="mt-1 text-lg font-semibold leading-tight">
                  {summary.goal}
                </h2>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                Load: {LOAD_LABEL[summary.load]}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Flame className="h-4 w-4 shrink-0" />
                <span className="truncate">{summary.accent}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="h-4 w-4 shrink-0" />
                <span>
                  {summary.matchDay
                    ? `Mecz: ${formatDate(summary.matchDay.date)}`
                    : "Mecz: brak"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Dumbbell className="h-4 w-4 shrink-0" />
                <span>Sesje własne: {summary.ownSessions}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>Treningi klubowe: {summary.clubSessions}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dni tygodnia */}
      <div className="space-y-3 px-5 pt-4">
        {current.map((day) => {
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
      {hasNext && current.length > 0 && (
        <div className="px-5 pt-5">
          <div className="soft-card p-4">
            <h3 className="text-base font-semibold">Podsumowanie tygodnia</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {nextConfirmed
                ? nextTransition?.noMatchNextWeek
                  ? "Brak meczu — tydzień bez taperu."
                  : `Kolejny mecz: ${formatDate(nextTransition!.nextMatchDate!)}.`
                : "Zanim ruszysz dalej, podaj kolejny mecz."}
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

      {gateWeek !== null && gateWeekDays.length > 0 && (
        <WeeklyGateSheet
          open={gateWeek !== null}
          onOpenChange={(v) => {
            if (!v) setGateWeek(null);
          }}
          weekNumber={gateWeek}
          nextWeekStart={gateWeekDays[0].date}
          nextWeekEnd={gateWeekDays[gateWeekDays.length - 1].date}
          onConfirmed={() => {
            const target = gateWeek;
            setGateWeek(null);
            if (target !== null) setActiveWeek(target);
          }}
        />
      )}

      <div className="h-[120px]" />
    </div>

  );
}
