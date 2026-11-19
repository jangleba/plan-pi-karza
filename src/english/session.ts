/** Przebieg lekcji i powtórek jako czyste funkcje (interfejs tylko je wywołuje i wyświetla). */
import { dueIds, phraseIdsOf, recordAnswer, saveResume, completeLesson, type EnglishDoc, type Session, type Step } from "./progress";
import { seededShuffle } from "./match";
import type { LessonMeta } from "./types";

/** Lekcja: poznanie wszystkich zwrotów, potem pytania sprawdzające, potem układanki (ok. 2–3 minuty). */
export function startLesson(meta: LessonMeta, day: string, seed = `${meta.id}|${day}`): Session {
  const ids = phraseIdsOf(meta);
  const steps: Step[] = [
    ...ids.map((p): Step => ({ k: "learn", p })),
    ...seededShuffle(ids, `${seed}|check`).map((p): Step => ({ k: "check", p })),
    ...seededShuffle(ids, `${seed}|build`).map((p): Step => ({ k: "build", p })),
  ];
  return { kind: "lesson", lessonId: meta.id, steps, idx: 0, day, firstTry: {}, answered: -1 };
}

/** Powtórka: tylko zwroty na terminie (do 8), po jednym zadaniu na zwrot; rodzaj zadania zależy od etapu. */
export function startReview(doc: EnglishDoc, day: string, limit = 8): Session | null {
  const ids = dueIds(doc, day, limit);
  if (!ids.length) return null;
  const steps: Step[] = ids.map((p) => ({ k: (doc.phrases[p]!.stage % 2 === 0 ? "check" : "build") as Step["k"], p }));
  return { kind: "review", steps, idx: 0, day, firstTry: {}, answered: -1 };
}

export const currentStep = (s: Session): Step | null => s.steps[s.idx] ?? null;
export const isFinished = (s: Session): boolean => s.idx >= s.steps.length;
export const isScored = (st: Step | null): boolean => !!st && st.k !== "learn";

export interface AnswerResult { session: Session; doc: EnglishDoc; applied: boolean; requeued: boolean }

/**
 * Odpowiedź na bieżący krok. Drugie wywołanie dla tego samego kroku (podwójne kliknięcie) niczego nie zmienia.
 * Błąd w kroku pierwszego podejścia dokłada do końca jeden krok powtórzenia; wynik trafia do harmonogramu powtórek.
 */
export function answer(doc: EnglishDoc, s: Session, correct: boolean, day: string, now: number): AnswerResult {
  const step = currentStep(s);
  if (!step || !isScored(step) || s.answered === s.idx) return { session: s, doc, applied: false, requeued: false };
  const requeued = !correct && !step.retry;
  const session: Session = {
    ...s, answered: s.idx,
    firstTry: step.retry ? s.firstTry : { ...s.firstTry, [`${step.p}:${step.k}`]: correct },
    steps: requeued ? [...s.steps, { k: step.k, p: step.p, retry: true }] : s.steps,
  };
  return { session, doc: saveResume(recordAnswer(doc, step.p, correct, day, now), resumable(session), now), applied: true, requeued };
}

/** Przejście dalej: krok z odpowiedzią lub „poznaj” (bez odpowiedzi nie da się pominąć zadania). */
export function advance(doc: EnglishDoc, s: Session, now: number): { session: Session; doc: EnglishDoc } {
  const step = currentStep(s);
  if (!step || (isScored(step) && s.answered !== s.idx)) return { session: s, doc };
  const session = { ...s, idx: s.idx + 1 };
  return { session, doc: isFinished(session) ? doc : saveResume(doc, session, now) };
}

/** Stan do zapisu „miejsca przerwania”: po udzielonej odpowiedzi wznawiamy od następnego kroku. */
export const resumable = (s: Session): Session => (s.answered === s.idx ? { ...s, idx: s.idx + 1 } : s);

export const score = (s: Session): { right: number; total: number; ratio: number } => {
  const v = Object.values(s.firstTry);
  const right = v.filter(Boolean).length;
  return { right, total: v.length, ratio: v.length ? right / v.length : 0 };
};

/** Zakończenie: lekcja zostaje oznaczona jako ukończona, miejsce przerwania usunięte. */
export function finish(doc: EnglishDoc, s: Session, day: string, now: number): EnglishDoc {
  const withLesson = s.kind === "lesson" && s.lessonId ? completeLesson(doc, s.lessonId, score(s).ratio, day, now) : doc;
  return saveResume(withLesson, null, now);
}

/** Wznowienie zapisanej sesji: lekcję można kontynuować w dowolnym dniu, powtórkę tylko tego samego dnia (lista zwrotów na terminie zmienia się). */
export function restore(doc: EnglishDoc, day: string): Session | null {
  const s = doc.resume?.session;
  if (!s || isFinished(s)) return null;
  if (s.kind === "review" && s.day !== day) return null;
  return { ...s, answered: -1 };
}

/** Ile kroków zostało i jaki procent sesji wykonano (do paska postępu; po powtórzeniach pasek może się wydłużyć). */
export const progressOf = (s: Session): { done: number; total: number } => ({ done: Math.min(s.idx, s.steps.length), total: s.steps.length });
