import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ARROW_COLOR, ARROW_LEGEND, ARROW_NAME, arrowsInOrder, equipmentLine, mirrorDrill, withVariant } from "../engine/drill";
import type { ArrowStyle, Drill } from "../engine/drill";
import { DrillBoard } from "./DrillBoard";
import { STROKE } from "./draw";
import { useStepPlayer } from "./useStepPlayer";

const ORDER: ArrowStyle[] = ["pass", "lob", "dribble", "run", "touch", "shot"];

function Sample({ style, small = false }: { style: ArrowStyle; small?: boolean }) {
  const st = STROKE[style];
  const d = style === "dribble" ? "M2 8 q3 -6 6 0 t6 0 t6 0" : style === "lob" ? "M2 11 Q14 -3 26 11" : "M2 8 H26";
  return (
    <svg viewBox="0 0 30 16" className={`${small ? "h-3 w-6" : "h-4 w-8"} shrink-0`} aria-hidden="true">
      <path d={d} fill="none" stroke={ARROW_COLOR[style]} strokeWidth={Math.max(1.6, st.w * 3)} strokeLinecap="round" strokeDasharray={st.dash ? st.dash.split(" ").map((x) => Number(x) * 3).join(" ") : undefined} />
    </svg>
  );
}

/** Rozmiar okna; na telefonie trzymanym pionowo ekran ćwiczenia obracamy o 90°, żeby zawsze wyglądał poziomo. */
function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("resize", on); window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
  return v;
}

/**
 * Pełny ekran ćwiczenia, zawsze poziomo (jak wzorzec): u góry nazwa i numer ćwiczenia, szeroka połowa boiska z liniami, sprzętem i strzałkami,
 * po prawej Kolejność, Sprzęt, Wariant i wskazówka, pod rysunkiem legenda i sterowanie (Odtwórz, kroki, Cała akcja, Lustro), na dole karty pozostałych ćwiczeń.
 */
