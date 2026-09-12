/**
 * CENTRALNY REJESTR MEDIÓW ĆWICZEŃ — jedno źródło prawdy.
 *
 * ZASADY (twarde):
 * 1. Klucz to DOKŁADNY `exerciseId`. Nigdy nazwa, kategoria ani podobieństwo.
 * 2. Jedna grafika = jeden ruch. Nie wolno przypisywać grafiki innego ćwiczenia.
 * 3. Miniatura i widok pełny pochodzą z TEGO SAMEGO wpisu.
 * 4. Brak wpisu = neutralny placeholder „Ilustracja w przygotowaniu”.
 */

import sprintAcceleration from "@/assets/blueprints/sprint_acceleration.png";
import maxVelocitySprint from "@/assets/blueprints/max_velocity_sprint.png";
import decelerationImg from "@/assets/blueprints/deceleration.png";
import boundsImg from "@/assets/blueprints/bounds.png";
import pogoJump from "@/assets/blueprints/pogo_jump.png";
import fallingStartImg from "@/assets/blueprints/falling_start.png";

/** Pozycja sylwetki — lokalny układ 0–100, stopy na linii y=88. */
export type PoseKey =
  | "stand"
  | "walk"
  | "breathe"
  | "lean_fall"
  | "drive"
  | "drive_low"
  | "wall_march"
  | "push_up_start"
  | "split_stance"
  | "upright_run"
  | "build_up_run"
  | "arc_run"
  | "brake"
  | "brake_deep"
  | "cut"
  | "lateral_exit"
  | "snap_down"
  | "pogo"
  | "lateral_pogo"
  | "bound_air"
  | "scissor_air"
  | "skip_a"
  | "skip_b"
  | "skip_c"
  | "skip_d"
  | "power_skip"
  | "straight_leg"
  | "sled_push"
  | "ankling"
  | "stick_land"
  | "react";

/** Tło sceny — kontekst boiska: pachołki, ściana, sanie, sygnał, linie. */
export type MotifKey =
  | "plain"
  | "start_line"
  | "cones"
  | "wall"
  | "sled"
  | "signal"
  | "stop_zone"
  | "arc"
  | "cut_line"
  | "lateral_line";

export interface MediaFrame {
  /** Polski podpis fazy. */
  caption: string;
  pose: PoseKey;
  /** Pozycja wzdłuż sceny 0–100 (środek sylwetki). */
  x: number;
}

export interface SceneMedia {
  kind: "scene";
  exerciseId: string;
  /** Tytuł ilustracji (aria/alt). */
  title: string;
  /** Pełny polski alt. */
  altPl: string;
  motif: MotifKey;
  frames: MediaFrame[];
}

export interface BlueprintMedia {
  kind: "blueprint";
  exerciseId: string;
  title: string;
  altPl: string;
  src: string;
}

export type ExerciseMedia = SceneMedia | BlueprintMedia;

function scene(
  exerciseId: string,
  title: string,
  altPl: string,
  motif: MotifKey,
  frames: MediaFrame[],
): SceneMedia {
  return { kind: "scene", exerciseId, title, altPl, motif, frames };
}

function blueprint(
  exerciseId: string,
  title: string,
  altPl: string,
  src: string,
): BlueprintMedia {
  return { kind: "blueprint", exerciseId, title, altPl, src };
}

/**
 * Rejestr — klucz = exerciseId. Kolejność alfabetyczna dla czytelności.
 */
