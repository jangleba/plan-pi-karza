/**
 * The coach's five training messages as skeletons. A skeleton says WHAT each block is for, which
 * FUNCTION each slot must fulfil, how the slots are combined, in what order, and the coach's
 * reference dose (sets, repetitions, tempo) exactly as written. It does not name library
 * exercises beyond the coach's own words, never carries kilograms and does not decide who gets
 * which exercise: that is `noteFunctions.ts` (selection), `noteDosage.ts` (dosing for a person)
 * and the athlete's own logged work (load).
 *
 * Provenance: a number the photo does not give is listed in `unspecified` and is a product
 * default, not the coach's. No photo gives any rest time; every rest below is a product value.
 */
import type { AdvancedTemplateId, PairKind } from "./advancedSessions";

export type Tempo = readonly [eccentric: number, pause: number, concentric: number];

/** What the exercise must do, independent of which library exercise does it. */
export type SlotFunction =
  | "quad_iso"
  | "reactive_jump_light"
  | "reactive_jump_depth"
  | "ballistic_triple_extension"
  | "pogo_reactive"
  | "squat_heavy"
  | "horizontal_push_heavy"
  | "rear_delt_band_pull"
  | "horizontal_pull_heavy"
  | "hip_extension_single_leg"
  | "knee_flexion_slider"
  | "calf_seated"
  | "hip_flexion_band"
  | "hamstring_iso_hold"
  | "hamstring_iso_switch"
  | "upper_throw_power"
  | "pull_power_single_arm"
  | "posterior_chain_rebound"
  | "side_plank_abduction"
  | "adductor_long_lever"
  | "knee_single_leg_strength"
  | "weighted_step_jump"
  | "assisted_single_leg_cmj"
  | "push_plyo"
  | "pull_speed"
  | "hamstring_nordic"
  | "swiss_ball_pike"
  | "swiss_ball_hip_twist"
  | "hip_hinge_heavy"
  | "push_to_five"
  | "pull_to_five"
  | "trunk_anti_rotation"
  | "calf_seated_light";

export type DoseKind =
  "lift" | "ballistic_lift" | "jump" | "throw" | "accessory" | "iso_time" | "iso_holds";

export interface Ref {
  sets: number;
  reps?: number;
  /** Repetitions of a short hold (“5 × 1 s”), or alternating holds without a time. */
  holds?: number;
  holdSeconds?: number;
  /** A held time (“iso hold 3×8”). */
  seconds?: number;
  perSide?: true;
  tempo?: Tempo;
  /** Fields the photo does not state: product defaults, never the coach's number. */
  unspecified?: readonly ("sets" | "reps" | "holds")[];
}

type BlockGoal =
  | "primer_reactive"
  | "ballistic_lift"
  | "heavy_lower_reactive"
  | "heavy_upper_push"
  | "posterior_chain_upper_pull"
  | "hamstring_calf_hip"
  | "single_leg_strength_power"
  | "upper_power_hamstring"
  | "trunk_hip_accessory"
  | "hamstring_iso_primer"
  | "hinge_with_plyo"
  | "upper_to_five"
  | "accessory_free";

export interface SkeletonSlot {
  /** The coach's own numbering: 1a, 3b, 6c. */
  id: string;
  /** The line as written on the photo. */
  text: string;
  fn: SlotFunction;
  kind: DoseKind;
  ref: Ref;
  /** The second (heavier) message of the same Day 1: what changes. */
  heavy?: { text: string; ref?: Partial<Ref>; prefer?: string };
  /** Library exercises to try first because the coach names them. */
  prefer?: readonly string[];
  /** Remark shown only when the coach's own exercise is used (percentages, cues). */
  coachNote?: string;
  /** Open questions about this line; never guessed, listed. */
  doubts?: readonly string[];
  /** What the coach later explained about the line: no longer a doubt, kept as the source of the number. */
  clarified?: readonly string[];
}

export interface SkeletonBlock {
  id: string;
  goal: BlockGoal;
  /** Why the block exists, in the athlete's words. */
  purpose: string;
  pair: PairKind | "single";
  /** Product value: no photo gives a rest. */
  roundRestSeconds: number;
  optional?: boolean;
  keepAlone?: boolean;
  slots: readonly SkeletonSlot[];
}

