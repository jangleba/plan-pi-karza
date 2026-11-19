/**
 * Stan postępu nauki i czyste funkcje na nim. Ukończenie LEKCJI i utrwalenie ZWROTÓW to dwie osobne rzeczy:
 *  – `lessons`: czy lekcja została przeprowadzona do końca,
 *  – `phrases`: etap harmonogramu powtórek każdego zwrotu (patrz srs.ts).
 * Każdy element ma znacznik czasu `ts` (ms), więc zmiany z różnych urządzeń można łączyć (wygrywa nowsza).
 */
import { LESSONS_META, TOTAL_PHRASES, sloganIds, wordIds } from "./meta";
import { MAX_STAGE, MASTERED_STAGE, applyAnswer, isDue, type PhraseProgress } from "./srs";
import type { Level, LessonMeta } from "./types";

export interface LessonProgress { completedAt: string; completions: number; /** odsetek poprawnych odpowiedzi za pierwszym razem (0–1) */ firstTry: number; ts: number }
export type StepKind = "learn" | "check" | "build";
export interface Step { k: StepKind; p: string; retry?: true }
export interface Session {
  kind: "lesson" | "review";
  lessonId?: string;
  steps: Step[];
  idx: number;
  /** Dzień rozpoczęcia sesji. */
  day: string;
  /** Wyniki za pierwszym podejściem: „zwrot:rodzaj” → poprawnie? */
  firstTry: Record<string, boolean>;
  /** Indeks ostatniego kroku, na który udzielono odpowiedzi (ochrona przed podwójnym kliknięciem); -1 = żaden. */
  answered: number;
}
export interface ResumeItem { ts: number; session: Session | null }
export interface EnglishDoc {
  v: 1;
  level: { value: Level; ts: number } | null;
  lessons: Record<string, LessonProgress>;
  phrases: Record<string, PhraseProgress>;
  /** Postęp fiszek spoza lekcji (słowa `w-…`, hasła `s-…`); karty zwrotów korzystają z `phrases`. */
  cards: Record<string, PhraseProgress>;
  resume: ResumeItem | null;
  /** Klucze elementów zmienionych lokalnie i jeszcze niepotwierdzonych na koncie. */
  dirty: string[];
}

export const emptyDoc = (): EnglishDoc => ({ v: 1, level: null, lessons: {}, phrases: {}, cards: {}, resume: null, dirty: [] });

/* ------------------------------ elementy synchronizacji ------------------------------ */

export const ITEM_RE = /^(level|resume|lesson:[a-z0-9-]{1,40}|phrase:[a-z0-9-]{1,40}|card:[a-z0-9-]{1,40})$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const LESSON_IDS = new Set(LESSONS_META.map((l) => l.id));

/** Identyfikatory zwrotów lekcji wynikają z jej spisu: `<lekcja>-01` … (zgodność z treściami pilnuje test). */
export const phraseIdsOf = (m: Pick<LessonMeta, "id" | "count">): string[] => Array.from({ length: m.count }, (_, i) => `${m.id}-${String(i + 1).padStart(2, "0")}`);
const KNOWN_PHRASES = new Set(LESSONS_META.flatMap(phraseIdsOf));
const KNOWN_CARDS = new Set([...wordIds(), ...sloganIds()]);
export const isKnownPhrase = (id: string): boolean => KNOWN_PHRASES.has(id);

function parseStep(v: unknown): Step | null {
  if (!isObj(v) || !["learn", "check", "build"].includes(String(v.k)) || typeof v.p !== "string" || !KNOWN_PHRASES.has(v.p)) return null;
  return { k: v.k as StepKind, p: v.p, ...(v.retry === true ? { retry: true as const } : {}) };
}
function parseSession(v: unknown): Session | null {
  if (!isObj(v) || (v.kind !== "lesson" && v.kind !== "review") || !Array.isArray(v.steps) || !isNum(v.idx) || !isDay(v.day)) return null;
  const steps = v.steps.map(parseStep);
  if (steps.some((s) => s === null) || steps.length === 0 || steps.length > 80) return null;
  if (v.kind === "lesson" && (typeof v.lessonId !== "string" || !LESSON_IDS.has(v.lessonId))) return null;
  const firstTry: Record<string, boolean> = {};
  if (isObj(v.firstTry)) for (const [k, val] of Object.entries(v.firstTry)) if (typeof val === "boolean" && k.length < 60) firstTry[k] = val;
  const idx = Math.max(0, Math.min(Math.trunc(v.idx), steps.length));
  return { kind: v.kind, ...(typeof v.lessonId === "string" ? { lessonId: v.lessonId } : {}), steps: steps as Step[], idx, day: v.day, firstTry, answered: isNum(v.answered) ? Math.trunc(v.answered) : -1 };
}

