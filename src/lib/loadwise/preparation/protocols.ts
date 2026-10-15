import type { ExerciseItem, SessionCompletion, SessionDay, TrainingExercise } from "../types";

export type RecoveryFocus =
  "whole" | "calves" | "hamstrings" | "quadriceps" | "hips" | "adductors" | "back";

/** A neutral rest/medical hold must never acquire a generated movement session in the UI. */
export function canGuideRecoverySession(session: SessionDay): boolean {
  return (
    session.durationMin > 0 &&
    !session.isUnavailable &&
    session.loadLabelOverride !== "Wstrzymaj trening" &&
    session.dayType !== "match" &&
    session.dayType !== "club" &&
    (session.dayType === "recovery" ||
      session.classification?.isRecovery === true ||
      session.classification?.isMobility === true ||
      /^(regeneracja|mobilność)/i.test(session.sessionType))
  );
}
export type PreparationKind =
  "recovery" | "easy" | "intervals" | "sprint" | "strength" | "football";
export type PreparationVisual =
  | "walk"
  | "ankle"
  | "calf"
  | "soleus"
  | "hamstring"
  | "quad"
  | "hip"
  | "adductor"
  | "cat"
  | "rotation"
  | "squat"
  | "march"
  | "run"
  | "bridge";
export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  scope: string;
}
export const EVIDENCE: Record<string, EvidenceSource> = {
  warmup: {
    id: "warmup",
    title: "McGowan i wsp., 2015 — Warm-Up Strategies",
    url: "https://pubmed.ncbi.nlm.nih.gov/26400696/",
    scope: "Przegląd mechanizmów i projektowania rozgrzewki; nie waliduje niniejszego zestawu.",
  },
  dynamic: {
    id: "dynamic",
    title: "Fletcher i Monte-Colombo, 2010 — rozgrzewka piłkarzy",
    url: "https://pubmed.ncbi.nlm.nih.gov/20634747/",
    scope:
      "Badanie 27 piłkarzy; porównanie rozgrzewek i późniejszej sprawności. Nie dowodzi skuteczności każdego ruchu z osobna.",
  },
  strength: {
    id: "strength",
    title: "The Role of Specific Warm-up during Bench Press and Squat, 2020",
    url: "https://pubmed.ncbi.nlm.nih.gov/32971729/",
    scope:
      "Badanie rozgrzewki specyficznej dla przysiadu i wyciskania; serie wprowadzające pozostają częścią treningu siłowego.",
  },
  recovery: {
    id: "recovery",
    title: "Haller i wsp., 2022 — Evidence-Based Recovery in Soccer",
    url: "https://pubmed.ncbi.nlm.nih.gov/36196351/",
    scope:
      "Przegląd strategii regeneracji w piłce nożnej. Odczucia, zakres ruchu i odzyskanie sprawności są różnymi wynikami.",
  },
  stretch: {
    id: "stretch",
    title: "Cochrane — Stretching to prevent or reduce muscle soreness",
    url: "https://www.cochrane.org/evidence/CD004577_stretching-prevent-or-reduce-muscle-soreness-after-exercise",
    scope:
      "12 badań; rozciąganie nie zmniejsza istotnie praktycznie opóźnionej bolesności mięśni. Nie przypisujemy mu naprawy tkanek.",
  },
  match: {
    id: "match",
    title: "Marqués-Jiménez i wsp., 2025 — Recovery After an Official Soccer Match",
    url: "https://pubmed.ncbi.nlm.nih.gov/40981050/",
    scope:
      "Badanie amatorskich piłkarzy; część zmian utrzymywała się po 48 h. Upływ czasu nie potwierdza pełnej regeneracji konkretnej osoby.",
  },
};
export interface PreparationExercise {
  id: string;
  name: string;
  visual: PreparationVisual;
  cues: [string, string];
  anatomy: string;
  mechanism: string;
  sources: string[];
  seconds?: number;
  reps?: number;
  sides?: boolean;
  sets?: number;
  switchSec?: number;
  restSec?: number;
  doseLabel?: string;
  /** Oryginalne ID pozwala odznaczyć wyłącznie rzeczywiście poprowadzone ćwiczenia. */
  sourceId?: string;
}
export interface PreparationProtocol {
  id: string;
  title: string;
  kind: PreparationKind;
  goal: string;
  reason: string;
  exercises: PreparationExercise[];
  sources: string[];
  note?: string;
}
export interface RecoveryContext {
  highLoad?: boolean;
  nextDemandingDay?: boolean;
  afterMatch?: boolean;
  limited?: boolean;
}
export const RECOVERY_FOCI: { id: RecoveryFocus; label: string; hint: string }[] = [
  { id: "whole", label: "Całe ciało", hint: "Łagodny zestaw ogólny" },
  { id: "calves", label: "Łydki", hint: "Łydka i staw skokowy" },
  { id: "hamstrings", label: "Tył ud", hint: "Tył uda i ruch biodra" },
  { id: "quadriceps", label: "Przód ud", hint: "Przód uda i biodro" },
  { id: "hips", label: "Biodra", hint: "Swobodny ruch bioder" },
  { id: "adductors", label: "Przywodziciele", hint: "Wewnętrzna strona uda" },
  { id: "back", label: "Plecy", hint: "Łagodny ruch tułowia" },
];
const exercise = (
  id: PreparationVisual,
  name: string,
  cues: [string, string],
  anatomy: string,
  mechanism: string,
  dose: Partial<PreparationExercise>,
): PreparationExercise => ({
  id,
  name,
  visual: id,
  cues,
  anatomy,
  mechanism,
  sources: ["recovery", "stretch"],
  switchSec: 10,
  restSec: 15,
  ...dose,
});
const MOVES = {
  walk: exercise(
    "walk",
    "Spokojny marsz",
    ["Idź swobodnie.", "Oddychaj bez zadyszki."],
    "Kończyny dolne; ruch naprzemienny.",
    "Lekki ruch i stopniowe przejście od bezruchu do aktywności. Nie jest pomiarem ani gwarancją odbudowy mięśni.",
    { seconds: 180, restSec: 10, sources: ["recovery"] },
  ),
  ankle: exercise(
    "ankle",
    "Kolano nad stopę",
    ["Pięta pozostaje na ziemi.", "Prowadź kolano w kierunku palców."],
    "Staw skokowy: zgięcie grzbietowe; łydka.",
    "Kontrolowana ekspozycja na zakres ruchu potrzebny w podporze.",
    { reps: 8, sides: true },
  ),
  calf: exercise(
    "calf",
    "Rozciąganie łydki",
    ["Tylna noga prosta, pięta na ziemi.", "Przenieś ciężar lekko do przodu."],
    "Łydka, ze względnym naciskiem na mięsień brzuchaty przy prostym kolanie.",
    "Łagodna ekspozycja na zgięcie grzbietowe stawu skokowego. Celem jest komfort zakresu ruchu, nie usunięcie DOMS.",
    { seconds: 30, sides: true },
  ),
  soleus: exercise(
    "soleus",
    "Łydka z ugiętym kolanem",
    ["Ugnij lekko tylne kolano.", "Pięta cały czas na ziemi."],
    "Łydka, ze względnym naciskiem na płaszczkowaty przy ugiętym kolanie.",
    "Zmiana ustawienia kolana modyfikuje warunki rozciągania łydki; nie izoluje jednego mięśnia.",
    { seconds: 30, sides: true },
  ),
  hamstring: exercise(
    "hamstring",
    "Tył uda w półklęku",
    ["Wyprostuj nogę z przodu, oprzyj piętę.", "Cofnij biodra, zachowaj długie plecy."],
    "Mięśnie kulszowo-goleniowe; zgięcie biodra przy wyproście kolana.",
    "Łagodne utrzymanie tolerowanego zakresu. Bez sprężynowania i pogłębiania na siłę.",
    { seconds: 30, sides: true },
  ),
  quad: exercise(
    "quad",
    "Przód uda z podparciem",
    ["Przytrzymaj stopę za sobą, podeprzyj się.", "Trzymaj kolana blisko, nie wyginaj pleców."],
    "Przednia grupa uda; zgięcie kolana i ustawienie biodra.",
    "Łagodna ekspozycja na długość przedniej części uda. Podparcie ogranicza wymagania równowagi.",
    { seconds: 30, sides: true },
  ),
  hip: exercise(
    "hip",
    "Biodro w półklęku",
    ["Napnij lekko pośladek tylnej nogi.", "Przesuń biodra odrobinę do przodu."],
    "Przód biodra; wyprost biodra z kontrolą miednicy.",
    "Ruch biodra bez zastępowania go przeprostem lędźwiowym.",
    { seconds: 30, sides: true },
  ),
  adductor: exercise(
    "adductor",
    "Cofanie bioder w podparciu",
    ["Odstaw jedną nogę w bok.", "Powoli cofaj biodra i wracaj."],
    "Przywodziciele; odwiedzenie i zgięcie biodra.",
    "Kontrolowany ruch w tolerowanym zakresie, bez dużego obciążenia siłowego.",
    { reps: 6, sides: true },
  ),
  cat: exercise(
    "cat",
    "Koci grzbiet",
    ["Oprzyj dłonie i kolana.", "Powoli zaokrąglaj i prostuj plecy."],
    "Kręgosłup i miednica: łagodne zgięcie i wyprost.",
    "Spokojne poruszanie tułowiem w komfortowym zakresie.",
    { reps: 6 },
  ),
  rotation: exercise(
    "rotation",
    "Otwieranie klatki w leżeniu",
    ["Połóż się na boku, kolana razem.", "Otwieraj górną rękę, wracaj powoli."],
    "Rotacja tułowia z podparciem dolnej części ciała.",
    "Kontrolowana rotacja bez wymuszania końcowego zakresu.",
    { reps: 6, sides: true },
  ),
  squat: exercise(
    "squat",
    "Spokojny przysiad",
    ["Całe stopy na ziemi.", "Zejdź do wygodnej głębokości i wstań."],
    "Biodro, kolano i staw skokowy; wzorzec przysiadu.",
    "Próba wzorca ruchu przed dalszą pracą; bez obciążenia zewnętrznego.",
    { reps: 6, sources: ["warmup", "strength"] },
  ),
  bridge: exercise(
    "bridge",
    "Unoszenie bioder",
    ["Oprzyj stopy, ugnij kolana.", "Unieś biodra bez wyginania pleców."],
    "Wyprost biodra; mięśnie pośladkowe i tylna grupa uda.",
    "Przećwiczenie wyprostu biodra z małym obciążeniem.",
    { reps: 8, sources: ["warmup"] },
  ),
  march: exercise(
    "march",
    "Marsz z uniesieniem kolana",
    ["Unieś kolano, utrzymaj prosty tułów.", "Pracuj przeciwną ręką i zmieniaj nogi."],
    "Koordynacja biodra, kolana, stawu skokowego i ramion.",
    "Przygotowanie rytmu ruchu biegowego przy małej prędkości.",
    { seconds: 40, sources: ["warmup", "dynamic"] },
  ),
  run: exercise(
    "run",
    "Bieg narastająco",
    ["Zacznij swobodnie, zwiększaj tempo płynnie.", "Zakończ z zapasem, bez sprintu maksymalnego."],
    "Wielostawowa praca kończyn dolnych i ramion.",
    "Stopniowe przybliżenie do intensywności kolejnego zadania.",
    { seconds: 20, sets: 2, restSec: 40, sources: ["warmup", "dynamic"] },
  ),
} satisfies Record<PreparationVisual, PreparationExercise>;

