/**
 * Piłkarski angielski: treści (autorskie, napisane na potrzeby Ballwise; nie są kopią cudzych kursów, pytań ani nagrań).
 * Każdy zwrot ma stałe ID, poziom, temat (lekcja), tłumaczenie, kontekst oraz poprawne odpowiedzi do dwóch ćwiczeń.
 * Treści dla osób 16–17 lat wymagają przeglądu specjalisty (docs/DO-PRZEGLADU-SPECJALISTY.md) – przegląd NIE został wykonany.
 *
 * Zapis skrócony (patrz `ph`): pytanie sprawdzające = [sytuacja, poprawna, błędna 1, błędna 2, wyjaśnienie];
 * układanka = [polecenie, dostępne słowa (spacje), akceptowane ułożenia (rozdzielone „ / ”), wyjaśnienie].
 */
import { LESSONS_META } from "./meta";
import type { Lesson, Level, Phrase, Role } from "./types";

type Check = [q: string, correct: string, wrong1: string, wrong2: string, why: string];
type Build = [prompt: string, pieces: string, answers: string, why: string];

let seq = new Map<string, number>();
const ph = (lesson: string, role: Role, en: string, pl: string, context: string, c: Check, b: Build): Phrase => {
  const n = (seq.get(lesson) ?? 0) + 1;
  seq.set(lesson, n);
  const meta = LESSONS_META.find((l) => l.id === lesson)!;
  return {
    id: `${lesson}-${String(n).padStart(2, "0")}`, lesson, level: meta.level as Level, role, en, pl, context,
    check: { q: c[0], correct: c[1], wrong: [c[2], c[3]], why: c[4] },
    build: { prompt: b[0], pieces: b[1].split(" "), answers: b[2].split(" / ").map((a) => a.split(" ")), why: b[3] },
  };
};

const PARTNERS: Phrase[] = [
  ph("partners", "both", "Man on!", "Rywal tuż za Tobą!", "Krzyczysz do kolegi z piłką, gdy rywal dochodzi do niego z tyłu lub z boku. Ma mało czasu.",
    ["Kolega przyjmuje piłkę tyłem do rywali, a obrońca biegnie prosto na niego. Co do niego zawołasz?", "Man on!", "Well played!", "Switch it!", "„Man on!” ostrzega, że rywal jest bardzo blisko. „Well played!” to pochwała po akcji, a „Switch it!” to prośba o zmianę strony gry."],
    ["Ostrzeż Jacka, że ma rywala za plecami.", "Jack man on turn the", "Jack man on / man on Jack", "Najpierw imię, potem krótkie „man on!”. W grze liczy się szybkość, więc mówimy jak najkrócej."]),
  ph("partners", "both", "Time!", "Masz czas!", "Mówisz koledze, że nikt go nie atakuje i może spokojnie przyjąć piłkę albo się rozejrzeć.",
    ["Dostajesz podanie na własnej połowie. Kolega woła „Time!”. Co to znaczy?", "Nikt Cię nie atakuje, masz czas", "Zagraj piłkę natychmiast", "Za chwilę kończy się mecz", "W piłkarskim angielskim „time” znaczy, że masz czas i miejsce. Nie chodzi o czas gry, więc „Time!” nie oznacza końca meczu."],
    ["Powiedz Tomowi, że ma czas.", "Tom you've got time on man", "Tom you've got time / you've got time Tom", "Po angielsku „you've got time” brzmi naturalnie; imię możesz dać na początku albo na końcu."]),
  ph("partners", "both", "Turn!", "Obróć się!", "Mówisz koledze stojącemu tyłem do bramki rywala, że przed nim jest wolna przestrzeń i może grać do przodu.",
    ["Stoisz tyłem do bramki rywala, przed Tobą dużo miejsca. Trener woła „Turn!”. Co masz zrobić?", "Obrócić się z piłką i grać do przodu", "Oddać piłkę do tyłu", "Zatrzymać piłkę podeszwą i stać", "„Turn!” to polecenie obrotu: masz miejsce, więc możesz zagrać do przodu. Podanie do tyłu to inna decyzja."],
    ["Powiedz koledze, że ma miejsce i ma się obrócić.", "turn you've got space back", "turn you've got space", "Najpierw polecenie „turn”, potem krótkie uzasadnienie: „you've got space”."]),
  ph("partners", "field", "Square!", "Zagraj w bok!", "Prosisz o podanie poziome, w poprzek boiska (nie do przodu).",
    ["Kolega z piłką nie ma miejsca do przodu. Stoisz obok i chcesz piłkę w poprzek boiska. Co zawołasz?", "Square!", "Man on!", "Away!", "„Square” to podanie w poprzek. „Away!” krzyczy obrońca, który chce wybić piłkę z zagrożenia."],
    ["Poproś o podanie w bok i powiedz, że jesteś blisko.", "square I'm here there", "square I'm here", "Krótko: kierunek („square”) i informacja, gdzie jesteś („I'm here”)."]),
  ph("partners", "gk", "Keeper!", "Bramkarz! (Moja piłka!)", "Bramkarz woła, że wychodzi do piłki. Obrońcy zostawiają mu ją, żeby uniknąć zderzenia.",
    ["Jesteś bramkarzem. Dośrodkowanie leci w pole karne, a Ty wychodzisz do piłki. Co krzykniesz do obrońców?", "Keeper!", "Square!", "Time!", "Bramkarz woła „Keeper!” (albo „Keeper's ball!”), żeby koledzy nie przeszkodzili mu w wyjściu. To też ostrzeżenie przed kolizją."],
    ["Jesteś bramkarzem. Zawołaj, że to Twoja piłka.", "Keeper's ball time mine", "Keeper's ball", "„Keeper's ball” znaczy dosłownie „piłka bramkarza” i jest jasnym sygnałem dla obrońców."]),
  ph("partners", "both", "Away!", "Wybij daleko!", "Wołasz do obrońcy (albo słyszysz) w pobliżu własnej bramki: nie rozgrywaj, wybij piłkę jak najdalej.",
    ["Piłka spada tuż przed Twoją bramką, rywal jest blisko. Koledzy wołają „Away!”. Co robisz?", "Wybijasz piłkę jak najdalej od bramki", "Podajesz spokojnie w bok", "Przytrzymujesz piłkę przy nodze", "„Away!” to „zabierz to stąd”: bezpieczeństwo ważniejsze niż ładne rozegranie."],
    ["Krzyknij do Toma, żeby wybił piłkę.", "away Tom time square", "away Tom / Tom away", "Imię plus „away”: Tom wie, że to do niego i co ma zrobić."]),
];

