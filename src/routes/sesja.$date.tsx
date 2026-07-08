import { createFileRoute, useRouter } from "@tanstack/react-router";
import { memo, useState, type ReactNode } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { useInstantBack, useDelayedFlag } from "@/lib/loadwise/uiHooks";

import { applyReadiness } from "@/lib/loadwise/planEngine";
import { formatDateFull } from "@/lib/loadwise/labels";
import { IntensityBadge, DayTypeTag } from "@/components/loadwise/ui";
import { ModifySheet } from "@/components/loadwise/ModifySheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type {
  SessionDay,
  TrainingSection,
  
  TrainingExercise,
} from "@/lib/loadwise/types";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import {
  ChevronLeft,
  ChevronDown,

  Clock,
  Target,
  Flag,
  CheckCircle2,
  Plus,
  Repeat,
  Undo2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";


const searchSchema = (s: Record<string, unknown>): { slot: number } => ({
  slot: Number(s.slot) === 2 ? 2 : 1,
});

export const Route = createFileRoute("/sesja/$date")({
  validateSearch: searchSchema,
  component: SessionDetail,
});




// ---------- Renderowanie strukturalne (bloki) ----------

function compactPrescription(e: TrainingExercise): string {
  const parts: string[] = [];
  const repsHasContacts = /kontakt/i.test(e.reps ?? "");
  if (e.sets && e.reps) parts.push(`${e.sets} × ${e.reps}`);
  else if (e.reps) parts.push(e.reps);
  if (e.duration) parts.push(e.duration);

  if (typeof e.groundContacts === "number" && !repsHasContacts)
    parts.push(`${e.groundContacts} kontaktów`);
  // RPE świadomie POMIJANE w planie — należy do logu po sesji.
  // W planie zostawiamy tylko konkret wykonania: %1RM, RIR, tempo, czas.
  if (e.rir) parts.push(e.rir);
  if (e.tempo) parts.push(`tempo ${e.tempo}`);
  if (e.loadTarget) {
    const load = e.loadTarget.replace(/\s*[—-]?\s*RPE[^,·]*/gi, "").trim();
    if (load) parts.push(load);
  }
  return parts.join(" · ");
}

// Skraca długą wskazówkę silnika do jednej krótkiej linijki (max ~8 słów).
function shortCue(cue: string): string {
  const first = cue.split(/(?<=[.!?])\s+/)[0].trim();
  const words = first.replace(/[.]+$/, "").split(/\s+/);
  const clipped = words.slice(0, 8).join(" ");
  return clipped + (words.length > 8 ? "…" : ".");
}

function restLabel(e: TrainingExercise): string | null {
  const r = e.restAfterPair ?? e.restAfterExercise;
  if (!r) return null;
  return /przerwa|rest/i.test(r) ? r : `Przerwa: ${r}`;
}

function exerciseDetailRows(e: TrainingExercise) {
  return [
    { label: "Jak dobrać ciężar", value: e.loadGuidance },
    { label: "Kiedy zmniejszyć", value: e.loadReduceWhen },
    { label: "Technika", value: e.technique },
    { label: "Łatwiej", value: e.regression },
    { label: "Trudniej", value: e.progression },
    { label: "Częsty błąd", value: e.commonMistake },
    { label: "Przeciwwskazania", value: e.contraindications },
    { label: "Ograniczenie meczowe", value: e.matchDayRestriction },
  ].filter((r) => r.value);
}

function ExerciseRow({
  e,
  done,
  onToggle,
  expanded,
  onExpand,
}: {
  e: TrainingExercise;
  done: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const presc = compactPrescription(e);
  const rest = restLabel(e);
  const rows = exerciseDetailRows(e);
  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Zrobione"
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border"
          }`}
        >
          {done && <CheckCircle2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={rows.length ? onExpand : undefined}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm font-medium">
              {e.label && (
                <span className="mr-1 font-bold text-primary">{e.label}</span>
              )}
              <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                {e.name}
              </span>
            </span>
            {rows.length > 0 && (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            )}
          </div>
          {presc && (
            <div className="mt-0.5 text-xs text-muted-foreground">{presc}</div>
          )}
          {rest && (
            <div className="mt-0.5 text-[11px] font-medium text-primary/80">{rest}</div>
          )}
          {e.cue && (
            <div className="mt-1 text-xs italic text-muted-foreground">💡 {shortCue(e.cue)}</div>
          )}
        </button>
      </div>
      {expanded && rows.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-8">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="text-[11px] font-semibold text-foreground">
                {r.label}
              </div>
              <p className="text-xs text-muted-foreground">{r.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const StructuredSections = memo(function StructuredSections({
  sections,
}: {
  sections: TrainingSection[];
}) {

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setDone((p) => ({ ...p, [id]: !p[id] }));
  const expand = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));
  return (
    <>
      {sections.map((sec) => (
        <div key={sec.id} className="soft-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {sec.title}
          </h3>
          <div className="mt-2 space-y-3">
            {sec.blocks.map((b) => {
              const hideHeader =
                !b.title ||
                (b.exercises.length === 1 &&
                  b.blockType === "single" &&
                  b.title === b.exercises[0].name);
              const blockRest = b.restAfterBlock
                ? /przerwa|rest|śwież|przejdź|pełna/i.test(b.restAfterBlock)
                  ? b.restAfterBlock
                  : `Przerwa po bloku: ${b.restAfterBlock}`
                : null;
              return (
                <div key={b.id}>
                  {!hideHeader && (
                    <div className="text-[13px] font-bold tracking-tight text-foreground">
                      {b.title}
                    </div>
                  )}
                  {/* safetyNotes to logika silnika — nie pokazujemy w widoku zawodnika. */}
                  <div className="mt-0.5 divide-y divide-border/50">
                    {b.exercises.map((e) => (
                      <ExerciseRow
                        key={e.id}
                        e={e}
                        done={!!done[e.id]}
                        onToggle={() => toggle(e.id)}
                        expanded={!!open[e.id]}
                        onExpand={() => expand(e.id)}
                      />
                    ))}
                  </div>
                  {blockRest && (
                    <div className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                      {blockRest}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
});

// ---------- Powłoka ekranu + skeleton (płynne ładowanie) ----------

function SessionScreenShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell min-h-screen pb-[140px]">
      <div className="px-5 pt-6">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground active:opacity-60"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>
      </div>
      <div className="space-y-3 px-5">{children}</div>
    </div>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted ${className}`} />
  );
}

