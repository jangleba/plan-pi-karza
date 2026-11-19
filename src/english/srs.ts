/**
 * Harmonogram powtórek zwrotów.
 *
 * Etapy 1–5 odpowiadają odstępom 1, 3, 7, 14 i 30 dni. Poprawna odpowiedź w dniu, w którym zwrot jest „na terminie”, przesuwa go
 * o jeden etap. Błąd cofa zwrot do etapu 0 z powtórką następnego dnia. Kilka odpowiedzi tego samego dnia przesuwa zwrot
 * NAJWYŻEJ RAZ, a błąd tego dnia unieważnia przyznany wcześniej postęp. Odpowiedź przed terminem tylko zlicza próbę.
 * Daty to lokalne dni „RRRR-MM-DD” przekazywane z zewnątrz (łatwa zmiana dnia i testy).
 */
export const INTERVALS = [1, 3, 7, 14, 30] as const;
export const MAX_STAGE = INTERVALS.length;
/** Zwrot uznajemy za utrwalony od etapu 3 (trzecia poprawna powtórka w odstępach; następna za 7 dni lub więcej). To umowa aplikacji, nie ocena naukowa. */
export const MASTERED_STAGE = 3;

export interface PhraseProgress {
  /** 0 = do ćwiczenia (po błędzie lub dopiero poznany), 1–5 = etap harmonogramu. */
  stage: number;
  /** Dzień następnej powtórki. */
  due: string;
  /** Ostatni dzień, w którym zwrot był ćwiczony. */
  lastDay: string;
  /** Czy odpowiedzi z `lastDay` zostały zaliczone (brak błędu tego dnia). */
  dayOk: boolean;
  seen: number;
  correct: number;
  wrong: number;
  /** Czas ostatniej zmiany (ms) – do łączenia zmian z różnych urządzeń. */
  ts: number;
}

export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const blank = (day: string, now: number): PhraseProgress => ({ stage: 0, due: day, lastDay: "", dayOk: false, seen: 0, correct: 0, wrong: 0, ts: now });

export function applyAnswer(prev: PhraseProgress | undefined, correct: boolean, day: string, now: number): PhraseProgress {
  const p = prev ?? blank(day, now);
  const base = { ...p, seen: p.seen + 1, correct: p.correct + (correct ? 1 : 0), wrong: p.wrong + (correct ? 0 : 1), ts: now };
  const lapse = (): PhraseProgress => ({ ...base, stage: 0, due: addDays(day, 1), lastDay: day, dayOk: false });

  if (p.lastDay === day) {
    // kolejne odpowiedzi tego samego dnia
    if (!correct) return lapse(); // błąd tego dnia unieważnia wcześniejszy postęp z tego samego dnia
    return base; // poprawna: bez zmiany etapu (albo dzień był już zaliczony, albo wcześniej był błąd)
  }
  if (!correct) return lapse();
  // pierwsza poprawna odpowiedź nowego dnia: postęp tylko, gdy zwrot jest na terminie (albo jest nowy)
  if (day < p.due) return { ...base, lastDay: day, dayOk: true };
  const stage = Math.min(p.stage + 1, MAX_STAGE);
  return { ...base, stage, due: addDays(day, INTERVALS[stage - 1]!), lastDay: day, dayOk: true };
}

export const isDue = (p: PhraseProgress, day: string): boolean => p.due <= day;
export const isMastered = (p: PhraseProgress): boolean => p.stage >= MASTERED_STAGE;
