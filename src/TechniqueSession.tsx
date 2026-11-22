import { useMemo, useState } from "react";
import { DrillPreview } from "./drill/DrillPreview";
import { DrillFull } from "./drill/DrillFull";
import { HalfPitchView } from "./HalfPitch";
import { Sheet } from "./Sheet";
import { buildTechnicalSession, normalizeTechnicalSettings } from "./engine/technical/planner";
import { TECHNICAL_FAMILIES } from "./engine/technical/catalog";
import { FOCUS_LABEL, MODE_LABEL, POSITION_ROLES, ROLE_LABEL } from "./engine/technical/types";
import type { TechnicalExercise, TechnicalRequest, TechnicalResult, TechnicalSettings } from "./engine/technical/types";
import type { CheckIn, DayPlan, Drill, Position } from "./engine";
import { loadTechnicalResults, loadTechnicalSettings, recordTechnicalResult, saveTechnicalSettings } from "./lib/technical";

const input = "mt-1 w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const min = (s: number) => `${Math.ceil(s / 60)} min`;

export function TechniqueSession({ day, checkIn, position, age, onInvite }: { day: DayPlan; checkIn: CheckIn; position: Position; age: number; onInvite: (drill: Drill) => void }) {
  const [settings, setSettings] = useState(loadTechnicalSettings);
  const [history, setHistory] = useState(loadTechnicalResults);
  const [routes, setRoutes] = useState<Record<string, 0 | 1>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [half, setHalf] = useState<Drill | null>(null);
  const [full, setFull] = useState<Drill | null>(null);
  const [report, setReport] = useState<TechnicalExercise | null>(null);
  const [notice, setNotice] = useState("");
  const request = useMemo<TechnicalRequest>(() => ({ position, age, date: day.date, phase: day.phase, checkIn,
    light: day.session?.variant === "light", settings, history, routes }), [position, age, day.date, day.phase, day.session?.variant, checkIn, settings, history, routes]);
  const plan = useMemo(() => buildTechnicalSession(request), [request]);
  const roles = POSITION_ROLES[position];
  const saveSettings = () => {
    const next = normalizeTechnicalSettings({ ...draft, role: roles.includes(draft.role!) ? draft.role : undefined });
    setSettings(next); setRoutes({}); setEditing(false); setExpanded(null);
    setNotice(saveTechnicalSettings(next) ? "Zapisano warunki treningu." : "Ustawienia działają w tej sesji; urządzenie nie zapisało ich na później.");
  };
  const saveResult = (e: TechnicalExercise, attempts: number, successes: number, difficulty: TechnicalResult["difficulty"]): boolean => {
    const result: TechnicalResult = { v: 1, sessionId: plan.id, familyId: e.familyId, progressionKey: e.progressionKey, date: day.date, stage: e.stage,
      attempts, successes, plannedAttempts: e.dose.sets * e.dose.reps, difficulty, adapted: e.adapted };
    const ok = recordTechnicalResult(result, today());
    if (ok) { setHistory(loadTechnicalResults()); setReport(null); setNotice("Zapisano Twój wynik. Silnik uwzględni go przy kolejnych sesjach."); }
    return ok;
  };
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-medium text-accent">Technika pozycyjna</p><h3 className="mt-1 text-lg font-semibold tracking-tight">{plan.roleLabel}</h3><p className="mt-1 text-xs text-muted">Ćwiczenia: {plan.exercises.length} · ok. {min(plan.totalS)} · limit {min(plan.budgetS)} · {settings.side === "left" ? "lewa" : "prawa"} strona</p></div>
      <button onClick={() => { setDraft(settings); setEditing(true); }} className="shrink-0 rounded-full bg-canvas px-3.5 py-2.5 text-sm text-accent">Dopasuj</button>
    </div>
    {notice && <p className="text-xs text-muted" role="status">{notice}</p>}
    {plan.notes.map((n) => <p key={n} className="text-xs leading-relaxed text-muted">{n}</p>)}
    {plan.status === "ready" && <details className="rounded-2xl border border-hairline px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Przygotowanie · {min(plan.warmupS)}</summary><ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted">{plan.warmup.map((s) => <li key={s}>{s}</li>)}</ol></details>}
    {plan.exercises.map((e, i) => {
      const open = expanded === e.familyId;
      const saved = history.find((h) => h.sessionId === plan.id && h.progressionKey === e.progressionKey);
      return <section key={e.familyId} className="overflow-hidden rounded-2xl border border-hairline bg-card">
        <button onClick={() => setExpanded(open ? null : e.familyId)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-4 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent">{i + 1}</span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold leading-snug">{e.drill.title}</span><span className="mt-1 block text-xs text-muted">{FOCUS_LABEL[e.focus]} · {MODE_LABEL[e.mode]} · {min(e.dose.totalS)}</span><span className="mt-1 block text-xs text-muted">{e.dose.sets} × {e.dose.reps} powt. · {e.drill.field.width} × {e.drill.field.height} m{saved ? ` · wynik ${saved.successes}/${saved.attempts}` : ""}</span></span>
          <span className="text-muted" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        {open && <div className="space-y-3 border-t border-hairline px-4 pb-4 pt-3">
          <p className="text-sm text-ink/85">{e.drill.goal}</p>
          <div className="flex gap-2" role="group" aria-label="Wariant ćwiczenia">{e.alternatives.map((v, route) => <button key={v} aria-pressed={e.route === route} onClick={() => setRoutes((r) => ({ ...r, [e.familyId]: route as 0 | 1 }))} className={`min-w-0 flex-1 rounded-xl px-2 py-2.5 text-xs ${e.route === route ? "bg-accent-soft font-medium text-accent" : "bg-canvas text-muted"}`}>{route === 0 ? "A" : "B"} · {v}</button>)}</div>
          <DrillPreview drill={e.drill} onOpen={() => setFull(e.drill)} />
          <div className="grid grid-cols-2 gap-2"><button onClick={() => setHalf(e.drill)} className="rounded-xl bg-canvas py-2.5 text-xs font-medium text-accent">Połowa boiska</button><button onClick={() => onInvite(e.drill)} className="rounded-xl bg-canvas py-2.5 text-xs font-medium text-accent">Zaproś partnera</button></div>
          <p className="text-xs text-muted">{e.drill.dose} · przygotowanie układu {e.dose.setupS} s</p>
          <div className="rounded-xl bg-canvas p-3"><p className="text-xs font-semibold">Udana próba</p><p className="mt-1 text-sm">{e.success}</p></div>
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink/85">{e.drill.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="text-xs text-muted">Poziom warunku {e.stage + 1}/3 · {e.stageReason}</p>
          <button disabled={day.date > today()} onClick={() => setReport(e)} className="w-full rounded-xl bg-accent-soft py-3 text-sm font-medium text-accent disabled:opacity-40">{saved ? "Popraw wpisany wynik" : "Wpisz wynik po wykonaniu"}</button>
          <details className="text-xs text-muted"><summary className="cursor-pointer">Źródła i zasady ćwiczenia</summary><p className="mt-2">Układ i dawka to adaptacja BallWise. Materiały źródłowe opisują zasady i sytuacje treningowe.</p>{e.sources.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="mt-2 block underline">{s.title}</a>)}</details>
        </div>}
      </section>;
    })}
    {plan.status !== "ready" && <button onClick={() => { setDraft(settings); setEditing(true); }} className="w-full rounded-2xl bg-accent-soft py-3 text-sm font-medium text-accent">Sprawdź warunki treningu</button>}
    <details className="text-xs text-muted"><summary className="cursor-pointer">Dlaczego niektóre ćwiczenia są niedostępne?</summary><ul className="mt-2 space-y-2">{plan.exclusions.filter((e) => !e.reasons.includes("Inna pozycja / rola.")).map((e) => <li key={e.familyId}>{TECHNICAL_FAMILIES.find((f) => f.id === e.familyId)?.title}: {e.reasons.join(" ")}</li>)}</ul></details>
    {editing && <Sheet title="Dopasuj technikę" onClose={() => setEditing(false)}><div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 text-xs text-muted">Rola<select className={input} value={roles.includes(draft.role!) ? draft.role : ""} onChange={(e) => setDraft({ ...draft, role: e.target.value ? e.target.value as TechnicalSettings["role"] : undefined })}><option value="">Ogólnie dla mojej pozycji</option>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
      <label className="text-xs text-muted">Poziom techniczny<select className={input} value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as TechnicalSettings["level"] })}><option value="beginner">Podstawowy</option><option value="intermediate">Średni</option><option value="advanced">Zaawansowany</option></select></label>
      <label className="text-xs text-muted">Mocniejsza noga<select className={input} value={draft.foot} onChange={(e) => setDraft({ ...draft, foot: e.target.value as TechnicalSettings["foot"] })}><option value="unknown">Jeszcze nie wybrano</option><option value="left">Lewa</option><option value="right">Prawa</option><option value="both">Obie podobnie</option></select></label>
      <label className="text-xs text-muted">Strona układu<select className={input} value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value as TechnicalSettings["side"] })}><option value="left">Lewa</option><option value="right">Prawa</option></select></label>
      <label className="text-xs text-muted">Czas w minutach<input type="number" min="8" max="60" className={input} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} /></label>
      <label className="col-span-2 text-xs text-muted">Priorytet<select className={input} value={draft.focus ?? ""} onChange={(e) => setDraft({ ...draft, focus: e.target.value ? e.target.value as TechnicalSettings["focus"] : undefined })}><option value="">Dobierz do pozycji</option>{Object.entries(FOCUS_LABEL).map(([f, label]) => <option key={f} value={f}>{label}</option>)}</select></label>
      <label className="col-span-2 text-xs text-muted">Dostępne miejsce<select className={input} value={`${draft.space.width}x${draft.space.height}`} onChange={(e) => { const [width, height] = e.target.value.split("x").map(Number) as [number, number]; setDraft({ ...draft, space: { width, height } }); }}><option value="18x14">Mały plac · 18 × 14 m</option><option value="30x22">Fragment boiska · 30 × 22 m</option><option value="50x40">Duży fragment · 50 × 40 m</option><option value="68x52.5">Połowa boiska · 68 × 52,5 m</option></select></label>
      <label className="text-xs text-muted">Piłki<input className={input} type="number" min="0" max="20" value={draft.resources.balls} onChange={(e) => setDraft({ ...draft, resources: { ...draft.resources, balls: Number(e.target.value) } })} /></label>
      <label className="text-xs text-muted">Stożki / znaczniki<input className={input} type="number" min="0" max="40" value={draft.resources.cones} onChange={(e) => setDraft({ ...draft, resources: { ...draft.resources, cones: Number(e.target.value) } })} /></label>
      <label className="col-span-2 text-xs text-muted">Partnerzy obecni dzisiaj<select className={input} value={draft.resources.partners} onChange={(e) => setDraft({ ...draft, resources: { ...draft.resources, partners: Number(e.target.value) } })}><option value="0">Trenuję samodzielnie</option><option value="1">1 osoba</option><option value="2">2 osoby lub więcej</option></select></label>
      {(["goal", "wall", "rebounder"] as const).map((k) => <label key={k} className="col-span-2 flex items-center justify-between rounded-xl bg-canvas px-3 py-3 text-sm">{k === "goal" ? "Bramka" : k === "wall" ? "Ściana do podań" : "Rebounder"}<input type="checkbox" checked={draft.resources[k]} onChange={(e) => setDraft({ ...draft, resources: { ...draft.resources, [k]: e.target.checked } })} /></label>)}
    </div><button onClick={saveSettings} className="bw-grad mt-5 w-full rounded-2xl py-3.5 text-base font-medium">Dobierz sesję</button></Sheet>}
    {full && <DrillFull drill={full} drills={plan.exercises.map((x) => x.drill)} groupTitle="Technika z piłką" onSelect={setFull} onClose={() => setFull(null)} onHalf={() => { setHalf(full); setFull(null); }} onInvite={() => { const d = full; setFull(null); onInvite(d); }} />}
    {half && <Sheet title={half.title} onClose={() => setHalf(null)}><HalfPitchView drill={half} /></Sheet>}
    {report && <ResultForm key={`${plan.id}:${report.progressionKey}`} exercise={report} onClose={() => setReport(null)} onSave={(a, s, d) => saveResult(report, a, s, d)} />}
  </div>;
}

