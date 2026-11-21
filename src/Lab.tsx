import { useEffect, useMemo, useState } from "react";
import { localISO, addEvents, jumpHeightFromFlightTime, labDue, LAB_TESTS, loadHistory, METHOD_LABEL, series, validateLab, validateSprintSplits, VALIDATION_NOTE } from "./engine";
import type { HistoryEvent, LabMethod, LabTest } from "./engine";
import { Sheet } from "./Sheet";
import { LargeTitle, rise } from "./ui";
import { LabIcon } from "./lab/LabIcon";
import { useCountUp } from "./lab/useCountUp";
import { LAB_INFO, deltaText, fmtValue, labCycle, plDate, statusText, summarizeTest, type TestSummary } from "./lab/labView";
import { VideoMeasure, type VideoResult } from "./VideoMeasure";
import { JumpMeasure } from "./JumpMeasure";
import { CameraCapture, type Recording } from "./CameraCapture";

const today = () => localISO();
const num = (s: string) => Number(s.replace(",", "."));
const field = "w-full rounded-2xl border border-hairline bg-canvas px-4 py-3.5 text-base outline-none focus:border-accent";


const shortTitle = (t: LabTest) => t.title.split(" – ")[0]!;

/** Mały kafel ze statystyką w karcie testu. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card px-2 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[17px] font-semibold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

/** Kafel testu: ikona, co mierzy, status, ostatni wynik (narasta), zmiana i wykres. */
function TestCard({ test, s, index, onOpen }: { test: LabTest; s: TestSummary; index: number; onOpen: () => void }) {
  const info = LAB_INFO[test.key];
  const shown = useCountUp(s.last?.value ?? 0);
  const delta = deltaText(test.key, s);
  const unit = test.key === "sprint" ? "s / 10 m" : info.unit;
  return (
    <button onClick={onOpen} style={rise(index)} aria-label={`${shortTitle(test)}: ${s.last ? `ostatni wynik ${fmtValue(test.key, s.last.value)} ${unit}` : "brak wyników"}. ${statusText(s)}`}
      className="bw-rise group relative w-full overflow-hidden rounded-3xl border border-hairline bg-card p-4 text-left transition-transform duration-150 active:scale-[0.985]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent transition-transform duration-300 group-active:scale-90"><LabIcon test={test.key} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-tight">{shortTitle(test)}</span>
          <span className="block text-xs text-muted">{info.what}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${s.due ? "bg-accent-soft text-accent" : "text-muted"}`}>{statusText(s)}</span>
      </div>
      <div className="mt-3.5">
        <div className="min-w-0">
          {s.last ? (
            <>
              <span key={s.last.value} className="bw-pop inline-block text-[30px] font-semibold leading-none tabular-nums">{s.last.approx ? "≈ " : ""}{fmtValue(test.key, shown)}</span>
              <span className="ml-1 text-sm text-muted">{unit}</span>
              <span className="mt-1.5 block text-xs leading-snug text-muted">
                {delta ? <>{s.improved === true ? "▲ " : s.improved === false ? "▼ " : ""}{delta} od poprzedniego</> : `Wynik z ${plDate(s.last.date)}`}
              </span>
            </>
          ) : (
            <span className="block text-sm leading-snug text-muted">Brak wyników.<br />Zrób pierwszy test.</span>
          )}
        </div>
      </div>
      <span className="pointer-events-none absolute right-4 top-4 hidden text-lg text-accent" aria-hidden="true">›</span>
    </button>
  );
}

/** Karta testu (od dołu): statystyki, wykres, historia, instrukcja, pomiar z nagrania i zapis wyniku. */
function TestSheet({ test, s, events, onClose, onSaved }: { test: LabTest; s: TestSummary; events: HistoryEvent[]; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [flight, setFlight] = useState(false);
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState(0);
  const [video, setVideo] = useState(false);
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  // skąd pochodzi wpisana wartość: z analizy nagrania (oszacowanie) albo wpisana/poprawiona ręcznie
  const [method, setMethod] = useState<LabMethod>("manual_entry");
  const info = LAB_INFO[test.key];
  const keys = test.key === "sprint" ? ["sprint-10", "sprint-20", "sprint-30"] : [test.key];
  const set = (k: string, v: string) => { setVals({ ...vals, [k]: v }); setMethod("manual_entry"); }; // ręczna zmiana = wynik wpisany ręcznie
  const fail = (m: string) => { setError(m); setErrorKey((n) => n + 1); };
  const unit = test.key === "sprint" ? "s" : info.unit;
  const history = useMemo(() => events.filter((e) => e.type === "lab" && e.key === info.main).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [events, info.main]);

  const applyVideo = (r: VideoResult) => {
    setMethod("video_estimate");
    if (r.flightTime !== undefined) {
      setFlight(true);
      setVals({ ...vals, cmj: (Math.round(r.flightTime * 1000) / 1000).toString() });
    } else if (r.distanceCm !== undefined) {
      setVals({ ...vals, "broad-jump": String(r.distanceCm) });
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
      if (!(v > 0) || err) { fail(err ?? "Podaj liczbę."); return; }
      out.push({ key: k, value: v });
    }
    if (test.key === "sprint") {
      const g = (k: string) => out.find((o) => o.key === k)?.value;
      const e = validateSprintSplits(g("sprint-10"), g("sprint-20"), g("sprint-30"));
      if (e) { fail(e); return; }
    }
    if (!out.length) { fail("Wpisz przynajmniej jeden wynik."); return; }
    addEvents(out.map((o) => ({ date: today(), type: "lab" as const, key: o.key, value: o.value, method })));
    setError(""); setVals({}); setMethod("manual_entry"); onSaved(); onClose();
  };

  const inputs: Array<[string, string]> =
    test.key === "sprint" ? [["sprint-10", "10 m (s)"], ["sprint-20", "20 m (s)"], ["sprint-30", "30 m (s)"]]
    : test.key === "cmj" ? [["cmj", flight ? "Czas lotu (s)" : "Wysokość (cm)"]]
    : [[test.key, `Wynik (${test.unit})`]];
  const has = inputs.some(([k]) => (vals[k] ?? "").trim() !== "");
  const delta = deltaText(test.key, s);

  return (
    <>
      <Sheet title={test.title} onClose={onClose}>
        {s.last ? (
          <div className="bw-stagger mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Ostatni" value={`${s.last.approx ? "≈ " : ""}${fmtValue(test.key, s.last.value)}`} sub={`${unit} · ${plDate(s.last.date)}`} />
            <Stat label="Najlepszy" value={fmtValue(test.key, s.best!)} sub={unit} />
            <Stat label="Zmiana" value={delta ? `${s.improved === true ? "▲ " : s.improved === false ? "▼ " : ""}${delta.replace(` ${unit}`, "")}` : "–"} sub={delta ? unit : "brak porównania"} />
          </div>
        ) : (
          <p className="bw-rise mb-3 rounded-2xl bg-canvas px-4 py-3 text-sm text-muted">Nie ma jeszcze wyników tego testu. Po pierwszym zapisie pojawi się tu historia wyników.</p>
        )}
        <p className="bw-rise mb-4 px-1 text-xs text-muted" style={{ animationDelay: "80ms" }}>Wykresy i trendy zobaczysz w zakładce Progres.</p>
        {history.length > 0 && (
          <div className="bw-rise mb-4 overflow-hidden rounded-2xl border border-hairline bg-card" style={{ animationDelay: "140ms" }}>
            <h3 className="px-4 pb-1 pt-3 text-xs uppercase tracking-wide text-muted">Ostatnie wyniki</h3>
            {history.map((h, i) => (
              <div key={`${h.date}-${i}`} className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 text-sm first:border-t-0">
                <span className="text-muted tabular-nums">{plDate(h.date)}</span>
                <span className="font-medium tabular-nums">{h.method === "video_estimate" ? "≈ " : ""}{fmtValue(test.key, h.value)} {unit}</span>
              </div>
            ))}
          </div>
        )}

        <details open={!s.last} className="group mb-4 rounded-2xl bg-canvas px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">Jak zmierzyć<span className="text-muted transition-transform duration-200 group-open:rotate-90" aria-hidden="true">›</span></summary>
          <ol className="bw-stagger mt-3 flex flex-col gap-2 text-sm">
            {test.instructions.map((t, i) => (
              <li key={t} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent tabular-nums">{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
          {test.caveat && <p className="mt-3 text-xs text-muted">{test.caveat}</p>}
        </details>
        {test.limits && (
          <details className="mb-4 rounded-2xl bg-canvas px-4 py-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-ink">Ograniczenia pomiaru z nagrania</summary>
            <ul className="mt-2 list-disc pl-4 leading-snug">{test.limits.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="mt-2 leading-snug">{VALIDATION_NOTE}</p>
          </details>
        )}
        <button onClick={() => setCamera(true)} className="mb-2 w-full rounded-2xl bw-grad py-4 text-base font-medium">
          {test.key === "sprint" ? "Nagraj sprint" : "Nagraj skok"}
        </button>
        <button onClick={() => setVideo(true)} className="mb-4 w-full py-2 text-sm text-muted">Wgraj film z galerii</button>
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
        {has && <p className="bw-rise mb-3 text-center text-xs text-muted">Źródło wyniku: {METHOD_LABEL[method]}</p>}
        {error && <p key={errorKey} className="bw-shake mb-3 text-center text-sm text-red-ink" role="alert">{error}</p>}
        <button onClick={save} disabled={!has} className={`w-full rounded-2xl py-4 text-base font-medium transition ${has ? "bw-grad" : "bg-hairline text-muted"}`}>
          Zapisz wynik
        </button>
      </Sheet>
      {video && (test.key === "broad-jump"
        ? <JumpMeasure onResult={applyVideo} onClose={() => setVideo(false)} />
        : <VideoMeasure mode={test.key} onResult={applyVideo} onClose={() => setVideo(false)} />)}
      {camera && (
        <CameraCapture
          orientation={test.key === "cmj" ? "portrait" : "landscape"}
          autoStopS={test.key === "cmj" ? 6 : test.key === "broad-jump" ? 14 : undefined}
          guide={test.key === "broad-jump" ? "Telefon nieruchomo, 4–5 m od toru, prostopadle do skoku. Cała sylwetka i miejsce lądowania w kadrze. Stań na linii 2 s, skocz i zostań w miejscu 2 s." : undefined}
          onClose={() => setCamera(false)}
          onDone={(r) => { setCamera(false); setRecording(r); }}
        />
      )}
      {recording && (test.key === "broad-jump"
        ? <JumpMeasure src={recording.url} onResult={applyVideo} onClose={() => { URL.revokeObjectURL(recording.url); setRecording(null); }} />
        : <VideoMeasure mode={test.key} src={recording.url} srcFps={recording.fps} auto={test.key === "cmj"}
            onResult={applyVideo} onClose={() => { URL.revokeObjectURL(recording.url); setRecording(null); }} />)}
    </>
  );
}

export function Lab() {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<LabTest["key"] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const events = useMemo(() => loadHistory(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaries = useMemo(() => LAB_TESTS.map((t) => summarizeTest(events, t, today())), [events]);
  const cycle = useMemo(() => labCycle(summaries), [summaries]);
  const titleOf = (k: LabTest["key"]) => shortTitle(LAB_TESTS.find((t) => t.key === k)!);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast]);

  const noneYet = summaries.every((s) => !s.last);
  const headline = noneYet ? "Zacznij od pierwszego testu" : cycle.due.length ? `Do zrobienia: ${cycle.due.length} z ${cycle.total}` : "Wszystko aktualne";
  const detail = cycle.due.length
    ? cycle.due.slice(0, 2).map(titleOf).join(", ") + (cycle.due.length > 2 ? "…" : "")
    : cycle.next ? `Najbliższy: ${titleOf(cycle.next.key)} ${cycle.next.inDays <= 0 ? "dziś" : `za ${cycle.next.inDays} dni`}` : "";
  const openTest = open ? LAB_TESTS.find((t) => t.key === open)! : null;

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <LargeTitle kind="lab" title="Lab" sub="Co 4–5 tygodni" />

      <section className="bw-rise mb-4 rounded-3xl border border-hairline bg-card p-4" aria-label="Cykl testów">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-snug">{headline}</p>
          {detail && <p className="text-sm text-muted">{detail}</p>}
          <p className="mt-1 text-xs leading-snug text-muted">Powtarzaj testy co 4–5 tygodni, w podobnych warunkach, żeby wyniki dało się porównać.</p>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {LAB_TESTS.map((t, i) => <TestCard key={t.key} test={t} s={summaries[i]!} index={i + 1} onOpen={() => setOpen(t.key)} />)}
      </div>

      {openTest && (
        <TestSheet test={openTest} s={summaries[LAB_TESTS.indexOf(openTest)]!} events={events} onClose={() => setOpen(null)} onSaved={() => { setTick((t) => t + 1); setToast("Zapisano wynik"); }} />
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center px-5" role="status">
          <div className="bw-rise flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="bw-check" d="M3 8.5 6.5 12 13 4.5" /></svg>
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