export interface Skeleton {
  id: AdvancedTemplateId;
  /** Which photo(s) the skeleton transcribes. */
  photo: string;
  variant: "A" | "B";
  title: string;
  blocks: readonly SkeletonBlock[];
  /** Doubts that concern the whole skeleton. */
  doubts?: readonly string[];
}

const T441: Tempo = [4, 1, 1]; // “4-1-x”: x is read as one second (explosive), see doubts
const T311: Tempo = [3, 1, 1];
const X_DOUBT =
  "Tempo „x” przyjęte jako 1 s fazy podnoszenia (celowo szybko); zdjęcie nie podaje sekund.";
const ISO_CLARIFIED =
  "Wyjaśnił trener: „3x5x1sec” to 3 serie; w serii 5 razy 1 s mocno i 1 s luzu (1 s mocno, 1 s luz, 1 s mocno…), na każdą nogę.";

/** Photo 1 and photo 4: the same Day 1 in two loading weeks. */
const SQUAT_BENCH: Skeleton = {
  id: "N_squat_bench",
  photo: "Zdjęcie 1 „Jutro zrób tak” (tydzień 1) i zdjęcie 4 „Day 1” (tydzień cięższy)",
  variant: "A",
  title: "Siła A — przysiad, ławka i zarzut",
  blocks: [
    {
      id: "1",
      goal: "primer_reactive",
      purpose: "Izometria czworogłowego i pierwszy skok: przygotowanie przed ciężką pracą.",
      pair: "iso_reactive",
      roundRestSeconds: 120,
      slots: [
        {
          id: "1a",
          text: "Knee iso push 3x5x1sec/leg",
          fn: "quad_iso",
          kind: "iso_holds",
          ref: { sets: 3, holds: 5, holdSeconds: 1, perSide: true },
          clarified: [ISO_CLARIFIED],
          coachNote: "1 s mocno, 1 s luz",
        },
        {
          id: "1b",
          text: "SL Box jump 3x3/leg",
          fn: "reactive_jump_light",
          kind: "jump",
          ref: { sets: 3, reps: 3, perSide: true },
          prefer: ["single_leg_box_jump"],
          clarified: [
            "Wyjaśnił trener: wysokość skrzyni taka, by wskoczyć niemal na prostych nogach, jak najmocniej i jak najszybciej; można lekko ugiąć nogi na skrzyni. Aplikacja nie podaje centymetrów.",
          ],
        },
      ],
    },
    {
      id: "2",
      goal: "ballistic_lift",
      purpose:
        "Szybkie wyprowadzenie bioder i kolan (hang power clean) na świeżym układzie nerwowym.",
      pair: "single",
      roundRestSeconds: 150,
      slots: [
        {
          id: "2",
          text: "Hang Power Clean 3x3",
          fn: "ballistic_triple_extension",
          kind: "ballistic_lift",
          ref: { sets: 3, reps: 3 },
          heavy: { text: "Hang Power Clean 4x3", ref: { sets: 4, reps: 3 } },
          prefer: ["power_clean"],
        },
      ],
    },
    {
      id: "3",
      goal: "heavy_lower_reactive",
      purpose: "Ciężki przysiad z kontrolowanym opuszczaniem, potem skok reaktywny.",
      pair: "strength_reactive",
      roundRestSeconds: 180,
      keepAlone: true,
      slots: [
        {
          id: "3a",
          text: "Back Squat 4x2 (4-1-x)",
          fn: "squat_heavy",
          kind: "lift",
          ref: { sets: 4, reps: 2, tempo: T441 },
          heavy: { text: "Back Squat 5x3 (4-1-x)", ref: { sets: 5, reps: 3 } },
          prefer: ["heavy_back_squat"],
          doubts: [X_DOUBT],
        },
        {
          id: "3b",
          text: "Depth Box jump over Hurdle 4x2",
          fn: "reactive_jump_depth",
          kind: "jump",
          ref: { sets: 4, reps: 2 },
          heavy: { text: "Depth Box jump over Hurdle 4x3", ref: { reps: 3 } },
          prefer: ["depth_jump_over_hurdle"],
          clarified: [
            "Wyjaśnił trener: skrzynia jak przy skoku na prostych nogach (jak najmocniej, jak najszybciej); płotek niski, taki jak do pogo. Aplikacja nie podaje centymetrów.",
          ],
        },
      ],
    },
    {
      id: "4",
      goal: "heavy_upper_push",
      purpose: "Ciężkie pchanie z przeciwwagą w postaci przyciągania do tyłu barków.",
      pair: "upper_pull",
      roundRestSeconds: 150,
      keepAlone: true,
      slots: [
        {
          id: "4a",
          text: "Bench Press 4x2 (90-95%1RM)",
          fn: "horizontal_push_heavy",
          kind: "lift",
          ref: { sets: 4, reps: 2 },
          heavy: { text: "Bench Press 5x4 (80-85%)", ref: { sets: 5, reps: 4 } },
          prefer: ["barbell_bench_press"],
          coachNote: "90–95% 1RM",
          doubts: ["Procent 1RM jest opisem trenera; aplikacja nie wylicza z niego kilogramów."],
        },
        {
          id: "4b",
          text: "Facepull 3x8",
          fn: "rear_delt_band_pull",
          kind: "accessory",
          ref: { sets: 3, reps: 8 },
          heavy: { text: "Facepull 3x10", ref: { reps: 10 } },
        },
      ],
    },
    {
      id: "5",
      goal: "posterior_chain_upper_pull",
      purpose: "Przyciąganie w poziomie i wyprost biodra jednonóż.",
      pair: "upper_hip",
      roundRestSeconds: 120,
      keepAlone: true,
      slots: [
        {
          id: "5a",
          text: "BB Row 3x3",
          fn: "horizontal_pull_heavy",
          kind: "lift",
          ref: { sets: 3, reps: 3 },
          heavy: { text: "BB Row 3x5", ref: { reps: 5 } },
          prefer: ["barbell_row"],
        },
        {
          id: "5b",
          text: "SL straight leg HT 3x3/leg",
          fn: "hip_extension_single_leg",
          kind: "accessory",
          ref: { sets: 3, reps: 3, perSide: true },
          heavy: { text: "SL straight leg HT 3x5/leg (back el.)", ref: { reps: 5 } },
          prefer: ["single_leg_straight_leg_hip_thrust"],
          doubts: [
            "„(back el.)” (tydzień cięższy) — prawdopodobnie plecy na podwyższeniu; zapisane tylko jako uwaga, bo biblioteka nie ma osobnego wariantu.",
          ],
        },
      ],
    },
    {
      id: "6",
      goal: "hamstring_calf_hip",
      purpose: "Tył uda, łydka i zginacz biodra jako zakończenie sesji.",
      pair: "accessory",
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
      slots: [
        {
          id: "6a",
          text: "Slider leg curl 3x4 (3-1-x)",
          fn: "knee_flexion_slider",
          kind: "accessory",
          ref: { sets: 3, reps: 4, tempo: T311 },
          heavy: { text: "Slider leg curl 3x6 (3-1-x)", ref: { reps: 6 } },
          prefer: ["bilateral_slider_leg_curl"],
          doubts: [X_DOUBT, "Zapis bez „SL”, więc obunóż."],
        },
        {
          id: "6b",
          text: "Seated SL calf raises 3x12/leg",
          fn: "calf_seated",
          kind: "accessory",
          ref: { sets: 3, reps: 12, perSide: true },
        },
        {
          id: "6c",
          text: "Banded hip flexion 3x5/leg",
          fn: "hip_flexion_band",
          kind: "accessory",
          ref: { sets: 3, reps: 5, perSide: true },
          heavy: {
            text: "Banded supine hip flexor 3x8/leg",
            ref: { reps: 8 },
            prefer: "supine_banded_hip_flexion",
          },
          prefer: ["standing_banded_hip_flexion"],
        },
      ],
    },
  ],
};