function SessionSkeleton() {
  return (
    <>
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar className="h-8 w-56" />
      <div className="flex gap-2">
        <SkeletonBar className="h-6 w-20" />
        <SkeletonBar className="h-6 w-20" />
        <SkeletonBar className="h-6 w-24" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="soft-card space-y-3 p-4">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-5/6" />
          <SkeletonBar className="h-4 w-2/3" />
        </div>
      ))}
    </>
  );
}





function LogField({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={10}
        placeholder="0–10"
        className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
      />
    </div>
  );
}

function PostSessionLog() {
  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold">Log po sesji</h3>
      <div className="mt-2 divide-y divide-border">
        <LogField label="RPE (ciężkość) 0–10" />
        <LogField label="Ból 0–10" />
        <LogField label="Bolesność mięśni 0–10" />
        <LogField label="Zmęczenie 0–10" />
      </div>
      <div className="mt-3 space-y-2">
        <span className="text-sm text-muted-foreground">Sen / notatki</span>
        <Textarea placeholder="Jak spałeś? Dodatkowe uwagi…" rows={2} />
      </div>
    </div>
  );
}

function CompletionPanel({ session }: { session: SessionDay }) {
  const { state, completeSession } = useLoadwise();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const [rpe, setRpe] = useState(existing?.rpe ?? 6);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const done = existing?.completed ?? false;

  if (!session.dbId) return null;

  async function save() {
    setSaving(true);
    await completeSession(session, rpe, notes);
    setSaving(false);
  }

  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2
          className={`h-4 w-4 ${done ? "text-primary" : "text-muted-foreground"}`}
        />
        <h3 className="text-sm font-semibold">
          {done ? "Sesja oznaczona jako wykonana" : "Oznacz sesję jako wykonaną"}
        </h3>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">RPE (ciężkość) 0–10</span>
          <span className="text-muted-foreground">{rpe}/10</span>
        </div>
        <Slider
          min={0}
          max={10}
          step={1}
          value={[rpe]}
          onValueChange={(v) => setRpe(v[0])}
        />
      </div>

      <div className="mt-3 space-y-2">
        <span className="text-sm text-muted-foreground">Notatki po sesji</span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Jak poszło? Sen, ból, dodatkowe uwagi…"
          rows={2}
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving
          ? "Zapisywanie…"
          : done
            ? "Zaktualizuj wpis"
            : "Oznacz jako wykonane"}
      </button>
    </div>
  );
}

