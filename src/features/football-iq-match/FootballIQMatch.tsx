import { useEffect, useMemo, useRef, useState } from "react";
import { currentBallCarrier, currentPlayerPoint, evaluateDecision } from "./engine";
import { scenarios } from "./scenarios";
import { TacticalPitch } from "./TacticalPitch";
import { playbackDuration } from "./playback";
import type {
  ActionMode,
  Evaluation,
  EvaluationLevel,
  MatchPlayer,
  Phase,
  PlannedAction,
  Point,
} from "./types";
import "./football-iq.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; verdict: EvaluationLevel }) => void;
};

const MAX_ACTIONS = 3;

const modeHint: Record<ActionMode, string> = {
  run: "Wybierz zawodnika, potem dotknij wolnej przestrzeni.",
  pass: "Wybierz podającego, potem dotknij partnera.",
  shift: "Wybierz zawodnika, potem wskaż nowe ustawienie.",
};

const createActionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function FootballIQMatch({ initialScenario = 0, onBack, onComplete }: Props) {
  const scenarioIndex =
    ((initialScenario % scenarios.length) + scenarios.length) % scenarios.length;
  const scenario = scenarios[scenarioIndex];
  const [phase, setPhase] = useState<Phase>("intro");
  const [countdown, setCountdown] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(scenario.seconds);
  const [mode, setMode] = useState<ActionMode>("pass");
  const [selectedPlayerId, setSelectedPlayerId] = useState(scenario.controlledPlayerId);
  const [actions, setActions] = useState<PlannedAction[]>([]);
  const [hint, setHint] = useState(modeHint.pass);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [pitchReady, setPitchReady] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown > 1) {
      const timer = window.setTimeout(() => setCountdown((value) => value - 1), 620);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setSecondsLeft(scenario.seconds);
      setPhase("plan");
    }, 620);
    return () => window.clearTimeout(timer);
  }, [phase, countdown, scenario.seconds]);

  useEffect(() => {
    if (phase !== "plan" || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, secondsLeft]);

  const selectedPlayer = useMemo(
    () => scenario.players.find((player) => player.id === selectedPlayerId) ?? null,
    [scenario.players, selectedPlayerId],
  );

  const activeActions = showReference ? scenario.referenceActions : actions;

  const start = () => {
    setActions([]);
    setEvaluation(null);
    setShowReference(false);
    setSelectedPlayerId(scenario.controlledPlayerId);
    setMode("pass");
    setHint(modeHint.pass);
    setCountdown(3);
    setPhase("countdown");
  };

  const updateMode = (nextMode: ActionMode) => {
    setMode(nextMode);
    setHint(modeHint[nextMode]);
    navigator.vibrate?.(10);
  };

  const canAddAction = () => {
    if (actions.length < MAX_ACTIONS) return true;
    setHint("Masz już trzy działania. Cofnij jedno albo zatwierdź decyzję.");
    navigator.vibrate?.(28);
    return false;
  };

  const selectPlayer = (player: MatchPlayer) => {
    if (player.team !== "home") {
      setHint("Sterujesz tylko zawodnikami swojej drużyny.");
      return;
    }

    if (mode === "pass" && selectedPlayer && player.id !== selectedPlayer.id) {
      if (!canAddAction()) return;
      const from = currentPlayerPoint(selectedPlayer.id, scenario.players, actions);
      const to = currentPlayerPoint(player.id, scenario.players, actions);
      if (!from || !to) return;
      const carrier = currentBallCarrier(scenario.ballCarrierId, actions);
      if (carrier !== selectedPlayer.id) {
        setSelectedPlayerId(carrier);
        setHint("Podanie musi rozpocząć zawodnik posiadający piłkę.");
        return;
      }
      setActions((current) => [
        ...current,
        {
          id: createActionId(),
          type: "pass",
          playerId: selectedPlayer.id,
          targetId: player.id,
          from,
          to,
        },
      ]);
      setSelectedPlayerId(player.id);
      setHint("Podanie dodane. Zaplanuj kolejny ruch albo zatwierdź.");
      navigator.vibrate?.(14);
      return;
    }

    setSelectedPlayerId(player.id);
    setHint(mode === "pass" ? "Teraz dotknij partnera, do którego chcesz podać." : modeHint[mode]);
  };

  const selectPitchPoint = (point: Point) => {
    if (mode === "pass") {
      setHint("Przy podaniu dotknij konkretnego partnera.");
      return;
    }
    if (!selectedPlayer || selectedPlayer.team !== "home" || !canAddAction()) return;
    const from = currentPlayerPoint(selectedPlayer.id, scenario.players, actions);
    if (!from) return;
    setActions((current) => [
      ...current,
      {
        id: createActionId(),
        type: mode,
        playerId: selectedPlayer.id,
        from,
        to: point,
      },
    ]);
    setHint(
      `${mode === "run" ? "Bieg" : "Przesunięcie"} dodane. Możesz zaplanować kolejne działanie.`,
    );
    navigator.vibrate?.(14);
  };

  const undo = () => {
    setActions((current) => current.slice(0, -1));
    setHint("Usunięto ostatnie działanie.");
    navigator.vibrate?.(10);
  };

  const submit = () => {
    if (!pitchReady || phase !== "plan") return;
    if (!actions.length) {
      setHint("Dodaj przynajmniej jedno działanie.");
      navigator.vibrate?.(30);
      return;
    }
    setPlaybackProgress(0);
    setPhase("playback");
    const startedAt = performance.now();
    const duration = playbackDuration(scenario, actions) * 1000;
    const animate = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / duration);
      setPlaybackProgress(progress);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      const result = evaluateDecision(scenario, actions);
      setEvaluation(result);
      setPhase("feedback");
      onComplete?.({ scenarioId: scenario.id, verdict: result.level });
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  const retry = () => {
    setActions([]);
    setEvaluation(null);
    setShowReference(false);
    setSelectedPlayerId(scenario.controlledPlayerId);
    setMode("pass");
    setSecondsLeft(scenario.seconds);
    setHint(modeHint.pass);
    setPhase("plan");
  };

  const timerText =
    phase === "countdown"
      ? countdown
      : phase === "plan"
        ? `${secondsLeft}s`
        : phase === "playback"
          ? "▶"
          : "IQ";

  return (
    <main className={`bwiq-app bwiq-app--${phase}`}>
      <header className="bwiq-header">
        <button className="bwiq-back" type="button" onClick={onBack} aria-label="Wróć">
          ‹
        </button>
        <div className="bwiq-heading">
          <span>IQ · DECYZJA 1/1</span>
          <strong>{phase === "feedback" ? "Analiza Twojej decyzji" : scenario.question}</strong>
        </div>
        <div className={`bwiq-timer bwiq-timer--${phase}`}>{timerText}</div>
      </header>

      <section className="bwiq-stage">
        <TacticalPitch
          scenario={scenario}
          actions={phase === "feedback" ? activeActions : actions}
          selectedPlayerId={selectedPlayerId}
          mode={mode}
          interactive={phase === "plan"}
          playbackProgress={phase === "playback" ? playbackProgress : 1}
          playing={phase === "playback"}
          onModeChange={updateMode}
          onPlayerSelect={selectPlayer}
          onPitchSelect={selectPitchPoint}
          onReadyChange={setPitchReady}
        />

        {phase === "intro" && (
          <div className="bwiq-intro-card">
            <span>MOMENT MECZOWY</span>
            <h1>{scenario.title}</h1>
            <p>{scenario.focus}</p>
            <button type="button" onClick={start} disabled={!pitchReady}>
              {pitchReady ? "Rozpocznij" : "Ładowanie…"} <i>→</i>
            </button>
          </div>
        )}

        {phase === "countdown" && (
          <div key={countdown} className="bwiq-countdown">
            {countdown}
          </div>
        )}
        {phase === "playback" && <div className="bwiq-playback-label">Odtwarzanie decyzji</div>}
      </section>

      {phase === "plan" && (
        <section className="bwiq-dock">
          <div className="bwiq-hint">{hint}</div>
          <div className="bwiq-controls">
            <div className="bwiq-action-count">
              <b>
                {actions.length}/{MAX_ACTIONS}
              </b>
              <span>akcje</span>
            </div>
            <button
              className="bwiq-undo"
              type="button"
              onClick={undo}
              disabled={!actions.length}
              aria-label="Cofnij"
            >
              ↶
            </button>
            <button className="bwiq-submit" type="button" onClick={submit}>
              Zatwierdź decyzję <i>→</i>
            </button>
          </div>
        </section>
      )}

      {(phase === "countdown" || phase === "playback") && (
        <section className="bwiq-dock bwiq-dock--status">
          <i />
          <div>
            <strong>{phase === "countdown" ? "Przygotuj się" : "Obserwuj przebieg akcji"}</strong>
            <span>{scenario.focus}</span>
          </div>
        </section>
      )}

      {phase === "feedback" && evaluation && (
        <section className="bwiq-feedback">
          <div className={`bwiq-verdict bwiq-verdict--${evaluation.level}`}>
            <i>
              {evaluation.level === "strong" ? "✓" : evaluation.level === "conditional" ? "~" : "!"}
            </i>
            <div>
              <span>WYNIK DECYZJI</span>
              <h2>{evaluation.label}</h2>
            </div>
          </div>
          <p className="bwiq-summary">{evaluation.summary}</p>
          <div className="bwiq-analysis-rows">
            <div>
              <span>Timing</span>
              <p>{evaluation.timing}</p>
            </div>
            <div>
              <span>Przestrzeń</span>
              <p>{evaluation.space}</p>
            </div>
            <div>
              <span>Konsekwencja</span>
              <p>{evaluation.consequence}</p>
            </div>
          </div>
          <div className="bwiq-recommendation">
            <span>NAJLEPSZA POPRAWKA</span>
            <p>{evaluation.recommendation}</p>
          </div>
          <div className="bwiq-feedback-actions">
            <button type="button" onClick={retry}>
              Spróbuj ponownie
            </button>
            <button type="button" onClick={() => setShowReference((value) => !value)}>
              {showReference ? "Twój wariant" : "Lepszy wariant"}
            </button>
            <button className="primary" type="button" onClick={onBack}>
              Zakończ <i>→</i>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