export function buildRecoveryProtocol(
  focus: RecoveryFocus = "whole",
  context: RecoveryContext = {},
): PreparationProtocol {
  const selected: Record<RecoveryFocus, PreparationVisual[]> = {
    whole: ["walk", "ankle", "adductor", "rotation"],
    calves: ["walk", "ankle", "calf", "soleus"],
    hamstrings: ["walk", "hamstring", "hip", "cat"],
    quadriceps: ["walk", "quad", "hip", "ankle"],
    hips: ["walk", "hip", "adductor", "rotation"],
    adductors: ["walk", "adductor", "hip", "cat"],
    back: ["walk", "cat", "rotation", "hip"],
  };
  const gentle = Boolean(
    context.highLoad || context.limited || context.nextDemandingDay || context.afterMatch,
  );
  return {
    id: `recovery-v1:${focus}:${gentle ? "gentle" : "standard"}`,
    title: "Regeneracja",
    kind: "recovery",
    goal: "Komfort ruchu przy małym dodatkowym obciążeniu.",
    reason: context.limited
      ? "Plan ogranicza obciążenie — wykonuj tylko komfortowe ruchy."
      : context.afterMatch
        ? "Po meczu utrzymujemy małe obciążenie."
        : context.highLoad
          ? "Po dużym obciążeniu wybieramy krótsze dawki."
          : context.nextDemandingDay
            ? "Przed kolejną mocną sesją utrzymujemy małe obciążenie."
            : "Obszar wybierasz Ty. Dawka pozostaje lekka.",
    exercises: selected[focus].map((id) => ({
      ...MOVES[id],
      cues: [...MOVES[id].cues],
      seconds:
        id === "walk" ? (gentle ? 120 : 180) : MOVES[id].seconds ? (gentle ? 20 : 30) : undefined,
      reps: MOVES[id].reps ? (gentle ? 6 : MOVES[id].reps) : undefined,
    })),
    sources: ["recovery", "stretch", ...(context.afterMatch ? ["match"] : [])],
    note: "Praktyczna adaptacja zasad z badań. Ten dokładny zestaw i jego dawki nie były badane jako osobny protokół. Rozciąganie służy tu komfortowi zakresu ruchu, nie przyspieszaniu naprawy mięśni.",
  };
}