const COACH: Phrase[] = [
  ph("coach", "both", "Step up!", "Wyjdź wyżej!", "Trener każe wyjść wyżej do rywala albo przesunąć linię obrony do przodu, żeby skrócić boisko.",
    ["Rywale grają piłkę w środku pola. Trener woła do linii obrony „Step up!”. Co robicie?", "Wychodzicie razem wyżej, bliżej rywali", "Cofacie się do własnego pola karnego", "Zamieniacie się stronami", "„Step up” to ruch do przodu, żeby skrócić odległości. Cofanie to „drop”."],
    ["Powiedz trenerowi, że wychodzisz wyżej.", "I'm stepping up coach down", "I'm stepping up coach / coach I'm stepping up", "Odpowiadasz krótko i w czasie teraźniejszym: „I'm stepping up”."]),
  ph("coach", "both", "Drop!", "Cofnij się!", "Trener każe cofnąć się głębiej, bliżej własnej bramki.",
    ["Napastnik rywala schodzi po piłkę, a trener woła do Ciebie, pomocnika: „Drop!”. Co robisz?", "Cofasz się bliżej własnej bramki", "Wychodzisz do pressingu", "Biegniesz za plecy obrońców", "„Drop” znaczy „opuść się, cofnij”. Przeciwieństwem jest „Step up!”."],
    ["Powiedz, że się cofasz.", "I'm dropping deeper coach up", "I'm dropping deeper coach / I'm dropping deeper", "„Dropping deeper” to naturalne określenie cofania się."]),
  ph("coach", "both", "Hold your shape!", "Utrzymajcie ustawienie!", "Trener chce, żeby drużyna nie rozbiegała się i zachowała odległości między liniami.",
    ["Prowadzicie 1:0, a rywale mocno atakują. Trener woła „Hold your shape!”. O co mu chodzi?", "Żeby zachować ustawienie i odległości między liniami", "Żeby zatrzymać się i nie ruszać", "Żeby zmienić ustawienie na bardziej ofensywne", "„Shape” to ustawienie drużyny. „Hold” znaczy tu „utrzymaj”, a nie „stój w miejscu”."],
    ["Powiedz kolegom, żeby utrzymali ustawienie.", "hold your shape guys away", "hold your shape guys / hold your shape", "„Hold your shape” jest krótkie i zrozumiałe w każdej drużynie."]),
  ph("coach", "both", "Stay compact!", "Trzymajcie się blisko siebie!", "Trener prosi o zwarcie linii, żeby rywal nie miał miejsca między nimi.",
    ["Rywale mają dużo miejsca między Waszymi liniami. Trener woła „Stay compact!”. Czego chce?", "Żeby linie były blisko siebie i zamknęły przestrzeń", "Żeby rozciągnąć grę na całą szerokość", "Żeby grać dłuższymi podaniami", "„Compact” to zwarty, ściśnięty. Chodzi o małe odległości między zawodnikami i liniami."],
    ["Poproś wszystkich o zwartość.", "stay compact everyone stretch", "stay compact everyone / stay compact", "„Stay compact” to prosta prośba, którą rozumie każdy zawodnik."]),
  ph("coach", "both", "Next ball!", "Następna piłka! (Zapomnij o błędzie.)", "Mówisz sobie albo koledze po błędzie: skup się na kolejnej akcji.",
    ["Straciłeś piłkę, ale koledzy to obronili. Trener woła „Next ball!”. Co to znaczy?", "Zapomnij o błędzie i skup się na następnej akcji", "Wymień piłkę na nową", "Oddaj piłkę rywalom", "„Next ball” to zwrot motywacyjny: błąd został za Tobą, liczy się kolejna akcja."],
    ["Powiedz do siebie: następna piłka, skupienie.", "next ball stay focused last", "next ball stay focused / next ball", "Można zostać przy samym „Next ball!” albo dodać „stay focused”."]),
  ph("coach", "both", "Switch it!", "Zmień stronę gry!", "Trener lub kolega prosi o długie zagranie na drugą stronę boiska, gdzie jest wolne miejsce.",
    ["Rywale zagęścili jedną stronę, druga jest pusta. Trener woła „Switch it!”. Co robisz?", "Zagrywasz piłkę na drugą stronę boiska", "Zamieniasz się koszulką z kolegą", "Wracasz do własnego pola karnego", "„Switch” to zmiana. W piłce najczęściej znaczy zmianę strony gry."],
    ["Poproś kolegę o zmianę strony gry.", "switch it please square", "switch it / switch it please", "„Switch it!” to standardowe wezwanie do zmiany strony."]),
];

const ROLES: Phrase[] = [
  ph("roles", "field", "I play centre-back.", "Gram na środku obrony.", "Mówisz trenerowi albo kolegom, na jakiej pozycji grasz. W USA pisze się „center-back”.",
    ["Kolega pyta: „Where do you play?”. Odpowiadasz: „I play centre-back.”. Gdzie grasz?", "Na środku obrony", "Na środku pomocy", "W bramce", "„Centre-back” to środkowy obrońca. Pytanie „Where do you play?” znaczy „Na jakiej pozycji grasz?”."],
    ["Powiedz, że grasz na środku obrony.", "I play centre-back goalkeeper at", "I play centre-back", "Po „play” podajemy pozycję bez przedimka: „I play centre-back”."]),
  ph("roles", "gk", "I'm a goalkeeper.", "Jestem bramkarzem.", "Mówisz trenerowi, że jesteś bramkarzem (zawodnik z pola to „outfield player”).",
    ["Trener pyta: „Are you an outfield player or a goalkeeper?”. Co oznacza „outfield player”?", "Zawodnik z pola", "Trener bramkarzy", "Zawodnik rezerwowy", "„Outfield player” to każdy zawodnik oprócz bramkarza. Nie myl z zawodnikiem rezerwowym (substitute)."],
    ["Powiedz, że jesteś bramkarzem.", "I'm a goalkeeper outfield player", "I'm a goalkeeper", "Zwrot „I'm a goalkeeper” jest pełnym, poprawnym zdaniem."]),
  ph("roles", "field", "I can play on either wing.", "Mogę grać na obu skrzydłach.", "Odpowiadasz na pytanie o elastyczność pozycji. „Either” znaczy „którekolwiek z dwóch”.",
    ["Trener pyta, czy zagrasz po lewej lub prawej stronie. Mówisz: „I can play on either wing.”. Co to znaczy?", "Mogę grać na każdym skrzydle", "Gram tylko na lewym skrzydle", "Wolę grać w środku", "„Either wing” to „któreś ze skrzydeł”: lewe albo prawe, jak trzeba."],
    ["Powiedz, że możesz grać na obu skrzydłach.", "I can play on either wing both", "I can play on either wing", "Po „either” używamy liczby pojedynczej: „either wing”."]),
  ph("roles", "field", "I like to get forward.", "Lubię włączać się do ataku.", "Mówi to najczęściej boczny obrońca lub pomocnik, który chętnie podłącza się do akcji ofensywnych.",
    ["Obrońca mówi: „I like to get forward.”. Co lubi robić?", "Włączać się do ataku", "Zostawać na własnej połowie", "Bronić bramki", "„Get forward” to „iść do przodu”, czyli podłączać się do ataku."],
    ["Powiedz, że lubisz włączać się do ataku.", "I like to get forward back", "I like to get forward", "„I like to + czasownik” to prosty sposób, żeby mówić o swoim stylu gry."]),
  ph("roles", "both", "I'm good with my feet.", "Dobrze gram nogami.", "Zwrot szczególnie ważny dla bramkarza grającego piłką nogami, ale mówi go też obrońca lub pomocnik.",
    ["Bramkarz mówi: „I'm good with my feet.”. Co ma na myśli?", "Dobrze gra piłką nogami", "Ma silne nogi i szybko biega", "Ma duże stopy", "„Good with my feet” to umiejętność gry piłką nogami: podania, przyjęcie, rozegranie."],
    ["Powiedz, że dobrze grasz nogami.", "I'm good with my feet hands", "I'm good with my feet", "„Good with” + rzecz to „dobry w czymś”."]),
  ph("roles", "field", "I'm left-footed.", "Gram lewą nogą (jestem lewonożny).", "Mówisz, której nogi używasz lepiej. „Right-footed” to prawonożny, „two-footed” – grający obiema.",
    ["Trener pyta: „Which foot do you prefer?”. Odpowiadasz: „I'm left-footed.”. Co to znaczy?", "Lepiej grasz lewą nogą", "Masz kontuzję lewej nogi", "Grasz tylko na lewej stronie boiska", "„Left-footed” opisuje silniejszą nogę, a nie stronę boiska ani uraz."],
    ["Powiedz, że jesteś lewonożny.", "I'm left-footed right-footed also", "I'm left-footed", "Przymiotnik „left-footed” opisuje silniejszą nogę zawodnika."]),
];

