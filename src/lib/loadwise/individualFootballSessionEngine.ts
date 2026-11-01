import type { ExerciseItem, Profile, SessionDay } from "./types";

/**
 * Solo technique practice. These are technical tasks, not a substitute for
 * representative play with opponents. The dose is a conservative product
 * prescription; the success criterion controls difficulty, never a week number.
 * Skill-learning evidence: https://doi.org/10.3389/fpsyg.2021.772201
 */
export const INDIVIDUAL_FOOTBALL_DRILLS = [
  {
    id: "football_ball_mastery",
    name: "Czucie piłki obiema nogami",
    steps: [
      "Przygotuj piłkę i wolny, równy kwadrat około 2 × 2 m.",
      "Przetaczaj piłkę podeszwą i dotykaj ją wewnętrzną stroną stóp. Pracuj naprzemiennie obiema nogami.",
      "Piłka zostaje w zasięgu jednego kroku. Co kilka kontaktów krótko spójrz przed siebie.",
    ],
    quality: "W ostatnich 10 kontaktach policz utraty kontroli; porównuj wynik przy tej samej prędkości wykonania.",
    mistake: "Przyspieszanie pracy stóp kosztem kontroli piłki.",
  },
  {
    id: "football_self_feed_first_touch",
    name: "Przyjęcie piłki z własnego podania",
    steps: [
      "Ustaw dwie strefy obok siebie w wolnym kwadracie około 2 × 2 m; wystarczą linie podłoża.",
      "Lekko przetocz piłkę od siebie, podejdź i pierwszym kontaktem skieruj ją do wybranej strefy.",
      "Zatrzymaj piłkę kolejnym kontaktem. Po pięciu próbach zmień nogę; porównuj te same odległości.",
    ],
    quality: "Policz udane przyjęcia na 10 prób, po 5 każdą nogą: właściwa strefa i piłka nadal w zasięgu jednego kroku.",
    mistake: "Pierwszy kontakt tak daleko, że trzeba gonić piłkę.",
  },
  {
    id: "football_wall_first_touch",
    name: "Podanie o ścianę i przyjęcie piłki",
    steps: [
      "Wybierz wyłącznie dostępną, bezpieczną ścianę lub odbojnik i wolne miejsce do odbicia. Zacznij blisko.",
      "Podaj piłkę wewnętrzną stroną stopy. Przyjmij wracającą piłkę do boku, w zasięgu kolejnego kroku.",
      "Wróć do pozycji i podaj ponownie. Po pięciu próbach zmień nogę; celność jest ważniejsza od siły.",
    ],
    quality: "Na 10 podań policz celne powroty i kontrolowane przyjęcia osobno dla każdej nogi.",
    mistake: "Zwiększanie siły podania zanim odbicia i przyjęcia są powtarzalne.",
  },
  {
    id: "football_target_pass",
    name: "Celne podanie piłki do strefy",
    steps: [
      "Wybierz bezpieczny cel na podłożu: linię lub strefę. Bez boiska zacznij od 1–2 m, na boisku od 3–5 m.",
      "Ustaw stopę postawną obok piłki i zagraj po ziemi wewnętrzną stroną stopy do celu.",
      "Podejdź spokojnie po piłkę i powtórz. Po pięciu próbach zmień nogę; nie potrzebujesz bramki ani partnera.",
    ],
    quality: "W notatce zapisz trafienia na 10 prób, po 5 każdą nogą, oraz odległość i szerokość celu.",
    mistake: "Zmiana dystansu między próbami, przez co wyników nie da się porównać.",
  },
  {
    id: "football_scan_control",
    name: "Orientacja przed kontaktem z piłką",
    steps: [
      "Wybierz dwa nieruchome punkty przed sobą i sprawdź, czy przestrzeń wokół jest wolna.",
      "Spójrz na wybrany punkt zanim przetoczysz piłkę. Następnie skieruj ją pierwszym kontaktem do odpowiadającej mu strefy.",
      "Wróć do początku i zmieniaj strony oraz nogi. To ćwiczenie orientacji przy piłce; nie symuluje presji przeciwnika.",
    ],
    quality: "Na 10 prób policz kontakt do właściwej strefy po spojrzeniu przed siebie, bez utraty piłki.",
    mistake: "Patrzenie w górę dopiero po wykonaniu kontaktu z piłką.",
  },
  {
    id: "football_turn_control",
    name: "Prowadzenie piłki i kontrolowany obrót",
    steps: [
      "Wyznacz krótki odcinek na równym podłożu: bez boiska 1–2 m, na boisku 3–5 m.",
      "Prowadź piłkę krótkimi kontaktami, zatrzymaj podeszwą i obróć się z nią do drugiej strony.",
      "Wróć spokojnie drugą nogą. Obrót wykonuj płynnie, bez gwałtownego skręcania na zablokowanej stopie.",
    ],
    quality: "Policz kontrolowane obroty na 10 prób; piłka po obrocie pozostaje blisko, a ruch jest bezbolesny.",
    mistake: "Gwałtowny zwrot ciała przy stopie nieruchomo wciśniętej w podłoże.",
  },
  {
    id: "football_gk_distribution",
    name: "Gra nogami bramkarza z piłką",
    steps: [
      "Przygotuj dwie strefy podania i piłkę. Zacznij blisko: 1–2 m bez boiska lub 3–5 m na boisku.",
      "Przetocz piłkę od siebie, podejdź małymi krokami i przyjmij ją do boku w kierunku wybranej strefy.",
      "Zagraj krótkie podanie po ziemi do strefy, podejdź po piłkę i zmień stronę. Po pięciu próbach zmień nogę.",
    ],
    quality: "Na 10 prób policz kontrolowane przyjęcie i celne podanie jako jedną udaną akcję; po 5 prób na nogę.",
    mistake: "Mocne wybicie zamiast kontrolowanego, celnego krótkiego podania.",
  },
  {
    id: "football_easy_contacts",
    name: "Spokojne kontakty z piłką",
    steps: [
      "Zostań na równym, wolnym fragmencie podłoża z piłką blisko stóp.",
      "Powoli przetaczaj piłkę naprzemiennie obiema nogami i stopniowo zwalniaj.",
      "Oddychaj swobodnie. Zakończ pracę, jeśli pojawia się ból lub zawroty głowy.",
    ],
    quality: "Spokojny oddech i pełna kontrola piłki.",
    mistake: "Dodawanie szybkich zrywów na zakończenie technicznej sesji.",
  },
] as const;

