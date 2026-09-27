import type { MatchPlayer, Point, Scenario, Team } from "./types";

const p = (
  id: string,
  team: Team,
  number: number,
  role: string,
  x: number,
  y: number,
  fromX = x,
  fromY = y,
  controlled = false,
  goalkeeper = false,
): MatchPlayer => ({ id, team, number, role, x, y, from: { x: fromX, y: fromY }, controlled, goalkeeper });

const baseHome = (): MatchPlayer[] => [
  p("h-gk", "home", 1, "BR", 50, 140, 50, 140, false, true),
  p("h-lb", "home", 3, "LO", 16, 116),
  p("h-lcb", "home", 4, "ŚO", 38, 122),
  p("h-rcb", "home", 5, "ŚO", 61, 122),
  p("h-rb", "home", 2, "PO", 84, 116),
  p("h-dm", "home", 6, "DP", 50, 98),
  p("h-lcm", "home", 8, "ŚP", 34, 82),
  p("h-rcm", "home", 10, "ŚP", 66, 81),
  p("h-lw", "home", 11, "LS", 17, 55),
  p("h-st", "home", 9, "N", 50, 42),
  p("h-rw", "home", 7, "PS", 83, 55),
];

const baseAway = (): MatchPlayer[] => [
  p("a-gk", "away", 1, "BR", 50, 10, 50, 10, false, true),
  p("a-lb", "away", 3, "LO", 82, 35),
  p("a-lcb", "away", 4, "ŚO", 60, 30),
  p("a-rcb", "away", 5, "ŚO", 40, 30),
  p("a-rb", "away", 2, "PO", 18, 35),
  p("a-dm", "away", 6, "DP", 50, 52),
  p("a-lcm", "away", 8, "ŚP", 65, 62),
  p("a-rcm", "away", 10, "ŚP", 35, 62),
  p("a-lw", "away", 11, "LS", 80, 88),
  p("a-st", "away", 9, "N", 50, 91),
  p("a-rw", "away", 7, "PS", 20, 88),
];

const set = (players: MatchPlayer[], id: string, to: Point, from?: Point, controlled?: boolean) => {
  const player = players.find((item) => item.id === id);
  if (!player) return;
  player.x = to.x;
  player.y = to.y;
  player.from = from ?? { ...to };
  if (controlled !== undefined) player.controlled = controlled;
};

type BuildOptions = Omit<Scenario, "players"> & {
  move: (players: MatchPlayer[]) => void;
};

const build = ({ move, ...scenario }: BuildOptions): Scenario => {
  const players = [...baseHome(), ...baseAway()];
  players.forEach((player) => (player.controlled = false));
  move(players);
  return { ...scenario, players };
};

