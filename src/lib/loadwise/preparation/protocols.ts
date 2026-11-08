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
  acsm: {
    id: "acsm",
    title: "Garber i wsp., 2011 — ACSM: zalecenia dotyczące ćwiczeń (w tym gibkości)",
    url: "https://pubmed.ncbi.nlm.nih.gov/21694556/",
    scope:
      "Stanowisko ACSM: rozciąganie statyczne 10–30 s na powtórzenie, łącznie ok. 60 s na grupę mięśniową. Dotyczy dorosłych i gibkości ogólnej, nie regeneracji po meczu.",
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
  /** Exact starting position: feet, knees, hands, trunk. */
  setup: string;
  /** Why this number of sets, seconds or repetitions. */
  doseReason: string;
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
  setup: string,
  doseReason: string,
  dose: Partial<PreparationExercise>,
): PreparationExercise => ({
  id,
  name,
  visual: id,
  cues,
  anatomy,
  mechanism,
  setup,
  doseReason,
  sources: ["recovery", "stretch"],
  switchSec: 10,
  restSec: 15,
  ...dose,
});
const STRETCH_DOSE =
  "2 serie po 30 s na stronę to razem 60 s na mięsień. Taką łączną dawkę rozciągania statycznego podają wytyczne ACSM; trzymanie dłużej niż 30 s naraz nie daje wyraźnie więcej. Po dużym obciążeniu serie są krótsze (20 s), żeby nie dokładać napięcia.";
