/**
 * Fiszki: zwroty z lekcji, słownictwo piłkarskie i popularne hasła/powiedzonka.
 * Treści są autorskie (własne opisy i przykłady). Hasła to ogólnie znane powiedzonka boiskowe i komentatorskie; nie ma tu cytatów
 * z haseł klubowych, piosenek ani cudzych kursów. Przegląd merytoryczny dla osób 16–17 lat: docs/DO-PRZEGLADU-SPECJALISTY.md (nie wykonany).
 */
import { PHRASES } from "./content";
import { sloganIds, wordIds } from "./meta";
import type { Level, Role } from "./types";

export type Deck = "phrases" | "words" | "slogans";
export const DECK_LABEL: Record<Deck, string> = { phrases: "Zwroty z lekcji", words: "Słowa", slogans: "Hasła i powiedzonka" };
export const DECK_HINT: Record<Deck, string> = {
  phrases: "Krótkie wypowiedzi na boisku i w klubie.",
  words: "Sprzęt, boisko, gra, pozycje, trening.",
  slogans: "Okrzyki, komentarze i trenerskie hasła.",
};

export interface Card { id: string; deck: Deck; en: string; pl: string; note: string; level: Level; role: Role }

type Row = [en: string, pl: string, note: string, level: Level, role?: Role];