/** Jednostki i przerwy są jawne — timer nigdy nie odgaduje ich z opisu w trakcie sesji. */
export function buildWarmupProtocol(
  kind: Exclude<PreparationKind, "recovery">,
): PreparationProtocol {
  const base = (ids: PreparationVisual[]) =>
    ids.map((id) => ({
      ...MOVES[id],
      cues: [...MOVES[id].cues] as [string, string],
      sources: ["warmup", "dynamic"],
      restSec: id === "run" ? 40 : 10,
    }));
  let exercises: PreparationExercise[];
  if (kind === "easy") {
    exercises = [
      {
        ...MOVES.walk,
        name: "Marsz i bardzo lekki trucht",
        seconds: 180,
        restSec: 0,
        cues: [
          "Zacznij marszem i przejdź do lekkiego truchtu.",
          "Oddychaj swobodnie, potem rozpocznij spokojny bieg.",
        ],
        sources: ["warmup"],
      },
    ];
  } else if (kind === "strength") {
    exercises = [
      { ...MOVES.walk, name: "Marsz lub lekki trucht", seconds: 180, restSec: 10 },
      ...base(["ankle", "adductor", "squat", "bridge"]),
    ];
  } else {
    exercises = [
      {
        ...MOVES.walk,
        name: "Lekki trucht",
        seconds: kind === "sprint" ? 240 : 180,
        restSec: 10,
        cues: [
          "Biegnij swobodnie i rozluźnij barki.",
          "Stopniowo zwiększaj tempo, zachowaj swobodny oddech.",
        ],
      },
      ...base(["ankle", "adductor", "march", "run"]),
    ];
  }
  return {
    id: `warmup-v1:${kind}`,
    title: "Rozgrzewka",
    kind,
    goal:
      kind === "strength"
        ? "Przygotowanie ogólne i próba wzorców przed seriami wprowadzającymi."
        : kind === "easy"
          ? "Łagodne wejście w spokojną pracę biegową."
          : "Stopniowe przygotowanie do intensywności sesji.",
    reason:
      kind === "sprint"
        ? "Po tej części przejdź do zaplanowanych skipów, drilli i narastających odcinków."
        : kind === "strength"
          ? "Potem wykonaj zaplanowane serie wprowadzające pierwszego głównego ćwiczenia."
          : "Dawka odpowiada rodzajowi treningu.",
    exercises,
    sources: ["warmup", ...(kind === "strength" ? ["strength"] : ["dynamic"])],
    note: "Dobór ruchów i dawki to praktyczna adaptacja badań rozgrzewki, a nie odtworzenie jednego przebadanego zestawu. Ruchy dynamiczne wykonuj płynnie i bez wymuszania zakresu.",
  };
}
export function exerciseDose(e: PreparationExercise): string {
  if (e.doseLabel) return e.doseLabel;
  const dose = e.seconds != null ? `${e.seconds} s` : `${e.reps ?? 1} powt.`;
  return `${(e.sets ?? 1) > 1 ? `${e.sets} × ` : ""}${dose}${e.sides ? " / strona" : ""}`;
}
export function protocolDuration(protocol: PreparationProtocol): {
  seconds: number;
  estimated: boolean;
} {
  const steps = expandPreparationSteps(protocol);
  return {
    seconds: steps.reduce((sum, s) => sum + (s.seconds ?? (s.reps ?? 6) * 4), 0),
    estimated: steps.some((s) => s.seconds == null),
  };
}
export function protocolExerciseItems(protocol: PreparationProtocol): ExerciseItem[] {
  return protocol.exercises.map((e) => ({
    name: e.name,
    visualId: `bwprep:${e.visual}`,
    prescription: exerciseDose(e),
    displayPrescription: exerciseDose(e),
    cue: e.cues.join(" "),
    purpose: e.mechanism,
    technique: e.cues.join(" "),
    rest: `${e.restSec ?? 0} s`,
  }));
}
export interface PreparationStep {
  id: string;
  exerciseIndex: number;
  type: "work" | "switch" | "rest";
  side: "left" | "right" | null;
  seconds?: number;
  reps?: number;
  set: number;
  label: string;
}
export function expandPreparationSteps(protocol: PreparationProtocol): PreparationStep[] {
  const steps: PreparationStep[] = [];
  protocol.exercises.forEach((e, exerciseIndex) => {
    for (let set = 1; set <= Math.max(1, e.sets ?? 1); set++) {
      const sides: ("left" | "right" | null)[] = e.sides ? ["left", "right"] : [null];
      sides.forEach((side, sideIndex) => {
        steps.push({
          id: `${exerciseIndex}:${set}:${side ?? "both"}`,
          exerciseIndex,
          type: "work",
          side,
          seconds: e.seconds,
          reps: e.reps,
          set,
          label: e.name,
        });
        if (sideIndex < sides.length - 1)
          steps.push({
            id: `${exerciseIndex}:${set}:switch`,
            exerciseIndex,
            type: "switch",
            side: "right",
            seconds: e.switchSec ?? 10,
            set,
            label: "Zmień stronę",
          });
      });
      if (
        (set < (e.sets ?? 1) || exerciseIndex < protocol.exercises.length - 1) &&
        (e.restSec ?? 0) > 0
      )
        steps.push({
          id: `${exerciseIndex}:${set}:rest`,
          exerciseIndex,
          type: "rest",
          side: null,
          seconds: e.restSec,
          set,
          label: "Przerwa",
        });
    }
  });
  return steps;
}