const TRAINING: Phrase[] = [
  ph("training", "both", "Two touches!", "Dwa kontakty z piłką!", "Trener ogranicza grę: wolno dotknąć piłkę najwyżej dwa razy.",
    ["W grze trener ogłasza „Two touches!”. Co to znaczy?", "Możesz dotknąć piłkę najwyżej dwa razy", "Masz dwie próby strzału", "Gra trwa dwie minuty", "„Touch” to kontakt z piłką. „Two touches” to limit grania na dwa kontakty."],
    ["Powiedz: gramy na dwa kontakty.", "two touches only one", "two touches / two touches only", "Limit podajemy po prostu: „two touches”."]),
  ph("training", "both", "Get in pairs.", "Dobierzcie się w pary.", "Typowe polecenie przed ćwiczeniem podań lub rozgrzewką.",
    ["Trener mówi „Get in pairs.”. Co robicie?", "Dobieracie się w pary", "Ustawiacie się w trójki", "Zamieniacie się koszulkami", "„Pair” to para. „Get in pairs” to „dobierzcie się w pary”."],
    ["Zapytaj kolegę, czy chce być w parze.", "do you want to pair up with", "do you want to pair up", "„Pair up” to czasownik frazowy: dobrać się w parę."]),
  ph("training", "both", "Water break!", "Przerwa na wodę!", "Krótka przerwa w treningu na picie. Zawsze możesz poprosić o wodę, gdy czujesz się źle.",
    ["Po intensywnej serii trener woła „Water break!”. Co możesz zrobić?", "Napić się wody i chwilę odpocząć", "Zacząć kolejną serię", "Skończyć trening", "„Break” to przerwa. „Water break” to przerwa na picie."],
    ["Zapytaj, czy możesz napić się wody.", "can I grab get some water", "can I grab some water / can I get some water", "„Can I grab/get some water?” to uprzejma i naturalna prośba."]),
  ph("training", "both", "Bibs on!", "Załóżcie znaczniki!", "„Bibs” to kolorowe znaczniki do podziału na drużyny.",
    ["Trener rzuca Wam kolorowe znaczniki i woła „Bibs on!”. Co robicie?", "Zakładacie znaczniki (podział na drużyny)", "Zdejmujecie buty", "Ustawiacie bramki", "„Bib” to koszulka-znacznik do treningu. „Bibs on!” znaczy „zakładamy znaczniki”."],
    ["Zapytaj, kto ma żółte znaczniki.", "who's got the yellow bibs goals", "who's got the yellow bibs", "„Who's got …?” to naturalne pytanie o to, kto coś ma."]),
  ph("training", "both", "Jog back.", "Wracajcie truchtem.", "Po ćwiczeniu wracasz na miejsce spokojnym biegiem.",
    ["Po ćwiczeniu trener mówi „Jog back.”. Co robicie?", "Wracacie na miejsce truchtem", "Biegniecie sprintem", "Siadacie na trawie", "„Jog” to trucht, wolny bieg. „Jog back” to wrócić truchtem."],
    ["Powiedz: wracamy truchtem.", "jog back slowly sprint", "jog back / jog back slowly", "„Jog back” to krótkie, typowe polecenie na treningu."]),
  ph("training", "both", "How many reps are left?", "Ile powtórzeń zostało?", "„Rep” to skrót od „repetition”, czyli powtórzenie w ćwiczeniu.",
    ["Zawodnik pyta trenera „How many reps are left?”. O co pyta?", "Ile powtórzeń zostało", "Ile minut do końca", "Ile osób jest w grupie", "„Reps” to powtórzenia, a „left” znaczy tu „pozostało”."],
    ["Zapytaj, ile jeszcze powtórzeń.", "how many reps are do I have left", "how many reps are left / how many reps do I have left", "Obie formy są poprawne: „are left” i „do I have left”."]),
];

