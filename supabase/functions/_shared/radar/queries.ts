/**
 * Cykliczne wyszukiwanie: plan zapytań zależny od BIEŻĄCEJ daty (żaden rok nie jest wpisany na stałe),
 * rotacja po pełnej liście i budżet. Zapytania zawierają wyłącznie ogólne hasła i regiony –
 * nigdy danych zawodników.
 */
export const BASE_TERMS = ["otwarte testy piłkarskie", "nabór do klubu piłka nożna", "trening otwarty piłka nożna", "testy bramkarskie"] as const;

export const REGIONS = [
  "dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "łódzkie", "małopolskie", "mazowieckie", "opolskie",
  "podkarpackie", "podlaskie", "pomorskie", "śląskie", "świętokrzyskie", "warmińsko-mazurskie", "wielkopolskie", "zachodniopomorskie",
] as const;

export const BIG_CITIES = [
  "Warszawa", "Kraków", "Wrocław", "Łódź", "Poznań", "Gdańsk", "Szczecin", "Lublin", "Bydgoszcz", "Białystok", "Katowice", "Rzeszów",
] as const;

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

/** Okresy zapytań z bieżącej daty: miesiąc i rok, kolejny miesiąc, sezon, runda (jesienna/wiosenna). Nic na stałe. */
export function searchPeriods(now: Date): string[] {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  const seasonStart = m >= 6 ? y : y - 1;
  const round = m >= 6 && m <= 11 ? `runda jesienna ${y}` : `runda wiosenna ${m <= 5 ? y : y + 1}`;
  return [
    `${MONTHS[m]} ${y}`,
    `${MONTHS[next.getUTCMonth()]} ${next.getUTCFullYear()}`,
    `sezon ${seasonStart}/${seasonStart + 1}`,
    round,
  ];
}

export interface PlannedQuery { q: string; term: string; area: string; period: string }

/** Pełna lista kombinacji (hasło × obszar × okres) w stałej, powtarzalnej kolejności. */
export function allQueries(now: Date): PlannedQuery[] {
  const periods = searchPeriods(now);
  const areas = [...REGIONS.map((r) => `województwo ${r}`), ...BIG_CITIES];
  const out: PlannedQuery[] = [];
  for (const period of periods) for (const area of areas) for (const term of BASE_TERMS) out.push({ q: `${term} ${area} ${period}`, term, area, period });
  return out;
}

/**
 * Zapytania na jedno uruchomienie: kolejne okno o szerokości `budget` z pełnej listy, przesuwane o numer uruchomienia
 * (jedno uruchomienie co 12 h → `runIndex` = dzień roku × 2 + połowa doby). Po pełnym obiegu zaczyna od początku.
 */
export function queriesForRun(now: Date, budget: number): PlannedQuery[] {
  const all = allQueries(now);
  if (budget <= 0 || !all.length) return [];
  const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
  const runIndex = dayOfYear * 2 + (now.getUTCHours() >= 12 ? 1 : 0);
  const start = (runIndex * budget) % all.length;
  return Array.from({ length: Math.min(budget, all.length) }, (_, i) => all[(start + i) % all.length]!);
}
