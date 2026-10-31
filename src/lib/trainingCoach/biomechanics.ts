import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";

export type TechniquePose =
  | "a-position" | "a-contact" | "b-open" | "c-fold" | "straight-leg"
  | "standing" | "squat" | "hinge" | "split" | "acceleration" | "upright" | "landing";

export interface TechniquePhase {
  title: string;
  knee: string;
  hip: string;
  foot: string;
  cue: string;
  pose?: TechniquePose;
  /** Only a teaching reference for this specific phase, never a measured angle. */
  angleLabel?: "≈90°";
}

export interface TechniqueLesson {
  id: string;
  label: string;
  reminder: string;
  mistake: string;
  phases: readonly TechniquePhase[];
  sources: readonly TechniqueSourceId[];
}

export const TECHNIQUE_SOURCES = {
  aSkip: {
    title: "University of Calgary · A-skips",
    url: "https://ucalgary.ca/shred-injuries/all-sports/soccer/a-skips",
  },
  runningABC: {
    title: "Grand River Sports Medicine · ABC biegu",
    url: "https://www.grsm.ca/the-abcs-of-running/",
  },
  athletics: {
    title: "Athletics Canada · materiały szkolenia trenerów",
    url: "https://athletics.ca/coach/pdfs/fac/CCWorkbookReferenceGuide2022ENfillable.pdf",
  },
  sprint: {
    title: "World Athletics · analiza biomechaniczna sprintu",
    url: "https://worldathletics.org/download/download?filename=035f48d6-6507-48f5-934a-52ca04538fcd.pdf&urlslug=Sprint%2Banalysis%2Bof%2Bmen%2527s%2B100m%2Bfinal%2B-%2B2007%2BWorld%2BChampionships",
  },
  squat: {
    title: "NASM · biomechanika przysiadu",
    url: "https://www.nasm.org/resource-center/blog/training/biomechanics-of-the-squat",
  },
  rdl: {
    title: "NSCA · Romanian Deadlift",
    url: "https://www.nsca.com/education/articles/kinetic-select/romanian-deadlift-rdl/",
  },
  strength: {
    title: "NSCA · podstawy treningu siłowego",
    url: "https://www.nsca.com/contentassets/116c55d64e1343d2b264e05aaf158a91/basics_of_strength_and_conditioning_manual.pdf",
  },
  deadlift: {
    title: "NSCA · technika martwego ciągu",
    url: "https://www.nsca.com/globalassets/education/tsac-report/tsac-report-54.pdf",
  },
  nordic: {
    title: "NSCA · warianty Nordic hamstring curl",
    url: "https://www.nsca.com/education/articles/nsca-coach/exercise-progressions-for-resuming-strength-training-following-posterior-chain-muscle-injury/",
  },
} as const;

export type TechniqueSourceId = keyof typeof TECHNIQUE_SOURCES;

const aPosition: TechniquePhase = {
  title: "Uniesienie",
  knee: "W uniesionej nodze około 90° między udem a podudziem. To orientacyjna pozycja A, nie kąt utrzymywany przez cały skip.",
  hip: "Udo w okolicy poziomu; miednica stabilna, tułów wysoki.",
  foot: "Palce uniesione w kierunku piszczeli; nie opuszczaj luźno przodostopia.",
  cue: "Kolano w górę, stopa zadarta.",
  pose: "a-position", angleLabel: "≈90°",
};
const aContact: TechniquePhase = {
  title: "Kontakt",
  knee: "Kolano naturalnie zmienia ugięcie; nie blokuj go i nie próbuj utrzymać 90° przy kontakcie.",
  hip: "Utrzymaj wysokość bioder, bez siadania na nodze podporowej.",
  foot: "Sprowadź stopę blisko pod biodro. Kontakt przyjmuj sprężyście; pięta może naturalnie opaść.",
  cue: "Sprowadź stopę w dół i płynnie zmień nogę.", pose: "a-contact",
};

