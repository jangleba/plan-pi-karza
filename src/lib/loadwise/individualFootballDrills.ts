import type { Profile } from "./types";

/**
 * Biblioteka indywidualnych zadań z piłką (w pojedynkę, jedna piłka, znaczniki
 * z tego, co jest pod ręką). Same definicje ćwiczeń — układanie sesji z nich
 * zostało usunięte razem z silnikiem. Skill-learning evidence:
 * https://doi.org/10.3389/fpsyg.2021.772201
 */

/** small: 2 × 3 m at home or a yard; yard: ~5 × 15 m safe straight; pitch: a pitch with a goal. */
export type FootballSpace = "small" | "yard" | "pitch";
export type DrillRole = "technique" | "position" | "challenge" | "warmup" | "cooldown";

export interface FootballDrill {
  id: string;
  name: string;
  space: FootballSpace;
  roles: readonly DrillRole[];
  positions?: readonly Profile["position"][];
  wall?: boolean;
  goal?: boolean;
  /** Fast or forceful actions: left out of light and cautious sessions. */
  intense?: boolean;
  steps: readonly [string, string, string];
  quality: string;
  mistake: string;
}

export const INDIVIDUAL_FOOTBALL_DRILLS = [
  {
    id: "football_ball_mastery",
    name: "Czucie piłki obiema nogami",
    space: "small",
    roles: ["warmup", "technique"],
    steps: [
      "Przygotuj piłkę i wolny, równy kwadrat około 2 × 2 m.",
      "Przetaczaj piłkę podeszwą i dotykaj ją wewnętrzną stroną stóp. Pracuj naprzemiennie obiema nogami.",
      "Piłka zostaje w zasięgu jednego kroku. Co kilka kontaktów krótko spójrz przed siebie.",
    ],
    quality: "W ostatnich 10 kontaktach policz utraty kontroli; porównuj wynik przy tej samej prędkości wykonania.",
    mistake: "Przyspieszanie pracy stóp kosztem kontroli piłki.",
  },
  {
    id: "football_fast_feet_sequence",
    name: "Szybkie stopy: sekwencja 4 dotknięć",
    space: "small",
    roles: ["technique"],
    steps: [
      "Stań nad piłką w kwadracie około 2 × 2 m. Sekwencja: dotknięcie podeszwą prawą, lewą, potem przetoczenie wewnętrzną stroną z prawej do lewej i z powrotem.",
      "Powtarzaj całą sekwencję w równym rytmie, na przodostopiu, z lekko ugiętymi kolanami.",
      "Gdy rytm jest równy, co drugą sekwencję podnieś wzrok i nazwij na głos jeden przedmiot przed sobą.",
    ],
    quality: "Policz pełne sekwencje bez utraty piłki w 30 s; zapisz wynik i bij go w kolejnych seriach.",
    mistake: "Patrzenie cały czas w piłkę i sztywne, wyprostowane nogi.",
  },
  {
    id: "football_self_feed_first_touch",
    name: "Przyjęcie piłki z własnego podania",
    space: "small",
    roles: ["technique"],
    steps: [
      "Ustaw dwie strefy obok siebie w wolnym kwadracie około 2 × 2 m; wystarczą linie podłoża.",
      "Lekko przetocz piłkę od siebie, podejdź i pierwszym kontaktem skieruj ją do wybranej strefy.",
      "Zatrzymaj piłkę kolejnym kontaktem. Po pięciu próbach zmień nogę; porównuj te same odległości.",
    ],
    quality: "Policz udane przyjęcia na 10 prób, po 5 każdą nogą: właściwa strefa i piłka nadal w zasięgu jednego kroku.",
    mistake: "Pierwszy kontakt tak daleko, że trzeba gonić piłkę.",
  },
  {
    id: "football_juggling_record",
    name: "Żonglerka: pobij swój rekord",
    space: "small",
    roles: ["challenge", "cooldown"],
    steps: [
      "Stań na równym podłożu z wolnym miejscem dookoła. Upuść piłkę na stopę i podbij ją lekko, na wysokość kolan.",
      "Licz kolejne podbicia. Gdy piłka spadnie, zacznij liczyć od nowa. Na początku możesz pozwolić piłce odbić się raz od ziemi między podbiciami.",
      "Co serię zmieniaj zasadę: tylko prawa, tylko lewa, naprzemiennie, albo stopa–udo–stopa.",
    ],
    quality: "Zapisz najlepszy wynik z każdej zasady. Rekord bijesz tylko przy podbiciach nie wyżej niż do pasa.",
    mistake: "Kopanie piłki wysoko nad głowę i bieganie za nią.",
  },
  {
    id: "football_gate_dribble",
    name: "Mini-bramki: prowadzenie przez bramki",
    space: "small",
    roles: ["challenge", "technique"],
    steps: [
      "Z butów, butelek lub pachołków zrób 4 bramki szerokie na około 1 m, rozstawione w kwadracie około 3 × 3 m.",
      "Prowadź piłkę krótkimi kontaktami i przeprowadź ją przez jak najwięcej bramek. Nie możesz przejść przez tę samą bramkę dwa razy z rzędu.",
      "Po każdej bramce zmień kierunek: zatrzymanie podeszwą, przeciągnięcie albo obrót wewnętrzną stroną stopy.",
    ],
    quality: "Policz bramki przejęte z kontrolą w 45 s; bramka liczy się tylko, gdy piłka nie dotknęła znacznika.",
    mistake: "Długie kontakty, po których piłka ucieka poza kwadrat.",
  },
  {
    id: "football_cone_feints",
    name: "Zwód przy pachołku",
    space: "small",
    roles: ["position"],
    positions: ["forward", "midfielder"],
    steps: [
      "Postaw znacznik jako „obrońcę” 2–3 m przed sobą. To ćwiczenie bez przeciwnika: znacznik wyznacza tylko miejsce zwodu.",
      "Podprowadź piłkę, około 1 m przed znacznikiem wykonaj zwód (przekładanka, zwód ciałem albo przeciągnięcie podeszwą) i wyjdź z piłką drugą stroną.",
      "Po wyjściu przyspiesz przez 2 kroki z piłką i zatrzymaj ją. Zmieniaj strony i zwody co 5 prób.",
    ],
    quality: "Na 10 prób policz zwody z wyjściem na drugą stronę bez dotknięcia znacznika i z piłką blisko nogi.",
    mistake: "Zwód wykonany za blisko znacznika albo bez zmiany tempa po wyjściu.",
  },
  {
    id: "football_scan_control",
    name: "Orientacja przed kontaktem z piłką",
    space: "small",
    roles: ["position", "technique"],
    positions: ["midfielder"],
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
    space: "small",
    roles: ["position", "technique"],
    positions: ["forward"],
    steps: [
      "Wyznacz krótki odcinek na równym podłożu: bez boiska 1–2 m, na boisku 3–5 m.",
      "Prowadź piłkę krótkimi kontaktami, zatrzymaj podeszwą i obróć się z nią do drugiej strony.",
      "Wróć spokojnie drugą nogą. Obrót wykonuj płynnie, bez gwałtownego skręcania na zablokowanej stopie.",
    ],
    quality: "Policz kontrolowane obroty na 10 prób; piłka po obrocie pozostaje blisko, a ruch jest bezbolesny.",
    mistake: "Gwałtowny zwrot ciała przy stopie nieruchomo wciśniętej w podłoże.",
  },
  {
    id: "football_target_pass",
    name: "Celne podanie piłki do strefy",
    space: "small",
    roles: ["position", "technique"],
    positions: ["defender", "goalkeeper"],
    steps: [
      "Wybierz bezpieczny cel na podłożu: linię lub strefę. Bez boiska zacznij od 1–2 m, na boisku od 3–5 m.",
      "Ustaw stopę postawną obok piłki i zagraj po ziemi wewnętrzną stroną stopy do celu.",
      "Podejdź spokojnie po piłkę i powtórz. Po pięciu próbach zmień nogę; nie potrzebujesz bramki ani partnera.",
    ],
    quality: "W notatce zapisz trafienia na 10 prób, po 5 każdą nogą, oraz odległość i szerokość celu.",
    mistake: "Zmiana dystansu między próbami, przez co wyników nie da się porównać.",
  },
  {
    id: "football_gk_distribution",
    name: "Gra nogami bramkarza z piłką",
    space: "small",
    roles: ["position"],
    positions: ["goalkeeper"],
    steps: [
      "Przygotuj dwie strefy podania i piłkę. Zacznij blisko: 1–2 m bez boiska lub 3–5 m na boisku.",
      "Przetocz piłkę od siebie, podejdź małymi krokami i przyjmij ją do boku w kierunku wybranej strefy.",
      "Zagraj krótkie podanie po ziemi do strefy, podejdź po piłkę i zmień stronę. Po pięciu próbach zmień nogę.",
    ],
    quality: "Na 10 prób policz kontrolowane przyjęcie i celne podanie jako jedną udaną akcję; po 5 prób na nogę.",
    mistake: "Mocne wybicie zamiast kontrolowanego, celnego krótkiego podania.",
  },
  {
    id: "football_wall_first_touch",
    name: "Podanie o ścianę i przyjęcie piłki",
    space: "small",
    roles: ["technique"],
    wall: true,
    steps: [
      "Wybierz wyłącznie dostępną, bezpieczną ścianę lub odbojnik i wolne miejsce do odbicia. Zacznij blisko.",
      "Podaj piłkę wewnętrzną stroną stopy. Przyjmij wracającą piłkę do boku, w zasięgu kolejnego kroku.",
      "Wróć do pozycji i podaj ponownie. Po pięciu próbach zmień nogę; celność jest ważniejsza od siły.",
    ],
    quality: "Na 10 podań policz celne powroty i kontrolowane przyjęcia osobno dla każdej nogi.",
    mistake: "Zwiększanie siły podania zanim odbicia i przyjęcia są powtarzalne.",
  },
  {
    id: "football_wall_one_touch",
    name: "Ściana: gra z pierwszej piłki",
    space: "small",
    roles: ["challenge"],
    wall: true,
    steps: [
      "Stań 2–3 m od bezpiecznej ściany lub odbojnika. Podawaj po ziemi wewnętrzną stroną stopy.",
      "Odgrywaj każdą wracającą piłkę od razu, bez przyjęcia, naprzemiennie prawą i lewą nogą.",
      "Gdy seria jest płynna, cofnij się o pół kroku albo odgrywaj tylko słabszą nogą.",
    ],
    quality: "Policz celne odegrania z pierwszej piłki w 30 s; zapisz rekord i odległość od ściany.",
    mistake: "Mocne, niecelne uderzenia, po których piłka wraca w bok.",
  },
  {
    id: "football_wall_receive_turn",
    name: "Ściana: przyjęcie kierunkowe i obrót",
    space: "small",
    roles: ["position", "technique"],
    positions: ["midfielder", "defender", "forward"],
    wall: true,
    steps: [
      "Stań 3–4 m od ściany lub odbojnika, bokiem do niej, z otwartą sylwetką.",
      "Podaj, a wracającą piłkę przyjmij dalszą nogą tak, by od razu obrócić się z nią w bok o 90°.",
      "Zrób 2 kontakty prowadzenia, wróć na miejsce i zmień stronę obrotu.",
    ],
    quality: "Na 10 prób policz przyjęcia z obrotem bez zatrzymania piłki i bez utraty kontroli.",
    mistake: "Przyjęcie do stopy, a dopiero potem obrót: to dwa kontakty zamiast jednego.",
  },
  {
    id: "football_gk_wall_handling",
    name: "Bramkarz: chwyt piłki odbitej od ściany",
    space: "small",
    roles: ["position", "challenge"],
    positions: ["goalkeeper"],
    wall: true,
    steps: [
      "Stań 3–4 m od bezpiecznej ściany w postawie bramkarskiej: nogi na szerokość bioder, ręce przed sobą.",
      "Rzuć piłkę oburącz o ścianę i złap ją po odbiciu chwytem „W” na wysokości klatki albo „koszyczkiem” przy niskiej piłce.",
      "Zmieniaj wysokość rzutu i krok w bok przed chwytem. Bez rzutów się na ziemię.",
    ],
    quality: "Policz czyste chwyty bez wypuszczenia piłki na 10 prób; zapisz rekord serii.",
    mistake: "Łapanie piłki samymi dłońmi bez ustawienia ciała za piłką.",
  },
  {
    id: "football_speed_dribble",
    name: "Prowadzenie na szybkości i hamowanie",
    space: "yard",
    roles: ["technique", "challenge"],
    intense: true,
    steps: [
      "Wyznacz odcinek 10–15 m na równym, bezpiecznym podłożu i linię zatrzymania na końcu.",
      "Prowadź piłkę dłuższymi kontaktami co 2–3 kroki, ze wzrostem prędkości, i zatrzymaj ją podeszwą dokładnie na linii.",
      "Wróć spokojnym marszem z piłką przy nodze. Co drugą próbę prowadź słabszą nogą.",
    ],
    quality: "Na 6 prób policz zatrzymania piłki na linii (do 1 m) bez zwalniania wcześniej niż 2 m przed linią.",
    mistake: "Zbyt długie kontakty, przez które piłka ucieka przed linią.",
  },
  {
    id: "football_slalom_time",
    name: "Slalom z piłką: pobij swój czas",
    space: "yard",
    roles: ["challenge"],
    intense: true,
    steps: [
      "Ustaw 6 znaczników co około 1,5 m w linii prostej na równym podłożu.",
      "Przeprowadź piłkę slalomem tam i z powrotem: w jedną stronę zewnętrzną i wewnętrzną częścią prawej stopy, z powrotem lewej.",
      "Zmierz czas telefonem i odpocznij do pełnego oddechu przed kolejną próbą.",
    ],
    quality: "Zapisz najlepszy czas; próba liczy się tylko bez potrącenia znacznika i bez ominięcia żadnego z nich.",
    mistake: "Bieganie szybciej, niż pozwala kontrola, i ścinanie slalomu.",
  },
  {
    id: "football_long_pass_zone",
    name: "Długie podanie do strefy",
    space: "pitch",
    roles: ["position", "challenge"],
    positions: ["defender", "midfielder", "goalkeeper"],
    steps: [
      "Na boisku oznacz strefę około 5 × 5 m w odległości 20–30 m, np. bluzą i znacznikami.",
      "Zagraj piłkę podbiciem do strefy, z rozbiegu 2–3 kroki, ze stopą postawną obok piłki.",
      "Po 5 próbach zmień nogę. Po piłki chodź spokojnie: to też odpoczynek między próbami.",
    ],
    quality: "Na 10 prób policz piłki, które pierwszy raz spadły w strefie; zapisz odległość.",
    mistake: "Odchylanie tułowia do tyłu, przez co piłka leci wysoko i krótko.",
  },
  {
    id: "football_finishing_corners",
    name: "Wykończenie w rogi bramki",
    space: "yard",
    roles: ["challenge", "position"],
    positions: ["forward", "midfielder"],
    goal: true,
    intense: true,
    steps: [
      "Oznacz w bramce dwa cele przy słupkach, np. bluzą lub butelką. Ustaw piłkę 14–16 m od dużej bramki albo 6–8 m od mini-bramki.",
      "Poprowadź piłkę 2–3 kontaktami do przodu i uderz wewnętrzną stroną albo podbiciem w jeden z rogów.",
      "Po 5 strzałach zmień nogę. Po piłkę chodź spokojnie i dopiero wtedy ustaw kolejną próbę.",
    ],
    quality: "Na 10 strzałów policz trafienia w strefę przy słupku; strzał obok bramki liczy się jako pudło.",
    mistake: "Strzał „na siłę” z odchylonym tułowiem zamiast celnego uderzenia.",
  },
  {
    id: "football_gk_kick_zone",
    name: "Bramkarz: wybicie z ręki do strefy",
    space: "pitch",
    roles: ["challenge", "position"],
    positions: ["goalkeeper"],
    steps: [
      "Oznacz strefę około 8 × 8 m w odległości 25–35 m od pola karnego.",
      "Wybij piłkę z ręki: puść ją przed nogę, patrz na piłkę i trafiaj podbiciem ze stopą wyprostowaną.",
      "Po 5 próbach zmień nogę albo rodzaj wybicia (z ręki, z ziemi). Po piłki chodź spokojnie.",
    ],
    quality: "Na 10 wybić policz piłki, które pierwszy raz spadły w strefie.",
    mistake: "Wyrzucanie piłki wysoko przed wybiciem, przez co trafienie jest przypadkowe.",
  },
  {
    id: "football_easy_contacts",
    name: "Spokojne kontakty z piłką",
    space: "small",
    roles: ["cooldown"],
    steps: [
      "Zostań na równym, wolnym fragmencie podłoża z piłką blisko stóp.",
      "Powoli przetaczaj piłkę naprzemiennie obiema nogami i stopniowo zwalniaj.",
      "Oddychaj swobodnie. Zakończ pracę, jeśli pojawia się ból lub zawroty głowy.",
    ],
    quality: "Spokojny oddech i pełna kontrola piłki.",
    mistake: "Dodawanie szybkich zrywów na zakończenie technicznej sesji.",
  },
] as const satisfies readonly FootballDrill[];