/** Photo 3 (16.09.2024). */
const CLEAN_PLYO: Skeleton = {
  id: "N_clean_plyo",
  photo: "Zdjęcie 3 (16 SEP 2024) „Day1”",
  variant: "A",
  title: "Siła A — zarzut, przysiad do ćwierci i skoki",
  blocks: [
    {
      id: "0",
      goal: "hamstring_iso_primer",
      purpose: "Izometria tyłu uda przed pracą balistyczną.",
      pair: "single",
      roundRestSeconds: 45,
      slots: [
        {
          id: "0",
          text: "Str L SL HT iso hold 3x8/side",
          fn: "hamstring_iso_hold",
          kind: "iso_time",
          ref: { sets: 3, seconds: 8, perSide: true },
          clarified: [
            "Wyjaśnił trener: 3 serie po jednym trzymaniu przez 8 s (nie 8 powtórzeń), na każdą stronę.",
          ],
        },
      ],
    },
    {
      id: "1",
      goal: "ballistic_lift",
      purpose: "Zarzut z pogo: moc i reaktywność w jednej rundzie.",
      pair: "power_reactive",
      roundRestSeconds: 150,
      keepAlone: true,
      slots: [
        {
          id: "1a",
          text: "Hang Power clean 4x2",
          fn: "ballistic_triple_extension",
          kind: "ballistic_lift",
          ref: { sets: 4, reps: 2 },
          prefer: ["power_clean"],
        },
        {
          id: "1b",
          text: "Pogo jumps 3x6",
          fn: "pogo_reactive",
          kind: "jump",
          ref: { sets: 3, reps: 6 },
          prefer: ["bilateral_pogo"],
        },
      ],
    },
    {
      id: "2",
      goal: "heavy_lower_reactive",
      purpose: "Przysiad do ćwierci na skrzynię i skok w głąb (krótki kontakt).",
      pair: "strength_reactive",
      roundRestSeconds: 180,
      keepAlone: true,
      slots: [
        {
          id: "2a",
          text: "Quarter box squat 4x2",
          fn: "squat_heavy",
          kind: "lift",
          ref: { sets: 4, reps: 2 },
          prefer: ["quarter_box_squat"],
        },
        {
          id: "2b",
          text: "Drop box jump 4x3",
          fn: "reactive_jump_depth",
          kind: "jump",
          ref: { sets: 4, reps: 3 },
          prefer: ["drop_jump"],
          clarified: [
            "Wyjaśnił trener: wysokość skrzyni jak przy skoku na prostych nogach, jak najmocniej i najszybciej.",
          ],
        },
      ],
    },
    {
      id: "3",
      goal: "upper_power_hamstring",
      purpose: "Rzut piłką lekarską i wyprost biodra jednonóż.",
      pair: "upper_hip",
      roundRestSeconds: 120,
      keepAlone: true,
      slots: [
        {
          id: "3a",
          text: "MB shotput 3x5/side",
          fn: "upper_throw_power",
          kind: "throw",
          ref: { sets: 3, reps: 5, perSide: true },
          prefer: ["medicine_ball_shot_put"],
          doubts: ["Masa piłki nie jest podana."],
        },
        {
          id: "3b",
          text: "SL banded HT 3x5/leg",
          fn: "hip_extension_single_leg",
          kind: "accessory",
          ref: { sets: 3, reps: 5, perSide: true },
          prefer: ["single_leg_banded_hip_thrust"],
        },
      ],
    },
    {
      id: "4",
      goal: "posterior_chain_upper_pull",
      purpose: "Dynamiczne wiosłowanie jednorącz i wyprost grzbietu z odbiciem.",
      pair: "upper_hip",
      roundRestSeconds: 120,
      keepAlone: true,
      slots: [
        {
          id: "4a",
          text: "SA plyo row 3x5/arm",
          fn: "pull_power_single_arm",
          kind: "accessory",
          ref: { sets: 3, reps: 5, perSide: true },
          prefer: ["single_arm_plyo_row"],
        },
        {
          id: "4b",
          text: "Rebound Back ext 3x6",
          fn: "posterior_chain_rebound",
          kind: "accessory",
          ref: { sets: 3, reps: 6 },
          prefer: ["rebound_back_extension"],
        },
      ],
    },
    {
      id: "5",
      goal: "trunk_hip_accessory",
      purpose: "Tułów, zginacz biodra i przywodziciele na zakończenie.",
      pair: "accessory",
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
      slots: [
        {
          id: "5a",
          text: "High sideplank abd 3x8/leg",
          fn: "side_plank_abduction",
          kind: "accessory",
          ref: { sets: 3, reps: 8, perSide: true },
          prefer: ["high_side_plank_abduction"],
        },
        {
          id: "5b",
          text: "Standing banded hip flexion 3x8/leg",
          fn: "hip_flexion_band",
          kind: "accessory",
          ref: { sets: 3, reps: 8, perSide: true },
          prefer: ["standing_banded_hip_flexion"],
        },
        {
          id: "5c",
          text: "Kopenhagen add str L 3x6/side",
          fn: "adductor_long_lever",
          kind: "accessory",
          ref: { sets: 3, reps: 6, perSide: true },
          prefer: ["copenhagen_plank"],
          clarified: [
            "Wyjaśnił trener: „str” to strona: najpierw seria na jedną stronę, potem na drugą (lewa i prawa). „add L” czytane jako przywodziciele, długa dźwignia (deska kopenhaska); biblioteka nie rozróżnia wariantu z prostą nogą.",
          ],
        },
      ],
    },
  ],
};

