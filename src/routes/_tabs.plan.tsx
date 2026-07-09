import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
  CalendarClock,
  Dumbbell,
  Lock,
  ArrowRight,
  Leaf,
  Zap,
  Target,
  Activity,
  Gauge,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";



export const Route = createFileRoute("/_tabs/plan")({
  component: PlanScreen,
});

const LOAD_LABEL: Record<Intensity, string> = {
  niska: "niskie",
  umiarkowana: "umiarkowane",
  wysoka: "wysokie",
};

const LOAD_SHORT: Record<Intensity, string> = {
  niska: "Niskie",
  umiarkowana: "Średnie",
  wysoka: "Wysokie",
};

const INTENSITY_SHORT: Record<Intensity, string> = {
  niska: "Niska",
  umiarkowana: "Średnia",
  wysoka: "Wysoka",
};

/** Ikona w bańce dla typu dnia. */
function sessionIcon(day: SessionDay): LucideIcon {
  if (day.dayType === "match") return Target;
  if (day.dayType === "recovery" || day.dayType === "rest") return Leaf;
  const t = day.sessionType.toLowerCase();
  if (t.includes("szybk") || t.includes("sprint")) return Zap;
  if (t.includes("piłk") || t.includes("techn") || t.includes("ball")) return Target;
  if (t.includes("wytrzym") || t.includes("bieg") || t.includes("aerob")) return Activity;
  return Dumbbell;
}

