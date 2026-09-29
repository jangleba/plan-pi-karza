import type { SessionDay, TrainingSection, TrainingBlock, TrainingExercise } from "./types";
import {
  getExerciseDefinition,
  getAllEquipmentDefinitions,
  resolveExerciseByName,
} from "./exerciseLibrary";

const EQUIPMENT_DEFINITIONS = getAllEquipmentDefinitions();

export function equipmentNamesFor(ids: string[]): string[] {
  return ids.map((id) => EQUIPMENT_DEFINITIONS.find((item) => item.id === id)?.displayName ?? id);
}

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
  if (load && /RIR|ciężar na/i.test(load)) return load;
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
  if (!session.dbId || session.isUnavailable || session.dayType === "rest") return false;
  if (session.loadLabelOverride === "Wstrzymaj trening") return false;
  return true;
}

export function matchCanBeCompleted(
  session: SessionDay,
  status: "started" | "completed" | "missed" | undefined,
): boolean {
  return session.dayType !== "match" || status === "started" || status === "completed";
}

export function parseCompletionNotes(raw: string): {
  pain: number;
  legFatigue: number;
  notes: string;
} {
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

export function composeCompletionNotes(notes: string, pain: number, legFatigue: number): string {
  const safePain = Math.max(0, Math.min(10, Math.round(pain)));
  const safeFatigue = Math.max(0, Math.min(10, Math.round(legFatigue)));
  return `[Monitoring] pain=${safePain};legFatigue=${safeFatigue}\n${notes.trim()}`.trimEnd();
}

// Pierwsza linia: dawka + max jeden kwalifikator.
export function compactPrescription(e: TrainingExercise): string {
  const display = e.displayPrescription?.trim();

  if (display) {
    return display;
  }

  return [primaryDose(e), primaryQualifier(e)].filter(Boolean).join(" · ");
}

export function restLabel(e: TrainingExercise): string | null {
  const r = e.restAfterPair ?? e.restAfterExercise;
  if (!r) return null;
  return /przerwa|rest/i.test(r) ? r : `Przerwa: ${r}`;
}

export function formatRestValue(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/^Przerwa:\s*/i, "")
    .replace(/^Rest:\s*/i, "")
    .trim();
}

export function exerciseDataLineParts(e: TrainingExercise): {
  dose: string;
  meta: string;
} {
  const display = compactPrescription(e);
  const parts = display.split(" · ");
  const dose = parts[0] ?? "";
  const qualifier = parts.slice(1).join(" ");
  const rest = formatRestValue(e.restAfterPair ?? e.restAfterExercise);
  const meta = [qualifier, rest].filter(Boolean).join(" ").trim();
  return { dose, meta };
}

export function restSecondsFromLabel(label: string): number {
  const values = [...label.matchAll(/\d+/g)].map(([value]) => Number(value));
  if (values.length === 0) return 90;
  if (values.length === 1) return values[0];
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function resolveDefinitionForExercise(e: TrainingExercise) {
  return (
    (e.exerciseId ? getExerciseDefinition(e.exerciseId) : undefined) ??
    resolveExerciseByName(e.name)
  );
}

export function canonicalExerciseName(e: TrainingExercise): string {
  return resolveDefinitionForExercise(e)?.displayNamePl?.trim() || e.name;
}

export type StrengthStageKey = "warmup" | "main" | "accessory" | "cooldown";

export type StrengthStageView = {
  key: StrengthStageKey;
  label: string;
  blocks: TrainingBlock[];
};

const STRENGTH_STAGE_META: Array<{
  key: StrengthStageKey;
  label: string;
  sectionTypes: string[];
}> = [
  { key: "warmup", label: "Rozgrzewka", sectionTypes: ["warmup", "prep"] },
  { key: "main", label: "Siła i moc", sectionTypes: ["main"] },
  {
    key: "accessory",
    label: "Akcesoria",
    sectionTypes: ["accessory", "footballTransfer"],
  },
  { key: "cooldown", label: "Koniec", sectionTypes: ["cooldown"] },
];

/**
 * Łączy prezentacyjne etapy sesji siłowej bez zmiany danych silnika.
 * Akcesoria i transfer zachowują wszystkie bloki oraz ich kolejność.
 */
export function buildStrengthStages(sections: TrainingSection[]): StrengthStageView[] {
  return STRENGTH_STAGE_META.map((stage) => ({
    key: stage.key,
    label: stage.label,
    blocks: sections
      .filter((section) => stage.sectionTypes.includes(section.type))
      .flatMap((section) => section.blocks),
  })).filter((stage) => stage.blocks.length > 0);
}

/** Zwraca samą wartość przerwy, nawet dla historycznie zdublowanego prefiksu. */
export function normalizeStrengthBlockRest(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  let normalized = value.trim();
  while (/^przerwa po bloku:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^przerwa po bloku:\s*/i, "").trim();
  }
  return normalized || null;
}

export function splitStrengthBlockTitle(title: string): {
  heading: string;
  detail: string | null;
} {
  const clean = title.trim() || "Blok ćwiczeń";
  const match = clean.match(/^(BLOK\s+[A-Z0-9]+)\s*[—–-]\s*(.+)$/i);
  return match
    ? { heading: match[1].toUpperCase(), detail: match[2].trim() }
    : { heading: clean, detail: null };
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
  if (session.dayType === "club") return "Trening klubowy stanowi główne obciążenie dnia.";
  if (session.dayType === "match") return "Dziś mecz — bez dodatkowego treningu.";
  if (session.mdLabel === "MD-1") return "MD-1 = tylko aktywacja, bez ciężkich nóg.";
  if (session.dayType === "recovery") return "Regeneracja — bez intensywności.";
  if (session.intensity === "wysoka") return "Mocny dzień — rozgrzej się solidnie.";
  return null;
}
