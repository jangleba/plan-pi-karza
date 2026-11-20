import { useEffect, useMemo, useState } from "react";
import { formatPace } from "../engine";
import { averagePace } from "../engine";
import type { SavedRun } from "../engine/routeMap";
import { loadRuns, removeRun } from "../lib/runs";
import { RunMap } from "../RunMap";
import { Sheet } from "../Sheet";
import { shortDate } from "./metrics";

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const km = (m: number) => `${(m / 1000).toFixed(2).replace(".", ",")} km`;
const paceOf = (r: SavedRun) => { const p = averagePace(r.distanceM, r.elapsedMs); return p ? formatPace(p) : "–"; };

/** Historia biegów: lista i, po dotknięciu, mapa trasy pokolorowana tempem z podsumowaniem. */
export function RunsCard({ refreshKey }: { refreshKey?: number }) {
  const [runs, setRuns] = useState<SavedRun[]>(loadRuns);
  const [open, setOpen] = useState<SavedRun | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setRuns(loadRuns()); }, [refreshKey]);
  const recent = useMemo(() => [...runs].reverse().slice(0, 8), [runs]);
  if (!runs.length) return null;

  return (
    <>
      <h2 className="mb-2 mt-7 px-1 text-xs uppercase tracking-wide text-muted">Biegi</h2>
      <section className="bw-rise overflow-hidden rounded-3xl border border-hairline bg-card">
        {recent.map((r, i) => (
          <button key={`${r.date}-${r.elapsedMs}-${i}`} onClick={() => { setOpen(r); setConfirm(false); }} className="flex w-full items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 text-left last:border-b-0 active:bg-canvas">
            <span>
              <span className="block text-[15px] font-medium tabular-nums">{km(r.distanceM)}</span>
              <span className="block text-xs text-muted">{shortDate(r.date)}{r.route.length > 1 ? " · z mapą trasy" : ""}</span>
            </span>
            <span className="text-right text-sm tabular-nums text-muted">{fmtTime(r.elapsedMs)}<span className="block text-xs">{paceOf(r)}</span></span>
          </button>
        ))}
      </section>

      {open && (
        <Sheet title={`Bieg · ${shortDate(open.date)}`} onClose={() => setOpen(null)}>
          {open.route.length > 1 ? (
            <div className="relative h-64 overflow-hidden rounded-2xl border border-hairline bg-hairline/50">
              <RunMap points={open.route} live={false} />
              <span className="absolute bottom-2 left-2 z-[500] flex items-center gap-1.5 rounded-full bg-card/85 px-2 py-0.5 text-[10px] text-muted backdrop-blur"><span className="h-1.5 w-8 rounded-full" style={{ background: "linear-gradient(90deg,#2e9e62,#f0b429,#e0554f)" }} />szybko → wolno</span>
            </div>
          ) : <p className="rounded-2xl bg-canvas p-3 text-sm text-muted">Dla tego biegu nie zapisano trasy.</p>}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["Dystans", km(open.distanceM)], ["Czas", fmtTime(open.elapsedMs)], ["Tempo", paceOf(open)]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-hairline bg-card p-3"><div className="text-[11px] text-muted">{k}</div><div className="text-base font-semibold tabular-nums">{v}</div></div>
            ))}
          </div>
          {open.splits.length > 0 && (
            <div className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-sm">
              <div className="mb-1 text-xs text-muted">Odcinki km</div>
              {open.splits.map((s, i) => <div key={i} className="flex justify-between py-0.5 tabular-nums"><span>{i + 1} km</span><span>{formatPace(s)}</span></div>)}
            </div>
          )}
          <button onClick={() => { if (!confirm) { setConfirm(true); return; } setRuns(removeRun(open)); setOpen(null); }} className="mt-5 w-full rounded-2xl py-3 text-sm text-red-ink">
            {confirm ? "Na pewno usunąć ten bieg" : "Usuń ten bieg"}
          </button>
        </Sheet>
      )}
    </>
  );
}
