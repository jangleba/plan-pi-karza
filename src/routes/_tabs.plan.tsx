import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { applyExerciseReplacements, useLoadwise } from "@/lib/loadwise/store";
import {
  formatDate,
  shortDayName,
  parseIso,
  professionalSessionTitle,
} from "@/lib/loadwise/labels";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import { computeWeekStats, validatePlanWeeks } from "@/lib/loadwise/sessionRuntime";
import { resolveTodayPlanRowSource } from "@/lib/loadwise/dailyCheckin";
import { selectEffectivePlan, selectPlanWeeks } from "@/lib/loadwise/effectivePlanSelector";
import { transitionMatchesBlock } from "@/lib/loadwise/confirmedCalendar";
import { AppHeader } from "@/components/loadwise/ui";
import { UpcomingWeekPrompt } from "@/components/loadwise/UpcomingWeekPrompt";
import { currentWeekIndex, weekBounds } from "@/lib/loadwise/weeklyNavigation";
import { addIsoDays } from "@/lib/isoDate";
import { WeeklyGateSheet } from "@/components/loadwise/WeeklyGateSheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SessionDay, Intensity, Goal, PlanWeek, WeekPhase } from "@/lib/loadwise/types";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  CalendarClock,
  Dumbbell,
  ArrowRight,
  Leaf,
  Zap,
  Target,
  Activity,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/plan")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => ({
    week:
      typeof search.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.week)
        ? search.week
        : undefined,
  }),
  component: PlanScreen,
});