/** Walidacja danych z magazynu lokalnego lub z serwera (nigdy nie ufamy danym z zewnątrz). */
export function parseItem(key: string, data: unknown): { key: string; ts: number; apply: (d: EnglishDoc) => void } | null {
  if (!ITEM_RE.test(key) || !isObj(data) || !isNum(data.ts)) return null;
  const ts = data.ts;
  if (key === "level") return data.value === 1 || data.value === 2 || data.value === 3 ? { key, ts, apply: (d) => { d.level = { value: data.value as Level, ts }; } } : null;
  if (key === "resume") {
    const session = data.session === null ? null : parseSession(data.session);
    return data.session !== null && !session ? null : { key, ts, apply: (d) => { d.resume = { ts, session }; } };
  }
  if (key.startsWith("lesson:")) {
    const id = key.slice(7);
    if (!LESSON_IDS.has(id) || !isDay(data.completedAt) || !isNum(data.completions) || !isNum(data.firstTry)) return null;
    const lp: LessonProgress = { completedAt: data.completedAt, completions: Math.max(1, Math.trunc(data.completions)), firstTry: Math.max(0, Math.min(1, data.firstTry)), ts };
    return { key, ts, apply: (d) => { d.lessons[id] = lp; } };
  }
  const isCard = key.startsWith("card:");
  const id = key.slice(isCard ? 5 : 7);
  if (!(isCard ? KNOWN_CARDS : KNOWN_PHRASES).has(id) || !isNum(data.stage) || !isDay(data.due) || !isNum(data.seen) || !isNum(data.correct) || !isNum(data.wrong) || typeof data.dayOk !== "boolean") return null;
  const lastDay = data.lastDay === "" || isDay(data.lastDay) ? (data.lastDay as string) : null;
  if (lastDay === null) return null;
  const pp: PhraseProgress = { stage: Math.max(0, Math.min(MAX_STAGE, Math.trunc(data.stage))), due: data.due, lastDay, dayOk: data.dayOk, seen: Math.max(0, Math.trunc(data.seen)), correct: Math.max(0, Math.trunc(data.correct)), wrong: Math.max(0, Math.trunc(data.wrong)), ts };
  return { key, ts, apply: (d) => { (isCard ? d.cards : d.phrases)[id] = pp; } };
}

export function itemData(doc: EnglishDoc, key: string): Record<string, unknown> | undefined {
  if (key === "level") return doc.level ? { value: doc.level.value, ts: doc.level.ts } : undefined;
  if (key === "resume") return doc.resume ? { ts: doc.resume.ts, session: doc.resume.session } : undefined;
  if (key.startsWith("lesson:")) return doc.lessons[key.slice(7)] as unknown as Record<string, unknown> | undefined;
  if (key.startsWith("phrase:")) return doc.phrases[key.slice(7)] as unknown as Record<string, unknown> | undefined;
  if (key.startsWith("card:")) return doc.cards[key.slice(5)] as unknown as Record<string, unknown> | undefined;
  return undefined;
}
export const allKeys = (doc: EnglishDoc): string[] => [
  ...(doc.level ? ["level"] : []), ...(doc.resume ? ["resume"] : []),
  ...Object.keys(doc.lessons).map((k) => `lesson:${k}`), ...Object.keys(doc.phrases).map((k) => `phrase:${k}`), ...Object.keys(doc.cards).map((k) => `card:${k}`),
];

const withDirty = (d: EnglishDoc, ...keys: string[]): EnglishDoc => ({ ...d, dirty: [...new Set([...d.dirty, ...keys])] });

