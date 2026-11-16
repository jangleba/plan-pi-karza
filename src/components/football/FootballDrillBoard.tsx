import { useEffect, useId, useState } from "react";
import { ACTION_LABELS, drillBoard, FIELD_COLORS, FIELD_TARGETS } from "@/lib/football/drillBoard";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "@/lib/loadwise/individualFootballDrills";
import { TrainingFieldBoard } from "./TrainingFieldBoard";
import "./football-board.css";

/** Legacy instruction surfaces share the same setup and action order as the session runner. */
export function FootballDrillBoard({ exerciseId }: { exerciseId?: string }) {
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === exerciseId);
  const board = drillBoard(exerciseId);
  if (!drill || !board) return null;
  return (
    <div className="bw-football-guide">
      <TrainingFieldBoard exercise={{ id: drill.id, exerciseId: drill.id, name: drill.name }} />
      <FootballDirectionPractice exerciseId={drill.id} />
      <details className="bw-football-quality">
        <summary>Jakość wykonania</summary>
        <p>{drill.quality}</p>
        <p>
          <strong>Unikaj:</strong> {drill.mistake}
        </p>
      </details>
    </div>
  );
}

/** The same optional cue tool is available in current sessions and legacy instructions. */
export function FootballDirectionPractice({ exerciseId }: { exerciseId?: string }) {
  const board = drillBoard(exerciseId);
  return board?.reactive ? <DirectionPractice key={board.id} action={board.action} /> : null;
}

/** Optional cue practice is separate from the explanatory setup; it never advances the workout. */
function DirectionPractice({ action }: { action: keyof typeof ACTION_LABELS }) {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [target, setTarget] = useState(0);
  const [intervalSec, setIntervalSec] = useState(6);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cue = FIELD_TARGETS[target];
  const path = `M50 50 L${cue.x} ${cue.y}`;
  useEffect(() => {
    if (!playing) return;
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    const timer = window.setInterval(() => {
      setTarget((old) => (old + 1 + Math.floor(Math.random() * 3)) % 4);
    }, intervalSec * 1000);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [playing, intervalSec]);
  return (
    <details
      className="bw-field-reactive"
      aria-label="Kierunki i kolory"
      onToggle={(event) => {
        if (!event.currentTarget.open) setPlaying(false);
      }}
    >
      <summary>
        Kierunki i kolory <span>Opcjonalnie</span>
      </summary>
      <label className="bw-field-reactive-enable">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setPlaying(false);
            setEnabled(event.target.checked);
          }}
        />
        Wyjście do wskazanej strefy
      </label>
      {(enabled || playing) && (
        <>
          <svg viewBox="0 0 100 100" role="img" aria-label={`Sygnał: ${cue.label}`}>
            <defs>
              <marker
                id={`${uid}-arrow`}
                markerWidth="5"
                markerHeight="5"
                refX="4"
                refY="2.5"
                orient="auto"
              >
                <path d="M0 0 L5 2.5 L0 5" fill="currentColor" />
              </marker>
            </defs>
            <rect x="5" y="5" width="90" height="90" rx="4" fill="none" stroke="#c7d8cb" />
            {FIELD_TARGETS.map((item) => (
              <g key={item.direction}>
                <circle
                  cx={item.x}
                  cy={item.y}
                  r="5"
                  fill={FIELD_COLORS[item.color]}
                  opacity={item.direction === cue.direction ? 1 : 0.3}
                />
                <text
                  x={item.x}
                  y={item.y + 11}
                  textAnchor="middle"
                  fontSize="4.5"
                  fill="currentColor"
                >
                  {item.label}
                </text>
              </g>
            ))}
            <path
              d={path}
              fill="none"
              stroke={FIELD_COLORS[cue.color]}
              strokeWidth="1.5"
              markerEnd={`url(#${uid}-arrow)`}
            />
            <circle
              key={`${path}-${playing}`}
              cx={playing ? undefined : 50}
              cy={playing ? undefined : 50}
              r="2.3"
              fill="currentColor"
            >
              <title>Piłka</title>
              {playing && (
                <animateMotion dur={`${intervalSec}s`} repeatCount="indefinite" path={path} />
              )}
            </circle>
          </svg>
          <p role="status">
            <strong>{cue.label}</strong> · {ACTION_LABELS[action]}. Spójrz na sygnał przed
            kontaktem. Wróć do środka przed kolejnym.
          </p>
        </>
      )}
      <div className="bw-field-controls">
        <button
          type="button"
          onClick={() => {
            setEnabled(true);
            setPlaying((old) => !old);
          }}
        >
          {playing ? "Pauza" : "Odtwórz schemat"}
        </button>
        <label>
          Zmiana co{" "}
          <select
            value={intervalSec}
            onChange={(event) => setIntervalSec(Number(event.target.value))}
          >
            {[4, 6, 8, 10].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} s
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="bw-field-caption">
        Tempo sygnałów służy nauce. Dawkę i przerwy zachowaj z sesji.
      </p>
    </details>
  );
}
