import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildReferencePlan, emptyPlan, evaluatePlan } from "./engine";
import { Onboarding } from "./Onboarding";
import { Pitch } from "./Pitch";
import { MAX_PLAN_ACTIONS } from "./planRules";
import { scenarios } from "./scenarios";
import type { Evaluation, EvaluationLevel, Phase, UserPlan } from "./types";
import "./football-iq.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; verdict: EvaluationLevel }) => void;
};

const onboardingKey = "ballwise:football-iq:onboarding-direct-v3-seen";

const shouldShowOnboarding = (enabled: boolean) => {
  if (!enabled || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(onboardingKey) !== "1";
  } catch {
    return true;
  }
};

const timeNow = () => typeof performance === "undefined" ? Date.now() : performance.now();

const metricRows = (evaluation: Evaluation) => [
  { name: "Timing", metric: evaluation.metrics.timing },
  { name: "Decyzja przestrzenna", metric: evaluation.metrics.spatialDecision },
  { name: "Konsekwencja", metric: evaluation.metrics.consequence },
] as const;

const verdictSymbol: Record<EvaluationLevel, string> = {
  strong: "✓",
  conditional: "~",
  risky: "!",
};

export function FootballIQMatch({ initialScenario = 0, showOnboardingInitially = true, onBack, onComplete }: Props) {
  const safeInitialIndex = ((initialScenario % scenarios.length) + scenarios.length) % scenarios.length;
  const [scenarioIndex, setScenarioIndex] = useState(safeInitialIndex);
  const scenario = scenarios[scenarioIndex];
  const [phase, setPhase] = useState<Phase>("intro");
  const [phaseStartedAt, setPhaseStartedAt] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(scenario.decisionSeconds);
  const [plan, setPlan] = useState<UserPlan>(() => emptyPlan());
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [coachNote, setCoachNote] = useState("Obserwuj ustawienie obu zespołów");
  const [onboardingStep, setOnboardingStep] = useState(-1);
  const [compareView, setCompareView] = useState<"user" | "reference">("reference");
  const [playbackStep, setPlaybackStep] = useState(0);
  const planRef = useRef(plan);

  useEffect(() => {
    if (shouldShowOnboarding(showOnboardingInitially)) setOnboardingStep(0);
  }, [showOnboardingInitially]);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const enterPhase = useCallback((nextPhase: Phase) => {
    setPhaseStartedAt(timeNow());
    setPhase(nextPhase);
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown > 1) {
      const timer = window.setTimeout(() => setCountdown((value) => value - 1), 620);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setCoachNote("Skanuj piłkę, blok rywala i dalszą stronę");
      enterPhase("observe");
    }, 620);
    return () => window.clearTimeout(timer);
  }, [phase, countdown, enterPhase]);

  useEffect(() => {
    if (phase !== "observe") return;
    const timer = window.setTimeout(() => {
      navigator.vibrate?.([18, 34, 18]);
      setSecondsLeft(scenario.decisionSeconds);
      setCoachNote("Przeciągnij zawodnika, aby dodać ruch. Przeciągnij piłkę, aby podać.");
      enterPhase("plan");
    }, scenario.observationMs);
    return () => window.clearTimeout(timer);
  }, [phase, scenario.observationMs, scenario.decisionSeconds, enterPhase]);

  useEffect(() => {
    if (phase !== "plan" || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase !== "plan" || secondsLeft !== 0) return;
    setCoachNote("Czas orientacyjny minął — dokończ wariant. Tempo nie wpływa na analizę.");
    navigator.vibrate?.(18);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase !== "playback") return;
    setPlaybackStep(0);
    const second = window.setTimeout(() => setPlaybackStep(1), scenario.playbackMs * 0.34);
    const third = window.setTimeout(() => setPlaybackStep(2), scenario.playbackMs * 0.68);
    return () => {
      window.clearTimeout(second);
      window.clearTimeout(third);
    };
  }, [phase, scenario.playbackMs]);

  useEffect(() => {
    if (phase !== "playback") return;
    const timer = window.setTimeout(() => {
      const result = evaluatePlan(scenario, planRef.current);
      setEvaluation(result);
      setPlaybackStep(2);
      enterPhase("feedback");
      onComplete?.({ scenarioId: scenario.id, verdict: result.verdict });
    }, scenario.playbackMs);
    return () => window.clearTimeout(timer);
  }, [phase, scenario, enterPhase, onComplete]);

  useEffect(() => {
    setSecondsLeft(scenario.decisionSeconds);
  }, [scenario.decisionSeconds]);

  const resetPlan = useCallback(() => {
    const freshPlan = emptyPlan();
    planRef.current = freshPlan;
    setPlan(freshPlan);
    setEvaluation(null);
    setPlaybackStep(0);
    setSecondsLeft(scenario.decisionSeconds);
    setCompareView("reference");
  }, [scenario.decisionSeconds]);

  const start = () => {
    resetPlan();
    setCountdown(3);
    setCoachNote("Za chwilę zobaczysz sytuację meczową");
    enterPhase("countdown");
  };

  const undo = () => {
    if (!plan.actions.length) return;
    setPlan({ ...plan, actions: plan.actions.slice(0, -1) });
    setCoachNote("Usunięto ostatnią akcję");
    navigator.vibrate?.(12);
  };

  const play = () => {
    if (!plan.actions.length) {
      setCoachNote("Najpierw przeciągnij zawodnika albo piłkę");
      navigator.vibrate?.(35);
      return;
    }
    setCoachNote("Patrz, jak rywal reaguje na Twój wariant");
    enterPhase("playback");
  };

  const retry = () => {
    resetPlan();
    setCoachNote("Ta sama sytuacja — zbuduj inny wariant");
    enterPhase("plan");
  };

  const next = () => {
    const nextIndex = (scenarioIndex + 1) % scenarios.length;
    const nextPlan = emptyPlan();
    planRef.current = nextPlan;
    setScenarioIndex(nextIndex);
    setPlan(nextPlan);
    setEvaluation(null);
    setPlaybackStep(0);
    setCountdown(3);
    setCompareView("reference");
    setCoachNote("Najpierw przeczytaj sytuację, potem rozpocznij akcję");
    enterPhase("intro");
  };

  const referencePlan = useMemo(() => buildReferencePlan(scenario), [scenario]);

  const replayObservation = () => {
    setCoachNote("Powtórka sytuacji — obserwuj zmianę ustawienia przed decyzją");
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
    if (phase === "observe") return "LIVE";
    if (phase === "plan") return secondsLeft > 0 ? `${secondsLeft}s` : `${plan.actions.length}/3`;
    if (phase === "playback") return "PLAY";
    if ((phase === "feedback" || phase === "compare") && evaluation) return verdictSymbol[evaluation.verdict];
    return "IQ";
  }, [phase, countdown, secondsLeft, plan.actions.length, evaluation]);

  const stagePrompt = phase === "intro"
    ? scenario.focus
    : phase === "observe"
      ? "Obserwuj — decyzja za chwilę"
      : phase === "playback"
        ? "Twój wariant w realnej akcji"
        : phase === "feedback"
          ? "Konsekwencja Twojej decyzji"
          : phase === "compare"
            ? compareView === "reference" ? "Lepszy wariant na boisku" : "Twój wariant na boisku"
            : scenario.prompt;

  const actionCount = plan.actions.length;
  const isReview = phase === "feedback" || phase === "compare";
  const showPlaybackSteps = phase === "playback" || isReview;

  return (
    <main className={`bwiq-app${isReview ? " bwiq-app--review" : ""}${onboardingStep >= 0 ? " bwiq-app--onboarding" : ""}`}>
      <section className="bwiq-stage" aria-label={`Scena: ${scenario.title}`}>
        <Pitch
          players={scenario.players}
          ball={scenario.ball}
          plan={phase === "compare" && compareView === "reference" ? referencePlan : plan}
          phase={phase}
          phaseStartedAt={phaseStartedAt}
          durationMs={scenario.observationMs}
          playbackDurationMs={scenario.playbackMs}
          onPlanChange={setPlan}
          onHint={setCoachNote}
        />

        <div className="bwiq-topbar">
          <button className="bwiq-back" type="button" onClick={onBack} aria-label="Wróć do modułu IQ">‹</button>
          <div className="bwiq-step">
            <strong>IQ · DECYZJA {scenarioIndex + 1}/{scenarios.length}</strong>
            <span>{scenario.title}</span>
          </div>
          <div className={`bwiq-timer bwiq-timer--${phase}`} aria-label={`Status: ${timerText}`}>{timerText}</div>
        </div>

        <div className={`bwiq-prompt bwiq-prompt--${phase}`}><span>{stagePrompt}</span></div>

        {showPlaybackSteps && (
          <div className="bwiq-playback-steps" aria-label="Etapy powtórki">
            {["Twój moment", "Ruch rywala", "Konsekwencja"].map((label, index) => (
              <div key={label} className={index <= playbackStep ? "is-active" : ""}>
                <b>{index + 1}</b><span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {phase === "countdown" && <div key={countdown} className="bwiq-countdown">{countdown}</div>}

        {phase === "intro" && (
          <div className="bwiq-intro-note"><span>MOMENT MECZOWY</span><strong>{scenario.prompt}</strong></div>
        )}

        {phase === "plan" && coachNote && <div className="bwiq-coach-note"><span>{coachNote}</span></div>}
      </section>

      <section className={`bwiq-dock bwiq-dock--${phase}`} aria-live="polite">
        {phase === "intro" && (
          <div className="bwiq-start-row">
            <div><span>CEL SCENY</span><strong>Przeczytaj ustawienie i podejmij własną decyzję.</strong></div>
            <button className="bwiq-play bwiq-play--wide" type="button" onClick={start}>Rozpocznij <i>›</i></button>
          </div>
        )}

        {(phase === "countdown" || phase === "observe" || phase === "playback") && (
          <div className="bwiq-watching">
            <div className="bwiq-activity" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div>
              <strong>{phase === "playback" ? "Oglądaj konsekwencję" : phase === "observe" ? "Skanuj całe boisko" : "Przygotuj się"}</strong>
              <span>{coachNote}</span>
            </div>
          </div>
        )}

        {phase === "plan" && (
          <>
            <div className="bwiq-dock-meta">
              <span>Przeciągnij zawodnika lub piłkę</span>
              <button type="button" onClick={replayObservation}>Powtórka sytuacji</button>
            </div>
            <div className="bwiq-plan-controls bwiq-plan-controls--direct">
              <div className="bwiq-action-count" aria-label={`${actionCount} z ${MAX_PLAN_ACTIONS} akcji`}><b>{actionCount}/{MAX_PLAN_ACTIONS}</b><span>AKCJE</span></div>
              <button className="bwiq-undo bwiq-undo--wide" type="button" onClick={undo} disabled={!actionCount}><i>↶</i><span>Cofnij</span></button>
              <button className="bwiq-play" type="button" onClick={play}><span>Odtwórz</span><i>▶</i></button>
            </div>
          </>
        )}

        {phase === "feedback" && evaluation && (
          <div className="bwiq-feedback">
            <div className={`bwiq-verdict bwiq-verdict--${evaluation.verdict}`}>
              <i aria-hidden="true">{verdictSymbol[evaluation.verdict]}</i>
              <div><span>ANALIZA DECYZJI</span><h2>{evaluation.verdictLabel}</h2></div>
            </div>
            <p className="bwiq-summary"><strong>{evaluation.title}.</strong> {evaluation.summary}</p>
            <div className="bwiq-qualitative" aria-label="Trzy elementy analizy decyzji">
              {metricRows(evaluation).map(({ name, metric }) => (
                <article key={name} className={`bwiq-quality--${metric.level}`}>
                  <span>{name}</span><strong>{metric.label}</strong><p>{metric.detail}</p>
                </article>
              ))}
            </div>
            <div className="bwiq-coach-result"><span>NAJLEPSZA POPRAWKA</span><p>{evaluation.recommendation}</p></div>
            <div className="bwiq-review-actions">
              <button type="button" onClick={retry}>Spróbuj ponownie</button>
              <button type="button" onClick={() => { setCompareView("reference"); enterPhase("compare"); }}>Lepszy wariant</button>
              <button className="primary" type="button" onClick={next}>Następna <i>›</i></button>
            </div>
          </div>
        )}

        {phase === "compare" && evaluation && (
          <div className="bwiq-compare">
            <div className="bwiq-compare-head"><span>PORÓWNANIE DECYZJI</span><strong>Twój wariant i lepsza odpowiedź</strong></div>
            <div className="bwiq-compare-toggle" role="group" aria-label="Wariant widoczny na boisku">
              <button type="button" className={compareView === "user" ? "active" : ""} onClick={() => setCompareView("user")}>Twój wariant</button>
              <button type="button" className={compareView === "reference" ? "active" : ""} onClick={() => setCompareView("reference")}>Lepszy wariant</button>
            </div>
            <div className="bwiq-compare-grid">
              <article><span>TWÓJ WARIANT</span><strong>{evaluation.verdictLabel}</strong><p>{evaluation.issues[0] ?? evaluation.summary}</p></article>
              <article className="better"><span>LEPSZY WARIANT</span><strong>Więcej przewagi, mniej ryzyka</strong><p>{evaluation.recommendation}</p></article>
            </div>
            <p className="bwiq-compare-reaction"><b>Reakcja rywala:</b> {evaluation.reaction}</p>
            <div className="bwiq-review-actions">
              <button type="button" onClick={() => enterPhase("feedback")}>Wróć do analizy</button>
              <button type="button" onClick={retry}>Popraw wariant</button>
              <button className="primary" type="button" onClick={next}>Następna <i>›</i></button>
            </div>
          </div>
        )}
      </section>

      {onboardingStep >= 0 && (
        <Onboarding
          step={onboardingStep}
          onNext={() => setOnboardingStep((step) => Math.min(2, step + 1))}
          onBack={() => setOnboardingStep((step) => Math.max(0, step - 1))}
          onClose={closeOnboarding}
        />
      )}
    </main>
  );
}
