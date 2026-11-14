import { getAllEquipmentDefinitions, resolveEquipmentId } from "./exerciseLibrary";
import { GOAL_LABELS } from "./labels";
import type { Goal, Profile } from "./types";

/**
 * Short interview before the next plan. Structured answers drive the deterministic generator:
 * nothing is derived from free text except through the explicit rules below, and every
 * derived change is shown and confirmed. Unclear text gets one concrete question.
 */
export type Barrier = "time" | "fatigue" | "equipment" | "schedule" | "none";
export type NoteTopic = "time" | "equipment" | "goal" | "days" | "unrelated";

export const MINUTE_STEPS = [30, 45, 60, 75, 90, 120] as const;
export const BARRIER_LABELS: Record<Barrier, string> = {
  time: "Brakowało czasu",
  fatigue: "Zmęczenie lub ciężki tydzień",
  equipment: "Brakowało sprzętu lub miejsca",
  schedule: "Zmieniły się terminy klubu lub meczów",
  none: "Nic szczególnego",
};
export const DAY_LABELS = ["", "Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"] as const;

export interface InterviewAnswers {
  /** null = keep the current goal. */
  goal: Goal | null;
  barriers: Barrier[];
  /** null = keep the current own training days. */
  days: number[] | null;
  /** null = keep (or lower it when time was the barrier). */
  minutes: number | null;
  /** Equipment ids the athlete reports as unavailable. */
  unavailableEquipment: string[];
  /** Free note; used only through the rules below, never stored. */
  notes: string;
  /** The answer to the single clarification question, if one was asked. */
  noteTopic: NoteTopic | null;
}
export const emptyAnswers = (): InterviewAnswers => ({
  goal: null,
  barriers: [],
  days: null,
  minutes: null,
  unavailableEquipment: [],
  notes: "",
  noteTopic: null,
});

export interface NextPlanChange {
  id: string;
  kind: "goal" | "days" | "minutes" | "equipment" | "fatigue" | "gym";
  source: "answer" | "note";
  /** What the athlete sees and confirms. */
  text: string;
  /** A change with a wide effect starts unchecked. */
  defaultConfirmed: boolean;
}
export interface Clarification {
  question: string;
  options: Array<{ id: NoteTopic; label: string }>;
}
export interface NextPlanDraft {
  profile: Profile;
  minutes: number;
  changes: NextPlanChange[];
  /** Hints that change nothing, shown as plain lines. */
  notes: string[];
  clarification: Clarification | null;
  profileChanged: boolean;
}

