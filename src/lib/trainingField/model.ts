import type { TrainingExercise } from "@/lib/loadwise/types";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "@/lib/loadwise/individualFootballDrills";
import { drillBoard } from "@/lib/football/drillBoard";

export type FieldPoint = readonly [number, number];
export type FieldAction = "run" | "carry" | "pass" | "return" | "control";
export interface FieldRoute {
  id: string;
  action: FieldAction;
  label: string;
  points: readonly FieldPoint[];
  /** Curved sprinting is a smooth arc, never a series of cuts. */
  curved?: boolean;
}
export interface FieldMarker {
  point: FieldPoint;
  label?: string;
  kind?: "cone" | "target";
}
export interface FieldStep {
  title: string;
  text: string;
  routes: string[];
  player: FieldPoint;
  ball?: FieldPoint;
}
export interface TrainingField {
  id: string;
  title: string;
  setup: string;
  equipment: string;
  routes: FieldRoute[];
  markers: FieldMarker[];
  steps: FieldStep[];
  measurements: string[];
  wall?: boolean;
  goal?: boolean;
}

export const FIELD_ACTION_LABELS: Record<FieldAction, string> = {
  run: "Bieg bez piłki",
  carry: "Prowadzenie",
  pass: "Podanie / lot piłki",
  return: "Marsz / wyhamowanie",
  control: "Kontakt z piłką",
};
const point = (x: number, y: number): FieldPoint => [x, y];
const route = (
  id: string,
  action: FieldAction,
  label: string,
  points: readonly FieldPoint[],
  curved = false,
): FieldRoute => ({ id, action, label, points, curved });
const phase = (
  title: string,
  text: string,
  routes: string[],
  player: FieldPoint,
  ball?: FieldPoint,
): FieldStep => ({ title, text, routes, player, ball });
const validDistance = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10000;
const meters = (value: number) =>
  `${value.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} m`;

/** Only a single explicit distance is usable; ranges, sums and names are never guessed. */
function prescribedDistance(exercise: TrainingExercise): number | null {
  if (validDistance(exercise.engineDose?.distanceM)) return exercise.engineDose.distanceM;
  if (exercise.engineDose?.distanceM !== undefined) return null;
  const values = new Set<number>();
  for (const text of [exercise.reps, exercise.displayPrescription]) {
    if (!text) continue;
    if (/\+|\d\s*(?:[-–—]|do)\s*\d/i.test(text)) return null;
    const matches = [...text.matchAll(/(?<![\p{L}\d.,+\-–—])(\d+(?:[.,]\d+)?)\s*m\b(?!\s*\/)/giu)];
    if (matches.length > 1) return null;
    for (const match of matches) {
      const value = Number(match[1].replace(",", "."));
      if (validDistance(value)) values.add(value);
    }
  }
  return values.size === 1 ? [...values][0] : null;
}

/** A legacy saved flying prescription has one supported, unambiguous grammar. */
function legacyFlyingDose(exercise: TrainingExercise) {
  if (exercise.exerciseId !== "flying_sprint" || exercise.engineDose !== undefined) return null;
  const pattern =
    /^(?:\d+\s*[×x]\s*)?(\d+(?:[.,]\d+)?)\s*m\s+z\s+najazdu\s+(\d+(?:[.,]\d+)?)\s*m$/iu;
  for (const text of [exercise.displayPrescription, exercise.reps]) {
    const match = text?.trim().match(pattern);
    if (!match) continue;
    const distanceM = Number(match[1].replace(",", "."));
    const runInM = Number(match[2].replace(",", "."));
    if (validDistance(distanceM) && validDistance(runInM)) return { distanceM, runInM };
  }
  return null;
}