/** Photo 2. */
const STEP_REACTIVE: Skeleton = {
  id: "N_step_reactive",
  photo: "Zdjęcie 2 „Day 1” (wejścia)",
  variant: "B",
  title: "Siła B — wejścia, Nordic i skoki",
  blocks: [
    {
      id: "1",
      goal: "primer_reactive",
      purpose: "Izometria czworogłowego i skok w głąb.",
      pair: "iso_reactive",
      roundRestSeconds: 150,
      slots: [
        {
          id: "1a",
          text: "Knee iso push 3x3x1sec/leg",
          fn: "quad_iso",
          kind: "iso_holds",
          ref: { sets: 3, holds: 3, holdSeconds: 1, perSide: true },
          clarified: [ISO_CLARIFIED],
          coachNote: "1 s mocno, 1 s luz",
        },
        {
          id: "1b",
          text: "Depth box jump 3x3",
          fn: "reactive_jump_depth",
          kind: "jump",
          ref: { sets: 3, reps: 3 },
          prefer: ["depth_jump"],
        },
      ],
    },
    {
      id: "2",
      goal: "single_leg_strength_power",
      purpose: "Siła jednonóż, od razu przełożona na wyskok i skok z asystą.",
      pair: "strength_power",
      roundRestSeconds: 150,
      keepAlone: true,
      slots: [
        {
          id: "2a",
          text: "Step up 4x3/leg",
          fn: "knee_single_leg_strength",
          kind: "lift",
          ref: { sets: 4, reps: 3, perSide: true },
          prefer: ["loaded_step_up"],
          clarified: [
            "Wyjaśnił trener: step up jest zawsze obciążony, nigdy bez obciążenia. Ciężar dobiera zawodnik (bez historii aplikacja go nie podaje).",
          ],
        },
        {
          id: "2b",
          text: "weighted step up Jump 3x2/leg",
          fn: "weighted_step_jump",
          kind: "jump",
          ref: { sets: 3, reps: 2, perSide: true },
          prefer: ["weighted_step_up_jump"],
          doubts: ["Wielkość obciążenia nie jest podana."],
        },
        {
          id: "2c",
          text: "SL assisted cmj 3x3/leg",
          fn: "assisted_single_leg_cmj",
          kind: "jump",
          ref: { sets: 3, reps: 3, perSide: true },
          prefer: ["single_leg_assisted_cmj"],
          doubts: ["Źródło i siła asysty nie są podane."],
        },
      ],
    },
    {
      id: "3",
      goal: "upper_power_hamstring",
      purpose: "Dynamiczne pchanie i izometria tyłu uda z przełączaniem.",
      pair: "upper_hip",
      roundRestSeconds: 90,
      keepAlone: true,
      slots: [
        {
          id: "3a",
          text: "Banded plyo push up 3x5",
          fn: "push_plyo",
          kind: "accessory",
          ref: { sets: 3, reps: 5 },
          prefer: ["banded_plyo_push_up"],
        },
        {
          id: "3b",
          text: "SL str L iso switch 3x5/leg",
          fn: "hamstring_iso_switch",
          kind: "iso_time",
          ref: { sets: 3, seconds: 5, perSide: true },
          prefer: ["single_leg_straight_leg_iso_switch"],
          clarified: ["Wyjaśnił trener: 3 serie po 5 s trzymania, na każdą nogę."],
        },
      ],
    },
    {
      id: "4",
      goal: "posterior_chain_upper_pull",
      purpose: "Szybkie wiosłowanie i Nordic.",
      pair: "upper_hip",
      roundRestSeconds: 120,
      keepAlone: true,
      slots: [
        {
          id: "4a",
          text: "Speed BB row 3x6",
          fn: "pull_speed",
          kind: "accessory",
          ref: { sets: 3, reps: 6 },
          prefer: ["speed_barbell_row"],
        },
        {
          id: "4b",
          text: "Nordic curl 3x3",
          fn: "hamstring_nordic",
          kind: "accessory",
          ref: { sets: 3, reps: 3 },
          prefer: ["full_nordic_hamstring"],
        },
      ],
    },
    {
      id: "5",
      goal: "trunk_hip_accessory",
      purpose: "Tułów na piłce, face pull i skręt bioder.",
      pair: "accessory",
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
      slots: [
        {
          id: "5a",
          text: "SL swiss ball pike 3x6/leg",
          fn: "swiss_ball_pike",
          kind: "accessory",
          ref: { sets: 3, reps: 6, perSide: true },
          prefer: ["single_leg_swiss_ball_pike"],
        },
        {
          id: "5b",
          text: "facepull 3x10",
          fn: "rear_delt_band_pull",
          kind: "accessory",
          ref: { sets: 3, reps: 10 },
        },
        {
          id: "5c",
          text: "SL swiss ball hip twist 3x6/leg",
          fn: "swiss_ball_hip_twist",
          kind: "accessory",
          ref: { sets: 3, reps: 6, perSide: true },
          prefer: ["single_leg_swiss_ball_hip_twist"],
        },
      ],
    },
  ],
};