const MOVES = {
  walk: exercise(
    "walk",
    "Spokojny marsz",
    ["Idź swobodnie.", "Oddychaj bez zadyszki."],
    "Kończyny dolne; ruch naprzemienny.",
    "Lekki ruch i stopniowe przejście od bezruchu do aktywności. Nie jest pomiarem ani gwarancją odbudowy mięśni.",
    "Równa trasa, korytarz lub boisko. Stawiaj stopy od pięty, ramiona luźno, wzrok przed siebie.",
    "Około 3 minut wystarczy, żeby tętno i oddech spokojnie zeszły w dół. To przejście do dalszych ćwiczeń, nie dodatkowy trening.",
    { seconds: 180, restSec: 10, sources: ["recovery"] },
  ),
  ankle: exercise(
    "ankle",
    "Kolano nad stopę",
    ["Pięta pozostaje na ziemi.", "Prowadź kolano w kierunku palców."],
    "Staw skokowy: zgięcie grzbietowe; łydka.",
    "Kontrolowana ekspozycja na zakres ruchu potrzebny w podporze.",
    "Wykrok przodem do ściany: przednia stopa ok. 10 cm od ściany, palce prosto do przodu, cała pięta na podłożu. Tylna noga swobodnie z tyłu, dłonie na ścianie.",
    "8 spokojnych powtórzeń na stronę to kilka przejść przez pełny, komfortowy zakres. To praktyczny wybór trenerski: badania nie wskazują lepszej konkretnej liczby, a więcej powtórzeń nie zwiększa zakresu wyraźnie.",
    { reps: 8, sides: true },
  ),
  calf: exercise(
    "calf",
    "Rozciąganie łydki",
    ["Tylna noga prosta, pięta na ziemi.", "Przenieś ciężar lekko do przodu."],
    "Mięsień brzuchaty łydki i ścięgno Achillesa. Brzuchaty przechodzi przez kolano i staw skokowy, dlatego rozciąga się przy prostym kolanie. Pracuje przy każdym odbiciu w biegu i wyskoku.",
    "Łagodna ekspozycja na zgięcie grzbietowe stawu skokowego. Celem jest komfort zakresu ruchu, nie usunięcie DOMS.",
    "Dłonie na ścianie na wysokości barków. Jedna noga z tyłu, około jednego kroku za przednią. Obie stopy ustawione prosto palcami do ściany, tylne kolano wyprostowane, cała pięta tylnej nogi na podłożu.",
    STRETCH_DOSE,
    { seconds: 30, sides: true, sets: 2, sources: ["recovery", "stretch", "acsm"] },
  ),
  soleus: exercise(
    "soleus",
    "Łydka z ugiętym kolanem",
    ["Ugnij lekko tylne kolano.", "Pięta cały czas na ziemi."],
    "Mięsień płaszczkowaty: leży pod brzuchatym i nie przechodzi przez kolano, więc rozciąga się dopiero przy ugiętym kolanie. Mocno obciążony przy bieganiu, hamowaniu i lądowaniu.",
    "Zmiana ustawienia kolana modyfikuje warunki rozciągania łydki; nie izoluje jednego mięśnia.",
    "Jak przy rozciąganiu łydki, ale tylna stopa bliżej (pół kroku). Ugnij tylne kolano i prowadź je nad palce; pięta cały czas na podłożu.",
    STRETCH_DOSE,
    { seconds: 30, sides: true, sets: 2, sources: ["recovery", "stretch", "acsm"] },
  ),
  hamstring: exercise(
    "hamstring",
    "Tył uda w półklęku",
    ["Wyprostuj nogę z przodu, oprzyj piętę.", "Cofnij biodra, zachowaj długie plecy."],
    "Mięśnie kulszowo-goleniowe (dwugłowy uda, półścięgnisty, półbłoniasty). Przechodzą przez biodro i kolano, więc rozciągają się przy zgiętym biodrze i prostym kolanie. To grupa najczęściej naciągana u piłkarzy przy sprincie.",
    "Łagodne utrzymanie tolerowanego zakresu. Bez sprężynowania i pogłębiania na siłę.",
    "Uklęknij na jednym kolanie (pod kolanem coś miękkiego). Przednią nogę wyprostuj: pięta na podłożu, palce do góry. Dłonie na udzie albo po bokach na podłożu, plecy proste.",
    STRETCH_DOSE,
    { seconds: 30, sides: true, sets: 2, sources: ["recovery", "stretch", "acsm"] },
  ),
  quad: exercise(
    "quad",
    "Przód uda z podparciem",
    ["Przytrzymaj stopę za sobą, podeprzyj się.", "Trzymaj kolana blisko, nie wyginaj pleców."],
    "Mięsień czworogłowy uda, zwłaszcza prosty uda — jedyna głowa przechodząca przez biodro, dlatego podwinięcie miednicy pogłębia rozciąganie. Pracuje przy strzale i hamowaniu.",
    "Łagodna ekspozycja na długość przedniej części uda. Podparcie ogranicza wymagania równowagi.",
    "Stań bokiem do ściany i oprzyj o nią dłoń. Drugą ręką chwyć stopę od zewnątrz i przyciągnij piętę do pośladka. Kolana obok siebie, zgięte kolano skierowane w dół, miednica lekko podwinięta.",
    STRETCH_DOSE,
    { seconds: 30, sides: true, sets: 2, sources: ["recovery", "stretch", "acsm"] },
  ),
  hip: exercise(
    "hip",
    "Biodro w półklęku",
    ["Napnij lekko pośladek tylnej nogi.", "Przesuń biodra odrobinę do przodu."],
    "Zginacze biodra tylnej nogi: mięsień biodrowo-lędźwiowy i prosty uda. Pracują przy każdym kroku biegowym i zamachu do strzału; skracają się przy długim siedzeniu.",
    "Ruch biodra bez zastępowania go przeprostem lędźwiowym.",
    "Półklęk: tylne kolano na miękkim podłożu pod biodrem, przednia stopa tak daleko, żeby przednie kolano było nad kostką (kąt ok. 90°). Stopy na szerokość bioder, tułów prosto.",
    STRETCH_DOSE,
    { seconds: 30, sides: true, sets: 2, sources: ["recovery", "stretch", "acsm"] },
  ),
  adductor: exercise(
    "adductor",
    "Cofanie bioder w podparciu",
    ["Odstaw jedną nogę w bok.", "Powoli cofaj biodra i wracaj."],
    "Przywodziciele (wewnętrzna strona uda). U piłkarzy obciążone przy podaniu wewnętrzną częścią stopy i zmianach kierunku; to częste miejsce urazów pachwiny.",
    "Kontrolowany ruch w tolerowanym zakresie, bez dużego obciążenia siłowego.",
    "Klęk podparty: dłonie pod barkami, jedno kolano pod biodrem. Drugą nogę wyprostuj w bok, cała stopa na podłożu, palce do przodu.",
    "6 powolnych powtórzeń na stronę: każde z krótkim zatrzymaniem w końcowym, komfortowym zakresie. Przy tej liczbie ruch pozostaje kontrolowany; to praktyczny dobór, nie wynik konkretnego badania.",
    { reps: 6, sides: true },
  ),
  cat: exercise(
    "cat",
    "Koci grzbiet",
    ["Oprzyj dłonie i kolana.", "Powoli zaokrąglaj i prostuj plecy."],
    "Kręgosłup i miednica: łagodne zgięcie i wyprost.",
    "Spokojne poruszanie tułowiem w komfortowym zakresie.",
    "Klęk podparty: dłonie pod barkami, kolana pod biodrami na szerokość bioder, grzbiety stóp na podłożu.",
    "6 powtórzeń w rytmie oddechu (wydech przy zaokrąglaniu, wdech przy prostowaniu) zajmuje około minuty. Tyle wystarczy, żeby rozruszać kręgosłup bez zmęczenia.",
    { reps: 6 },
  ),
  rotation: exercise(
    "rotation",
    "Rotacja odcinka piersiowego w klęku",
    [
      "Obracaj klatkę i łokieć w górę, wzrok za łokciem.",
      "Biodra zostają nad kolanami, wracaj powoli.",
    ],
    "Odcinek piersiowy kręgosłupa (rotacja) i mięśnie między łopatkami. Swobodny obrót tułowia odciąża lędźwie przy strzale i podaniu.",
    "Kontrolowana rotacja bez wymuszania końcowego zakresu.",
    "Klęk podparty: dłonie pod barkami, kolana pod biodrami. Jedną dłoń połóż za głową, łokieć skierowany w bok.",
    "6 powtórzeń na stronę, każde z 1–2 s zatrzymaniem na górze. Wystarczy, żeby kilka razy przejść przez pełny zakres obrotu; więcej nie daje wyraźnie więcej.",
    { reps: 6, sides: true },
  ),
  squat: exercise(
    "squat",
    "Spokojny przysiad",
    ["Całe stopy na ziemi.", "Zejdź do wygodnej głębokości i wstań."],
    "Biodro, kolano i staw skokowy; wzorzec przysiadu.",
    "Próba wzorca ruchu przed dalszą pracą; bez obciążenia zewnętrznego.",
    "Stopy na szerokość barków, palce lekko na zewnątrz, ciężar na całej stopie.",
    "6 powtórzeń to próba wzorca przed właściwą pracą, bez zmęczenia.",
    { reps: 6, sources: ["warmup", "strength"] },
  ),
  bridge: exercise(
    "bridge",
    "Unoszenie bioder",
    ["Oprzyj stopy, ugnij kolana.", "Unieś biodra bez wyginania pleców."],
    "Wyprost biodra; mięśnie pośladkowe i tylna grupa uda.",
    "Przećwiczenie wyprostu biodra z małym obciążeniem.",
    "Leżenie na plecach, kolana ugięte, stopy na szerokość bioder ok. 30 cm od pośladków, ręce wzdłuż ciała.",
    "8 powtórzeń aktywuje pośladki przed pracą, nie męcząc ich.",
    { reps: 8, sources: ["warmup"] },
  ),
  march: exercise(
    "march",
    "Marsz z uniesieniem kolana",
    ["Unieś kolano, utrzymaj prosty tułów.", "Pracuj przeciwną ręką i zmieniaj nogi."],
    "Koordynacja biodra, kolana, stawu skokowego i ramion.",
    "Przygotowanie rytmu ruchu biegowego przy małej prędkości.",
    "Wyprostowana sylwetka, stopa stawiana pod biodrem, ramiona zgięte ok. 90°.",
    "40 s to kilkanaście kroków na nogę: wystarczy, żeby złapać rytm biegowy.",
    { seconds: 40, sources: ["warmup", "dynamic"] },
  ),
  run: exercise(
    "run",
    "Bieg narastająco",
    ["Zacznij swobodnie, zwiększaj tempo płynnie.", "Zakończ z zapasem, bez sprintu maksymalnego."],
    "Wielostawowa praca kończyn dolnych i ramion.",
    "Stopniowe przybliżenie do intensywności kolejnego zadania.",
    "Prosty odcinek 30–60 m, równe podłoże, wolne miejsce na wybieganie.",
    "2 narastające odcinki stopniowo podnoszą prędkość przed główną częścią; więcej zaczęłoby męczyć.",
    { seconds: 20, sets: 2, restSec: 40, sources: ["warmup", "dynamic"] },
  ),
} satisfies Record<PreparationVisual, PreparationExercise>;