type DrillId = (typeof INDIVIDUAL_FOOTBALL_DRILLS)[number]["id"];

function drill(id: DrillId) {
  return INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === id)!;
}

function hasWall(profile: Profile): boolean {
  const wall = /ścian|scian|odbojnik|rebounder|\bwall\b/i;
  return (
    [...profile.equipment, ...(profile.homeEquipment ?? [])].some((value) => wall.test(value)) &&
    !(profile.unavailableEquipmentIds ?? []).some((value) => wall.test(value))
  );
}

function exercise(id: DrillId, prescription: string, cue?: string): ExerciseItem {
  const definition = drill(id);
  return {
    exerciseId: id,
    name: definition.name,
    prescription,
    purpose: definition.quality,
    technique: definition.steps.join(" "),
    instructionSteps: definition.steps.map((description, index) => ({
      title: index === 0 ? "Przygotuj" : index === 1 ? "Wykonaj" : "Sprawdź",
      description,
    })),
    cue: cue ?? definition.quality,
    commonMistake: definition.mistake,
    easier: "Zwolnij, skróć odległość i wróć do prostszego kontaktu. Odpocznij, gdy tracisz kontrolę.",
    harder: "Dopiero po dwóch seriach z co najmniej 8 udanymi próbami na 10 zmień jeden warunek: kierunek albo odległość. Zachowaj liczbę serii.",
  };
}