function ClubMonitoring({ session }: { session: SessionDay }) {
  const [rpe, setRpe] = useState(6);
  const load = session.durationMin * rpe;
  const steps = [
    "Zrób trening z drużyną",
    "Po treningu wpisz RPE",
    "Zaznacz ból lub zmęczenie",
    "Zapisz krótki komentarz",
  ];
  return (
    <>
      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Trening klubowy</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          To główne obciążenie dnia.
        </p>
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Wpisz RPE po treningu</h3>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">RPE (ciężkość) 0–10</span>
            <span className="text-muted-foreground">{rpe}/10</span>
          </div>
          <Slider
            min={0}
            max={10}
            step={1}
            value={[rpe]}
            onValueChange={(v) => setRpe(v[0])}
          />
        </div>
        <div className="mt-3 divide-y divide-border">
          <LogField label="Ból 0–10" />
          <LogField label="Zmęczenie nóg 0–10" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="text-sm text-muted-foreground">Sen / notatki</span>
          <Textarea placeholder="Minuty na boisku, sen, uwagi…" rows={2} />
        </div>
        <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          Obciążenie ={" "}
          <span className="font-semibold">
            {session.durationMin} min × {rpe} RPE = {load}
          </span>
        </div>
      </div>
    </>
  );
}


// Krótki komunikat decyzji — max 1 zdanie, tylko jeśli naprawdę potrzebne.
function shortDecisionNote(session: SessionDay): string | null {
  if (session.dayType === "club") return "Klub = główne obciążenie.";
  if (session.dayType === "match") return "Dziś mecz — bez dodatkowego treningu.";
  if (session.mdLabel === "MD-1") return "MD-1 = tylko aktywacja, bez ciężkich nóg.";
  if (session.dayType === "recovery") return "Regeneracja — bez intensywności.";
  if (session.intensity === "wysoka") return "Mocny dzień — rozgrzej się solidnie.";
  return null;
}

