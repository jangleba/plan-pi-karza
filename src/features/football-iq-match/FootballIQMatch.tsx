import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { ChoiceGroup, Tabs } from "@/components/ui/app-ui";
import { buildReferencePlan, emptyPlan, evaluatePlan } from "./engine";
import { Onboarding } from "./Onboarding";
import { Pitch } from "./Pitch";
import { scenarios } from "./scenarios";
import type { ActionMode, Evaluation, Phase, TacticalIntent, UserPlan } from "./types";
import "./football-iq.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; score: number }) => void;
};

const onboardingKey = "ballwise:football-iq:onboarding-pro-v2-seen";

const intentOptions: Array<{ value: TacticalIntent; label: string }> = [
  { value: "switch", label: "Zmiana strony" },
  { value: "progress", label: "Progresja" },
  { value: "retain", label: "Utrzymanie" },
  { value: "secure", label: "Zabezpieczenie" },
];

const modeOptions: Array<{ value: ActionMode; label: string; short: string }> = [
  { value: "run", label: "Ruch zawodnika", short: "Ruch" },
  { value: "pass", label: "Podanie", short: "Podanie" },
  { value: "group", label: "Ruch grupy", short: "Grupa" },
];

const intentLabel = (intent?: TacticalIntent) =>
  intentOptions.find((option) => option.value === intent)?.label ?? "Bez wskazanej intencji";

const shouldShowOnboarding = (enabled: boolean) => {
  if (!enabled || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(onboardingKey) !== "1";
  } catch {
    return true;
  }
};

const timeNow = () => (typeof performance === "undefined" ? Date.now() : performance.now());