/** Jednowyrazowy tag pod nazwą sesji. */
function shortTag(day: SessionDay): string {
  switch (day.dayType) {
    case "match":
      return "Mecz";
    case "md-1":
      return "Aktywacja";
    case "club":
      return "Klub";
    case "recovery":
      return "Odpoczynek";
    case "rest":
      return "Wolne";
    default: {
      const t = day.sessionType.toLowerCase();
      if (t.includes("szybk") || t.includes("sprint")) return "Szybkość";
      if (t.includes("sił")) return "Główna jednostka";
      if (t.includes("moc")) return "Moc";
      if (t.includes("wytrzym")) return "Wytrzymałość";
      if (t.includes("piłk") || t.includes("techn")) return "Technika";
      return "Trening";
    }
  }
}

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
  const { state, todayIso, todaySession } = useLoadwise();
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

  // Poza sezonem / przejściowy: dopuszczamy tydzień bez meczu.
  const offseasonAllowed =
    profile?.seasonPhase === "offseason" ||
    profile?.seasonPhase === "transition";
  const nextReady =
    !!nextTransition?.nextMatchDate ||
    (offseasonAllowed && !!nextTransition?.noMatchNextWeek);

  // Granice kolejnego tygodnia (dla bramki).
  const gateNextIndex = gateWeek;
  const gateWeekData = gateNextIndex !== null ? weeks[gateNextIndex] ?? null : null;


  return (
    <div className="pb-[calc(120px+env(safe-area-inset-bottom))]">
      <AppHeader
        title="Plan tygodnia"
        subtitle={
          current
            ? `${formatDate(current.startDate)}–${formatDate(current.endDate)} · ${monthGoal}`
            : monthGoal
        }
        right={
          <span className="icon-bubble h-9 w-9 border border-border bg-card">
            <CalendarDays className="h-4 w-4" />
          </span>
        }
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


      {/* Hero — decyzja dnia */}
      {todaySession &&
        (() => {
          const HeroIcon = sessionIcon(todaySession);
          return (
            <div className="px-5 pt-3">
              <Link
                to="/sesja/$date"
                params={{ date: todaySession.date }}
                search={{ slot: 1 }}
                className="hero-card flex items-center gap-4 p-5 active:scale-[0.99] transition-transform"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/20 text-brand-foreground">
                  <HeroIcon className="h-7 w-7 text-[oklch(0.78_0.13_256)]" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.78_0.13_256)]">
                    Decyzja dnia
                  </div>
                  <h2 className="mt-1 truncate text-xl font-bold leading-tight">
                    {todaySession.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-graphite-foreground">
                      {INTENSITY_SHORT[todaySession.intensity]}
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-graphite-foreground">
                      {LOAD_SHORT[todaySession.intensity]}
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-graphite-foreground">
                      {todaySession.durationMin} min
                    </span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground">
                  <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                </span>
              </Link>
            </div>
          );
        })()}

      {/* Fokus tygodnia — jeden wiersz */}
      {summary && (
        <div className="px-5 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/70 px-4 py-2.5">
            <span className="truncate text-sm font-medium text-secondary-foreground">
              {summary.goal}
            </span>
            <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              Obciążenie: {LOAD_LABEL[summary.load]}
            </span>
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
          const d = parseIso(day.date);
          const dayNum = d.getDate();
          const monthShort = d
            .toLocaleDateString("pl-PL", { month: "short" })
            .replace(".", "");
          const RowIcon = sessionIcon(day);
          const isRest = day.dayType === "rest" || day.dayType === "recovery";
          return (
            <div
              key={day.date}
              className={`soft-card relative overflow-hidden ${
                isToday ? "ring-1 ring-primary/40" : ""
              }`}
            >
              {isToday && (
                <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary" />
              )}
              <Link
                to="/sesja/$date"
                params={{ date: day.date }}
                search={{ slot: 1 }}
                className="flex items-center gap-3.5 p-3.5 active:bg-secondary/40"
              >
                <div className="w-11 shrink-0 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {shortDayName(d)}
                  </div>
                  <div className="text-xl font-bold leading-none text-foreground">
                    {dayNum}
                  </div>
                  <div className="text-[10px] font-medium uppercase text-muted-foreground">
                    {monthShort}
                  </div>
                </div>

                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                    isRest
                      ? "bg-[oklch(0.95_0.04_150)] text-[oklch(0.5_0.13_150)]"
                      : "icon-bubble"
                  }`}
                >
                  <RowIcon className="h-6 w-6" strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-semibold text-foreground">
                      {day.title}
                    </h3>
                    {isToday && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                        Dziś
                      </span>
                    )}
                    {done && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        isRest ? "bg-[oklch(0.6_0.13_150)]" : "bg-primary"
                      }`}
                    />
                    {swapped ? "Zamieniona" : added ? "Dodana" : shortTag(day)}
                  </p>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>


              {hasTwo && day.secondSession && (
                <Link
                  to="/sesja/$date"
                  params={{ date: day.date }}
                  search={{ slot: 2 }}
                  className="flex items-center gap-2 border-t border-border/60 px-3.5 py-2.5 text-xs font-medium text-muted-foreground active:bg-secondary/40"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-foreground/60" />
                  <span className="truncate">2. sesja: {day.secondSession.title}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" />
                </Link>
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
              {nextTransition?.nextMatchDate
                ? `Kolejny mecz: ${formatDate(nextTransition.nextMatchDate)}.`
                : offseasonAllowed && nextTransition?.noMatchNextWeek
                  ? "Kolejny tydzień bez meczu (poza sezonem)."
                  : "Kolejny mecz: nie ustawiono."}
            </p>

            <Button
              className="mt-3 w-full"
              disabled={!nextReady}
              onClick={() => {
                if (!nextReady) {
                  toast.error(
                    offseasonAllowed
                      ? "Wybierz datę meczu albo zaznacz tydzień bez meczu."
                      : "Najpierw wybierz datę kolejnego meczu.",
                  );
                  return;
                }
                setActiveWeek(nextIndex);
              }}
            >
              Przejdź do kolejnego tygodnia
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={() => setGateWeek(nextIndex)}
              className="mt-2 w-full text-center text-xs font-medium text-primary"
            >
              Zmień datę meczu
            </button>
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
          allowNoMatch={offseasonAllowed}
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
