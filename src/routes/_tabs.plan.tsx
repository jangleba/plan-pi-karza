import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { applyExerciseReplacements, useLoadwise } from "@/lib/loadwise/store";
import {
  formatDate,
  shortDayName,
  parseIso,
  professionalSessionTitle,
} from "@/lib/loadwise/labels";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import {
  buildPlanWeeks,
  computeWeekStats,
  validatePlanWeeks,
  type WeekPhase,
} from "@/lib/loadwise/planEngine";
import { resolveEffectiveDay, resolveTodayPlanRowSource } from "@/lib/loadwise/dailyCheckin";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { ProfileAvatar } from "@/components/loadwise/ui";
import { WeeklyGateSheet } from "@/components/loadwise/WeeklyGateSheet";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/app-ui";
import type { SessionDay, Intensity, Goal, PlanWeek } from "@/lib/loadwise/types";
import {
  ChevronRight,
  CheckCircle2,
  Dumbbell,
  ArrowRight,
  Leaf,
  Zap,
  Target,
  Activity,
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
  const weekPanelId = useId();
  const { state, todayIso, todaySession, updateProfile } = useLoadwise();
  const plan = useMemo(
    () => resolveEffectivePlan(state.plan, state.modifications),
    [state.plan, state.modifications],
  );
  const completions = state.completions;
  const profile = state.profile;
  const transitions = state.transitions;
  const [activeWeek, setActiveWeek] = useState(0);
  const [gateWeek, setGateWeek] = useState<number | null>(null);
  const [switchingSeason, setSwitchingSeason] = useState(false);
  const autoWeekKeyRef = useRef<string | null>(null);

  const weeks = buildPlanWeeks(plan, profile);

  useEffect(() => {
    if (weeks.length === 0) return;
    const autoKey = `${todayIso}:${plan[0]?.date ?? ""}:${plan.length}`;
    if (autoWeekKeyRef.current === autoKey) return;
    autoWeekKeyRef.current = autoKey;
    const todayWeekIndex = weeks.findIndex((week) =>
      week.days.some((day) => day.date === todayIso),
    );
    if (todayWeekIndex >= 0) {
      setActiveWeek(todayWeekIndex);
    }
  }, [weeks, todayIso, plan]);

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
  const todayAdjusted =
    todaySession && profile
      ? applyExerciseReplacements(
          resolveEffectiveDay(
            todaySession,
            state.readiness[todayIso],
            profile,
            state.modifications[todayIso] ?? [],
          ),
          state.exerciseReplacements[todayIso] ?? [],
        )
      : todaySession;

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
    !!transitions[i]?.nextMatchDate || (offseasonAllowed && !!transitions[i]?.noMatchNextWeek);

  // Tydzień 0 zawsze dostępny. Poza sezonem — pełna swoboda. W sezonie kolejny
  // tydzień wymaga zapisanej daty meczu dla każdego wcześniejszego przejścia.
  const canAccess = (i: number) => {
    if (i === 0) return true;
    if (seasonStatus === "off_season") return true;
    for (let j = 1; j <= i; j++) {
      if (!weekHasMatchDate(j)) return false;
    }
    return true;
  };

  // Najwcześniejszy tydzień bez daty meczu na drodze do i.
  const firstLockedUpTo = (i: number): number | null => {
    for (let j = 1; j <= i; j++) {
      if (!weekHasMatchDate(j)) return j;
    }
    return null;
  };

  // Jedyna droga zmiany aktywnego tygodnia — twarda blokada w kodzie.
  const goToWeek = (i: number) => {
    if (canAccess(i)) {
      setActiveWeek(i);
      return;
    }
    const locked = firstLockedUpTo(i);
    if (locked !== null) setGateWeek(locked);
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
  const hasNext = nextIndex < weeks.length;
  const nextTransition = transitions[nextIndex];

  // Kolejny tydzień gotowy: poza sezonem zawsze, w sezonie tylko z datą meczu.
  const nextReady = seasonStatus === "off_season" || weekHasMatchDate(nextIndex);

  // Granice tygodnia wymagającego daty meczu (dla bramki i modala).
  const gateNextIndex = gateWeek;
  const gateWeekData = gateNextIndex !== null ? (weeks[gateNextIndex] ?? null) : null;

  // Dni należące do aktywnego planu (ukryj dni przed startem planu).
  const visibleDays = (current?.days ?? []).filter((d) => !d.outsideActivePlan);
  const planStartDate = visibleDays[0]?.date ?? null;
  const hasHiddenBefore =
    (current?.days ?? []).some((d) => d.outsideActivePlan) && planStartDate !== null;

  // Po wejściu i przy zmianie tygodnia przewiń ekran na górę.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeWeek]);

  // Twarda blokada wejścia w zablokowany tydzień przez bezpośrednią zmianę
  // stanu (np. z historii / URL) — cofnij do najbliższego dostępnego tygodnia.
  useEffect(() => {
    if (!canAccess(activeWeek)) {
      const locked = firstLockedUpTo(activeWeek);
      setActiveWeek(locked !== null ? locked - 1 : 0);
      if (locked !== null) setGateWeek(locked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeek, transitions, seasonStatus]);

  return (
    <section className="bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="bw-page-title">Plan tygodnia</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {current
              ? `${formatDate(current.startDate)}–${formatDate(current.endDate)} · ${monthGoal}`
              : monthGoal}
          </p>
        </div>
        <ProfileAvatar />
      </header>

      {plan.length === 0 && (
        <p className="bw-section mt-8 text-sm text-muted-foreground">Generujemy Twój plan…</p>
      )}

      {weeks.length > 0 && (
        <Tabs
          className="mt-8"
          value={String(activeWeek)}
          options={weeks.map((_week, index) => ({
            value: String(index),
            label: `Tydzień ${index + 1}`,
            ariaLabel: `Tydzień ${index + 1}${!canAccess(index) ? " · zablokowany, uzupełnij datę meczu" : ""}`,
          }))}
          onChange={(value) => goToWeek(Number(value))}
          label="Tydzień planu"
          panelId={weekPanelId}
        />
      )}

      {seasonStatus === "off_season" && weeks.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Okres poza sezonem</p>
          <Button variant="ghost" disabled={switchingSeason} onClick={switchToSeasonal}>
            {switchingSeason ? "Zmieniamy…" : "Zmień na tryb sezonowy"}
          </Button>
        </div>
      )}

      <div id={weekPanelId} role="tabpanel" aria-label={`Tydzień ${activeWeek + 1}`} tabIndex={0}>
        <div className="bw-columns mt-8">
          {visibleDays.length > 0 && (
            <section className="bw-section max-w-2xl" aria-label="Obciążenie tygodnia">
              <div className="grid grid-cols-7 gap-1">
                {visibleDays.map(({ source }) => {
                  const day = resolveTodayPlanRowSource(source, todayIso, todayAdjusted);
                  const date = parseIso(day.date);
                  const isToday = day.date === todayIso;
                  return (
                    <Link
                      key={day.date}
                      to="/sesja/$date"
                      params={{ date: day.date }}
                      search={{ slot: 1 }}
                      aria-label={`${day.dayName}, ${formatDate(day.date)}: ${professionalSessionTitle(day.title)}`}
                      className={`flex min-h-12 min-w-0 flex-col items-center gap-2 py-2 text-sm ${isToday ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      <span>{shortDayName(date)}</span>
                      <span className="flex h-9 items-end">
                        <span
                          className={`w-1.5 rounded-full ${day.dayType === "match" ? "bg-[oklch(0.58_0.055_55)]" : isToday ? "bg-primary" : "bg-[oklch(0.62_0.035_151)]"}`}
                          style={{ height: loadBarHeight(day) }}
                        />
                      </span>
                      <span
                        className={`tabular-nums ${isToday ? "font-semibold text-primary" : ""}`}
                      >
                        {date.getDate()}
                      </span>
                    </Link>
                  );
                })}
              </div>
              {summary && (
                <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 text-sm text-muted-foreground">
                  <span>{summary.goal}</span>
                  <span>Obciążenie: {LOAD_LABEL[summary.load]}</span>
                </div>
              )}
            </section>
          )}

          <section className="bw-section bw-week-days grid gap-5" aria-label="Sesje tygodnia">
            {hasHiddenBefore && planStartDate && (
              <p className="text-sm text-muted-foreground">
                Plan zaczyna się {formatDate(planStartDate)}.
              </p>
            )}
            {visibleDays.map(({ source }) => {
              const day = resolveTodayPlanRowSource(source, todayIso, todayAdjusted);
              const swapped = (state.modifications[day.date] ?? []).some(
                (item) => item.type === "swap",
              );
              const done = day.dbId ? completions[day.dbId]?.completed : false;
              const d = parseIso(day.date);
              const RowIcon = sessionIcon(day);
              return (
                <div key={day.date} className="bw-week-day flex items-start gap-3 py-1 sm:gap-4">
                  <div className="bw-week-date w-10 shrink-0 pt-1 text-sm text-muted-foreground sm:w-14">
                    <div>{shortDayName(d)}</div>
                    <div className="bw-week-date-value text-xl font-medium tabular-nums text-foreground">
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="bw-week-sessions min-w-0 flex-1 space-y-3">
                    <Link
                      to="/sesja/$date"
                      params={{ date: day.date }}
                      search={{ slot: 1 }}
                      className="flex min-h-12 items-center gap-3 py-2"
                    >
                      <RowIcon
                        className={`h-5 w-5 shrink-0 ${day.dayType === "rest" || day.dayType === "recovery" ? "text-[oklch(0.5_0.13_150)]" : "text-primary"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold">
                          {professionalSessionTitle(day.title)}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {day.secondSession ? "Sesja 1 · " : ""}
                          {day.durationMin > 0 ? `${day.durationMin} min · ` : ""}
                          {swapped ? "Zamieniona" : (day.loadLabelOverride ?? shortTag(day))}
                        </p>
                        {(day.date === todayIso || done) && (
                          <div className="mt-1 flex items-center gap-2 text-sm text-primary">
                            {day.date === todayIso && <span className="font-medium">Dziś</span>}
                            {done && (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                                Wykonane
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                    {day.secondSession && (
                      <Link
                        to="/sesja/$date"
                        params={{ date: day.date }}
                        search={{ slot: 2 }}
                        className="flex min-h-12 items-center gap-3 py-2"
                      >
                        <span className="w-5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-semibold">
                            {professionalSessionTitle(day.secondSession.title)}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Sesja 2 · {day.secondSession.durationMin} min
                          </p>
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>

        {hasNext && current && (
          <section className="bw-section mt-8">
            <h2 className="bw-section-title">Kolejny tydzień</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {nextTransition?.nextMatchDate
                ? `Kolejny mecz: ${formatDate(nextTransition.nextMatchDate)}.`
                : offseasonAllowed && nextTransition?.noMatchNextWeek
                  ? "Tydzień bez meczu."
                  : "Uzupełnij datę kolejnego meczu."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Button onClick={() => (nextReady ? goToWeek(nextIndex) : setGateWeek(nextIndex))}>
                Przejdź do kolejnego tygodnia <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setGateWeek(nextIndex)}>
                {seasonStatus === "off_season" ? "Ustaw datę meczu" : "Zmień datę meczu"}
              </Button>
            </div>
          </section>
        )}
      </div>

      {gateWeek !== null && gateWeekData && (
        <WeeklyGateSheet
          open
          onOpenChange={(open) => {
            if (!open) setGateWeek(null);
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
    </section>
  );
}
