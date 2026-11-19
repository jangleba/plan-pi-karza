import { useMemo, useRef, useState } from "react";
import { DIR_LABEL, drawOne, rng, type Dir, type Drawn, type DrawKind } from "../engine/stimuli";
import { Landscape } from "./Landscape";
import { beep, buzz, prepareAudio } from "./feedback";

const KINDS: Array<[DrawKind, string]> = [["color", "Kolor"], ["number", "Numer"], ["side", "Strona"], ["dir", "Kierunek"]];
const N_OPTS: Record<DrawKind, number[]> = { color: [2, 3, 4], number: [3, 4, 5, 6], side: [2], dir: [2, 4] };
const rot: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

function Big({ d }: { d: Drawn | null }) {
  if (!d) return <div className="flex h-full w-full items-center justify-center text-center text-white/70" style={{ fontSize: "6vmin" }}>Dotknij ekranu, żeby wylosować</div>;
  if (d.kind === "color") {
    const fg = d.color!.id === "yellow" ? "#1d1d1f" : "#fff";
    return <div className="flex h-full w-full items-center justify-center" style={{ background: d.color!.hex, color: fg }}><span className="font-semibold" style={{ fontSize: "20vmin" }}>{d.label}</span></div>;
  }
  if (d.kind === "number") return <div className="flex h-full w-full items-center justify-center"><span className="font-semibold leading-none tabular-nums" style={{ fontSize: "62vmin" }}>{d.label}</span></div>;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[2vmin]">
      {d.kind === "dir" || d.kind === "side" ? (
        <svg viewBox="0 0 100 100" className="max-h-[50vmin] w-[50vmin]" style={{ transform: `rotate(${rot[d.dir!]}deg)` }}><path d="M8 50h72M52 22l28 28-28 28" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : null}
      <span className="font-semibold" style={{ fontSize: "10vmin" }}>{d.kind === "dir" ? DIR_LABEL[d.dir!] : d.label}</span>
    </div>
  );
}

/** Losowanie na pełnym ekranie poziomo: kolor / numer / strona / kierunek; dotknięcie losuje kolejny, bez powtórzenia poprzedniego. */
export function DrawTool({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<DrawKind>("color");
  const [n, setN] = useState(4);
  const [cur, setCur] = useState<Drawn | null>(null);
  const [hist, setHist] = useState<Drawn[]>([]);
  const r = useRef(rng(Date.now() & 0xffffff));
  const nn = N_OPTS[kind].includes(n) ? n : N_OPTS[kind][N_OPTS[kind].length - 1]!;
  const draw = () => { prepareAudio(); const d = drawOne(kind, nn, cur, r.current); setCur(d); setHist((h) => [d, ...h].slice(0, 8)); beep(740, 70); buzz(30); };
  const bg = useMemo(() => "#1d1d1f", []);
  const pill = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm backdrop-blur ${on ? "bg-white text-[#1d1d1f] font-medium" : "bg-black/35 text-white"}`;
  return (
    <Landscape bg={bg}>
      <div className="relative h-full w-full select-none" onClick={draw}>
        <Big d={cur} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {KINDS.map(([k, t]) => <button key={k} onClick={() => { setKind(k); setCur(null); }} className={pill(kind === k)}>{t}</button>)}
          <span className="mx-1 w-px bg-white/25" />
          {N_OPTS[kind].length > 1 && N_OPTS[kind].map((x) => <button key={x} onClick={() => setN(x)} className={pill(nn === x)}>{kind === "color" ? `${x} kol.` : kind === "number" ? `1–${x}` : `${x} kier.`}</button>)}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Zamknij" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-lg backdrop-blur">✕</button>
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          {hist.slice(1).map((h, i) => <span key={i} className="rounded-full bg-black/35 px-3 py-1 text-sm backdrop-blur" style={{ opacity: 1 - i * 0.1 }}>{h.label}</span>)}
        </div>
      </div>
    </Landscape>
  );
}
