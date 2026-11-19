/** Piłkarski angielski – typy wspólne dla treści, postępu i interfejsu. */

/** Poziom to USTAWIENIE TRUDNOŚCI I KOLEJNOŚCI lekcji, a nie certyfikowana ocena (np. CEFR). Można go zmienić w każdej chwili. */
export type Level = 1 | 2 | 3;
export const LEVEL_LABEL: Record<Level, string> = { 1: "Zaczynam", 2: "Znam podstawy", 3: "Swobodnie mówię, chcę języka piłkarskiego" };

/** Czy zwrot dotyczy zawodnika z pola, bramkarza, czy obu. */
export type Role = "field" | "gk" | "both";
export const ROLE_LABEL: Record<Role, string> = { field: "Zawodnik z pola", gk: "Bramkarz", both: "Pole i bramka" };

/** Pytanie sprawdzające rozumienie sytuacji: jedna poprawna odpowiedź i dwie błędne (kolejność losowana przy wyświetlaniu). */
export interface CheckTask { q: string; correct: string; wrong: [string, string]; why: string }

/**
 * Ułożenie odpowiedzi z fragmentów. `pieces` to dostępne słowa (także zbędne), `answers` – wszystkie akceptowane ułożenia.
 * Porównanie ignoruje wielkość liter i znaki interpunkcyjne.
 */
export interface BuildTask { prompt: string; pieces: string[]; answers: string[][]; why: string }

export interface Phrase {
  /** Stały identyfikator (a-z, 0-9, myślnik, do 40 znaków): klucz postępu zapisywanego w koncie. */
  id: string;
  lesson: string;
  level: Level;
  role: Role;
  en: string;
  pl: string;
  /** Kiedy i kto tak mówi; uwagi zależne od kontekstu. */
  context: string;
  check: CheckTask;
  build: BuildTask;
}

export interface LessonMeta { id: string; order: number; title: string; level: Level; minutes: number; count: number }
export interface Lesson extends LessonMeta { phrases: Phrase[] }
