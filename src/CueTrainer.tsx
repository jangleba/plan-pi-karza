import { useEffect, useRef, useState } from "react";

type Mode = "digit" | "color" | "arrow";
const COLORS = [
  { name: "Czerwony", hex: "#e89494" },
  { name: "Żółty", hex: "#f0cf6b" },
  { name: "Zielony", hex: "#7bc99a" },
  { name: "Niebieski", hex: "#8fb3e8" },
];
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** Bodziec do ćwiczeń obserwacji: cyfra, kolor lub strzałka co kilka sekund. */
export function CueTrainer() {
  const [mode, setMode] = useState<Mode>("color");
  const [running, setRunning] = useState(false);
  const [everyS, setEveryS] = useState(3);
  const [cue, setCue] = useState<{ text: string; hex?: string } | null>(null);
  const last = useRef(-1);

  const next = (): { text: string; hex?: string } => {
    const pick = (n: number) => {
      let i = Math.floor(Math.random() * n);
      if (n > 1 && i === last.current) i = (i + 1) % n;
      last.current = i;
      return i;
    };
    if (mode === "digit") return { text: String(1 + pick(5)) };
    if (mode === "arrow") return { text: ARROWS[pick(ARROWS.length)]! };
    const c = COLORS[pick(COLORS.length)]!;
    return { text: "", hex: c.hex };
  };

  useEffect(() => {
    if (!running) return;
    setCue(next());
    const id = setInterval(() => setCue(next()), everyS * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode, everyS]);

  return (
    <section className="rounded-2xl bg-card p-4 border border-hairline">
      <h3 className="mb-3 text-base font-semibold">Bodziec</h3>
      <div
        className="mb-3 flex h-40 items-center justify-center rounded-2xl text-7xl font-semibold"
        style={{ background: cue?.hex ?? "#f5f5f7" }}
      >
        {cue?.text ?? "–"}
      </div>
      <div className="mb-3 flex gap-1.5 rounded-xl bg-canvas p-1">
        {([["color", "Kolor"], ["digit", "Cyfra"], ["arrow", "Strzałka"]] as Array<[Mode, string]>).map(([m, t]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-1.5 text-sm ${mode === m ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
        ))}
      </div>
      <label className="mb-3 flex items-center justify-between text-sm text-muted">
        Co {everyS} s
        <input type="range" min={1} max={6} value={everyS} onChange={(e) => setEveryS(Number(e.target.value))} />
      </label>
      <button onClick={() => setRunning(!running)} className="w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-white">
        {running ? "Stop" : "Start"}
      </button>
    </section>
  );
}
