import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const timeNow = () => typeof performance === "undefined" ? Date.now() : performance.now();

export function FootballIQMatch({ initialScenario = 0, showOnboardingInitially = true, onBack, onComplete }: Props) {
  const safeInitialIndex = ((initialScenario % scenarios.length) + scenarios.length) % scenarios.length;
  const [scenarioIndex, setScenarioIndex] = useState(safeInitialIndex);
  const scenario = scenarios[scenarioIndex];
  const ballCarrier = scenario.players.find((player) => player.id === scenario.ball.carrierId);
  const canPlanPass = !ballCarrier || ballCarrier.team === "home";
  const [phase, setPhase] = useState<Phase>("intro");
  const [phaseStartedAt, setPhaseStartedAt] = useState(0);
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
      setCoachNote("Akcja trwa — skanuj piłkę, blok rywala i dalszą stronę");
      enterPhase("observe");
    }, 620);
    return () => window.clearTimeout(timer);
  }, [phase, countdown, enterPhase]);

  useEffect(() => {
    if (phase !== "observe") return;
    const timer = window.setTimeout(() => {
      navigator.vibrate?.([18, 34, 18]);
      setSecondsLeft(scenario.decisionSeconds);
      setMode("run");
      setCoachNote("Twoja decyzja — wybierz narzędzie i zbuduj plan");
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
    setCoachNote("Czas orientacyjny minął — spokojnie dokończ plan, tempo nie obniża oceny");
    navigator.vibrate?.(18);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase !== "playback") return;
    const timer = window.setTimeout(() => {
      const result = evaluatePlan(scenario, planRef.current);
      setEvaluation(result);
      enterPhase("feedback");
      onComplete?.({ scenarioId: scenario.id, score: result.score });
    }, scenario.playbackMs);
    return () => window.clearTimeout(timer);
  }, [phase, scenario, enterPhase, onComplete]);

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
    if (phase === "observe") return "LIVE";
    if (phase === "plan") return secondsLeft > 0 ? `${secondsLeft}s` : "PLAN";
    if (phase === "intent") return "CEL";
    if (phase === "playback") return "PLAY";
    if (phase === "feedback" || phase === "compare") return evaluation ? String(evaluation.score) : "—";
    return "IQ";
  }, [phase, countdown, secondsLeft, evaluation]);

  const stagePrompt = phase === "intro"
    ? scenario.focus
    : phase === "observe"
      ? "Obserwuj — decyzja za chwilę"
      : phase === "playback"
        ? "Twój plan w realnej akcji"
        : phase === "compare"
          ? compareView === "reference" ? "Lepszy wariant zaznaczony na boisku" : "Twój plan zaznaczony na boisku"
        : scenario.prompt;

  const actionCount = plan.actions.length;
  const isReview = phase === "feedback" || phase === "compare";

  return (
    <main className={`bwiq-app${isReview ? " bwiq-app--review" : ""}`}>
      <section className="bwiq-stage" aria-label={`Scena: ${scenario.title}`}>
        <Pitch
          players={scenario.players}
          ball={scenario.ball}
          plan={phase === "compare" && compareView === "reference" ? referencePlan : plan}
          phase={phase}
          phaseStartedAt={phaseStartedAt}
          durationMs={scenario.observationMs}
          mode={mode}
          playbackDurationMs={scenario.playbackMs}
          onPlanChange={setPlan}
          onHint={setCoachNote}
        />

        <div className="bwiq-topbar">
          <button className="bwiq-back" type="button" onClick={onBack} aria-label="Wróć do modułu IQ">‹</button>
          <div className="bwiq-step">
            <strong>DECYZJA {scenarioIndex + 1}/{scenarios.length}</strong>
            <span>{scenario.title}</span>
          </div>
          <div className={`bwiq-timer bwiq-timer--${phase}`} aria-label={`Status: ${timerText}`}>{timerText}</div>
        </div>

        <div className={`bwiq-prompt bwiq-prompt--${phase}`}>
          <span>{stagePrompt}</span>
        </div>

        {phase === "countdown" && <div key={countdown} className="bwiq-countdown">{countdown}</div>}

        {phase === "intro" && (
          <div className="bwiq-intro-note">
            <span>MOMENT MECZOWY</span>
            <strong>{scenario.prompt}</strong>
          </div>
        )}

        {(phase === "plan" || phase === "intent") && coachNote && (
          <div className="bwiq-coach-note">
            {hintLevel > 0 && <b>{hintLevel}/3</b>}
            <span>{coachNote}</span>
          </div>
        )}
      </section>

      <section className={`bwiq-dock bwiq-dock--${phase}`} aria-live="polite">
        {phase === "intro" && (
          <div className="bwiq-start-row">
            <div>
              <span>CEL SCENY</span>
              <strong>Przeczytaj ustawienie i podejmij własną decyzję.</strong>
            </div>
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
              <span><b>{actionCount}</b> {actionCount === 1 ? "akcja" : "akcje"} w planie</span>
              <div>
                <button type="button" onClick={replayObservation}>Powtórka</button>
                <button type="button" onClick={requestHint}>Podpowiedź{hintLevel ? ` ${hintLevel}/3` : ""}</button>
              </div>
            </div>
            <div className="bwiq-plan-controls">
              <button className="bwiq-undo" type="button" onClick={undo} disabled={!actionCount} aria-label="Cofnij ostatnią akcję">
                <i>↶</i><span>Cofnij</span>
              </button>
              <div className="bwiq-modes" role="group" aria-label="Narzędzie planowania">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={mode === option.value ? "active" : ""}
                    onClick={() => setMode(option.value)}
                    disabled={option.value === "pass" && !canPlanPass}
                    title={option.value === "pass" && !canPlanPass ? "Rywal ma piłkę — zaplanuj pressing lub zabezpieczenie" : option.label}
                    aria-label={option.label}
                    aria-pressed={mode === option.value}
                  >{option.short}</button>
                ))}
              </div>
              <button className="bwiq-play" type="button" onClick={openIntent}><span>Odtwórz</span><i>▶</i></button>
            </div>
          </>
        )}

        {phase === "intent" && (
          <div className="bwiq-intent">
            <div className="bwiq-intent-copy">
              <span>NAZWIJ SWOJĄ INTENCJĘ</span>
              <strong>Co ma dać ten plan?</strong>
            </div>
            <div className="bwiq-intent-chips">
              {intentOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={plan.intent === option.value ? "active" : ""}
                  onClick={() => selectIntent(option.value)}
                  aria-pressed={plan.intent === option.value}
                >{option.label}</button>
              ))}
            </div>
            <div className="bwiq-intent-actions">
              <button type="button" onClick={() => enterPhase("plan")}>Wróć do planu</button>
              <button className="bwiq-play" type="button" onClick={play}><span>Zagraj</span><i>▶</i></button>
            </div>
          </div>
        )}

        {phase === "feedback" && evaluation && (
          <div className="bwiq-feedback">
            <div className="bwiq-feedback-head">
              <div className="bwiq-score"><strong>{evaluation.score}</strong><span>/100</span></div>
              <div><span>ANALIZA DECYZJI</span><h2>{evaluation.title}</h2></div>
            </div>
            <p className="bwiq-summary">{evaluation.summary}</p>
            <div className="bwiq-metrics" aria-label="Składowe oceny">
              {([
                ["Przestrzeń", evaluation.metrics.space],
                ["Sekwencja", evaluation.metrics.timing],
                ["Podanie", evaluation.metrics.passing],
                ["Ryzyko", evaluation.metrics.risk],
                ["Struktura", evaluation.metrics.structure],
              ] as const).map(([label, value]) => (
                <div key={label} title={`${label}: ${value}/100`}>
                  <span>{label}</span><i><b style={{ width: `${value}%` }} /></i>
                </div>
              ))}
            </div>
            <div className="bwiq-feedback-grid">
              <article>
                <span>CO ZROBIŁEŚ</span>
                <p>{actionCount} {actionCount === 1 ? "zaplanowana akcja" : "zaplanowane akcje"} · {intentLabel(plan.intent)}</p>
              </article>
              <article>
                <span>REAKCJA RYWALA</span>
                <p>{evaluation.reaction}</p>
              </article>
              <article className="good">
                <span>CO BYŁO DOBRE</span>
                <ul>{evaluation.strengths.length
                  ? evaluation.strengths.map((item) => <li key={item}>{item}</li>)
                  : <li>Najpierw popraw kluczowy element wskazany poniżej.</li>}
                </ul>
              </article>
              <article className="issue">
                <span>CO OGRANICZAŁO PLAN</span>
                <ul>{evaluation.issues.length
                  ? evaluation.issues.map((item) => <li key={item}>{item}</li>)
                  : <li>Plan nie ma wyraźnego błędu krytycznego.</li>}
                </ul>
              </article>
            </div>
            <div className="bwiq-recommendation"><span>NAJLEPSZA POPRAWKA</span><strong>{evaluation.recommendation}</strong></div>
            <div className="bwiq-review-actions">
              <button type="button" onClick={retry}>Spróbuj ponownie</button>
              <button type="button" onClick={() => { setCompareView("reference"); enterPhase("compare"); }}>Porównaj</button>
              <button className="primary" type="button" onClick={next}>Następna <i>›</i></button>
            </div>
          </div>
        )}

        {phase === "compare" && evaluation && (
          <div className="bwiq-compare">
            <div className="bwiq-compare-head"><span>PORÓWNANIE DECYZJI</span><strong>Twój plan i lepszy wariant</strong></div>
            <div className="bwiq-compare-toggle" role="group" aria-label="Plan widoczny na boisku">
              <button type="button" className={compareView === "user" ? "active" : ""} onClick={() => setCompareView("user")}>Twój plan</button>
              <button type="button" className={compareView === "reference" ? "active" : ""} onClick={() => setCompareView("reference")}>Lepszy wariant</button>
            </div>
            <div className="bwiq-compare-grid">
              <article>
                <span>TWÓJ PLAN</span>
                <strong>{intentLabel(plan.intent)}</strong>
                <p>{evaluation.issues[0] ?? evaluation.summary}</p>
              </article>
              <article className="better">
                <span>LEPSZY WARIANT</span>
                <strong>Więcej przewagi, mniej ryzyka</strong>
                <p>{evaluation.recommendation}</p>
              </article>
            </div>
            <p className="bwiq-compare-reaction"><b>Dlaczego:</b> {evaluation.reaction}</p>
            <div className="bwiq-review-actions">
              <button type="button" onClick={() => enterPhase("feedback")}>Wróć do analizy</button>
              <button type="button" onClick={retry}>Popraw plan</button>
              <button className="primary" type="button" onClick={next}>Następna <i>›</i></button>
            </div>
          </div>
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