const PRESSING: Phrase[] = [
  ph("pressing", "both", "Press on the back pass!", "Pressuj przy podaniu do tyłu!", "Sygnał do rozpoczęcia pressingu: rywal cofa piłkę do własnego obrońcy lub bramkarza.",
    ["Rywal cofa piłkę do bramkarza. Trener woła „Press on the back pass!”. Kiedy zaczynacie pressing?", "Gdy rywal zagra piłkę do tyłu", "Gdy rywal strzela na bramkę", "Gdy zaczyna się druga połowa", "„Back pass” to podanie do tyłu. Takie podanie jest dla drużyny sygnałem (trigger) do ataku na piłkę."],
    ["Powiedz kolegom, że pressujecie przy podaniu do tyłu.", "we press on the back pass long", "we press on the back pass / press on the back pass", "„Press on …” opisuje moment, w którym zaczynacie pressing."]),
  ph("pressing", "both", "Show him outside!", "Prowadź go na zewnątrz!", "Obrońca ustawia się tak, by rywal poszedł w stronę linii bocznej, gdzie ma mniej miejsca.",
    ["Obrońca stoi 1 na 1 ze skrzydłowym przy linii. Trener woła „Show him outside!”. Co robisz?", "Ustawiasz się tak, by rywal poszedł w stronę linii bocznej", "Wpuszczasz go do środka boiska", "Wybiegasz do przodu bez ustawienia", "„Show him outside” to „skieruj go na zewnątrz”. Tak ograniczasz mu opcje."],
    ["Powiedz, że prowadzisz go na zewnątrz.", "I'll show him outside inside", "I'll show him outside", "„I'll …” to naturalny sposób, by powiedzieć, co zaraz zrobisz."]),
  ph("pressing", "both", "Cut off the passing lane!", "Zamknij linię podania!", "Ustawiasz się tak, żeby rywal nie mógł podać do wolnego kolegi.",
    ["Rywal ma piłkę, a jego kolega stoi wolny kilka metrów dalej. Trener woła „Cut off the passing lane!”. Co robisz?", "Ustawiasz się tak, by zablokować podanie do wolnego zawodnika", "Idziesz po piłkę do bramkarza", "Odbierasz piłkę rękami", "„Passing lane” to linia, którą może przejść podanie. „Cut off” to odciąć."],
    ["Powiedz, że zamykasz linię podania.", "I'm cutting off the passing lane goal", "I'm cutting off the passing lane", "„Cut off” to czasownik frazowy: odciąć, zablokować drogę."]),
  ph("pressing", "both", "Stay goal-side!", "Bądź między rywalem a bramką!", "Obrońca stoi bliżej własnej bramki niż rywal, którego pilnuje.",
    ["Napastnik rywala biegnie za Twoimi plecami. Kolega woła „Stay goal-side!”. Jak masz stać?", "Między rywalem a własną bramką", "Za plecami rywala, bliżej jego bramki", "Przy linii bocznej", "„Goal-side” to po stronie bramki. Stoisz więc pomiędzy rywalem a własną bramką."],
    ["Przypomnij koledze: bądź między rywalem a bramką.", "stay goal-side tight behind", "stay goal-side / stay goal-side tight", "„Stay goal-side” to jedno z najczęstszych poleceń dla obrońców."]),
  ph("pressing", "both", "Don't dive in!", "Nie rzucaj się do piłki!", "Obrońca nie wchodzi nieprzemyślanie w wślizg lub odbiór, tylko czeka na dobry moment.",
    ["Obrońca rzuca się do odbioru i rywal go mija. Trener woła „Don't dive in!”. Czego chce?", "Żeby nie rzucać się nieprzemyślanie do odbioru", "Żeby nigdy nie bronić", "Żeby wejść wślizgiem natychmiast", "„Dive in” to wejść zbyt wcześnie lub nieostrożnie. „Don't dive in” to „zachowaj cierpliwość”."],
    ["Powiedz sobie: nie rzucam się, czekam.", "don't dive in stay on your feet", "don't dive in / don't dive in stay on your feet", "„Stay on your feet” znaczy „zostań na nogach”, czyli nie ląduj w wślizgu."]),
  ph("pressing", "both", "Track your runner!", "Pilnuj swojego zawodnika!", "Przy stałym fragmencie lub kontrze: podążasz za rywalem, który wbiega w pole karne.",
    ["Przy stałym fragmencie rywal biegnie w pole karne. Trener woła „Track your runner!”. Co robisz?", "Podążasz za zawodnikiem, który wbiega", "Stoisz w miejscu", "Pilnujesz piłki przy chorągiewce", "„Runner” to zawodnik wbiegający, a „track” znaczy tu „śledzić, podążać”."],
    ["Powiedz, że pilnujesz swojego zawodnika.", "I've got my man your runner", "I've got my man", "„I've got my man” to znana formuła przy kryciu."]),
];

const BUILDUP: Phrase[] = [
  ph("build-up", "both", "Play it out from the back.", "Wyprowadzajcie piłkę od tyłu.", "Rozgrywacie piłkę od bramkarza i obrońców zamiast wybijać ją daleko.",
    ["Bramkarz łapie piłkę, a rywale cofają się. Trener woła „Play it out from the back.”. Co robicie?", "Wyprowadzacie piłkę od bramkarza podaniami", "Bramkarz wybija daleko", "Zatrzymujecie grę", "„Play out from the back” to rozgrywanie piłki od własnej obrony."],
    ["Powiedz: wyprowadzamy od bramkarza.", "let's play it out from the back long", "let's play it out from the back", "„Let's …” to naturalne zaproszenie do wspólnego działania."]),
  ph("build-up", "gk", "Keeper, short!", "Bramkarzu, krótko!", "Obrońca prosi bramkarza o krótkie rozegranie (nie wykop).",
    ["Jesteś wolnym obrońcą i chcesz, żeby bramkarz zagrał do Ciebie krótko. Co wołasz?", "Keeper, short!", "Keeper, long!", "Keeper, away!", "„Short” to krótko. Bramkarz usłyszy, że ma Cię wybrać krótkim podaniem."],
    ["Poproś bramkarza o krótkie rozegranie.", "keeper short long please", "keeper short / keeper short please", "Zawołanie do bramkarza zaczyna się od „keeper”."]),
  ph("build-up", "both", "Find the free man.", "Znajdź wolnego zawodnika.", "Rada dla zawodnika z piłką, otoczonego rywalami: szukaj kolegi bez krycia.",
    ["Masz piłkę, a kilku rywali stoi blisko. Trener woła „Find the free man.”. Co robisz?", "Szukasz wolnego kolegi do podania", "Dryblujesz do końca", "Strzelasz z daleka", "„Free man” to zawodnik bez krycia. „Find” to znajdź, poszukaj."],
    ["Powiedz: szukam wolnego zawodnika.", "I'm looking for the free man ball", "I'm looking for the free man", "„Look for” to szukać; „the free man” to wolny zawodnik."]),
  ph("build-up", "both", "Play through the middle.", "Grajcie środkiem.", "Gdy skrzydła są zamknięte, a w środku jest przestrzeń.",
    ["Skrzydła są zamknięte, w środku jest miejsce. Co poleca trener, mówiąc „Play through the middle.”?", "Rozegrać akcję przez środek boiska", "Grać tylko wzdłuż linii bocznej", "Wykopać piłkę na aut", "„Through the middle” to środkiem. Wskazuje drogę, którą ma przejść akcja."],
    ["Powiedz: grajmy środkiem.", "let's play through the middle wide", "let's play through the middle", "„Through” znaczy tu „przez”."]),
  ph("build-up", "field", "Overlap!", "Wbiegnij na zewnątrz za kolegą!", "Boczny obrońca lub pomocnik wbiega poza plecami skrzydłowego, który ma piłkę, tworząc dodatkową opcję.",
    ["Skrzydłowy ma piłkę, a Ty biegniesz obok linii poza jego plecami. Trener woła „Overlap!”. Co to jest?", "Bieg po zewnętrznej, poza plecami kolegi z piłką", "Cofnięcie się do obrony", "Zmiana bramkarza", "„Overlap” to nakładka: wbiegasz na zewnątrz kolegi i dajesz mu dodatkową opcję podania."],
    ["Powiedz, że robisz nakładkę.", "I'll overlap on the outside I'm overlapping", "I'll overlap / I'll overlap on the outside / I'm overlapping", "„Overlap” może być czasownikiem: „I'll overlap”."]),
  ph("build-up", "both", "Lay it off!", "Wyłóż piłkę!", "Zagraj piłkę krótko do kolegi (zwykle jednym kontaktem), często w stronę, z której przyszła.",
    ["Napastnik stoi tyłem do bramki, a Ty biegniesz z tyłu. Chcesz, by wyłożył Ci piłkę. Co wołasz?", "Lay it off!", "Man on!", "Away!", "„Lay it off” to wyłożyć piłkę koledze, żeby mógł uderzyć lub grać dalej."],
    ["Poproś o wyłożenie piłki.", "lay it off to me away", "lay it off to me / lay it off", "„To me” mówi, komu ma wyłożyć."]),
];

