import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { SessionDay, Intensity, Goal, PlanWeek, WeekPhase } from "@/lib/loadwise/types";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  CalendarClock,
  CalendarDays,
  SlidersHorizontal,
  Dumbbell,
  ArrowRight,
  Leaf,
  Zap,
  Target,
  Activity,
  Plus,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import {
  prepareSessionSheet,
  SessionSheet,
  useSessionSheet,
} from "@/components/loadwise/session/SessionSheet";
import {
  parseSessionSheetSearch,
  type SessionSheetSearch,
} from "@/components/loadwise/session/sessionSheetSearch";
import "@/styles/ballwise-plan.css";

/** A plain tap opens the training panel; modified clicks keep the link's own page. */
function opensPanel(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  return true;
}

export const Route = createFileRoute("/_tabs/plan")({
  validateSearch: (search: Record<string, unknown>): { week?: string } & SessionSheetSearch => ({
    week:
      typeof search.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.week)
        ? search.week
        : undefined,
    ...parseSessionSheetSearch(search),
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
  if (day.dayType === "match" || day.dayType === "club") return Target;
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
      if (t.includes("sił")) return "Siła";
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

type PlanPanel = "adaptation" | "load" | "next";

function PlanDetailButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="bw-plan-detail-button"
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <span className="bw-plan-detail-icon">
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span>{label}</span>
      <ChevronRight
        className="bw-plan-detail-chevron"
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}

function PlanScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const requestedWeek = search.week;
  const unit = useSessionSheet(search);
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
  const [planPanel, setPlanPanel] = useState<PlanPanel>("load");
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const openPlanPanel = (panel: PlanPanel) => {
    setPlanPanel(panel);
    setPlanPanelOpen(true);
  };
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [gateWeek, setGateWeek] = useState<number | null>(null);
  const [needMatchWeek, setNeedMatchWeek] = useState<number | null>(null);
  const [switchingSeason, setSwitchingSeason] = useState(false);
  const autoWeekKeyRef = useRef<string | null>(null);
  const observedTodayRef = useRef(todayIso);

  const weeks = useMemo(() => selectPlanWeeks(plan, profile), [plan, profile]);

  useEffect(() => {
    if (weeks.length === 0) return;
    const weekRolledOver =
      observedTodayRef.current !== todayIso &&
      currentWeekIndex(weeks, observedTodayRef.current) !== currentWeekIndex(weeks, todayIso);
    observedTodayRef.current = todayIso;
    const autoKey = `${todayIso}:${plan[0]?.date ?? ""}:${plan.length}:${requestedWeek ?? ""}`;
    if (autoWeekKeyRef.current === autoKey) return;
    autoWeekKeyRef.current = autoKey;
    const requestedIndex =
      requestedWeek && !weekRolledOver
        ? weeks.findIndex((week) => week.startDate === requestedWeek)
        : -1;
    const todayWeekIndex = requestedIndex >= 0 ? requestedIndex : currentWeekIndex(weeks, todayIso);
    if (todayWeekIndex >= 0) {
      setActiveWeek(todayWeekIndex);
    }
    if (weekRolledOver && requestedWeek)
      void navigate({ to: "/plan", search: { week: undefined }, replace: true });
  }, [weeks, todayIso, plan, requestedWeek, navigate]);

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
      // Keep one Plan entry in history, carrying its selected week. Opening a
      // session and going back should restore that week, including past weeks.
      void navigate({ to: "/plan", search: { week: weeks[i].startDate }, replace: true });
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
  // Only days before the block start are "outside the plan"; the note must not
  // describe a week that simply ends early.
  const hasHiddenBefore =
    planStartDate !== null &&
    (current?.days ?? []).some((d) => d.outsideActivePlan && d.date < planStartDate);

  // Router restores entry scroll. Only a week change needs a second scroll operation.
  const previousWeek = useRef(activeWeek);
  useEffect(() => {
    if (previousWeek.current === activeWeek) return;
    previousWeek.current = activeWeek;
    setPlanPanelOpen(false);
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
      <AppHeader title="Plan" sketch="pitch" />

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
            <ChevronRight size={17} />
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
        <div className="bw-plan-adaptation">
          <PlanDetailButton
            icon={SlidersHorizontal}
            label="Dopasowanie planu"
            onClick={() => openPlanPanel("adaptation")}
          />
        </div>
      )}

      {/* Dni tygodnia */}
      <div className="bw-plan-days bw-grouped-list mx-5 mt-3" aria-label="Treningi w tym tygodniu">
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
          const secondOpen = !!expandedDays[day.date];
          const fullTitle = professionalSessionTitle(day.title);
          const RowIcon = sessionIcon(day);
          return (
            <div key={day.date} className="bw-plan-day" data-today={isToday || undefined}>
              <div className="bw-plan-day-main">
                <Link
                  to="/sesja/$date"
                  params={{ date: day.date }}
                  search={{ slot: 1 }}
                  preload={false}
                  onPointerEnter={prepareSessionSheet}
                  onTouchStart={prepareSessionSheet}
                  onClick={(event) => {
                    if (opensPanel(event)) unit.open({ date: day.date, slot: 1 });
                  }}
                  className="bw-plan-day-link"
                  aria-label={`${formatDate(day.date)}: ${fullTitle}${day.durationMin > 0 ? `, ${day.durationMin} min` : ""}${isToday ? ", dziś" : ""}${done ? ", wykonano" : ""}`}
                >
                  <div className="bw-plan-date" aria-hidden="true">
                    <span>{shortDayName(d)}</span>
                    <strong>
                      {dayNum} <small>{monthShort}</small>
                    </strong>
                  </div>
                  <RowIcon
                    className="bw-plan-type-icon"
                    size={19}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="bw-plan-day-copy">
                    <div className="bw-plan-title-line">
                      <h3 className="bw-plan-day-title" title={fullTitle}>
                        {professionalSessionTitle(day.title)}
                      </h3>
                      {done && (
                        <CheckCircle2 className="bw-plan-completed" size={15} aria-hidden="true" />
                      )}
                    </div>
                    <p className="bw-plan-day-meta">
                      {isToday && (
                        <span className="bw-plan-today">
                          Dziś <span aria-hidden="true">·</span>{" "}
                        </span>
                      )}
                      {swapped ? "Zamieniona" : (day.loadLabelOverride ?? shortTag(day))}
                      {day.durationMin > 0 && <span> · {day.durationMin} min</span>}
                    </p>
                  </div>
                  {!hasTwo && (
                    <ChevronRight className="bw-plan-chevron" size={15} aria-hidden="true" />
                  )}
                </Link>
                {hasTwo && (
                  <button
                    type="button"
                    className="bw-plan-more"
                    aria-label={`${secondOpen ? "Zwiń" : "Pokaż"} drugą sesję: ${formatDate(day.date)}`}
                    aria-expanded={secondOpen}
                    aria-controls={`second-session-${day.date}`}
                    onClick={() =>
                      setExpandedDays((previous) => ({
                        ...previous,
                        [day.date]: !previous[day.date],
                      }))
                    }
                  >
                    {secondOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <>
                        <Plus size={12} />
                        <span>1</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {hasTwo && day.secondSession && secondOpen && (
                <div id={`second-session-${day.date}`} className="bw-plan-second-session">
                  <Link
                    to="/sesja/$date"
                    params={{ date: day.date }}
                    search={{ slot: 2 }}
                    preload={false}
                    onClick={(event) => {
                      if (opensPanel(event)) unit.open({ date: day.date, slot: 2 });
                    }}
                  >
                    <span>
                      <small>Druga sesja</small>
                      <strong>{professionalSessionTitle(day.secondSession.title)}</strong>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bw-plan-tools">
        <PlanDetailButton
          icon={Activity}
          label="Cel i obciążenie"
          onClick={() => openPlanPanel("load")}
        />
        {hasNext && current && (
          <PlanDetailButton
            icon={CalendarDays}
            label="Kolejny tydzień"
            onClick={() => openPlanPanel("next")}
          />
        )}
      </div>

      <Sheet open={planPanelOpen} onOpenChange={setPlanPanelOpen}>
        <SheetContent className="bw-plan-detail-sheet">
          <SheetTitle>
            {planPanel === "adaptation"
              ? "Dopasowanie planu"
              : planPanel === "load"
                ? "Cel i obciążenie"
                : "Kolejny tydzień"}
          </SheetTitle>
          <SheetDescription>
            {planPanel === "adaptation"
              ? "Dlaczego Twój plan wygląda w ten sposób."
              : planPanel === "load"
                ? `Tydzień ${activeWeek + 1} · ${current ? `${formatDate(current.startDate)}–${formatDate(current.endDate)}` : ""}`
                : "Terminarz i przejście do następnego tygodnia."}
          </SheetDescription>
          {planPanel === "adaptation" && planningMeta && (
            <>
              {planningMeta.planningStatus === "health_limited" && (
                <p className="bw-plan-detail-notice">Plan ograniczony ze względu na zdrowie</p>
              )}
              {!planningMeta.planningNotes?.length && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Szczegóły dopasowania nie są dostępne dla tego tygodnia.
                </p>
              )}
              <ul className="bw-plan-adjustments">
                {planningMeta.planningNotes?.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
          {planPanel === "load" && (
            <div className="bw-plan-week-detail">
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
                            preload={false}
                            onClick={(event) => {
                              if (!opensPanel(event)) return;
                              setPlanPanelOpen(false);
                              unit.open({ date: day.date, slot: 1 });
                            }}
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
                            <span
                              className={`text-[11px] tabular-nums ${isToday ? "font-medium" : ""}`}
                            >
                              {date.getDate()}
                            </span>
                            {isToday && <span className="h-0.5 w-5 rounded-full bg-primary" />}
                          </Link>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Obciążenie w tym tygodniu</span>
                      <span>{summary ? LOAD_LABEL[summary.load] : null}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Kierunek mikrocyklu — jeden spokojny wiersz */}
              {summary && (
                <div className="px-5 pt-3">
                  <p className="mb-2 text-sm font-medium text-foreground">{monthGoal}</p>
                  <div className="border-b border-border/75 px-1 pb-3">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Cel tygodnia
                    </span>
                    <span className="mt-1 block text-sm font-medium text-foreground">
                      {summary.goal}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          {planPanel === "next" && hasNext && current && (
            <div className="bw-plan-next-detail">
              <p className="mt-1 text-sm text-muted-foreground">
                {nextTransition?.nextMatchDate
                  ? `Kolejny mecz: ${formatDate(nextTransition.nextMatchDate)}.`
                  : offseasonAllowed && nextTransition?.noMatchNextWeek
                    ? "Kolejny tydzień bez meczu (poza sezonem)."
                    : "Kolejny mecz: nie ustawiono."}
              </p>

              <Button
                className="mt-3 w-full"
                onClick={() => {
                  setPlanPanelOpen(false);
                  goToWeek(nextIndex);
                }}
              >
                Otwórz kolejny tydzień
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setPlanPanelOpen(false);
                  setGateWeek(nextIndex);
                }}
                className="mt-2 w-full"
              >
                {seasonStatus === "off_season"
                  ? "Ustaw datę meczu (opcjonalnie)"
                  : "Zmień datę meczu"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

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

      <SessionSheet target={unit.target} onClose={unit.close} onSelect={unit.select} />

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