const LESSONS: Readonly<Record<string, TechniqueLesson>> = {
  a: {
    id: "a", label: "Pozycja A", reminder: "Kolano w górę, stopa zadarta, tułów stabilny.",
    mistake: "Odchylanie tułowia, żeby unieść kolano wyżej, lub sięganie stopą daleko przed ciało.",
    phases: [aPosition, aContact], sources: ["aSkip"],
  },
  b: {
    id: "b", label: "Skip B", reminder: "Unieś kolano, otwórz podudzie i sprowadź stopę pod ciało.",
    mistake: "Wyrzucanie całej nogi jak przy kopnięciu i blokowanie kolana przy otwarciu.",
    phases: [aPosition, {
      title: "Otwarcie",
      knee: "Z pozycji A płynnie otwórz kolano. Zakres zmienia się w ruchu; nie ma jednego obowiązkowego kąta otwarcia.",
      hip: "Udo pozostaje prowadzone z biodra; nie odchylaj tułowia w tył.",
      foot: "Stopa pozostaje aktywna, następnie kieruje się w dół i do tyłu.",
      cue: "Otwórz, a potem sprowadź — bez szarpnięcia.", pose: "b-open",
    }, aContact], sources: ["aSkip", "runningABC"],
  },
  c: {
    id: "c", label: "Skip C", reminder: "Zegnij kolano, kierując piętę do pośladka; biodra pozostają wysoko.",
    mistake: "Wymuszanie dotknięcia pośladka, wyginanie lędźwi i kopanie stopą daleko za ciało.",
    phases: [{
      title: "Zgięcie",
      knee: "Kolano zgina się mocno, gdy pięta wraca w kierunku pośladka. Zakres jest indywidualny; nie wymuszaj dotknięcia.",
      hip: "Tułów i miednica stabilne; bez odchylania i wypychania bioder.",
      foot: "Pięta wraca blisko ciała; stopa nie skręca na boki.",
      cue: "Krótki powrót pięty, spokojny tułów.", pose: "c-fold",
    }, aContact], sources: ["runningABC"],
  },
  d: {
    id: "d", label: "Skip D / bieg na prawie prostych nogach",
    reminder: "Pracuj z biodra na prawie prostych nogach, bez blokowania kolan.",
    mistake: "Przeprost kolana, odchylanie w tył i dalekie, hamujące sięganie stopą.",
    phases: [{
      title: "Wymiana",
      knee: "Noga pozostaje prawie prosta, z naturalnym miękkim kolanem. Nie wciskaj go w przeprost.",
      hip: "Ruch prowadź z biodra, utrzymując wysoki i stabilny tułów.",
      foot: "Stopa aktywna; nogi wymieniają się pod ciałem, bez dalekiego sięgania.",
      cue: "Ruch z biodra, krótki sprężysty kontakt.", pose: "straight-leg",
    }, aContact], sources: ["athletics"],
  },
  wall: {
    id: "wall", label: "Ćwiczenie przy ścianie",
    reminder: "Pochyl całe ciało jako jedną linię; nie zginaj się w pasie.",
    mistake: "Łamanie tułowia w biodrach, przeprost lędźwi lub tracenie ustawienia podczas wymiany.",
    phases: [{
      title: "Ustawienie",
      knee: "Uniesiona noga przyjmuje pozycję A; noga podporowa pozostaje stabilna, bez wymuszania przeprostu.",
      hip: "Głowa, tułów i biodra tworzą jedną pochyloną linię. Kąt pochylenia dobierz do wariantu.",
      foot: "Stopa nogi unoszonej zadarta; noga podporowa pcha podłoże za siebie.",
      cue: "Pchaj ścianę, utrzymując linię ciała.",
    }, {
      title: "Wymiana",
      knee: "Zmieniaj ugięcie wraz z wymianą nóg, bez skręcania kolana do środka.",
      hip: "Miednica pozostaje na tej samej wysokości; ruch nóg nie kołysze tułowiem.",
      foot: "Każdą stopę ustaw w tej samej, kontrolowanej linii podparcia.",
      cue: "Szybko zmień nogi, spokojny tułów.",
    }], sources: ["athletics"],
  },
  acceleration: {
    id: "acceleration", label: "Przyspieszenie",
    reminder: "Pchaj podłoże za siebie i prostuj się stopniowo w kolejnych krokach.",
    mistake: "Sztuczne wydłużanie pierwszego kroku lub utrzymywanie sztywnego kąta kolana przez cały bieg.",
    phases: [{
      title: "Pierwsze kroki",
      knee: "Noga podporowa zmienia ugięcie w czasie pchnięcia. Ustawienie zależy od kroku i wariantu startu.",
      hip: "Pochyl całe ciało w kierunku biegu; nie załamuj tułowia w pasie.",
      foot: "Pchaj podłoże w tył. Nie szukaj długości kroku przez sięganie daleko przed siebie.",
      cue: "Pchnij za siebie i rusz w przód.", pose: "acceleration",
    }, {
      title: "Narastanie",
      knee: "Kąt kolana zmienia się w podporze i w powrocie nogi; 90° ze skipu nie jest celem całego sprintu.",
      hip: "W kolejnych krokach stopniowo unoś pozycję ciała, bez nagłego prostowania.",
      foot: "Pozwól rytmowi i długości kroku narastać naturalnie.",
      cue: "Wstawaj stopniowo, biegnij przez linię.", pose: "upright",
    }], sources: ["sprint"],
  },
  maxSpeed: {
    id: "maxSpeed", label: "Bieg z wysoką prędkością",
    reminder: "Biodra wysoko, swobodne barki; szybki kontakt bez sztucznego wydłużania kroku.",
    mistake: "Kopiowanie jednego kąta z zatrzymanej klatki lub wymuszanie lądowania dokładnie pod środkiem masy.",
    phases: [{
      title: "Powrót nogi",
      knee: "Kolano zgina się i ponownie otwiera w cyklu nogi. Nie utrzymuj jednego kąta.",
      hip: "Utrzymaj wysoką miednicę i swobodny tułów; nie unoś kolana na siłę.",
      foot: "Stopa wraca do kolejnego kontaktu w płynnym cyklu.",
      cue: "Wysoko i swobodnie.", pose: "upright",
    }, {
      title: "Podpór",
      knee: "Kolano naturalnie amortyzuje kontakt; nie blokuj go i nie wymuszaj pełnego wyprostu.",
      hip: "Stabilizuj biodra nad nogą podporową, bez siadania.",
      foot: "Kontakt może wystąpić nieco przed środkiem masy. Unikaj przesadnego sięgania; nie celuj w sztywny punkt.",
      cue: "Krótki kontakt, swobodne ramiona.", pose: "a-contact",
    }], sources: ["sprint"],
  },
  squat: {
    id: "squat", label: "Wzorzec przysiadu",
    reminder: "Cała stopa na podłożu. Kolana prowadź w kierunku palców.",
    mistake: "Wymuszanie 90° u każdego, odrywanie pięt lub tracenie ustawienia tułowia dla większej głębokości.",
    phases: [{
      title: "Zejście",
      knee: "Zginaj kolana zgodnie z kierunkiem stóp. Mogą przesuwać się w przód — nie wymuszaj pionowej piszczeli.",
      hip: "Zginaj biodra i kolana płynnie; utrzymuj napięty tułów.",
      foot: "Utrzymaj podparcie pięty oraz nasad dużego i małego palca.",
      cue: "Zejdź pod kontrolą.", pose: "squat",
    }, {
      title: "Dół",
      knee: "Nie ma jednego obowiązkowego kąta. Głębokość wynika z wariantu, planu, budowy i kontroli ruchu.",
      hip: "Zakończ zejście w zakresie, w którym zachowujesz ustawienie miednicy i tułowia.",
      foot: "Utrzymaj pełne, stabilne podparcie bez odrywania pięty.",
      cue: "Twój kontrolowany zakres.", pose: "squat",
    }, {
      title: "Powrót",
      knee: "Prostuj kolana płynnie w kierunku zgodnym ze stopami.",
      hip: "Unoś biodra i tułów razem; zakończ wysoko bez odchylania lędźwi.",
      foot: "Odepchnij podłoże całą stopą.",
      cue: "Odepchnij podłogę.", pose: "standing",
    }], sources: ["squat"],
  },
  rdl: {
    id: "rdl", label: "Rumuński martwy ciąg",
    reminder: "Cofaj biodra; lekko ugięte kolana zachowują podobne ustawienie.",
    mistake: "Zamiana ruchu w przysiad albo sięganie do podłogi kosztem pozycji pleców.",
    phases: [{
      title: "Opuszczanie",
      knee: "Lekko ugnij kolana i utrzymuj zbliżone ugięcie; nie pogłębiaj go jak w przysiadzie.",
      hip: "Cofaj biodra, trzymając ciężar blisko nóg i tułów stabilnie.",
      foot: "Utrzymuj podparcie całej stopy.",
      cue: "Biodra w tył, ciężar blisko.", pose: "hinge",
    }, {
      title: "Powrót",
      knee: "Zachowaj kontrolę i nie wciskaj kolan w przeprost.",
      hip: "Wyprostuj biodra i wróć wysoko, bez odchylania tułowia w tył.",
      foot: "Nacisk na podłoże pozostaje stabilny.",
      cue: "Wróć biodrami, bez szarpnięcia.", pose: "standing",
    }], sources: ["rdl"],
  },
  split: {
    id: "split", label: "Przysiad w wykroku",
    reminder: "Stabilna przednia stopa, kolano w jej kierunku i spokojna miednica.",
    mistake: "Uciekanie kolana do środka, odrywanie przedniej pięty i odbijanie się w dole.",
    phases: [{
      title: "Zejście",
      knee: "Prowadź przednie kolano zgodnie ze stopą. Zakres zależy od wariantu i długości ustawienia nóg.",
      hip: "Opuszczaj biodra pod kontrolą, bez obracania miednicy.",
      foot: "Przednia stopa jest stabilna; tylna pięta może być uniesiona zgodnie z wariantem.",
      cue: "Zejdź między nogi, zachowaj równowagę.", pose: "split",
    }, {
      title: "Powrót",
      knee: "Prostuj nogę pracującą bez uciekania kolana do środka.",
      hip: "Utrzymuj miednicę stabilnie i wróć do pozycji z planu.",
      foot: "Odepchnij podłoże przednią stopą, bez bujania na jej krawędziach.",
      cue: "Odepchnij podłoże nogą pracującą.", pose: "split",
    }], sources: ["strength"],
  },
  deadlift: {
    id: "deadlift", label: "Martwy ciąg",
    reminder: "Zbuduj napięcie, utrzymaj ciężar blisko ciała i odepchnij podłogę.",
    mistake: "Szarpanie z luźnej pozycji, prostowanie kolan przed ruchem ciężaru i odchylanie się na górze.",
    phases: [{
      title: "Start",
      knee: "Ugnij kolana odpowiednio do wariantu i wysokości ciężaru. Nie kopiuj jednego kąta z innego rodzaju martwego ciągu.",
      hip: "Ustaw biodra i napięty tułów przed oderwaniem ciężaru.",
      foot: "Stabilne podparcie całej stopy; ciężar blisko ciała.",
      cue: "Najpierw napięcie, potem ruch.",
    }, {
      title: "Podnoszenie",
      knee: "Prostuj kolana i biodra w skoordynowanym ruchu, kolana prowadź zgodnie ze stopami.",
      hip: "Biodra i barki unoszą się razem; zakończ w pozycji wysokiej bez odchylania lędźwi.",
      foot: "Odepchnij podłoże, nie przetaczaj się na palce.",
      cue: "Wstań razem z ciężarem.",
    }], sources: ["deadlift"],
  },
  nordic: {
    id: "nordic", label: "Nordic — opuszczanie",
    reminder: "Kontroluj opadanie z kolan; biodra i barki utrzymuj w jednej linii.",
    mistake: "Zginanie bioder zamiast kontroli kolan lub wymuszanie zbyt długiego opadania.",
    phases: [{
      title: "Opuszczanie",
      knee: "Z klęku stopniowo otwieraj kąt kolana. Zakres kończy się tam, gdzie zachowujesz kontrolę.",
      hip: "Utrzymaj linię kolana–biodra–barki. Nie składaj się w biodrach.",
      foot: "Stopy muszą być pewnie zakotwiczone zgodnie z instrukcją wariantu.",
      cue: "Hamuj całym prostym tułowiem.",
    }, {
      title: "Powrót",
      knee: "W wersji ekscentrycznej wróć z pomocą; sam powrót nie jest obowiązkowym powtórzeniem siłowym.",
      hip: "Odtwórz pozycję startową bez szarpania i wyginania lędźwi.",
      foot: "Sprawdź stabilność mocowania przed kolejnym powtórzeniem.",
      cue: "Wróć z pomocą, zacznij pod kontrolą.",
    }], sources: ["nordic"],
  },
  landing: {
    id: "landing", label: "Lądowanie z zatrzymaniem",
    reminder: "Wyląduj miękko i zatrzymaj stabilną pozycję.",
    mistake: "Sztywne kolana, zapadanie do środka lub odbicie, gdy zadaniem jest zatrzymanie.",
    phases: [{
      title: "Przyjęcie",
      knee: "Pozwól kolanom ugiąć się zgodnie z kierunkiem stóp. Nie blokuj ich w wyproście.",
      hip: "Biodra pomagają przyjąć lądowanie; tułów pozostaje pod kontrolą.",
      foot: "Przyjmij kontakt i ustabilizuj podparcie, bez przewracania stóp na krawędzie.",
      cue: "Cicho, stabilnie, zatrzymaj.", pose: "landing",
    }], sources: ["strength"],
  },
  reactive: {
    id: "reactive", label: "Sprężyste kontakty",
    reminder: "Utrzymaj rytm i krótkie, kontrolowane kontakty właściwe dla tego zadania.",
    mistake: "Mylenie sprężystego odbicia z głębokim przysiadem albo blokowanie kolan.",
    phases: [{
      title: "Kontakt i odbicie",
      knee: "Ugięcie zależy od wariantu. Nie blokuj kolana; nie dodawaj głębokiego zejścia, jeśli zadaniem jest krótki kontakt.",
      hip: "Stabilna miednica, kierunek odbicia zgodny z planem.",
      foot: "Odbijaj się sprężyście i zakończ serię, gdy tracisz rytm lub kontrolę.",
      cue: "Równo i sprężyście.",
    }], sources: ["strength"],
  },
  iso: {
    id: "iso", label: "Utrzymanie pozycji",
    reminder: "Zachowaj pozycję i czas zapisane w planie; oddychaj spokojnie.",
    mistake: "Zmiana kąta stawu tylko po to, by wytrzymać dłużej.",
    phases: [{
      title: "Utrzymanie",
      knee: "Utrzymuj kąt wskazany dla konkretnego wariantu. Jeśli plan nie podaje stopni, nie dopisuj własnego celu.",
      hip: "Miednica i tułów pozostają stabilne przez zaplanowany czas.",
      foot: "Zachowaj punkty podparcia opisane w instrukcji ćwiczenia.",
      cue: "Ta sama pozycja przez całą próbę.",
    }], sources: ["strength"],
  },
};

