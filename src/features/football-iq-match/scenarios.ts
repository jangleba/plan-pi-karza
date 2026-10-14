import type { DecisionGoal, MatchPlayer, PlannedAction, Scenario, ScenarioCoaching } from "./types";

type PlayerSpec = [number, number, number, string];
type Step = ["pass", number, number] | ["run" | "shift", number, number, number];
const zone = (xMin: number, xMax: number, yMin: number, yMax: number) => ({
  xMin,
  xMax,
  yMin,
  yMax,
});
const passGoal = (
  id: string,
  from: number,
  to: number,
  description: string,
  afterGoalId?: string,
): DecisionGoal => ({
  id,
  type: "pass",
  playerIds: [`home-${from}`],
  targetIds: [`home-${to}`],
  description,
  afterGoalId,
});
const moveGoal = (
  id: string,
  type: "run" | "shift",
  player: number,
  area: ReturnType<typeof zone>,
  description: string,
  requiresBall = false,
  afterGoalId?: string,
): DecisionGoal => ({
  id,
  type: requiresBall && type === "run" ? "carry" : type,
  playerIds: [`home-${player}`],
  zone: area,
  description,
  requiresBall,
  afterGoalId,
});

function makeScenario(
  id: string,
  title: string,
  _question: string,
  category: string,
  focus: string,
  home: PlayerSpec[],
  away: PlayerSpec[],
  steps: Step[],
  goals: DecisionGoal[],
  coaching: ScenarioCoaching,
  controlled = 8,
): Scenario {
  const players: MatchPlayer[] = [
    { id: "gk-away", team: "away", number: 1, role: "BR", goalkeeper: true, x: 50, y: 12 },
    ...away.map(([number, x, y, role]) => ({
      id: `away-${number}`,
      team: "away" as const,
      number,
      x,
      y,
      role,
    })),
    ...home.map(([number, x, y, role]) => ({
      id: `home-${number}`,
      team: "home" as const,
      number,
      x,
      y,
      role,
      controlled: number === controlled,
    })),
  ];
  const positions = new Map(players.map((p) => [p.id, { x: p.x, y: p.y }]));
  let carrier = `home-${controlled}`;
  const referenceActions: PlannedAction[] = steps.map((step, i) => {
    const playerId = `home-${step[1]}`;
    const from = { ...positions.get(playerId)! };
    if (step[0] === "pass") {
      const targetId = `home-${step[2]}`;
      carrier = targetId;
      return {
        id: `${id}-ref-${i}`,
        type: "pass",
        playerId,
        targetId,
        from,
        to: { ...positions.get(targetId)! },
      };
    }
    const to = { x: step[2], y: step[3] };
    positions.set(playerId, to);
    return {
      id: `${id}-ref-${i}`,
      type: step[0] === "run" && carrier === playerId ? "carry" : step[0],
      playerId,
      from,
      to,
    };
  });
  return {
    id,
    title,
    question: "Jak rozegrasz tę sytuację?",
    category,
    focus,
    seconds: 12,
    controlledPlayerId: `home-${controlled}`,
    ballCarrierId: `home-${controlled}`,
    players,
    referenceActions,
    goals,
    coaching,
    simulation: { reaction: 1.35, defenderSpeed: 1.8 },
  };
}