/** Preferencja dotyczy obszaru ruchu, nie diagnozy. Braku danych nie zastępujemy domyślnym ciężkim meczem. */
export function recoveryContextForSession(
  session: SessionDay,
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  fatigue?: number,
): RecoveryContext {
  const dateMs = Date.parse(`${session.date}T12:00:00Z`);
  let afterMatch = false;
  let highLoad = typeof fatigue === "number" && fatigue >= 7;
  let nextDemandingDay = false;
  for (const day of plan.flatMap((d) => (d.secondSession ? [d, d.secondSession] : [d]))) {
    const delta = (Date.parse(`${day.date}T12:00:00Z`) - dateMs) / 86_400_000;
    const completion = day.dbId ? completions[day.dbId] : undefined;
    if (delta >= -2 && delta < 0 && completion?.completed) {
      if (day.dayType === "match" || day.classification?.countsAsMatch) {
        afterMatch = true;
        if ((completion.durationMin ?? 0) >= 60) highLoad = true;
      }
      if ((completion.rpe ?? 0) >= 8) highLoad = true;
    }
    if (delta > 0 && delta <= 1 && (day.intensity === "wysoka" || day.dayType === "match"))
      nextDemandingDay = true;
  }
  return { afterMatch, highLoad, nextDemandingDay, limited: Boolean(session.loadLabelOverride) };
}

