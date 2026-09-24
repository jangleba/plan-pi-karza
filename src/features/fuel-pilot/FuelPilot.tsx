import { Apple, CalendarDays, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  buildFuelRecommendation,
  type AthleteProfile,
  type FuelEntry,
  type FuelTab,
  type MealOption,
  type QuickSignals,
  type TrainingSession
} from "./engine/fuelEngine";
import { DayTab } from "./components/DayTab";
import { ExplainSheet } from "./components/ExplainSheet";
import { FoodTab } from "./components/FoodTab";
import { NowTab } from "./components/NowTab";
import { QuickCheckSheet } from "./components/QuickCheckSheet";
import "./styles.css";

export interface FuelPilotProps {
  athlete: AthleteProfile;
  sessions: TrainingSession[];
  entries?: FuelEntry[];
  now?: string;
  initialSignals?: QuickSignals;
  className?: string;
  onOpenPlan?: () => void;
  onEditSession?: (session?: TrainingSession) => void;
  onAddFood?: (suggested?: MealOption) => void;
  onSignalsChange?: (signals: QuickSignals) => void;
}

function nearestRelevantSession(nowIso: string, sessions: TrainingSession[]) {
  const now = new Date(nowIso).getTime();
  return [...sessions]
    .filter((session) => {
      const start = new Date(session.startAt).getTime();
      const recoveryEnd = start + (session.durationMinutes + 240) * 60_000;
      return Number.isFinite(start) && recoveryEnd >= now;
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
}

export function FuelPilot({
  athlete,
  sessions,
  entries = [],
  now,
  initialSignals,
  className = "",
  onOpenPlan,
  onEditSession,
  onAddFood,
  onSignalsChange
}: FuelPilotProps) {
  const [clock, setClock] = useState(now ?? new Date().toISOString());
  const [activeTab, setActiveTab] = useState<FuelTab>("now");
  const [signals, setSignals] = useState<QuickSignals>(initialSignals ?? { prepMinutes: 10, place: "home" });
  const [selectedMealId, setSelectedMealId] = useState<string>();
  const [showCheck, setShowCheck] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (now) {
      setClock(now);
      return;
    }
    const interval = window.setInterval(() => setClock(new Date().toISOString()), 30_000);
    return () => window.clearInterval(interval);
  }, [now]);

  const session = useMemo(() => nearestRelevantSession(clock, sessions), [clock, sessions]);
  const nextSession = useMemo(
    () => sessions
      .filter((candidate) => candidate.id !== session?.id && new Date(candidate.startAt).getTime() > new Date(clock).getTime())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0],
    [clock, session?.id, sessions]
  );

  const recommendation = useMemo(
    () => buildFuelRecommendation({
      now: clock,
      athlete,
      session,
      nextSessionAt: nextSession?.startAt,
      entries,
      signals
    }),
    [athlete, clock, entries, nextSession?.startAt, session, signals]
  );

  useEffect(() => {
    if (!selectedMealId || !recommendation.options.some((option) => option.id === selectedMealId)) {
      setSelectedMealId(recommendation.options[0]?.id);
    }
  }, [recommendation.options, selectedMealId]);

  const selectedMeal = recommendation.options.find((option) => option.id === selectedMealId);
  const tabs: Array<{ id: FuelTab; label: string }> = [
    { id: "now", label: "Teraz" },
    { id: "day", label: "Mój dzień" },
    { id: "food", label: "Jedzenie" }
  ];

  const completeCheck = (nextSignals: QuickSignals) => {
    setSignals(nextSignals);
    setShowCheck(false);
    onSignalsChange?.(nextSignals);
  };

  const swapMeal = () => {
    if (recommendation.options.length < 2) return;
    const currentIndex = recommendation.options.findIndex((option) => option.id === selectedMealId);
    const nextIndex = (currentIndex + 1) % recommendation.options.length;
    setSelectedMealId(recommendation.options[nextIndex].id);
  };

  return (
    <main className={`bw-fuel ${className}`}>
      <header className="bw-fuel-header">
        <div>
          <p><span /> BALLWISE</p>
          <h1>Fuel</h1>
        </div>
        <button className="bw-fuel-header__settings" type="button" onClick={() => setShowCheck(true)} aria-label="Ustaw kontekst">
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </header>

      <nav className="bw-fuel-tabs" aria-label="Sekcje Fuel">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "bw-fuel-tabs__active" : ""}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="bw-fuel-stage" key={activeTab}>
        {activeTab === "now" && (
          <NowTab
            recommendation={recommendation}
            selectedMeal={selectedMeal}
            sessionTitle={session?.title}
            onChooseMeal={() => selectedMeal ? onAddFood?.(selectedMeal) : onOpenPlan?.()}
            onAlternate={() => setActiveTab("food")}
            onOpenQuickCheck={() => setShowCheck(true)}
            onOpenExplanation={() => setShowExplanation(true)}
            onPlanChanged={() => onEditSession?.(session)}
          />
        )}
        {activeTab === "day" && (
          <DayTab
            now={clock}
            session={session}
            entries={entries}
            recommendation={recommendation}
            onOpenExplanation={() => setShowExplanation(true)}
            onAddEntry={() => onAddFood?.(selectedMeal)}
          />
        )}
        {activeTab === "food" && (
          <FoodTab
            options={recommendation.options}
            selectedId={selectedMealId}
            signals={signals}
            onSelect={(meal) => setSelectedMealId(meal.id)}
            onSwap={swapMeal}
            onOpenQuickCheck={() => setShowCheck(true)}
          />
        )}
      </div>

      <div className="bw-fuel-floating-actions" aria-label="Szybkie działania">
        <button type="button" onClick={() => onAddFood?.(selectedMeal)}><Plus aria-hidden="true" /> Dodaj jedzenie</button>
        <button type="button" onClick={onOpenPlan}><CalendarDays aria-hidden="true" /></button>
        <button type="button" onClick={() => setActiveTab("food")}><Apple aria-hidden="true" /></button>
      </div>

      {showCheck && <QuickCheckSheet initial={signals} onClose={() => setShowCheck(false)} onComplete={completeCheck} />}
      {showExplanation && <ExplainSheet recommendation={recommendation} onClose={() => setShowExplanation(false)} />}
    </main>
  );
}

