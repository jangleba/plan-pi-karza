import { useState } from "react";
import { localISO, addEvents, jumpHeightFromFlightTime, labDue, LAB_TESTS, loadHistory, series, validateLab, validateSprintSplits } from "./engine";
import type { LabTest } from "./engine";
import { Sheet } from "./Sheet";
import { Group, LargeTitle, ListRow } from "./ui";
import { VideoMeasure, type VideoResult } from "./VideoMeasure";
import { CameraCapture, type Recording } from "./CameraCapture";

const today = () => localISO();
const num = (s: string) => Number(s.replace(",", "."));
const field = "w-full rounded-2xl border border-hairline bg-canvas px-4 py-3.5 text-base outline-none focus:border-accent";

function lastDate(keys: string[]): string | undefined {
  const ev = loadHistory().filter((e) => e.type === "lab" && keys.includes(e.key));
  return ev.map((e) => e.date).sort().pop();
}

function TestRow({ test, index, onSaved }: { test: LabTest; index: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [flight, setFlight] = useState(false);
  const [error, setError] = useState("");
  const [video, setVideo] = useState(false);
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
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

  const shortTitle = test.title.split(" – ")[0]!;
  const lastValue = (() => {
    const k = test.key === "sprint" ? "sprint-10" : test.key;
    const v = series(loadHistory(), "lab", k).at(-1)?.value;
    if (v === undefined) return null;
    return test.key === "sprint" ? `${v.toFixed(2).replace(".", ",")} s / 10 m` : `${String(v).replace(".", ",")} ${test.unit}`;
  })();

  return (
    <>
      <ListRow
        index={index}
        title={shortTitle}
        sub={last ? `Ostatnio ${last.split("-").reverse().join(".")}` : undefined}
        detail={due ? <span className="text-accent">Do zrobienia</span> : lastValue}
        onTap={() => setOpen(true)}
      />
      {open && (
        <Sheet title={test.title} onClose={() => { setOpen(false); setError(""); }}>
          <ol className="mb-4 flex flex-col gap-2 text-sm">
            {test.instructions.map((t, i) => (
              <li key={t} className="flex gap-3"><span className="text-accent tabular-nums">{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
          {test.caveat && <p className="mb-4 text-xs text-muted">{test.caveat}</p>}
          {(test.key === "cmj" || test.key === "sprint") && (
            <>
              <button onClick={() => setCamera(true)} className="mb-2 w-full rounded-2xl bg-accent py-4 text-base font-medium text-white">
                {test.key === "cmj" ? "Nagraj skok" : "Nagraj sprint"}
              </button>
              <button onClick={() => setVideo(true)} className="mb-4 w-full py-2 text-sm text-muted">Wgraj film z galerii</button>
            </>
          )}
          {test.key === "cmj" && (
            <button onClick={() => setFlight(!flight)} className="mb-3 text-xs text-muted underline">
              {flight ? "Wpisz wysokość zamiast czasu lotu" : "Mam czas lotu – przelicz na wysokość"}
            </button>
          )}
          <div className="mb-4 flex flex-col gap-2">
            {inputs.map(([k, label]) => (
              <input key={k} className={field} inputMode="decimal" placeholder={label} value={vals[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
            ))}
          </div>
          {error && <p className="mb-3 text-center text-sm text-red-ink">{error}</p>}
          <button onClick={save} className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-white">Zapisz wynik</button>
        </Sheet>
      )}
      {video && (test.key === "cmj" || test.key === "sprint") && (
        <VideoMeasure mode={test.key} onResult={applyVideo} onClose={() => setVideo(false)} />
      )}
      {camera && (test.key === "cmj" || test.key === "sprint") && (
        <CameraCapture
          orientation={test.key === "cmj" ? "portrait" : "landscape"}
          autoStopS={test.key === "cmj" ? 6 : undefined}
          onClose={() => setCamera(false)}
          onDone={(r) => { setCamera(false); setRecording(r); }}
        />
      )}
      {recording && (test.key === "cmj" || test.key === "sprint") && (
        <VideoMeasure mode={test.key} src={recording.url} srcFps={recording.fps} auto={test.key === "cmj"}
          onResult={applyVideo} onClose={() => { URL.revokeObjectURL(recording.url); setRecording(null); }} />
      )}
    </>
  );
}

export function Lab() {
  const [tick, setTick] = useState(0);
  void tick;
  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="lab" title="Lab" sub="Co 4–5 tygodni" />
      <Group>
        {LAB_TESTS.map((t, i) => <TestRow key={t.key} index={i} test={t} onSaved={() => setTick(tick + 1)} />)}
      </Group>
    </main>
  );
}
