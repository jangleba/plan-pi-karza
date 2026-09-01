import { createFileRoute, useRouter } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { applyExerciseReplacements, useLoadwise } from "@/lib/loadwise/store";
import { useInstantBack, useDelayedFlag } from "@/lib/loadwise/uiHooks";

import { resolveEffectiveDay } from "@/lib/loadwise/dailyCheckin";
import { repairRuntimeSpeedDay } from "@/lib/loadwise/runtimeSpeedRepair";
import { formatDateFull } from "@/lib/loadwise/labels";
import { IntensityBadge, DayTypeTag } from "@/components/loadwise/ui";
import { ModifySheet } from "@/components/loadwise/ModifySheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type { SessionDay, TrainingSection, TrainingExercise } from "@/lib/loadwise/types";
import {
  getExerciseDefinition,
  getAllEquipmentDefinitions,
  resolveExerciseByName,
  specialistEquipmentForExercise,
} from "@/lib/loadwise/exerciseLibrary";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  Flag,
  Plus,
  Repeat,
  Undo2,
} from "lucide-react";
import { MovementBlueprint } from "@/components/loadwise/MovementBlueprint";
import { ExerciseRunnerScreen } from "@/components/loadwise/ExerciseRunnerScreen";
import { plannedSets } from "@/lib/loadwise/setLogs";
import {
  ExerciseDetailSheet,
  resolveExerciseSheetViewModel,
} from "@/components/loadwise/ExerciseDetailSheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const EQUIPMENT_DEFINITIONS = getAllEquipmentDefinitions();

const searchSchema = (s: Record<string, unknown>): { slot: number } => ({
  slot: Number(s.slot) === 2 ? 2 : 1,
});

export const Route = createFileRoute("/sesja/$date")({
  validateSearch: searchSchema,
  component: SessionDetail,
});

// ---------- Renderowanie strukturalne (bloki) ----------

// Główna dawka: serie × powtórzenia / czas — jedna zwięzła linia.
function primaryDose(e: TrainingExercise): string {
  if (e.sets && e.reps) return `${e.sets} × ${e.reps}`;
  if (e.reps) return e.reps;
  if (e.duration) return e.duration;
  if (e.sets) return `${e.sets} serie`;
  return "";
}

function stripRpe(text: string): string {
  return text.replace(/\s*[—·-]?\s*RPE[^,·—]*/gi, "").trim();
}

// Jeden dodatkowy parametr wg hierarchii typu ćwiczenia. Nigdy RPE.
function primaryQualifier(e: TrainingExercise): string | null {
  const load = e.loadTarget ? stripRpe(e.loadTarget) : "";
  if (load && /%|1rm/i.test(load)) return load; // główny lift → %1RM
  const repsHasContacts = /kontakt|odbi/i.test(e.reps ?? "");
  if (typeof e.groundContacts === "number" && !repsHasContacts)
    return `${e.groundContacts} kontaktów`; // moc / plyo
  if (e.rir) return e.rir; // akcesoria
  return null;
}

export function statusBadgeLabel(session: SessionDay): string | null {
  return session.loadLabelOverride ?? null;
}

export function canShowPostSessionForm(session: SessionDay): boolean {
  return Boolean(session.dbId);
}

function parseCompletionNotes(raw: string): { pain: number; legFatigue: number; notes: string } {
  const header = raw.match(/^\[Monitoring\]\s*pain=(\d+);\s*legFatigue=(\d+)\n?/i);
  if (!header) return { pain: 0, legFatigue: 0, notes: raw };
  const pain = Math.max(0, Math.min(10, Number(header[1]) || 0));
  const legFatigue = Math.max(0, Math.min(10, Number(header[2]) || 0));
  return {
    pain,
    legFatigue,
    notes: raw.slice(header[0].length).trimStart(),
  };
}

function composeCompletionNotes(notes: string, pain: number, legFatigue: number): string {
  const safePain = Math.max(0, Math.min(10, Math.round(pain)));
  const safeFatigue = Math.max(0, Math.min(10, Math.round(legFatigue)));
  return `[Monitoring] pain=${safePain};legFatigue=${safeFatigue}\n${notes.trim()}`.trimEnd();
}

// Pierwsza linia: dawka + max jeden kwalifikator.
function compactPrescription(e: TrainingExercise): string {
  const display = e.displayPrescription?.trim();

  if (display) {
    return display;
  }

  return [primaryDose(e), primaryQualifier(e)].filter(Boolean).join(" · ");
}

function restLabel(e: TrainingExercise): string | null {
  const r = e.restAfterPair ?? e.restAfterExercise;
  if (!r) return null;
  return /przerwa|rest/i.test(r) ? r : `Przerwa: ${r}`;
}

