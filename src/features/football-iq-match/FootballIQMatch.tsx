import { useEffect, useMemo, useRef, useState } from "react";
import { emptyPlan, evaluatePlan } from "./engine";
import { Onboarding } from "./Onboarding";
import { Pitch } from "./Pitch";
import { scenarios } from "./scenarios";
import type { Evaluation, Phase, UserPlan } from "./types";
import "./football-iq.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; score: number }) => void;
};

const now = () => performance.now();
const onboardingKey = "ballwise:football-iq:onboarding-seen";

const shouldShowOnboarding = (enabled: boolean) => {
  if (!enabled || typeof window === "undefined") return false;
  return window.localStorage.getItem(onboardingKey) !== "1";
};

export function FootballIQMatch({ initialScenario = 0, showOnboardingInitially = true, onBack, onComplete }: Props) {
  const [scenarioIndex, setScenarioIndex] = useState(initialScenario % scenarios.length);
  const scenario = scenarios[scenarioIndex];
  const [phase, setPhase] = useState<Phase>("intro");
  const [countdown, setCountdown] = useState(3);
  const [observationProgress, setObservationProgress] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(scenario.decisionSeconds);
  const [plan, setPlan] = useState<UserPlan>(emptyPlan);
  const [hint, setHint] = useState("Obserwuj ustawienie i wolną przestrzeń");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [paused, setPaused] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(() => shouldShowOnboarding(showOnboardingInitially) ? 0 : -1);
  const startedAt = useRef(0);
  const pausedAt = useRef(0);

  useEffect(() => {
    if (phase !== "countdown" || paused) return;
    if (countdown <= 0) {
      startedAt.current = now();
      setPhase("observe");
      setHint("Akcja trwa · skanuj całe boisko");
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 500);
    return () => window.clearTimeout(timer);
  }, [phase, countdown, paused]);

  useEffect(() => {
    if (phase !== "observe" || paused) return;
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (now() - startedAt.current) / scenario.observationMs);
      setObservationProgress(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        navigator.vibrate?.([20, 35, 20]);
        setSecondsLeft(scenario.decisionSeconds);
        setPhase("plan");
        setHint("Twoja decyzja · przeciągnij zawodnika lub piłkę");
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, scenario]);

  useEffect(() => {
    if (phase !== "plan" || paused) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setHint("Czas · odtwarzam Twój plan");
          setPhase("playback");
          startedAt.current = now();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, paused]);

  useEffect(() => {
    if (phase !== "playback" || paused) return;
    if (!startedAt.current) startedAt.current = now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (now() - startedAt.current) / scenario.playbackMs);
      setPlaybackProgress(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        const result = evaluatePlan(scenario, plan);
        setEvaluation(result);
        setPhase("feedback");
        onComplete?.({ scenarioId: scenario.id, score: result.score });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, plan, scenario, onComplete]);

  const start = () => {
    setPlan(emptyPlan());
    setEvaluation(null);
    setObservationProgress(0);
    setPlaybackProgress(0);
    setCountdown(3);
    setPaused(false);
    setPhase("countdown");
    setHint("Za chwilę rozpocznie się akcja");
  };

  const submit = () => {
    if (!plan.runs.length && !plan.pass) {
      setHint("Najpierw pokaż przynajmniej jeden ruch");
      navigator.vibrate?.(35);
      return;
    }
    startedAt.current = now();
    setPlaybackProgress(0);
    setPhase("playback");
    setHint("Odtwarzam konsekwencję Twojej decyzji");
  };

  const togglePause = () => {
    setPaused((currentlyPaused) => {
      if (!currentlyPaused) pausedAt.current = now();
      else if (startedAt.current) startedAt.current += now() - pausedAt.current;
      return !currentlyPaused;
    });
  };

  const undo = () => {
    if (plan.pass) setPlan({ ...plan, pass: undefined });
    else setPlan({ ...plan, runs: plan.runs.slice(0, -1) });
    setHint("Ostatni ruch usunięty");
  };

  const next = () => {
    setScenarioIndex((index) => (index + 1) % scenarios.length);
    setPhase("intro");
    setPlan(emptyPlan());
    setEvaluation(null);
    setObservationProgress(0);
    setPlaybackProgress(0);
    setHint("Obserwuj ustawienie i wolną przestrzeń");
  };

  const closeOnboarding = () => {
    window.localStorage.setItem(onboardingKey, "1");
    setOnboardingStep(-1);
  };

  useEffect(() => setSecondsLeft(scenario.decisionSeconds), [scenario]);

  const status = useMemo(() => {
    if (phase === "countdown") return `START ZA ${Math.max(1, countdown)}`;
    if (phase === "observe") return "OBSERWUJ";
    if (phase === "plan") return `DECYZJA · ${secondsLeft} S`;
    if (phase === "playback") return "TWÓJ PLAN W GRZE";
    if (phase === "feedback") return "ANALIZA";
    return scenario.focus.toUpperCase();
  }, [phase, countdown, secondsLeft, scenario.focus]);

  return (
    <main className="bwiq-app">
      <header className="bwiq-header">
        <button className="bwiq-icon" onClick={onBack} aria-label="Wróć">‹</button>
        <div>
          <h1>{scenario.title}</h1>
          <p>Mecz IQ · decyzja {scenarioIndex + 1}/{scenarios.length}</p>
        </div>
        <span className="bwiq-number">9</span>
      </header>

      <section className="bwiq-stage">
        <div className={`bwiq-live-status phase-${phase}`}><i />{status}</div>
        <Pitch
          players={scenario.players}
          ball={scenario.ball}
          plan={plan}
          phase={phase}
          progress={observationProgress}
          playbackProgress={playbackProgress}
          onPlanChange={setPlan}
          onHint={setHint}
        />
        {phase === "countdown" && <div className="bwiq-countdown">{Math.max(1, countdown)}</div>}
      </section>

      <section className="bwiq-panel" aria-live="polite">
        {phase === "feedback" && evaluation ? (
          <>
            <span className="bwiq-result-label">PODSUMOWANIE DECYZJI</span>
            <h2>{evaluation.title}</h2>
            <p>{evaluation.message}</p>
            <div className="bwiq-tags">{evaluation.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <button className="bwiq-primary" onClick={next}>Następna akcja <span>›</span></button>
          </>
        ) : (
          <>
            <div className="bwiq-panel-top">
              <span className="bwiq-eyebrow">{phase === "plan" ? "POKAŻ SWÓJ PLAN" : phase === "playback" ? "KONSEKWENCJA DECYZJI" : "OBSERWUJ · MOMENT DECYZYJNY"}</span>
              <button className="bwiq-pause" onClick={togglePause} aria-label={paused ? "Wznów" : "Pauza"}>{paused ? "▶" : "Ⅱ"}</button>
            </div>
            <h2>{scenario.prompt}</h2>
            <div className="bwiq-progress"><i className="active" /><i className="active" /><i className={phase !== "intro" ? "active" : ""} /><i /><i /></div>
            <p className="bwiq-hint">{phase === "intro" ? scenario.cue : hint}</p>
            {phase === "intro" && <button className="bwiq-primary" onClick={start}>Rozpocznij akcję <span>›</span></button>}
            {phase === "plan" && (
              <div className="bwiq-actions">
                <button className="bwiq-secondary" onClick={undo} disabled={!plan.runs.length && !plan.pass}>Cofnij</button>
                <button className="bwiq-primary" onClick={submit}>Zatwierdź plan <span>›</span></button>
              </div>
            )}
            {(phase === "countdown" || phase === "observe" || phase === "playback") && (
              <div className="bwiq-activity"><i /><i /><i /><i /><i /></div>
            )}
          </>
        )}
      </section>

      {onboardingStep >= 0 && (
        <Onboarding
          step={onboardingStep}
          onNext={() => setOnboardingStep((step) => Math.min(2, step + 1))}
          onClose={closeOnboarding}
        />
      )}
    </main>
  );
}