const WORD_ROWS: Row[] = [
  // poziom 1
  ["pitch", "boisko", "W Wielkiej Brytanii „pitch”, w USA „field”.", 1],
  ["touchline", "linia boczna", "Trener zwykle stoi przy linii bocznej (touchline).", 1],
  ["goal line", "linia bramkowa", "Linia między słupkami i dalej wzdłuż końca boiska.", 1],
  ["penalty area", "pole karne", "Potocznie „the box”. Tu bramkarz może łapać piłkę rękami.", 1, "both"],
  ["crossbar", "poprzeczka", "Górna belka bramki.", 1],
  ["post", "słupek", "Boczny słupek bramki. „Hit the post” to trafić w słupek.", 1],
  ["net", "siatka", "Siatka bramki. „Into the net” – do siatki.", 1],
  ["boots", "korki (buty piłkarskie)", "„Boots” to buty piłkarskie. „Trainers” to zwykłe buty sportowe.", 1],
  ["shin pads", "ochraniacze na piszczele", "Obowiązkowe w meczu i na wielu treningach.", 1],
  ["gloves", "rękawice bramkarskie", "Część stroju bramkarza.", 1, "gk"],
  ["cones", "pachołki", "Używane do wyznaczania toru lub ćwiczeń.", 1],
  ["whistle", "gwizdek", "Sędzia lub trener gwiżdże, by zacząć lub przerwać grę.", 1],
  ["referee", "sędzia", "Potocznie „ref”.", 1],
  ["pass", "podanie", "Czasownik i rzeczownik: „pass the ball”, „a good pass”.", 1],
  ["shot", "strzał", "„Shot on target” to strzał celny.", 1],
  ["header", "główka", "Zagranie głową.", 1],
  ["tackle", "odbiór (wejście w nogi)", "Próba odebrania piłki rywalowi. Może być czysty (clean) lub faulem.", 1],
  ["throw-in", "wrzut z autu", "Po tym, jak piłka wyjdzie za linię boczną.", 1],
  ["corner", "rzut rożny", "Po wyjściu piłki za linię końcową po dotknięciu obrońcy.", 1],
  ["free kick", "rzut wolny", "Po faulu lub innym przewinieniu.", 1],
  ["penalty", "rzut karny", "Za przewinienie w polu karnym.", 1, "both"],
  ["offside", "spalony", "Pozycja przed ostatnim obrońcą w momencie podania.", 1],
  ["foul", "faul", "Przewinienie. „Give a foul” – odgwizdać faul.", 1],
  ["half-time", "przerwa (między połowami)", "Zwykle 15 minut.", 1],
  // poziom 2
  ["cross", "dośrodkowanie", "Podanie z boku w pole karne. Bramkarz „claims the cross”.", 2, "both"],
  ["through ball", "podanie prostopadłe", "Piłka zagrana między obrońcami za ich plecy.", 2],
  ["dribble", "drybling (prowadzić piłkę)", "„Dribble past a defender” – minąć obrońcę.", 2],
  ["volley", "wolej", "Uderzenie piłki w powietrzu, zanim spadnie na ziemię.", 2],
  ["clearance", "wybicie", "Daleko od własnej bramki, bez rozgrywania.", 2],
  ["interception", "przechwyt", "Odcięcie podania rywala.", 2],
  ["goal kick", "wykop od bramki", "Wznowienie po tym, jak piłka wyjdzie za linię końcową po strzale lub podaniu ataku.", 2, "gk"],
  ["kick-off", "rozpoczęcie gry", "Początek połowy lub wznowienie po golu.", 2],
  ["full-time", "koniec meczu", "Po regulaminowym czasie gry.", 2],
  ["extra time", "dogrywka", "Dodatkowy czas, gdy w pucharze jest remis.", 2],
  ["yellow card", "żółta kartka", "Ostrzeżenie dla zawodnika.", 2],
  ["red card", "czerwona kartka", "Wyrzucenie z boiska.", 2],
  ["sent off", "wyrzucony z boiska", "„He was sent off” – dostał czerwoną kartkę.", 2],
  ["substitution", "zmiana", "Wymiana zawodnika. „Make a substitution”.", 2],
  ["captain", "kapitan", "Opaskę kapitana nosi lider drużyny.", 2],
  ["squad", "kadra (cała drużyna)", "Wszyscy zawodnicy dostępni na dany mecz lub sezon.", 2],
  ["drill", "ćwiczenie treningowe", "Powtarzalne ćwiczenie, np. podań.", 2],
  ["sprint", "sprint", "Bieg z maksymalną prędkością.", 2],
  ["stamina", "wytrzymałość", "Zdolność do długiego wysiłku.", 2],
  ["injury", "kontuzja", "Powiedz o niej trenerowi. Drobny uraz to „a knock”.", 2],
  ["recovery", "regeneracja", "Odpoczynek po wysiłku.", 2],
  ["winger", "skrzydłowy", "Gra przy bocznej linii.", 2, "field"],
  // poziom 3
  ["holding midfielder", "defensywny pomocnik", "Osłania obronę; potocznie „number six”.", 3, "field"],
  ["wing-back", "wahadłowy", "Boczny zawodnik, który broni i atakuje całą długość skrzydła.", 3, "field"],
  ["striker", "napastnik", "Zawodnik, którego głównym zadaniem jest strzelanie goli.", 3, "field"],
  ["sweeper-keeper", "bramkarz-libero", "Bramkarz, który wychodzi daleko poza pole karne i dołącza do gry.", 3, "gk"],
  ["parry", "odbić (piłkę)", "Bramkarz odbija strzał dłońmi, zamiast go złapać.", 3, "gk"],
  ["punch", "piąstkować", "Bramkarz wybija piłkę pięścią, zwykle przy dośrodkowaniu.", 3, "gk"],
  ["claim a cross", "złapać dośrodkowanie", "Bramkarz pewnie łapie piłkę dośrodkowaną w pole karne.", 3, "gk"],
  ["set piece", "stały fragment gry", "Rzut rożny, wolny, karny lub wrzut z autu.", 3],
  ["counter-attack", "kontra", "Szybki atak po odzyskaniu piłki.", 3],
  ["possession", "posiadanie piłki", "„Win possession” – odzyskać piłkę.", 3],
  ["transition", "przejście (z obrony do ataku i odwrotnie)", "Moment tuż po stracie albo odbiorze piłki.", 3],
  ["marking", "krycie", "Pilnowanie rywala. „Tight marking” – ścisłe krycie.", 3],
  ["high line", "wysoka linia obrony", "Obrońcy stoją daleko od własnej bramki.", 3],
  ["advantage", "korzyść (przepis)", "Sędzia pozwala grać dalej, jeśli faul nie pomaga faulującemu.", 3],
  ["stoppage time", "doliczony czas gry", "Dodatkowe minuty na końcu połowy.", 3],
  ["loan", "wypożyczenie", "Zawodnik gra czasowo w innym klubie.", 3],
  ["academy", "akademia", "Szkółka młodzieżowa klubu.", 3],
  ["scout", "skaut (łowca talentów)", "Osoba, która ogląda zawodników dla klubu.", 3],
];