const singleLegRdl: TechniqueLesson = {
  ...LESSONS.rdl, id: "singleLegRdl", label: "RDL jednonóż",
  reminder: "Cofaj biodro na stabilnej nodze podporowej; miednica nie obraca się na bok.",
  phases: LESSONS.rdl.phases.map(({ pose: _pose, ...phase }) => ({
    ...phase, hip: `${phase.hip} Utrzymuj miednicę równo; wolna noga równoważy pochylenie.`,
    foot: "Utrzymuj podparcie całej stopy nogi pracującej. Jeśli wariant przewiduje podporę, skorzystaj z niej.",
  })),
};
const elevatedSplit: TechniqueLesson = {
  ...LESSONS.split, id: "elevatedSplit", label: "Przysiad z tylną nogą na podwyższeniu",
  phases: LESSONS.split.phases.map(({ pose: _pose, ...phase }) => ({
    ...phase, foot: "Cała przednia stopa stabilnie na ziemi; tylna stopa na pewnym podparciu zgodnie z wariantem.",
  })),
};
const fullNordic: TechniqueLesson = {
  ...LESSONS.nordic, id: "fullNordic", label: "Nordic — pełny ruch",
  phases: [LESSONS.nordic.phases[0], {
    ...LESSONS.nordic.phases[1],
    knee: "Zegnij kolana pracą zginaczy, utrzymując kontrolę powrotu. Jeśli jej brakuje, użyj wariantu wspomaganego z planu.",
    cue: "Wróć pod kontrolą, bez zginania bioder.",
  }],
};
const aToD: TechniqueLesson = {
  id: "aToD", label: "Przejście A → D",
  reminder: "Zachowaj wyraźną pozycję A, potem przejdź do wymiany prawie prostych nóg.",
  mistake: "Mieszanie obu faz lub blokowanie kolana przy przejściu do D.",
  phases: [aPosition, { ...LESSONS.d.phases[0], title: "Przejście do D" }, aContact],
  sources: ["aSkip", "athletics"],
};
const bounds: TechniqueLesson = {
  id: "bounds", label: "Wieloskoki i skipy siłowe",
  reminder: "Uzyskaj kierunek odbicia przez pchnięcie podłoża, zachowując stabilną miednicę.",
  mistake: "Sięganie stopą po odległość, zapadanie kolana i wydłużanie serii kosztem jakości.",
  phases: [{
    title: "Odbicie",
    knee: "Prostuj nogę odbijającą w skoordynowanym ruchu z biodrem. Nie wymuszaj jednego kąta kolana nogi wolnej.",
    hip: "Prowadź biodra w kierunku zadania: na wysokość albo na odległość zgodnie z wariantem.",
    foot: "Pchnij podłoże; ruch nie powstaje przez wyciąganie stopy przed siebie.",
    cue: "Odbij się w kierunku z planu.",
  }, {
    title: "Przyjęcie",
    knee: "Przyjmij kontakt kontrolowanym ugięciem, z kolanem w kierunku stopy.",
    hip: "Utrzymaj miednicę stabilną przy zmianie nogi podporowej.",
    foot: "Przyjmij kontakt sprężyście i przejdź do następnego odbicia tylko przy zachowaniu kontroli.",
    cue: "Stabilnie przyjmij, płynnie zmień nogę.",
  }], sources: ["athletics", "strength"],
};
const bToBounds: TechniqueLesson = {
  ...bounds, id: "bToBounds", label: "Skip B → wieloskoki",
  reminder: "Najpierw sekwencja skipu B, potem odbicia naprzemienne zgodnie z zadaniem.",
  phases: [...LESSONS.b.phases, ...bounds.phases], sources: ["aSkip", "runningABC", "athletics"],
};