export function DrillFull({ drill, drills = [], groupTitle, onSelect, onClose, onHalf, onInvite }: {
  drill: Drill; drills?: Drill[]; groupTitle?: string; onSelect?: (d: Drill) => void; onClose: () => void; onHalf?: () => void; onInvite?: () => void;
}) {
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [mirror, setMirror] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => { setVariant("A"); setMirror(false); setSetupOpen(false); }, [drill.id]);
  const eff = useMemo(() => { const v = withVariant(drill, variant); return mirror ? mirrorDrill(v) : v; }, [drill, variant, mirror]);
  const p = useStepPlayer(eff);
  const ordered = arrowsInOrder(eff);
  const hasB = !!drill.variants?.some((v) => v.id === "B");
  const note = (a: (typeof ordered)[number]) => a.note ?? ARROW_NAME[a.style];
  const { w, h } = useViewport();
  const portrait = h > w;
  const W = portrait ? h : w, H = portrait ? w : h; // wymiary „poziomego” ekranu
  const tall = H >= 560;
  const compact = H < 520; // niski ekran (telefon poziomo): zwarty nagłówek, legenda i sterowanie w pojedynczych rzędach
  const idx = Math.max(0, drills.findIndex((d) => d.id === drill.id));
  const shell: CSSProperties = portrait
    ? { position: "fixed", top: 0, left: 0, width: W, height: H, transform: `translateX(${w}px) rotate(90deg)`, transformOrigin: "0 0" }
    : { position: "fixed", inset: 0 };

  return (
    <div className="bw-sheet z-40 overflow-hidden bg-[#fafaf7]" style={shell} role="dialog" aria-label={drill.title}>
      <div className="flex h-full w-full flex-col">
        {compact ? (
          <header className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-1.5">
            <span aria-hidden="true" className="text-sm">⚽</span>
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight">{drill.title}</h2>
            {drills.length > 1 && <span className="shrink-0 text-[11px] text-muted">{idx + 1}/{drills.length}</span>}
            <button onClick={onClose} className="shrink-0 rounded-full bg-black px-3 py-1 text-xs font-medium text-white active:scale-95">Zamknij</button>
          </header>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold"><span aria-hidden="true">⚽</span>BallWise</span>
              <span className="h-4 w-px bg-hairline" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted">{groupTitle ?? "Technika z piłką"}</span>
              {drills.length > 1 && <span className="shrink-0 text-xs text-muted">Ćwiczenie {idx + 1} z {drills.length}</span>}
              <button onClick={onClose} className="shrink-0 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white active:scale-95">Zamknij</button>
            </header>
            <div className="flex shrink-0 items-baseline gap-3 px-4 pb-1">
              <h2 className="shrink-0 text-lg font-semibold leading-tight">{drill.title}</h2>
              <p className="min-w-0 truncate text-xs text-muted">{drill.goal}</p>
            </div>
          </>
        )}

        <div className={`flex min-h-0 flex-1 ${compact ? "gap-2 px-3" : "gap-3 px-4"}`}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <DrillBoard drill={eff} step={p.step} anim={p.shown ? { player: p.st.player, ball: p.st.ball, players: p.st.players } : null} className="h-full w-full rounded-xl" />
            </div>
            <ul className={`mt-1 flex shrink-0 items-center overflow-x-auto text-muted ${compact ? "gap-x-2 text-[9px]" : "flex-wrap gap-x-3 gap-y-0.5 text-[11px]"}`} aria-label="Legenda strzałek">
              {ORDER.map((k) => <li key={k} className="flex shrink-0 items-center gap-1" title={ARROW_NAME[k]}><Sample style={k} small={compact} />{ARROW_LEGEND[k]}</li>)}
            </ul>
            {p.hasAnim && (
              <div className={`flex shrink-0 items-center overflow-x-auto ${compact ? "mt-1 gap-1 pb-1" : "mt-1.5 justify-end gap-1.5 pb-1"}`}>
                <button onClick={p.toggle} aria-label={p.playing ? "Pauza" : "Odtwórz"} className={`flex shrink-0 items-center gap-1.5 rounded-full bg-white font-medium shadow-sm ring-1 ring-black/10 active:scale-95 ${compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"}`}>{p.playing ? "❚❚" : "▶"}{!compact && (p.playing ? " Pauza" : " Odtwórz")}</button>
                {p.steps.map((n) => (
                  <button key={n} onClick={() => p.selectStep(n)} aria-label={`Krok ${n}`} aria-pressed={p.step === n}
                    className={`flex shrink-0 items-center justify-center rounded-full font-medium ring-1 ring-black/10 active:scale-90 ${compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"} ${p.step === n ? "bg-black text-white" : "bg-white"}`}>{n}</button>
                ))}
                <button onClick={() => p.selectStep(null)} aria-pressed={p.step === null && p.playing} className={`shrink-0 rounded-full ring-1 ring-black/10 ${compact ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm"} ${p.step === null && p.playing ? "bg-black text-white" : "bg-white"}`}>Cała akcja</button>
                <button onClick={() => setMirror((m) => !m)} aria-pressed={mirror} className={`shrink-0 rounded-full ring-1 ring-black/10 ${compact ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm"} ${mirror ? "bg-black text-white" : "bg-white"}`}>↔ Lustro</button>
              </div>
            )}
          </div>

          <aside className={`shrink-0 overflow-y-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${compact ? "w-[190px] p-2" : "w-[236px] p-3"}`}>
            <h3 className="mb-1.5 text-[15px] font-semibold">Kolejność</h3>
            <ol className="divide-y divide-hairline/70">
              {ordered.map((a, i) => {
                const n = p.steps[i]!;
                return (
                  <li key={i}>
                    <button onClick={() => p.selectStep(n)} className={`flex w-full items-center gap-2 py-1.5 text-left text-[13px] leading-snug ${p.step === n ? "font-semibold" : ""}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white text-xs font-semibold tabular-nums" style={{ borderColor: ARROW_COLOR[a.style] }}>{n}</span>
                      <span className="min-w-0 flex-1">{note(a)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <h3 className="mb-0.5 mt-3 text-[15px] font-semibold">Sprzęt</h3>
            <p className="text-[13px] first-letter:uppercase">{equipmentLine(eff)}</p>
            {eff.setup && <button onClick={() => setSetupOpen((o) => !o)} aria-expanded={setupOpen} className="mt-1 rounded-full bg-canvas px-2.5 py-1 text-[11px] text-accent">{setupOpen ? "Ukryj" : "Jak ustawić"}</button>}
            {setupOpen && eff.setup && <p className="bw-rise mt-1.5 rounded-xl bg-canvas px-2.5 py-2 text-xs leading-snug">{eff.setup}</p>}
            {hasB && (
              <>
                <h3 className="mb-1 mt-3 text-[15px] font-semibold">Wariant</h3>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-hairline/70 p-1" role="tablist" aria-label="Wariant">
                  {(["A", "B"] as const).map((id) => {
                    const title = id === "A" ? drill.titleA ?? "Podstawowy" : drill.variants!.find((v) => v.id === "B")!.title;
                    return <button key={id} role="tab" aria-selected={variant === id} onClick={() => setVariant(id)} className={`rounded-lg px-1 py-1.5 text-xs ${variant === id ? "bg-white font-semibold shadow-sm" : "text-muted"}`}>{id} · {title}</button>;
                  })}
                </div>
              </>
            )}
            {eff.tip && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs italic leading-snug text-ink/80">{eff.tip}</p>}
            <p className="mt-3 text-[11px] text-muted">{drill.dose}</p>
            <ul className="mt-1 list-disc pl-4 text-xs leading-snug">{drill.points.map((x) => <li key={x}>{x}</li>)}</ul>
            {(onHalf || onInvite) && (
              <div className="mt-3 grid gap-1.5">
                {onHalf && <button onClick={onHalf} className="rounded-xl bg-canvas py-2 text-xs font-medium text-accent">Na połowie boiska</button>}
                {onInvite && <button onClick={onInvite} className="rounded-xl bg-canvas py-2 text-xs font-medium text-accent">Zaproś partnera</button>}
              </div>
            )}
          </aside>
        </div>

        {tall && drills.length > 1 && (
          <footer className="grid shrink-0 gap-2 px-4 pb-3 pt-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, drills.length)}, minmax(0, 1fr))` }}>
            {drills.map((d) => (
              <button key={d.id} onClick={() => onSelect?.(d)} className={`flex items-center gap-3 rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ${d.id === drill.id ? "ring-black" : "ring-black/5"}`}>
                <span className="flex shrink-0 items-center">{arrowsInOrder(d).slice(0, 3).map((a, i) => <Sample key={i} style={a.style} />)}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{d.title}</span></span>
              </button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}