/** Photo 5: a summary in Polish; most numbers are not given. */
const TRAPBAR: Skeleton = {
  id: "N_trapbar",
  photo: "Zdjęcie 5 (streszczenie po polsku)",
  variant: "B",
  title: "Siła B — martwy ciąg trap bar, skoki i góra",
  doubts: [
    "Zdjęcie jest streszczeniem: nie podaje serii martwego ciągu i plyo, powtórzeń iso push ani skoków. Te liczby są produktowe.",
  ],
  blocks: [
    {
      id: "1",
      goal: "primer_reactive",
      purpose: "Iso push i skoki (2 serie).",
      pair: "iso_reactive",
      roundRestSeconds: 120,
      slots: [
        {
          id: "1a",
          text: "iso push (2 serie)",
          fn: "quad_iso",
          kind: "iso_holds",
          ref: { sets: 2, holds: 3, holdSeconds: 1, perSide: true, unspecified: ["holds"] },
          doubts: ["Powtórzenia i czas trzymania nie są podane (produktowo 3 × 1 s)."],
        },
        {
          id: "1b",
          text: "skoki (2 serie)",
          fn: "reactive_jump_light",
          kind: "jump",
          ref: { sets: 2, reps: 3, unspecified: ["reps"] },
          prefer: ["box_jump"],
          doubts: [
            "Rodzaj skoku i powtórzenia nie są podane (produktowo skok obunóż na skrzynię, 3).",
          ],
        },
      ],
    },
    {
      id: "2",
      goal: "hinge_with_plyo",
      purpose: "Martwy ciąg trap bar, plyo i skok z asystą gumy (maks. 3 powtórzenia).",
      pair: "strength_power",
      roundRestSeconds: 180,
      keepAlone: true,
      slots: [
        {
          id: "2a",
          text: "tbdl",
          fn: "hip_hinge_heavy",
          kind: "lift",
          ref: { sets: 3, reps: 3, unspecified: ["sets", "reps"] },
          prefer: ["trap_bar_deadlift"],
          doubts: [
            "„maks 3 reps” odnosi się do całego bloku czy tylko skoków z gumą — nie wiadomo; serie nie podane.",
          ],
        },
        {
          id: "2b",
          text: "plyo",
          fn: "pogo_reactive",
          kind: "jump",
          ref: { sets: 3, reps: 5, unspecified: ["sets", "reps"] },
          prefer: ["bilateral_pogo"],
          doubts: ["Rodzaj plyo, serie i powtórzenia nie są podane."],
        },
        {
          id: "2c",
          text: "skoki z asystą gumy (maks 3 reps)",
          fn: "assisted_single_leg_cmj",
          kind: "jump",
          ref: { sets: 3, reps: 3, unspecified: ["sets"] },
          prefer: ["gym_cmj_assisted"],
          doubts: ["Serie nie są podane; to, czy skok jest jedno- czy obunóż — też."],
        },
      ],
    },
    {
      id: "3",
      goal: "upper_to_five",
      purpose: "Góra ciała: do 5 powtórzeń, 3 serie (pchanie i przyciąganie).",
      pair: "upper_pull",
      roundRestSeconds: 120,
      keepAlone: true,
      slots: [
        {
          id: "3a",
          text: "góra do 5 powtórzeń 3 serie (push)",
          fn: "push_to_five",
          kind: "lift",
          ref: { sets: 3, reps: 5 },
          prefer: ["barbell_bench_press"],
          doubts: ["Które pchanie i które przyciąganie — nie podano; dobór z biblioteki."],
        },
        {
          id: "3b",
          text: "góra do 5 powtórzeń 3 serie (pull)",
          fn: "pull_to_five",
          kind: "lift",
          ref: { sets: 3, reps: 5 },
          prefer: ["pull_up"],
        },
      ],
    },
    {
      id: "4",
      goal: "accessory_free",
      purpose: "Akcesoria wedle uznania.",
      pair: "accessory",
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
      slots: [
        {
          id: "4a",
          text: "akcesoria (przywodziciele)",
          fn: "adductor_long_lever",
          kind: "accessory",
          ref: { sets: 2, reps: 6, perSide: true, unspecified: ["sets", "reps"] },
          prefer: ["copenhagen_plank"],
        },
        {
          id: "4b",
          text: "akcesoria (łydka)",
          fn: "calf_seated_light",
          kind: "accessory",
          ref: { sets: 2, reps: 12, perSide: true, unspecified: ["sets", "reps"] },
        },
        {
          id: "4c",
          text: "akcesoria (tułów)",
          fn: "trunk_anti_rotation",
          kind: "accessory",
          ref: { sets: 2, reps: 8, perSide: true, unspecified: ["sets", "reps"] },
        },
      ],
    },
  ],
};

