import type { VisionTest } from "./types";

/**
 * Biblioteka testów Vision Lab — świadomie ograniczona do najważniejszych,
 * praktycznych testów piłkarskich. To jedyne źródło prawdy o testach.
 *
 * Uwaga: `analyze_gym_exercise` NIE jest klasycznym testem z pomiarem —
 * to wejście do analizy techniki ćwiczeń z aktualnego planu siłowego.
 * Ma osobny flow (patrz trasy /vision-lab/gym).
 */
export const VISION_TESTS: VisionTest[] = [
  // ---------------- JUMP LAB ----------------
  {
    id: "cmj",
    name: "CMJ",
    category: "jump",
    difficulty: "beginner",
    cameraView: "side",
    minimumFps: 60,
    recommendedFps: 120,
    attempts: 3,
    restSeconds: 60,
    goal: "Ocena mocy dolnej części ciała w wyskoku dosiężnym.",
    whatItMeasures:
      "Wysokość wyskoku, czas w powietrzu i stabilność lądowania.",
    setupInstructions: [
      "Ustaw kamerę z boku na wysokości bioder, 3–4 m od zawodnika.",
      "Cała sylwetka i stopy muszą być w kadrze.",
      "Dobre, równomierne oświetlenie bez cieni na podłożu.",
    ],
    validRules: [
      "Widoczne obie stopy przez cały wyskok.",
      "Ręce na biodrach lub swobodny zamach — zgodnie z wariantem.",
      "Brak podbiegu, odbicie z miejsca.",
    ],
    measuredMetrics: ["Wysokość wyskoku", "Czas w powietrzu", "Stabilność lądowania"],
  },
  {
    id: "squat_jump",
    name: "Squat Jump",
    category: "jump",
    difficulty: "beginner",
    cameraView: "side",
    minimumFps: 60,
    recommendedFps: 120,
    attempts: 3,
    restSeconds: 60,
    goal: "Ocena mocy koncentrycznej bez wykorzystania cyklu rozciągnięcie-skurcz.",
    whatItMeasures: "Wysokość wyskoku i czas w powietrzu ze startu z przysiadu.",
    setupInstructions: [
      "Ustaw kamerę z boku na wysokości bioder, 3–4 m od zawodnika.",
      "Cała sylwetka i stopy muszą być w kadrze.",
      "Zatrzymaj się w przysiadzie na ~2 s przed wybiciem.",
    ],
    validRules: [
      "Start z zatrzymania w przysiadzie.",
      "Brak dynamicznego zejścia (countermovement) przed wybiciem.",
      "Widoczne obie stopy przez cały wyskok.",
    ],
    measuredMetrics: ["Wysokość wyskoku", "Czas w powietrzu"],
  },
  {
    id: "drop_jump",
    name: "Drop Jump",
    category: "jump",
    difficulty: "advanced",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 2,
    restSeconds: 120,
    goal: "Ocena reaktywności i sztywności po zejściu ze skrzyni.",
    whatItMeasures: "Czas kontaktu, czas w powietrzu, wysokość odbicia i RSI.",
    setupInstructions: [
      "Ustaw skrzynię o wybranej wysokości w kadrze.",
      "Kamera z boku, wysoki FPS (120–240).",
      "Widoczne stopy i moment pierwszego kontaktu.",
    ],
    validRules: [
      "Zejście ze skrzyni (nie wyskok w górę).",
      "Krótki kontakt z podłożem i natychmiastowe odbicie.",
      "Widoczne obie stopy przez cały ruch.",
    ],
    measuredMetrics: ["Czas kontaktu", "Czas w powietrzu", "Wysokość odbicia", "RSI"],
  },
  {
    id: "repeated_jumps",
    name: "Repeated Jumps",
    category: "jump",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 2,
    restSeconds: 120,
    goal: "Ocena wytrzymałości reaktywnej w serii kolejnych odbić.",
    whatItMeasures: "Wynik każdego cyklu, średnią, najlepszy cykl i zmienność serii.",
    setupInstructions: [
      "Kamera z boku, wysoki FPS (120–240).",
      "Widoczne stopy i kontakt z podłożem przez całą serię.",
      "Wykonaj jedną pełną, ciągłą serię odbić.",
    ],
    validRules: [
      "Jedna pełna seria wymaganej liczby cykli.",
      "Ciągłe odbicia bez zatrzymania.",
      "Widoczne obie stopy przez całą serię.",
    ],
    measuredMetrics: ["Liczba cykli", "Średni czas lotu", "Najlepszy cykl", "Zmienność serii"],
  },
  {
    id: "broad_jump",
    name: "Broad Jump",
    category: "jump",
    difficulty: "beginner",
    cameraView: "side",
    minimumFps: 60,
    recommendedFps: 120,
    attempts: 3,
    restSeconds: 60,
    goal: "Ocena mocy poziomej i eksplozywności odbicia w dal.",
    whatItMeasures: "Długość skoku, kąt odbicia i kontrola lądowania.",
    setupInstructions: [
      "Kamera z boku, prostopadle do linii skoku.",
      "Widoczna linia startu i pełna strefa lądowania.",
      "Zaznacz linię startu taśmą.",
    ],
    validRules: [
      "Odbicie z obu nóg z miejsca.",
      "Widoczna linia startu i miejsce lądowania.",
      "Lądowanie utrzymane bez cofnięcia stopy.",
    ],
    measuredMetrics: ["Długość skoku", "Kąt odbicia", "Kontrola lądowania"],
  },
  {
    id: "single_leg_hop",
    name: "Single Leg Hop",
    category: "jump",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 60,
    recommendedFps: 120,
    attempts: 3,
    restSeconds: 60,
    goal: "Ocena mocy jednonóż i asymetrii lewa/prawa w skoku w dal.",
    whatItMeasures: "Długość hopa na każdą nogę, najlepszy wynik strony i asymetrię L/P.",
    setupInstructions: [
      "Kamera z boku, prostopadle do linii skoku.",
      "Widoczna linia wybicia i pełna strefa lądowania.",
      "Skalibruj podłoże na tym filmie (min. 4 punkty + linia wybicia).",
    ],
    validRules: [
      "Wybicie i lądowanie na tej samej nodze.",
      "Stabilne lądowanie bez cofnięcia stopy.",
      "Osobne serie dla lewej i prawej nogi (2 prawidłowe próby na stronę).",
    ],
    measuredMetrics: ["Długość hopa", "Najlepszy wynik strony", "Asymetria L/P"],
  },
  {
    id: "pogo_jumps",
    name: "Pogo Jumps",
    category: "jump",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 2,
    restSeconds: 90,
    goal: "Ocena sztywności ścięgnistej i reaktywności podłoża.",
    whatItMeasures: "Czas kontaktu, wysokość, indeks reaktywnej siły (RSI).",
    setupInstructions: [
      "Kamera z boku, wysoki FPS (120–240).",
      "Widoczne stopy i kontakt z podłożem.",
      "Sztywne kostki, minimalne zgięcie kolan.",
    ],
    validRules: [
      "Serie ciągłych odbić bez zatrzymania.",
      "Widoczny wyraźny kontakt z podłożem.",
      "Minimalne uginanie kolan.",
    ],
    measuredMetrics: ["Czas kontaktu", "Wysokość", "RSI"],
  },

  // ---------------- SPRINT LAB ----------------
  {
    id: "sprint_20m",
    name: "Sprint 20 m",
    category: "sprint",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 3,
    restSeconds: 180,
    goal: "Ocena przyspieszenia i przejścia do prędkości maksymalnej.",
    whatItMeasures: "Czas na 20 m, faza przyspieszenia i osiągana prędkość.",
    setupInstructions: [
      "Kamera z boku, obejmująca cały tor lub panning.",
      "Zaznacz linię startu i mety (20 m).",
      "Cała sylwetka widoczna.",
    ],
    validRules: [
      "Widoczna linia startu i mety.",
      "Start z miejsca.",
      "Stabilne nagranie całego dystansu.",
    ],
    measuredMetrics: ["Czas 20 m", "Faza przyspieszenia", "Prędkość maksymalna"],
  },
  {
    id: "sprint_30m",
    name: "Sprint 30 m",
    category: "sprint",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 3,
    restSeconds: 180,
    goal: "Ocena przyspieszenia i prędkości maksymalnej na dystansie 30 m.",
    whatItMeasures: "Czas na 30 m, faza przyspieszenia i prędkość maksymalna.",
    setupInstructions: [
      "Kamera z boku, obejmująca cały tor lub panning.",
      "Zaznacz linię startu i mety (30 m).",
      "Cała sylwetka widoczna przez cały bieg.",
    ],
    validRules: [
      "Widoczna linia startu i mety.",
      "Start z miejsca.",
      "Stabilne nagranie całego dystansu.",
    ],
    measuredMetrics: ["Czas 30 m", "Faza przyspieszenia", "Prędkość maksymalna"],
  },

  // ---------------- COD / BRAKING LAB ----------------
  {
    id: "five_ten_five",
    name: "5-10-5",
    category: "cod",
    difficulty: "intermediate",
    cameraView: "front",
    minimumFps: 60,
    recommendedFps: 120,
    attempts: 3,
    restSeconds: 120,
    goal: "Ocena zmiany kierunku o 180° i zdolności hamowania.",
    whatItMeasures: "Czas całkowity, czas hamowania, symetria zwrotów.",
    setupInstructions: [
      "Trzy linie w odstępie 5 m.",
      "Kamera z przodu obejmująca wszystkie linie.",
      "Widoczne stopy przy każdym zwrocie.",
    ],
    validRules: [
      "Dotknięcie każdej linii ręką.",
      "Widoczne wszystkie trzy linie.",
      "Bez poślizgu poza kadr.",
    ],
    measuredMetrics: ["Czas całkowity", "Czas hamowania", "Symetria zwrotów"],
  },
  {
    id: "sprint_to_stop",
    name: "Sprint to Stop",
    category: "cod",
    difficulty: "intermediate",
    cameraView: "side",
    minimumFps: 120,
    recommendedFps: 240,
    attempts: 3,
    restSeconds: 120,
    goal: "Ocena zdolności do gwałtownego wyhamowania z pełnej prędkości.",
    whatItMeasures: "Dystans hamowania, liczba kroków, kontrola tułowia.",
    setupInstructions: [
      "Rozbieg + strefa hamowania.",
      "Kamera z boku, widoczne stopy.",
      "Zaznacz linię, przy której należy zatrzymać.",
    ],
    validRules: [
      "Pełna prędkość przed hamowaniem.",
      "Widoczny moment zatrzymania.",
      "Stopy w kadrze przez całe hamowanie.",
    ],
    measuredMetrics: ["Dystans hamowania", "Liczba kroków", "Kontrola tułowia"],
  },

  // ---------------- GYM TECHNIQUE ----------------
  {
    id: "analyze_gym_exercise",
    name: "Analyze Gym Exercise",
    category: "technique",
    difficulty: "beginner",
    cameraView: "side",
    minimumFps: 30,
    recommendedFps: 60,
    attempts: 1,
    restSeconds: 0,
    goal: "Analiza techniki ćwiczenia z aktualnego planu siłowego.",
    whatItMeasures:
      "Ocena techniki (frame review / coach review) — bez fałszywego pomiaru AI.",
    setupInstructions: [
      "Kamera z boku, widoczna cała sylwetka.",
      "Stabilne, dobre oświetlenie.",
      "Nagraj kilka pełnych powtórzeń ćwiczenia.",
    ],
    validRules: [
      "Cała sylwetka i stopy w kadrze.",
      "Kontrolowane, wyraźne powtórzenia.",
      "Bez wychodzenia poza kadr.",
    ],
    measuredMetrics: [
      "Pozycja tułowia",
      "Kontrola kolana",
      "Kontrola biodra",
      "Zakres ruchu",
    ],
  },
];

export const GYM_EXERCISE_TEST_ID = "analyze_gym_exercise";

export function getVisionTest(id: string): VisionTest | undefined {
  return VISION_TESTS.find((t) => t.id === id);
}

export function getTestsByCategory(category: string): VisionTest[] {
  return VISION_TESTS.filter((t) => t.category === category);
}
