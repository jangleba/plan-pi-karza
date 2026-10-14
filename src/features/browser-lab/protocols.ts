export const BROWSER_LAB_PROTOCOL = "ballwise-browser-lab-1.0";
export const TEST_IDS = [
  "cmj",
  "single_leg_cmj",
  "sprint_10m",
  "standing_long_jump",
  "cod_505",
] as const;
export type BrowserTestId = (typeof TEST_IDS)[number];
export type StoredTestId = BrowserTestId | "flying_10m";
export const CALIBRATED_LAB_PROTOCOL = "ballwise-browser-lab-1.1";
export const AUTOMATED_LAB_PROTOCOL = "ballwise-browser-lab-1.2";
export type TestSide = "left" | "right" | null;

export interface BrowserProtocol {
  id: StoredTestId;
  title: string;
  subtitle: string;
  category: "jump" | "speed" | "change";
  sides: readonly TestSide[];
  trials: number;
  restSeconds: number;
  markers: readonly [string, string];
  instructions: readonly [string, string];
  setup: readonly string[];
  confirmation: string;
  guideAxis: "horizontal" | "vertical";
  sharedGuide: boolean;
  distanceMeters?: number;
  minimumSeconds: number;
  maximumSeconds: number;
}

export const PROTOCOLS: readonly BrowserProtocol[] = [
  {
    id: "cmj",
    title: "CMJ",
    subtitle: "Wysokość skoku z miejsca",
    category: "jump",
    sides: [null],
    trials: 3,
    restSeconds: 60,
    markers: ["Wybicie", "Lądowanie"],
    instructions: [
      "Pierwsza klatka, na której obie stopy są nad podłożem. W poprzedniej jest jeszcze kontakt.",
      "Pierwsza klatka ponownego kontaktu stopy z podłożem. Poprzednia pokazuje lot.",
    ],
    setup: [
      "Telefon nieruchomo z boku, blisko poziomu podłoża. Obie stopy i całe ciało widoczne, dobre światło.",
      "Dłonie na biodrach. Naturalne zejście w dół i skok bez podciągania nóg w locie.",
      "Lądowanie w tym samym miejscu. Ustawienie nóg przy wybiciu i pierwszym kontakcie powinno być podobne.",
    ],
    confirmation:
      "Obie stopy są widoczne. Nie podciągam nóg w locie, a pozycja nóg przy wybiciu i pierwszym kontakcie jest podobna.",
    guideAxis: "horizontal",
    sharedGuide: true,
    minimumSeconds: 0.15,
    maximumSeconds: 1.1,
  },
  {
    id: "single_leg_cmj",
    title: "Skok jednonóż",
    subtitle: "Lewa i prawa noga",
    category: "jump",
    sides: ["left", "right"],
    trials: 3,
    restSeconds: 60,
    markers: ["Wybicie", "Lądowanie"],
    instructions: [
      "Pierwsza klatka bez kontaktu stopy podporowej z podłożem. Sprawdź klatkę poprzednią.",
      "Pierwsza klatka kontaktu tej samej stopy po skoku. Sprawdź klatkę poprzednią.",
    ],
    setup: [
      "Ustaw telefon jak dla CMJ. Stopa podporowa musi być wyraźnie widoczna.",
      "Ręce na biodrach. Skok i lądowanie na tej samej nodze, bez podciągania jej w locie.",
      "Wybierz nogę, którą wykonujesz próbę. Zrób trzy poprawne próby na każdą nogę.",
    ],
    confirmation:
      "Skok i lądowanie wykonuję na wybranej nodze. Stopa jest widoczna, bez podciągania nogi w locie i zmiany ustawienia przy pierwszym kontakcie.",
    guideAxis: "horizontal",
    sharedGuide: true,
    minimumSeconds: 0.15,
    maximumSeconds: 1.1,
  },
  {
    id: "sprint_10m",
    title: "Sprint 10 m",
    subtitle: "Czas od pierwszego ruchu",
    category: "speed",
    sides: [null],
    trials: 2,
    restSeconds: 180,
    markers: ["Pierwszy ruch", "Meta 10 m"],
    instructions: [
      "Pierwsza klatka widocznego ruchu tułowia rozpoczynającego bieg. Nie sygnał startowy ani samo poruszenie dłoni.",
      "Pierwsza klatka, gdy środek tułowia przecina linię 10 m. W poprzedniej jest jeszcze przed nią.",
    ],
    setup: [
      "Odmierz taśmą dokładnie 10 m i oznacz obie linie wysokimi pachołkami.",
      "Telefon nieruchomo, bokiem do toru. Start i meta widoczne w jednym kadrze. Unikaj ukośnego ujęcia.",
      "Start samodzielny, z tej samej pozycji w każdej próbie. Biegnij przez metę, nie do mety.",
    ],
    confirmation:
      "Odcinek ma zmierzone 10 m. Telefon jest nieruchomy, obie linie i tułów widoczne. Wynik liczę od ruchu, bez czasu reakcji.",
    guideAxis: "vertical",
    sharedGuide: false,
    distanceMeters: 10,
    minimumSeconds: 0.6,
    maximumSeconds: 15,
  },
  {
    id: "standing_long_jump",
    title: "Skok w dal",
    subtitle: "Automatyczny pomiar z kontrolą jakości",
    category: "jump",
    sides: [null],
    trials: 2,
    restSeconds: 90,
    markers: ["Przed odbiciem", "Lądowanie"],
    instructions: [
      "Automatyka wybiera pozycję przed odbiciem i długą krawędź wzorca ustawioną przy palcach.",
      "Automatyka wybiera stabilne lądowanie i bliższą piętę. Punkt możesz poprawić jednym dotknięciem.",
    ],
    setup: [
      "Wydrukuj dwa wzorce w skali 100%: niebieski START i pomarańczowy 3 METRY. Sprawdź, czy długa krawędź każdego ma 20,0 cm.",
      "START połóż za linią odbicia, długą krawędzią równo z palcami. Krzyżyk drugiego arkusza ustaw taśmą dokładnie 3,00 m od tej linii.",
      "Telefon ustaw nieruchomo z boku. Oba wzorce, całe ciało i lądowanie muszą pozostać widoczne. Nie dotykaj telefonu podczas próby.",
      "Skocz obunóż i zatrzymaj lądowanie na chwilę, bez cofnięcia stóp ani podparcia ręką za piętą.",
    ],
    confirmation:
      "Odległość od linii START do krzyżyka wynosi 3,00 m, oba wzorce i pięta leżą na jednym płaskim podłożu, kamera jest nieruchoma, a punkt oznacza bliższą piętę.",
    guideAxis: "horizontal",
    sharedGuide: true,
    minimumSeconds: 0.1,
    maximumSeconds: 5,
  },
  {
    id: "cod_505",
    title: "505",
    subtitle: "Nawrót na lewej i prawej nodze",
    category: "change",
    sides: ["left", "right"],
    trials: 2,
    restSeconds: 180,
    markers: ["Wejście", "Powrót"],
    instructions: [
      "Pierwsze przecięcie linii pomiarowej środkiem tułowia, w kierunku nawrotu.",
      "Drugie przecięcie tej samej linii tym samym punktem tułowia, po wykonaniu nawrotu.",
    ],
    setup: [
      "Odmierz 5 m między linią pomiarową a linią nawrotu oraz 10 m od startu rozbiegu do linii pomiarowej.",
      "Telefon nieruchomo, bokiem do linii pomiarowej. Film musi pokazywać oba przecięcia i kontakt stopy na linii nawrotu.",
      "Wybierz nogę STAWNĄ w nawrocie. Postaw tę stopę na linii nawrotu i wróć przez linię pomiarową.",
    ],
    confirmation:
      "Odmierzono 10 m rozbiegu i 5 m do nawrotu. W nawrocie wybrana stopa osiąga linię. Oznaczam dwa przecięcia tej samej linii tym samym punktem tułowia.",
    guideAxis: "vertical",
    sharedGuide: true,
    minimumSeconds: 1,
    maximumSeconds: 15,
  },
] as const;