const MOVEMENT: Phrase[] = [
  ph("movement", "both", "Show for the ball!", "Pokaż się do podania!", "Odsłaniasz się, by kolega mógł Cię zobaczyć i zagrać.",
    ["Kolega z piłką szuka podania, a Ty stoisz zasłonięty. Trener woła „Show for the ball!”. Co robisz?", "Odsłaniasz się i pokazujesz do podania", "Chowasz się za rywalem", "Wracasz do własnej bramki", "„Show for the ball” to „pokaż się do piłki”."],
    ["Powiedz, że pokazujesz się do podania.", "I'm showing for the ball hide", "I'm showing for the ball", "Pokazywanie się to podstawa gry bez piłki."]),
  ph("movement", "both", "Check your shoulder!", "Spójrz przez ramię!", "Zanim dostaniesz piłkę, sprawdzasz, gdzie są rywale i wolne miejsce.",
    ["Zanim dostaniesz piłkę, trener woła „Check your shoulder!”. Po co?", "Żeby zobaczyć, gdzie są rywale i wolna przestrzeń", "Żeby poprawić koszulkę", "Żeby zawołać kolegę", "„Check your shoulder” to „zerknij przez ramię”. Dzięki temu wiesz, co zrobisz z piłką."],
    ["Przypomnij koledze, żeby się rozejrzał.", "check your shoulder before you receive", "check your shoulder / check your shoulder before you receive", "„Before you receive” to „zanim przyjmiesz piłkę”."]),
  ph("movement", "field", "Run in behind!", "Wbiegnij za linię obrony!", "Napastnik lub skrzydłowy wbiega za plecy obrońców, w wolne miejsce.",
    ["Obrońcy rywala stoją wysoko. Kolega z piłką woła do napastnika „Run in behind!”. Co ma zrobić?", "Wbiec za plecy obrońców", "Cofnąć się po piłkę", "Zostać w miejscu", "„Run in behind” to bieg za linię obrony. Pamiętaj o momencie biegu, żeby nie być na spalonym."],
    ["Powiedz, że wbiegasz za plecy.", "I'm going in behind run back", "I'm going in behind", "„Going in behind” opisuje bieg za plecy obrońców."]),
  ph("movement", "both", "Drop into the pocket.", "Wejdź w kieszeń (przestrzeń między liniami).", "„Pocket” to wolna przestrzeń między liniami rywali, w której możesz przyjąć piłkę.",
    ["Pomocnik stoi między liniami rywali i prosi o piłkę. Co to jest „pocket”?", "Wolna przestrzeń między liniami rywali", "Kieszeń w spodenkach", "Narożnik boiska", "W piłkarskim angielskim „pocket” to przestrzeń między liniami, gdzie rywalom trudno Cię dopaść."],
    ["Powiedz, że schodzisz w kieszeń.", "I'll drop into the pocket lift", "I'll drop into the pocket", "„Drop into” oznacza tu wejść w przestrzeń, cofając się o krok."]),
  ph("movement", "both", "Stretch the pitch!", "Rozciągnijcie boisko!", "Trener chce, żebyście stali szeroko (i wysoko), by rywale musieli się rozciągnąć.",
    ["Trener woła „Stretch the pitch!”. Czego oczekuje?", "Żebyście rozeszli się szeroko, by rozciągnąć obronę rywala", "Żebyście zrobili ćwiczenia rozciągające", "Żebyście zagęścili środek", "„Stretch the pitch” to wykorzystanie całej szerokości boiska, a nie rozciąganie mięśni."],
    ["Powiedz, że stoisz szeroko.", "I'm staying wide narrow", "I'm staying wide", "„Wide” to szeroko; przeciwieństwem jest „narrow”."]),
  ph("movement", "field", "Time your run!", "Wyczuj moment biegu!", "Zbyt wczesny start może skończyć się spalonym. Dobry moment biegu to połowa sukcesu.",
    ["Napastnik biegnie za wcześnie i jest na spalonym. Trener woła „Time your run!”. Co ma poprawić?", "Wybrać odpowiedni moment startu", "Biec szybciej", "Zmienić buty", "„Time your run” to wybierz moment. Wyprzedzenie podania często oznacza spalony."],
    ["Powiedz, że lepiej wyczujesz moment biegu.", "I'll time my run better late", "I'll time my run / I'll time my run better", "„Time” bywa czasownikiem: odmierzyć moment."]),
];

