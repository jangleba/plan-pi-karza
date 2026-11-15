import { useEffect, useId, useState } from "react";
import { ACTION_LABELS, drillBoard, FIELD_COLORS, FIELD_TARGETS } from "@/lib/football/drillBoard";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "@/lib/loadwise/individualFootballDrills";
import "./football-board.css";

export function FootballDrillBoard({ exerciseId }: { exerciseId?: string }) {
  const board = drillBoard(exerciseId);
  if (!board) return null;
  return <Board key={board.id} exerciseId={board.id} />;
}
function Board({ exerciseId }: { exerciseId: string }) {
  const board = drillBoard(exerciseId)!;
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((d) => d.id === exerciseId)!;
  const uid = useId().replace(/:/g, "");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [reactive, setReactive] = useState(false);
  const [target, setTarget] = useState(0);
  const [intervalSec, setIntervalSec] = useState(6);
  useEffect(() => {
    if (!playing) return;
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", stop);
    const timer = window.setInterval(() => {
      if (reactive) setTarget((old) => (old + 1 + Math.floor(Math.random() * 3)) % 4);
      else setStep((old) => (old + 1) % 3);
    }, intervalSec * 1000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [playing, reactive, intervalSec]);
  const cue = FIELD_TARGETS[target];
  const path = reactive
    ? `M 50 50 L ${cue.x} ${cue.y}`
    : board.path.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  return (
    <section className="bw-field-board" aria-label={`Schemat: ${drill.name}`}>
      <h4>Ustawienie na boisku</h4>
      <p>{board.equipment}</p>
      <p>{board.area}</p>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={
          reactive ? `${cue.label}: ${ACTION_LABELS[board.action]}` : ACTION_LABELS[board.action]
        }
      >
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
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="3"
          fill="none"
          stroke="currentColor"
          opacity=".2"
        />
        <path d="M5 50 H95" stroke="currentColor" opacity=".12" />
        {board.markers.map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 2} l-2 4 h4 z`} fill="#b88852" />
        ))}
        {reactive &&
          FIELD_TARGETS.map((t) => (
            <g key={t.direction}>
              <circle cx={t.x} cy={t.y} r="5" fill={FIELD_COLORS[t.color]} />
              <text x={t.x} y={t.y + 10} textAnchor="middle" fontSize="4" fill="currentColor">
                {t.label}
              </text>
            </g>
          ))}
        <path
          d={path}
          fill="none"
          stroke={reactive ? FIELD_COLORS[cue.color] : "currentColor"}
          strokeWidth="1.2"
          strokeDasharray={board.action === "pass" ? "3 2" : undefined}
          markerEnd={`url(#${uid}-arrow)`}
        />
        <circle
          key={`${path}-${playing}`}
          cx={playing ? undefined : reactive ? 50 : board.path[0][0]}
          cy={playing ? undefined : reactive ? 50 : board.path[0][1]}
          r="2"
          fill="currentColor"
        >
          <title>Piłka</title>
          {playing && (
            <animateMotion dur={`${intervalSec}s`} repeatCount="indefinite" path={path} />
          )}
        </circle>
      </svg>
      <p className="bw-field-caption">
        {ACTION_LABELS[board.action]} · trójkąty: znaczniki · schemat poglądowy, odległości według
        opisu
      </p>
      {board.reactive && (
        <label>
          <input
            type="checkbox"
            checked={reactive}
            onChange={(e) => {
              setPlaying(false);
              setReactive(e.target.checked);
            }}
          />{" "}
          Kierunki i kolory: wyjście do wskazanej strefy
        </label>
      )}
      {reactive && (
        <p role="status">
          <strong>{cue.label}</strong> ·{" "}
          {cue.color === "blue"
            ? "niebieski"
            : cue.color === "green"
              ? "zielony"
              : cue.color === "yellow"
                ? "żółty"
                : "czerwony"}
          . Patrz na sygnał przed kontaktem. Wróć do środka przed kolejnym.
        </p>
      )}
      <div className="bw-field-controls">
        <button type="button" onClick={() => setPlaying((v) => !v)}>
          {playing ? "Pauza" : "Odtwórz schemat"}
        </button>
        <label>
          Zmiana co{" "}
          <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))}>
            {[4, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="bw-field-caption">
        Tempo schematu służy nauce. Dawkę i przerwy wykonuj zgodnie z sesją.
      </p>
      <div className="bw-field-controls">
        {drill.steps.map((_, i) => (
          <button
            type="button"
            key={i}
            aria-pressed={step === i}
            onClick={() => {
              setPlaying(false);
              setStep(i);
            }}
          >
            Krok {i + 1}
          </button>
        ))}
      </div>
      <p>{drill.steps[step]}</p>
      <p>
        <strong>Kontrola jakości:</strong> {drill.quality}
      </p>
      <p>
        <strong>Unikaj:</strong> {drill.mistake}
      </p>
    </section>
  );
}