export const EXERCISE_MEDIA: Record<string, ExerciseMedia> = {
  a_accent: scene(
    "a_accent",
    "A-accent",
    "Sekwencja skipu A z akcentem: rytm marszowy, mocne uderzenie stopą pod biodrem, powrót do rytmu.",
    "plain",
    [
      { caption: "Rytm marszowy, wysokie biodra", pose: "skip_a", x: 30 },
      { caption: "Akcent — mocne uderzenie pod biodrem", pose: "skip_d", x: 52 },
      { caption: "Powrót do spokojnego rytmu", pose: "skip_a", x: 74 },
    ],
  ),
  a_skip: scene(
    "a_skip",
    "Skip A",
    "Skip A: kolano w górę, stopa pod biodrem, kontakt pod środkiem masy.",
    "plain",
    [
      { caption: "Kolano w górę, stopa uniesiona", pose: "skip_a", x: 32 },
      { caption: "Aktywne opuszczenie stopy pod biodro", pose: "skip_d", x: 54 },
      { caption: "Krótki kontakt i kolejny cykl", pose: "skip_a", x: 76 },
    ],
  ),
  a_skip_add_step: scene(
    "a_skip_add_step",
    "Skip A z krokiem dostawnym",
    "Skip A z krokiem dostawnym: między cyklami pojawia się dodatkowy krok porządkujący rytm.",
    "plain",
    [
      { caption: "Cykl skipu A", pose: "skip_a", x: 26 },
      { caption: "Krok dostawny — reset rytmu", pose: "walk", x: 48 },
      { caption: "Kolejny cykl na drugiej nodze", pose: "skip_a", x: 70 },
    ],
  ),
  a_skip_no_add_step: scene(
    "a_skip_no_add_step",
    "Skip A bez kroku dostawnego",
    "Skip A bez kroku dostawnego: cykle następują po sobie naprzemiennie, bez pauzy.",
    "plain",
    [
      { caption: "Cykl na lewej nodze", pose: "skip_a", x: 28 },
      { caption: "Natychmiastowa wymiana nóg", pose: "skip_d", x: 50 },
      { caption: "Cykl na prawej nodze bez pauzy", pose: "skip_a", x: 72 },
    ],
  ),
  a_switch_progression: scene(
    "a_switch_progression",
    "Zmiany A: pojedyncza → podwójna → potrójna",
    "Progresja zmian A: jedna, dwie, a następnie trzy szybkie wymiany nóg w pozycji akceleracyjnej.",
    "plain",
    [
      { caption: "Pozycja wyjściowa, tułów pochylony", pose: "drive", x: 24 },
      { caption: "Pojedyncza zmiana nogi", pose: "skip_a", x: 44 },
      { caption: "Podwójna zmiana bez utraty pozycji", pose: "skip_d", x: 62 },
      { caption: "Potrójna zmiana — szybki rytm", pose: "skip_a", x: 80 },
    ],
  ),
  accel_decel_reaccel: scene(
    "accel_decel_reaccel",
    "Przyspieszenie – hamowanie – ponowne przyspieszenie",
    "Sekwencja: przyspieszenie, kontrolowane hamowanie w strefie i ponowny start w tym samym kierunku.",
    "stop_zone",
    [
      { caption: "Przyspieszenie z pochyleniem", pose: "drive", x: 20 },
      { caption: "Obniżenie środka masy w strefie", pose: "brake", x: 46 },
      { caption: "Krótkie zatrzymanie pod kontrolą", pose: "brake_deep", x: 60 },
      { caption: "Ponowny start, znów pochylenie", pose: "drive", x: 82 },
    ],
  ),
  alternate_leg_bounds: blueprint(
    "alternate_leg_bounds",
    "Wieloskok naprzemienny",
    "Wieloskok naprzemienny — długa faza lotu i lądowanie na przeciwną nogę.",
    boundsImg,
  ),
  ankling: scene(
    "ankling",
    "Ankling",
    "Ankling: bardzo niskie, szybkie kontakty stopą przy prawie prostych nogach.",
    "plain",
    [
      { caption: "Niski, szybki kontakt stopą", pose: "ankling", x: 34 },
      { caption: "Stopa uniesiona przed kontaktem", pose: "ankling", x: 56 },
      { caption: "Rytm bez unoszenia kolan", pose: "ankling", x: 78 },
    ],
  ),
  app_audio_forward_left_right: scene(
    "app_audio_forward_left_right",
    "Start na sygnał dźwiękowy",
    "Start na sygnał dźwiękowy: reakcja z pozycji gotowości i wybieg w przód, w lewo lub w prawo.",
    "signal",
    [
      { caption: "Pozycja gotowości, czekasz na sygnał", pose: "react", x: 30 },
      { caption: "Sygnał — pierwszy krok w podanym kierunku", pose: "drive_low", x: 52 },
      { caption: "Trzy mocne kroki przyspieszenia", pose: "drive", x: 76 },
    ],
  ),
  app_visual_colour_cue_cod: scene(
    "app_visual_colour_cue_cod",
    "Zmiana kierunku na sygnał wizualny",
    "Zmiana kierunku na sygnał wizualny: bieg, rozpoznanie koloru i cięcie we wskazaną stronę.",
    "signal",
    [
      { caption: "Bieg w kierunku sygnału", pose: "upright_run", x: 24 },
      { caption: "Rozpoznanie koloru i hamowanie", pose: "brake", x: 48 },
      { caption: "Cięcie we wskazaną stronę", pose: "cut", x: 66 },
      { caption: "Wyjście z przyspieszeniem", pose: "drive", x: 84 },
    ],
  ),
  b_skip: scene(
    "b_skip",
    "Skip B",
    "Skip B: kolano w górę, wyprost podudzia i aktywne zgarnięcie stopy pod biodro.",
    "plain",
    [
      { caption: "Kolano w górę jak w skipie A", pose: "skip_a", x: 30 },
      { caption: "Wyprost podudzia przed sobą", pose: "skip_b", x: 54 },
      { caption: "Zgarnięcie stopy pod biodro", pose: "skip_d", x: 78 },
    ],
  ),
  bilateral_pogo: blueprint(
    "bilateral_pogo",
    "Pogo obunóż",
    "Pogo obunóż — niskie, sprężyste odbicia z bardzo krótkim kontaktem z podłożem.",
    pogoJump,
  ),
  c_accent: scene(
    "c_accent",
    "C-accent",
    "Skip C z akcentem: cykliczna praca nogi z jednym mocniejszym zgarnięciem stopy.",
    "plain",
    [
      { caption: "Cykliczny ruch nogi do przodu", pose: "skip_c", x: 32 },
      { caption: "Akcent — mocne zgarnięcie pod biodro", pose: "skip_d", x: 56 },
      { caption: "Powrót do spokojnego cyklu", pose: "skip_c", x: 78 },
    ],
  ),
  c_skip: scene(
    "c_skip",
    "Skip C",
    "Skip C: koliste, cykliczne prowadzenie nogi ze stabilną miednicą.",
    "plain",
    [
      { caption: "Noga prowadzona po okręgu", pose: "skip_c", x: 32 },
      { caption: "Stopa wraca pod biodro", pose: "skip_d", x: 56 },
      { caption: "Miednica stabilna przez cały cykl", pose: "skip_c", x: 78 },
    ],
  ),
  d_skip: scene(
    "d_skip",
    "Skip D",
    "Skip D: szybkie, krótkie uderzenie stopą pod biodrem z aktywną kostką.",
    "plain",
    [
      { caption: "Stopa uniesiona, kostka napięta", pose: "skip_d", x: 34 },
      { caption: "Szybkie uderzenie pod biodrem", pose: "ankling", x: 56 },
      { caption: "Natychmiastowy powrót kolana", pose: "skip_d", x: 78 },
    ],
  ),
  deceleration_lateral_exit: scene(
    "deceleration_lateral_exit",
    "Hamowanie z wyjściem bocznym",
    "Hamowanie z wyjściem bocznym: obniżenie środka masy, zatrzymanie i krótki wybieg w bok.",
    "lateral_line",
    [
      { caption: "Bieg w kierunku strefy", pose: "upright_run", x: 22 },
      { caption: "Obniżenie bioder i hamowanie", pose: "brake", x: 46 },
      { caption: "Stopa zewnętrzna pod kontrolą", pose: "lateral_exit", x: 64 },
      { caption: "Krótkie wyjście w bok", pose: "drive_low", x: 84 },
    ],
  ),
  double_switch_skip_a: scene(
    "double_switch_skip_a",
    "Podwójna zmiana → Skip A",
    "Podwójna zmiana nóg zakończona przejściem w rytm skipu A.",
    "plain",
    [
      { caption: "Pozycja wyjściowa, pochylenie", pose: "drive", x: 24 },
      { caption: "Dwie szybkie zmiany nogi", pose: "skip_d", x: 48 },
      { caption: "Przejście w rytm skipu A", pose: "skip_a", x: 76 },
    ],
  ),
  falling_start: blueprint(
    "falling_start",
    "Start z upadku",
    "Start z upadku — wychylenie całego ciała i pierwszy krok w momencie utraty równowagi.",
    fallingStartImg,
  ),
  flying_sprint: scene(
    "flying_sprint",
    "Sprint lotny",
    "Sprint lotny: rozbieg, odcinek z maksymalną prędkością między znacznikami i swobodne wyhamowanie.",
    "cones",
    [
      { caption: "Rozbieg narastający", pose: "build_up_run", x: 20 },
      { caption: "Wejście w odcinek mierzony", pose: "upright_run", x: 46 },
      { caption: "Maksymalna prędkość, wysokie biodra", pose: "upright_run", x: 66 },
      { caption: "Swobodne wyjście z odcinka", pose: "build_up_run", x: 86 },
    ],
  ),
  football_curved_sprint: scene(
    "football_curved_sprint",
    "Sprint po łuku",
    "Sprint po łuku: bieg po wyznaczonym łuku z pochyleniem do środka zakrętu.",
    "arc",
    [
      { caption: "Wejście w łuk", pose: "arc_run", x: 24 },
      { caption: "Pochylenie do środka zakrętu", pose: "arc_run", x: 50 },
      { caption: "Wyjście z łuku w bieg prosty", pose: "upright_run", x: 78 },
    ],
  ),
  free_acceleration_sprint: blueprint(
    "free_acceleration_sprint",
    "Przyspieszenia",
    "Swobodne przyspieszenie — stopniowe prostowanie tułowia w kolejnych krokach.",
    sprintAcceleration,
  ),
  lateral_bound_to_stick: scene(
    "lateral_bound_to_stick",
    "Skok boczny z zatrzymaniem",
    "Skok boczny z zatrzymaniem: odbicie w bok i pewne lądowanie na jednej nodze.",
    "lateral_line",
    [
      { caption: "Ugięcie na nodze odbijającej", pose: "snap_down", x: 28 },
      { caption: "Lot w bok", pose: "bound_air", x: 52 },
      { caption: "Lądowanie i zatrzymanie na 2 s", pose: "stick_land", x: 76 },
    ],
  ),
  lateral_pogo: scene(
    "lateral_pogo",
    "Pogo boczne",
    "Pogo boczne: niskie sprężyste odbicia w bok z napiętą kostką.",
    "lateral_line",
    [
      { caption: "Sprężyste odbicie w bok", pose: "pogo", x: 34 },
      { caption: "Krótki kontakt, kostka napięta", pose: "lateral_pogo", x: 54 },
      { caption: "Powrót w drugą stronę", pose: "pogo", x: 74 },
    ],
  ),
  planned_cut: scene(
    "planned_cut",
    "Zaplanowane cięcie",
    "Zaplanowane cięcie: dobieg do znacznika, plant stopą zewnętrzną i przyspieszenie w nowym kierunku.",
    "cut_line",
    [
      { caption: "Dobieg do znacznika", pose: "upright_run", x: 22 },
      { caption: "Obniżenie bioder przed cięciem", pose: "brake", x: 44 },
      { caption: "Plant stopą zewnętrzną", pose: "cut", x: 64 },
      { caption: "Wyjście w nowym kierunku", pose: "drive", x: 84 },
    ],
  ),
  power_skip_distance: scene(
    "power_skip_distance",
    "Power skip na odległość",
    "Power skip na odległość: mocne odbicie skierowane do przodu i długa faza lotu.",
    "plain",
    [
      { caption: "Zamach kolanem i ramieniem", pose: "power_skip", x: 26 },
      { caption: "Odbicie skierowane do przodu", pose: "bound_air", x: 52 },
      { caption: "Miękkie lądowanie, kolejne odbicie", pose: "power_skip", x: 78 },
    ],
  ),
  power_skip_height: scene(
    "power_skip_height",
    "Power skip na wysokość",
    "Power skip na wysokość: odbicie skierowane w górę z wysokim kolanem.",
    "plain",
    [
      { caption: "Zamach kolanem w górę", pose: "power_skip", x: 30 },
      { caption: "Odbicie pionowo w górę", pose: "scissor_air", x: 54 },
      { caption: "Kontrolowane lądowanie", pose: "snap_down", x: 76 },
    ],
  ),
  progressive_build_up_sprint: blueprint(
    "progressive_build_up_sprint",
    "Narastające przebieżki",
    "Narastająca przebieżka — płynne zwiększanie prędkości bez zaciskania sylwetki.",
    maxVelocitySprint,
  ),
  progressive_deceleration_5_10_15: blueprint(
    "progressive_deceleration_5_10_15",
    "Progresywne hamowanie",
    "Sprint z kontrolowanym hamowaniem po wyznaczonym odcinku.",
    decelerationImg,
  ),
  progressive_run_three_step_stop: scene(
    "progressive_run_three_step_stop",
    "Bieg i zatrzymanie w trzech krokach",
    "Bieg zakończony zatrzymaniem w trzech kontrolowanych krokach.",
    "stop_zone",
    [
      { caption: "Bieg z narastającą prędkością", pose: "upright_run", x: 20 },
      { caption: "Pierwszy krok hamujący", pose: "brake", x: 44 },
      { caption: "Drugi krok, biodra niżej", pose: "brake_deep", x: 62 },
      { caption: "Trzeci krok — pełne zatrzymanie", pose: "stick_land", x: 82 },
    ],
  ),
  push_up_start: scene(
    "push_up_start",
    "Start z podporu",
    "Start z podporu: z pozycji na dłoniach szybkie ustawienie stóp pod ciałem i wybieg.",
    "start_line",
    [
      { caption: "Pozycja podporu przodem", pose: "push_up_start", x: 26 },
      { caption: "Stopy szybko pod ciało", pose: "drive_low", x: 50 },
      { caption: "Wybieg z mocnym pochyleniem", pose: "drive", x: 78 },
    ],
  ),
  reactive_curved_sprint: scene(
    "reactive_curved_sprint",
    "Reaktywny sprint po łuku",
    "Reaktywny sprint po łuku: decyzja lewo/prawo i płynny bieg po wybranym łuku.",
    "arc",
    [
      { caption: "Start i obserwacja sygnału", pose: "react", x: 20 },
      { caption: "Decyzja: łuk w lewo lub w prawo", pose: "arc_run", x: 46 },
      { caption: "Płynne pochylenie w łuku", pose: "arc_run", x: 66 },
      { caption: "Wyjście na prostą", pose: "upright_run", x: 86 },
    ],
  ),
  resisted_sled_acceleration: scene(
    "resisted_sled_acceleration",
    "Przyspieszenie z oporem sań",
    "Przyspieszenie z oporem sań: mocne pchnięcie podłoża przy stałym pochyleniu tułowia.",
    "sled",
    [
      { caption: "Pozycja startowa z napiętą uprzężą", pose: "sled_push", x: 26 },
      { caption: "Długie pchnięcie podłoża", pose: "drive_low", x: 50 },
      { caption: "Stałe pochylenie przez cały odcinek", pose: "drive", x: 76 },
    ],
  ),
  run_two_step_stop: scene(
    "run_two_step_stop",
    "Bieg i zatrzymanie w dwóch krokach",
    "Bieg zakończony zatrzymaniem w dwóch krokach ze stabilną pozycją.",
    "stop_zone",
    [
      { caption: "Bieg w kierunku strefy", pose: "upright_run", x: 24 },
      { caption: "Pierwszy krok hamujący", pose: "brake", x: 52 },
      { caption: "Drugi krok — zatrzymanie", pose: "stick_land", x: 80 },
    ],
  ),
  scissor_bounds: scene(
    "scissor_bounds",
    "Naprzemienne wyskoki nożycowe",
    "Wyskoki nożycowe: wymiana nóg w powietrzu i lądowanie w pozycji wykrocznej.",
    "plain",
    [
      { caption: "Pozycja wykroczna, ugięte nogi", pose: "split_stance", x: 28 },
      { caption: "Wymiana nóg w powietrzu", pose: "scissor_air", x: 52 },
      { caption: "Lądowanie w odwrotnym wykroku", pose: "split_stance", x: 76 },
    ],
  ),
  scissor_exchange_jump: scene(
    "scissor_exchange_jump",
    "Naprzemienny skok nożycowy z wymianą",
    "Skok nożycowy z pełną wymianą nóg i miękkim lądowaniem.",
    "plain",
    [
      { caption: "Start w pozycji wykrocznej", pose: "split_stance", x: 30 },
      { caption: "Pełna wymiana nóg w locie", pose: "scissor_air", x: 54 },
      { caption: "Miękkie lądowanie pod kontrolą", pose: "snap_down", x: 76 },
    ],
  ),
  skip_a_to_d: scene(
    "skip_a_to_d",
    "Skip A → Skip D",
    "Przejście ze skipu A w szybszy skip D bez utraty postawy.",
    "plain",
    [
      { caption: "Rytm skipu A", pose: "skip_a", x: 28 },
      { caption: "Skrócenie cyklu", pose: "skip_d", x: 52 },
      { caption: "Szybkie uderzenia jak w skipie D", pose: "ankling", x: 78 },
    ],
  ),
  skip_b_alternate_bounds: scene(
    "skip_b_alternate_bounds",
    "Skip B → wieloskok naprzemienny",
    "Przejście ze skipu B w wieloskok naprzemienny z dłuższą fazą lotu.",
    "plain",
    [
      { caption: "Cykl skipu B z wyprostem podudzia", pose: "skip_b", x: 26 },
      { caption: "Wydłużenie odbicia", pose: "power_skip", x: 50 },
      { caption: "Wieloskok z fazą lotu", pose: "bound_air", x: 78 },
    ],
  ),
  snap_down: scene(
    "snap_down",
    "Lądowanie snap-down",
    "Snap-down: szybkie zejście do stabilnej pozycji lądowania z napiętym tułowiem.",
    "plain",
    [
      { caption: "Wspięcie na palce, ręce w górze", pose: "stand", x: 36 },
      { caption: "Błyskawiczne zejście w dół", pose: "snap_down", x: 56 },
      { caption: "Stabilna pozycja, cisza przy lądowaniu", pose: "brake_deep", x: 74 },
    ],
  ),
  split_stance_start: scene(
    "split_stance_start",
    "Start z pozycji wykrocznej",
    "Start z pozycji wykrocznej: mocne odbicie z nogi zakrocznej i pierwsze kroki przyspieszenia.",
    "start_line",
    [
      { caption: "Pozycja wykroczna za linią", pose: "split_stance", x: 26 },
      { caption: "Odbicie z nogi zakrocznej", pose: "drive_low", x: 50 },
      { caption: "Pierwsze kroki z pochyleniem", pose: "drive", x: 78 },
    ],
  ),
  sprint_cooldown_walk: scene(
    "sprint_cooldown_walk",
    "Marsz i uspokojenie oddechu",
    "Spokojny marsz z długim wydechem i rozluźnieniem ramion po pracy szybkościowej.",
    "plain",
    [
      { caption: "Spokojny marsz", pose: "walk", x: 32 },
      { caption: "Długi wydech, opuszczone ramiona", pose: "breathe", x: 56 },
      { caption: "Rozluźnienie i powrót tętna", pose: "walk", x: 78 },
    ],
  ),
  sprint_ramp_warmup: scene(
    "sprint_ramp_warmup",
    "Przygotowanie RAMP do sprintu",
    "RAMP: podniesienie tętna marszobiegiem, mobilizacja bioder i krótka potencjalizacja.",
    "plain",
    [
      { caption: "Raise — lekki bieg i marsz", pose: "walk", x: 22 },
      { caption: "Activate — mobilizacja bioder", pose: "wall_march", x: 46 },
      { caption: "Mobilise — rytm biegowy", pose: "skip_a", x: 66 },
      { caption: "Potentiate — krótkie przebieżki", pose: "build_up_run", x: 86 },
    ],
  ),
  straight_leg_run_bound: scene(
    "straight_leg_run_bound",
    "Bieg z prostą nogą",
    "Bieg z prostą nogą: aktywne zgarnianie podłoża prawie wyprostowaną nogą.",
    "plain",
    [
      { caption: "Noga prosta, stopa uniesiona", pose: "straight_leg", x: 32 },
      { caption: "Zgarnięcie podłoża pod biodrem", pose: "ankling", x: 56 },
      { caption: "Rytm bez zginania kolan", pose: "straight_leg", x: 78 },
    ],
  ),
  switch_skip_a: scene(
    "switch_skip_a",
    "Zmiana → Skip A",
    "Pojedyncza zmiana nóg przechodząca w rytm skipu A.",
    "plain",
    [
      { caption: "Pozycja wyjściowa, tułów pochylony", pose: "drive", x: 26 },
      { caption: "Jedna szybka zmiana nogi", pose: "skip_d", x: 50 },
      { caption: "Przejście w rytm skipu A", pose: "skip_a", x: 76 },
    ],
  ),
  upright_football_sprint: scene(
    "upright_football_sprint",
    "Piłkarski sprint wyprostowany",
    "Swobodny sprint w pozycji wyprostowanej, bez zaciskania barków i szczęki.",
    "plain",
    [
      { caption: "Wejście w pozycję wyprostowaną", pose: "build_up_run", x: 24 },
      { caption: "Wysokie biodra, kontakt pod ciałem", pose: "upright_run", x: 52 },
      { caption: "Swobodne ramiona przez cały odcinek", pose: "upright_run", x: 80 },
    ],
  ),
  wall_march: scene(
    "wall_march",
    "Wall march",
    "Wall march: podpór o ścianę, kąt ciała jak przy akceleracji, naprzemienna praca kolan.",
    "wall",
    [
      { caption: "Podpór o ścianę, ciało w jednej linii", pose: "wall_march", x: 40 },
      { caption: "Kolano w górę, stopa pod biodrem", pose: "wall_march", x: 52 },
      { caption: "Wymiana nóg bez utraty kąta", pose: "wall_march", x: 64 },
    ],
  ),
};

/** Zwraca wpis WYŁĄCZNIE po exerciseId. Brak heurystyk. */
export function getExerciseMedia(exerciseId: string | undefined): ExerciseMedia | null {
  if (!exerciseId) return null;
  return EXERCISE_MEDIA[exerciseId] ?? null;
}

export function hasExerciseMedia(exerciseId: string | undefined): boolean {
  return getExerciseMedia(exerciseId) !== null;
}
