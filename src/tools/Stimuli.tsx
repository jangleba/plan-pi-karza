import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../Sheet";
import { DEFAULT_OPTS, DIR_LABEL, PACES, makeSequence, type Dir, type Pace, type StimKind, type StimOpts, type Stimulus } from "../engine/stimuli";
import { Landscape } from "./Landscape";
import { beep, buzz, keepAwake, prepareAudio } from "./feedback";
import { scoped } from "../lib/store";

const KEY = "stimOpts";
interface Saved { opts: StimOpts; pace: Pace; sound: boolean; vibe: boolean }
const DEFAULT: Saved = { opts: DEFAULT_OPTS, pace: "medium", sound: true, vibe: true };
const load = (): Saved => { try { return { ...DEFAULT, ...(JSON.parse(scoped.getItem(KEY) ?? "{}") as Partial<Saved>) }; } catch { return DEFAULT; } };
const KINDS: Array<[StimKind, string, string]> = [["arrow", "Strzałki", "kierunek ruchu"], ["color", "Kolory", "np. kolor pachołka"], ["number", "Liczby", "np. numer pachołka"], ["combo", "Kolor + strzałka", "gdzie i którym kierunkiem"]];
const DURATIONS = [30, 60, 120, 300];

const rot: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };
/** Duża strzałka (kierunek obrotem). */
function Arrow({ dir, color = "#fff" }: { dir: Dir; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full max-h-[62vmin] w-full max-w-[62vmin]" style={{ transform: `rotate(${rot[dir]}deg)` }} aria-label={DIR_LABEL[dir]}>
      <path d="M8 50h72M52 22l28 28-28 28" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Face({ s }: { s: Stimulus | null }) {
  if (!s) return <div className="flex h-full w-full items-center justify-center"><span className="h-3 w-3 rounded-full bg-white/30" /></div>;
  if (s.kind === "arrow") return <div className="flex h-full w-full items-center justify-center" style={{ background: "#1d1d1f" }}><Arrow dir={s.dir!} /></div>;
  if (s.kind === "number") return <div className="flex h-full w-full items-center justify-center" style={{ background: "#1d1d1f" }}><span className="font-semibold leading-none tabular-nums" style={{ fontSize: "58vmin" }}>{s.number}</span></div>;
  const fg = s.color!.id === "yellow" ? "#1d1d1f" : "#fff";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[2vmin]" style={{ background: s.color!.hex, color: fg }}>
      {s.kind === "combo" ? <Arrow dir={s.dir!} color={fg} /> : <span className="font-semibold tracking-tight" style={{ fontSize: "16vmin" }}>{s.color!.name}</span>}
      {s.kind === "combo" && <span className="font-medium" style={{ fontSize: "7vmin" }}>{s.color!.name}</span>}
    </div>
  );
}

/** Bieg bodźców na pełnym ekranie: odliczanie 3-2-1, losowe bodźce, pauza/koniec, podsumowanie. */
function Runner({ cfg, onClose }: { cfg: Saved; onClose: () => void }) {
  const [round, setRound] = useState(0);
  const seq = useMemo(() => makeSequence({ ...cfg.opts, minGap: PACES[cfg.pace].minGap, maxGap: PACES[cfg.pace].maxGap }, (Date.now() + round * 7919) & 0xffffff), [cfg, round]);
  const total = cfg.opts.durationS;
  const [phase, setPhase] = useState<"count" | "run" | "done">("count");
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(3);
  const [t, setT] = useState(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const lastIdx = useRef(-1);

  useEffect(() => { let rel = () => {}; keepAwake().then((r) => { rel = r; }); return () => rel(); }, []);

  useEffect(() => {
    if (phase !== "count") return;
    prepareAudio();
    let n = 3;
    setCount(3);
    if (cfg.sound) beep(660, 80);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(id); setPhase("run"); return; }
      setCount(n);
      if (cfg.sound) beep(660, 80);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, cfg.sound, round]);

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0, last = performance.now(), el = 0;
    lastIdx.current = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000; last = now;
      if (pausedRef.current) return;
      el += dt;
      if (el >= total) { setT(total); setPhase("done"); cancelAnimationFrame(raf); return; }
      setT(el);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, total, round]);

  // aktualny bodziec: ostatni z at ≤ t; widoczny przez min(1,5 s, 75% odstępu do następnego), potem przerwa
  let idx = -1;
  for (let i = 0; i < seq.length; i++) if (seq[i]!.at <= t) idx = i; else break;
  const cur = idx >= 0 ? seq[idx]! : null;
  const gap = idx >= 0 ? (seq[idx + 1]?.at ?? total) - cur!.at : 0;
  const visible = cur !== null && t - cur.at < Math.min(1.5, gap * 0.75);
  const shown = phase === "run" && visible ? cur : null;

  useEffect(() => {
    if (phase !== "run" || idx === lastIdx.current || idx < 0) return;
    lastIdx.current = idx;
    if (cfg.sound) beep(880, 90);
    if (cfg.vibe) buzz(40);
  }, [phase, idx, cfg.sound, cfg.vibe]);

  const left = Math.max(0, Math.ceil(total - t));
  return (
    <Landscape>
      <div className="relative h-full w-full select-none">
        {phase === "count" && <div className="flex h-full w-full items-center justify-center"><span className="font-semibold tabular-nums" style={{ fontSize: "60vmin" }}>{count || ""}</span></div>}
        {phase === "run" && <Face s={shown} />}
        {phase === "done" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-[4vmin] px-6 text-center">
            <div style={{ fontSize: "9vmin" }} className="font-semibold">Koniec</div>
            <div className="text-white/70" style={{ fontSize: "4.5vmin" }}>{seq.length} bodźców w {Math.floor(total / 60) ? `${Math.floor(total / 60)} min` : `${total} s`}</div>
            <div className="flex gap-3">
              <button onClick={() => { setPhase("count"); setCount(3); setT(0); setPaused(false); setRound((r) => r + 1); }} className="rounded-2xl px-6 py-3 text-base font-medium" style={{ background: "#dbe9fa", color: "#1f4d80" }}>Jeszcze raz</button>
              <button onClick={onClose} className="rounded-2xl bg-white/15 px-6 py-3 text-base font-medium">Zamknij</button>
            </div>
          </div>
        )}
        {phase !== "done" && (
          <>
            <div className="absolute right-3 top-3 flex gap-2" style={{ color: "#fff" }}>
              {phase === "run" && <button onClick={() => setPaused(!paused)} aria-label={paused ? "Wznów" : "Pauza"} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-lg backdrop-blur">{paused ? "▶" : "❚❚"}</button>}
              <button onClick={onClose} aria-label="Zakończ" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-lg backdrop-blur">✕</button>
            </div>
            {phase === "run" && <div className="absolute left-4 top-3 rounded-full bg-black/35 px-3 py-1 text-sm tabular-nums backdrop-blur">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>}
            {phase === "run" && <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/25"><div className="h-full bg-white/80" style={{ width: `${(t / total) * 100}%` }} /></div>}
            {paused && <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold backdrop-blur-sm">Pauza</div>}
          </>
        )}
      </div>
    </Landscape>
  );
}

/** Ustawienia i start bodźców (karta od dołu), potem pełny ekran poziomo. */
export function StimuliTool({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<Saved>(load);
  const [running, setRunning] = useState(false);
  const set = (p: Partial<StimOpts>) => setCfg((c) => ({ ...c, opts: { ...c.opts, ...p } }));
  const save = (c: Saved) => { try { scoped.setItem(KEY, JSON.stringify(c)); } catch { /* brak pamięci */ } };
  const chip = (on: boolean) => `rounded-full border px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "border-hairline bg-canvas"}`;
  const seg = <T extends string | number>(items: Array<[T, string]>, v: T, on: (x: T) => void) => (
    <div className="flex gap-1.5 rounded-xl bg-canvas p-1">{items.map(([k, t]) => <button key={String(k)} onClick={() => on(k)} className={`flex-1 rounded-lg py-1.5 text-sm ${v === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>)}</div>
  );
  const o = cfg.opts;
  const toggle = (k: StimKind) => set({ kinds: o.kinds.includes(k) ? o.kinds.filter((x) => x !== k) : [...o.kinds, k] });

  if (running) return <Runner cfg={cfg} onClose={() => setRunning(false)} />;
  return (
    <Sheet title="Bodźce" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Ekran pokazuje losowo, gdzie biec lub co zrobić. Połóż telefon poziomo na statywie albo daj go trenerowi.</p>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Co pokazywać</h3>
      <div className="flex flex-wrap gap-2">{KINDS.map(([k, t]) => <button key={k} onClick={() => toggle(k)} className={chip(o.kinds.includes(k))}>{t}</button>)}</div>
      <p className="mt-1.5 text-xs text-muted">{KINDS.filter(([k]) => o.kinds.includes(k)).map(([, t, d]) => `${t}: ${d}`).join(" · ") || "Wybierz co najmniej jeden rodzaj."}</p>

      <div className="mt-5 space-y-3">
        {(o.kinds.includes("arrow") || o.kinds.includes("combo")) && <div><div className="mb-1 text-sm text-muted">Kierunki</div>{seg<2 | 4>([[2, "2 (lewo/prawo)"], [4, "4 (z przodem i tyłem)"]], o.dirs, (v) => set({ dirs: v }))}</div>}
        {(o.kinds.includes("color") || o.kinds.includes("combo")) && <div><div className="mb-1 text-sm text-muted">Kolory</div>{seg<2 | 3 | 4>([[2, "2"], [3, "3"], [4, "4"]], o.colors, (v) => set({ colors: v }))}</div>}
        {o.kinds.includes("number") && <div><div className="mb-1 text-sm text-muted">Liczby od 1 do…</div>{seg<number>([[3, "3"], [4, "4"], [5, "5"], [6, "6"]], o.maxNumber, (v) => set({ maxNumber: v }))}</div>}
        <div><div className="mb-1 text-sm text-muted">Tempo</div>{seg<Pace>((Object.keys(PACES) as Pace[]).map((p) => [p, `${PACES[p].label} (${PACES[p].minGap}–${PACES[p].maxGap} s)`]), cfg.pace, (v) => setCfg({ ...cfg, pace: v }))}</div>
        <div><div className="mb-1 text-sm text-muted">Czas</div>{seg<number>(DURATIONS.map((d) => [d, d < 60 ? `${d} s` : `${d / 60} min`]), o.durationS, (v) => set({ durationS: v }))}</div>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => setCfg({ ...cfg, sound: !cfg.sound })} className={`flex-1 ${chip(cfg.sound)}`}>Dźwięk {cfg.sound ? "wł." : "wył."}</button>
        <button onClick={() => setCfg({ ...cfg, vibe: !cfg.vibe })} className={`flex-1 ${chip(cfg.vibe)}`}>Wibracja {cfg.vibe ? "wł." : "wył."}</button>
      </div>
      <button disabled={o.kinds.length === 0} onClick={() => { save(cfg); prepareAudio(); setRunning(true); }} className="mt-6 w-full rounded-2xl bw-grad py-4 text-base font-medium disabled:opacity-40">Start (odliczanie 3 s)</button>
      <p className="mt-2 text-[11px] text-muted">Wibracja nie działa w Safari na iPhonie. Ekran nie gaśnie podczas ćwiczenia, jeśli przeglądarka na to pozwala.</p>
    </Sheet>
  );
}
