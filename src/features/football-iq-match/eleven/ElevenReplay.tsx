/** The explanation from above: the whole fragment drawn from a bird's-eye view with the rivals'
 * offside line, the moments that mattered and what each of them means.
 *
 * Drawn as SVG on the pitch in metres (105 × 68, attack to the right), from the light snapshots
 * the simulator keeps. A moment of the story can be opened: the replay jumps there, stops, and
 * draws the line and the players the text talks about. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Snapshot } from "./e11Sim";
import { E11, PLAYERS_PER_TEAM, shirtOf } from "./e11Variants";
import type { E11Debrief, Grade, Moment } from "./e11Debrief";
import "./eleven.css";

const W = E11.halfLength * 2;
const H = E11.halfWidth * 2;
const SNAP_SECONDS = 2 / 60;
/** Pitch metres (x across, y along the attack) → drawing units (attack to the right). */
const X = (y: number) => y + E11.halfLength;
const Y = (x: number) => x + E11.halfWidth;

const GRADE_LABEL: Record<Grade, string> = {
  good: "Dobrze",
  ok: "Do poprawy",
  poor: "Słabo",
};

function ElevenReplay({
  snapshots,
  moments,
  ty,
  startTick = 0,
  aside,
}: {
  snapshots: readonly Snapshot[];
  moments: readonly Moment[];
  ty: number;
  startTick?: number;
  /** The grades and the tip, shown beside the pitch above the moments. */
  aside?: React.ReactNode;
}) {
  const first = Math.max(
    0,
    snapshots.findIndex((s) => s.tick >= startTick),
  );
  const [index, setIndex] = useState(first);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [open, setOpen] = useState<Moment | null>(null);
  const clock = useRef(0);
  const last = snapshots.length - 1;

  // Playback: one snapshot is 1/30 s of the fragment.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let before = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = before ? (now - before) / 1000 : 0;
      before = now;
      clock.current += dt * speed;
      const step = Math.floor(clock.current / SNAP_SECONDS);
      if (step >= 1) {
        clock.current -= step * SNAP_SECONDS;
        setIndex((i) => {
          const next = Math.min(last, i + step);
          if (next >= last) setPlaying(false);
          return next;
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last]);

  const snap = snapshots[Math.min(index, last)]!;
  const seek = (i: number) => {
    setIndex(Math.max(0, Math.min(last, i)));
    clock.current = 0;
  };
  const openMoment = (m: Moment) => {
    setPlaying(false);
    setOpen(m);
    const i = snapshots.findIndex((s) => s.tick >= m.tick);
    seek(i < 0 ? last : i);
  };
  const focus = open?.focus;
  const players = useMemo(() => {
    const out: { i: number; x: number; y: number; h: number }[] = [];
    for (let i = 0; i < snap.p.length / 3; i++)
      out.push({ i, x: snap.p[i * 3]!, y: snap.p[i * 3 + 1]!, h: snap.p[i * 3 + 2]! });
    return out;
  }, [snap]);
  const lineX = X(snap.line);
  const focusLine = focus?.line != null ? X(focus.line) : null;
  const arrow = focus?.arrow ? [players[focus.arrow[0]]!, players[focus.arrow[1]]!] : null;

  return (
    <div className="e11-replay">
      <div className="e11-main">
        <svg
          viewBox={`-2 -2 ${W + 4} ${H + 4}`}
          role="img"
          aria-label="Powtórka z góry: boisko, zawodnicy, linia spalonego"
          className="e11-pitch"
        >
          <rect x={0} y={0} width={W} height={H} className="e11-grass" />
          <g className="e11-marks">
            <rect x={0} y={0} width={W} height={H} />
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
            <circle cx={W / 2} cy={H / 2} r={9.15} />
            {[0, 1].map((side) => {
              const dir = side === 0 ? 1 : -1;
              const x0 = side === 0 ? 0 : W;
              return (
                <g key={side}>
                  <rect
                    x={Math.min(x0, x0 + dir * E11.boxDepth)}
                    y={H / 2 - E11.boxHalfWidth}
                    width={E11.boxDepth}
                    height={E11.boxHalfWidth * 2}
                  />
                  <rect
                    x={x0 - (side === 0 ? 0 : 2)}
                    y={H / 2 - E11.goalHalfWidth}
                    width={2}
                    height={E11.goalHalfWidth * 2}
                    className="e11-goal"
                  />
                </g>
              );
            })}
          </g>
          {/* Beyond the rivals' line: where a player of yours would be offside. */}
          <rect x={lineX} y={0} width={W - lineX} height={H} className="e11-offzone" />
          <line x1={lineX} y1={0} x2={lineX} y2={H} className="e11-line" />
          {focusLine !== null && Math.abs(focusLine - lineX) > 0.05 && (
            <line x1={focusLine} y1={0} x2={focusLine} y2={H} className="e11-line e11-line-focus" />
          )}
          {arrow && (
            <line
              x1={X(arrow[0].y)}
              y1={Y(arrow[0].x)}
              x2={X(arrow[1].y)}
              y2={Y(arrow[1].x)}
              className="e11-arrow"
            />
          )}
          {players.map((p) => {
            const home = p.i < PLAYERS_PER_TEAM;
            const marked = focus?.players.includes(p.i);
            return (
              <g
                key={p.i}
                transform={`translate(${X(p.y)} ${Y(p.x)})`}
                data-team={home ? "home" : "away"}
              >
                {marked && <circle r={2.8} className="e11-focus" />}
                {p.i === ty && <circle r={2.3} className="e11-you" />}
                <circle r={1.6} className={home ? "e11-home" : "e11-away"} />
                <text y={0.1} className="e11-num">
                  {shirtOf(p.i)}
                </text>
              </g>
            );
          })}
          <circle cx={X(snap.ball[1])} cy={Y(snap.ball[0])} r={0.65} className="e11-ball" />
        </svg>

        <div className="e11-transport">
          <button
            type="button"
            className="e11-round"
            aria-label={playing ? "Zatrzymaj powtórkę" : "Odtwórz powtórkę"}
            onClick={() => {
              if (!playing && index >= last) seek(first);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={last}
            value={Math.min(index, last)}
            aria-label="Przewiń powtórkę"
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
          <span className="e11-time" aria-live="off">
            {(snap.tick / 60).toFixed(1).replace(".", ",")} s
          </span>
          <button
            type="button"
            className="e11-speed"
            aria-label={`Prędkość ${speed === 1 ? "normalna" : "połowa"}`}
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
          >
            {speed === 1 ? "1×" : "0,5×"}
          </button>
        </div>
      </div>
      <div className="e11-side">
        {aside}
        <ol className="e11-moments" aria-label="Co się działo">
          {moments.map((m) => (
            <li key={`${m.tick}-${m.kind}`}>
              <button
                type="button"
                data-open={open === m || undefined}
                data-grade={m.grade ?? undefined}
                onClick={() => openMoment(m)}
              >
                <b>{m.title}</b>
                <small>{m.seconds.toFixed(1).replace(".", ",")} s</small>
                {open === m && <span>{m.text}</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** The whole debrief: the replay from above on one side, the grades and the tip on the other. */
export function ElevenDebrief({
  debrief,
  snapshots,
  ty,
}: {
  debrief: E11Debrief;
  snapshots: readonly Snapshot[];
  ty: number;
}) {
  const rows: { label: string; grade: Grade | null; text: string }[] = [
    { label: "Moment podania", grade: debrief.timing.grade, text: debrief.timing.text },
    { label: "Decyzja", grade: debrief.choice.grade, text: debrief.choice.text },
    { label: "Rezultat", grade: null, text: debrief.result.text },
  ];
  const panel = (
    <section className="e11-panel" aria-label="Ocena akcji">
      <h2>Co się stało</h2>
      {rows.map((row) => (
        <div key={row.label} className="e11-row">
          <div className="e11-row-head">
            <b>{row.label}</b>
            {row.grade && (
              <span className="e11-grade" data-grade={row.grade}>
                {GRADE_LABEL[row.grade]}
              </span>
            )}
          </div>
          <p>{row.text}</p>
        </div>
      ))}
      <p className="e11-tip">{debrief.tip}</p>
    </section>
  );
  return (
    <div className="e11-debrief">
      <ElevenReplay
        snapshots={snapshots}
        moments={debrief.moments}
        ty={ty}
        startTick={debrief.keyTick}
        aside={panel}
      />
    </div>
  );
}