/** Resolve only recognised exercise identities/patterns. Unknown drills keep their session guide. */
export function resolveTechniqueLesson(exercise: TrainingExercise): TechniqueLesson | null {
  const definition = resolveDefinitionForExercise(exercise);
  const id = definition?.id ?? exercise.exerciseId ?? "";
  const pattern = definition?.movementPattern;
  if (pattern === "isometric" || /(?:^|_)iso(?:_|$)/.test(id)) return LESSONS.iso;
  if (["a_skip", "a_march", "a_skip_add_step", "a_skip_no_add_step", "switch_skip_a", "double_switch_skip_a", "a_switch_progression", "a_accent"].includes(id)) return LESSONS.a;
  if (id === "b_skip") return LESSONS.b;
  if (id === "c_skip" || id === "c_accent") return LESSONS.c;
  if (id === "d_skip") return LESSONS.d;
  if (id === "skip_a_to_d") return aToD;
  if (id === "skip_b_alternate_bounds") return bToBounds;
  if (["power_skip_height", "power_skip_distance", "alternate_leg_bounds"].includes(id)) return bounds;
  if (id === "wall_march" || id === "wall_drill") return LESSONS.wall;
  if (["flying_sprint", "upright_football_sprint", "sprint_max_velocity"].includes(id)) return LESSONS.maxSpeed;
  if (["falling_start", "split_stance_start", "free_acceleration_sprint", "acceleration_mechanics", "push_up_start", "resisted_sled_acceleration"].includes(id)) return LESSONS.acceleration;
  if (/rdl|romanian/.test(id)) return /single_leg|singleleg|one_leg/.test(id) ? singleLegRdl : LESSONS.rdl;
  if (/full_nordic/.test(id)) return fullNordic;
  if (/nordic/.test(id)) return LESSONS.nordic;
  if (/deadlift|trap_bar/.test(id)) return LESSONS.deadlift;
  if (pattern === "lunge") return /bulgarian|rear_foot_elevated/.test(id) ? elevatedSplit : LESSONS.split;
  if (pattern === "squat") return LESSONS.squat;
  if (/drop_landing|depth_drop|stick/.test(id)) return LESSONS.landing;
  if (/pogo|rebound|depth_jump|reactive/.test(id)) return LESSONS.reactive;
  return null;
}

export function jointPositionReply(question: string, exercise: TrainingExercise): string | null {
  const lesson = resolveTechniqueLesson(exercise);
  if (!lesson) return null;
  const text = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
  if (!/kat|kolan|biodr|kostk|staw|stop[ayęe]/.test(text)) return null;
  const joint = /biodr/.test(text) ? "hip" : /kostk|stop[ayęe]/.test(text) ? "foot" : "knee";
  const phases = lesson.phases.map(phase => `${phase.title}: ${phase[joint]}`).join(" ");
  return joint === "knee"
    ? `${phases} Na schemacie kąt między udem a podudziem: 180° oznacza prostą nogę. To objaśnienie ruchu, nie pomiar Twojej techniki.`
    : phases;
}