const INTRO: Phrase[] = [
  ph("intro", "both", "Hi, I'm Kuba. Nice to meet you.", "Cześć, jestem Kuba. Miło Cię poznać.", "Pierwsze zdanie w szatni. Zamiast „Kuba” użyj swojego imienia.",
    ["Nowy kolega podaje Ci rękę i mówi „Nice to meet you.”. Co odpowiadasz?", "Nice to meet you too.", "See you later.", "Good game.", "„Nice to meet you too.” to standardowa odpowiedź. „See you later.” mówi się na pożegnanie."],
    ["Przedstaw się: cześć, jestem Kuba.", "Hi I'm Kuba my name is", "Hi I'm Kuba / Hi my name is Kuba", "Dwie poprawne formy: „I'm …” lub „My name is …”."]),
  ph("intro", "both", "I've just joined the club.", "Dopiero co dołączyłem do klubu.", "Mówisz, że jesteś nowy. Pomaga to w szatni i na treningu.",
    ["Nowy zawodnik mówi „I've just joined the club.”. Co to znaczy?", "Dopiero co dołączył do klubu", "Właśnie opuścił klub", "Jest trenerem", "„Just joined” to „właśnie dołączył”. Czas Present Perfect pokazuje świeżą zmianę."],
    ["Powiedz, że dopiero dołączyłeś do klubu.", "I've just joined the club left", "I've just joined the club", "„I've just …” to „właśnie coś zrobiłem”."]),
  ph("intro", "both", "I'm from Poland.", "Jestem z Polski.", "Odpowiedź na pytanie „Where are you from?”.",
    ["Kolega pyta „Where are you from?”. O co pyta?", "Skąd jesteś", "Ile masz lat", "Na jakiej pozycji grasz", "„Where … from” pyta o pochodzenie. Odpowiedź: „I'm from …”."],
    ["Powiedz, że jesteś z Polski.", "I'm from Poland in play", "I'm from Poland", "„I'm from + kraj lub miasto” to najprostsza odpowiedź."]),
  ph("intro", "both", "My English isn't perfect, but I'm learning.", "Mój angielski nie jest idealny, ale się uczę.", "Uprzedzasz, że możesz robić błędy, i prosisz o cierpliwość.",
    ["Po co mówić w nowej szatni „My English isn't perfect, but I'm learning.”?", "Żeby uprzedzić, że możesz robić błędy, i poprosić o cierpliwość", "Żeby zakończyć rozmowę", "Żeby powiedzieć, że angielski jest niepotrzebny", "To uczciwa i sympatyczna informacja. „But” łączy dwie części zdania."],
    ["Powiedz: mój angielski nie jest idealny, ale się uczę.", "my English isn't perfect but I'm learning good", "my English isn't perfect but I'm learning", "„But” łączy ograniczenie z postawą: uczysz się."]),
  ph("intro", "both", "Could you say that again, please?", "Czy możesz to powtórzyć?", "Uprzejma prośba o powtórzenie, gdy nie zrozumiałeś trenera lub kolegi.",
    ["Nie zrozumiałeś trenera. Co możesz powiedzieć?", "Could you say that again, please?", "See you tomorrow.", "I'm from Poland.", "„Could you …, please?” to uprzejma prośba. Pytanie o powtórzenie to najlepsze, co możesz zrobić, gdy czegoś nie rozumiesz."],
    ["Poproś o powtórzenie.", "could you say that again please once", "could you say that again please / could you say that again", "„Say that again” to powiedz to jeszcze raz."]),
  ph("intro", "both", "Could you speak a bit slower?", "Czy możesz mówić trochę wolniej?", "Gdy ktoś mówi zbyt szybko. Nie wstydź się pytać.",
    ["Trener mówi bardzo szybko. Co mówisz?", "Could you speak a bit slower?", "Could you pass the ball?", "Could you sign here?", "„A bit slower” to „trochę wolniej”. To jedno z najbardziej przydatnych pytań w nowym klubie."],
    ["Poproś, żeby mówił wolniej.", "could you speak a bit slower faster", "could you speak a bit slower / could you speak slower", "„A bit” łagodzi prośbę."]),
];

const TRIALS: Phrase[] = [
  ph("trials", "both", "What time should I be there for the trial?", "O której mam być na testach?", "Pytasz o godzinę, na którą masz przyjść. Zapytaj też, ile wcześniej trzeba być na miejscu.",
    ["Chcesz wiedzieć, na którą godzinę przyjść na testy. Które pytanie zadasz?", "What time should I be there for the trial?", "What is your name?", "Where do you play?", "„What time should I be there?” to pytanie o godzinę przyjścia. „Trial” to testy lub trening próbny."],
    ["Zapytaj, o której masz być na testach.", "what time should I be there for the trial now", "what time should I be there for the trial", "„Should I be there” to „mam być na miejscu”."]),
  ph("trials", "both", "What should I bring?", "Co mam ze sobą zabrać?", "Pytasz o sprzęt: buty, ochraniacze, strój, dokumenty.",
    ["Pytasz trenera „What should I bring?”. O co pytasz?", "Co zabrać ze sobą na testy", "Kto jeszcze przyjdzie", "Gdzie zaparkować", "„Bring” to przynieść, zabrać ze sobą."],
    ["Zapytaj, co masz zabrać.", "what should do I need to bring", "what should I bring / what do I need to bring", "Obie wersje są naturalne i uprzejme."]),
  ph("trials", "both", "Will there be a match, or just drills?", "Czy będzie mecz, czy tylko ćwiczenia?", "Pytasz, czy na testach będzie gra, czy same ćwiczenia (drills).",
    ["Pytasz trenera „Will there be a match, or just drills?”. O co pytasz?", "Czy będzie gra, czy tylko ćwiczenia", "Ile potrwa dojazd", "Czy dostaniesz koszulkę", "„Drills” to ćwiczenia treningowe. „Match” to mecz lub gra."],
    ["Zapytaj, czy będzie mecz, czy same ćwiczenia.", "will there be a match game or just drills", "will there be a match or just drills / will there be a game or just drills", "„Match” i „game” są tu zamienne."]),
  ph("trials", "both", "Which position will I play?", "Na jakiej pozycji będę grać?", "Przydatne, gdy chcesz wiedzieć, jak trener Cię widzi.",
    ["Co oznacza pytanie „Which position will I play?”.", "Na jakiej pozycji będę grać?", "W którym miejscu mam mieszkać?", "Jak długo mam grać?", "„Position” to pozycja na boisku. „Will I play” to „czy będę grać”."],
    ["Zapytaj, na jakiej pozycji będziesz grać.", "which what position will I play", "which position will I play / what position will I play", "„Which” i „what” są tu poprawne."]),
  ph("trials", "gk", "Will the goalkeepers train separately?", "Czy bramkarze trenują osobno?", "Pytanie bramkarza: czy będzie osobna sesja dla bramkarzy z trenerem bramkarzy.",
    ["Jesteś bramkarzem i pytasz „Will the goalkeepers train separately?”. O co pytasz?", "Czy bramkarze będą trenować osobno", "Czy bramkarze zagrają w polu", "Czy będzie przerwa", "„Separately” to osobno. Zwykle bramkarze mają własny blok ćwiczeń."],
    ["Zapytaj, czy bramkarze trenują osobno.", "will the goalkeepers train separately together", "will the goalkeepers train separately", "„Train” oznacza tu „trenować”."]),
  ph("trials", "both", "I'm fit and ready to play.", "Jestem zdrowy i gotowy do gry.", "Mów to tylko, jeśli to prawda. Przy urazie powiedz o nim trenerowi, np. „I've got a knock” (drobny uraz).",
    ["Trener pyta o zdrowie przed testami. Które zdanie oznacza „jestem zdrowy i gotowy”?", "I'm fit and ready to play.", "I'm tired and I can't run.", "I've got a knock.", "„Fit” oznacza tu w dobrej formie, zdrowy. „I've got a knock” to drobny uraz: warto powiedzieć o nim trenerowi przed grą."],
    ["Powiedz, że jesteś zdrowy i gotowy.", "I'm fit and ready to play tired", "I'm fit and ready to play / I'm fit and ready", "„Fit and ready” to naturalne połączenie."]),
];