export const COACH_SKELETONS: Readonly<Record<AdvancedTemplateId, Skeleton | undefined>> = {
  N_squat_bench: SQUAT_BENCH,
  N_clean_plyo: CLEAN_PLYO,
  N_step_reactive: STEP_REACTIVE,
  N_trapbar: TRAPBAR,
  A_power: undefined,
  A_squat: undefined,
  B_hinge: undefined,
};

/** Every open question of the five photos, for a review and for the screen's “skąd ta liczba”. */
export function skeletonDoubts(): { skeleton: AdvancedTemplateId; slot: string; doubt: string }[] {
  return Object.values(COACH_SKELETONS).flatMap((skeleton) =>
    skeleton
      ? [
          ...(skeleton.doubts ?? []).map((doubt) => ({ skeleton: skeleton.id, slot: "*", doubt })),
          ...skeleton.blocks.flatMap((block) =>
            block.slots.flatMap((slot) =>
              (slot.doubts ?? []).map((doubt) => ({ skeleton: skeleton.id, slot: slot.id, doubt })),
            ),
          ),
        ]
      : [],
  );
}

/** The coach's later explanations of unclear lines, with the slot they apply to. */
export function skeletonClarifications(): {
  skeleton: AdvancedTemplateId;
  slot: string;
  text: string;
}[] {
  return Object.values(COACH_SKELETONS).flatMap((skeleton) =>
    skeleton
      ? skeleton.blocks.flatMap((block) =>
          block.slots.flatMap((slot) =>
            (slot.clarified ?? []).map((text) => ({ skeleton: skeleton.id, slot: slot.id, text })),
          ),
        )
      : [],
  );
}