function footballField(exercise: TrainingExercise): TrainingField | null {
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === exercise.exerciseId);
  if (!drill) return null;
  const old = drillBoard(drill.id)!;
  const start = point(50, 80);
  const middle = point(50, 50);
  const end = point(50, 20);
  const field: TrainingField = {
    id: drill.id,
    title: "Ustawienie z piłką",
    setup: drill.steps[0],
    equipment: old.equipment,
    markers: old.markers.map((p) => ({ point: p })),
    routes: [route("touch", "control", "Kontroluj piłkę", [point(45, 53), point(55, 53)])],
    steps: [
      phase("Ustaw", drill.steps[0], [], middle, point(53, 53)),
      phase("Wykonaj", drill.steps[1], ["touch"], middle, point(53, 53)),
      phase("Kontroluj", drill.steps[2], ["touch"], middle, point(47, 53)),
    ],
    measurements: [],
    wall: "wall" in drill && drill.wall,
    goal: "goal" in drill && drill.goal,
  };
  const carry = (points: readonly FieldPoint[], finishText = drill.steps[2]) => {
    field.routes = [route("carry", "carry", "Prowadź piłkę", points)];
    field.steps = [
      phase("Ustaw", drill.steps[0], [], points[0], points[0]),
      phase("Prowadź", drill.steps[1], ["carry"], points[0], points[0]),
      phase("Kontroluj", finishText, ["carry"], points.at(-1)!, points.at(-1)!),
    ];
  };
  switch (drill.id) {
    case "football_gate_dribble":
      carry([middle, point(10, 50), middle, point(50, 10)]);
      break;
    case "football_cone_feints":
      carry(old.path);
      field.steps[1].title = "Zwód";
      field.steps[2].title = "Wyjdź";
      break;
    case "football_scan_control":
      field.markers = [
        { point: point(20, 30), label: "Lewo", kind: "target" },
        { point: point(80, 30), label: "Prawo", kind: "target" },
      ];
      carry([middle, point(25, 35)]);
      field.steps[1].title = "Spójrz i przyjmij";
      break;
    case "football_self_feed_first_touch":
      field.equipment = "1 piłka · dwie strefy wyznaczone liniami podłoża";
      field.markers = [
        { point: point(22, 30), label: "Strefa A", kind: "target" },
        { point: point(78, 30), label: "Strefa B", kind: "target" },
      ];
      field.routes = [
        route("feed", "carry", "Przetocz od siebie", [point(50, 75), middle]),
        route("receive", "carry", "Przyjmij do strefy", [middle, point(25, 35)]),
      ];
      field.steps = [
        phase("Ustaw", drill.steps[0], [], point(50, 75), point(52, 72)),
        phase(
          "Przetocz",
          "Lekko przetocz piłkę od siebie i podejdź do niej.",
          ["feed"],
          point(50, 75),
          point(50, 72),
        ),
        phase(
          "Przyjmij",
          "Pierwszym kontaktem skieruj piłkę do wybranej strefy.",
          ["receive"],
          middle,
          middle,
        ),
        phase("Zatrzymaj", drill.steps[2], [], point(25, 35), point(28, 35)),
      ];
      break;
    case "football_turn_control":
      carry(old.path);
      field.steps[2].title = "Obróć i wróć";
      break;
    case "football_speed_dribble":
      carry(old.path);
      field.routes.push(
        route("return", "return", "Wróć marszem z piłką", [point(60, 20), point(60, 80)]),
      );
      field.steps[2] = phase("Wróć", drill.steps[2], ["return"], end, end);
      break;
    case "football_slalom_time": {
      const outward = old.path;
      carry(outward);
      field.routes.push(
        route(
          "back",
          "carry",
          "Slalom z powrotem",
          outward
            .slice()
            .reverse()
            .map(([x, y]) => point(x + 5, y)),
        ),
      );
      field.steps = [
        phase("Ustaw", drill.steps[0], [], outward[0], outward[0]),
        phase(
          "Tam",
          "Prowadź slalomem prawą nogą, mijając każdy znacznik.",
          ["carry"],
          outward[0],
          outward[0],
        ),
        phase(
          "Z powrotem",
          "Wróć slalomem lewą nogą, bez omijania znaczników.",
          ["back"],
          outward.at(-1)!,
          outward.at(-1)!,
        ),
        phase("Odpocznij", drill.steps[2], [], outward[0], outward[0]),
      ];
      break;
    }
    case "football_target_pass":
    case "football_long_pass_zone":
    case "football_gk_kick_zone":
      field.routes = [
        route(
          "pass",
          "pass",
          drill.id === "football_gk_kick_zone" ? "Wybij do strefy" : "Podaj do strefy",
          [start, end],
        ),
        route("collect", "return", "Podejdź po piłkę", [point(60, 80), point(60, 20)]),
      ];
      field.steps = [
        phase("Ustaw", drill.steps[0], [], start, point(53, 78)),
        phase(
          drill.id === "football_gk_kick_zone" ? "Wybij" : "Podaj",
          drill.steps[1],
          ["pass"],
          start,
          start,
        ),
        phase("Odbierz piłkę", drill.steps[2], ["collect"], start, end),
      ];
      break;
    case "football_gk_distribution":
      field.routes = [
        route("receive", "carry", "Przyjmij do boku", [point(50, 70), point(65, 60)]),
        route("pass", "pass", "Podaj do wybranej strefy", [point(65, 60), point(75, 20)]),
        route("collect", "return", "Podejdź po piłkę", [point(72, 60), point(82, 25)]),
      ];
      field.markers = [
        { point: point(25, 20), label: "Strefa A", kind: "target" },
        { point: point(75, 20), label: "Strefa B", kind: "target" },
      ];
      field.steps = [
        phase("Ustaw", drill.steps[0], [], point(50, 75), point(50, 70)),
        phase("Przyjmij", drill.steps[1], ["receive"], point(50, 70), point(50, 70)),
        phase(
          "Podaj",
          "Zagraj krótkie podanie po ziemi do wybranej strefy.",
          ["pass"],
          point(65, 60),
          point(65, 60),
        ),
        phase(
          "Wróć po piłkę",
          "Podejdź po piłkę i zmień stronę. Po pięciu próbach zmień nogę.",
          ["collect"],
          point(65, 60),
          point(75, 20),
        ),
      ];
      break;
    case "football_wall_first_touch":
    case "football_wall_receive_turn":
    case "football_wall_one_touch":
    case "football_gk_wall_handling": {
      const oneTouch = drill.id === "football_wall_one_touch";
      const goalkeeper = drill.id === "football_gk_wall_handling";
      const turn = drill.id === "football_wall_receive_turn";
      const reception = oneTouch ? point(45, 75) : point(56, 65);
      field.markers = [];
      field.routes = [
        route("pass", "pass", goalkeeper ? "Rzuć o ścianę" : "Podaj o ścianę", [
          point(45, 75),
          point(45, 18),
        ]),
        route("rebound", "pass", "Powrót piłki od ściany", [point(48, 18), reception]),
        ...(oneTouch
          ? [route("one-touch", "pass", "Odegranie bez przyjęcia", [reception, point(45, 18)])]
          : []),
        ...(!oneTouch && !goalkeeper
          ? [
              route("receive", "carry", turn ? "Przyjęcie z obrotem" : "Przyjęcie do boku", [
                point(56, 65),
                point(78, 65),
              ]),
            ]
          : []),
        ...(turn
          ? [route("carry", "carry", "Dwa kontakty prowadzenia", [point(78, 65), point(78, 42)])]
          : []),
      ];
      field.steps = [
        phase("Ustaw", drill.steps[0], [], point(45, 75), point(48, 73)),
        phase(
          goalkeeper ? "Rzuć" : "Podaj",
          goalkeeper
            ? "Rzuć piłkę oburącz o bezpieczną ścianę."
            : "Podaj po ziemi wewnętrzną stroną stopy o bezpieczną ścianę.",
          ["pass"],
          point(45, 75),
          point(45, 75),
        ),
        phase(
          goalkeeper ? "Złap" : oneTouch ? "Odegraj" : "Przyjmij",
          goalkeeper
            ? "Ustaw ciało za wracającą piłką i złap ją oburącz."
            : oneTouch
              ? "Odegraj wracającą piłkę od razu, bez przyjęcia."
              : turn
                ? "Przyjmij dalszą nogą i obróć się do boku o 90°."
                : "Przyjmij wracającą piłkę do boku, w zasięgu następnego kroku.",
          [
            "rebound",
            ...(oneTouch ? ["one-touch"] : []),
            ...(!oneTouch && !goalkeeper ? ["receive"] : []),
          ],
          reception,
          reception,
        ),
        phase(
          turn ? "Prowadź" : "Powtórz",
          drill.steps[2],
          turn ? ["carry"] : oneTouch ? ["one-touch"] : [],
          turn ? point(78, 65) : point(45, 75),
          turn ? point(78, 65) : point(48, 73),
        ),
      ];
      break;
    }
    case "football_finishing_corners":
      field.routes = [
        route("carry", "carry", "Prowadź 2–3 kontakty", [start, point(50, 55)]),
        route("shot", "pass", "Strzel w wybrany róg", [point(50, 55), point(30, 15)]),
        route("collect", "return", "Podejdź po piłkę", [point(60, 55), point(40, 20)]),
      ];
      field.steps = [
        phase("Ustaw", drill.steps[0], [], start, point(53, 78)),
        phase("Prowadź", "Poprowadź piłkę 2–3 kontaktami do przodu.", ["carry"], start, start),
        phase(
          "Strzel",
          "Uderz wewnętrzną stroną stopy albo podbiciem w wybrany róg.",
          ["shot"],
          point(50, 55),
          point(50, 55),
        ),
        phase("Odbierz piłkę", drill.steps[2], ["collect"], point(50, 55), point(30, 15)),
      ];
      break;
  }
  return field;
}