export function FootballIQMatch({
  initialScenario = 0,
  showOnboardingInitially = true,
  onBack,
  onComplete,
}: Props) {
  const safeInitialIndex =
    ((initialScenario % scenarios.length) + scenarios.length) % scenarios.length;
  const [scenarioIndex, setScenarioIndex] = useState(safeInitialIndex);
  const scenario = scenarios[scenarioIndex];
  const ballCarrier = scenario.players.find((player) => player.id === scenario.ball.carrierId);
  const canPlanPass = !ballCarrier || ballCarrier.team === "home";
  const [phase, setPhase] = useState<Phase>("intro");
  const [phaseStartedAt, setPhaseStartedAt] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(scenario.decisionSeconds);
  const [plan, setPlan] = useState<UserPlan>(() => emptyPlan());
  const [mode, setMode] = useState<ActionMode>("run");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [coachNote, setCoachNote] = useState("Obserwuj ustawienie obu zespołów");
  const [hintLevel, setHintLevel] = useState(0);
  const [onboardingStep, setOnboardingStep] = useState(-1);
  const [compareView, setCompareView] = useState<"user" | "reference">("reference");
  const planRef = useRef(plan);
  const { requestExit } = useActivityExitGuard({
    dirty: plan.actions.length > 0 && phase !== "feedback" && phase !== "compare",
    description: "Niezakończony plan decyzji zostanie odrzucony.",
    pause: () => {
      const now = timeNow();
      pausedAtRef.current = now;
      setPausedAt(now);
    },
    resume: () => {
      if (pausedAtRef.current !== null) {
        const pausedDuration = timeNow() - pausedAtRef.current;
        setPhaseStartedAt((started) => started + pausedDuration);
      }
      pausedAtRef.current = null;
      setPausedAt(null);
    },
  });

  useEffect(() => {
    if (shouldShowOnboarding(showOnboardingInitially)) setOnboardingStep(0);
  }, [showOnboardingInitially]);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const enterPhase = useCallback((nextPhase: Phase) => {
    setPhaseStartedAt(timeNow());
    setPhase(nextPhase);
  }, []);

  usePausedTimeout(
    () => {
      if (countdown > 1) setCountdown((value) => value - 1);
      else {
        setCoachNote("Obserwuj piłkę, blok rywala i dalszą stronę");
        enterPhase("observe");
      }
    },
    phase === "countdown" ? 620 : null,
    pausedAt !== null,
    `${phase}:${countdown}`,
  );
  usePausedTimeout(
    () => {
      navigator.vibrate?.([18, 34, 18]);
      setSecondsLeft(scenario.decisionSeconds);
      setMode("run");
      setCoachNote("Wybierz narzędzie i zbuduj plan");
      enterPhase("plan");
    },
    phase === "observe" ? scenario.observationMs : null,
    pausedAt !== null,
    `${phase}:${scenario.id}`,
  );
  usePausedTimeout(
    () => setSecondsLeft((value) => Math.max(0, value - 1)),
    phase === "plan" && secondsLeft > 0 ? 1000 : null,
    pausedAt !== null,
    `${phase}:${secondsLeft}`,
  );
  useEffect(() => {
    if (phase !== "plan" || secondsLeft !== 0) return;
    setCoachNote("Dokończ plan — tempo nie obniża oceny");
    navigator.vibrate?.(18);
  }, [phase, secondsLeft]);
  usePausedTimeout(
    () => {
      const result = evaluatePlan(scenario, planRef.current);
      setEvaluation(result);
      enterPhase("feedback");
      onComplete?.({ scenarioId: scenario.id, score: result.score });
    },
    phase === "playback" ? scenario.playbackMs : null,
    pausedAt !== null,
    `${phase}:${scenario.id}`,
  );

  useEffect(() => {
    setSecondsLeft(scenario.decisionSeconds);
  }, [scenario.decisionSeconds]);

  const start = () => {
    const freshPlan = emptyPlan();
    planRef.current = freshPlan;
    setPlan(freshPlan);
    setEvaluation(null);
    setHintLevel(0);
    setCountdown(3);
    setSecondsLeft(scenario.decisionSeconds);
    setMode("run");
    setCompareView("reference");
    setCoachNote("Za chwilę zobaczysz sytuację meczową");
    enterPhase("countdown");
  };

  const undo = () => {
    if (!plan.actions.length) return;
    const nextPlan = { ...plan, actions: plan.actions.slice(0, -1) };
    setPlan(nextPlan);
    setCoachNote("Usunięto ostatnią akcję z planu");
    navigator.vibrate?.(12);
  };

  const openIntent = () => {
    if (!plan.actions.length) {
      setCoachNote("Najpierw zaplanuj przynajmniej jeden ruch albo podanie");
      navigator.vibrate?.(35);
      return;
    }
    setCoachNote("Co chcesz osiągnąć tym planem?");
    enterPhase("intent");
  };

  const selectIntent = (intent: TacticalIntent) => {
    setPlan((current) => ({ ...current, intent }));
    navigator.vibrate?.(10);
  };

  const play = () => {
    if (!plan.intent) {
      setCoachNote("Wybierz intencję — dzięki temu analiza oceni nie tylko kreski");
      navigator.vibrate?.(35);
      return;
    }
    setCoachNote("Patrz, jak rywal reaguje na Twój plan");
    enterPhase("playback");
  };

  const retry = () => {
    const freshPlan = emptyPlan();
    planRef.current = freshPlan;
    setPlan(freshPlan);
    setEvaluation(null);
    setHintLevel(0);
    setSecondsLeft(scenario.decisionSeconds);
    setMode("run");
    setCompareView("reference");
    setCoachNote("Ta sama sytuacja — znajdź lepsze rozwiązanie");
    enterPhase("plan");
  };

  const next = () => {
    const nextIndex = (scenarioIndex + 1) % scenarios.length;
    const nextPlan = emptyPlan();
    planRef.current = nextPlan;
    setScenarioIndex(nextIndex);
    setPlan(nextPlan);
    setEvaluation(null);
    setHintLevel(0);
    setCountdown(3);
    setMode("run");
    setCompareView("reference");
    setCoachNote("Najpierw przeczytaj sytuację, potem rozpocznij akcję");
    enterPhase("intro");
  };

  const hints = useMemo(() => {
    const defensiveScene = scenario.id === "counterpress" || scenario.id === "defensive-cover";
    const first = defensiveScene
      ? "Najpierw wskaż przestrzeń, którą rywal może zaatakować bezpośrednio po stracie."
      : scenario.id === "escape-press"
        ? "Znajdź partnera albo strefę poza cieniem pressingu pierwszej linii."
        : "Spójrz tam, gdzie blok rywala ma najdalej do przesunięcia.";
    return [
      first,
      scenario.cue,
      scenario.preferredPassZones.length
        ? "Ułóż kolejność: ruch otwierający przestrzeń, wsparcie i podanie we właściwym momencie."
        : "Nie biegnij wyłącznie do piłki — zabezpiecz najgroźniejszą przestrzeń i odległość od partnera.",
    ];
  }, [scenario]);

  const referencePlan = useMemo(() => buildReferencePlan(scenario), [scenario]);

  const requestHint = () => {
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    setCoachNote(hints[nextLevel - 1]);
    navigator.vibrate?.(8);
  };

  const replayObservation = () => {
    setCoachNote("Powtórka sytuacji — obserwuj zmianę ustawienia przed momentem decyzji");
    enterPhase("observe");
  };

  const closeOnboarding = () => {
    try {
      window.localStorage.setItem(onboardingKey, "1");
    } catch {
      // Private browsing may block storage; closing should still work.
    }
    setOnboardingStep(-1);
  };

  const timerText = useMemo(() => {
    if (phase === "countdown") return String(countdown);
    if (phase === "observe") return "Obserwuj";
    if (phase === "plan") return secondsLeft > 0 ? `${secondsLeft}s` : "Plan";
    if (phase === "intent") return "Cel";
    if (phase === "playback") return "Odtwarzanie";
    if (phase === "feedback") return "Analiza";
    if (phase === "compare") return "Porównanie";
    return "IQ";
  }, [phase, countdown, secondsLeft]);

  const stagePrompt =
    phase === "intro"
      ? scenario.prompt
      : phase === "observe"
        ? "Obserwuj ustawienie obu zespołów"
        : phase === "playback"
          ? "Obserwuj reakcję rywala"
          : phase === "compare"
            ? compareView === "reference"
              ? "Wariant pokazany na boisku"
              : "Twój plan pokazany na boisku"
            : scenario.prompt;
  const actionCount = plan.actions.length;
  const isReview = phase === "feedback" || phase === "compare";

  return (
    <section className={`bw-workspace bwiq-app${isReview ? " bwiq-app--review" : ""}`}>
      <header className="bwiq-header">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => requestExit(() => onBack?.(), "route")}
          aria-label="Wróć do Start"
        >
          <ArrowLeft />
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">
            Decyzja {scenarioIndex + 1}/{scenarios.length}
          </p>
        </div>
        <span className="bwiq-status" aria-label={`Status: ${timerText}`}>
          {timerText}
        </span>
        <h1 className="bw-page-title">{scenario.title}</h1>
      </header>
      <section className="bwiq-stage" aria-label={`Scena: ${scenario.title}`}>
        <Pitch
          players={scenario.players}
          ball={scenario.ball}
          plan={phase === "compare" && compareView === "reference" ? referencePlan : plan}
          phase={phase}
          phaseStartedAt={phaseStartedAt}
          pausedAt={pausedAt}
          durationMs={scenario.observationMs}
          mode={mode}
          playbackDurationMs={scenario.playbackMs}
          onPlanChange={setPlan}
          onHint={setCoachNote}
        />
        {phase === "countdown" && (
          <div className="bwiq-countdown" aria-live="polite">
            {countdown}
          </div>
        )}
      </section>
      <section className="bwiq-utility" aria-label="Plan i analiza decyzji">
        {onboardingStep >= 0 ? (
          <Onboarding
            step={onboardingStep}
            onNext={() => setOnboardingStep((step) => Math.min(2, step + 1))}
            onClose={closeOnboarding}
          />
        ) : (
          <>
            {!isReview && <p className="bwiq-prompt">{stagePrompt}</p>}
            {phase === "intro" && (
              <Button className="bwiq-primary" onClick={start}>
                Rozpocznij
              </Button>
            )}
            {(phase === "countdown" || phase === "observe" || phase === "playback") && (
              <p role="status" className="text-sm text-muted-foreground">
                {coachNote}
              </p>
            )}
            {phase === "plan" && (
              <>
                <ChoiceGroup
                  label="Narzędzie"
                  value={mode}
                  options={modeOptions.map((option) => ({
                    value: option.value,
                    label: option.short,
                    disabled: option.value === "pass" && !canPlanPass,
                  }))}
                  onChange={setMode}
                  className="bwiq-modes"
                />
                {!canPlanPass && (
                  <p className="text-sm text-muted-foreground">
                    Rywal ma piłkę — zaplanuj pressing lub zabezpieczenie.
                  </p>
                )}
                <p className="bwiq-coach-note" role="status">
                  {hintLevel > 0 ? `${hintLevel}/3 · ` : ""}
                  {coachNote}
                </p>
                <div className="bwiq-tools">
                  <Button
                    variant="outline"
                    className="bwiq-secondary"
                    onClick={undo}
                    disabled={!actionCount}
                  >
                    <Undo2 />
                    Cofnij
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={replayObservation}
                  >
                    Powtórka
                  </Button>
                  <Button variant="ghost" className="text-[var(--bwiq-blue)]" onClick={requestHint}>
                    Podpowiedź{hintLevel ? ` ${hintLevel}/3` : ""}
                  </Button>
                </div>
                <div className="bwiq-actions">
                  <span className="text-sm text-muted-foreground">{actionCount}/8 akcji</span>
                  <Button className="bwiq-primary" onClick={openIntent} disabled={!actionCount}>
                    Wybierz cel
                  </Button>
                </div>
              </>
            )}
            {phase === "intent" && (
              <>
                <ChoiceGroup
                  label="Cel planu"
                  value={plan.intent ?? ""}
                  options={intentOptions}
                  onChange={(value) => {
                    if (value) selectIntent(value as TacticalIntent);
                  }}
                  className="bwiq-intents"
                />
                <div className="bwiq-actions">
                  <Button variant="ghost" onClick={() => enterPhase("plan")}>
                    Wróć do planu
                  </Button>
                  <Button className="bwiq-primary" onClick={play} disabled={!plan.intent}>
                    Odtwórz
                  </Button>
                </div>
              </>
            )}
            {phase === "feedback" && evaluation && (
              <>
                <div className="bwiq-feedback-head">
                  <p className="bwiq-score">
                    {evaluation.score}
                    <span>/100</span>
                  </p>
                  <h2>{evaluation.title}</h2>
                </div>
                <p className="text-muted-foreground">{evaluation.summary}</p>
                <section className="bwiq-recommendation">
                  <h3>Poprawka</h3>
                  <p>{evaluation.recommendation}</p>
                </section>
                <dl className="bwiq-metrics">
                  {(
                    [
                      ["Przestrzeń", evaluation.metrics.space],
                      ["Sekwencja", evaluation.metrics.timing],
                      ["Podanie", evaluation.metrics.passing],
                      ["Ryzyko", evaluation.metrics.risk],
                      ["Struktura", evaluation.metrics.structure],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <span className="bwiq-metric-bar">
                          <i style={{ width: `${value}%` }} />
                        </span>
                        <span>{value}/100</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm text-muted-foreground">
                  {actionCount} {actionCount === 1 ? "akcja" : "akcje"} · {intentLabel(plan.intent)}
                </p>
                <section className="bwiq-feedback-section">
                  <h3>Reakcja rywala</h3>
                  <p>{evaluation.reaction}</p>
                </section>
                {evaluation.strengths.length > 0 && (
                  <section className="bwiq-feedback-section good">
                    <h3>Mocne strony</h3>
                    <ul>
                      {evaluation.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {evaluation.issues.length > 0 && (
                  <section className="bwiq-feedback-section issue">
                    <h3>Do poprawy</h3>
                    <ul>
                      {evaluation.issues.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
                <div className="bwiq-actions">
                  <Button variant="outline" className="bwiq-secondary" onClick={retry}>
                    <RotateCcw />
                    Ponownie
                  </Button>
                  <Button
                    variant="outline"
                    className="bwiq-secondary"
                    onClick={() => {
                      setCompareView("reference");
                      enterPhase("compare");
                    }}
                  >
                    Porównaj
                  </Button>
                  <Button className="bwiq-primary" onClick={next}>
                    Następna
                  </Button>
                </div>
              </>
            )}
            {phase === "compare" && evaluation && (
              <>
                <h2>Porównanie planów</h2>
                <Tabs
                  value={compareView}
                  options={[
                    { value: "user", label: "Twój plan" },
                    { value: "reference", label: "Wariant" },
                  ]}
                  onChange={setCompareView}
                  label="Plan widoczny na boisku"
                  panelId="iq-comparison"
                />
                <section
                  id="iq-comparison"
                  role="tabpanel"
                  aria-label={compareView === "user" ? "Twój plan" : "Wariant"}
                  className="bwiq-feedback-section"
                >
                  <h3>
                    {compareView === "user"
                      ? intentLabel(plan.intent)
                      : "Więcej przewagi, mniej ryzyka"}
                  </h3>
                  <p>
                    {compareView === "user"
                      ? (evaluation.issues[0] ?? evaluation.summary)
                      : evaluation.recommendation}
                  </p>
                </section>
                <section className="bwiq-feedback-section">
                  <h3>Reakcja rywala</h3>
                  <p>{evaluation.reaction}</p>
                </section>
                <div className="bwiq-actions">
                  <Button
                    variant="outline"
                    className="bwiq-secondary"
                    onClick={() => enterPhase("feedback")}
                  >
                    Analiza
                  </Button>
                  <Button variant="outline" className="bwiq-secondary" onClick={retry}>
                    Popraw plan
                  </Button>
                  <Button className="bwiq-primary" onClick={next}>
                    Następna
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function usePausedTimeout(
  callback: () => void,
  delay: number | null,
  paused: boolean,
  resetKey: string,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const remaining = useRef(delay ?? 0);
  const previous = useRef({ delay, resetKey });
  useEffect(() => {
    if (previous.current.delay !== delay || previous.current.resetKey !== resetKey) {
      remaining.current = delay ?? 0;
      previous.current = { delay, resetKey };
    }
    if (delay === null || paused) return;
    const started = timeNow();
    const timer = window.setTimeout(() => {
      remaining.current = 0;
      callbackRef.current();
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (timeNow() - started));
    };
  }, [delay, paused, resetKey]);
}