export const scenarios: Scenario[] = [
  makeScenario(
    "overload-switch-01",
    "Przeciążenie i wolna strona",
    "Jak wykorzystasz wolną stronę?",
    "Zmiana strony",
    "Rywal przesunął blok w lewo. Przenieś piłkę na prawe skrzydło i zaatakuj wolny korytarz.",
    [
      [8, 51, 108, "ŚP"],
      [7, 84, 79, "PS"],
      [10, 18, 66, "LS"],
      [11, 26, 116, "N"],
    ],
    [
      [4, 36, 40, "ŚO"],
      [5, 59, 51, "ŚO"],
      [7, 29, 70, "SP"],
      [3, 69, 68, "LO"],
      [6, 17, 92, "DP"],
    ],
    [
      ["pass", 8, 7],
      ["run", 7, 91, 37],
      ["shift", 10, 39, 62],
    ],
    [
      passGoal("switch", 8, 7, "przenieś piłkę do prawego skrzydłowego"),
      moveGoal(
        "wide",
        "run",
        7,
        zone(80, 97, 24, 58),
        "zaatakuj prawy korytarz z piłką",
        true,
        "switch",
      ),
    ],
    {
      success: "Przeniosłeś piłkę na dalszą stronę i poprowadziłeś akcję wolnym skrzydłem.",
      partial: "Wolna strona została rozpoznana, ale brakuje drugiego kroku.",
      risk: "Zaplanowana sekwencja nie wykorzystuje wolnego prawego skrzydła.",
      timing: "Najpierw zmiana strony, potem prowadzenie piłki do przodu.",
      space: "Celem jest prawy korytarz poza zagęszczonym środkiem.",
      consequence: "Piłka dociera do zawodnika, który może zaatakować skrzydłem.",
      recommendation: "Podaj do 7, potem poprowadź nim piłkę wzdłuż prawej linii.",
    },
  ),
  makeScenario(
    "wall-pass-02",
    "Podaj i wyjdź",
    "Jak ominiesz obrońcę?",
    "Gra na jeden–dwa",
    "Obrońca zamyka bezpośredni bieg. Wykorzystaj partnera i wyjdź po podaniu za jego plecy.",
    [
      [8, 57, 88, "ŚP"],
      [7, 80, 67, "PS"],
      [10, 24, 61, "LS"],
      [9, 47, 32, "N"],
    ],
    [
      [4, 55, 60, "ŚO"],
      [5, 36, 43, "ŚO"],
      [6, 40, 90, "DP"],
      [3, 90, 45, "LO"],
    ],
    [
      ["pass", 8, 7],
      ["run", 8, 64, 45],
      ["pass", 7, 8],
    ],
    [
      passGoal("layoff", 8, 7, "podaj do 7"),
      moveGoal("return-run", "run", 8, zone(55, 73, 35, 53), "wyjdź 8 za obrońcę", false, "layoff"),
      passGoal("return", 7, 8, "odegraj do wbiegającej 8", "return-run"),
    ],
    {
      success: "Podanie, wyjście bez piłki i odegranie tworzą grę na jeden–dwa.",
      partial: "Rozpocząłeś kombinację, ale nie połączyłeś jej z pełnym odegraniem.",
      risk: "Obrońca nie został ominięty kombinacją z partnerem.",
      timing: "Bieg 8 następuje po podaniu, a odegranie po wyjściu w przestrzeń.",
      space: "Wykorzystaj korytarz za obrońcą numer 4.",
      consequence: "8 otrzymuje piłkę wyżej, po drugiej stronie obrońcy.",
      recommendation: "8 → 7, bieg 8 za obrońcę, następnie 7 → 8.",
    },
  ),
  makeScenario(
    "third-player-03",
    "Trzeci zawodnik",
    "Jak wejdziesz między linie?",
    "Gra przez partnera",
    "Bezpośrednie podanie do 10 jest trudne. Znajdź pośrednika i kontynuuj akcję trzecią osobą.",
    [
      [8, 40, 99, "ŚP"],
      [9, 44, 72, "N"],
      [10, 73, 57, "ŚP"],
      [7, 88, 91, "PS"],
    ],
    [
      [4, 59, 75, "ŚO"],
      [5, 35, 47, "ŚO"],
      [6, 25, 84, "DP"],
      [3, 88, 40, "LO"],
    ],
    [
      ["pass", 8, 9],
      ["pass", 9, 10],
      ["run", 10, 69, 34],
    ],
    [
      passGoal("link", 8, 9, "znajdź 9 jako pośrednika"),
      passGoal("third", 9, 10, "zagraj od 9 do 10", "link"),
      moveGoal(
        "advance",
        "run",
        10,
        zone(60, 80, 24, 42),
        "wyprowadź 10 z piłką do przodu",
        true,
        "third",
      ),
    ],
    {
      success: "Pośrednik otworzył podanie do trzeciego zawodnika, który ruszył do przodu.",
      partial: "Znalazłeś część kombinacji, ale trzecia osoba nie wykorzystała jeszcze przewagi.",
      risk: "Sekwencja nie wykorzystała pośrednika do wejścia między linie.",
      timing: "Podanie przez 9 poprzedza wejście 10 z piłką.",
      space: "10 ma miejsce po prawej stronie, za pierwszą linią nacisku.",
      consequence: "Akcja jest kontynuowana przez zawodnika ustawionego wyżej.",
      recommendation: "8 → 9 → 10, następnie bieg 10 w prawą półprzestrzeń.",
    },
  ),
  makeScenario(
    "counter-04",
    "Kontra dwa na jeden",
    "Kiedy oddasz piłkę?",
    "Kontratak",
    "Środkowy obrońca stoi przed Tobą. Skróć dystans z piłką, a potem wykorzystaj partnera na prawo.",
    [
      [8, 46, 101, "ŚP"],
      [7, 79, 68, "PS"],
      [10, 20, 90, "LS"],
      [9, 45, 31, "N"],
    ],
    [
      [4, 53, 63, "ŚO"],
      [5, 23, 44, "ŚO"],
      [6, 30, 117, "DP"],
      [3, 88, 109, "LO"],
    ],
    [
      ["run", 8, 55, 80],
      ["pass", 8, 7],
      ["run", 7, 82, 37],
    ],
    [
      moveGoal("carry", "run", 8, zone(44, 64, 74, 86), "skróć dystans prowadzeniem 8", true),
      passGoal("release", 8, 7, "podaj do wolnego partnera na prawo", "carry"),
      moveGoal(
        "finish-run",
        "run",
        7,
        zone(72, 92, 25, 48),
        "kontynuuj kontrę biegiem 7",
        true,
        "release",
      ),
    ],
    {
      success: "Prowadzenie skróciło dystans, a podanie uruchomiło partnera w wolnym korytarzu.",
      partial: "Kontra ma dobry początek, ale brakuje prowadzenia, podania lub kontynuacji.",
      risk: "Nie wykorzystałeś przewagi dwóch atakujących przed środkowym obrońcą.",
      timing: "Prowadzenie poprzedza podanie do partnera.",
      space: "Prawy korytarz jest wolny do kontynuowania kontry.",
      consequence: "7 dostaje piłkę z możliwością szybkiego wejścia wyżej.",
      recommendation: "Poprowadź 8 bliżej obrońcy, podaj do 7 i rusz nim do przodu.",
    },
  ),
  makeScenario(
    "press-escape-05",
    "Wyjście spod pressingu",
    "Jak uwolnisz piłkę spod nacisku?",
    "Budowanie akcji",
    "Dwaj rywale zamykają lewą stronę. Cofnij piłkę do wsparcia i znajdź przeciwne skrzydło.",
    [
      [8, 24, 82, "ŚP"],
      [6, 47, 111, "DP"],
      [7, 84, 76, "PS"],
      [9, 52, 42, "N"],
    ],
    [
      [4, 26, 56, "ŚO"],
      [5, 64, 44, "ŚO"],
      [10, 18, 70, "N"],
      [11, 38, 85, "LS"],
    ],
    [
      ["pass", 8, 6],
      ["pass", 6, 7],
      ["run", 7, 88, 48],
    ],
    [
      passGoal("support", 8, 6, "zagraj do wsparcia numer 6"),
      passGoal("escape", 6, 7, "przenieś piłkę na prawą stronę", "support"),
      moveGoal(
        "exit",
        "run",
        7,
        zone(76, 96, 34, 57),
        "wyjdź 7 z piłką poza pressing",
        true,
        "escape",
      ),
    ],
    {
      success: "Podanie do wsparcia i zmiana strony wyprowadziły piłkę z zagęszczonej strefy.",
      partial: "Rozpocząłeś wyjście, ale piłka nie została jeszcze wyprowadzona wolną stroną.",
      risk: "Piłka nie została uwolniona kombinacją przez wsparcie.",
      timing: "Najpierw bezpieczny partner pod piłką, następnie przeciwna strona.",
      space: "Rywal skupia się po lewej; kontynuacja jest po prawej.",
      consequence: "7 może kontynuować akcję poza pierwszą strefą nacisku.",
      recommendation: "8 → 6 → 7, potem prowadzenie 7 po prawej stronie.",
    },
  ),
  makeScenario(
    "overlap-06",
    "Obieg skrzydłowego",
    "Jak uruchomisz bocznego obrońcę?",
    "Obieg",
    "Masz piłkę na prawym skrzydle. Wyślij 2 po zewnętrznej stronie i dopiero potem podaj.",
    [
      [8, 71, 59, "PS"],
      [2, 88, 61, "PO"],
      [10, 43, 72, "ŚP"],
      [9, 46, 31, "N"],
    ],
    [
      [4, 59, 40, "ŚO"],
      [5, 35, 37, "ŚO"],
      [3, 76, 44, "LO"],
      [6, 52, 85, "DP"],
    ],
    [
      ["run", 2, 92, 38],
      ["pass", 8, 2],
      ["run", 2, 90, 23],
    ],
    [
      moveGoal("overlap", "run", 2, zone(85, 97, 30, 44), "wyślij 2 obiegiem na zewnątrz"),
      passGoal("find", 8, 2, "podaj do 2 po obiegu", "overlap"),
    ],
    {
      success: "Najpierw stworzyłeś opcję obiegiem, a potem podałeś w otwarty korytarz.",
      partial: "Obieg lub podanie są zaplanowane, ale nie zostały jeszcze połączone.",
      risk: "Boczny obrońca nie dostał piłki po obiegu skrzydłowego.",
      timing: "Podanie następuje po wyjściu 2, dzięki czemu trafia do jego nowej pozycji.",
      space: "2 atakuje pas przy prawej linii, poza skrzydłowym.",
      consequence: "Piłka trafia do zawodnika ustawionego szerzej i wyżej.",
      recommendation: "Wybierz Bieg, wyślij 2 wzdłuż linii, potem Podanie i dotknij 2.",
    },
  ),
  makeScenario(
    "underlap-07",
    "Wejście pod skrzydłowego",
    "Jak zaatakujesz półprzestrzeń?",
    "Ruch do środka",
    "Obrońca pilnuje linii. Wykorzystaj ruch 10 do środka, po wewnętrznej stronie skrzydłowego.",
    [
      [8, 87, 57, "PS"],
      [10, 72, 67, "ŚP"],
      [9, 43, 29, "N"],
      [6, 35, 102, "DP"],
    ],
    [
      [4, 45, 43, "ŚO"],
      [5, 75, 35, "ŚO"],
      [3, 92, 45, "LO"],
      [6, 37, 78, "DP"],
    ],
    [
      ["run", 10, 63, 48],
      ["pass", 8, 10],
      ["run", 10, 58, 29],
    ],
    [
      moveGoal("inside", "run", 10, zone(55, 70, 40, 54), "wyślij 10 w prawą półprzestrzeń"),
      passGoal("feed", 8, 10, "podaj do 10 po ruchu do środka", "inside"),
    ],
    {
      success: "Ruch po wewnętrznej stronie skrzydłowego otworzył podanie do półprzestrzeni.",
      partial: "Masz część rozwiązania, ale ruch i podanie nie tworzą jeszcze jednej sekwencji.",
      risk: "Wolna półprzestrzeń nie została wykorzystana przez 10.",
      timing: "Najpierw ruch bez piłki, następnie podanie do nowej pozycji.",
      space: "Celem jest korytarz między środkiem a prawą linią.",
      consequence: "10 dostaje piłkę bliżej centrum ataku.",
      recommendation: "Bieg 10 po wewnętrznej stronie, następnie podanie 8 → 10.",
    },
  ),
  makeScenario(
    "support-angle-08",
    "Kąt do podania",
    "Jak stworzysz linię podania?",
    "Wsparcie",
    "6 stoi za cieniem krycia. Przesuń go pod piłkę, a potem wykorzystaj go do zmiany strony.",
    [
      [8, 27, 72, "ŚP"],
      [6, 35, 101, "DP"],
      [7, 80, 64, "PS"],
      [9, 48, 31, "N"],
    ],
    [
      [4, 34, 48, "ŚO"],
      [5, 61, 42, "ŚO"],
      [10, 24, 90, "N"],
      [3, 89, 33, "LO"],
    ],
    [
      ["shift", 6, 48, 94],
      ["pass", 8, 6],
      ["pass", 6, 7],
    ],
    [
      moveGoal("angle", "shift", 6, zone(41, 57, 88, 101), "przesuń 6 poza cień krycia"),
      passGoal("connect", 8, 6, "wykorzystaj nowy kąt do 6", "angle"),
      passGoal("switch", 6, 7, "przenieś grę od 6 do 7", "connect"),
    ],
    {
      success: "Zmiana ustawienia stworzyła kąt, a dwa podania połączyły obie strony.",
      partial:
        "Nowa linia podania powstaje, ale nie została jeszcze wykorzystana w całej sekwencji.",
      risk: "Partner nie wyszedł z cienia krycia i nie połączył obu stron.",
      timing: "Zmiana ustawienia musi poprzedzać podanie do 6.",
      space: "6 powinien ustawić się niżej i bardziej centralnie względem piłki.",
      consequence: "Zespół może przenieść akcję bez wymuszania podania przez rywala.",
      recommendation: "Przesuń 6 pod piłkę, potem 8 → 6 → 7.",
    },
  ),
  makeScenario(
    "between-lines-09",
    "Zawodnik między liniami",
    "Kogo znajdziesz za linią pomocy?",
    "Progresja",
    "10 stoi między pomocą a obroną. Znajdź go i kontynuuj piłką w wolną półprzestrzeń.",
    [
      [8, 45, 105, "ŚP"],
      [10, 52, 59, "ŚP"],
      [7, 86, 80, "PS"],
      [9, 28, 30, "N"],
    ],
    [
      [4, 33, 42, "ŚO"],
      [5, 72, 39, "ŚO"],
      [6, 32, 81, "DP"],
      [7, 67, 84, "SP"],
    ],
    [
      ["pass", 8, 10],
      ["run", 10, 55, 37],
      ["shift", 7, 85, 61],
    ],
    [
      passGoal("between", 8, 10, "podaj do 10 między liniami"),
      moveGoal(
        "progress",
        "run",
        10,
        zone(46, 65, 27, 45),
        "prowadź 10 w wolną półprzestrzeń",
        true,
        "between",
      ),
    ],
    {
      success: "Znalazłeś 10 między liniami i wykorzystałeś przestrzeń do kontynuacji.",
      partial: "Rozpoznałeś opcję, ale brakuje podania lub ruchu z piłką do przodu.",
      risk: "Zawodnik między liniami nie został wykorzystany.",
      timing: "Podanie do 10 poprzedza jego ruch z piłką.",
      space: "10 może kontynuować między środkowymi obrońcami.",
      consequence: "Piłka zostaje przeniesiona za linię pomocy.",
      recommendation: "Podaj 8 → 10 i poprowadź 10 w stronę pola karnego.",
    },
  ),
  makeScenario(
    "switch-left-10",
    "Wolna lewa strona",
    "Jak wyjdziesz z prawego skrzydła?",
    "Zmiana strony",
    "Rywal zagęścił prawą stronę. Znajdź 11 na lewo i poprowadź nim piłkę wyżej.",
    [
      [8, 77, 104, "ŚP"],
      [11, 17, 76, "LS"],
      [7, 83, 59, "PS"],
      [9, 53, 34, "N"],
    ],
    [
      [4, 65, 46, "ŚO"],
      [5, 82, 34, "ŚO"],
      [6, 79, 81, "DP"],
      [3, 92, 90, "LO"],
    ],
    [
      ["pass", 8, 11],
      ["run", 11, 12, 41],
      ["shift", 9, 45, 48],
    ],
    [
      passGoal("left", 8, 11, "przenieś piłkę na lewo do 11"),
      moveGoal(
        "left-run",
        "run",
        11,
        zone(3, 25, 29, 54),
        "prowadź piłkę lewym skrzydłem",
        true,
        "left",
      ),
    ],
    {
      success: "Zmieniłeś stronę na lewą i wykorzystałeś wolną linię do prowadzenia.",
      partial: "Kierunek jest dobry, ale lewy korytarz nie został jeszcze w pełni wykorzystany.",
      risk: "Akcja nie wykorzystuje wolnej lewej strony.",
      timing: "Zmiana strony poprzedza atak wolnego skrzydła.",
      space: "Przestrzeń do prowadzenia znajduje się przy lewej linii.",
      consequence: "11 może kontynuować poza zagęszczoną prawą stroną.",
      recommendation: "Podaj do 11, następnie poprowadź nim piłkę lewą stroną.",
    },
  ),
  makeScenario(
    "recycle-11",
    "Odbudowa ataku",
    "Jak zachowasz piłkę i ruszysz dalej?",
    "Utrzymanie piłki",
    "Droga wprost jest zamknięta. Wykorzystaj partnera z tyłu i zbuduj atak przez prawą stronę.",
    [
      [8, 34, 77, "ŚP"],
      [6, 48, 113, "DP"],
      [2, 85, 92, "PO"],
      [9, 54, 34, "N"],
    ],
    [
      [4, 34, 56, "ŚO"],
      [5, 56, 58, "ŚO"],
      [6, 45, 76, "DP"],
      [3, 89, 49, "LO"],
    ],
    [
      ["pass", 8, 6],
      ["pass", 6, 2],
      ["run", 2, 86, 65],
    ],
    [
      passGoal("reset", 8, 6, "zagraj do 6 pod piłką"),
      passGoal("rebuild", 6, 2, "otwórz prawą stronę przez 2", "reset"),
      moveGoal(
        "carry",
        "run",
        2,
        zone(76, 96, 54, 74),
        "wyprowadź piłkę prawą stroną",
        true,
        "rebuild",
      ),
    ],
    {
      success: "Odbudowa przez partnera z tyłu otworzyła nowy kierunek ataku.",
      partial: "Rozpocząłeś utrzymanie piłki, ale brakuje wyprowadzenia jej prawą stroną.",
      risk: "Sekwencja nie odbudowuje ataku przez dostępne wsparcie.",
      timing: "Podanie do tyłu poprzedza zmianę kierunku i prowadzenie.",
      space: "Prawy obrońca daje szerokość poza zagęszczonym środkiem.",
      consequence: "Zespół zachowuje piłkę i rozpoczyna kolejny etap ataku.",
      recommendation: "8 → 6 → 2, a następnie prowadzenie piłki przez 2.",
    },
  ),
  makeScenario(
    "cutback-12",
    "Podanie wstecz z boku",
    "Gdzie znajdziesz partnera przed polem?",
    "Ostatnia tercja",
    "Masz piłkę z boku pola. Wyślij 10 przed pole karne i zagraj wstecz do jego nowej pozycji.",
    [
      [8, 89, 31, "PS"],
      [10, 43, 63, "ŚP"],
      [9, 48, 32, "N"],
      [6, 42, 101, "DP"],
    ],
    [
      [4, 40, 28, "ŚO"],
      [5, 61, 32, "ŚO"],
      [3, 86, 20, "LO"],
      [6, 28, 51, "DP"],
    ],
    [
      ["run", 10, 52, 53],
      ["pass", 8, 10],
      ["shift", 6, 45, 77],
    ],
    [
      moveGoal("arrive", "run", 10, zone(43, 62, 46, 61), "wyślij 10 przed pole karne"),
      passGoal("cutback", 8, 10, "zagraj wstecz do 10", "arrive"),
    ],
    {
      success: "Ruch partnera stworzył adresata podania wstecz z bocznej strefy.",
      partial:
        "Partner lub podanie są zaplanowane, ale nie zostały połączone we właściwej kolejności.",
      risk: "Nie znalazłeś partnera do podania wstecz przed pole karne.",
      timing: "10 najpierw zajmuje strefę, następnie otrzymuje podanie.",
      space: "Podanie idzie od boku pola do centralnej strefy przed polem.",
      consequence: "10 otrzymuje piłkę przed polem, zamiast wymuszać zagranie w tłok.",
      recommendation: "Wyślij 10 przed pole, potem podaj 8 → 10.",
    },
  ),
];

