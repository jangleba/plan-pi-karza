import { useState } from "react";
import { DrillPreview } from "./drill/DrillPreview";
import { TechniqueSession } from "./TechniqueSession";
import { DrillFull } from "./drill/DrillFull";
import { HalfPitchView } from "./HalfPitch";
import { InviteComposer } from "./InviteSheets";
import { Sheet } from "./Sheet";
import { pushWeightLog } from "./lib/sync";
import { MasCard, loadMas, saveMasDistance } from "./MasCard";
import { RunTracker } from "./RunTracker";
import { SessionBlocks } from "./SessionBlocks";
import { ExerciseSheet } from "./exercises/ExerciseSheet";
import { DrawTool } from "./tools/Draw";
import { StimuliTool } from "./tools/Stimuli";
import { Group, ListRow } from "./ui";
import { CueTrainer } from "./CueTrainer";
import { WorkoutMode } from "./workout/WorkoutMode";
import { completeWithoutRun, loadRun, openRun } from "./workout/store";
import { totals, type WorkoutRun } from "./workout/run";
import { EXERCISES, RECOVERY, RECOVERY_LIGHT, applyChoice, bodyweightTemplate, drillsFor, DRILL_GROUPS, adaptSession, addEvents, restSuggested, estimate1RM, firstNumber, loadLog, saveLog, strainOf, suggestNext, masTestSession, mesoPhase, runSession, templateFor } from "./engine";
import type { CheckIn, Drill, DrillGroup, Choice, Completion, DayPlan, HistoryEvent, Level, Mas, Position, Suggestion } from "./engine";

interface ConfirmRow { exerciseId: string; kg: number; planned: string; plannedReps: number }

const KIND_TITLE: Record<string, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint",
  technique: "Technika z piłką", activation: "Aktywacja", recovery: "Regeneracja",
};

