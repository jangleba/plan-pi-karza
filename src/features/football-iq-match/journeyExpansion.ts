import type { IQRole, JourneyAction, JourneyDefinition, JourneyPattern } from "./journeyTypes";

const routes: Partial<Record<JourneyPattern, JourneyAction[]>> = {
  "switch-air": ["pass", "move", "pass", "move", "carry"],
  "chip-line": ["pass", "move", "pass", "move", "finish"],
  "wide-cross": ["carry", "pass", "move", "finish"],
  "air-control": ["move", "carry", "pass", "move"],
  "third-air": ["move", "pass", "move", "pass", "move"],
  "defend-air": ["cover", "mark", "press", "pass", "move"],
  "wide-return": ["carry", "pass", "move", "pass", "move"],
};
type Topic = readonly [string, JourneyPattern, string];
const topics: Record<IQRole, readonly Topic[]> = {
  gk: [
    [
      "Przerzut ponad pierwszą linią",
      "switch-air",
      "Porównaj krótkie wyjście z dalszym partnerem.",
    ],
    ["Podcięcie nad napastnikiem", "chip-line", "Omiń doskok bez zagrania w krytego partnera."],
    ["Powrót spod bocznej linii", "air-control", "Przyjmij piłkę z boku i znajdź dalsze wyjście."],
    ["Dwa podania po zmianie strony", "third-air", "Po przerzucie ponownie daj linię wsparcia."],
    ["Za wysokim pressingiem", "switch-air", "Sprawdź przestrzeń przy odbiorcy długiego podania."],
    ["Uwolnij dalszego obrońcę", "chip-line", "Dopasuj tor zagrania do doskakującego rywala."],
    ["Zwrotna piłka pod presją", "air-control", "Po przyjęciu zmień kąt i odległość wsparcia."],
    ["Asekuracja długiego zagrania", "defend-air", "Ustaw się między piłką a kierunkiem ataku."],
    [
      "Wyjście z pułapki przy linii",
      "third-air",
      "Wykorzystaj trzeciego zawodnika w wyprowadzeniu.",
    ],
    ["Przenieś grę po doskoku", "switch-air", "Zobacz, kto ma miejsce po drugiej stronie."],
  ],
  cb: [
    ["Diagonal za pierwszą linię", "switch-air", "Przyciągnij rywala i uruchom dalszy sektor."],
    ["Podcięcie do szóstki", "chip-line", "Oceń presję na pomocniku za doskokiem."],
    ["Przyjęcie po przerzucie", "air-control", "Ustaw ciało do następnego zagrania."],
    ["Wyprowadzenie na trzeciego", "third-air", "Po podaniu ponownie otwórz linię wsparcia."],
    ["Obrona zmiany strony", "defend-air", "Przesuń się z piłką i przejmij odbiorcę."],
    [
      "Długi pas do wolnego sektora",
      "switch-air",
      "Porównaj wolny tor i presję w miejscu przyjęcia.",
    ],
    ["Wyjście ponad napastnikiem", "chip-line", "Dobierz wysokość do odległości odbiorcy."],
    ["Powrót po wyjściu z linii", "defend-air", "Osłoń środek przed następnym podaniem."],
    ["Przyjmij i wyprowadź", "air-control", "Zmień kierunek po opanowaniu spadającej piłki."],
    ["Od stopera do wolnej strony", "third-air", "Zmieniaj kąt podania po każdym zagraniu."],
  ],
  fb: [
    [
      "Dośrodkowanie po prowadzeniu",
      "wide-cross",
      "Sprawdź partnera i obrońcę w strefie przyjęcia.",
    ],
    ["Przerzut od bocznej linii", "switch-air", "Rozpoznaj wolną stronę poza naciskiem."],
    ["Podcięcie za skrzydłowego", "chip-line", "Przenieś piłkę ponad doskokiem."],
    ["Przyjęcie przy linii", "air-control", "Zostaw sobie kierunek wyjścia po przyjęciu."],
    ["Obrona dalszego sektora", "defend-air", "Kontroluj rywala po przeciwnej stronie."],
    ["Obieg i ponowne wsparcie", "wide-return", "Po podaniu zmień wysokość i otwórz powrót."],
    ["Boczny obrońca w środku", "third-air", "Połącz ruch do środka z dalszą zmianą strony."],
    ["Dośrodkowanie spod presji", "wide-cross", "Porównaj podanie po ziemi z piłką ponad rywalem."],
    ["Przerzut po przyjęciu", "air-control", "Opanuj piłkę i dopiero wybierz następnego partnera."],
    ["Zamknięcie dalszego skrzydła", "defend-air", "Zachowaj osłonę środka podczas przesunięcia."],
  ],
  six: [
    [
      "Zmiana strony ponad pressingiem",
      "switch-air",
      "Porównaj doskok z miejscem na dalszej stronie.",
    ],
    [
      "Podcięcie między liniami",
      "chip-line",
      "Sprawdź, czy odbiorca ma miejsce po opadnięciu piłki.",
    ],
    [
      "Przyjęcie z obrońcą za plecami",
      "air-control",
      "Znajdź kierunek wyjścia przed następnym zagraniem.",
    ],
    ["Na trzeciego poza pressing", "third-air", "Po odegraniu otwórz kolejny korytarz."],
    [
      "Osłoń środek po przerzucie",
      "defend-air",
      "Przesuwaj się względem piłki i najbliższego odbiorcy.",
    ],
    [
      "Diagonal po wciągnięciu rywala",
      "switch-air",
      "Przenieś grę, gdy nacisk skupia się po jednej stronie.",
    ],
    ["Zwrotna i wyjście z pułapki", "wide-return", "Po podaniu przygotuj następny kąt wsparcia."],
    [
      "Piłka górą z pierwszej linii",
      "air-control",
      "Opanuj spadającą piłkę poza zasięgiem nacisku.",
    ],
    [
      "Podanie ponad wysuniętą szóstką",
      "chip-line",
      "Nie kieruj zagrania w dobrze osłoniętego partnera.",
    ],
    [
      "Trzeci zawodnik w drugim tempie",
      "third-air",
      "Zmieniaj kierunek w odpowiedzi na przesunięcie rywala.",
    ],
  ],
  eight: [
    ["Przerzut z półprzestrzeni", "switch-air", "Znajdź dalszą opcję po przyciągnięciu nacisku."],
    ["Podcięcie za pomocnikiem", "chip-line", "Porównaj linię podania po ziemi i górą."],
    ["Przyjęcie i wyjście w przód", "air-control", "Otwórz przestrzeń na pierwszy ruch z piłką."],
    ["Trzeci zawodnik za pressingiem", "third-air", "Po odegraniu zmień kąt i wysokość."],
    ["Przesunięcie za zmianą strony", "defend-air", "Osłoń środek podczas powrotu do odbiorcy."],
    ["Dalszy partner między liniami", "switch-air", "Oceń presję po opadnięciu piłki."],
    ["Wejście z boku i odegranie", "wide-return", "Po prowadzeniu daj partnerowi następną opcję."],
    ["Dośrodkowanie z półprzestrzeni", "wide-cross", "Wybierz wolnego odbiorcę i odpowiedni tor."],
    ["Opanuj diagonal w ruchu", "air-control", "Znajdź miejsce do przyjęcia przed doskokiem."],
    [
      "Dwa tempa przy wyprowadzeniu",
      "third-air",
      "Dostosuj kolejny ruch do nowego położenia piłki.",
    ],
  ],
  ten: [
    ["Podcięcie za stoperem", "chip-line", "Porównaj linię spalonego i miejsce partnera."],
    ["Zmiana strony spod nacisku", "switch-air", "Uruchom dalszy sektor po przesunięciu obrony."],
    [
      "Spadająca piłka między liniami",
      "air-control",
      "Przyjmij w miejscu pozwalającym kontynuować.",
    ],
    ["Odegranie i trzeci zawodnik", "third-air", "Po podaniu znajdź kolejną przestrzeń."],
    ["Zamknij dalszą szóstkę", "defend-air", "Po zmianie strony przejmij właściwy korytarz."],
    ["Piłka ponad niskim blokiem", "chip-line", "Sprawdź zarówno tor lotu, jak i krycie odbiorcy."],
    [
      "Dośrodkowanie z bocznego sektora",
      "wide-cross",
      "Zagraj do partnera z miejscem na następny ruch.",
    ],
    ["Wyjście z bocznej pułapki", "wide-return", "Po podaniu zmień linię wsparcia."],
    ["Przyjęcie po zmianie strony", "air-control", "Opanuj piłkę i wykorzystaj nowy korytarz."],
    ["Trzecie podanie otwiera blok", "third-air", "Łącz odegranie z ruchem poza doskokiem."],
  ],
  wing: [
    ["Dośrodkowanie na wolnego partnera", "wide-cross", "Sprawdź krycie przed wyborem odbiorcy."],
    ["Przerzut ze skrzydła", "switch-air", "Zobacz przestrzeń na przeciwnej stronie."],
    ["Podcięcie za bocznym obrońcą", "chip-line", "Dobierz tor do odległości i ruchu partnera."],
    ["Przyjmij diagonal i rusz", "air-control", "Wybierz przestrzeń poza pierwszym doskokiem."],
    ["Powrót po zmianie strony", "defend-air", "Zamknij korytarz prowadzący do przodu."],
    ["Zejście i ponowne wyjście", "wide-return", "Po odegraniu odtwórz kąt podania."],
    [
      "Współpraca z trzecim zawodnikiem",
      "third-air",
      "Wykorzystaj partnera do zmiany kierunku akcji.",
    ],
    ["Dośrodkowanie po zmianie tempa", "wide-cross", "Porównaj bliski i dalszy sektor przyjęcia."],
    [
      "Spadająca piłka przy linii",
      "air-control",
      "Ustaw się tak, by zachować możliwość prowadzenia.",
    ],
    ["Ponad rywalem do środka", "chip-line", "Sprawdź miejsce odbiorcy za doskokiem."],
  ],
  nine: [
    ["Podcięcie po zejściu do piłki", "chip-line", "Po odegraniu ponownie szukaj przestrzeni."],
    ["Zgranie do dalszego sektora", "switch-air", "Porównaj krycie bliskiego i dalszego partnera."],
    ["Przyjęcie długiego podania", "air-control", "Opanuj piłkę z możliwością następnego ruchu."],
    ["Zejście i gra na trzeciego", "third-air", "Po podaniu zmień wysokość względem stoperów."],
    ["Pressing po zmianie strony", "defend-air", "Odetnij dalszą opcję wyprowadzenia rywala."],
    ["Napastnik w bocznym sektorze", "wide-cross", "Po zejściu na bok znajdź partnera w środku."],
    ["Odegranie i nowe wbiegnięcie", "wide-return", "Po podaniu ponownie ustaw się do przyjęcia."],
    [
      "Przyjmij ponad pierwszym rywalem",
      "air-control",
      "Wybierz wolną stronę do opanowania piłki.",
    ],
    ["Między stoperem i bocznym", "chip-line", "Sprawdź linię spalonego przed podaniem."],
    ["Drugi kierunek po odegraniu", "third-air", "Zmień korytarz po reakcji obrońcy."],
  ],
};
const contexts = ["Doskok do podającego", "Krycie odbiorcy", "Otwarta dalsza strona"];
export const journeyExpansion: JourneyDefinition[] = (Object.keys(topics) as IQRole[]).flatMap(
  (role) =>
    topics[role].flatMap(([title, pattern, focus], index) =>
      contexts.map((contextLabel, context) => ({
        id: `iqj2-${role}-${String(index + 1).padStart(2, "0")}-${context}`,
        topicId: `iqj2-${role}-${String(index + 1).padStart(2, "0")}`,
        role,
        title,
        focus,
        pattern,
        ordinal: index + 10,
        context: context as 0 | 1 | 2,
        contextLabel,
        revision: 2 as const,
        delivery:
          pattern === "chip-line"
            ? ("chip" as const)
            : pattern === "wide-cross"
              ? ("cross" as const)
              : ("lofted" as const),
        steps:
          pattern === "chip-line" && ["gk", "cb", "six"].includes(role)
            ? ["pass", "move", "pass", "move"]
            : [...routes[pattern]!],
      })),
    ),
);
