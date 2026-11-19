/** Testy Lab: wzory, walidacja zakresów i instrukcje (docs/ZRODLA-LAB.md). */
const G = 9.81;

/** Wysokość skoku (cm) z czasu lotu (s): h = g·t²/8. */
export function jumpHeightFromFlightTime(seconds: number): number {
  return ((G * seconds * seconds) / 8) * 100;
}

export interface LabTest {
  key: "cmj" | "broad-jump" | "sprint" | "yoyo-ir1";
  title: string;
  unit: string;
  instructions: string[];
  /** Maksymalnie jedna linijka o ograniczeniach metody. */
  caveat?: string;
}

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
    caveat: "Metoda czasu lotu jest zgodna z płytą dynamometryczną w badaniach; moc szczytowa z aplikacji jest mniej wiarygodna.",
  },
  {
    key: "broad-jump",
    title: "Skok w dal z miejsca",
    unit: "cm",
    instructions: [
      "Stopy za linią, wymach rąk, skok obunóż.",
      "Mierz od linii do pięty bliższej linii.",
      "2–3 próby, zapisz najlepszą.",
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
  },
  {
    key: "yoyo-ir1",
    title: "Yo-Yo IR1 – wydolność",
    unit: "m",
    instructions: [
      "Odcinki 20 m tam i z powrotem (40 m), po każdym 10 s aktywnej przerwy.",
      "Rytm z oficjalnej ścieżki dźwiękowej, start 10 km/h; test kończysz po dwóch spóźnieniach.",
      "Zapisz łączny dystans w metrach.",
    ],
    caveat: "Tabele prędkości w źródłach się różnią – użyj oficjalnej ścieżki dźwiękowej. MAS z biegu 5 min jest osobno na ekranie Plan.",
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
    "yoyo-ir1": [40, 3000, "Yo-Yo IR1: 40–3000 m"],
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