export const scenarios: Scenario[] = [
  build({
    id: "overload-switch",
    title: "Przeciążenie strony i izolacja drugiej",
    focus: "Zmiana strony",
    prompt: "Blok rywala przesunął się do piłki. Jak wykorzystasz dalszą stronę?",
    cue: "Obserwuj bocznego obrońcę i wolną przestrzeń po przeciwnej stronie.",
    controlledPlayerId: "h-rcm",
    ball: { x: 65, y: 68, carrierId: "h-rcm" },
    observationMs: 5600,
    decisionSeconds: 8,
    playbackMs: 3800,
    preferredRunZones: [{ x: 62, y: 55 }, { x: 72, y: 48 }],
    preferredPassZones: [{ x: 16, y: 48 }, { x: 12, y: 42 }],
    goodFeedback: "Wciągnąłeś blok i szybko uruchomiłeś wolną stronę. To tworzy sytuację 1 na 1.",
    improveFeedback: "Największa przewaga była po przeciwnej stronie. Podnieś głowę przed drugim kontaktem.",
    move(players) {
      set(players, "h-rcm", { x: 65, y: 68 }, { x: 58, y: 77 }, true);
      set(players, "h-rw", { x: 80, y: 48 }, { x: 82, y: 56 });
      set(players, "h-lw", { x: 12, y: 45 }, { x: 17, y: 55 });
      set(players, "a-dm", { x: 62, y: 57 }, { x: 50, y: 52 });
      set(players, "a-lcm", { x: 72, y: 56 }, { x: 65, y: 62 });
      set(players, "a-lb", { x: 76, y: 39 }, { x: 82, y: 35 });
    },
  }),
  build({
    id: "third-man",
    title: "Trzeci zawodnik pod presją",
    focus: "Gra na trzeciego",
    prompt: "Rywal zamyka bezpośrednie podanie. Jak wyjdziesz za jego linię?",
    cue: "Szukaj ruchu trzeciego zawodnika, nie tylko najbliższego partnera.",
    controlledPlayerId: "h-lcm",
    ball: { x: 34, y: 78, carrierId: "h-lcm" },
    observationMs: 5000,
    decisionSeconds: 8,
    playbackMs: 3600,
    preferredRunZones: [{ x: 51, y: 60 }, { x: 43, y: 54 }],
    preferredPassZones: [{ x: 50, y: 70 }, { x: 64, y: 57 }],
    goodFeedback: "Zagrałeś przez trzeciego zawodnika i ominąłeś pierwszą linię pressingu.",
    improveFeedback: "Bezpośrednia droga była zamknięta. Użyj partnera jako ściany i rusz za linię.",
    move(players) {
      set(players, "h-lcm", { x: 34, y: 78 }, { x: 28, y: 84 }, true);
      set(players, "h-dm", { x: 50, y: 70 }, { x: 50, y: 96 });
      set(players, "h-rcm", { x: 64, y: 57 }, { x: 66, y: 81 });
      set(players, "a-rcm", { x: 38, y: 68 }, { x: 35, y: 62 });
      set(players, "a-dm", { x: 51, y: 58 }, { x: 50, y: 52 });
    },
  }),
  build({
    id: "half-space-underlap",
    title: "Wejście w półprzestrzeń",
    focus: "Underlap",
    prompt: "Skrzydłowy utrzymuje szerokość. Jak zaatakujesz przestrzeń między obrońcami?",
    cue: "Ruch bez piłki powinien rozpocząć się poza polem widzenia obrońcy.",
    controlledPlayerId: "h-rb",
    ball: { x: 83, y: 55, carrierId: "h-rw" },
    observationMs: 5200,
    decisionSeconds: 7,
    playbackMs: 3500,
    preferredRunZones: [{ x: 69, y: 34 }, { x: 73, y: 28 }],
    preferredPassZones: [{ x: 69, y: 34 }],
    goodFeedback: "Underlap wszedł między bocznego i środkowego obrońcę w odpowiednim momencie.",
    improveFeedback: "Nie dubluj szerokości skrzydłowego. Zaatakuj kanał wewnętrzny.",
    move(players) {
      set(players, "h-rb", { x: 76, y: 68 }, { x: 84, y: 116 }, true);
      set(players, "h-rw", { x: 88, y: 49 }, { x: 83, y: 55 });
      set(players, "a-lb", { x: 83, y: 39 }, { x: 82, y: 35 });
      set(players, "a-lcb", { x: 61, y: 33 }, { x: 60, y: 30 });
    },
  }),
  build({
    id: "escape-press",
    title: "Wyjście spod wysokiego pressingu",
    focus: "Uwolnienie od pressingu",
    prompt: "Pierwsza linia odcina środek. Gdzie tworzysz wolnego zawodnika?",
    cue: "Zmień wysokość ustawienia i otwórz ukośną linię podania.",
    controlledPlayerId: "h-dm",
    ball: { x: 38, y: 120, carrierId: "h-lcb" },
    observationMs: 5900,
    decisionSeconds: 8,
    playbackMs: 4200,
    preferredRunZones: [{ x: 24, y: 101 }, { x: 62, y: 103 }],
    preferredPassZones: [{ x: 17, y: 112 }, { x: 24, y: 101 }],
    goodFeedback: "Zmieniłeś wysokość i stworzyłeś ukośną linię wyjścia spod pressingu.",
    improveFeedback: "Stojąc w tej samej linii pomagasz pressingowi. Otwórz inny kąt podania.",
    move(players) {
      set(players, "h-lcb", { x: 38, y: 120 }, { x: 42, y: 126 });
      set(players, "h-dm", { x: 48, y: 104 }, { x: 50, y: 98 }, true);
      set(players, "a-st", { x: 45, y: 107 }, { x: 50, y: 91 });
      set(players, "a-lw", { x: 61, y: 112 }, { x: 80, y: 88 });
      set(players, "a-rw", { x: 25, y: 108 }, { x: 20, y: 88 });
    },
  }),
  build({
    id: "counterpress",
    title: "Pięć sekund po stracie",
    focus: "Kontrpressing",
    prompt: "Piłka została stracona blisko pola karnego. Którą przestrzeń zamykasz najpierw?",
    cue: "Nie biegnij wyłącznie do piłki. Odetnij najgroźniejsze wyjście.",
    controlledPlayerId: "h-rcm",
    ball: { x: 59, y: 47, carrierId: "a-dm" },
    observationMs: 4300,
    decisionSeconds: 6,
    playbackMs: 3300,
    preferredRunZones: [{ x: 54, y: 54 }, { x: 63, y: 57 }],
    preferredPassZones: [],
    goodFeedback: "Zamknąłeś podanie progresywne i skierowałeś rywala w mniej groźną strefę.",
    improveFeedback: "Sam nacisk na piłkę nie wystarczył. Najpierw zamknij najbliższą linię wyjścia.",
    move(players) {
      set(players, "h-rcm", { x: 68, y: 53 }, { x: 66, y: 69 }, true);
      set(players, "h-rw", { x: 80, y: 43 }, { x: 83, y: 55 });
      set(players, "a-dm", { x: 59, y: 47 }, { x: 50, y: 52 });
      set(players, "a-lcm", { x: 72, y: 59 }, { x: 65, y: 62 });
    },
  }),
  build({
    id: "cutback",
    title: "Wycofanie po wejściu w pole karne",
    focus: "Cutback",
    prompt: "Linia obrony cofa się do bramki. Gdzie pojawi się wolna przestrzeń?",
    cue: "Nie wbiegaj w tę samą linię co napastnik. Zatrzymaj się przed obrońcami.",
    controlledPlayerId: "h-lcm",
    ball: { x: 12, y: 25, carrierId: "h-lw" },
    observationMs: 5100,
    decisionSeconds: 7,
    playbackMs: 3600,
    preferredRunZones: [{ x: 42, y: 36 }, { x: 50, y: 40 }],
    preferredPassZones: [{ x: 42, y: 36 }, { x: 50, y: 40 }],
    goodFeedback: "Zająłeś strefę wycofania zamiast wejść w tłok przy bramce.",
    improveFeedback: "Napastnik już atakował bramkę. Zabezpiecz przestrzeń na wycofanie.",
    move(players) {
      set(players, "h-lw", { x: 12, y: 25 }, { x: 17, y: 55 });
      set(players, "h-st", { x: 47, y: 21 }, { x: 50, y: 42 });
      set(players, "h-lcm", { x: 35, y: 50 }, { x: 34, y: 82 }, true);
      set(players, "a-rb", { x: 18, y: 30 }, { x: 18, y: 35 });
      set(players, "a-rcb", { x: 41, y: 23 }, { x: 40, y: 30 });
      set(players, "a-lcb", { x: 57, y: 23 }, { x: 60, y: 30 });
    },
  }),
  build({
    id: "defensive-cover",
    title: "Asekuracja po wyjściu bocznego obrońcy",
    focus: "Przesunięcie linii",
    prompt: "Boczny obrońca wyszedł do pressingu. Jak zabezpieczysz przestrzeń za nim?",
    cue: "Kontroluj jednocześnie napastnika, piłkę i odległość od drugiego stopera.",
    controlledPlayerId: "h-rcb",
    ball: { x: 83, y: 84, carrierId: "a-lw" },
    observationMs: 5400,
    decisionSeconds: 7,
    playbackMs: 3700,
    preferredRunZones: [{ x: 70, y: 109 }, { x: 74, y: 103 }],
    preferredPassZones: [],
    goodFeedback: "Przesunąłeś się wcześnie i zabezpieczyłeś kanał za bocznym obrońcą.",
    improveFeedback: "Reakcja była zbyt skupiona na piłce. Najpierw zabezpiecz przestrzeń za partnerem.",
    move(players) {
      set(players, "h-rb", { x: 83, y: 92 }, { x: 84, y: 116 });
      set(players, "h-rcb", { x: 61, y: 116 }, { x: 61, y: 122 }, true);
      set(players, "a-lw", { x: 83, y: 84 }, { x: 80, y: 88 });
      set(players, "a-st", { x: 67, y: 102 }, { x: 50, y: 91 });
    },
  }),
  build({
    id: "transition",
    title: "Pierwsze podanie po odbiorze",
    focus: "Przejście do ataku",
    prompt: "Odebrałeś piłkę przy otwartym ustawieniu rywala. Co robisz w pierwszych sekundach?",
    cue: "Najpierw spójrz do przodu. Bezpieczne podanie pozostaje planem B.",
    controlledPlayerId: "h-dm",
    ball: { x: 51, y: 82, carrierId: "h-dm" },
    observationMs: 4500,
    decisionSeconds: 6,
    playbackMs: 3600,
    preferredRunZones: [{ x: 53, y: 68 }, { x: 58, y: 65 }],
    preferredPassZones: [{ x: 82, y: 52 }, { x: 50, y: 44 }, { x: 18, y: 52 }],
    goodFeedback: "Pierwsza decyzja była progresywna i wykorzystała niezorganizowanie rywala.",
    improveFeedback: "Okno do ataku było krótkie. Skanuj przed odbiorem i szukaj pierwszego podania do przodu.",
    move(players) {
      set(players, "h-dm", { x: 51, y: 82 }, { x: 50, y: 98 }, true);
      set(players, "h-rw", { x: 82, y: 52 }, { x: 83, y: 55 });
      set(players, "h-st", { x: 50, y: 44 }, { x: 50, y: 42 });
      set(players, "a-dm", { x: 56, y: 85 }, { x: 50, y: 52 });
      set(players, "a-lcm", { x: 69, y: 75 }, { x: 65, y: 62 });
    },
  }),
];
