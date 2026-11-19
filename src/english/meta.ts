import type { LessonMeta } from "./types";

/**
 * Spis lekcji (lekki, bez treści): karta na stronie głównej i obliczanie postępu korzystają tylko z niego.
 * Pełne treści (`content.ts`) ładują się dopiero po otwarciu modułu. Zgodność ze spisem pilnuje test.
 */
export const LESSONS_META: LessonMeta[] = [
  { id: "partners", order: 1, title: "Komunikacja z partnerami na boisku", level: 1, minutes: 3, count: 6 },
  { id: "coach", order: 2, title: "Polecenia trenera", level: 1, minutes: 3, count: 6 },
  { id: "roles", order: 3, title: "Pozycje i role", level: 1, minutes: 3, count: 6 },
  { id: "pressing", order: 4, title: "Pressing i obrona", level: 2, minutes: 3, count: 6 },
  { id: "build-up", order: 5, title: "Budowanie akcji", level: 2, minutes: 3, count: 6 },
  { id: "movement", order: 6, title: "Ruch bez piłki", level: 2, minutes: 3, count: 6 },
  { id: "training", order: 7, title: "Organizacja treningu", level: 1, minutes: 3, count: 6 },
  { id: "intro", order: 8, title: "Przedstawienie się w nowym klubie", level: 2, minutes: 3, count: 6 },
  { id: "trials", order: 9, title: "Rozmowa przed testami", level: 3, minutes: 3, count: 6 },
  { id: "expectations", order: 10, title: "Pytania o oczekiwania trenera", level: 3, minutes: 3, count: 6 },
  { id: "my-role", order: 11, title: "Rozmowa o swojej roli", level: 3, minutes: 3, count: 6 },
  { id: "application", order: 12, title: "Wiadomość zgłoszeniowa do klubu", level: 3, minutes: 3, count: 6 },
];

export const lessonMeta = (id: string): LessonMeta | undefined => LESSONS_META.find((l) => l.id === id);
export const TOTAL_PHRASES = LESSONS_META.reduce((s, l) => s + l.count, 0);

/** Fiszki spoza lekcji: słownictwo (`w-01`…) i hasła/powiedzonka (`s-01`…). Zgodność z `cards.ts` pilnuje test. */
export const WORD_COUNT = 64;
export const SLOGAN_COUNT = 24;
const pad = (n: number) => String(n).padStart(2, "0");
export const wordIds = (): string[] => Array.from({ length: WORD_COUNT }, (_, i) => `w-${pad(i + 1)}`);
export const sloganIds = (): string[] => Array.from({ length: SLOGAN_COUNT }, (_, i) => `s-${pad(i + 1)}`);