function formatRestValue(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/^Przerwa:\s*/i, "").replace(/^Rest:\s*/i, "").trim();
}

function exerciseDataLineParts(e: TrainingExercise): { dose: string; meta: string } {
  const display = compactPrescription(e);
  const parts = display.split(" · ");
  const dose = parts[0] ?? "";
  const qualifier = parts.slice(1).join(" ");
  const rest = formatRestValue(e.restAfterPair ?? e.restAfterExercise);
  const meta = [qualifier, rest].filter(Boolean).join(" ").trim();
  return { dose, meta };
}

function restSecondsFromLabel(label: string): number {
  const values = [...label.matchAll(/\d+/g)].map(([value]) => Number(value));
  if (values.length === 0) return 90;
  if (values.length === 1) return values[0];
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function resolveDefinitionForExercise(e: TrainingExercise) {
  return (
    (e.exerciseId ? getExerciseDefinition(e.exerciseId) : undefined) ??
    resolveExerciseByName(e.name)
  );
}

function canonicalExerciseName(e: TrainingExercise): string {
  return resolveDefinitionForExercise(e)?.displayNamePl?.trim() || e.name;
}

const SPRINT_BLOCK_FLOW = [
  { key: "ramp", index: "01", title: "Przygotowanie RAMP", estMin: 10 },
  { key: "skip", index: "02", title: "Skipy A → C → B → D", estMin: 8 },
  { key: "technical", index: "03", title: "Drille techniczne", estMin: 8 },
  { key: "plyo", index: "04", title: "Plyometria", estMin: 6 },
  { key: "resisted", index: "05", title: "Opór / przygotowanie startu", estMin: 5 },
  { key: "main", index: "06", title: "Sprint główny", estMin: 10 },
  { key: "terminal", index: "07", title: "Hamowanie / zwrotność / łuk", estMin: 6 },
  { key: "cooldown", index: "08", title: "Wyciszenie", estMin: 4 },
] as const;
const SPRINT_SKIP_PRESCRIPTION = "2 × 15–20 m";
export const SPRINT_RUNNER_CONTAINER_CLASS = "space-y-3 overflow-x-hidden";

type SprintBlockKey = (typeof SPRINT_BLOCK_FLOW)[number]["key"];

type SprintExerciseView = {
  id: string;
  exercise: TrainingExercise;
  canonicalName: string;
  prescription: string;
  showSkipSetLabels?: boolean;
};

export type SprintBlockView = {
  key: SprintBlockKey;
  index: string;
  title: string;
  estimatedMin: number;
  exercises: SprintExerciseView[];
  /** Pusty obowiązkowy blok sprintu = błąd danych, nie prawidłowy wynik. */
  hasDataError?: boolean;
};

type SprintExerciseMeta = {
  exercise: TrainingExercise;
  sectionType: TrainingSection["type"];
};

type SprintResolvedDetails = {
  purpose: string | null;
  howTo: string | null;
  cues: string[];
  errors: string[];
  safety: string | null;
  equipment: string;
  noEquipmentReplacement: string;
};

function cleanSprintPrescription(value: string): string {
  return value
    .replace(/\bpowt\.?\b/gi, "")
    .replace(/\b(\d+)\s*seri[aeyi]?\s*×\s*/gi, (_m, count: string) =>
      Number(count) > 1 ? `${count} × ` : "",
    )
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .replace(/[.]+$/g, "")
    .trim();
}

export function formatSprintPrescription(e: TrainingExercise): string {
  const joinDeduped = (parts: string[]) =>
    parts
      .map((part) => cleanSprintPrescription(part))
      .filter(Boolean)
      .filter(
        (part, index, all) =>
          all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index,
      )
      .join(" · ");

  const fromFields = [e.reps, e.duration].filter(Boolean) as string[];
  if (fromFields.length) return joinDeduped(fromFields);
  const display = e.displayPrescription?.trim();
  if (!display) return "";
  return joinDeduped(display.split("·"));
}

function isSprintRunnerTerminalExercise(exercise: TrainingExercise): boolean {
  const definition = exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined;
  const qualities = definition?.speedQualities ?? [];
  return qualities.some((quality) =>
    [
      "deceleration",
      "planned_change_of_direction",
      "reactive_agility",
      "reacceleration",
      "curved_sprint",
    ].includes(quality),
  );
}

function sprintRoleForExercise(meta: SprintExerciseMeta): TrainingExercise["speedRole"] | null {
  if (meta.exercise.speedRole) return meta.exercise.speedRole;
  if (meta.sectionType === "cooldown") return "cooldown";
  const definition = meta.exercise.exerciseId
    ? getExerciseDefinition(meta.exercise.exerciseId)
    : undefined;
  const role = definition?.sessionRoles?.[0];
  if (!role) return meta.sectionType === "warmup" ? "preparation" : null;
  if (role === "preparation" && meta.sectionType !== "warmup") return "cooldown";
  return role;
}

function sprintBlockKeyForExercise(meta: SprintExerciseMeta): SprintBlockKey | null {
  const id = meta.exercise.exerciseId ?? "";
  const explicitRole = meta.exercise.speedRole;

  // Jawnie oznaczony drill techniczny pozostaje drillem,
  // nawet jeśli używa ruchu podobnego do skipu.
  if (explicitRole === "technical") return "technical";

  const role = sprintRoleForExercise(meta);

  // Kanoniczne skipy muszą trafić do osobnego bloku,
  // zanim uwzględnimy rolę wywnioskowaną z biblioteki.
  if (id === "a_skip" || id === "b_skip" || id === "c_skip" || id === "d_skip") {
    return "skip";
  }

  if (role === "technical") return "technical";
  if (role === "conditioning" || (!role && !id)) return null;
  if (role === "cooldown") return "cooldown";
  if (role === "preparation" || role === "primer") return "ramp";
  if (role === "resisted") return "resisted";
  if (role === "terminal") return "terminal";
  if (!role && isSprintRunnerTerminalExercise(meta.exercise)) return "terminal";
  if (role === "secondary" || id === "scissor_bounds") return "plyo";
  if (role === "primary") return "main";
  return null;
}

export function resolveSprintExerciseDetails(exercise: TrainingExercise): SprintResolvedDetails {
  const definition = exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined;
  const cues = (
    definition?.coachingCues ??
    exercise.cue?.split(/[.;]\s*/).filter(Boolean) ??
    []
  ).slice(0, 3);
  const errors = (
    definition?.commonErrors ?? (exercise.commonMistake ? [exercise.commonMistake] : [])
  ).slice(0, 2);
  const equipment = specialistEquipmentForExercise(definition)
    .map((id) => EQUIPMENT_DEFINITIONS.find((item) => item.id === id)?.displayName ?? id)
    .join(", ");
  const noEquipmentReplacementId =
    definition?.replacementIds?.find((candidateId) => {
      const candidate = getExerciseDefinition(candidateId);
      return candidate && specialistEquipmentForExercise(candidate).length === 0;
    }) ?? null;
  const noEquipmentReplacement = noEquipmentReplacementId
    ? (getExerciseDefinition(noEquipmentReplacementId)?.displayNamePl ?? noEquipmentReplacementId)
    : equipment
      ? "Brak zatwierdzonej zamiany bez sprzętu"
      : "Nie dotyczy — ćwiczenie bez sprzętu";
  return {
    purpose: exercise.purpose ?? definition?.objective ?? definition?.stimulus ?? null,
    howTo:
      definition?.instructionsPl?.join(" ") ??
      exercise.instructionSteps
        ?.map((step) => [step.title, step.description].filter(Boolean).join(" — "))
        .join(" ") ??
      exercise.technique ??
      null,
    cues,
    errors,
    safety: definition?.injuryCautions?.[0] ?? null,
    equipment: equipment || "Masa ciała",
    noEquipmentReplacement,
  };
}

export function buildSprintRunnerBlocks(sections: TrainingSection[]): SprintBlockView[] {
  const buckets: Record<SprintBlockKey, SprintExerciseMeta[]> = {
    ramp: [],
    skip: [],
    technical: [],
    plyo: [],
    resisted: [],
    main: [],
    terminal: [],
    cooldown: [],
  };
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const exercise of block.exercises) {
        const meta: SprintExerciseMeta = {
          exercise,
          sectionType: section.type,
        };
        const key = sprintBlockKeyForExercise(meta);
        if (key) buckets[key].push(meta);
      }
    }
  }

  const skipById = new Map<string, SprintExerciseMeta>();
  for (const meta of buckets.skip) {
    const id = resolveDefinitionForExercise(meta.exercise)?.id ?? meta.exercise.exerciseId;
    if (id && !skipById.has(id)) skipById.set(id, meta);
  }

  return SPRINT_BLOCK_FLOW.map((block) => {
    const source =
      block.key === "skip"
        ? (["a_skip", "c_skip", "b_skip", "d_skip"]
            .map((id) => skipById.get(id))
            .filter(Boolean) as SprintExerciseMeta[])
        : buckets[block.key];
    const exercises = source.map((meta) => ({
      id: meta.exercise.id,
      exercise: meta.exercise,
      // Każdy blok korzysta z tej samej zatwierdzonej polskiej nazwy bibliotecznej.
      canonicalName: canonicalExerciseName(meta.exercise),
      prescription:
        block.key === "skip" ? SPRINT_SKIP_PRESCRIPTION : formatSprintPrescription(meta.exercise),
      showSkipSetLabels: block.key === "skip",
    }));
    return {
      key: block.key,
      index: block.index,
      title: block.title,
      estimatedMin: block.estMin,
      exercises,
      hasDataError: exercises.length === 0 && block.key !== "cooldown",
    };
  });
}