// Logika decyzji — schowana w accordionie, domyślnie zamknięta.
function DecisionLogic({ session }: { session: SessionDay }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Cel sesji", value: session.goalOfSession },
    { label: "Dlaczego dziś", value: session.whyToday },
    { label: "Zarządzane ryzyko", value: session.riskManaged },
    { label: "Czego unikać", value: session.avoidToday },
    { label: "Bezpieczeństwo", value: session.safetyNote },
  ].filter((r) => r.value);

  if (!rows.length) return null;

  return (
    <Accordion type="single" collapsible className="soft-card px-4">
      <AccordionItem value="logic" className="border-0">
        <AccordionTrigger className="py-3 text-sm font-medium text-muted-foreground hover:no-underline">
          Logika decyzji
        </AccordionTrigger>
        <AccordionContent className="space-y-2 pb-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="text-xs font-semibold text-foreground">
                {r.label}
              </div>
              <p className="text-xs text-muted-foreground">{r.value}</p>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SessionDetail() {
  const { date } = Route.useParams();
  const { slot } = Route.useSearch();
  const router = useRouter();
  const { state, hydrated, todayIso, undoModification } = useLoadwise();
  const [modifyOpen, setModifyOpen] = useState(false);
  const goBack = useInstantBack("/plan");

  const day = state.plan.find((p) => p.date === date);

  // Dane jeszcze się ładują (np. po odświeżeniu / deep link) — nie pokazuj
  // pustego białego ekranu. Skeleton w tym samym layoucie, z krótkim delay.
  const stillLoading = !hydrated || (!day && !state.profile);
  const showSkeleton = useDelayedFlag(stillLoading);

  if (stillLoading) {
    return <SessionScreenShell onBack={goBack}>{showSkeleton ? <SessionSkeleton /> : null}</SessionScreenShell>;
  }

  if (!day || !state.profile) {
    // Dane dotarły, ale sesji nie ma — czytelny stan błędu zamiast wiszącego loadera.
    return (
      <SessionScreenShell onBack={goBack}>
        <div className="soft-card p-5 text-center">
          <p className="text-sm font-medium text-foreground">
            Nie znaleziono tej sesji.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mogła zostać zmieniona w planie. Wróć do planu tygodnia.
          </p>
          <Button className="mt-4" onClick={goBack}>
            Wróć do planu
          </Button>
        </div>
      </SessionScreenShell>
    );
  }


  const isToday = date === todayIso;
  const mods = state.modifications[date] ?? [];
  const swapMod = mods.find((m) => m.type === "swap");
  const addMods = mods.filter((m) => m.type === "add");

  // Sesja główna: zamieniona (jeśli jest) lub zaplanowana z gotowością.
  let primary: SessionDay = day;
  if (swapMod) {
    primary = swapMod.session;
  } else if (isToday) {
    primary = applyReadiness(day, state.readiness[todayIso], state.profile)
      .session;
  }


  let session: SessionDay = primary;
  if (slot === 2) {
    if (!primary.secondSession) {
      return (
        <SessionScreenShell onBack={goBack}>
          <p className="text-sm text-muted-foreground">
            Druga sesja nie jest dziś dostępna (zbyt niska gotowość, ból lub
            bliskość meczu).
          </p>
        </SessionScreenShell>
      );

    }
    session = primary.secondSession;
  }

  const isClub = session.dayType === "club";
  const shortNote = shortDecisionNote(session);

  const hasFlatSectionContent =
    session.sections.warmup.length +
      session.sections.main.length +
      session.sections.accessory.length +
      session.sections.footballTransfer.length +
      session.sections.cooldown.length >
    0;

  const fallbackExercises = hasFlatSectionContent
    ? []
    : session.exercises ?? [];

  // Strukturalne sekcje: wygenerowane bloki, inaczej fallback z płaskich danych.
  const structured: TrainingSection[] =
    session.structuredSections && session.structuredSections.length
      ? session.structuredSections
      : hasFlatSectionContent
        ? flatToStructured(session.sections)
        : fallbackExercises.length
          ? flatToStructured({
              warmup: [],
              main: fallbackExercises,
              accessory: [],
              footballTransfer: [],
              cooldown: [],
            })
          : [];

  return (
    <div className="app-shell min-h-screen pb-[140px]">
      <div className="px-5 pt-6">
        <button
          onClick={goBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground active:opacity-60"
        >

          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formatDateFull(session.date)}
          {session.mdLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium">
              <Flag className="h-3 w-3" /> {session.mdLabel}
            </span>
          )}
          {isToday && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              Dziś
            </span>
          )}
        </div>

        {session.slotLabel && (
          <div className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {session.slotLabel}
          </div>
        )}

        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          {session.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DayTypeTag type={session.dayType} />
          <IntensityBadge intensity={session.intensity} />
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5" /> {session.sessionType}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {session.durationMin} min
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3 px-5">
        {/* Sesje dnia — przełącznik gdy są dwie */}
        {primary.secondSession && (
          <div className="sticky top-2 z-10 flex gap-1 rounded-full border border-border bg-background/90 p-1 backdrop-blur">
            <button
              onClick={() =>
                router.navigate({
                  to: "/sesja/$date",
                  params: { date },
                  search: { slot: 1 },
                })
              }
              className={`flex-1 truncate rounded-full px-3 py-1.5 text-xs font-semibold ${
                slot === 1
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              1. {primary.title}
            </button>
            <button
              onClick={() =>
                router.navigate({
                  to: "/sesja/$date",
                  params: { date },
                  search: { slot: 2 },
                })
              }
              className={`flex-1 truncate rounded-full px-3 py-1.5 text-xs font-semibold ${
                slot === 2
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              2. {primary.secondSession.title}
            </button>
          </div>
        )}


        {/* Krótki komunikat decyzji — max 1 zdanie */}
        {shortNote && (
          <div className="soft-card bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
            {shortNote}
          </div>
        )}

        {isClub ? (
          <>
            <ClubMonitoring session={session} />
            {structured.length > 0 && <StructuredSections sections={structured} />}
          </>
        ) : (
          <>
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Do wykonania
            </div>
            <StructuredSections sections={structured} />
            <PostSessionLog />
          </>
        )}

        <CompletionPanel session={session} />

        {/* Status zmiany + cofnij */}
        {swapMod && slot === 1 && (
          <div className="soft-card flex items-center justify-between p-3 text-xs">
            <span className="text-muted-foreground">
              Sesja zamieniona. {swapMod.reason}
            </span>
            <button
              type="button"
              onClick={() => undoModification(date, swapMod.id)}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <Undo2 className="h-3.5 w-3.5" /> Cofnij
            </button>
          </div>
        )}

        {/* Sesje dodane przez zawodnika */}
        {addMods.map((m) => (
          <div key={m.id} className="soft-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-primary">
                  Dodana sesja
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {m.session.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.session.durationMin} min · {m.session.intensity}
                </div>
              </div>
              <button
                type="button"
                onClick={() => undoModification(date, m.id)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Undo2 className="h-3.5 w-3.5" /> Cofnij
              </button>
            </div>
            <StructuredSections sections={flatToStructured(m.session.sections)} />

          </div>
        ))}

        {/* Dodaj / zamień sesję */}
        {!isClub && session.dayType !== "match" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setModifyOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Dodaj trening
            </Button>
            <Button variant="outline" onClick={() => setModifyOpen(true)}>
              <Repeat className="mr-1 h-4 w-4" /> Zamień sesję
            </Button>
          </div>
        )}

        {/* Logika decyzji — schowana, domyślnie zamknięta */}
        <DecisionLogic session={session} />
      </div>

      <ModifySheet open={modifyOpen} onOpenChange={setModifyOpen} date={date} />
    </div>
  );

}