const advanced = (
  id: string,
  title: string,
  category: string,
  home: PlayerSpec[],
  away: PlayerSpec[],
  actions: PlannedAction[],
  focus: string,
  defensive = false,
): Scenario => {
  const s = makeScenario(
    id,
    title,
    "Jak rozegrasz tę sytuację?",
    category,
    focus,
    home,
    away,
    [],
    [],
    {
      success: defensive
        ? "Ustawienie ograniczyło najgroźniejszy kierunek gry rywala."
        : "Wykorzystałeś dostępny kierunek i doprowadziłeś akcję do celu.",
      partial: "Działanie jest poprawne, ale wymaga kontynuacji.",
      risk: "Ten wariant nie wykorzystał ustawienia zawodników.",
      timing: "Zwróć uwagę na moment doskoku i zwolnienia piłki.",
      space: focus,
      consequence: "Zmiana ustawienia otwiera kolejny krok.",
      recommendation: focus,
    },
  );
  s.referenceActions = actions;
  s.defensive = defensive;
  if (defensive) s.ballCarrierId = "away-9";
  return s;
};
scenarios.push(
  advanced(
    "through-13",
    "Podanie w przestrzeń",
    "Z piłką",
    [
      [8, 45, 75, "ŚP"],
      [7, 78, 57, "PS"],
      [9, 39, 28, "N"],
    ],
    [
      [4, 58, 37, "ŚO"],
      [6, 25, 58, "DP"],
      [3, 90, 24, "LO"],
    ],
    [
      {
        id: "through-ref",
        type: "pass",
        delivery: "through",
        playerId: "home-8",
        targetId: "home-7",
        from: { x: 45, y: 75 },
        to: { x: 78, y: 48 },
      },
      {
        id: "through-carry",
        type: "carry",
        playerId: "home-7",
        from: { x: 78, y: 48 },
        to: { x: 84, y: 28 },
      },
    ],
    "Podaj przed partnera, aby odebrał piłkę w biegu i kontynuował atak.",
  ),
  advanced(
    "cross-14",
    "Dośrodkowanie",
    "Z piłką",
    [
      [8, 88, 50, "PS"],
      [9, 49, 25, "N"],
      [10, 30, 42, "ŚP"],
    ],
    [
      [4, 30, 18, "ŚO"],
      [5, 67, 15, "ŚO"],
      [3, 85, 71, "LO"],
    ],
    [
      {
        id: "cross-ref",
        type: "pass",
        delivery: "cross",
        playerId: "home-8",
        targetId: "home-9",
        from: { x: 88, y: 50 },
        to: { x: 49, y: 25 },
      },
    ],
    "Znajdź dostępnego partnera i dopasuj sposób podania do jego strefy.",
  ),
  advanced(
    "shot-15",
    "Przestrzeń przed decyzją",
    "Czytanie gry",
    [
      [8, 56, 26, "N"],
      [7, 83, 43, "PS"],
      [10, 27, 45, "ŚP"],
    ],
    [
      [4, 38, 36, "ŚO"],
      [5, 73, 32, "ŚO"],
    ],
    [
      {
        id: "space-ref",
        type: "carry",
        playerId: "home-8",
        from: { x: 56, y: 26 },
        to: { x: 60, y: 15 },
      },
    ],
    "Zanim zakończysz akcję, znajdź wolne miejsce i popraw pozycję z piłką.",
  ),
  advanced(
    "press-16",
    "Moment doskoku",
    "Obrona",
    [
      [8, 51, 89, "ŚP"],
      [6, 37, 106, "DP"],
      [4, 60, 118, "ŚO"],
    ],
    [
      [9, 55, 83, "N"],
      [7, 83, 89, "PS"],
      [10, 25, 73, "ŚP"],
    ],
    [
      {
        id: "press-ref",
        type: "press",
        playerId: "home-8",
        opponentId: "away-9",
        from: { x: 51, y: 89 },
        to: { x: 55, y: 83 },
      },
    ],
    "Doskok kieruj na rywala z piłką. Sprawdź, czy partner pozostaje za Tobą.",
    true,
  ),
  advanced(
    "cover-17",
    "Asekuracja partnera",
    "Obrona",
    [
      [8, 35, 102, "DP"],
      [6, 51, 89, "ŚP"],
      [4, 61, 120, "ŚO"],
    ],
    [
      [9, 55, 83, "N"],
      [7, 83, 90, "PS"],
      [10, 27, 70, "ŚP"],
    ],
    [
      {
        id: "cover-ref",
        type: "cover",
        playerId: "home-8",
        from: { x: 35, y: 102 },
        to: { x: 52, y: 103 },
      },
    ],
    "Zajmij miejsce za doskakującym partnerem, po stronie własnej bramki.",
    true,
  ),
  advanced(
    "mark-18",
    "Odcięcie partnera",
    "Obrona",
    [
      [8, 74, 101, "LO"],
      [6, 51, 89, "DP"],
      [4, 61, 120, "ŚO"],
    ],
    [
      [9, 55, 83, "N"],
      [7, 82, 92, "PS"],
      [10, 27, 70, "ŚP"],
    ],
    [
      {
        id: "mark-ref",
        type: "mark",
        playerId: "home-8",
        opponentId: "away-7",
        from: { x: 74, y: 101 },
        to: { x: 84.6, y: 95 },
      },
    ],
    "Wskaż partnera rywala do krycia i pozostań po stronie własnej bramki.",
    true,
  ),
);
export const variantLabels = ["Podstawowy", "Druga strona", "Większa presja"] as const;
export function scenarioVariant(base: Scenario, variant: number): Scenario {
  const s = structuredClone(base);
  if (variant === 1) {
    const mirror = (p: { x: number; y: number }) => ({ x: 100 - p.x, y: p.y });
    s.players = s.players.map((p) => ({ ...p, ...mirror(p) }));
    s.referenceActions = s.referenceActions.map((a) => ({
      ...a,
      from: mirror(a.from),
      to: mirror(a.to),
    }));
    s.goals = s.goals?.map((g) => ({
      ...g,
      zone: g.zone ? { ...g.zone, xMin: 100 - g.zone.xMax, xMax: 100 - g.zone.xMin } : undefined,
    }));
    const swap = (text: string) =>
      text.replace(
        /\b(praw|lew)(ego|ej|ych|ymi|emu|ym|o|a|e|y|ą|ę)(?![\p{L}])/gu,
        (_word, stem: string, suffix: string) => (stem === "praw" ? "lew" : "praw") + suffix,
      );
    s.title = swap(s.title);
    s.focus = swap(s.focus);
    if (s.coaching)
      for (const key of Object.keys(s.coaching) as (keyof ScenarioCoaching)[])
        s.coaching[key] = swap(s.coaching[key]);
  }
  if (variant === 2) s.simulation = { reaction: 1.1, defenderSpeed: 2.0 };
  return s;
}

// End the teaching example when its tactical objective is achieved.
for (const scenario of scenarios) {
  if (
    ["overload-switch-01", "between-lines-09", "switch-left-10", "cutback-12"].includes(scenario.id)
  )
    scenario.referenceActions = scenario.referenceActions.slice(0, 2);
}

// Each learning objective can be achieved without taking a shot.
scenarios.find((s) => s.id === "cross-14")!.goals = [
  passGoal("receiver", 8, 9, "znajdź dostępnego odbiorcę"),
];
scenarios.find((s) => s.id === "shot-15")!.goals = [
  moveGoal(
    "space",
    "run",
    8,
    zone(52, 68, 10, 19),
    "wykorzystaj wolne miejsce przed decyzją",
    true,
  ),
];