/** Wczytanie dokumentu z JSON-a lokalnego (odporne na uszkodzone lub starsze dane: błędne elementy są pomijane). */
export function parseDoc(raw: unknown): EnglishDoc {
  const doc = emptyDoc();
  if (!isObj(raw) || raw.v !== 1) return doc;
  const read = (key: string, data: unknown) => { const it = parseItem(key, data); if (it) it.apply(doc); };
  read("level", raw.level);
  read("resume", raw.resume);
  if (isObj(raw.lessons)) for (const [id, v] of Object.entries(raw.lessons)) read(`lesson:${id}`, v);
  if (isObj(raw.phrases)) for (const [id, v] of Object.entries(raw.phrases)) read(`phrase:${id}`, v);
  if (isObj(raw.cards)) for (const [id, v] of Object.entries(raw.cards)) read(`card:${id}`, v);
  if (Array.isArray(raw.dirty)) doc.dirty = raw.dirty.filter((k): k is string => typeof k === "string" && ITEM_RE.test(k) && itemData(doc, k) !== undefined);
  return doc;
}

/** Łączenie z danymi z konta: dla każdego elementu wygrywa nowszy znacznik czasu; lokalne, nowsze zmiany zostają i wrócą na konto. */
export function mergeRemote(doc: EnglishDoc, rows: Array<{ item: string; data: unknown }>): { doc: EnglishDoc; changed: boolean } {
  const next: EnglishDoc = { ...doc, lessons: { ...doc.lessons }, phrases: { ...doc.phrases }, cards: { ...doc.cards }, dirty: [...doc.dirty] };
  let changed = false;
  for (const r of rows) {
    const it = parseItem(r.item, r.data);
    if (!it) continue;
    const local = itemData(next, it.key);
    const localTs = local && isNum(local.ts) ? local.ts : -1;
    if (it.ts > localTs) { it.apply(next); next.dirty = next.dirty.filter((k) => k !== it.key); changed = true; }
  }
  return { doc: next, changed };
}

/** Elementy do wysłania na konto. */
export function pendingRows(doc: EnglishDoc): Array<{ item: string; data: Record<string, unknown> }> {
  return doc.dirty.flatMap((k) => { const d = itemData(doc, k); return d ? [{ item: k, data: d }] : []; });
}
/** Po udanym zapisie na koncie: czyścimy tylko te elementy, które od wysłania nie zmieniły się lokalnie. */
export function clearDirty(doc: EnglishDoc, sent: Record<string, number>): EnglishDoc {
  return { ...doc, dirty: doc.dirty.filter((k) => !(k in sent) || (itemData(doc, k)?.ts as number | undefined) !== sent[k]) };
}

/* ------------------------------ operacje ------------------------------ */

export const setLevel = (doc: EnglishDoc, value: Level, now: number): EnglishDoc => withDirty({ ...doc, level: { value, ts: now } }, "level");

export function recordAnswer(doc: EnglishDoc, phraseId: string, correct: boolean, day: string, now: number): EnglishDoc {
  const phrases = { ...doc.phrases, [phraseId]: applyAnswer(doc.phrases[phraseId], correct, day, now) };
  return withDirty({ ...doc, phrases }, `phrase:${phraseId}`);
}

/** Ocena fiszki (wiem / jeszcze nie) – ten sam harmonogram powtórek co w ćwiczeniach. Karty zwrotów zapisują się jako zwroty z lekcji. */
export function recordCard(doc: EnglishDoc, deck: "phrases" | "words" | "slogans", id: string, known: boolean, day: string, now: number): EnglishDoc {
  if (deck === "phrases") return recordAnswer(doc, id, known, day, now);
  const cards = { ...doc.cards, [id]: applyAnswer(doc.cards[id], known, day, now) };
  return withDirty({ ...doc, cards }, `card:${id}`);
}

export const saveResume = (doc: EnglishDoc, session: Session | null, now: number): EnglishDoc => withDirty({ ...doc, resume: { ts: now, session } }, "resume");

export function completeLesson(doc: EnglishDoc, lessonId: string, firstTry: number, day: string, now: number): EnglishDoc {
  const prev = doc.lessons[lessonId];
  const lesson: LessonProgress = { completedAt: day, completions: (prev?.completions ?? 0) + 1, firstTry: Math.max(0, Math.min(1, firstTry)), ts: now };
  return withDirty({ ...doc, lessons: { ...doc.lessons, [lessonId]: lesson } }, `lesson:${lessonId}`);
}

