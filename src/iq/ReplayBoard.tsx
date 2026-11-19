import { useEffect, useMemo, useRef, useState } from "react";
import { duration, frameAt, type OptionResult, type Recording, type SimEvent } from "../engine/sim";

const C = { us: "#2f6fb3", them: "#c8443f", gk: "#e0b23a", me: "#1d1d1f", ok: "#2e9e62", bad: "#c8443f" };
const sec = (t: number) => t.toFixed(1).replace(".", ",");

/** Tekst zdarzenia do podpisu pod boiskiem. */
export function eventText(e: SimEvent, nameOf: (id?: string) => string): string | null {
  switch (e.type) {
    case "pass": return `${nameOf(e.by)} podaje do: ${nameOf(e.to)}`;
    case "intercept": return `${nameOf(e.by)} przecina podanie`;
    case "tackle": return `${nameOf(e.by)} odbiera piłkę`;
    case "shot": return `Strzał: ${nameOf(e.by)}`;
    case "goal": return "Gol";
    case "save": return "Obrona bramkarza";
    case "miss": return "Strzał niecelny";
    case "counter": return "Kontratak rywala";
    default: return null;
  }
}

const MARK: SimEvent["type"][] = ["pass", "intercept", "tackle", "shot", "goal", "save", "miss"];

/** Powtórka z góry: cały przebieg akcji na boisku, suwak czasu, znaczniki zdarzeń i tory podań w chwili decyzji (zielony – piłka zostaje u nas, czerwony – przecięte). */
export function ReplayBoard({ rec, events, lanes, laneT, nameOf }: { rec: Recording; events: SimEvent[]; lanes: OptionResult[]; laneT: number; nameOf: (id?: string) => string }) {
  const total = duration(rec);
  const [t, setT] = useState(laneT);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = ((now - last) / 1000) * (slow ? 0.5 : 1); last = now;
      setT((x) => { const n = x + dt; if (n >= total) { setPlaying(false); return total; } return n; });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, slow, total]);

  const shown = useMemo(() => frameAt(rec, t), [rec, t]);
  const laneFrame = useMemo(() => frameAt(rec, laneT), [rec, laneT]);
  const showLanes = lanes.length > 0 && Math.abs(t - laneT) < 0.35;
  const trail = useMemo(() => rec.frames.filter((f) => f.t <= t && f.t >= t - 1.2).map((f) => `${f.b[0]},${f.b[1]}`).join(" "), [rec, t]);
  const latest = [...events].filter((e) => e.t <= t + 1e-6).reverse().map((e) => ({ e, text: eventText(e, nameOf) })).find((x) => x.text);
  const marks = events.filter((e) => MARK.includes(e.type));
  if (!shown) return null;
  const me = shown.agents.find((a) => a.id === "P");

  return (
    <div>
      <svg viewBox="-1 -1 107 70" className="w-full rounded-2xl" role="img" aria-label="Powtórka z góry">
        <defs>
          <pattern id="rb-stripes" width="10.5" height="68" patternUnits="userSpaceOnUse"><rect width="5.25" height="68" fill="#e7f2e9" /><rect x="5.25" width="5.25" height="68" fill="#eef6ef" /></pattern>
        </defs>
        <rect x="-1" y="-1" width="107" height="70" fill="url(#rb-stripes)" />
        <g fill="none" stroke="white" strokeWidth="0.4">
          <rect x="0" y="0" width="105" height="68" />
          <line x1="52.5" x2="52.5" y1="0" y2="68" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0" y="13.84" width="16.5" height="40.32" /><rect x="88.5" y="13.84" width="16.5" height="40.32" />
          <rect x="0" y="24.84" width="5.5" height="18.32" /><rect x="99.5" y="24.84" width="5.5" height="18.32" />
        </g>
        {showLanes && laneFrame && me && lanes.map((l) => {
          const p = laneFrame.agents.find((a) => a.id === l.id), from = laneFrame.agents.find((a) => a.id === "P");
          if (!p || !from) return null;
          return <line key={l.id} x1={from.x} y1={from.y} x2={p.x} y2={p.y} stroke={l.kept ? C.ok : C.bad} strokeWidth="0.6" strokeDasharray={l.kept ? undefined : "1.4 1"} opacity="0.9" />;
        })}
        {trail && <polyline points={trail} fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.8" />}
        {shown.agents.map((a) => {
          const isMe = a.id === "P", gk = a.id.startsWith("GK");
          const fill = gk ? C.gk : a.team === "us" ? C.us : C.them;
          return (
            <g key={a.id}>
              {shown.owner === a.id && <circle cx={a.x} cy={a.y} r="2.3" fill="none" stroke="white" strokeWidth="0.45" />}
              <circle cx={a.x} cy={a.y} r={isMe ? 1.7 : 1.35} fill={fill} stroke={isMe ? C.me : "white"} strokeWidth={isMe ? 0.5 : 0.3} />
              <text x={a.x} y={a.y + 0.65} fontSize="1.7" textAnchor="middle" fontWeight="700" fill="white">{gk ? "" : a.number}</text>
              {showLanes && lanes.some((l) => l.id === a.id) && <text x={a.x} y={a.y - 2.2} fontSize="1.9" textAnchor="middle" fontWeight="700" fill={lanes.find((l) => l.id === a.id)!.kept ? C.ok : C.bad}>{lanes.find((l) => l.id === a.id)!.kept ? "✓" : "✕"}</text>}
            </g>
          );
        })}
        <circle cx={shown.ball.x} cy={shown.ball.y} r="0.9" fill="white" stroke="#1d1d1f" strokeWidth="0.3" />
      </svg>
      <p className="mt-2 min-h-[20px] text-center text-sm">{latest ? latest.text : " "}</p>
      <div className="mt-1 flex items-center gap-3">
        <button onClick={() => { if (t >= total - 0.05) setT(0); setPlaying(!playing); }} aria-label={playing ? "Pauza" : "Odtwórz"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bw-grad text-base">{playing ? "❚❚" : "▶"}</button>
        <div className="relative flex-1">
          <input type="range" min={0} max={total} step={0.05} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="h-1.5 w-full accent-[var(--color-btn-ink)]" aria-label="Czas powtórki" />
          <div className="pointer-events-none absolute inset-x-0 -bottom-2.5 h-2">
            {marks.map((e, i) => <span key={i} className="absolute h-1.5 w-0.5 rounded bg-muted/60" style={{ left: `${(e.t / (total || 1)) * 100}%` }} />)}
            {lanes.length > 0 && <span className="absolute h-2 w-0.5 rounded bg-btn-ink" style={{ left: `${(laneT / (total || 1)) * 100}%` }} />}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-muted">{sec(t)} / {sec(total)} s</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        {lanes.length > 0 ? <button onClick={() => { setPlaying(false); setT(laneT); }} className="text-accent">Skocz do decyzji</button> : <span />}
        <button onClick={() => setSlow(!slow)} className="text-muted">{slow ? "Tempo 0,5×" : "Tempo 1×"}</button>
      </div>
    </div>
  );
}