const ARCHIVED_FLYING: BrowserProtocol = {
  id: "flying_10m",
  title: "Flying 10 m · archiwum",
  subtitle: "Czas i średnia prędkość odcinka",
  category: "speed",
  sides: [null],
  trials: 2,
  restSeconds: 180,
  markers: ["Wejście", "Wyjście"],
  instructions: [
    "Pierwsza klatka, gdy środek tułowia przecina linię wejścia. Sprawdź klatkę poprzednią.",
    "Pierwsza klatka, gdy ten sam punkt tułowia przecina linię końcową. Sprawdź klatkę poprzednią.",
  ],
  setup: [
    "Wyznacz 20 m rozpędzania i dokładnie 10 m odcinka pomiarowego. Odległość zmierz taśmą.",
    "Telefon nieruchomo, daleko i bokiem do środka odcinka. Obie linie muszą być dobrze widoczne.",
    "Przebiegnij cały odcinek bez zwalniania. Na obu liniach oznaczaj ten sam punkt tułowia.",
  ],
  confirmation:
    "Odcinek ma zmierzone 10 m, linie są widoczne, kamera nieruchoma. Na obu liniach oznaczam ten sam punkt tułowia.",
  guideAxis: "vertical",
  sharedGuide: false,
  distanceMeters: 10,
  minimumSeconds: 0.5,
  maximumSeconds: 10,
};

export function protocolFor(id: StoredTestId) {
  if (id === "flying_10m") return ARCHIVED_FLYING;
  const protocol = PROTOCOLS.find((test) => test.id === id);
  if (!protocol) throw new Error("Nieznany test Lab.");
  return protocol;
}

export const sideLabel = (side: TestSide) =>
  side === "left" ? "Lewa" : side === "right" ? "Prawa" : "Obunóż";
export interface BrowserAttempt {
  testId: BrowserTestId;
  side: TestSide;
  trial: number;
  trials: number;
}
export function attemptPlan(ids: readonly BrowserTestId[]): BrowserAttempt[] {
  return ids.flatMap((id) => {
    const protocol = protocolFor(id);
    return Array.from({ length: protocol.trials }, (_, i) =>
      protocol.sides.map((side) => ({ testId: id, side, trial: i + 1, trials: protocol.trials })),
    ).flat();
  });
}