export function buildRecoveryProtocol(
  focus: RecoveryFocus = "whole",
  context: RecoveryContext = {},
): PreparationProtocol {
  const selected: Record<RecoveryFocus, PreparationVisual[]> = {
    whole: ["walk", "cat", "rotation", "ankle", "adductor", "hip", "hamstring", "calf"],
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
  const mapped = mapPrescribed(exercises, base.sources);
  return mapped ? { ...base, id: `${base.id}:prescribed`, exercises: mapped } : base;
}

/** Plan exercises that have a guided counterpart (same movement and drawing). */
const VISUAL_BY_EXERCISE: Record<string, PreparationVisual> = {
  sprint_cooldown_walk: "walk",
  calf_wall_stretch: "calf",
  soleus_bent_knee_stretch: "soleus",
  half_kneeling_hamstring_stretch: "hamstring",
  standing_quad_stretch: "quad",
  half_kneeling_hip_flexor_stretch: "hip",
  adductor_rockback: "adductor",
  ankle_rock_forward: "ankle",
  cat_cow: "cat",
  quadruped_thoracic_rotation: "rotation",
  a_march: "march",
};

export function preparationVisualFor(
  exercise: Pick<TrainingExercise, "exerciseId" | "visualId">,
): PreparationVisual | undefined {
  const fromVisual = exercise.visualId?.replace(/^bwprep:/, "");
  if (fromVisual && fromVisual in MOVES) return fromVisual as PreparationVisual;
  return exercise.exerciseId ? VISUAL_BY_EXERCISE[exercise.exerciseId] : undefined;
}

/** Guided description of a planned movement: anatomy, setup and the reason for its dose. */
export function preparationMoveFor(
  exercise: Pick<TrainingExercise, "exerciseId" | "visualId">,
): PreparationExercise | undefined {
  const visual = preparationVisualFor(exercise);
  return visual ? MOVES[visual] : undefined;
}

/**
 * Keeps the planned sets, seconds, repetitions and sides. Returns undefined
 * when any exercise has no guided counterpart, so the caller shows the list.
 */
function mapPrescribed(
  exercises: TrainingExercise[],
  sources: string[],
): PreparationExercise[] | undefined {
  const mapped: PreparationExercise[] = [];
  for (const e of exercises) {
    const visual = preparationVisualFor(e);
    if (!visual) return undefined;
    const known = MOVES[visual];
    const raw = [
      e.sets && !/×/.test(e.duration || e.reps || "") ? `${e.sets} ×` : "",
      e.displayPrescription || e.duration || e.reps || "",
    ]
      .join(" ")
      .trim();
    const sets = raw.match(/^(\d+)\s*[×x]\s*/);
    const body = sets ? raw.slice(sets[0].length) : raw;
    const minutes = body.match(/^(\d+)\s*min\b/);
    const seconds = body.match(/^(\d+)\s*s\b/);
    const distance = /^\d+\s*m\b/.test(body);
    const reps = distance ? null : body.match(/^(\d+)\s*(?:powt|\/)?/);
    const timed = minutes ? Number(minutes[1]) * 60 : seconds ? Number(seconds[1]) : undefined;
    mapped.push({
      ...known,
      sourceId: e.id,
      name: e.name,
      sets: sets ? Number(sets[1]) : 1,
      seconds: timed ?? (reps ? undefined : known.seconds),
      reps: timed != null ? undefined : reps ? Number(reps[1]) : known.reps,
      sides: /stron/i.test(raw),
      cues: known.cues,
      sources: [...new Set([...sources, ...known.sources])],
    });
  }
  return mapped.length ? mapped : undefined;
}

/** Cool-down guided step by step, or undefined when it contains unguided items. */
export function cooldownFromExercises(
  exercises: TrainingExercise[],
): PreparationProtocol | undefined {
  const mapped = mapPrescribed(exercises, ["recovery", "stretch"]);
  if (!mapped) return undefined;
  return {
    id: `cooldown-v1:${mapped.map((e) => `${e.id}:${e.sets}:${e.seconds ?? e.reps}`).join("|")}`,
    title: "Wyciszenie",
    kind: "recovery",
    goal: "Spokojne zejście z tętna i komfort zakresu ruchu po treningu.",
    reason: "Każde ćwiczenie prowadzi minutnik: strona, zmiana strony i seria.",
    exercises: mapped,
    sources: ["recovery", "stretch", "acsm"],
    note: "Rozciąganie po treningu służy komfortowi zakresu ruchu. Nie przyspiesza naprawy mięśni i nie zapobiega bolesności.",
  };
}