/* ------------------------------ ścieżka i podsumowanie ------------------------------ */

const PRIORITY: Record<Level, Level[]> = { 1: [1, 2, 3], 2: [2, 3, 1], 3: [3, 2, 1] };
/** Kolejność poziomów treści zależna od wybranego poziomu trudności (mniejsza liczba = wcześniej). */
export const levelRank = (pref: Level | null, level: Level): number => PRIORITY[pref ?? 1].indexOf(level);
/**
 * Kolejność lekcji zależna od wybranego poziomu trudności: najpierw lekcje wybranego poziomu, potem pozostałe.
 * Wszystkie lekcje pozostają dostępne; poziom nie jest oceną umiejętności.
 */
export function lessonPath(level: Level | null): LessonMeta[] {
  const prio = PRIORITY[level ?? 1];
  return [...LESSONS_META].sort((a, b) => prio.indexOf(a.level) - prio.indexOf(b.level) || a.order - b.order);
}

export const hasProgress = (doc: EnglishDoc): boolean => Object.keys(doc.lessons).length > 0 || Object.keys(doc.phrases).length > 0 || Object.keys(doc.cards).length > 0 || !!doc.resume?.session;

/** Lekcja do pokazania na karcie: przerwana (jeśli jest), w przeciwnym razie pierwsza nieukończona ze ścieżki; null, gdy wszystkie ukończono. */
export function nextLesson(doc: EnglishDoc): LessonMeta | null {
  const s = doc.resume?.session;
  if (s?.kind === "lesson" && s.lessonId) return LESSONS_META.find((l) => l.id === s.lessonId) ?? null;
  return lessonPath(doc.level?.value ?? null).find((l) => !doc.lessons[l.id]) ?? null;
}

export function dueIds(doc: EnglishDoc, day: string, limit = 8): string[] {
  return Object.entries(doc.phrases)
    .filter(([, p]) => isDue(p, day))
    .sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].stage - b[1].stage || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([id]) => id);
}
export const dueCount = (doc: EnglishDoc, day: string): number => Object.values(doc.phrases).filter((p) => isDue(p, day)).length;
/** Fiszki spoza lekcji (słowa, hasła) na terminie; zwroty z lekcji są powtarzane ćwiczeniami i liczone w `dueCount`. */
export const dueCardCount = (doc: EnglishDoc, day: string): number => Object.values(doc.cards).filter((p) => isDue(p, day)).length;

export interface Summary {
  level: Level | null;
  lessonsDone: number; lessonsTotal: number;
  /** Zwroty, na które udzielono odpowiedzi (poznane), w utrwalaniu (etap 1–2) i utrwalone (etap ≥ 3). */
  phrasesSeen: number; phrasesLearning: number; phrasesMastered: number; phrasesTotal: number;
  /** Powtórki na dziś: zwroty z lekcji (ćwiczenia) i fiszki (słowa, hasła) łącznie. */
  dueToday: number;
  dueExercises: number;
  dueCards: number;
  cardsSeen: number; cardsMastered: number;
  next: LessonMeta | null;
  resuming: boolean;
  primary: "Rozpocznij" | "Kontynuuj";
}
export function summarize(doc: EnglishDoc, day: string): Summary {
  const ps = Object.values(doc.phrases);
  return {
    level: doc.level?.value ?? null,
    lessonsDone: Object.keys(doc.lessons).length, lessonsTotal: LESSONS_META.length,
    phrasesSeen: ps.length, phrasesMastered: ps.filter((p) => p.stage >= MASTERED_STAGE).length,
    phrasesLearning: ps.filter((p) => p.stage > 0 && p.stage < MASTERED_STAGE).length, phrasesTotal: TOTAL_PHRASES,
    dueToday: dueCount(doc, day) + dueCardCount(doc, day), dueExercises: dueCount(doc, day), dueCards: dueCardCount(doc, day),
    cardsSeen: Object.keys(doc.cards).length, cardsMastered: Object.values(doc.cards).filter((p) => p.stage >= MASTERED_STAGE).length, next: nextLesson(doc), resuming: !!doc.resume?.session, primary: hasProgress(doc) ? "Kontynuuj" : "Rozpocznij",
  };
}