export function isSprintRunnerSession(session: SessionDay): boolean {
  if (session.speedGeneratorVersion) {
    return !session.classification || session.classification.isSpeed;
  }
  return Boolean(
    session.classification?.isSpeed &&
    (session.classification.isAcceleration || session.classification.isMaxVelocity),
  );
}

function ExerciseRow({
  e,
  index,
  done,
  onToggle,
  onUnavailable,
  equipmentIds,
  sessionId,
}: {
  e: TrainingExercise;
  index?: number;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
  sessionId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logging, setLogging] = useState(false);
  const canLogSets = plannedSets(e) > 0;
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const { dose, meta } = exerciseDataLineParts(e);
  const title = canonicalExerciseName(e);
  const details = resolveExerciseSheetViewModel(e);
  const equipmentNames = equipmentIds.map(
    (id) => EQUIPMENT_DEFINITIONS.find((item) => item.id === id)?.displayName ?? id,
  );
  const label = e.label ?? (typeof index === "number" ? String(index + 1) : "");
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            done
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary"
          }`}
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
        >
          {done ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="text-[11px] font-bold">{label}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={`block truncate text-[15px] font-semibold leading-tight ${
              done ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {title}
          </span>
          {(dose || meta) && (
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground">
              {dose && (
                <span className="mr-2 font-semibold tabular-nums text-foreground">{dose}</span>
              )}
              {meta}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60"
          aria-label="Szczegóły"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
          {details.purpose && (
            <p className="text-sm leading-relaxed text-foreground">{details.purpose}</p>
          )}
          {details.steps.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Jak wykonać</div>
              <ol className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                {details.steps.map((step, i) => (
                  <li key={i} className="list-decimal">
                    {[step.title, step.description].filter(Boolean).join(" — ")}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {details.cues.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Wskazówki</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {details.cues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}
          {details.errors.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Błędy</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {details.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 text-sm text-foreground/80 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-muted-foreground">Sprzęt</div>
              <p className="mt-1">{details.equipment}</p>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Zamiana bez sprzętu</div>
              <p className="mt-1">{details.replacement}</p>
            </div>
          </div>
          {!done && equipmentIds.length > 0 && (
            <button
              type="button"
              onClick={onUnavailable}
              className="text-[11px] font-medium text-primary"
            >
              Nie mam {equipmentNames.join(", ")}
            </button>
          )}
          {canLogSets && (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="rounded-md border border-primary/30 px-2.5 py-1 text-[11px] font-semibold text-primary"
            >
              Zapisz serie
            </button>
          )}
          <button
            type="button"
            onClick={() => setDetailSheetOpen(true)}
            className="block text-[11px] font-semibold text-primary"
          >
            Otwórz pełne szczegóły ćwiczenia
          </button>
          <MovementBlueprint exercise={e} />
        </div>
      )}
      <ExerciseDetailSheet exercise={e} open={detailSheetOpen} onOpenChange={setDetailSheetOpen} />
      <ExerciseRunnerScreen
        exercise={e}
        sessionId={sessionId}
        open={logging}
        onClose={() => setLogging(false)}
      />
    </div>
  );
}

function SprintExerciseRow({
  view,
  done,
  onToggle,
  onUnavailable,
  equipmentIds,
}: {
  view: SprintExerciseView;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [restRunning, setRestRunning] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const restSecondsRef = useRef(restSeconds);
  restSecondsRef.current = restSeconds;
  useEffect(() => {
    if (!restRunning || restSecondsRef.current === null) return;
    const timer = window.setInterval(() => {
      setRestSeconds((current) => {
        if (current === null || current <= 1) {
          setRestRunning(false);
          return null;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRunning]);
  const exercise = view.exercise;
  const rest = restLabel(exercise);
  const details = resolveSprintExerciseDetails(exercise);
  const equipmentNames = equipmentIds.map(
    (id) => EQUIPMENT_DEFINITIONS.find((item) => item.id === id)?.displayName ?? id,
  );
  return (
    <div className="py-2">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-primary" : "bg-border"}`}
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex w-full items-start gap-2 text-left"
          >
            <span
              className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${
                done ? "text-muted-foreground line-through" : "text-foreground"
              }`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {view.canonicalName}
            </span>
            <ChevronRight
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}
            />
          </button>
          {view.prescription && (
            <div className="mt-1 text-xs font-medium tabular-nums text-foreground/80">
              {view.prescription}
            </div>
          )}
          {view.showSkipSetLabels && (
            <div className="mt-1 flex gap-1.5">
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                1 Z ADD-STEP
              </span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                2 BEZ ADD-STEP
              </span>
            </div>
          )}
          {!done && equipmentIds.length > 0 && (
            <button
              type="button"
              onClick={onUnavailable}
              className="mt-1 text-[11px] font-medium text-primary"
            >
              Nie mam {equipmentNames.join(", ")}
            </button>
          )}
          {rest && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{rest}</span>
              <button
                type="button"
                className="font-semibold text-primary"
                onClick={() => {
                  if (restRunning) {
                    setRestRunning(false);
                    return;
                  }
                  const seconds = restSecondsFromLabel(rest);
                  setRestSeconds((current) => current ?? seconds);
                  setRestRunning(true);
                }}
              >
                {restRunning ? "Pauza" : "Start"}
              </button>
              {restRunning && (
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => {
                    setRestRunning(false);
                    setRestSeconds(null);
                  }}
                >
                  Reset
                </button>
              )}
              {restSeconds !== null && <span className="tabular-nums">{restSeconds} s</span>}
            </div>
          )}
          {expanded && (
            <div className="mt-2 space-y-2 border-l border-border pl-3 text-xs">
              {details.purpose && (
                <div>
                  <div className="font-semibold text-muted-foreground">Cel</div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{details.purpose}</p>
                </div>
              )}
              {details.howTo && (
                <div>
                  <div className="font-semibold text-muted-foreground">Jak wykonać</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.howTo}</p>
                </div>
              )}
              {details.cues.length > 0 && (
                <div>
                  <div className="font-semibold text-muted-foreground">Wskazówki</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {details.cues.map((cue, i) => (
                      <li key={i}>{cue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {details.errors.length > 0 && (
                <div>
                  <div className="font-semibold text-muted-foreground">Błędy</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {details.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {details.safety && (
                <div>
                  <div className="font-semibold text-muted-foreground">Bezpieczeństwo</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.safety}</p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="font-semibold text-muted-foreground">Sprzęt</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.equipment}</p>
                </div>
                <div>
                  <div className="font-semibold text-muted-foreground">Zamiana bez sprzętu</div>
                  <p className="mt-1 leading-relaxed text-foreground">
                    {details.noEquipmentReplacement}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailSheetOpen(true)}
                className="text-[11px] font-semibold text-primary"
              >
                Otwórz pełne szczegóły ćwiczenia
              </button>
              <MovementBlueprint exercise={exercise} />
            </div>
          )}
        </div>
      </div>
      <ExerciseDetailSheet
        exercise={exercise}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </div>
  );
}

const SprintStructuredSections = memo(function SprintStructuredSections({
  sections,
  date,
  session,
  onFinish,
}: {
  sections: TrainingSection[];
  date: string;
  session: SessionDay;
  onFinish: () => void;
}) {
  const { markEquipmentUnavailable } = useLoadwise();
  const blocks = buildSprintRunnerBlocks(sections);
  const progressKey = `loadwise:sprint-progress:${
    session.dbId ?? session.sessionId ?? `${date}:${session.title}:${session.slotLabel ?? "1"}`
  }`;
  const skipNextPersist = useRef(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    skipNextPersist.current = true;
    try {
      const saved = window.localStorage.getItem(progressKey);
      const parsed = saved
        ? (JSON.parse(saved) as {
            done?: Record<string, boolean>;
            started?: boolean;
            currentBlockIdx?: number;
          })
        : null;
      setDone(parsed?.done ?? {});
      setStarted(parsed?.started ?? false);
      setCurrentBlockIdx(Math.max(0, Math.min(blocks.length - 1, parsed?.currentBlockIdx ?? 0)));
    } catch {
      setDone({});
      setStarted(false);
      setCurrentBlockIdx(0);
    }
    setExpanded({});
    setFinished(false);
  }, [blocks.length, progressKey]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    window.localStorage.setItem(progressKey, JSON.stringify({ done, started, currentBlockIdx }));
  }, [currentBlockIdx, done, progressKey, started]);

  const mdRelation = session.mdLabel ?? session.mdRelation ?? "—";
  const equipmentPool = Array.from(
    new Set(
      blocks.flatMap((block) =>
        block.exercises.flatMap((item) =>
          specialistEquipmentForExercise(resolveDefinitionForExercise(item.exercise)),
        ),
      ),
    ),
  ).map((id) => EQUIPMENT_DEFINITIONS.find((eq) => eq.id === id)?.displayName ?? id);

  const actionLabel = !started
    ? "Rozpocznij blok"
    : currentBlockIdx >= blocks.length - 1
      ? "Zakończ sesję"
      : "Następny blok";
  const currentBlock = blocks[currentBlockIdx];
  const currentBlockCompleted = Boolean(
    currentBlock?.exercises.length && currentBlock.exercises.every((exercise) => done[exercise.id]),
  );
  const actionDisabled = started && !currentBlockCompleted;

  return (
    <div className={SPRINT_RUNNER_CONTAINER_CLASS}>
      <div className="rounded-lg border border-border bg-card px-3 py-3">
        <div className="text-xs text-muted-foreground">Cel</div>
        <div className="text-sm font-semibold text-foreground">
          {session.goalOfSession || session.goalLabel}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Czas: {session.durationMin} min</div>
          <div>Intensywność: {session.intensity}</div>
          <div className="col-span-2">
            Sprzęt: {equipmentPool.length ? equipmentPool.join(", ") : "Masa ciała"}
          </div>
          <div className="col-span-2">Relacja MD: {mdRelation}</div>
        </div>
      </div>

      <div className="space-y-2">
        {blocks.map((block, index) => {
          const isCurrent = index === currentBlockIdx;
          const isExpanded = isCurrent || expanded[block.key];
          const exerciseCount = block.exercises.length;
          const completedCount = block.exercises.filter((exercise) => done[exercise.id]).length;
          return (
            <div key={block.key} className="rounded-lg border border-border bg-card px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  if (!isCurrent) {
                    setExpanded((current) => ({ ...current, [block.key]: !isExpanded }));
                  }
                }}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="w-7 shrink-0 text-base font-bold text-foreground">
                  {block.index}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {block.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {completedCount}/{exerciseCount}
                </span>
                {!isExpanded && (
                  <span
                    className={`text-[11px] ${block.hasDataError ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {block.hasDataError
                      ? "Błąd danych sesji"
                      : `${exerciseCount} ćw. · ~${block.estimatedMin} min`}
                  </span>
                )}
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>
              {isExpanded && block.hasDataError && (
                <div className="mt-2 text-xs font-medium text-destructive">
                  Błąd danych sesji: obowiązkowy blok sprintu jest pusty. Wygeneruj sesję ponownie.
                </div>
              )}
              {isExpanded && (
                <div className="mt-2 divide-y divide-border/50">
                  {block.exercises.map((item) => {
                    const definition = resolveDefinitionForExercise(item.exercise);
                    const equipmentIds = specialistEquipmentForExercise(definition);
                    return (
                      <SprintExerciseRow
                        key={item.id}
                        view={item}
                        done={!!done[item.id]}
                        onToggle={() =>
                          setDone((current) => ({ ...current, [item.id]: !current[item.id] }))
                        }
                        onUnavailable={() => {
                          if (equipmentIds.length)
                            markEquipmentUnavailable(date, item.exercise, equipmentIds);
                        }}
                        equipmentIds={equipmentIds}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!finished && (
        <div className="sticky bottom-3 z-20">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (!started) {
                setStarted(true);
                return;
              }
              if (currentBlockIdx < blocks.length - 1) {
                setCurrentBlockIdx((value) => value + 1);
                return;
              }
              setFinished(true);
              onFinish();
            }}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionLabel}
          </button>
          {actionDisabled && (
            <div className="mt-1.5 rounded-md bg-card/95 px-3 py-1.5 text-center text-[11px] text-muted-foreground shadow-sm">
              Oznacz wszystkie ćwiczenia bieżącego bloku jako wykonane.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const SECTION_TAB_LABELS: Record<string, string> = {
  warmup: "Rozgrzewka",
  prep: "Przygotowanie",
  main: "Główna",
  accessory: "Dobór",
  cooldown: "Schłódzenie",
};

const StructuredSections = memo(function StructuredSections({
  sections,
  date,
  sessionId,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
}) {
  const { markEquipmentUnavailable } = useLoadwise();

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [activeSectionId, setActiveSectionId] = useState<string>(
    sections[0]?.id ?? "",
  );
  const toggle = (id: string) => setDone((current) => ({ ...current, [id]: !current[id] }));

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-border">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSectionId(sec.id)}
            className={`relative px-2.5 py-2 text-[13px] font-medium transition-colors ${
              activeSectionId === sec.id ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {SECTION_TAB_LABELS[sec.type] ?? sec.title}
            {activeSectionId === sec.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {activeSection && (
        <div className="soft-card p-4">
          {activeSection.blocks.map((b, blockIndex) => {
            const blockTitle = b.title || b.exercises[0]?.name || "Blok";
            const blockRest = b.restAfterBlock ? formatRestValue(b.restAfterBlock) : null;
            return (
              <div key={b.id} className={blockIndex > 0 ? "pt-4" : ""}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="truncate text-[13px] font-bold text-foreground">
                    {blockTitle}
                  </h4>
                  {b.exercises[0] && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {compactPrescription(b.exercises[0])}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-border/40">
                  {b.exercises.map((e, exerciseIndex) => {
                    const equipmentIds = specialistEquipmentForExercise(
                      getExerciseDefinition(e.exerciseId ?? e.name),
                    );
                    return (
                      <ExerciseRow
                        key={e.id}
                        e={e}
                        index={exerciseIndex}
                        done={!!done[e.id]}
                        onToggle={() => toggle(e.id)}
                        onUnavailable={() => {
                          if (equipmentIds.length)
                            markEquipmentUnavailable(date, e, equipmentIds);
                        }}
                        equipmentIds={equipmentIds}
                        sessionId={sessionId}
                      />
                    );
                  })}
                </div>
                {blockRest && (
                  <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                    Po bloku — {blockRest}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ---------- Powłoka ekranu + skeleton (płynne ładowanie) ----------

function SessionScreenShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
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
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
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

function LogField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange?: (next: number) => void;
}) {
  const controlled = typeof value === "number" && typeof onChange === "function";
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={10}
        placeholder="0–10"
        value={controlled ? value : undefined}
        onChange={
          controlled
            ? (e) => {
                const next = Number(e.target.value);
                onChange(Number.isFinite(next) ? Math.max(0, Math.min(10, next)) : 0);
              }
            : undefined
        }
        className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
      />
    </div>
  );
}

function CompletionPanel({ session }: { session: SessionDay }) {
  const { state, completeSession } = useLoadwise();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const parsed = parseCompletionNotes(existing?.notes ?? "");
  const [rpe, setRpe] = useState(existing?.rpe ?? 6);
  const [pain, setPain] = useState(parsed.pain);
  const [legFatigue, setLegFatigue] = useState(parsed.legFatigue);
  const [notes, setNotes] = useState(parsed.notes);
  const [saving, setSaving] = useState(false);
  const done = existing?.completed ?? false;
  const existingRpe = existing?.rpe ?? 6;
  const existingNotes = existing?.notes ?? "";

  useEffect(() => {
    const next = parseCompletionNotes(existingNotes);
    setRpe(existingRpe);
    setPain(next.pain);
    setLegFatigue(next.legFatigue);
    setNotes(next.notes);
  }, [existingRpe, existingNotes]);

  if (!session.dbId) return null;

  async function save() {
    setSaving(true);
    await completeSession(session, rpe, composeCompletionNotes(notes, pain, legFatigue));
    setSaving(false);
  }

  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${done ? "text-primary" : "text-muted-foreground"}`} />
        <h3 className="text-sm font-semibold">
          {done ? "Sesja oznaczona jako wykonana" : "Oznacz sesję jako wykonaną"}
        </h3>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">RPE (ciężkość) 0–10</span>
          <span className="text-muted-foreground">{rpe}/10</span>
        </div>
        <Slider min={0} max={10} step={1} value={[rpe]} onValueChange={(v) => setRpe(v[0])} />
      </div>

      <div className="mt-3 space-y-2">
        <LogField label="Ból 0–10" value={pain} onChange={setPain} />
        <LogField label="Zmęczenie nóg 0–10" value={legFatigue} onChange={setLegFatigue} />
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
        {saving ? "Zapisywanie…" : done ? "Zaktualizuj wpis" : "Oznacz jako wykonane"}
      </button>
    </div>
  );
}

function ClubMonitoring() {
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
        <p className="mt-0.5 text-sm text-muted-foreground">To główne obciążenie dnia.</p>
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
    </>
  );
}

// Krótki komunikat decyzji — max 1 zdanie, tylko jeśli naprawdę potrzebne.
export function shortDecisionNote(session: SessionDay): string | null {
  if (session.loadLabelOverride === "Wstrzymaj trening") {
    return "Wstrzymaj trening i skonsultuj się z lekarzem lub fizjoterapeutą.";
  }
  if (session.loadLabelOverride === "Ogranicz obciążenie") {
    return (
      session.safetyNote ??
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból."
    );
  }
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
              <div className="text-xs font-semibold text-foreground">{r.label}</div>
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
  const { state, hydrated, todayIso, undoModification, undoExerciseReplacement } = useLoadwise();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [showSprintCompletion, setShowSprintCompletion] = useState(false);
  const goBack = useInstantBack("/plan");
  useEffect(() => {
    setShowSprintCompletion(false);
  }, [date, slot]);

  const day = state.plan.find((p) => p.date === date);

  // Dane jeszcze się ładują (np. po odświeżeniu / deep link) — nie pokazuj
  // pustego białego ekranu. Skeleton w tym samym layoucie, z krótkim delay.
  const stillLoading = !hydrated || (!day && !state.profile);
  const showSkeleton = useDelayedFlag(stillLoading);

  if (stillLoading) {
    return (
      <SessionScreenShell onBack={goBack}>
        {showSkeleton ? <SessionSkeleton /> : null}
      </SessionScreenShell>
    );
  }

  if (!day || !state.profile) {
    // Dane dotarły, ale sesji nie ma — czytelny stan błędu zamiast wiszącego loadera.
    return (
      <SessionScreenShell onBack={goBack}>
        <div className="soft-card p-5 text-center">
          <p className="text-sm font-medium text-foreground">Nie znaleziono tej sesji.</p>
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
  primary = resolveEffectiveDay(
    day,
    isToday ? state.readiness[todayIso] : undefined,
    state.profile,
    mods,
  );
  // Ostatnia bariera przed runnerem: ekran nie zależy od powodzenia zapisu
  // migracji i nigdy nie dostaje historycznie uciętego slotu sprintowego.
  primary = repairRuntimeSpeedDay(primary, state.profile, {
    today: todayIso,
    completions: state.completions,
    modifications: state.modifications,
    plan: state.plan,
  });

  let session: SessionDay = primary;
  if (slot === 2) {
    if (!primary.secondSession) {
      return (
        <SessionScreenShell onBack={goBack}>
          <p className="text-sm text-muted-foreground">
            Druga sesja nie jest dziś dostępna (zbyt niska gotowość, ból lub bliskość meczu).
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

  const fallbackExercises = hasFlatSectionContent ? [] : (session.exercises ?? []);
  const displayedSession = applyExerciseReplacements(
    session,
    state.exerciseReplacements[date] ?? [],
  );

  // Strukturalne sekcje: wygenerowane bloki, inaczej fallback z płaskich danych.
  const structured: TrainingSection[] =
    displayedSession.structuredSections && displayedSession.structuredSections.length
      ? displayedSession.structuredSections
      : hasFlatSectionContent
        ? flatToStructured(displayedSession.sections)
        : fallbackExercises.length
          ? flatToStructured({
              warmup: [],
              main: fallbackExercises,
              accessory: [],
              footballTransfer: [],
              cooldown: [],
            })
          : [];
  const sprintRunner = isSprintRunnerSession(session) && structured.length > 0;

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

        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{session.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DayTypeTag type={session.dayType} />
          <IntensityBadge intensity={session.intensity} label={statusBadgeLabel(session)} />
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
                slot === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
                slot === 2 ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
        {state.equipmentNotice && (
          <div className="soft-card px-4 py-3 text-sm text-muted-foreground">
            {state.equipmentNotice}
          </div>
        )}

        {isClub ? (
          <>
            <ClubMonitoring />
            {structured.length > 0 && (
              <StructuredSections sections={structured} date={date} sessionId={session.dbId} />
            )}
          </>
        ) : sprintRunner ? (
          <SprintStructuredSections
            sections={structured}
            date={date}
            session={session}
            onFinish={() => setShowSprintCompletion(true)}
          />
        ) : (
          <>
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Do wykonania
            </div>
            <StructuredSections sections={structured} date={date} sessionId={session.dbId} />
          </>
        )}

        {(state.exerciseReplacements[date] ?? []).length > 0 && (
          <div className="soft-card flex flex-wrap items-center gap-3 p-3 text-xs">
            <span className="text-muted-foreground">
              {(state.exerciseReplacements[date] ?? []).length === 1
                ? "Ćwiczenie zostało zamienione."
                : "Ćwiczenia zostały zamienione."}
            </span>
            {(state.exerciseReplacements[date] ?? []).map((replacement) => (
              <span key={replacement.id} className="inline-flex items-center gap-2">
                <span className="text-muted-foreground">
                  {replacement.original.name} → {replacement.replacement.name}
                </span>
                <button
                  type="button"
                  onClick={() => undoExerciseReplacement(date, replacement.id)}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-primary"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Cofnij
                </button>
              </span>
            ))}
          </div>
        )}

        {canShowPostSessionForm(session) && (!sprintRunner || showSprintCompletion) && (
          <CompletionPanel session={session} />
        )}

        {/* Status zmiany + cofnij */}
        {swapMod && slot === 1 && (
          <div className="soft-card flex items-center justify-between p-3 text-xs">
            <span className="text-muted-foreground">Sesja zamieniona. {swapMod.reason}</span>
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
                <div className="mt-0.5 text-sm font-semibold">{m.session.title}</div>
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
            <StructuredSections sections={flatToStructured(m.session.sections)} date={date} />
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