function ResultForm({ exercise, onClose, onSave }: { exercise: TechnicalExercise; onClose: () => void; onSave: (attempts: number, successes: number, difficulty: TechnicalResult["difficulty"]) => boolean }) {
  const [attempts, setAttempts] = useState(""), [successes, setSuccesses] = useState("");
  const [difficulty, setDifficulty] = useState<TechnicalResult["difficulty"]>("right");
  const [error, setError] = useState("");
  const max = exercise.dose.sets * exercise.dose.reps;
  const a = Number(attempts), s = Number(successes);
  const valid = attempts.trim() !== "" && successes.trim() !== "" && Number.isInteger(a) && Number.isInteger(s) && a >= 0 && a <= max && s >= 0 && s <= a;
  return <Sheet title="Jak poszło ćwiczenie?" onClose={onClose}><p className="text-sm font-medium">{exercise.drill.title}</p><p className="mt-2 text-sm text-muted">{exercise.success}</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Wykonane próby (0–{max})<input type="number" min="0" max={max} className={input} value={attempts} onChange={(e) => setAttempts(e.target.value)} /></label><label className="text-xs text-muted">Udane próby (0–{a})<input type="number" min="0" max={a} className={input} value={successes} onChange={(e) => setSuccesses(e.target.value)} /></label></div><div className="mt-4 flex gap-2">{([["easy", "Łatwo"], ["right", "W sam raz"], ["hard", "Za trudno"]] as const).map(([d, label]) => <button key={d} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={`flex-1 rounded-xl py-3 text-sm ${difficulty === d ? "bg-accent-soft text-accent" : "bg-canvas text-muted"}`}>{label}</button>)}</div><p className="mt-3 text-xs text-muted">To Twój zapis wykonania. Obejrzenie animacji ani zakończenie całej sesji nie zalicza prób.</p>{error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}<button disabled={!valid} onClick={() => { if (!onSave(a, s, difficulty)) setError("Nie udało się zapisać wyniku na urządzeniu. Sprawdź datę i dostępność pamięci."); }} className="bw-grad mt-5 w-full rounded-2xl py-3.5 text-base font-medium disabled:opacity-40">Zapisz wynik</button></Sheet>;
}