const same = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const dayList = (days: readonly number[]) =>
  [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(", ");

interface NoteReading {
  barriers: Set<Barrier>;
  equipmentIds: string[];
  noGym: boolean;
  pain: boolean;
  recognised: boolean;
}
const NOTE_EQUIPMENT: Array<[RegExp, string]> = [
  [/hantl\w*/i, "dumbbell"],
  [/kettlebell\w*|odwa[żz]nik\w*/i, "kettlebell"],
  [/gum\w*|band\w*/i, "band"],
  [/[łl]awk\w*/i, "bench"],
  [/skrzyni\w*/i, "box"],
  [/lekarsk\w*/i, "med_ball"],
  [/sztang\w*/i, "barbell"],
];
/** Fixed, readable rules. Anything outside them is "not recognised", not guessed. */
export function readNote(text: string): NoteReading {
  const note = text.trim();
  const out: NoteReading = {
    barriers: new Set(),
    equipmentIds: [],
    noGym: false,
    pain: false,
    recognised: false,
  };
  if (!note) return out;
  if (
    /(mniej|brak|za\s+ma[łl]o|kr[óo]tsz\w*|kr[óo]cej)\W+(\w+\W+){0,2}czas\w*|czas\w*\W+(\w+\W+){0,2}(mniej|brak)|nie\s+mam\s+czasu/i.test(
      note,
    )
  )
    out.barriers.add("time");
  // A negation covers only its own clause: "Nie mam sztangi, ale mam hantle" excludes the barbell
  // and nothing else. Clauses are split at commas, "ale", "oraz" and sentence ends.
  const NEG =
    /(?:brak|nie\s+mam|bez)\W+(?:\w+\W+){0,2}?(?:sprz[ęe]t\w*|si[łl]owni\w*|hantl\w*|kettlebell\w*|gum\w*|[łl]awk\w*|skrzyni\w*|lekarsk\w*|sztang\w*)/i;
  for (const clause of note.split(/[,;.!?]|\bale\b|\boraz\b|\blecz\b/i)) {
    const hit = NEG.exec(clause);
    if (!hit) continue;
    out.barriers.add("equipment");
    for (const [re, id] of NOTE_EQUIPMENT)
      if (re.test(hit[0]) && !out.equipmentIds.includes(id)) out.equipmentIds.push(id);
    if (/si[łl]owni\w*/i.test(hit[0])) out.noGym = true;
  }
  if (/zm[ęe]cz\w*|przemecz\w*|przem[ęe]cz\w*|ci[ęe][żz]ko/i.test(note))
    out.barriers.add("fatigue");
  out.pain = /b[óo]l\w*|kontuzj\w*|uraz\w*|boli/i.test(note);
  out.recognised = out.barriers.size > 0 || out.pain;
  return out;
}

const lowerStep = (minutes: number) => [...MINUTE_STEPS].reverse().find((m) => m < minutes) ?? null;

export function ownedEquipment(profile: Profile) {
  const owned = new Set(
    (profile.equipment ?? []).flatMap((label) => {
      const id = resolveEquipmentId(label);
      return id ? [id] : [];
    }),
  );
  return getAllEquipmentDefinitions().filter((e) => owned.has(e.id));
}

/**
 * Turns the answers into explicit, confirmable changes and the profile/budget they produce.
 * `confirmed` lists the change ids the athlete ticked; only those are applied.
 */
export function draftNextPlan(
  profile: Profile,
  currentMinutes: number,
  answers: InterviewAnswers,
  confirmed: ReadonlySet<string>,
): NextPlanDraft {
  const changes: NextPlanChange[] = [];
  const notes: string[] = [];
  let next: Profile = { ...profile };
  let minutes = currentMinutes;
  const reading = readNote(answers.notes);
  const clarified = answers.noteTopic;
  const barriers = new Set<Barrier>(answers.barriers.filter((b) => b !== "none"));
  for (const b of reading.barriers) barriers.add(b);
  if (clarified === "time") barriers.add("time");
  if (clarified === "equipment") barriers.add("equipment");
  const add = (change: NextPlanChange, apply: () => void) => {
    changes.push(change);
    if (confirmed.has(change.id)) apply();
  };

  if (answers.goal && answers.goal !== profile.goal)
    add(
      {
        id: "goal",
        kind: "goal",
        source: "answer",
        text: `Cel: ${GOAL_LABELS[profile.goal]} → ${GOAL_LABELS[answers.goal]}. Zmienią się priorytety sesji w tygodniu.`,
        defaultConfirmed: true,
      },
      () => {
        next = { ...next, goal: answers.goal! };
      },
    );

  if (
    answers.days &&
    answers.days.length > 0 &&
    !same(answers.days, profile.individualTrainingDays)
  )
    add(
      {
        id: "days",
        kind: "days",
        source: "answer",
        text: `Dni własnych treningów: ${dayList(profile.individualTrainingDays)} → ${dayList(answers.days)}.`,
        defaultConfirmed: true,
      },
      () => {
        next = { ...next, individualTrainingDays: [...answers.days!].sort((a, b) => a - b) };
      },
    );

  // Budget: an explicit choice wins; otherwise "no time" lowers it by one step.
  if (answers.minutes !== null) {
    if (answers.minutes !== currentMinutes)
      add(
        {
          id: "minutes",
          kind: "minutes",
          source: "answer",
          text: `Czas na jednostkę: ${currentMinutes} → ${answers.minutes} min.`,
          defaultConfirmed: true,
        },
        () => {
          minutes = answers.minutes!;
        },
      );
  } else if (barriers.has("time")) {
    const lower = lowerStep(currentMinutes);
    if (lower)
      add(
        {
          id: "minutes",
          kind: "minutes",
          source: reading.barriers.has("time") || clarified === "time" ? "note" : "answer",
          text: `Mniej czasu: czas na jednostkę ${currentMinutes} → ${lower} min.`,
          defaultConfirmed: true,
        },
        () => {
          minutes = lower;
        },
      );
    else notes.push("Czas na jednostkę jest już najkrótszy (30 min); nie zmieniamy go.");
  }

  // Equipment: only an explicit selection excludes anything.
  const already = new Set(profile.unavailableEquipmentIds ?? []);
  const pickedIds = [...new Set([...answers.unavailableEquipment, ...reading.equipmentIds])].filter(
    (id) => !already.has(id),
  );
  if (pickedIds.length > 0) {
    const names = pickedIds.map(
      (id) => getAllEquipmentDefinitions().find((e) => e.id === id)?.displayName ?? id,
    );
    add(
      {
        id: "equipment",
        kind: "equipment",
        source: answers.unavailableEquipment.length > 0 ? "answer" : "note",
        text: `Wykluczamy z planu sprzęt: ${names.join(", ")}.`,
        defaultConfirmed: true,
      },
      () => {
        next = { ...next, unavailableEquipmentIds: [...already, ...pickedIds] };
      },
    );
  }
  if (reading.noGym && profile.hasGym)
    add(
      {
        id: "gym",
        kind: "gym",
        source: "note",
        text: "Brak dostępu do siłowni: plan bez ćwiczeń wymagających siłowni.",
        defaultConfirmed: true,
      },
      () => {
        next = { ...next, hasGym: false };
      },
    );

  if (barriers.has("fatigue") && profile.secondaryLimiter !== "fatigue")
    add(
      {
        id: "fatigue",
        kind: "fatigue",
        source: reading.barriers.has("fatigue") ? "note" : "answer",
        text: `Ograniczenie dodatkowe: ${profile.secondaryLimiter ? "zmiana na „Zmęczenie”" : "„Zmęczenie”"}. Cały plan dostanie lżejszy wariant. Zostaw odznaczone, jeśli to nie ma być stałe.`,
        defaultConfirmed: false,
      },
      () => {
        next = { ...next, secondaryLimiter: "fatigue" };
      },
    );
  if (barriers.has("equipment") && pickedIds.length === 0 && !reading.noGym)
    notes.push("Wybierz w kroku 3, którego sprzętu brakuje. Bez tego niczego nie wykluczamy.");
  if (barriers.has("schedule"))
    notes.push("Terminy klubu i meczów sprawdź w kroku 3 (dni własnych treningów).");
  if (reading.pain)
    notes.push(
      "Ból lub uraz nie zmienia planu automatycznie. Plan nie układa rehabilitacji; zaznacz to w profilu, jeśli treningi mają zostać wstrzymane.",
    );

  // One concrete question for text nothing recognised, instead of a silent guess.
  const unclear = answers.notes.trim() !== "" && !reading.recognised && clarified === null;
  const clarification: Clarification | null = unclear
    ? {
        question: "Czego dotyczy ta uwaga?",
        options: [
          { id: "time", label: "Czasu na trening" },
          { id: "equipment", label: "Sprzętu lub miejsca" },
          { id: "goal", label: "Celu planu" },
          { id: "days", label: "Dni treningowych" },
          { id: "unrelated", label: "To nie dotyczy planu" },
        ],
      }
    : null;
  if (clarified === "goal") notes.push("Wybierz cel w kroku 1; tekstu nie zamieniamy na cel.");
  if (clarified === "days") notes.push("Wybierz dni w kroku 3; tekstu nie zamieniamy na dni.");

  return {
    profile: next,
    minutes,
    changes,
    notes,
    clarification,
    profileChanged: JSON.stringify(next) !== JSON.stringify(profile),
  };
}
