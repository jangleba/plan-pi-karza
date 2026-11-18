import { useState } from "react";
import { localISO, addEvents, jumpHeightFromFlightTime, labDue, LAB_TESTS, loadHistory, series, validateLab, validateSprintSplits } from "./engine";
import type { LabTest } from "./engine";
import { PageHeader } from "./Sketch";
import { VideoMeasure, type VideoResult } from "./VideoMeasure";

const today = () => localISO();
const num = (s: string) => Number(s.replace(",", "."));
const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm outline-none";

function lastDate(keys: string[]): string | undefined {
  const ev = loadHistory().filter((e) => e.type === "lab" && keys.includes(e.key));
  return ev.map((e) => e.date).sort().pop();
}

function TestCard({ test, onSaved }: { test: LabTest; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [flight, setFlight] = useState(false);
  const [error, setError] = useState("");
  const [video, setVideo] = useState(false);
  const keys = test.key === "sprint" ? ["sprint-10", "sprint-20", "sprint-30"] : [test.key];
  const last = lastDate(keys);
  const due = labDue(last, today());
  const set = (k: string, v: string) => setVals({ ...vals, [k]: v });

  const applyVideo = (r: VideoResult) => {
    if (r.flightTime !== undefined) {
      setFlight(true);
      set("cmj", (Math.round(r.flightTime * 1000) / 1000).toString());
    } else if (r.splits) {
      const next = { ...vals };
      ["sprint-10", "sprint-20", "sprint-30"].forEach((k, i) => {
        const v = r.splits![i];
        if (v !== undefined) next[k] = (Math.round(v * 1000) / 1000).toString();
      });
      setVals(next);
    }
  };

  const save = () => {
    const out: Array<{ key: string; value: number }> = [];
    for (const k of keys) {
      const raw = vals[k];
      if (!raw) continue;
      let v = num(raw);
      if (test.key === "cmj" && flight) v = Math.round(jumpHeightFromFlightTime(v) * 10) / 10;
      const err = validateLab(k, v);
      if (!(v > 0) || err) { setError(err ?? "Podaj liczbę."); return; }
      out.push({ key: k, value: v });
    }
    if (test.key === "sprint") {
      const g = (k: string) => out.find((o) => o.key === k)?.value;
      const e = validateSprintSplits(g("sprint-10"), g("sprint-20"), g("sprint-30"));
      if (e) { setError(e); return; }
    }
    if (!out.length) { setError("Wpisz przynajmniej jeden wynik."); return; }
    addEvents(out.map((o) => ({ date: today(), type: "lab" as const, key: o.key, value: o.value })));
    setError(""); setVals({}); setOpen(false); onSaved();
  };

  const inputs: Array<[string, string]> =
    test.key === "sprint" ? [["sprint-10", "10 m (s)"], ["sprint-20", "20 m (s)"], ["sprint-30", "30 m (s)"]]
    : test.key === "cmj" ? [["cmj", flight ? "Czas lotu (s)" : "Wysokość (cm)"]]
    : [[test.key, `Wynik (${test.unit})`]];

  return (
    <section className="mb-3 rounded-2xl bg-card p-4 border border-hairline">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <div>
          <h3 className="text-sm font-semibold">{test.title}</h3>
          <p className="text-xs text-muted">{last ? `Ostatni: ${last}` : "Jeszcze nie testowany"}</p>
        </div>
        {due && <span className="rounded-full border border-hairline bg-canvas px-2.5 py-1 text-xs text-muted">Do zrobienia</span>}
      </button>
      {open && (
        <div className="mt-3">
          <ul className="mb-3 list-disc pl-4 text-sm">{test.instructions.map((t) => <li key={t}>{t}</li>)}</ul>
          {test.caveat && <p className="mb-3 rounded-xl bg-canvas p-2.5 text-xs text-muted">{test.caveat}</p>}
          {test.key === "cmj" && (
            <button onClick={() => setFlight(!flight)} className="mb-3 text-xs text-muted underline">
              {flight ? "Wpisz wysokość zamiast czasu lotu" : "Mam czas lotu – przelicz na wysokość"}
            </button>
          )}
          {(test.key === "cmj" || test.key === "sprint") && (
            <button onClick={() => setVideo(true)} className="mb-3 w-full rounded-xl border border-hairline bg-canvas py-2 text-sm font-medium text-ink">
              Zmierz z wideo
            </button>
          )}
          <div className="mb-3 flex flex-col gap-2">
            {inputs.map(([k, label]) => (
              <input key={k} className={field} inputMode="decimal" placeholder={label} value={vals[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
            ))}
          </div>
          {error && <p className="mb-3 rounded-xl bg-red-soft p-2.5 text-sm text-red-ink">{error}</p>}
          <button onClick={save} className="w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-white">Zapisz wynik</button>
        </div>
      )}
      {video && (test.key === "cmj" || test.key === "sprint") && (
        <VideoMeasure mode={test.key} onResult={applyVideo} onClose={() => setVideo(false)} />
      )}
    </section>
  );
}

export function Lab() {
  const [tick, setTick] = useState(0);
  const cmj = series(loadHistory(), "lab", "cmj").at(-1);
  void tick;
  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader
        kind="lab"
        title="Lab"
        sub={`Testuj co 4–5 tygodni, najlepiej w tygodniu rozładowania.${cmj ? ` Ostatni CMJ: ${cmj.value} cm.` : ""}`}
      />
      {LAB_TESTS.map((t) => <TestCard key={t.key} test={t} onSaved={() => setTick(tick + 1)} />)}
    </main>
  );
}
