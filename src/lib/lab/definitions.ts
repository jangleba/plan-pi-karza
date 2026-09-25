import type { LabTestDefinition, LabTestId } from "./types";

export const LAB_PROTOCOL_VERSION = "ballwise-lab-1.0";
export const REQUIRED_CAPTURE_FPS = 240;
export const MIN_ACCEPTED_CAPTURE_FPS = 239;

export const LAB_TESTS: readonly LabTestDefinition[] = [
  {
    id: "cmj",
    category: "jump",
    title: "CMJ",
    shortDescription: "Wysokość skoku",
    setup: [
      "Ustaw telefon stabilnie, bokiem do zawodnika, na wysokości około 1 m.",
      "Całe stopy i przestrzeń nad głową muszą być widoczne.",
      "Dłonie trzymaj na biodrach. Wykonaj naturalny zamach w dół i skocz maksymalnie wysoko.",
      "Ląduj w tym samym miejscu, z nogami w podobnym ustawieniu jak przy odbiciu.",
    ],
    markers: [
      {
        key: "takeoff",
        label: "Odbicie",
        instruction: "Pierwsza klatka, na której obie stopy nie dotykają podłoża.",
      },
      {
        key: "landing",
        label: "Lądowanie",
        instruction: "Pierwsza klatka ponownego kontaktu stopy z podłożem.",
      },
    ],
    guideAxis: "horizontal",
    guideMode: "shared",
    trialsPerSide: 3,
    sides: [null],
    maxCaptureSeconds: 8,
  },
  {
    id: "single_leg_cmj",
    category: "jump",
    title: "Skok jednonóż",
    shortDescription: "Lewa vs prawa",
    setup: [
      "Ustaw telefon jak w CMJ — bokiem, stabilnie i z widoczną stopą podporową.",
      "Dłonie trzymaj na biodrach. Skacz i ląduj na tej samej nodze.",
      "Nie podciągaj nogi podporowej w locie i nie ląduj na drugiej nodze.",
      "Wykonaj trzy poprawne próby na każdą stronę.",
    ],
    markers: [
      {
        key: "takeoff",
        label: "Odbicie",
        instruction: "Pierwsza klatka bez kontaktu stopy podporowej z podłożem.",
      },
      {
        key: "landing",
        label: "Lądowanie",
        instruction: "Pierwsza klatka ponownego kontaktu tej samej stopy.",
      },
    ],
    guideAxis: "horizontal",
    guideMode: "shared",
    trialsPerSide: 3,
    sides: ["left", "right"],
    maxCaptureSeconds: 8,
  },
  {
    id: "sprint_10m",
    category: "speed",
    title: "Sprint 10 m",
    shortDescription: "Start i przyspieszenie",
    setup: [
      "Odmierz dokładnie 10 m i oznacz start oraz metę wysokimi pachołkami.",
      "Telefon ustaw bokiem do toru, tak aby start i meta były widoczne w jednym kadrze.",
      "Kamera powinna być nieruchoma i możliwie daleko od toru, bez cyfrowego zoomu.",
      "Startuj samodzielnie. Wynik liczymy od pierwszego ruchu do przecięcia mety tułowiem.",
    ],
    markers: [
      {
        key: "start",
        label: "Start",
        instruction: "Pierwsza klatka widocznego ruchu rozpoczynającego sprint.",
      },
      {
        key: "finish",
        label: "Meta",
        instruction: "Pierwsza klatka, gdy środek tułowia przecina linię 10 m.",
      },
    ],
    guideAxis: "vertical",
    guideMode: "separate",
    trialsPerSide: 2,
    sides: [null],
    maxCaptureSeconds: 10,
    distanceMeters: 10,
  },
  {
    id: "flying_10m",
    category: "speed",
    title: "Flying 10 m",
    shortDescription: "Prędkość maksymalna",
    setup: [
      "Wyznacz strefę rozpędzania 20 m oraz odcinek pomiarowy 10 m.",
      "Obie linie odcinka pomiarowego muszą być dobrze widoczne.",
      "Telefon ustaw bokiem, nieruchomo, możliwie daleko od środka odcinka.",
      "Przebiegnij przez cały odcinek bez zwalniania za linią końcową.",
    ],
    markers: [
      {
        key: "entry",
        label: "Wejście",
        instruction: "Pierwsza klatka, gdy środek tułowia przecina linię wejściową.",
      },
      {
        key: "exit",
        label: "Wyjście",
        instruction: "Pierwsza klatka, gdy środek tułowia przecina linię końcową.",
      },
    ],
    guideAxis: "vertical",
    guideMode: "separate",
    trialsPerSide: 2,
    sides: [null],
    maxCaptureSeconds: 15,
    distanceMeters: 10,
  },
  {
    id: "cod_505",
    category: "change",
    title: "505",
    shortDescription: "Lewa vs prawa",
    setup: [
      "Ustaw linię pomiarową i linię nawrotu dokładnie 5 m dalej.",
      "Zostaw co najmniej 10 m na rozpęd przed linią pomiarową.",
      "Telefon ustaw bokiem do linii pomiarowej — liczymy jej dwa przecięcia.",
      "Na linii nawrotu postaw wyraźnie wskazaną stopę, obróć się i wróć przez linię pomiarową.",
    ],
    markers: [
      {
        key: "entry",
        label: "Wejście",
        instruction: "Pierwsze przecięcie linii pomiarowej środkiem tułowia.",
      },
      {
        key: "exit",
        label: "Powrót",
        instruction: "Drugie przecięcie tej samej linii po nawrocie.",
      },
    ],
    guideAxis: "vertical",
    guideMode: "shared",
    trialsPerSide: 2,
    sides: ["left", "right"],
    maxCaptureSeconds: 15,
  },
  {
    id: "sprint_10m_ball",
    category: "ball",
    title: "Sprint 10 m z piłką",
    shortDescription: "Różnica względem sprintu",
    setup: [
      "Użyj dokładnie tego samego odcinka i ustawienia telefonu co w sprincie 10 m.",
      "Piłka musi rozpocząć za linią startu i przekroczyć metę pod kontrolą zawodnika.",
      "Nie zmieniaj nawierzchni ani obuwia względem testu bez piłki.",
      "Wynik porównujemy z ostatnim prawidłowym sprintem 10 m bez piłki.",
    ],
    markers: [
      {
        key: "start",
        label: "Start",
        instruction: "Pierwsza klatka ruchu zawodnika lub piłki — wcześniejszy z tych momentów.",
      },
      {
        key: "finish",
        label: "Meta",
        instruction: "Pierwsza klatka przecięcia mety środkiem tułowia z piłką pod kontrolą.",
      },
    ],
    guideAxis: "vertical",
    guideMode: "separate",
    trialsPerSide: 2,
    sides: [null],
    maxCaptureSeconds: 12,
    distanceMeters: 10,
  },
] as const;

export function getLabTest(id: LabTestId): LabTestDefinition {
  const test = LAB_TESTS.find((item) => item.id === id);
  if (!test) throw new Error(`Nieznany test BallWise Lab: ${id}`);
  return test;
}
