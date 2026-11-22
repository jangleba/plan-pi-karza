import { useMemo, useState } from "react";
import { ARROW_COLOR, ARROW_LEGEND, ARROW_NAME, arrowsInOrder, equipmentLine, mirrorDrill, withVariant } from "../engine/drill";
import type { ArrowStyle, Drill } from "../engine/drill";
import { DrillBoard } from "./DrillBoard";
import { STROKE } from "./draw";
import { useStepPlayer } from "./useStepPlayer";

const ORDER: ArrowStyle[] = ["pass", "lob", "dribble", "run", "touch", "shot"];

function Sample({ style }: { style: ArrowStyle }) {
  const st = STROKE[style];
  const d = style === "dribble" ? "M2 8 q3 -6 6 0 t6 0 t6 0" : style === "lob" ? "M2 11 Q14 -3 26 11" : "M2 8 H26";
  return (
    <svg viewBox="0 0 30 16" className="h-4 w-8 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={ARROW_COLOR[style]} strokeWidth={Math.max(1.6, st.w * 3)} strokeLinecap="round" strokeDasharray={st.dash ? st.dash.split(" ").map((x) => Number(x) * 3).join(" ") : undefined} />
    </svg>
  );
}

/** Pełny ekran ćwiczenia: rysunek, legenda, odtwarzanie (cała akcja i kroki), lustro, wariant A/B, kolejność, sprzęt i wskazówki. */
export function DrillFull({ drill, onClose, onHalf, onInvite }: { drill: Drill; onClose: () => void; onHalf?: () => void; onInvite?: () => void }) {
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [mirror, setMirror] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const eff = useMemo(() => { const v = withVariant(drill, variant); return mirror ? mirrorDrill(v) : v; }, [drill, variant, mirror]);
  const p = useStepPlayer(eff);
  const ordered = arrowsInOrder(eff);
  const hasB = !!drill.variants?.some((v) => v.id === "B");
  const note = (a: (typeof ordered)[number]) => a.note ?? ARROW_NAME[a.style];

  return (
    <div className="bw-sheet fixed inset-0 z-40 overflow-y-auto bg-card" role="dialog" aria-label={drill.title}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-card/95 px-4 py-3 backdrop-blur">
        <h2 className="min-w-0 truncate text-[17px] font-semibold">{drill.title}</h2>
        <button onClick={onClose} className="shrink-0 rounded-xl bg-canvas px-3 py-1.5 text-sm">Zamknij</button>
      </div>
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        {hasB && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1" role="tablist" aria-label="Wariant">
            {(["A", "B"] as const).map((id) => {
              const title = id === "A" ? drill.titleA ?? "Podstawowy" : drill.variants!.find((v) => v.id === "B")!.title;
              return <button key={id} role="tab" aria-selected={variant === id} onClick={() => setVariant(id)} className={`rounded-xl py-2 text-sm ${variant === id ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{id} · {title}</button>;
            })}
          </div>
        )}
        <DrillBoard drill={eff} step={p.step} anim={p.shown ? { player: p.st.player, ball: p.st.ball } : null} />

        <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="Legenda strzałek">
          {ORDER.map((k) => <li key={k} className="flex items-center gap-1.5" title={ARROW_NAME[k]}><Sample style={k} />{ARROW_LEGEND[k]}</li>)}
        </ul>

        {p.hasAnim && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={p.toggle} aria-label={p.playing ? "Pauza" : "Odtwórz"} className="flex h-11 items-center gap-2 rounded-full bw-grad px-4 text-sm font-medium active:scale-95">{p.playing ? "❚❚ Pauza" : "▶ Odtwórz"}</button>
            {p.steps.map((n, i) => (
              <button key={n} onClick={() => p.selectStep(n)} aria-label={`Krok ${n}`} aria-pressed={p.step === n}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 bg-card text-sm font-semibold active:scale-90 ${p.step === n ? "bw-sel" : ""}`}
                style={{ borderColor: ARROW_COLOR[ordered[i]!.style] }}>{n}</button>
            ))}
            <button onClick={() => p.selectStep(null)} aria-pressed={p.step === null && p.playing} className={`h-11 rounded-full px-4 text-sm ${p.step === null && p.playing ? "bw-sel font-medium" : "bg-canvas"}`}>Cała akcja</button>
            <button onClick={() => setMirror((m) => !m)} aria-pressed={mirror} className={`ml-auto h-11 rounded-full px-4 text-sm ${mirror ? "bw-sel font-medium" : "bg-canvas"}`}>↔ Lustro</button>
          </div>
        )}
        <p className="mt-2 min-h-[1.25rem] text-xs text-ink/80" role="status">{p.step !== null ? `Krok ${p.step}: ${note(ordered[p.steps.indexOf(p.step)]!)}` : p.caption}</p>

        <h3 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Kolejność</h3>
        <ol className="space-y-2">
          {ordered.map((a, i) => {
            const n = p.steps[i]!;
            return (
              <li key={i}>
                <button onClick={() => p.selectStep(n)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] ${p.step === n ? "bw-sel" : "bg-canvas"}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-card text-sm font-semibold tabular-nums" style={{ borderColor: ARROW_COLOR[a.style] }}>{n}</span>
                  <span className="min-w-0 flex-1 leading-snug">{note(a)}</span>
                  <span className="shrink-0 text-[11px] text-muted">{ARROW_LEGEND[a.style]}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-muted"><span className="text-ink">Sprzęt:</span> {equipmentLine(eff)}</span>
          {eff.setup && <button onClick={() => setSetupOpen((o) => !o)} aria-expanded={setupOpen} className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-xs text-accent">{setupOpen ? "Ukryj" : "Jak ustawić"}</button>}
        </div>
        {setupOpen && eff.setup && <p className="bw-rise mt-2 rounded-2xl bg-canvas px-4 py-3 text-sm leading-snug">{eff.setup}</p>}
        {eff.tip && <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-sm italic leading-snug text-ink/80">{eff.tip}</p>}

        <p className="mt-5 text-sm text-ink">{drill.goal}</p>
        <p className="mt-1 text-xs text-muted">{drill.dose}</p>
        <ul className="mt-2 list-disc pl-5 text-sm">{drill.points.map((x) => <li key={x}>{x}</li>)}</ul>
        {(onHalf || onInvite) && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {onHalf && <button onClick={onHalf} className="rounded-xl bg-canvas py-3 text-sm font-medium text-accent active:scale-[0.98]">Na połowie boiska</button>}
            {onInvite && <button onClick={onInvite} className="rounded-xl bg-canvas py-3 text-sm font-medium text-accent active:scale-[0.98]">Zaproś partnera</button>}
          </div>
        )}
      </div>
    </div>
  );
}