export function SessionSheet({
  day, checkIn, checkedIn, weekInCycle, level, position, hasGym, inviterName, age, onSkipDay, onClose,
}: { day: DayPlan; checkIn: CheckIn; checkedIn: boolean; weekInCycle: number; level: Level; position?: Position; hasGym: boolean; inviterName?: string; age?: number; onSkipDay?: () => void; onClose: () => void }) {
  const [mas, setMas] = useState<Mas | null>(loadMas);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState(loadLog);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Suggestion[] | null>(null);
  // krok pośredni: zawodnik sam potwierdza, jak poszło (samo „koniec sesji” i wpisane kg nie są potwierdzeniem wykonania)
  const [confirm, setConfirm] = useState<ConfirmRow[] | null>(null);
  const [report, setReport] = useState<Record<string, Completion>>({});
  // bardzo słaby dzień: proponujemy regenerację zamiast sesji indywidualnej (mecze i klub zostają bez zmian); decyduje zawodnik
  const [restChoice, setRestChoice] = useState<"ask" | "rest" | "train">("ask");
  const planned = day.session;
  const suggestRest = !!planned && planned.kind !== "recovery" && restSuggested(checkIn);
  const swapped = suggestRest && restChoice === "rest";
  const s = swapped ? { ...planned!, kind: "recovery" as const } : planned;
  const rec = swapped ? RECOVERY_LIGHT : RECOVERY;
  /** Zapis sesji: regeneracja z check-inu liczy się do zaplanowanego rodzaju (regularność), z oznaczeniem. */
  const sessionEvent = (): HistoryEvent[] => (s ? [swapped ? { date: day.date, type: "session", key: planned!.kind, value: 1, viaRest: true } : { date: day.date, type: "session", key: s.kind, value: 1 }] : []);
  const [info, setInfo] = useState<{ id: string; note?: string } | null>(null);
  const [tool, setTool] = useState<"stim" | "draw" | null>(null);
  const [halfDrill, setHalfDrill] = useState<Drill | null>(null);
  const [fullDrill, setFullDrill] = useState<Drill | null>(null);
  const [inviteDrill, setInviteDrill] = useState<Drill | null>(null);
  const [group, setGroup] = useState<DrillGroup | null>(null);
  const myDrills = drillsFor(position);
  const myGroup = group && myDrills.some((d) => d.group === group) ? group : (DRILL_GROUPS.find(([g]) => myDrills.some((d) => d.group === g))?.[0] ?? "dribble");
  const both = !!s && day.isClub;
  const [view, setView] = useState<"own" | "club">(s ? "own" : "club");
  const module = s?.kind === "strength" || s?.kind === "sprint" ? s.kind : null;
  const found = module
    ? module === "strength" && !hasGym
      ? { template: bodyweightTemplate(level, mesoPhase(weekInCycle)), deload: mesoPhase(weekInCycle) === "deload" }
      : (() => {
          const t = templateFor(module, weekInCycle, position);
          // lekki sprint (dzień przed meczem, przerwa w sezonie) = mniej serii
          return t && s?.variant === "light" ? { ...t, deload: true } : t;
        })()
    : null;
  const run = s?.kind === "run" ? (mas ? runSession(mas, s?.variant === "light" ? "deload" : mesoPhase(weekInCycle), level, checkIn, position) : masTestSession()) : null;
  const adapted = found ? adaptSession(found.template, checkIn, found.deload) : null;

  /** Ćwiczenia z wpisanym ciężarem: to, co zawodnik ZGŁOSIŁ (plan sesji jest osobno). */
  const reported = (): ConfirmRow[] => {
    const rows: ConfirmRow[] = [];
    adapted?.blocks.forEach((b, bi) => b.items.forEach((i, ii) => {
      const kg = Number((weights[`${bi}-${ii}`] ?? "").replace(",", "."));
      if (!(kg > 0) || !EXERCISES[i.exerciseId]?.loaded) return;
      rows.push({ exerciseId: i.exerciseId, kg, planned: `${i.sets} × ${i.reps}`, plannedReps: firstNumber(i.reps) });
    }));
    return rows;
  };

  /** Lista do trybu treningowego: ćwiczenia z serii (siła/sprint), odcinki biegu albo cała sesja jako jedna pozycja. */
  const workoutItems = (): Array<{ key: string; label: string; setsTotal: number }> => {
    if (adapted) return adapted.blocks.flatMap((b, bi) => b.items.map((i, ii) => ({ key: `${bi}-${ii}`, label: `${EXERCISES[i.exerciseId]?.name ?? i.exerciseId} · ${i.reps}`, setsTotal: Math.max(1, i.sets) })));
    if (run) return run.blocks.map((b, bi) => ({ key: `r${bi}`, label: `${b.label} · ${b.paceText}`, setsTotal: Math.max(1, b.reps * Math.max(1, b.sets)) }));
    return [{ key: "main", label: s ? KIND_TITLE[s.kind] ?? "Sesja" : "Sesja", setsTotal: 1 }];
  };
  const [workout, setWorkout] = useState<WorkoutRun | null>(null);
  const saved = loadRun();
  const resumeRun = s && saved && saved.status === "active" && saved.date === day.date && saved.sessionKey === s.kind ? saved : null;
  const startWorkout = () => { if (s) setWorkout(openRun({ day: day.date, sessionKey: s.kind, title: KIND_TITLE[s.kind] ?? "Trening", items: workoutItems() })); };

  const finish = () => {
    if (s) completeWithoutRun(day.date, s.kind, KIND_TITLE[s.kind] ?? "Trening"); // wpis wykonania do synchronizacji (ten sam identyfikator dnia)
    if (!adapted || !found) { addEvents(sessionEvent()); onClose(); return; }
    const rows = reported();
    if (rows.length === 0) { save(rows); return; }
    setConfirm(rows);
  };

  /** Zapis sesji. Wartość 1RM i propozycje zwiększenia powstają wyłącznie z POTWIERDZONEGO wykonania (`report`). */
  const save = (rows: ConfirmRow[]) => {
    const events: HistoryEvent[] = sessionEvent();
    if (!adapted || !found) { addEvents(events); onClose(); return; }
    const strain = strainOf(checkIn);
    const next = { ...log };
    const out: Suggestion[] = [];
    for (const r of rows) {
      const completion = report[r.exerciseId];
      next[r.exerciseId] = { kg: r.kg, reps: r.plannedReps, date: day.date, ...(completion ? { completion } : {}) };
      if (completion === "all") events.push({ date: day.date, type: "strength", key: r.exerciseId, value: Math.round(estimate1RM(r.kg, r.plannedReps) * 10) / 10 });
      const sug = suggestNext(r.exerciseId, r.kg, strain, found.deload, completion);
      if (sug) out.push(sug);
    }
    addEvents(events);
    setLog(next);
    saveLog(next);
    void pushWeightLog(next);
    setConfirm(null);
    if (out.length) setSummary(out); else onClose();
  };

  const decide = (sug: Suggestion, choice: Choice) => {
    const next = { ...log };
    const cur = next[sug.exerciseId];
    if (cur) next[sug.exerciseId] = applyChoice(cur, sug, choice);
    setLog(next);
    saveLog(next);
    void pushWeightLog(next);
    setSummary((summary ?? []).filter((x) => x !== sug));
    if ((summary ?? []).length <= 1) onClose();
  };

  if (confirm) {
    const OPTIONS: Array<[Completion, string]> = [["all", "Wszystkie powtórzenia, dobra technika"], ["partial", "Nie wszystkie powtórzenia"], ["stopped", "Przerwałem(-am): zmęczenie lub dyskomfort"]];
    return (
      <Sheet title="Jak poszło?" onClose={onClose}>
        <p className="mb-1 text-sm text-muted">Zaznacz, co faktycznie zrobiłeś(-aś). Propozycję zwiększenia ciężaru pokażemy tylko, gdy potwierdzisz wszystkie powtórzenia z dobrą techniką.</p>
        <p className="mb-4 text-xs text-muted">Ból, zawroty głowy lub osłabienie: przerwij ćwiczenie. Jeśli objawy nie mijają, skonsultuj się z lekarzem.</p>
        {confirm.map((r) => (
          <div key={r.exerciseId} className="mb-3 rounded-2xl bg-canvas p-3">
            <div className="text-sm font-medium">{EXERCISES[r.exerciseId]?.name}</div>
            <div className="text-xs text-muted">Plan: {r.planned} · wpisano: {r.kg} kg</div>
            <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={`Wykonanie: ${EXERCISES[r.exerciseId]?.name}`}>
              {OPTIONS.map(([c, t]) => (
                <button key={c} role="radio" aria-checked={report[r.exerciseId] === c} onClick={() => setReport({ ...report, [r.exerciseId]: c })}
                  className={`rounded-xl px-3 py-2 text-left text-sm ${report[r.exerciseId] === c ? "bw-sel font-medium" : "bg-card text-ink"}`}>{t}</button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => save(confirm)} className="mt-2 w-full rounded-2xl bw-grad py-4 text-base font-medium">Zapisz</button>
        <p className="mt-2 text-center text-xs text-muted">Bez zaznaczenia ciężar zostaje bez zmian i nie liczymy z niego siły maksymalnej.</p>
      </Sheet>
    );
  }

  if (summary) {
    return (
      <Sheet title="Dobra robota" onClose={onClose}>
          <p className="mb-4 text-sm text-muted">Propozycje na następną sesję – to ostrożne podpowiedzi, wybór należy do Ciebie.</p>
          {summary.map((sug) => (
            <div key={sug.exerciseId} className="mb-3 rounded-2xl bg-canvas p-3">
              <div className="text-sm font-medium">{EXERCISES[sug.exerciseId]?.name}</div>
              <div className="text-xs text-muted">{sug.from} kg · {sug.text}</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {sug.options.includes("raise") && <button onClick={() => decide(sug, "raise")} className="rounded-xl bw-grad py-2 text-sm font-medium">Zwiększam do {sug.to} kg</button>}
                <button onClick={() => decide(sug, "stay")} className="rounded-xl bg-card py-2 text-sm">Zostaję przy {sug.from} kg</button>
                {sug.lowerTo && <button onClick={() => decide(sug, "lower")} className="rounded-xl bg-card py-2 text-sm">Obniżam do {sug.lowerTo} kg</button>}
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => decide(sug, "swap")} className="rounded-xl bg-card py-2 text-sm text-muted">Zmienię ćwiczenie</button>
                  <button onClick={() => decide(sug, "skip")} className="rounded-xl bg-card py-2 text-sm text-muted">Pomijam</button>
                </div>
              </div>
            </div>
          ))}
      </Sheet>
    );
  }


  const club = view === "club" || !s;
  return (
    <>
    <Sheet title={club ? "Trening klubowy" : KIND_TITLE[s.kind]} onClose={onClose}>
        {both && <DayTabs own={KIND_TITLE[s!.kind]!} view={view} onView={setView} />}
        {!club && suggestRest && restChoice === "ask" && (
          <div className="bw-rise mt-3 rounded-2xl border border-hairline bg-canvas p-4" role="region" aria-label="Propozycja regeneracji">
            <p className="text-[15px] font-semibold leading-snug">Dziś proponujemy regenerację</p>
            <p className="mt-1 text-sm text-muted">Słaba regeneracja i gorsze samopoczucie. Ty decydujesz.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setRestChoice("rest")} className="flex-1 rounded-xl bw-grad py-3 text-sm font-medium">Regeneracja</button>
              <button onClick={() => setRestChoice("train")} className="flex-1 rounded-xl bg-card py-3 text-sm">Lżejsza sesja</button>
            </div>
          </div>
        )}
        {!club && suggestRest && restChoice === "rest" && (
          <p className="mt-3 text-sm text-muted">Zamieniono na regenerację. <button onClick={() => setRestChoice("train")} className="underline">Wróć do sesji</button></p>
        )}
        {!club && !checkedIn && (s?.kind === "strength" || s?.kind === "sprint" || s?.kind === "run") && (
          <p className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">Zrób check-in na Starcie, a dopasujemy trening.</p>
        )}
        {club ? (
          <div className="min-h-[34vh]">
            <p className="mt-3 text-[15px] leading-snug">Ten trening prowadzi trener klubu.</p>
            <p className="mt-2 text-sm text-muted">Planuję najwyżej dwa treningi dziennie: klubowy i jeden indywidualny.</p>
            {!s && <button onClick={onClose} className="mt-6 w-full rounded-2xl bw-grad py-4 text-base font-medium">OK</button>}
          </div>
        ) : adapted ? (
          <>
            <p className="text-sm text-muted">
              {adapted.name}{found?.deload ? " · rozładowanie" : ""}
            </p>
            {adapted.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">{n}</p>
            ))}
            <SessionBlocks blocks={adapted.blocks} mode={module === "sprint" ? "sequence" : "alternate"} log={log} weights={weights} onWeight={(k, v) => setWeights({ ...weights, [k]: v })} onOpen={(id, note) => setInfo({ id, note })} />
          </>
        ) : run ? (
          <>
            <p className="text-sm text-muted">{run.title}</p>
            <MasCard mas={mas} onChange={setMas} />
            <button onClick={() => setRunning(true)} className="mt-3 w-full rounded-2xl bw-grad py-3 text-sm font-medium">
              {run.isTest ? "Rozpocznij test z GPS" : "Rozpocznij bieg z GPS"}
            </button>
            {running && (
              <RunTracker
                session={run}
                onClose={() => setRunning(false)}
                onFinish={(r) => {
                  if (run.isTest && r.distanceAt5min) setMas(saveMasDistance(Math.round(r.distanceAt5min)));
                  setRunning(false);
                }}
              />
            )}
            {run.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">{n}</p>
            ))}
            <div className="mt-4 rounded-2xl bg-canvas p-3 text-sm">
              <div className="text-xs text-muted">Rozgrzewka</div>
              <div>{run.warmup}</div>
            </div>
            {run.blocks.map((b) => (
              <div key={b.label} className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
                <div className="font-medium">{b.label}</div>
                <div className="text-xs text-muted">
                  {b.reps > 1 ? `${b.sets > 1 ? `${b.sets} serie × ` : ""}${b.reps} powt. · praca ${b.workS} s, przerwa ${b.restS} s` : `${Math.round(b.workS / 60)} min`}
                  {" · "}tempo {b.paceText} · ok. {b.distanceM} m {b.reps > 1 ? "na odcinek" : ""}
                </div>
              </div>
            ))}
          </>
        ) : s?.kind === "technique" ? (
          <>
            {position && age ? <TechniqueSession day={day} checkIn={checkIn} position={position} age={age} onInvite={setInviteDrill} /> : <p className="text-sm text-muted">Uzupełnij pozycję i wiek w profilu, aby dobrać technikę.</p>}
            <details className="mt-5"><summary className="cursor-pointer text-sm text-muted">Dodatkowe narzędzia i szkice ćwiczeń</summary>
            <Group label="Narzędzia">
              <ListRow index={0} title="Bodźce" sub="Strzałki, kolory, liczby – reakcja i decyzja, poziomo" onTap={() => setTool("stim")} />
              <ListRow index={1} title="Losowanie" sub="Kolor, numer, strona lub kierunek jednym dotknięciem" onTap={() => setTool("draw")} />
            </Group>
            <p className="text-sm text-muted">Szkice do przeglądu trenera</p>
            <div className="mt-4 flex flex-col gap-5">
              <div className="-mb-2 flex flex-wrap gap-2">
                {DRILL_GROUPS.filter(([g]) => myDrills.some((d) => d.group === g)).map(([g, t]) => (
                  <button key={g} onClick={() => setGroup(g)} className={`rounded-full border px-3.5 py-2 text-sm ${(myGroup === g) ? "bw-sel font-medium" : "border-hairline bg-canvas"}`}>{t}</button>
                ))}
              </div>
              {myDrills.filter((d) => d.group === myGroup).map((d) => (
                <div key={d.id}>
                  <div className="mb-2 text-sm font-medium">{d.title}</div>
                  <DrillPreview drill={d} onOpen={() => setFullDrill(d)} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => setHalfDrill(d)} className="rounded-xl bg-canvas py-2.5 text-sm font-medium text-accent active:scale-[0.98]">Na połowie boiska</button>
                    <button onClick={() => setInviteDrill(d)} className="rounded-xl bg-canvas py-2.5 text-sm font-medium text-accent active:scale-[0.98]">Zaproś partnera</button>
                  </div>
                  <p className="mt-2 text-xs text-muted">{d.dose}</p>
                  <ul className="mt-1 list-disc pl-4 text-sm">
                    {d.points.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              ))}
              <CueTrainer />
            </div>
            </details>
          </>
        ) : s?.kind === "recovery" ? (
          <>
            <p className="text-sm text-muted">{rec.title} · ok. {rec.minutes} min</p>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Najważniejsze</h3>
            <ul className="list-disc pl-4 text-sm">{rec.foundation.map((x) => <li key={x}>{x}</li>)}</ul>
            {rec.optional.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">Opcjonalnie</h3>
                <ul className="list-disc pl-4 text-sm text-muted">{rec.optional.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Szablon tej sesji jest w przygotowaniu.
          </p>
        )}
        {!club && s && (
          <button onClick={startWorkout} className="mt-6 h-14 w-full rounded-2xl bg-ink text-base font-semibold text-card">
            {resumeRun ? `Wznów trening (${totals(resumeRun).done}/${totals(resumeRun).total})` : "Rozpocznij trening"}
          </button>
        )}
        {!club && (
          <button
            onClick={finish}
            className="mt-2 w-full rounded-2xl bw-grad py-4 text-base font-medium"
          >
            Koniec sesji
          </button>
        )}
        {s && onSkipDay && s.kind !== "recovery" && s.kind !== "activation" && (
          <button onClick={onSkipDay} className="mt-2 w-full rounded-2xl bg-canvas py-3.5 text-sm font-medium text-ink">
            Nie mogę tego dnia
          </button>
        )}
    </Sheet>
    {workout && <WorkoutMode initial={workout} onMinimize={() => setWorkout(null)} onFinished={() => { setWorkout(null); finish(); }} />}
    {info && <ExerciseSheet id={info.id} note={info.note} onClose={() => setInfo(null)} />}
    {tool === "stim" && <StimuliTool onClose={() => setTool(null)} />}
    {tool === "draw" && <DrawTool onClose={() => setTool(null)} />}
    {halfDrill && (
      <Sheet title={halfDrill.title} onClose={() => setHalfDrill(null)}>
        <HalfPitchView drill={halfDrill} />
        <p className="mt-4 text-sm font-medium">Cel</p>
        <p className="text-sm text-ink/85">{halfDrill.goal}</p>
        <p className="mt-3 text-xs text-muted">{halfDrill.dose}</p>
        <ul className="mt-1 list-disc pl-4 text-sm">{halfDrill.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <button onClick={() => { const d = halfDrill; setHalfDrill(null); setInviteDrill(d); }} className="bw-grad mt-5 w-full rounded-2xl py-3.5 text-base font-medium">Zaproś partnera do tego ćwiczenia</button>
      </Sheet>
    )}
    {fullDrill && <DrillFull drill={fullDrill} drills={myDrills.filter((d) => d.group === fullDrill.group)} groupTitle={DRILL_GROUPS.find(([g]) => g === fullDrill.group)?.[1]} onSelect={setFullDrill} onClose={() => setFullDrill(null)} onHalf={() => { setHalfDrill(fullDrill); setFullDrill(null); }} onInvite={() => { setInviteDrill(fullDrill); setFullDrill(null); }} />}
    {inviteDrill && <InviteComposer drill={inviteDrill} name={inviterName} age={age} onClose={() => setInviteDrill(null)} />}
    </>
  );
}

/** Przełącznik dnia z dwoma treningami: indywidualny / klubowy. */
function DayTabs({ own, view, onView }: { own: string; view: "own" | "club"; onView: (v: "own" | "club") => void }) {
  const cls = (on: boolean) => `rounded-xl py-1.5 text-sm ${on ? "bg-card font-medium shadow-sm" : "text-muted"}`;
  return (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
      <button onClick={() => onView("own")} className={cls(view === "own")}>{own}</button>
      <button onClick={() => onView("club")} className={cls(view === "club")}>Klub</button>
    </div>
  );
}