const SLOGAN_ROWS: Row[] = [
  ["Back of the net!", "Siatka! (gol)", "Okrzyk komentatorów i kibiców po golu.", 2],
  ["A game of two halves", "Mecz dwóch połów", "Mówi się, gdy w drugiej połowie wszystko się odwraca.", 3],
  ["Park the bus", "„Zaparkować autobus” (zagęścić obronę)", "Drużyna broni się niemal całym składem. Często żartobliwie lub krytycznie.", 3],
  ["Clean sheet", "Czyste konto", "Mecz bez straconej bramki. Duże osiągnięcie bramkarza i obrony.", 2, "gk"],
  ["Early doors", "Na początku meczu", "Potocznie, głównie brytyjskie: „Early doors, he's already booked.”", 3],
  ["Over the moon", "Wniebowzięty", "Typowa wypowiedź po wygranej: „We're over the moon.”", 3],
  ["Gutted", "Załamany (po porażce)", "Potocznie: „I'm gutted.” – bardzo mi przykro, jestem rozczarowany.", 2],
  ["One game at a time", "Mecz po meczu", "Trener nie zapowiada wielkich rzeczy, skupia się na najbliższym meczu.", 2],
  ["Give 110 percent", "Daj z siebie 110 procent", "Przesada dla podkreślenia zaangażowania. Dosłownie to niemożliwe, ale wszyscy rozumieją.", 3],
  ["The ball is round", "Piłka jest okrągła (wszystko może się zdarzyć)", "Mówi się, gdy faworyt może przegrać.", 2],
  ["Hit the woodwork", "Trafić w obramowanie bramki", "Strzał w słupek lub poprzeczkę.", 2],
  ["Get stuck in", "Wejdź ostro w walkę", "Wezwanie do agresywnej, uczciwej gry w pojedynkach.", 3],
  ["Play to the whistle", "Graj do gwizdka", "Nie przestawaj grać, dopóki sędzia nie przerwie gry.", 1],
  ["Win the second ball", "Wygraj drugą piłkę", "Walcz o piłkę, która spadnie po pierwszym pojedynku (np. po główce).", 2],
  ["Stay switched on", "Bądź skoncentrowany", "Nie trać czujności, także gdy nic się nie dzieje.", 2],
  ["Heads up!", "Uwaga! (zwróć uwagę)", "Ostrzeżenie, np. o lecącej piłce lub zbliżającym się rywalu.", 1],
  ["Great ball!", "Świetne podanie!", "Pochwała dla kolegi za dobre zagranie.", 1],
  ["Well played!", "Dobra gra!", "Pochwała po meczu lub akcji.", 1],
  ["We go again", "Gramy dalej (jeszcze raz)", "Po błędzie lub porażce: nie poddajemy się.", 2],
  ["Fight for every ball", "Walcz o każdą piłkę", "Popularne trenerskie wezwanie do zaangażowania.", 1],
  ["Team first", "Drużyna przede wszystkim", "Wartość ważniejsza niż indywidualny wynik.", 1],
  ["Keep your head up", "Głowa do góry", "Słowa otuchy po błędzie.", 1],
  ["Man of the match", "Zawodnik meczu", "Nagroda dla najlepszego zawodnika spotkania.", 2],
  ["Top bins", "Okienko", "Potocznie: strzał w samo okienko bramki.", 3],
];

const toCards = (rows: Row[], ids: string[], deck: Deck): Card[] =>
  rows.map((r, i): Card => ({ id: ids[i] ?? `${deck}-${i}`, deck, en: r[0], pl: r[1], note: r[2], level: r[3], role: r[4] ?? "both" }));

export const WORD_CARDS: Card[] = toCards(WORD_ROWS, wordIds(), "words");
export const SLOGAN_CARDS: Card[] = toCards(SLOGAN_ROWS, sloganIds(), "slogans");
/** Karty zwrotów korzystają z tego samego postępu co lekcje (jedno źródło prawdy o opanowaniu zwrotu). */
export const PHRASE_CARDS: Card[] = PHRASES.map((p): Card => ({ id: p.id, deck: "phrases", en: p.en, pl: p.pl, note: p.context, level: p.level, role: p.role }));
export const ALL_CARDS: Card[] = [...PHRASE_CARDS, ...WORD_CARDS, ...SLOGAN_CARDS];
export const CARD_BY_KEY: Record<string, Card> = Object.fromEntries(ALL_CARDS.map((c) => [`${c.deck}:${c.id}`, c]));
export const cardsOf = (deck: Deck): Card[] => ALL_CARDS.filter((c) => c.deck === deck);
