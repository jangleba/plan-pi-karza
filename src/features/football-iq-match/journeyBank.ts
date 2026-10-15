import type {
  IQPosition,
  IQRole,
  JourneyAction,
  JourneyDefinition,
  JourneyPattern,
} from "./journeyTypes";
import { journeyExpansion } from "./journeyExpansion";

export const JOURNEY_BANK_VERSION = "2026-10-15.3";
export const SUPPORTED_JOURNEY_BANK_VERSIONS = [
  "2026-10-15.1",
  "2026-10-15.2",
  JOURNEY_BANK_VERSION,
];
export const roleLabels: Record<IQRole, string> = {
  gk: "Bramkarz",
  cb: "Środkowy obrońca",
  fb: "Boczny obrońca / wahadłowy",
  six: "Pomocnik 6",
  eight: "Pomocnik 8",
  ten: "Pomocnik 10",
  wing: "Skrzydłowy",
  nine: "Napastnik",
};
export const positionRoles: Record<IQPosition, IQRole[]> = {
  goalkeeper: ["gk"],
  defender: ["cb", "fb"],
  midfielder: ["six", "eight", "ten"],
  forward: ["wing", "nine"],
};
export function rolesForPosition(position?: string): IQRole[] {
  return position && Object.hasOwn(positionRoles, position)
    ? [...positionRoles[position as IQPosition]]
    : (Object.keys(roleLabels) as IQRole[]);
}
const patterns: Partial<Record<JourneyPattern, JourneyAction[]>> = {
  build: ["pass", "move", "pass", "move"],
  third: ["move", "pass", "move", "pass"],
  wide: ["carry", "pass", "move", "finish"],
  counter: ["carry", "pass", "move", "finish"],
  receive: ["move", "pass", "move", "carry"],
  finish: ["move", "pass", "move", "finish"],
  cover: ["cover", "press", "pass", "move"],
  press: ["press", "cover", "pass", "move"],
  recover: ["cover", "mark", "press", "pass"],
  "keeper-build": ["pass", "move", "pass", "move"],
  "keeper-sweep": ["cover", "press", "pass", "move"],
};
type Topic = readonly [title: string, pattern: JourneyPattern, focus: string];
// Eighty authored topics. The three contexts change the press, passing lanes,
// destinations and defender reactions; mirrored layouts are not counted here.
const topics: Record<IQRole, readonly Topic[]> = {
  gk: [
    [
      "Wciągnij pierwszą linię",
      "keeper-build",
      "Przyciągnij pressing i znajdź wyjście poza pierwszą linią.",
    ],
    [
      "Powrót do bramkarza",
      "keeper-build",
      "Daj obrońcy podanie zwrotne i przygotuj następną stronę.",
    ],
    [
      "Szóstka pod kryciem",
      "keeper-build",
      "Rozpoznaj zamknięty środek przed wyborem dystrybucji.",
    ],
    [
      "Przerzut po doskoku",
      "keeper-build",
      "Wykorzystaj stronę opuszczoną przez naciskającego rywala.",
    ],
    [
      "Podanie po ziemi czy dalej",
      "keeper-build",
      "Porównaj dostępność krótkiego i dalszego odbiorcy.",
    ],
    [
      "Za plecami wysokiej linii",
      "keeper-sweep",
      "Ustaw się do asekuracji przestrzeni za obrońcami.",
    ],
    [
      "Piłka w bocznym korytarzu",
      "keeper-sweep",
      "Zmień pozycję razem z piłką bez odsłonięcia środka bramki.",
    ],
    ["Samotny napastnik w głębi", "keeper-sweep", "Oceń głębię przed decyzją o wyjściu."],
    ["Odbiór i pierwsze podanie", "keeper-sweep", "Po przejęciu poszukaj partnera poza naciskiem."],
    [
      "Uspokój rozegranie",
      "keeper-build",
      "Utrzymaj możliwość bezpiecznego powrotu zamiast wymuszać pionowe podanie.",
    ],
  ],
  cb: [
    [
      "Wyprowadź piłkę spod napastnika",
      "build",
      "Wyciągnij napastnika i otwórz drogę za pressing.",
    ],
    ["Prowadzenie otwiera linię", "counter", "Wprowadź piłkę w wolny korytarz przed podaniem."],
    ["Przez trzeciego zawodnika", "third", "Po odegraniu przygotuj się na następne podanie."],
    [
      "Powrót i zmiana strony",
      "build",
      "Wykorzystaj bezpieczny powrót do przeniesienia ciężaru gry.",
    ],
    [
      "Boczny obrońca pod naciskiem",
      "receive",
      "Otwórz partnerowi kąt wyjścia z pressingu przy linii.",
    ],
    ["Wyjdź czy zabezpiecz głębię", "cover", "Oceń zagrożenie za plecami przed wyjściem z linii."],
    [
      "Asekuracja partnera",
      "recover",
      "Przejmij przestrzeń opuszczoną przez doskakującego obrońcę.",
    ],
    [
      "Obrona podania między stoperami",
      "cover",
      "Zamknij korytarz podania bez porzucania asekuracji.",
    ],
    ["Odcięcie napastnika", "press", "Zbliż się tak, aby ograniczyć grę do przodu."],
    [
      "Pierwsza decyzja po odbiorze",
      "recover",
      "Po odzyskaniu piłki rozpoznaj bezpieczne wyjście do ataku.",
    ],
  ],
  fb: [
    [
      "Wyjście z pułapki przy linii",
      "build",
      "Współpracuj ze środkiem zamiast prowadzić w zamknięty korytarz.",
    ],
    ["Obiegnięcie skrzydłowego", "wide", "Zbuduj przewagę ruchem po zewnętrznej stronie."],
    ["Wejście do środka", "third", "Zaproponuj podanie wewnątrz i zwolnij szeroki korytarz."],
    ["Dwa na jednego przy linii", "wide", "Zwiąż rywala i wybierz moment oddania piłki."],
    ["Podanie za linię i kontynuacja", "receive", "Po zagraniu zapewnij partnerowi kolejną opcję."],
    ["Dalszy słupek bez piłki", "recover", "Ustaw się pomiędzy rywalem a własną bramką."],
    [
      "Skrzydłowy schodzi do środka",
      "cover",
      "Chroń wewnętrzny korytarz, obserwując ruch partnera.",
    ],
    ["Pressing przy linii", "press", "Doskocz z asekuracją, ograniczając wyjście do środka."],
    ["Powrót po stracie", "recover", "Najpierw odzyskaj pozycję chroniącą głębię."],
    ["Wahadłowy w kontrataku", "counter", "Po odbiorze wybierz szerokość albo podanie do przodu."],
  ],
  six: [
    ["Wyjdź z cienia napastnika", "third", "Zmień kąt względem piłki i kryjącego rywala."],
    [
      "Przyjęcie między pierwszą linią",
      "receive",
      "Przygotuj miejsce na dalszą grę przed otrzymaniem piłki.",
    ],
    ["Gra na trzeciego pod presją", "third", "Odegraj i pokaż się za naciskającym rywalem."],
    ["Zmiana strony przez środek", "build", "Rozpoznaj stronę z większą przestrzenią."],
    [
      "Wprowadź piłkę po odbiorze",
      "counter",
      "Wykorzystaj wolny korytarz, zanim obrona się ustawi.",
    ],
    ["Zabezpieczenie ataku", "cover", "Pozostań w miejscu ograniczającym pierwsze podanie kontry."],
    [
      "Zamknij podanie do dziesiątki",
      "recover",
      "Przesuwaj się razem z piłką i osłoń grę między liniami.",
    ],
    ["Doskocz czy osłoń stoperów", "cover", "Porównaj nacisk na piłkę z ryzykiem otwarcia środka."],
    ["Kontrpressing w środku", "press", "Zamknij najbliższe wyjście rywala po stracie."],
    [
      "Druga piłka przed obroną",
      "recover",
      "Zajmij pozycję pozwalającą przejąć podanie lub zebrać odbicie.",
    ],
  ],
  eight: [
    ["Wyciągnij pressing", "build", "Zagraj, rusz za rywala i wykorzystaj nową linię podania."],
    ["Trzeci zawodnik w półprzestrzeni", "third", "Przygotuj się na podanie przez partnera."],
    ["Zmiana strony i wbiegnięcie", "build", "Po przeniesieniu gry znajdź kolejną rolę bez piłki."],
    ["Przyjęcie przodem do gry", "receive", "Wyjdź poza cień krycia przed otrzymaniem piłki."],
    ["Wejście z drugiej linii", "finish", "Dopasuj wbiegnięcie do położenia piłki i obrońców."],
    ["Partner pod presją przy linii", "third", "Zaproponuj podanie pod odpowiednim kątem."],
    [
      "Kontra przez środkowy korytarz",
      "counter",
      "Wykorzystaj wolną przestrzeń bez wchodzenia w tor partnera.",
    ],
    [
      "Przekazanie krycia",
      "recover",
      "Chroń przestrzeń i obserwuj gracza wchodzącego w Twoją strefę.",
    ],
    ["Doskok po stracie", "press", "Wybierz kierunek nacisku zamykający progresję."],
    ["Asekuruj boczny sektor", "cover", "Uzupełnij miejsce po partnerze bez otwarcia środka."],
  ],
  ten: [
    ["Między liniami", "receive", "Daj się znaleźć poza zasięgiem kryjącego pomocnika."],
    ["Odegranie i obrót akcji", "third", "Wykorzystaj partnera do wyjścia z nacisku."],
    [
      "Ostatnie podanie czy kontynuacja",
      "finish",
      "Porównaj możliwość zakończenia z lepiej ustawionym partnerem.",
    ],
    [
      "Wymiana z napastnikiem",
      "third",
      "Po podaniu zajmij przestrzeń otwartą przez ruch dziewiątki.",
    ],
    ["Wbiegnięcie po zmianie strony", "finish", "Wybierz wolny korytarz po przesunięciu obrony."],
    ["Kontra trzy na dwa", "counter", "Zwiąż obrońcę i uwolnij partnera podaniem."],
    ["Zejście po piłkę", "receive", "Podejdź tak, aby zachować możliwość gry do przodu."],
    ["Nacisk na szóstkę rywala", "press", "Zamknij podanie do środka podczas doskoku."],
    ["Powrót do bloku", "cover", "Po nieudanym nacisku odzyskaj osłonę środkowego sektora."],
    ["Odbiór między liniami", "recover", "Przejmij piłkę i od razu przygotuj następną akcję."],
  ],
  wing: [
    [
      "Jeden na jednego z asekuracją",
      "wide",
      "Rozpoznaj ustawienie drugiego obrońcy przed wejściem w drybling.",
    ],
    ["Środek czy linia", "wide", "Wybierz przestrzeń w zależności od kierunku nacisku."],
    ["Współpraca z bocznym obrońcą", "third", "Oddaj piłkę i wykorzystaj ruch partnera."],
    ["Za plecami bocznego obrońcy", "receive", "Zmień pozycję, gdy partner otworzy linię podania."],
    ["Dalszy słupek w ataku", "finish", "Zajmij wolny korytarz zamiast podążać za piłką."],
    ["Cofnięte podanie", "finish", "Oceń miejsce na zakończenie i partnera przed polem karnym."],
    [
      "Kontra szerokim sektorem",
      "counter",
      "Utrzymaj szerokość i wybierz moment przyspieszenia akcji.",
    ],
    ["Pressing na bocznego obrońcę", "press", "Naciskaj, odcinając proste wyjście do środka."],
    [
      "Powrót za wbiegającym partnerem rywala",
      "recover",
      "Uzupełnij szeroki sektor po zmianie posiadania.",
    ],
    [
      "Zabezpiecz podanie do środka",
      "cover",
      "Dopasuj pozycję do piłki i najbliższej opcji rywala.",
    ],
  ],
  nine: [
    ["Zejście i ruch za linię", "third", "Po odegraniu zmień wysokość i kierunek ruchu."],
    ["Wbiegnięcie między stoperów", "finish", "Wybierz przestrzeń pomiędzy obrońcami."],
    ["Odciągnij stopera", "receive", "Zmień pozycję, otwierając miejsce dla następnej akcji."],
    [
      "Bliższy czy dalszy korytarz",
      "finish",
      "Dopasuj ruch do kierunku podania i ustawienia obrońcy.",
    ],
    ["Gra tyłem i odegranie", "third", "Po przyjęciu pod presją wykorzystaj partnera."],
    [
      "Trzy na dwa w kontrze",
      "counter",
      "Utrzymaj odległość od partnerów i zajmij wolny korytarz.",
    ],
    [
      "Drugie tempo w polu karnym",
      "finish",
      "Poczekaj na otwarcie przestrzeni zamiast zajmować ją za wcześnie.",
    ],
    ["Zamknij grę między stoperami", "press", "Skieruj nacisk tak, aby ograniczyć zmianę strony."],
    ["Odetnij szóstkę", "cover", "Utrzymuj przeciwnika w cieniu nacisku."],
    [
      "Odbiór po podaniu wstecz",
      "recover",
      "Wykorzystaj sygnał pressingu bez odsłonięcia prostego wyjścia.",
    ],
  ],
};
const contexts = [
  { label: "Pierwszy doskok", cue: "Rywal rusza do piłki." },
  { label: "Zamknięty korytarz", cue: "Rywal osłania najkrótsze podanie." },
  { label: "Zmiana ustawienia", cue: "Partner i rywal zmieniają swoje pozycje." },
] as const;
const originalBank: JourneyDefinition[] = (Object.keys(topics) as IQRole[]).flatMap((role) =>
  topics[role].flatMap(([title, pattern, focus], ordinal) =>
    contexts.map((context, variant) => ({
      id: `iqj-${role}-${String(ordinal + 1).padStart(2, "0")}-${variant}`,
      topicId: `iqj-${role}-${String(ordinal + 1).padStart(2, "0")}`,
      role,
      title,
      pattern,
      focus,
      ordinal,
      context: variant as 0 | 1 | 2,
      contextLabel: context.label,
      steps: [...patterns[pattern]!],
    })),
  ),
);
// Existing IDs and routes stay stable so old attempts reproduce exactly.
export const journeyBank: JourneyDefinition[] = [...originalBank, ...journeyExpansion];
export const journeyTopicCount = new Set(journeyBank.map((s) => s.topicId)).size;
export function scenariosForRoles(roles: readonly IQRole[]): JourneyDefinition[] {
  return journeyBank.filter((s) => roles.includes(s.role));
}