/** Zachowuje konkretne ćwiczenia i dawki istniejącej rozgrzewki; ogólne stare hasła rozwija w jawne ruchy. */
export function warmupFromExercises(
  exercises: TrainingExercise[],
  kind: Exclude<PreparationKind, "recovery">,
): PreparationProtocol {
  const base = buildWarmupProtocol(kind);
  if (
    !exercises.length ||
    exercises.some((e) => /ramp|mobilność: biodra, kostki|aktywacja pośladków i core/i.test(e.name))
  )
    return base;
  const mapped: PreparationExercise[] = [];
  for (const e of exercises) {
    const id = e.visualId?.replace(/^bwprep:/, "") as PreparationVisual;
    const known = id && id in MOVES ? MOVES[id] : undefined;
    if (!known) return base;
    const raw = e.displayPrescription || e.duration || e.reps || "";
    const seconds = raw.match(/^(?:\d+\s*[×x]\s*)?(\d+)\s*s\b/);
    const reps = raw.match(/^(?:\d+\s*[×x]\s*)?(\d+)\s*(?:powt|\/)/);
    mapped.push({
      ...known,
      sourceId: e.id,
      name: e.name,
      seconds: seconds ? Number(seconds[1]) : known.seconds,
      reps: seconds ? undefined : reps ? Number(reps[1]) : known.reps,
      sides: /stron/i.test(raw),
      cues: known.cues,
      sources: base.sources,
    });
  }
  return { ...base, id: `${base.id}:prescribed`, exercises: mapped };
}