function timedPractice(id: DrillId, totalSec: number, youngOrNovice: boolean): ExerciseItem {
  const work = youngOrNovice ? 45 : 60;
  const rest = 30;
  // A block includes inter-set rest and time for setup, retrieval and scoring.
  const sets = Math.max(1, Math.min(6, Math.floor((totalSec + rest - 30) / (work + rest))));
  const item = exercise(
    id,
    `${sets} × ${work} s pracy · przerwy ${rest} s · blok ${Math.round(totalSec / 60)} min łącznie`,
  );
  item.displayPrescription = `${sets} × ${work} s · ${rest} s przerwy`;
  item.rest = `${rest} s między seriami; reszta bloku na ustawienie, powrót po piłkę i ocenę celności.`;
  return item;
}

export function buildIndividualFootballSession(
  profile: Profile,
  options: { seed: number; light?: boolean; durationMin?: number; weekIndex?: number },
): {
  title: string;
  sessionType: string;
  durationMin: number;
  intensity: SessionDay["intensity"];
  goalOfSession: string;
  riskManaged: string;
  avoidToday: string;
  sections: SessionDay["sections"];
} {
  const novice = profile.age < 16 || profile.level === "beginner";
  const cautious = profile.goal === "return" || profile.secondaryLimiter === "return" ||
    profile.secondaryLimiter === "fatigue" || profile.seasonPhase === "transition";
  const light = options.light === true || cautious;
  const ceiling = light ? 25 : novice ? 30 : 40;
  const requested = Number.isFinite(options.durationMin) ? options.durationMin! : ceiling;
  const durationMin = Math.max(15, Math.min(ceiling, Math.round(requested)));
  const warmupMin = durationMin <= 25 ? 4 : 5;
  const cooldownMin = 2;
  const blockCount = light ? 2 : 3;
  const mainMin = durationMin - warmupMin - cooldownMin;
  const blockMins = Array.from({ length: blockCount }, (_, index) =>
    Math.floor(mainMin / blockCount) + (index < mainMin % blockCount ? 1 : 0),
  );
  const seed = Math.abs(Math.floor(options.seed));
  const firstTouch: DrillId = hasWall(profile)
    ? "football_wall_first_touch" : "football_self_feed_first_touch";
  const foundation: DrillId = seed % 2 === 0 ? "football_ball_mastery" : firstTouch;
  const positional: Record<Profile["position"], DrillId> = {
    goalkeeper: "football_gk_distribution",
    defender: "football_target_pass",
    midfielder: "football_scan_control",
    forward: "football_turn_control",
  };
  const second = foundation === firstTouch ? "football_ball_mastery" : firstTouch;
  const dose = (id: DrillId, index: number) => timedPractice(id, blockMins[index] * 60, novice);
  const title: Record<Profile["position"], string> = {
    goalkeeper: "Piłka: przyjęcie i gra nogami bramkarza",
    defender: "Piłka: przyjęcie i celne podanie obrońcy",
    midfielder: "Piłka: przyjęcie i orientacja pomocnika",
    forward: "Piłka: kontrola i obrót napastnika",
  };
  return {
    title: title[profile.position],
    sessionType: "Piłka / technika indywidualna",
    durationMin,
    intensity: light || novice ? "niska" : "umiarkowana",
    goalOfSession: "Kontrolowane kontakty obiema nogami, powtarzalne przyjęcie i dokładność w zadaniu dopasowanym do pozycji.",
    riskManaged: "Krótkie serie z odpoczynkiem i oceną jakości. Trening solo rozwija technikę; grę z przeciwnikiem ćwiczysz również na zajęciach piłkarskich.",
    avoidToday: "Kontrola i celność przed intensywnością. Przy bólu lub utracie równowagi przerwij ćwiczenie.",
    sections: {
      warmup: [exercise("football_ball_mastery", `${warmupMin} min spokojnie; stopniowo zwiększaj płynność kontaktów`)],
      main: light
        ? [dose(firstTouch, 0), dose(positional[profile.position], 1)]
        : [dose(foundation, 0), dose(second, 1)],
      accessory: [],
      footballTransfer: light ? [] : [dose(positional[profile.position], 2)],
      cooldown: [exercise("football_easy_contacts", `${cooldownMin} min spokojnych kontaktów i odpoczynku`)],
    },
  };
}