const EXPECTATIONS: Phrase[] = [
  ph("expectations", "both", "What do you expect from me?", "Czego ode mnie oczekujesz?", "Pytanie do trenera o jego oczekiwania wobec Ciebie, w treningu i w meczu.",
    ["Co chcesz usłyszeć, zadając trenerowi pytanie „What do you expect from me?”.", "Czego trener oczekuje ode mnie", "Ile zarabiam", "Gdzie jest szatnia", "„Expect from” to oczekiwać od. To pytanie pokazuje zaangażowanie."],
    ["Zapytaj trenera, czego od Ciebie oczekuje.", "what do you expect from me team", "what do you expect from me", "Szyk pytania: „what do you expect”."]),
  ph("expectations", "both", "What are you looking for in a player in my position?", "Czego szukasz u zawodnika na mojej pozycji?", "Pytasz o cechy ważne dla trenera na Twojej pozycji.",
    ["Co oznacza „What are you looking for in a player in my position?”.", "Jakich cech szukasz u zawodnika na mojej pozycji?", "Ilu zawodników szukasz do drużyny?", "Gdzie gra mój kolega?", "„Look for” to szukać. „In a player” to „u zawodnika”."],
    ["Zapytaj o cechy zawodnika na Twojej pozycji.", "what are you looking for in a player in my position team", "what are you looking for in a player in my position", "Pytanie jest długie, ale składa się z krótkich, znanych części."]),
  ph("expectations", "both", "Could you give me some feedback?", "Czy możesz dać mi informację zwrotną?", "Prosisz o ocenę po meczu lub treningu. „Feedback” nie ma liczby mnogiej.",
    ["Po meczu prosisz trenera „Could you give me some feedback?”. O co prosisz?", "O informację zwrotną o swojej grze", "O wolne w następnym tygodniu", "O nowe buty", "„Feedback” to uwagi o tym, co poszło dobrze i co poprawić. Mówimy „some feedback”, nie „feedbacks”."],
    ["Poproś trenera o informację zwrotną.", "could you give me some feedback a", "could you give me some feedback", "Przy „feedback” używamy „some”."]),
  ph("expectations", "both", "What should I work on?", "Nad czym powinienem popracować?", "Pytanie, które pokazuje chęć rozwoju. Dobrze pasuje po treningu.",
    ["Co oznacza „What should I work on?”.", "Nad czym powinienem popracować?", "Gdzie mam pracować?", "Ile mam pracować?", "„Work on” to pracować nad czymś (umiejętnością, techniką, słabszą nogą)."],
    ["Zapytaj, nad czym masz popracować.", "what should I work on in", "what should I work on", "„Work on” stoi na końcu pytania."]),
  ph("expectations", "gk", "Do you want me to play out from the back?", "Czy chcesz, żebym grał piłkę od tyłu?", "Pytanie bramkarza o styl gry: rozgrywanie od bramki czy dalekie wykopy.",
    ["Jesteś bramkarzem i pytasz „Do you want me to play out from the back?”. O co pytasz?", "Czy trener chce, żebym rozgrywał piłkę od bramki", "Czy mam wybijać daleko", "Czy mam grać w ataku", "„Play out from the back” to rozgrywanie od własnej bramki. Pytanie pokazuje, że chcesz dopasować się do stylu drużyny."],
    ["Zapytaj, czy trener chce rozgrywania od bramki.", "do you want me to play out from the back long", "do you want me to play out from the back", "Zwrot „want me to + czasownik” to „chcesz, żebym …”."]),
  ph("expectations", "both", "When will I hear back from you?", "Kiedy dostanę odpowiedź?", "Pytasz grzecznie, kiedy trener da znać o decyzji po testach.",
    ["Po testach pytasz „When will I hear back from you?”. O co pytasz?", "Kiedy dostanę od Państwa odpowiedź", "Kiedy odbędzie się następny mecz", "Gdzie zaparkować", "„Hear back” to usłyszeć odpowiedź. To uprzejme pytanie o termin decyzji."],
    ["Zapytaj, kiedy dostaniesz odpowiedź.", "when will I hear back from you now", "when will I hear back from you / when will I hear back", "„Hear back from you” to dostać odpowiedź od Ciebie."]),
];

const MYROLE: Phrase[] = [
  ph("my-role", "both", "I'm at my best when I get time on the ball.", "Najlepiej gram, gdy mam czas przy piłce.", "Opisujesz, w jakich warunkach grasz najlepiej. Szczera informacja pomaga trenerowi.",
    ["Co mówi zawodnik: „I'm at my best when I get time on the ball.”?", "Że gra najlepiej, gdy ma czas przy piłce", "Że nie lubi grać piłką", "Że gra najlepiej bez piłki", "„At my best” to w swojej najlepszej formie. „Time on the ball” to czas na przyjęcie i decyzję."],
    ["Powiedz: najlepiej gram, gdy mam czas przy piłce.", "I'm at my best when I get time on the ball without", "I'm at my best when I get time on the ball", "„When I get …” to „gdy dostaję …”."]),
  ph("my-role", "field", "I'm strong in one-on-ones.", "Jestem mocny w pojedynkach jeden na jednego.", "Obrońca lub skrzydłowy opisuje swoją mocną stronę.",
    ["Obrońca mówi „I'm strong in one-on-ones.”. Co to znaczy?", "Dobrze radzi sobie w pojedynkach jeden na jednego", "Gra tylko jedną nogą", "Ma jednego kolegę w drużynie", "„One-on-one” to pojedynek jeden na jednego. „Strong in” to mocny w czymś."],
    ["Powiedz, że jesteś mocny w pojedynkach.", "I'm strong in one-on-ones weak", "I'm strong in one-on-ones", "Zwrot „strong in …” opisuje mocną stronę."]),
  ph("my-role", "both", "I read the game well.", "Dobrze czytam grę.", "Mówisz, że przewidujesz sytuacje i wcześnie podejmujesz decyzje.",
    ["Co oznacza „I read the game well.”?", "Dobrze przewiduję rozwój akcji", "Dużo czytam o piłce", "Dobrze znam przepisy", "„Read the game” to rozumieć i przewidywać grę. Nie chodzi o czytanie książek."],
    ["Powiedz, że dobrze czytasz grę.", "I read the game well badly", "I read the game well", "„Read the game” to częsty zwrot o zdolności przewidywania."]),
  ph("my-role", "both", "I'm still working on my weaker foot.", "Wciąż pracuję nad słabszą nogą.", "Uczciwa informacja o tym, co rozwijasz. Trenerzy cenią szczerość i chęć nauki.",
    ["Co mówi zawodnik: „I'm still working on my weaker foot.”?", "Że wciąż trenuje słabszą nogę", "Że ma kontuzję", "Że gra tylko słabszą nogą", "„Still working on” to nadal pracuję nad. „Weaker foot” to słabsza noga."],
    ["Powiedz, że pracujesz nad słabszą nogą.", "I'm still working on my weaker foot stronger", "I'm still working on my weaker foot", "„Still” podkreśla, że to proces."]),
  ph("my-role", "gk", "As a keeper, I like to command my area.", "Jako bramkarz lubię dowodzić swoim polem karnym.", "Bramkarz opisuje styl: aktywne wychodzenie do dośrodkowań i kierowanie obroną.",
    ["Bramkarz mówi „I like to command my area.”. Co to znaczy?", "Że aktywnie dowodzi polem karnym i kieruje obroną", "Że lubi stać przy linii", "Że nie lubi wychodzić z bramki", "„Command” to dowodzić, panować. „My area” to pole karne, za które odpowiada bramkarz."],
    ["Jesteś bramkarzem. Powiedz, że lubisz dowodzić polem karnym.", "as a keeper I like to command my area field", "as a keeper I like to command my area / I like to command my area", "„As a keeper” zaczyna zdanie i opisuje rolę."]),
  ph("my-role", "both", "I'm happy to play wherever the team needs me.", "Chętnie zagram tam, gdzie drużyna mnie potrzebuje.", "Mówi to zawodnik elastyczny. Nie obiecuj jednak niczego, czego nie potrafisz.",
    ["Co deklaruje zawodnik, który mówi „I'm happy to play wherever the team needs me.”?", "Że zagra tam, gdzie drużyna go potrzebuje", "Że gra tylko w środku", "Że nie chce grać", "„Wherever” to gdziekolwiek. Mówisz, że jesteś elastyczny, ale warto dodać, na której pozycji czujesz się najlepiej."],
    ["Powiedz, że zagrasz wszędzie, gdzie drużyna potrzebuje.", "I'm happy to play wherever the team needs me nowhere", "I'm happy to play wherever the team needs me", "„Wherever the team needs me” to jedno wyrażenie."]),
];

