/** Testy Lab: wzory, walidacja zakresów i instrukcje (docs/ZRODLA-LAB.md). */
const G = 9.81;

/** Wysokość skoku (cm) z czasu lotu (s): h = g·t²/8. */
export function jumpHeightFromFlightTime(seconds: number): number {
  return ((G * seconds * seconds) / 8) * 100;
}

export interface LabTest {
  key: "cmj" | "broad-jump" | "sprint";
  title: string;
  unit: string;
  instructions: string[];
  /** Maksymalnie jedna linijka o ograniczeniach metody. */
  caveat?: string;
  /** Jawne ograniczenia pomiaru z nagrania (pokazywane przy wyniku); brak dla testów wpisywanych ręcznie. */
  limits?: string[];
}

/** Opis pochodzenia wyniku (nie nazywamy oszacowania z nagrania „pomiarem”). */
export const METHOD_LABEL: Record<"video_estimate" | "manual_entry", string> = {
  video_estimate: "oszacowanie z nagrania – nie jest to walidowany pomiar",
  manual_entry: "wpisane ręcznie",
};

/** Wspólna uwaga o badaniach innych aplikacji: nie przenosimy ich wyników na algorytm tej aplikacji. */
export const VALIDATION_NOTE = "Badania innych aplikacji (np. My Jump 2, MySprint) opisują ich własne metody i sprzęt. Nie oznaczają, że wynik z tej aplikacji ma taką samą dokładność – ten algorytm nie został u nas zwalidowany względem płyty siłowej ani fotokomórek.";

export const LAB_TESTS: LabTest[] = [
  {
    key: "cmj",
    title: "CMJ – skok z wymachem",
    unit: "cm",
    instructions: [
      "Telefon pionowo, 2–3 m z boku, na wysokości bioder. Cała sylwetka w kadrze.",
      "Ręce na biodrach, szybki przysiad i wyskok. Ląduj na prostych nogach.",
      "3 próby, zapisz najlepszą.",
    ],
    caveat: "Wynik z czasu lotu nie zależy od odległości telefonu.",
    limits: [
      "To oszacowanie z nagrania (czas lotu → wysokość), a nie walidowany pomiar.",
      "Dokładność zależy od liczby klatek na sekundę (jedna klatka to kilka ms, czyli około centymetra lub więcej), kadru, oświetlenia i wykrycia stóp.",
      "Automatyczne wykrycie odbicia i lądowania bywa błędne – sprawdź klatki i popraw ręcznie. Zmiana techniki lądowania (np. ugięte nogi) zawyża wynik.",
    ],
  },
  {
    key: "broad-jump",
    title: "Skok w dal z miejsca",
    unit: "cm",
    instructions: [
      "Telefon poziomo, nieruchomo (oparty lub na statywie), 4–5 m od toru, prostopadle do kierunku skoku, na wysokości bioder. Cała sylwetka i miejsce lądowania w kadrze.",
      "Stań na linii i nie ruszaj się 2 s, potem skocz obunóż z wymachem rąk. Po lądowaniu zostań w miejscu 2 s.",
      "W nagraniu zaznaczysz czubek głowy, podłoże, linię palców przed skokiem i tył pięty po lądowaniu. Skala liczy się z Twojego wzrostu, więc odległość od telefonu nie ma znaczenia.",
      "2–3 próby, zapisz najlepszą.",
    ],
    caveat: "Wynik zależy od zaznaczenia punktów na klatce; w razie wątpliwości zmierz taśmą i wpisz ręcznie.",
    limits: [
      "To oszacowanie z nagrania (skala z Twojego wzrostu), a nie walidowany pomiar taśmą.",
      "Dokładność zależy od rozdzielczości (zawodnik jak największy w kadrze), nieruchomego telefonu, ustawienia prostopadle do skoku i dokładnego zaznaczenia punktów na klatkach; skok w stronę kamery lub od niej zawyża albo zaniża wynik, a brzegi kadru są zniekształcone przez obiektyw.",
      "Wzrost podaj bez obuwia i zmierz podczas stania prosto; błąd wzrostu przenosi się wprost na wynik.",
    ],
  },
  {
    key: "sprint",
    title: "Sprint 10 / 20 / 30 m",
    unit: "s",
    instructions: [
      "Telefon poziomo, z boku toru, prostopadle do biegu.",
      "Start z miejsca po odliczaniu.",
      "2–3 próby, przerwa 3–5 min.",
    ],
    caveat: "Jedna klatka przy 60 kl./s to ok. 17 ms.",
    limits: [
      "Czasy odczytane z klatek filmu to oszacowanie, a nie pomiar fotokomórkami.",
      "Wynik zależy od klatek na sekundę, ustawienia telefonu prostopadle do toru i tego, którą klatkę uznasz za start i metę; na odcinkach 10 m różnica jednej klatki jest wyraźna.",
      "Wyniki porównuj tylko ze sobą, przy tym samym sprzęcie i ustawieniu kamery.",
    ],
  },
];

export interface LabResult { key: string; value: number }

/** Realistyczne zakresy do wykrycia literówek. */
export function validateLab(key: string, v: number): string | null {
  const ranges: Record<string, [number, number, string]> = {
    cmj: [5, 90, "CMJ: 5–90 cm"],
    "broad-jump": [100, 350, "Skok w dal: 100–350 cm"],
    "sprint-10": [1.3, 3.0, "Sprint 10 m: 1,3–3,0 s"],
    "sprint-20": [2.4, 4.5, "Sprint 20 m: 2,4–4,5 s"],
    "sprint-30": [3.4, 6.0, "Sprint 30 m: 3,4–6,0 s"],
  };
  const r = ranges[key];
  if (!r) return "Nieznany test";
  return v >= r[0] && v <= r[1] ? null : `Wartość poza zakresem (${r[2]})`;
}

/** Splity sprintu muszą rosnąć: 10 < 20 < 30. */
export function validateSprintSplits(t10?: number, t20?: number, t30?: number): string | null {
  if (t10 && t20 && t20 <= t10) return "Czas na 20 m musi być dłuższy niż na 10 m.";
  if (t20 && t30 && t30 <= t20) return "Czas na 30 m musi być dłuższy niż na 20 m.";
  if (t10 && t30 && !t20 && t30 <= t10) return "Czas na 30 m musi być dłuższy niż na 10 m.";
  return null;
}

/** Test do powtórzenia po 5 tygodniach (koniec cyklu mezocyklu). */
export function labDue(lastISO: string | undefined, todayISO: string, days = 35): boolean {
  if (!lastISO) return true;
  return (Date.parse(todayISO) - Date.parse(lastISO)) / 86_400_000 >= days;
}
