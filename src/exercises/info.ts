import type { AnimKey } from "./anims";

/**
 * Opisy techniki ćwiczeń: pętla animacji + 3 krótkie wskazówki (+ intensywność, jeśli ma sens).
 * To teksty robocze (wiedza ogólna z kanonu treningu siłowego i szybkościowego) – do przeglądu trenera.
 */
export interface ExInfo {
  anim?: AnimKey;
  cues: [string, string, string];
  /** Intensywność / tempo wykonania poza zapisem „tempo a-b-c”. */
  pace?: string;
}

const i = (anim: AnimKey | undefined, cues: [string, string, string], pace?: string): ExInfo => ({ anim, cues, pace });

export const INFO: Record<string, ExInfo> = {
  "leg-press": i(undefined, ["Plecy i miednica dociśnięte do oparcia", "Kolana w linii stóp, bez blokowania w górze", "Opuszczasz wolno 3 s, wypychasz płynnie"], "Tempo 3-1-x, zapas 3 powtórzeń"),
  "leg-extension": i(undefined, ["Oparcie ustawione tak, by kolano było przy osi", "Prostujesz nogi płynnie, na górze 1 s", "Opuszczasz wolno 3 s, bez opadania ciężaru"], "Tempo 3-1-x, zapas 3 powtórzeń"),
  "leg-curl-machine": i(undefined, ["Biodra dociśnięte do ławki", "Uginasz płynnie, bez szarpnięcia", "Wracasz wolno 3 s"], "Tempo 3-1-x, zapas 3 powtórzeń"),
  // nowe ćwiczenia z sesji trenera: na razie bez animacji, teksty robocze do przeglądu trenera
  "trap-bar-deadlift": i(undefined, ["Stań w środku gryfu, plecy proste", "Odepchnij podłoże nogami, biodra i barki razem", "Na górze pełny wyprost bioder, bez przeprostu"], "Kontrolowanie w dół, mocno w górę"),
  "db-rdl": i(undefined, ["Biodra do tyłu, kolana lekko ugięte", "Plecy płaskie, hantle blisko nóg", "Wracasz mocnym wyprostem bioder"]),
  "mb-shotput": i(undefined, ["Pchnięcie z nogi przez biodra do ręki", "Tułów obraca się razem z rzutem", "Maksymalnie dynamicznie, pełna kontrola lądowania"], "Maksymalna prędkość rzutu"),
  "mb-overhead-throw": i(undefined, ["Piłka za głowę, łuk w całym ciele", "Rzut z bioder, ramiona na końcu", "Po rzucie stabilna postawa"], "Maksymalna prędkość rzutu"),
  "broad-jump-ex": i(undefined, ["Zamach rąk i szybki przysiad", "Wyskok jak najdalej do przodu", "Lądowanie miękko, trzymasz pozycję 2 s"], "Maksymalnie daleko, z kontrolą lądowania"),
  "skater-jump": i(undefined, ["Wyskok w bok z nogi na nogę", "Lądowanie na jednej nodze, kolano w linii stopy", "Trzymasz równowagę 1 s przed kolejnym"], "Dynamicznie, ale z kontrolą"),
  "sl-assisted-cmj": i(undefined, ["Guma lekko unosi Cię w górę", "Zejście w dół i wyskok z jednej nogi", "Lądowanie miękko na tej samej nodze"], "Maksymalna wysokość"),
  "weighted-step-up-jump": i(undefined, ["Cała stopa na skrzyni, ciężar blisko ciała", "Wyskok z nogi na skrzyni", "Lądowanie miękko na tej samej nodze"], "Wybuchowo, po każdym powtórzeniu kontrola"),
  "knee-iso-push": i("kneeiso", ["Dociskasz kolano w kierunku ruchu i trzymasz 1 s", "Tułów i miednica stabilnie, bez przechyłów", "Bez ruchu – to napięcie, nie powtórzenie"], "Docisk jak najmocniej, bez ruchu"),
  "sl-hip-thrust-iso": i("bridge-iso", ["Biodro wypchnięte wysoko, trzymasz pozycję", "Żebra w dół, bez wyginania lędźwi", "Miednica równo, pięta dociska podłoże"], "Utrzymaj pozycję bez zapadania"),
  "sl-box-jump": i("boxjump", ["Wybicie z jednej nogi, ręce pomagają", "Lądowanie miękko na całej stopie", "Ze skrzyni schodzisz krokiem, nie skaczesz"], "Maksymalnie wysoko, po każdym skoku pełna kontrola"),
  "box-jump": i("boxjump", ["Wyskok obunóż z zamachem rąk", "Lądowanie miękko na całych stopach", "Ze skrzyni schodzisz krokiem, nie skaczesz"], "Maksymalnie wysoko, bez zmęczenia"),
  "pogo-jumps": i("pogo", ["Skaczesz na przodostopiu, kostki sztywne", "Kolana prawie proste", "Krótki kontakt z podłożem, równy rytm"], "Szybko i sprężyście"),
  "hang-power-clean": i("clean", ["Sztanga startuje nad kolanami (wiszenie)", "Wyskok biodrami, ramiona dopiero potem", "Łapiesz sztangę na barkach, łokcie do przodu"], "Wybuchowo"),
  "kb-swing": i("swing", ["Ruch z bioder, nie z ramion", "Plecy płaskie, kettlebell do wysokości klatki", "Na górze mocny wyprost bioder"], "Dynamicznie"),
  "back-squat": i("squat", ["Kolana w linii stóp", "Plecy proste, klatka do przodu", "Zejdź do równoległości ud lub niżej"]),
  "goblet-squat": i("squat-free", ["Ciężar przy klatce, łokcie w dół", "Plecy proste, pięty na ziemi", "Zejdź tak głęboko, jak pozwala technika"]),
  "step-up": i("stepup", ["Cała stopa na skrzyni", "Wypychasz się nogą na skrzyni, nie odbijasz tylną", "Kolano w linii stopy"]),
  "depth-jump-hurdle": i("depthjump", ["Schodzisz ze skrzyni, nie skaczesz", "Po lądowaniu od razu wyskok nad płotek", "Krótki kontakt z ziemią, lądowanie miękko"], "Jak najkrótszy kontakt z podłożem"),
  "depth-box-jump": i("depthjump", ["Schodzisz ze skrzyni, nie skaczesz", "Po lądowaniu od razu wyskok na skrzynię", "Lądowanie miękko, kolana w linii stóp"], "Jak najkrótszy kontakt z podłożem"),
  "bench-press": i("bench", ["Łopatki ściągnięte, stopy na ziemi", "Sztanga do dolnej części klatki", "Łokcie ok. 45° od tułowia"]),
  "db-bench-press": i("bench", ["Łopatki ściągnięte, stopy na ziemi", "Hantle nad klatką, nadgarstki proste", "Opuszczasz kontrolowanie"]),
  "push-up": i("pushup", ["Ciało prostą linią od głowy do pięt", "Łokcie ok. 45° od tułowia", "Klatka niemal do podłoża"]),
  facepull: i("facepull", ["Ciągniesz linkę do twarzy", "Łokcie wysoko, dłonie na zewnątrz", "Ściągasz łopatki, nie odchylasz tułowia"]),
  "bb-row": i("row", ["Tułów pochylony, plecy płaskie", "Ciągniesz sztangę do brzucha", "Na końcu ściągasz łopatki"]),
  "db-row": i("row", ["Plecy płaskie, ręka oparta", "Hantel do biodra, łokieć przy tułowiu", "Bez skręcania tułowia"]),
  "inverted-row": i("invrow", ["Ciało prostą linią, pięty na ziemi", "Ciągniesz klatkę do drążka", "Na końcu ściągasz łopatki"]),
  "sl-straight-leg-ht": i("bridge-sl", ["Biodro wypychasz do góry", "Wolna noga prosta, miednica równo", "Żebra w dół, bez wyginania pleców"]),
  "glute-bridge": i("bridge", ["Pięty blisko pośladków", "Biodra do góry, pośladki napięte", "Żebra w dół, bez wyginania pleców"]),
  "slider-leg-curl": i("slider", ["Biodra wysoko przez cały ruch", "Pięty wysuwasz i wsuwasz powoli", "Opuszczanie wolno (tempo)"]),
  "seated-sl-calf": i("calf", ["Piętę unosisz wysoko", "Pełny zakres: w dół do rozciągnięcia", "Jedna noga, bez bujania"]),
  "banded-hip-flexion": i("kneedrive", ["Kolano w górę przeciw gumie", "Tułów stabilnie, bez odchylania", "Wracasz powoli"]),
  "skip-przejscia": i("skip", ["Rytmicznie, technika ponad prędkość", "Kolano w górę, stopa pod biodrem", "Ręce pracują naprzeciw nóg"], "Spokojnie i rytmicznie"),
  "skip-a-b-d": i("skip", ["Lekko i rytmicznie", "Kolano w górę, stopa pod biodrem", "Ręce pracują naprzeciw nóg"], "Lekko; z każdą serią trochę szybciej"),
  ankling: i("ankling", ["Mały krok na przodostopiu", "Palce stopy ku górze, kolana nisko", "Szybko i lekko, pięty nie dotykają ziemi"], "Szybko, krótkie kroki"),
  "resisted-first-step": i("start", ["Ciało pochylone ok. 45°", "Pierwszy krok mocno w podłoże", "Pchasz stopą pod siebie"], "Mocno, 100% wysiłku"),
  "resisted-sprint": i("sprint", ["Mocne odpychanie od podłoża", "Pochylone ciało, stopniowo się prostujesz", "Krótkie, mocne kroki"], "Maksymalny wysiłek"),
  "sprint-30": i("sprint", ["Start pochylony, stopniowo się prostujesz", "Mocne odpychanie od podłoża", "Rozluźnione ramiona i szczęka"], "Maksymalna prędkość"),
  "cod-turnover": i("decel", ["Zwolnij i obniż biodra", "Stopa zewnętrzna mocno w podłoże", "Obróć tułów i odbij się w nowym kierunku"], "80–90% prędkości, uwaga na technikę"),
  deceleration: i("decel", ["Zatrzymujesz się w 2–3 krokach", "Biodra nisko, stopy przed ciałem", "Kolana w linii stóp, stabilnie"], "Z rozbiegu 10 m, zatrzymanie w 2–3 krokach"),
  "sl-jumps-llrr": i("hop", ["Skaczesz na jednej nodze: L L P P", "Krótki kontakt z podłożem", "Lądowanie miękko, kolano w linii stopy"], "Sprężyście, krótki kontakt"),
  "heiden-jumps": i("hop", ["Skok z nogi na nogę w bok", "Lądowanie na jednej nodze, stabilnie", "Krótki kontakt z podłożem"], "Krótki kontakt z podłożem"),
  "curve-run": i("sprint", ["Ciało pochylone do środka łuku", "Zewnętrzna stopa mocno odpycha", "Utrzymujesz prędkość na całym łuku"], "Prędkość submaksymalna do maksymalnej"),
  "bw-squat": i("squat-free", ["Kolana w linii stóp", "Plecy proste, klatka do przodu", "Pięty na ziemi"]),
  "split-squat": i("split", ["Tułów prosto, przednie kolano w linii stopy", "Tylne kolano w dół prawie do ziemi", "Ciężar na całej przedniej stopie"]),
  "bulgarian-split-squat": i("split", ["Tylna stopa oparta z tyłu", "Przednie kolano w linii stopy", "Tułów prosto, schodzisz powoli"]),
  "assisted-pistol": i("pistol", ["Trzymasz się czegoś dla równowagi", "Kolano w linii stopy", "Schodzisz kontrolowanie, wstajesz siłą nogi"]),
  "pistol-squat": i("pistol", ["Druga noga wyprostowana przed siebie", "Kolano w linii stopy, pięta na ziemi", "Schodzisz kontrolowanie"]),
  "sl-glute-bridge": i("bridge-sl", ["Biodro do góry, miednica równo", "Wolna noga prosta", "Żebra w dół, bez wyginania pleców"]),
  "sl-rdl-bw": i("rdl", ["Tułów w dół, wolna noga w tył", "Plecy płaskie, biodra równo", "Noga podporowa lekko ugięta"]),
  "nordic-assisted": i("nordic", ["Kolana na miękkim, stopy zablokowane", "Ciało prostą linią od kolan do głowy", "Opadasz jak najwolniej, dłonie asekurują"], "Opadasz wolno, wracasz z pomocą rąk"),
  "nordic-curl": i("nordic", ["Kolana na miękkim, stopy zablokowane", "Ciało prostą linią od kolan do głowy", "Opadasz jak najwolniej"], "Opadasz możliwie wolno"),
  "incline-push-up": i("pushup", ["Dłonie na podwyższeniu", "Ciało prostą linią", "Klatka niemal do podwyższenia"]),
  "feet-elevated-push-up": i("pushup", ["Stopy na podwyższeniu", "Ciało prostą linią, brzuch napięty", "Klatka niemal do podłoża"]),
  "archer-push-up": i("pushup", ["Jedna ręka prosta w bok, druga się zgina", "Ciało prostą linią", "Zmieniasz stronę co powtórzenie lub serię"]),
  "feet-elevated-row": i("invrow", ["Stopy wyżej, ciało prostą linią", "Ciągniesz klatkę do drążka", "Na końcu ściągasz łopatki"]),
  "archer-row": i("invrow", ["Jedna ręka ciągnie, druga prosta w bok", "Ciało prostą linią", "Zmieniasz stronę co powtórzenie lub serię"]),
  "squat-jump": i("sqjump", ["Zejdź do przysiadu i wyskocz", "Ręce pomagają w wyskoku", "Lądowanie miękko, kolana w linii stóp"], "Wysoko, każdy skok z pełną kontrolą"),
  bounding: i("bound", ["Długie skoki z nogi na nogę", "Ręce pracują naprzemiennie", "Odbijasz się mocno i lecisz do przodu"], "Długo i sprężyście"),
  "sl-hop": i("hop", ["Skaczesz na jednej nodze do przodu", "Krótki kontakt z podłożem", "Lądowanie miękko, stabilnie"]),
  "sl-calf-raise": i("calf", ["Piętę unosisz wysoko", "Wolno w dół", "Jedna noga, bez bujania"]),
  "side-plank": i("sideplank", ["Ciało prostą linią od głowy do stóp", "Biodra wysoko, bez opadania", "Łokieć pod barkiem"]),
  copenhagen: i("sideplank", ["Górna noga oparta na ławce", "Ciało prostą linią, biodra wysoko", "Przywodziciele napięte, bez skręcania"]),
};

/** Wyjaśnienie zapisu tempa „4-1-x” (opuszczanie – pauza – unoszenie) lub null, gdy w notatce nie ma tempa. */
export function tempoParts(note?: string): { raw: string; parts: [string, string, string] } | null {
  const m = note?.match(/(\d)-(\d)-(\d|x)/i);
  if (!m) return null;
  const [raw, down, hold, up] = m as unknown as [string, string, string, string];
  return {
    raw,
    parts: [`${down} s w dół`, hold === "0" ? "bez pauzy" : `${hold} s pauza`, up.toLowerCase() === "x" ? "w górę szybko" : `${up} s w górę`],
  };
}