const LOAD_LABEL: Record<Intensity, string> = {
  niska: "niskie",
  umiarkowana: "umiarkowane",
  wysoka: "wysokie",
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

function loadBarHeight(day: SessionDay): number {
  if (day.dayType === "rest") return 8;
  if (day.dayType === "recovery" || day.dayType === "md-1") return 14;
  if (day.intensity === "wysoka" || day.dayType === "match") return 34;
  if (day.intensity === "umiarkowana" || day.dayType === "club") return 25;
  return 18;
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
function weekSummary(week: PlanWeek, goal: Goal) {
  const phase = week.weekPhase;
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
  const navigate = useNavigate();
  const requestedWeek = Route.useSearch().week;
  const { state, todayIso, todaySession, updateProfile } = useLoadwise();
  const plan = useMemo(
    () =>
      selectEffectivePlan(state.plan, state.modifications, {
        profile: state.profile,
        readiness: state.readiness,
        completions: state.completions,
      }),
    [state.plan, state.modifications, state.profile, state.readiness, state.completions],
  );
  const completions = state.completions;
  const profile = state.profile;
  const transitions = state.transitions;
  const [activeWeek, setActiveWeek] = useState(0);
  const [gateWeek, setGateWeek] = useState<number | null>(null);
  const [needMatchWeek, setNeedMatchWeek] = useState<number | null>(null);
  const [switchingSeason, setSwitchingSeason] = useState(false);
  const autoWeekKeyRef = useRef<string | null>(null);

  const weeks = useMemo(() => selectPlanWeeks(plan, profile), [plan, profile]);

  useEffect(() => {
    if (weeks.length === 0) return;
    const autoKey = `${todayIso}:${plan[0]?.date ?? ""}:${plan.length}:${requestedWeek ?? ""}`;
    if (autoWeekKeyRef.current === autoKey) return;
    autoWeekKeyRef.current = autoKey;
    const requestedIndex = requestedWeek
      ? weeks.findIndex((week) => week.startDate === requestedWeek)
      : -1;
    const todayWeekIndex =
      requestedIndex >= 0 && weeks[requestedIndex].endDate >= todayIso
        ? requestedIndex
        : currentWeekIndex(weeks, todayIso);
    if (todayWeekIndex >= 0) {
      setActiveWeek(todayWeekIndex);
    }
  }, [weeks, todayIso, plan, requestedWeek]);

  // Walidacja przed wyświetleniem: żaden tydzień nie może być lekki bez powodu.
  useEffect(() => {
    if (!profile) return;
    const issues = validatePlanWeeks(weeks, profile);
    if (issues.length > 0) {
      console.warn("[loadwise] plan validation issues:", issues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, profile]);

  // Obciążenie dnia po korekcie daily readiness (osobna wartość od planned).
  const effectiveToday = plan.find((day) => day.date === todayIso) ?? todaySession;
  const todayAdjusted =
    effectiveToday && profile
      ? applyExerciseReplacements(effectiveToday, state.exerciseReplacements[todayIso] ?? [])
      : effectiveToday;

  // Tryb sezonu: świadomy wybór w profilu. "Poza sezonem" TYLKO gdy
  // seasonPhase = offseason/transition. Brak daty meczu NIE oznacza automatycznie
  // okresu poza sezonem.
  const seasonStatus: "in_season" | "off_season" =
    profile?.seasonPhase === "offseason" || profile?.seasonPhase === "transition"
      ? "off_season"
      : "in_season";
  const offseasonAllowed = seasonStatus === "off_season";

  // Czy dany tydzień ma potwierdzoną datę kolejnego meczu (twarda blokada).
  const weekHasMatchDate = (i: number) =>
    transitionMatchesBlock(plan, transitions[i], i) &&
    (!!transitions[i]?.nextMatchDate || !!transitions[i]?.noMatchNextWeek);

  // Tydzień 0 zawsze dostępny. Poza sezonem — pełna swoboda. W sezonie kolejny
  // tydzień wymaga zapisanej daty meczu dla każdego wcześniejszego przejścia.
  const todayIndex = currentWeekIndex(weeks, todayIso);
  const canAccess = (i: number) => {
    if (i >= weeks.length) return false;
    if (i === todayIndex) return true;
    if (weeks[i]?.endDate < todayIso) return true;
    if (i === 0) return true;
    if (seasonStatus === "off_season") return true;
    for (let j = Math.max(1, todayIndex + 1); j <= i; j++) {
      if (!weekHasMatchDate(j)) return false;
    }
    return true;
  };

  // Najwcześniejszy tydzień bez daty meczu na drodze do i.
  const firstLockedUpTo = (i: number): number | null => {
    for (let j = Math.max(1, todayIndex + 1); j <= i; j++) {
      if (!weekHasMatchDate(j)) return j;
    }
    return null;
  };

  // Jedyna droga zmiany aktywnego tygodnia — twarda blokada w kodzie.
  const goToWeek = (i: number) => {
    if (i === weeks.length) {
      setGateWeek(i);
      return;
    }
    if (canAccess(i)) {
      setActiveWeek(i);
      return;
    }
    const locked = firstLockedUpTo(i);
    if (locked !== null) setNeedMatchWeek(locked);
  };

  async function switchToSeasonal() {
    if (!profile || switchingSeason) return;
    setSwitchingSeason(true);
    try {
      await updateProfile({ ...profile, seasonPhase: "inseason" });
      toast.success("Tryb sezonowy włączony.");
    } finally {
      setSwitchingSeason(false);
    }
  }

  const monthGoal = GOAL_LABELS[profile?.goal ?? "matchready"] ?? "gotowość meczowa";
  const current = weeks[Math.min(activeWeek, weeks.length - 1)] ?? null;
  const summary = current ? weekSummary(current, profile?.goal ?? "matchready") : null;

  // Czy istnieje kolejny tydzień po aktywnym?
  const nextIndex = activeWeek + 1;
  const nextBounds = weekBounds(weeks, nextIndex);
  const hasNext =
    nextIndex < weeks.length ||
    Boolean(nextBounds && nextBounds.startDate <= addIsoDays(todayIso, 7));
  const nextTransition = transitions[nextIndex];

  // Kolejny tydzień gotowy: poza sezonem zawsze, w sezonie tylko z datą meczu.

  // Granice tygodnia wymagającego daty meczu (dla bramki i modala).
  const gateNextIndex = gateWeek ?? needMatchWeek;
  const gateWeekData = gateNextIndex !== null ? weekBounds(weeks, gateNextIndex) : null;

  // Dni należące do aktywnego planu (ukryj dni przed startem planu).
  const visibleDays = (current?.days ?? []).filter((d) => !d.outsideActivePlan);
  const planningMeta = visibleDays.find(
    ({ source }) =>
      source.weekMeta?.planningStatus !== "complete" && source.weekMeta?.planningNotes?.length,
  )?.source.weekMeta;
  const planStartDate = visibleDays[0]?.date ?? null;
  const hasHiddenBefore =
    (current?.days ?? []).some((d) => d.outsideActivePlan) && planStartDate !== null;

  // Router restores entry scroll. Only a week change needs a second scroll operation.
  const previousWeek = useRef(activeWeek);
  useEffect(() => {
    if (previousWeek.current === activeWeek) return;
    previousWeek.current = activeWeek;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeWeek]);

  // Twarda blokada wejścia w zablokowany tydzień przez bezpośrednią zmianę
  // stanu (np. z historii / URL) — cofnij do najbliższego dostępnego tygodnia.
  useEffect(() => {
    if (!canAccess(activeWeek)) {
      const locked = firstLockedUpTo(activeWeek);
      setActiveWeek(locked !== null ? locked - 1 : 0);
      if (locked !== null) setNeedMatchWeek(locked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeek, transitions, seasonStatus]);

  return (
    <div className="bw-plan-screen pb-6">
      <AppHeader
        title="Plan"
        brand={false}
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
          Generujemy Twój plan… Jeśli to się utrzymuje, uzupełnij profil w onboardingu.
        </p>
      )}

      {weeks.length > 0 && (
        <div className="bw-week-nav" aria-label="Przełączanie tygodni">
          <Button
            variant="outline"
            disabled={activeWeek === 0}
            onClick={() => goToWeek(activeWeek - 1)}
            aria-label="Poprzedni tydzień"
          >
            <ChevronLeft size={17} />
          </Button>
          <div>
            <strong>Tydzień {activeWeek + 1}</strong>
            <small>
              {current && `${formatDate(current.startDate)}–${formatDate(current.endDate)}`}
            </small>
          </div>
          <Button
            variant="outline"
            disabled={!hasNext}
            onClick={() => goToWeek(nextIndex)}
            aria-label="Następny tydzień"
          >
            Dalej <ChevronRight size={17} />
          </Button>
        </div>
      )}
      <UpcomingWeekPrompt
        onConfirmed={(week) => void navigate({ to: "/plan", search: { week } })}
      />
      {/* Pasek trybu poza sezonem */}
      {seasonStatus === "off_season" && weeks.length > 0 && (
        <div className="px-5 pt-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground">
              <Leaf className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Okres poza sezonem</p>
              <p className="text-xs text-muted-foreground">
                Plan rozwija formę bez powiązania z terminarzem meczowym.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={switchingSeason}
              onClick={switchToSeasonal}
              className="shrink-0"
            >
              {switchingSeason ? "…" : "Zmień na tryb sezonowy"}
            </Button>
          </div>
        </div>
      )}

      {planningMeta && (
        <details className="mx-5 mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            {planningMeta.planningStatus === "health_limited"
              ? "Plan ograniczony ze względu na zdrowie"
              : "Plan dopasowany do Twoich ograniczeń"}
          </summary>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {planningMeta.planningNotes?.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="bw-week-overview mx-4 mt-2 rounded-xl border border-border bg-card px-3">
        <summary className="min-h-11 cursor-pointer content-center text-xs font-medium text-muted-foreground">
          Obciążenie i cel tygodnia
        </summary>
        {visibleDays.length > 0 && (
          <div className="px-5 pt-4">
            <div className="border-y border-border/75 py-4">
              <div className="grid grid-cols-7 gap-1">
                {visibleDays.map(({ source }) => {
                  const day = resolveTodayPlanRowSource(source, todayIso, todayAdjusted);
                  const date = parseIso(day.date);
                  const isToday = day.date === todayIso;
                  const isMatch = day.dayType === "match";
                  return (
                    <Link
                      key={day.date}
                      to="/sesja/$date"
                      params={{ date: day.date }}
                      search={{ slot: 1 }}
                      className={`flex min-w-0 flex-col items-center gap-2 py-1 text-center transition-opacity active:opacity-60 ${
                        isToday ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {shortDayName(date)}
                      </span>
                      <span className="relative flex h-9 items-end">
                        <span
                          className={`w-1.5 rounded-full ${
                            isMatch
                              ? "bg-[oklch(0.58_0.055_55)]"
                              : isToday
                                ? "bg-primary"
                                : "bg-[oklch(0.62_0.035_151)]"
                          }`}
                          style={{ height: loadBarHeight(day) }}
                        />
                      </span>
                      <span className={`text-[11px] tabular-nums ${isToday ? "font-medium" : ""}`}>
                        {date.getDate()}
                      </span>
                      {isToday && <span className="h-0.5 w-5 rounded-full bg-primary" />}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Rytm obciążenia mikrocyklu</span>
                <span>{summary ? LOAD_LABEL[summary.load] : null}</span>
              </div>
            </div>
          </div>
        )}

        {/* Kierunek mikrocyklu — jeden spokojny wiersz */}
        {summary && (
          <div className="px-5 pt-3">
            <div className="border-b border-border/75 px-1 pb-3">
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Kierunek mikrocyklu
              </span>
              <span className="mt-1 block truncate text-sm font-medium text-foreground">
                {summary.goal}
              </span>
            </div>
          </div>
        )}
      </details>

      {/* Dni tygodnia */}
      <div className="divide-y divide-border/75 px-5 pt-4" style={{ paddingBottom: "12px" }}>
        {hasHiddenBefore && planStartDate && (
          <div className="rounded-2xl bg-secondary/70 px-4 py-3 text-xs text-muted-foreground">
            Plan zaczyna się {formatDate(planStartDate)} — wcześniejsze dni tego tygodnia są poza
            planem.
          </div>
        )}
        {visibleDays.map(({ source }) => {
          const baseDay = resolveTodayPlanRowSource(source, todayIso, todayAdjusted);
          const mods = state.modifications[baseDay.date] ?? [];
          const swappedMod = mods.find((item) => item.type === "swap");
          const day = baseDay;
          const isToday = day.date === todayIso;
          const hasTwo = !!day.secondSession;
          const done = day.dbId ? completions[day.dbId]?.completed : false;
          const swapped = Boolean(swappedMod);
          const d = parseIso(day.date);
          const dayNum = d.getDate();
          const monthShort = d.toLocaleDateString("pl-PL", { month: "short" }).replace(".", "");
          const RowIcon = sessionIcon(day);
          const isRest = day.dayType === "rest" || day.dayType === "recovery";
          return (
            <div key={day.date} className="relative overflow-hidden">
              {isToday && (
                <span className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-primary" />
              )}
              <Link
                to="/sesja/$date"
                params={{ date: day.date }}
                search={{ slot: 1 }}
                className="flex items-center gap-3.5 px-2 py-4 active:bg-secondary/35"
              >
                <div className="w-11 shrink-0 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {shortDayName(d)}
                  </div>
                  <div className="text-lg font-medium leading-none text-foreground">{dayNum}</div>
                  <div className="text-[10px] font-medium uppercase text-muted-foreground">
                    {monthShort}
                  </div>
                </div>

                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isRest ? "bg-[oklch(0.95_0.04_150)] text-[oklch(0.5_0.13_150)]" : "icon-bubble"
                  }`}
                >
                  <RowIcon className="h-6 w-6" strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-medium text-foreground">
                      {professionalSessionTitle(day.title)}
                    </h3>
                    {isToday && (
                      <span className="text-[9px] font-medium uppercase tracking-wide text-primary">
                        Dziś
                      </span>
                    )}
                    {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        isRest ? "bg-[oklch(0.6_0.13_150)]" : "bg-primary"
                      }`}
                    />
                    {swapped ? "Zamieniona" : (day.loadLabelOverride ?? shortTag(day))}
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
                  <span className="truncate">
                    Druga jednostka: {professionalSessionTitle(day.secondSession.title)}
                  </span>
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
          <details className="soft-card p-3">
            <summary className="min-h-11 cursor-pointer content-center text-sm">
              Ustawienia kolejnego tygodnia
            </summary>
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
              onClick={() => goToWeek(nextIndex)}
            >
              Przejdź do kolejnego tygodnia
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={() => setGateWeek(nextIndex)}
              className="mt-2 w-full text-center text-xs font-medium text-primary"
            >
              {seasonStatus === "off_season"
                ? "Ustaw datę meczu (opcjonalnie)"
                : "Zmień datę meczu"}
            </button>
          </details>
        </div>
      )}

      {/* Twarda blokada: modal wymuszający datę kolejnego meczu w sezonie */}
      <Dialog
        open={needMatchWeek !== null}
        onOpenChange={(v) => {
          if (!v) setNeedMatchWeek(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Uzupełnij kolejny mecz</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Data następnego meczu jest potrzebna, aby prawidłowo rozłożyć obciążenie, regenerację i
            dni MD.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              const target = needMatchWeek;
              setNeedMatchWeek(null);
              if (target !== null) setGateWeek(target);
            }}
          >
            <CalendarClock className="mr-1 h-4 w-4" />
            Dodaj datę meczu
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setNeedMatchWeek(null)}>
            Wróć do planu
          </Button>
        </DialogContent>
      </Dialog>

      {gateWeek !== null && gateWeekData && (
        <WeeklyGateSheet
          open={gateWeek !== null}
          onOpenChange={(v) => {
            if (!v) setGateWeek(null);
          }}
          weekNumber={gateWeek}
          nextWeekStart={gateWeekData.startDate}
          nextWeekEnd={gateWeekData.endDate}
          allowNoMatch={true}
          onConfirmed={() => {
            const target = gateWeekData.startDate;
            setGateWeek(null);
            void navigate({ to: "/plan", search: { week: target } });
          }}
        />
      )}
    </div>
  );
}