const STRAIGHT_IDS = new Set([
  "free_acceleration_sprint",
  "falling_start",
  "split_stance_start",
  "push_up_start",
  "half_kneeling_start",
  "lateral_start_acceleration",
  "crossover_start_acceleration",
  "turn_and_go_start",
  "app_audio_reaction_start",
  "progressive_build_up_sprint",
  "upright_football_sprint",
  "repeated_linear_short_sprints",
  "acceleration_mechanics",
  "resisted_sled_acceleration",
  "band_resisted_acceleration",
  "hill_acceleration",
  "a_march",
  "a_skip",
  "b_skip",
  "c_skip",
  "d_skip",
  "ankling",
  "low_dribble",
  "high_dribble",
  "dribble_to_sprint_transition",
  "progressive_run_three_step_stop",
  "run_two_step_stop",
  "progressive_deceleration_5_10_15",
  "accel_decel_reaccel",
  "flying_sprint",
]);
const CURVED_IDS = new Set(["football_curved_sprint", "reactive_curved_sprint"]);
const CUT_IDS = new Set(["planned_cut", "cut_and_reaccelerate", "deceleration_lateral_exit"]);
const SHUTTLE_IDS = new Set(["planned_505", "reactive_180_turn"]);

/** A display model only: never changes the saved dose, turn distance or prescription. */
export function resolveTrainingField(exercise: TrainingExercise): TrainingField | null {
  const football = footballField(exercise);
  if (football) return football;
  const id = exercise.exerciseId;
  const running = id === "running_interval_course";
  if (
    !id ||
    (!running &&
      !STRAIGHT_IDS.has(id) &&
      !CURVED_IDS.has(id) &&
      !CUT_IDS.has(id) &&
      !SHUTTLE_IDS.has(id))
  )
    return null;
  const legacyFlying = legacyFlyingDose(exercise);
  const distance = legacyFlying?.distanceM ?? prescribedDistance(exercise);
  if (!distance || (running && !validDistance(exercise.engineDose?.distanceM))) return null;
  const runIn = validDistance(exercise.engineDose?.runInM)
    ? exercise.engineDose.runInM
    : (legacyFlying?.runInM ?? 0);
  const runOut = validDistance(exercise.engineDose?.runOutM) ? exercise.engineDose.runOutM : 0;
  // Flying zones have separate distances. A combined free-text sum cannot reconstruct them.
  if (id === "flying_sprint" && !runIn) return null;
  const a = point(20, 72),
    b = point(76, 72);
  const field: TrainingField = {
    id,
    title: running ? "Twój odcinek" : "Ustawienie odcinka",
    setup: running
      ? `Wyznacz początek A i koniec B odcinka ${meters(distance)}. Wybierz równą trasę bez przeszkód.`
      : "Oznacz początek i koniec odcinka zgodnie z planem. Sprawdź, czy tor biegu i miejsce do wyhamowania są wolne.",
    equipment: "Znaczniki lub linie podłoża · taśma do odmierzenia",
    markers: [
      { point: a, label: "A" },
      { point: b, label: "B" },
    ],
    routes: [route("work", "run", `${running ? "Odcinek" : "Praca"} ${meters(distance)}`, [a, b])],
    steps: [
      phase("Ustaw", `Odmierz ${meters(distance)} od A do B.`, [], a),
      phase(
        "Biegnij",
        running
          ? "Pokonaj odcinek w tempie zapisanym w planie biegu."
          : "Wykonaj ćwiczenie od A do B zgodnie z dawką i wskazówkami techniki.",
        ["work"],
        a,
      ),
    ],
    measurements: [
      `${meters(distance)}${CUT_IDS.has(id) || SHUTTLE_IDS.has(id) || id === "accel_decel_reaccel" ? " łącznie pracy" : " pracy"}`,
    ],
  };
  if (runIn) {
    const split = point(42, 72);
    field.markers = [
      { point: a, label: "A" },
      { point: split, label: "B" },
      { point: b, label: "C" },
    ];
    field.routes = [
      route(
        "run-in",
        "run",
        `${id === "dribble_to_sprint_transition" ? "Drobienie" : "Nabieg"} ${meters(runIn)}`,
        [a, split],
      ),
      route("work", "run", `Sprint ${meters(distance)}`, [split, b]),
    ];
    field.setup = `Wyznacz osobno ${meters(runIn)} ${id === "dribble_to_sprint_transition" ? "drobienia bez piłki" : "nabiegu"} i ${meters(distance)} części głównej.`;
    field.measurements.unshift(
      `${meters(runIn)} ${id === "dribble_to_sprint_transition" ? "drobienia bez piłki" : "nabiegu"}`,
    );
    field.steps = [
      phase("Ustaw", field.setup, [], a),
      phase(
        id === "dribble_to_sprint_transition" ? "Drobienie" : "Nabieg",
        id === "dribble_to_sprint_transition"
          ? "Zacznij od krótkiego drobienia bez piłki do znacznika B."
          : "Płynnie zwiększaj prędkość od A do B.",
        ["run-in"],
        a,
      ),
      phase(
        "Sprint",
        "Kontynuuj bieg przez oznaczoną część główną, bez zatrzymania na jej początku.",
        ["work"],
        split,
      ),
    ];
  } else if (id === "accel_decel_reaccel") {
    const stop = point(48, 72);
    field.markers.splice(1, 0, { point: stop, label: "Hamowanie" });
    field.routes = [
      route("first", "run", "Pierwsze przyspieszenie", [a, stop]),
      route("second", "run", "Ponowne przyspieszenie", [stop, b]),
    ];
    field.steps = [
      phase(
        "Ustaw",
        "Wyznacz miejsce kontrolowanego hamowania między dwoma odcinkami. Długości części zachowaj z opisu wariantu.",
        [],
        a,
      ),
      phase("Przyspiesz", "Przyspiesz do wyznaczonej strefy hamowania.", ["first"], a),
      phase(
        "Opanuj ruch",
        "Skróć kroki i obniż biodra. Opanuj prędkość przed kolejnym startem.",
        [],
        stop,
      ),
      phase("Rusz ponownie", "Ponownie przyspiesz do końca drugiego odcinka.", ["second"], stop),
    ];
    field.setup = field.steps[0].text;
  } else if (CURVED_IDS.has(id)) {
    const turn = point(55, 28);
    field.markers = [
      { point: a, label: "A" },
      { point: turn },
      { point: point(86, 44), label: "B" },
    ];
    field.routes = [
      route(
        "work",
        "run",
        `Łuk ${meters(distance)}`,
        [a, point(24, 30), point(78, 20), point(86, 44)],
        true,
      ),
    ];
    field.setup =
      "Oznacz płynny łuk i wolny wybieg za jego końcem. Kierunek i długość wykonaj zgodnie z planem; rysunek nie wyznacza promienia.";
    field.steps[0].text = field.setup;
    field.steps[1].title = "Po łuku";
    field.steps[1].text =
      id === "reactive_curved_sprint"
        ? "Wybierz stronę dopiero po sygnale partnera i biegnij płynnym łukiem."
        : "Biegnij płynnym łukiem. Nie zamieniaj zakrętu w ostre cięcie.";
  } else if (CUT_IDS.has(id)) {
    const turn = point(52, 45),
      finish = point(83, 25);
    field.markers = [
      { point: a, label: "A" },
      { point: turn, label: "Zwrot" },
      { point: finish, label: "B" },
    ];
    field.routes = [
      route("approach", "run", "Nabieg", [a, turn]),
      route("exit", "run", "Wyjście", [turn, finish]),
    ];
    field.setup =
      "Oznacz start, miejsce zaplanowanego zwrotu i koniec wyjścia. Długości obu części odmierz dokładnie według opisu ćwiczenia.";
    field.steps = [
      phase("Ustaw", field.setup, [], a),
      phase(
        "Wyhamuj",
        "Przed znacznikiem skróć kroki i obniż pozycję. Najpierw opanuj prędkość.",
        ["approach"],
        a,
      ),
      phase(
        "Zmień kierunek",
        "Odepchnij podłoże i przyspiesz w zaplanowanym kierunku. Wykonaj obie strony według planu.",
        ["exit"],
        turn,
      ),
    ];
  } else if (SHUTTLE_IDS.has(id)) {
    field.routes = [
      route("out", "run", "Do linii zwrotu", [a, b]),
      route("back", "run", "Po zwrocie o 180°", [point(76, 62), point(20, 62)]),
    ];
    field.setup =
      id === "planned_505"
        ? "Wyznacz linię startu i linię zwrotu według układu 5-0-5 z planu. Rysunek pokazuje część tam i z powrotem, bez dodatkowego nabiegu testowego."
        : "Wyznacz odcinek i wolne miejsce na kontrolowany zwrot. Partner daje sygnał dopiero w trakcie biegu.";
    field.steps = [
      phase("Ustaw", field.setup, [], a),
      phase(
        "Do zwrotu",
        "Biegnij do oznaczonej linii i wyhamuj przed zmianą kierunku.",
        ["out"],
        a,
      ),
      phase(
        "Wróć biegiem",
        id === "reactive_180_turn"
          ? "Zmień kierunek dopiero po sygnale partnera i przyspiesz po kontrolowanym zwrocie."
          : "Wykonaj zaplanowany zwrot o 180° i przyspiesz w kierunku startu.",
        ["back"],
        b,
      ),
    ];
  }
  if ((runOut || legacyFlying) && !running) {
    const finalRoute = field.routes.at(-1)!;
    const last = finalRoute.points.at(-1)!;
    const before = finalRoute.points.at(-2)!;
    const length = Math.hypot(last[0] - before[0], last[1] - before[1]);
    const finish = point(
      Math.max(8, Math.min(96, last[0] + ((last[0] - before[0]) / length) * 14)),
      Math.max(12, Math.min(90, last[1] + ((last[1] - before[1]) / length) * 14)),
    );
    field.routes.push(
      route(
        "run-out",
        "return",
        runOut ? `Wyhamowanie ${meters(runOut)}` : "Wolna strefa wyhamowania",
        [last, finish],
      ),
    );
    if (runOut) field.measurements.push(`${meters(runOut)} wolnego wybiegu`);
    field.steps.push(
      phase(
        "Wyhamuj",
        runOut
          ? `Za częścią główną wyhamuj stopniowo w wolnej strefie ${meters(runOut)}. Przerwę zachowaj zgodnie z planem.`
          : "Za końcem części lotnej zostaw wolne miejsce i wyhamuj stopniowo. Długość wybiegu ustal według instrukcji sesji.",
        ["run-out"],
        last,
      ),
    );
  }
  if (exercise.instructionSteps?.length) {
    // The saved variant may be more specific than a generic library instruction.
    field.setup += ` ${exercise.instructionSteps
      .map((s) => s.description)
      .filter(Boolean)
      .join(" ")}`;
  }
  return field;
}