const APPLICATION: Phrase[] = [
  ph("application", "both", "Dear Coach Smith,", "Szanowny Trenerze Smith,", "Formalny początek wiadomości do trenera, którego nie znasz. Zamiast „Smith” wpisz nazwisko trenera.",
    ["Piszesz pierwszy raz do trenera, którego nie znasz. Jak zaczniesz wiadomość?", "Dear Coach Smith,", "Hey mate,", "Yo coach!", "„Dear …” to formalne, grzeczne otwarcie. Luźne „Hey mate” nie pasuje do pierwszej wiadomości."],
    ["Zacznij formalną wiadomość do trenera Smitha.", "dear Coach Smith hey mate", "dear Coach Smith", "„Dear + tytuł + nazwisko” to bezpieczne otwarcie."]),
  ph("application", "both", "I'm writing to ask about a trial.", "Piszę, aby zapytać o testy.", "Cel wiadomości w jednym zdaniu. Najlepiej na samym początku.",
    ["Po powitaniu piszesz „I'm writing to ask about a trial.”. Co jest celem wiadomości?", "Prośba o informację o testach", "Podziękowanie za mecz", "Skarga na trenera", "„I'm writing to …” to formalne wprowadzenie celu."],
    ["Napisz, że pytasz o testy.", "I'm writing to ask about a trial call", "I'm writing to ask about a trial", "„Ask about” to zapytać o coś."]),
  ph("application", "field", "I'm 17 years old and I play as a right-back.", "Mam 17 lat i gram jako prawy obrońca.", "Przykład z wiekiem 17 lat: wpisz swoje dane. Nie podawaj w wiadomości więcej danych osobowych, niż potrzeba (np. adresu domowego).",
    ["Które zdanie mówi: „Mam 17 lat i gram jako prawy obrońca”?", "I'm 17 years old and I play as a right-back.", "I have 17 years and I play right back goal.", "I'm 17 and I'm a coach.", "Po angielsku wiek podajemy przez „I'm … years old”, nie „I have … years”. „Right-back” to prawy obrońca."],
    ["Powiedz, ile masz lat i na jakiej pozycji grasz (przykład: 17 lat, prawy obrońca).", "I'm 17 years old and I play as a right-back have", "I'm 17 years old and I play as a right-back / I'm 17 and I play as a right-back", "„I'm 17” to krótsza, równie poprawna forma."]),
  ph("application", "both", "I've attached a short video of my games.", "Załączam krótkie nagranie moich meczów.", "Dołączasz link lub plik z nagraniem. Nie dołączaj niczego, czego nie chcesz udostępniać obcej osobie.",
    ["Piszesz „I've attached a short video of my games.”. Co robisz w wiadomości?", "Informujesz o dołączonym nagraniu", "Prosisz o nagranie od trenera", "Odwołujesz testy", "„Attach” to załączyć. „Video of my games” to nagranie z moich meczów."],
    ["Napisz, że załączasz krótkie nagranie.", "I've attached a short video of my games long", "I've attached a short video of my games", "„Attached” to załączone do wiadomości."]),
  ph("application", "gk", "I'm a goalkeeper looking for a new club.", "Jestem bramkarzem szukającym nowego klubu.", "Krótkie, jasne przedstawienie roli bramkarza w pierwszej wiadomości.",
    ["Jak po angielsku napiszesz, że jesteś bramkarzem szukającym nowego klubu?", "I'm a goalkeeper looking for a new club.", "I'm a coach looking for a goalkeeper.", "I'm a fan of a new club.", "„Looking for” to szukać. Tu: bramkarz szuka klubu, a nie odwrotnie."],
    ["Napisz, że jesteś bramkarzem szukającym klubu.", "I'm a goalkeeper looking for a new club coach", "I'm a goalkeeper looking for a new club", "„Looking for” po angielsku zawsze wymaga dopełnienia: „for a new club”."]),
  ph("application", "both", "Thank you for your time. Kind regards,", "Dziękuję za poświęcony czas. Z poważaniem,", "Typowe zakończenie wiadomości, po którym wpisujesz swoje imię i nazwisko.",
    ["Jakie zakończenie pasuje do formalnej wiadomości do trenera?", "Thank you for your time. Kind regards,", "See you, bro.", "Whatever, bye.", "„Kind regards” to uprzejme zakończenie. „Thank you for your time” dziękuje za czas, który trener poświęcił na przeczytanie wiadomości."],
    ["Zakończ wiadomość grzecznie.", "thank you for your time kind regards bro", "thank you for your time kind regards", "Po „Kind regards,” wpisujesz imię i nazwisko."]),
];

/** Kolejność tablic zgodna ze spisem `LESSONS_META` (test pilnuje zgodności). */
const BY_LESSON: Record<string, Phrase[]> = {
  partners: PARTNERS, coach: COACH, roles: ROLES, pressing: PRESSING, "build-up": BUILDUP, movement: MOVEMENT, training: TRAINING, intro: INTRO,
  trials: TRIALS, expectations: EXPECTATIONS, "my-role": MYROLE, application: APPLICATION,
};

export const LESSONS: Lesson[] = LESSONS_META.map((m) => ({ ...m, phrases: BY_LESSON[m.id] ?? [] }));
export const PHRASES: Phrase[] = LESSONS.flatMap((l) => l.phrases);
export const PHRASE_BY_ID: Record<string, Phrase> = Object.fromEntries(PHRASES.map((p) => [p.id, p]));
export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);
