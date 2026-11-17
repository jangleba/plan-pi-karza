import type { Profile } from "../types";
import type {
  Dose,
  EngineSession,
  ExerciseDecision,
  LimitationCause,
  Role,
  StrengthPathNote,
} from "./model";
import { trainingTier } from "./model";
import { eligibleExercise, estimateSessionSeconds, exerciseLimitation } from "./exercises";
import { limitationText } from "./limitations";
import { gymPowerDose, strengthLandingCount } from "./gymPower";
import { resolveGoalPolicy } from "./goalPolicy";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { APP_MINIMUM_AGE } from "./preparation";
import { buildStrengthPreparation, strengthPreparationOverhead } from "./strengthPreparation";

/**
 * Gym sessions built like the athlete's coaching notes: blocks of one to three exercises done
 * in rounds (1a → 1b → 1c, then the round rest), reactive work paired with strength, upper body
 * push/pull and accessories at the end. These four notes are the template for every gym session
 * of a 16+ player with a gym. Exercises come from the library and pass its eligibility,
 * equipment and place rules; a player without the preparation for the note's exercise gets the
 * next listed option from the same family (e.g. trap-bar jump instead of a hang power clean),
 * never a trivial bodyweight movement. Doses are the notes' prescriptions for prepared adults
 * and product starting doses for everyone else, not individually tested loads.
 */
export type AdvancedTemplateId =
  | "N_squat_bench"
  | "N_clean_plyo"
  | "N_step_reactive"
  | "N_trapbar"
  // Earlier note sessions (kept readable in saved plans).
  | "A_power"
  | "A_squat"
  | "B_hinge";
export type PairKind =
  | "iso_reactive"
  | "landing_reactive"
  | "strength_power"
  | "power_reactive"
  | "strength_reactive"
  | "upper_hip"
  | "upper_pull"
  | "hinge_brake"
  | "upper_trunk"
  | "trunk"
  | "accessory";

interface DoseContext {
  p: Profile;
  phase: EngineSession["phase"];
}
/** How close a player's preparation is to the note's own prescription. */
export type NoteLevel = "full" | "standard" | "intro";

interface Slot {
  role: Role;
  /** The note's own exercise first, then the family's options; the first eligible id wins. */
  candidates: string[];
  note: string;
  /** The coach's own remark (percentage, cue); shown only when the note's own exercise is used. */
  coachNote?: string;
  dose: (level: NoteLevel, id: string, fallback: boolean, youth: boolean, ctx: DoseContext) => Dose;
  /** When no candidate of the role fits (e.g. a beginner without step-ups), the same place in another role. */
  alt?: { role: Role; candidates: string[] };
}
interface Item {
  kind: PairKind | "single";
  slots: Slot[];
  /** Rest after the last exercise of a round (or after a single exercise). */
  roundRestSeconds: number;
  /** May be dropped for time or in a lighter week; never the main lifts or the upper task. */
  optional?: boolean;
  /** Keep the first exercise alone when a partner is unavailable. */
  keepAlone?: boolean;
}
interface Template {
  id: AdvancedTemplateId;
  variant: "A" | "B";
  title: string;
  items: Item[];
  /** The note's second loading week (more volume); used every second time the note comes up. */
  heavyItems?: Item[];
}

const perSideOf = (id: string) => (FUNCTIONAL_CATALOGUE[id]?.unilateral ? { perSide: true } : {});
const capSets = (sets: number, level: NoteLevel, youth: boolean) =>
  level === "intro" ? Math.min(sets, 3) : youth ? Math.min(sets, 3) : sets;

/** A main lift: the note's heavy low reps for prepared adults, more reps with a larger reserve otherwise. */
const lift =
  (sets: number, reps: number, opts: { rest?: number; tempo?: Dose["tempo"]; rir?: number } = {}) =>
  (level: NoteLevel, id: string, fallback: boolean, youth: boolean): Dose => {
    const minReps = level === "intro" ? 6 : level === "standard" || youth ? 4 : 1;
    const r = Math.max(reps, minReps, fallback ? 5 : 1);
    return {
      sets: capSets(sets, level, youth),
      reps: r,
      ...perSideOf(id),
      rir: level === "full" && !fallback && !youth ? (opts.rir ?? 1) : level === "intro" ? 3 : 2,
      restSeconds: opts.rest ?? 150,
      ...(opts.tempo && level !== "intro" ? { tempo: opts.tempo } : {}),
      intent: "controlled",
    };
  };
/** Jumps, throws and Olympic lifts: always fast and few; fewer rounds for less prepared players. */
const fast =
  (sets: number, reps: number, contactsPerRep = 1, kind: "jump" | "throw" | "lift" = "jump") =>
  (level: NoteLevel, id: string, _f: boolean, _y: boolean, ctx: DoseContext): Dose => {
    // Reviewed gym stations keep their own dose rules (and GP1 progression).
    if (id.startsWith("gym_")) {
      const d = gymPowerDose(id, ctx.p, ctx.phase);
      return level === "intro" ? { ...d, sets: Math.min(2, d.sets) } : d;
    }
    return {
      sets: level === "intro" ? Math.min(sets, 2) : capSets(sets, level, false),
      reps: level === "intro" ? Math.min(reps, 3) : reps,
      ...perSideOf(id),
      ...(kind === "jump" ? { contactsPerRep } : {}),
      restSeconds: 120,
      intent: "explosive",
    };
  };
/** Accessory reps: the note's dose, two rounds for an introduction. */
const acc =
  (sets: number, reps: number, perSide = false) =>
  (level: NoteLevel, id: string): Dose => ({
    sets: level === "intro" ? Math.min(sets, 2) : sets,
    reps,
    ...(perSide ? { perSide: true } : perSideOf(id)),
    rir: 3,
    restSeconds: 60,
    intent: "controlled",
  });
/** Isometric push or hold: short maximal efforts ("3×3×1 s/noga"), or a timed hold. */
const isoPush =
  (sets: number, reps: number) =>
  (level: NoteLevel, id: string): Dose => ({
    sets: level === "intro" ? Math.min(sets, 2) : sets,
    seconds: reps,
    ...perSideOf(id),
    restSeconds: 45,
    intent: "hold",
  });

/**
 * Short isometric holds counted in repetitions: “3×5×1 s/noga” is three sets of five 1-second
 * holds per leg; “iso switch 3×5/noga” is five alternating holds without a stated time.
 */
const isoHold =
  (sets: number, holds: number, holdSeconds?: number) =>
  (level: NoteLevel, id: string): Dose => ({
    sets: level === "intro" ? Math.min(sets, 2) : sets,
    holdReps: holds,
    ...(holdSeconds ? { seconds: holdSeconds } : {}),
    ...perSideOf(id),
    restSeconds: 45,
    intent: "hold",
  });
/** A throw to each side (“MB shot put 3×5/strona”). */
const throwPerSide =
  (sets: number, reps: number) =>
  (level: NoteLevel, id: string, f: boolean, y: boolean, ctx: DoseContext): Dose => ({
    ...fast(sets, reps, 1, "throw")(level, id, f, y, ctx),
    perSide: true,
  });

const POWER_CLEAN = [
  "power_clean",
  "trap_bar_jump",
  "dumbbell_jump_squat",
  "gym_cmj",
  "countermovement_jump",
  "med_ball_throw",
];
const BOX_JUMPS = ["box_jump", "gym_cmj", "countermovement_jump", "med_ball_throw"];

const SQUAT_TEMPO = { eccentricSeconds: 4, pauseSeconds: 1, concentricSeconds: 1 } as const;
const CURL_TEMPO = { eccentricSeconds: 3, pauseSeconds: 1, concentricSeconds: 1 } as const;

/**
 * „Jutro zrób tak” — Day 1: knee iso push + SL box jump · HPC · back squat 4-1-x + depth jump over
 * hurdle · bench + face pull · BB row + SL straight-leg HT · slider curl 3-1-x + seated SL calf
 * raises + banded hip flexion. Week one is the first message; `heavy` is the second message of the
 * same Day 1 (more volume, lighter percentages, a supine hip flexor instead of the standing one).
 */
function squatBenchItems(heavy: boolean): Item[] {
  return [
    {
      kind: "iso_reactive",
      slots: [
        {
          role: "quad_iso",
          candidates: ["knee_iso_push", "split_squat_iso_hold"],
          note: "Knee iso push 3×5×1 s/noga",
          dose: isoHold(3, 5, 1),
        },
        {
          role: "power",
          candidates: ["single_leg_box_jump", ...BOX_JUMPS],
          note: "SL box jump 3×3/noga",
          dose: fast(3, 3),
        },
      ],
      roundRestSeconds: 120,
    },
    {
      kind: "single",
      slots: [
        {
          role: "power",
          candidates: POWER_CLEAN,
          note: heavy ? "Hang power clean 4×3" : "Hang power clean 3×3",
          dose: fast(heavy ? 4 : 3, 3, 1, "lift"),
        },
      ],
      roundRestSeconds: 150,
    },
    {
      kind: "strength_reactive",
      slots: [
        {
          role: "knee_strength",
          candidates: ["heavy_back_squat", "front_squat", "goblet_squat", "leg_press"],
          note: heavy ? "Back squat 5×3 (4-1-X)" : "Back squat 4×2 (4-1-X)",
          dose: lift(heavy ? 5 : 4, heavy ? 3 : 2, { rest: 180, tempo: SQUAT_TEMPO }),
        },
        {
          role: "power",
          candidates: ["depth_jump_over_hurdle", "depth_jump", ...BOX_JUMPS],
          note: heavy ? "Depth box jump over hurdle 4×3" : "Depth box jump over hurdle 4×2",
          dose: fast(4, heavy ? 3 : 2, 2),
        },
      ],
      roundRestSeconds: 180,
      keepAlone: true,
    },
    {
      kind: "upper_pull",
      slots: [
        {
          role: "push",
          candidates: ["barbell_bench_press", "dumbbell_bench_press", "push_up"],
          note: heavy ? "Bench press 5×4" : "Bench press 4×2",
          coachNote: heavy ? "80–85%" : "90–95% 1RM",
          dose: lift(heavy ? 5 : 4, heavy ? 4 : 2, { rest: 150 }),
        },
        {
          role: "pull",
          candidates: ["face_pull_band"],
          note: heavy ? "Facepull 3×10" : "Facepull 3×8",
          dose: acc(3, heavy ? 10 : 8),
        },
      ],
      roundRestSeconds: 150,
      keepAlone: true,
    },
    {
      kind: "upper_hip",
      slots: [
        {
          role: "pull",
          candidates: ["barbell_row", "one_arm_dumbbell_row", "lat_pulldown"],
          note: heavy ? "BB row 3×5" : "BB row 3×3",
          dose: lift(3, heavy ? 5 : 3, { rest: 120 }),
        },
        {
          role: "hip_strength",
          candidates: [
            "single_leg_straight_leg_hip_thrust",
            "single_leg_banded_hip_thrust",
            "hip_thrust",
          ],
          note: heavy ? "SL straight-leg HT 3×5/noga" : "SL straight-leg HT 3×3/noga",
          coachNote: heavy ? "back el." : undefined,
          dose: acc(3, heavy ? 5 : 3, true),
        },
      ],
      roundRestSeconds: 120,
      keepAlone: true,
    },
    {
      kind: "accessory",
      slots: [
        {
          role: "knee_flexion",
          candidates: [
            "bilateral_slider_leg_curl",
            "single_leg_slider_leg_curl",
            "lying_leg_curl",
            "seated_leg_curl",
            "bilateral_swiss_ball_leg_curl",
            "prone_band_leg_curl",
          ],
          note: heavy ? "Slider leg curl 3×6 (3-1-X)" : "Slider leg curl 3×4 (3-1-X)",
          dose: (level, id) => ({
            ...acc(3, heavy ? 6 : 4)(level, id),
            tempo: CURL_TEMPO,
          }),
        },
        {
          role: "calf_bent",
          candidates: ["seated_soleus_raise"],
          note: "Seated SL calf raises 3×12/noga",
          dose: acc(3, 12, true),
        },
        {
          role: "trunk",
          candidates: heavy
            ? ["supine_banded_hip_flexion", "standing_banded_hip_flexion"]
            : ["standing_banded_hip_flexion"],
          note: heavy ? "Banded supine hip flexor 3×8/noga" : "Banded hip flexion 3×5/noga",
          dose: acc(3, heavy ? 8 : 5, true),
        },
      ],
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
    },
  ];
}

const N_SQUAT_BENCH: Template = {
  id: "N_squat_bench",
  variant: "A",
  title: "Siła A — przysiad, ławka i zarzut",
  items: squatBenchItems(false),
  heavyItems: squatBenchItems(true),
};

/** Day 1 (16.09): SL HT iso · HPC + pogo · quarter box squat + drop box jump · shot put + SL HT · plyo row + back ext · side plank + hip flexion + Copenhagen. */
const N_CLEAN_PLYO: Template = {
  id: "N_clean_plyo",
  variant: "A",
  title: "Siła A — zarzut, przysiad do ćwierci i skoki",
  items: [
    {
      kind: "single",
      slots: [
        {
          role: "hamstring_iso",
          candidates: ["single_leg_straight_leg_ht_iso", "long_lever_hamstring_iso"],
          note: "Str L SL HT iso hold 3×8/strona",
          dose: isoPush(3, 8),
        },
      ],
      roundRestSeconds: 45,
    },
    {
      kind: "power_reactive",
      slots: [
        {
          role: "power",
          candidates: POWER_CLEAN,
          note: "Hang power clean 4×2",
          dose: fast(4, 2, 1, "lift"),
        },
        {
          role: "power",
          candidates: ["bilateral_pogo", "gym_cmj"],
          note: "Pogo jumps 3×6",
          dose: fast(3, 6),
        },
      ],
      roundRestSeconds: 150,
      keepAlone: true,
    },
    {
      kind: "strength_reactive",
      slots: [
        {
          role: "knee_strength",
          candidates: [
            "quarter_box_squat",
            "box_squat",
            "heavy_back_squat",
            "goblet_squat",
            "leg_press",
          ],
          note: "Quarter box squat 4×2",
          dose: lift(4, 2, { rest: 180 }),
        },
        {
          role: "power",
          candidates: ["drop_jump", "depth_jump", ...BOX_JUMPS],
          note: "Drop box jump 4×3",
          dose: fast(4, 3, 2),
        },
      ],
      roundRestSeconds: 180,
      keepAlone: true,
    },
    {
      kind: "upper_hip",
      slots: [
        {
          role: "upper_power",
          candidates: [
            "medicine_ball_shot_put",
            "med_ball_throw",
            "medicine_ball_rotational_scoop_toss",
          ],
          note: "MB shot put 3×5/strona",
          dose: throwPerSide(3, 5),
        },
        {
          role: "hip_strength",
          candidates: [
            "single_leg_banded_hip_thrust",
            "hip_thrust",
            "single_leg_straight_leg_hip_thrust",
          ],
          note: "SL banded HT 3×5/noga",
          dose: acc(3, 5, true),
        },
      ],
      roundRestSeconds: 120,
      keepAlone: true,
    },
    {
      kind: "upper_hip",
      slots: [
        {
          role: "pull",
          candidates: ["single_arm_plyo_row", "one_arm_dumbbell_row", "lat_pulldown"],
          note: "SA plyo row 3×5/ręka",
          dose: acc(3, 5, true),
        },
        {
          role: "hip_strength",
          candidates: [
            "rebound_back_extension",
            "hamstring_45_back_extension",
            "romanian_deadlift_db",
          ],
          note: "Rebound back ext 3×6",
          dose: acc(3, 6),
        },
      ],
      roundRestSeconds: 120,
      keepAlone: true,
    },
    {
      kind: "accessory",
      slots: [
        {
          role: "trunk",
          candidates: ["high_side_plank_abduction", "side_plank"],
          note: "High side plank abd 3×8/noga",
          dose: acc(3, 8, true),
        },
        {
          role: "trunk",
          candidates: ["standing_banded_hip_flexion"],
          note: "Standing banded hip flexion 3×8/noga",
          dose: acc(3, 8, true),
        },
        {
          role: "adductor",
          candidates: ["copenhagen_plank"],
          note: "Kopenhagen 3×6/strona",
          dose: acc(3, 6, true),
        },
      ],
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
    },
  ],
};

/** Day 1: knee iso + depth box jump · step-up + weighted step-up jump + SL assisted CMJ · plyo push-up + SL iso switch · speed row + Nordic · pike + facepull + hip twist. */
const N_STEP_REACTIVE: Template = {
  id: "N_step_reactive",
  variant: "B",
  title: "Siła B — wejścia, Nordic i skoki",
  items: [
    {
      kind: "iso_reactive",
      slots: [
        {
          role: "quad_iso",
          candidates: ["knee_iso_push", "split_squat_iso_hold"],
          note: "Knee iso push 3×3×1 s/noga",
          dose: isoHold(3, 3, 1),
        },
        {
          role: "power",
          candidates: ["depth_jump", ...BOX_JUMPS],
          note: "Depth box jump 3×3",
          dose: fast(3, 3, 2),
        },
      ],
      roundRestSeconds: 150,
    },
    {
      kind: "strength_power",
      slots: [
        {
          role: "unilateral_strength",
          candidates: ["step_up", "loaded_step_up", "bulgarian_split_squat", "reverse_lunge"],
          note: "Step up 4×3/noga",
          dose: lift(4, 3, { rest: 150 }),
          alt: { role: "knee_strength", candidates: ["goblet_squat", "back_squat"] },
        },
        {
          role: "power",
          candidates: ["weighted_step_up_jump", ...BOX_JUMPS],
          note: "Weighted step-up jump 3×2/noga",
          dose: fast(3, 2),
        },
        {
          role: "power",
          candidates: ["single_leg_assisted_cmj", "gym_cmj_assisted", "gym_cmj"],
          note: "SL assisted CMJ 3×3/noga",
          dose: fast(3, 3),
        },
      ],
      roundRestSeconds: 150,
      keepAlone: true,
    },
    {
      kind: "upper_hip",
      slots: [
        {
          role: "push",
          candidates: ["banded_plyo_push_up", "push_up", "dumbbell_bench_press"],
          note: "Banded plyo push-up 3×5",
          dose: acc(3, 5),
        },
        {
          role: "hamstring_iso",
          candidates: ["single_leg_straight_leg_iso_switch", "long_lever_hamstring_iso"],
          note: "SL str L iso switch 3×5/noga",
          dose: isoHold(3, 5),
        },
      ],
      roundRestSeconds: 90,
      keepAlone: true,
    },
    {
      kind: "upper_hip",
      slots: [
        {
          role: "pull",
          candidates: ["speed_barbell_row", "barbell_row", "one_arm_dumbbell_row"],
          note: "Speed BB row 3×6",
          dose: acc(3, 6),
        },
        {
          role: "knee_flexion",
          candidates: [
            "full_nordic_hamstring",
            "eccentric_nordic_hamstring",
            "assisted_nordic_hamstring",
            "bilateral_slider_leg_curl",
            "lying_leg_curl",
            "bilateral_swiss_ball_leg_curl",
            "prone_band_leg_curl",
          ],
          note: "Nordic curl 3×3",
          dose: acc(3, 3),
        },
      ],
      roundRestSeconds: 120,
      keepAlone: true,
    },
    {
      kind: "accessory",
      slots: [
        {
          role: "trunk",
          candidates: ["single_leg_swiss_ball_pike", "dead_bug"],
          note: "SL swiss ball pike 3×6/noga",
          dose: acc(3, 6, true),
        },
        {
          role: "pull",
          candidates: ["face_pull_band"],
          note: "Facepull 3×10",
          dose: acc(3, 10),
        },
        {
          role: "trunk",
          candidates: ["single_leg_swiss_ball_hip_twist", "pallof_press"],
          note: "SL swiss ball hip twist 3×6/noga",
          dose: acc(3, 6, true),
        },
      ],
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
    },
  ],
};

/** The general note: iso push + jumps (2 rounds) · trap-bar deadlift + plyo + banded jumps (max 3) · upper ≤5 reps push/pull · accessories. */
const N_TRAPBAR: Template = {
  id: "N_trapbar",
  variant: "B",
  title: "Siła B — martwy ciąg trap bar, skoki i góra",
  items: [
    {
      kind: "iso_reactive",
      slots: [
        {
          role: "quad_iso",
          candidates: ["knee_iso_push", "split_squat_iso_hold"],
          note: "Iso push (2 serie)",
          dose: isoHold(2, 3, 1),
        },
        {
          role: "power",
          candidates: BOX_JUMPS,
          note: "Skoki (2 serie)",
          dose: fast(2, 3),
        },
      ],
      roundRestSeconds: 120,
    },
    {
      kind: "strength_power",
      slots: [
        {
          role: "hip_strength",
          candidates: [
            "trap_bar_deadlift",
            "barbell_romanian_deadlift",
            "romanian_deadlift_db",
            "hip_thrust",
          ],
          note: "Trap bar deadlift (maks. 3 powtórzenia)",
          dose: lift(3, 3, { rest: 180 }),
        },
        {
          role: "power",
          candidates: ["bilateral_pogo", "gym_cmj"],
          note: "Plyo",
          dose: fast(3, 5),
        },
        {
          role: "power",
          candidates: ["gym_cmj_assisted", "single_leg_assisted_cmj", "gym_cmj"],
          note: "Skoki z asystą gumy (maks. 3)",
          dose: fast(3, 3),
        },
      ],
      roundRestSeconds: 180,
      keepAlone: true,
    },
    {
      kind: "upper_pull",
      slots: [
        {
          role: "push",
          candidates: ["barbell_bench_press", "dumbbell_bench_press", "push_up"],
          note: "Góra do 5 powtórzeń, 3 serie (push)",
          dose: lift(3, 5, { rest: 120 }),
        },
        {
          role: "pull",
          candidates: ["pull_up", "lat_pulldown", "barbell_row", "one_arm_dumbbell_row"],
          note: "Góra do 5 powtórzeń, 3 serie (pull)",
          dose: lift(3, 5, { rest: 120 }),
        },
      ],
      roundRestSeconds: 120,
      keepAlone: true,
    },
    {
      kind: "accessory",
      slots: [
        {
          role: "adductor",
          candidates: ["copenhagen_plank"],
          note: "Akcesoria: Kopenhagen",
          dose: acc(2, 6, true),
        },
        {
          role: "calf_bent",
          candidates: ["seated_soleus_raise", "soleus_iso_hold"],
          note: "Akcesoria: łydka",
          dose: acc(2, 12, true),
        },
        {
          role: "trunk",
          candidates: ["pallof_press", "side_plank"],
          note: "Akcesoria: tułów",
          dose: acc(2, 8, true),
        },
      ],
      roundRestSeconds: 60,
      optional: true,
      keepAlone: true,
    },
  ],
};

export const ADVANCED_TEMPLATES: Partial<Record<AdvancedTemplateId, Template>> = {
  N_squat_bench: N_SQUAT_BENCH,
  N_clean_plyo: N_CLEAN_PLYO,
  N_step_reactive: N_STEP_REACTIVE,
  N_trapbar: N_TRAPBAR,
};
const KIND_TITLE: Record<PairKind, string> = {
  iso_reactive: "Izometria i skoki",
  landing_reactive: "Lądowanie i skok reaktywny",
  strength_power: "Siła i moc",
  power_reactive: "Moc i skoki",
  strength_reactive: "Siła i skok reaktywny",
  upper_hip: "Góra ciała i biodro",
  upper_pull: "Pchanie i przyciąganie",
  hinge_brake: "Biodro i hamowanie",
  upper_trunk: "Góra ciała i tułów",
  trunk: "Tułów",
  accessory: "Akcesoria",
};
export const pairTitle = (kind: PairKind) => KIND_TITLE[kind] ?? "Superseria";

/** Landing events per gym session: below the weekly app budgets (48 for 16–17, 60 for adults). */
export const ADVANCED_CONTACT_LIMIT = (age: number) => (age < 18 ? 30 : 48);

/** A concrete reason the note sessions do not apply to a profile; null when they do. */
export interface NoteIneligibility {
  code: string;
  message: string;
}
export function advancedIneligibility(p: Profile): NoteIneligibility | null {
  const template = p.trainingMethodPreferences?.gymTemplate;
  if (!p.hasGym) return { code: "NO_GYM", message: "Sesje według notatek wymagają siłowni." };
  if (!Number.isFinite(p.age) || p.age < APP_MINIMUM_AGE)
    return { code: "AGE", message: "Sesje według notatek są dla zawodników od 16 lat." };
  if (p.painInjury || p.seasonPhase === "return_injury")
    return {
      code: "RETURN_REVIEW",
      message: "Przy zgłoszonym bólu lub powrocie po urazie sesje według notatek są wstrzymane.",
    };
  if (p.seasonPhase === "transition")
    return {
      code: "TRANSITION_PHASE",
      message: "W fazie przejściowej sesje według notatek nie są układane; zastosowano zwykłe A/B.",
    };
  if (resolveGoalPolicy(p).reduced)
    return {
      code: "REDUCED_GOAL",
      message:
        "Zadeklarowany powrót lub ograniczenie zmęczeniem wybiera lżejszą siłę A/B zamiast notatek.",
    };
  if (template === "athletic_ab" || template === "balanced")
    return {
      code: "LAYOUT_CHOSEN",
      message: "Zawodnik wybrał własny układ siłowni (sportowe lub zrównoważone A/B).",
    };
  // Exercises the player picked by hand keep the usual A/B layout they were chosen for.
  if (Object.values(p.trainingMethodPreferences?.gymExercises ?? {}).some(Boolean))
    return {
      code: "MANUAL_EXERCISES",
      message: "Ręcznie wybrane ćwiczenia siłowni zachowują zwykły układ A/B.",
    };
  if (p.trainingMethodPreferences?.strength && p.trainingMethodPreferences.strength !== "auto")
    return {
      code: "METHOD_CHOSEN",
      message: "Wybrana metoda specjalistyczna zachowuje zwykły układ A/B.",
    };
  return null;
}

/**
 * Every 16+ player with a gym gets the note sessions, unless they chose another layout
 * (athletic or balanced A/B), their own gym exercises or a specialist method, report pain, return from injury or are in
 * a transition phase. Lighter weeks keep the notes with fewer rounds (planner.finalizeAdvanced).
 */
export function advancedSessionsEligible(p: Profile, _phase?: EngineSession["phase"]): boolean {
  return advancedIneligibility(p) === null;
}

/** How much of the note's own prescription a player gets. */
export function noteLevel(p: Profile): NoteLevel {
  const tier = trainingTier(p);
  return tier === "performance" ? "full" : tier === "development" ? "standard" : "intro";
}

/**
 * Two A and two B notes alternate by block rotation; a power, speed or agility goal starts with
 * the more reactive note, a strength or general goal with the heavier one.
 */
export function advancedTemplateFor(variant: "A" | "B", rotation: number, p?: Profile): Template {
  const goal = p ? resolveGoalPolicy(p).strengthGoal : "strength";
  const reactiveFirst = ["power", "speed", "agility"].includes(goal);
  const pair =
    variant === "A"
      ? reactiveFirst
        ? [N_CLEAN_PLYO, N_SQUAT_BENCH]
        : [N_SQUAT_BENCH, N_CLEAN_PLYO]
      : reactiveFirst
        ? [N_STEP_REACTIVE, N_TRAPBAR]
        : [N_TRAPBAR, N_STEP_REACTIVE];
  return pair[Math.abs(rotation) % 2];
}

const LOWER_ROLES: Role[] = ["knee_strength", "hip_strength", "unilateral_strength"];

/** Why a template cannot stand for this profile: the structural cause of the missing main part. */
function templateLimitation(
  p: Profile,
  template: Template,
): { cause: LimitationCause; message: string } {
  const slots = template.items.flatMap((item) => item.slots);
  const probe = (roles: Role[]) => {
    const ids = slots.flatMap((slot) => [
      ...(roles.includes(slot.role) ? slot.candidates.map((id) => ({ id, role: slot.role })) : []),
      ...(slot.alt && roles.includes(slot.alt.role)
        ? slot.alt.candidates.map((id) => ({ id, role: slot.alt!.role }))
        : []),
    ]);
    const why = ids.map(({ id, role }) => exerciseLimitation(id, p, role)).filter(Boolean);
    const cause: LimitationCause = why.includes("equipment")
      ? "equipment"
      : why.includes("preparation")
        ? "preparation"
        : "recipe";
    return { cause, role: roles[0] };
  };
  const lowerPresent = slots.some(
    (slot) =>
      LOWER_ROLES.includes(slot.role) &&
      slot.candidates.some((id) => eligibleExercise(id, p, slot.role)),
  );
  const missing = lowerPresent ? probe(["push", "pull"]) : probe(LOWER_ROLES);
  const label = lowerPresent
    ? "zadanie góry ciała (pchanie lub przyciąganie)"
    : "główny wzorzec nóg";
  return {
    cause: missing.cause,
    message: `Notatka „${template.title}” niedostępna. ${limitationText(missing.cause, missing.role, label)}`,
  };
}

export interface AdvancedAttempt {
  session: EngineSession | null;
  /** Set when the first-choice note was replaced or no note could be built. */
  path?: StrengthPathNote;
}

/**
 * The one entry of the note path with its outcome explained. The first-choice note of the
 * rotation is tried, then the other note of the same A/B variant; only when neither stands is
 * the usual A/B session used, with the structural cause of both failures.
 */
export function attemptAdvancedStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
  keep?: AdvancedTemplateId,
): AdvancedAttempt {
  const ineligible = advancedIneligibility(p);
  if (ineligible)
    return {
      session: null,
      path: { path: "standard", code: ineligible.code, message: ineligible.message },
    };
  const kept = keep && ADVANCED_TEMPLATES[keep];
  const first =
    kept && [advancedTemplateFor(variant, 0, p), advancedTemplateFor(variant, 1, p)].includes(kept)
      ? kept
      : advancedTemplateFor(variant, rotation, p);
  const second = advancedTemplateFor(
    variant,
    first === advancedTemplateFor(variant, 0, p) ? 1 : 0,
    p,
  );
  // The note's second loading week comes every second time the note is due.
  const heavy = Math.floor(Math.abs(rotation) / 2) % 2 === 1;
  const built = buildFromTemplate(p, variant, phase, first, heavy);
  if (built) return { session: built };
  const firstWhy = templateLimitation(p, first);
  const alternative = second !== first ? buildFromTemplate(p, variant, phase, second, heavy) : null;
  if (alternative)
    return {
      session: alternative,
      path: {
        path: "note",
        code: "NOTE_SUBSTITUTED",
        cause: firstWhy.cause,
        requestedTemplate: first.id,
        message: `${firstWhy.message} Użyto drugiej notatki tego dnia („${second.title}”).`,
      },
    };
  const secondWhy = second !== first ? templateLimitation(p, second) : firstWhy;
  const cause =
    firstWhy.cause === "equipment" || secondWhy.cause === "equipment"
      ? "equipment"
      : firstWhy.cause === "preparation" || secondWhy.cause === "preparation"
        ? "preparation"
        : "recipe";
  return {
    session: null,
    path: {
      path: "standard",
      code: `NOTE_${cause.toUpperCase()}`,
      cause,
      requestedTemplate: first.id,
      message: `${firstWhy.message}${second !== first ? ` ${secondWhy.message}` : ""} Zastosowano zwykłą siłę A/B.`,
    },
  };
}

export function buildAdvancedStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
  /** A rebuild of a saved session keeps its note (when it still exists and matches A/B). */
  keep?: AdvancedTemplateId,
): EngineSession | null {
  const attempt = attemptAdvancedStrength(p, variant, phase, rotation, keep);
  if (attempt.session && attempt.path) attempt.session.strengthPath = attempt.path;
  return attempt.session;
}

function buildFromTemplate(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  template: Template,
  heavy = false,
): EngineSession | null {
  const items = heavy && template.heavyItems ? template.heavyItems : template.items;
  const level = noteLevel(p);
  const youth = p.age < 18;
  const used = new Set<string>();
  const pick = (slot: Slot): ExerciseDecision | null => {
    let role = slot.role;
    let id = slot.candidates.find((c) => !used.has(c) && eligibleExercise(c, p, role));
    if (!id && slot.alt) {
      role = slot.alt.role;
      id = slot.alt.candidates.find((c) => !used.has(c) && eligibleExercise(c, p, role));
    }
    if (!id) return null;
    used.add(id);
    const fallback = id !== slot.candidates[0];
    const dose = slot.dose(level, id, fallback, youth, { p, phase });
    // Under 18 and for an introduction no exercise exceeds three sets, whatever the note says.
    if (youth || level === "intro") dose.sets = Math.min(dose.sets, 3);
    return {
      exerciseId: id,
      role,
      dose,
      reason: `Z notatki: „${slot.note}”${!fallback && slot.coachNote ? ` (${slot.coachNote})` : ""}.${fallback ? " Ćwiczenie z notatki nie pasuje do przygotowania lub sprzętu: wybrano zamiennik tej samej funkcji." : ""}`,
    };
  };
  const exercises: ExerciseDecision[] = [];
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  const optional: string[] = [];
  exercises.push(...buildStrengthPreparation((id) => eligibleExercise(id, p, "warmup")));
  const labels = "ABCDEFGH";
  for (const item of items) {
    const picked = item.slots.map(pick);
    let rows = picked.filter((r): r is ExerciseDecision => Boolean(r));
    if (!rows.length) continue;
    // A group keeps the exercises that are available (e.g. the isometric push without the jump).
    // The sets are the note's own: exercises of one group may differ (bench 4 sets, face pull 3);
    // the group runs as many rounds as its longest exercise and the others stop earlier.
    const last = rows[rows.length - 1];
    const roundRest = Math.max(last.dose.restSeconds, item.roundRestSeconds);
    if (rows.length > 1) {
      rows = rows.map((r) => ({ ...r, dose: { ...r.dose } }));
      layoutGroup(rows, roundRest);
      pairs.push({
        label: labels[pairs.length],
        kind: item.kind as PairKind,
        exerciseIds: rows.map((r) => r.exerciseId),
        transitionSeconds: 30,
        roundRestSeconds: roundRest,
      });
    } else rows[0] = { ...rows[0], dose: { ...rows[0].dose, restSeconds: roundRest } };
    if (item.optional) optional.push(...rows.map((r) => r.exerciseId));
    exercises.push(...rows);
  }
  const roles = new Set(exercises.map((e) => e.role));
  // The note structure stands with a loaded lower lift and upper work; jumps follow preparation.
  if (
    !["knee_strength", "hip_strength", "unilateral_strength"].some((r) => roles.has(r as Role)) ||
    !(roles.has("push") || roles.has("pull"))
  )
    return null;
  const recipe: EngineSession = {
    variant: "full",
    strengthPreparationVersion: 1,
    roles: [variant === "A" ? "strengthA" : "strengthB"],
    tier: trainingTier(p),
    phase,
    organization: "complex",
    advancedTemplate: template.id,
    complexPairs: pairs,
    highLower: true,
    exercises,
    missing: [],
    sprintMetres: 0,
    plyometricContacts: strengthLandingCount(exercises),
    minutes: 0,
    ...(optional.length ? { optionalExercises: optional } : {}),
  };
  const fitted = fitContacts(resyncAdvancedGroups(recipe), ADVANCED_CONTACT_LIMIT(p.age));
  fitted.minutes =
    Math.ceil(estimateSessionSeconds(fitted.exercises) / 60) + strengthPreparationOverhead(fitted);
  return fitted;
}

/**
 * Keeps the session's landings within the limit without touching the strength work: first fewer
 * repetitions of the last jump rows (not below 2), then the last jump rows are left out.
 */
function fitContacts(recipe: EngineSession, limit: number): EngineSession {
  const jumps = () =>
    [...recipe.exercises].reverse().filter((e) => (e.dose.contactsPerRep ?? 0) > 0);
  for (let guard = 0; guard < 40 && strengthLandingCount(recipe.exercises) > limit; guard++) {
    const row = jumps().find((e) => (e.dose.reps ?? 0) > 2);
    if (!row) break;
    row.dose = { ...row.dose, reps: (row.dose.reps ?? 3) - 1 };
  }
  let out = recipe;
  while (strengthLandingCount(out.exercises) > limit) {
    const last = [...out.exercises].reverse().find((e) => (e.dose.contactsPerRep ?? 0) > 0);
    if (!last) break;
    out = withoutAdvancedRows(out, new Set([last.exerciseId]));
  }
  out.plyometricContacts = strengthLandingCount(out.exercises);
  return out;
}

/**
 * Gym-station progression (GP1/GP2) row by row, so a regression that turns one station into
 * another keeps its place in the group; a station that would repeat another row of the session
 * is left out (one exercise appears once per session).
 */
export function progressAdvanced(
  recipe: EngineSession,
  progress: (r: EngineSession) => EngineSession,
): EngineSession {
  const out = structuredClone(recipe);
  out.gymProgressionDecisions = [];
  const drop = new Set<number>();
  const renamed = new Map<string, string>();
  recipe.exercises.forEach((row, i) => {
    if (!row.exerciseId.startsWith("gym_")) return;
    const single = progress({ ...recipe, exercises: [row], complexPairs: [] });
    out.gymProgressionDecisions!.push(...(single.gymProgressionDecisions ?? []));
    const next = single.exercises[0];
    if (!next) drop.add(i);
    else {
      out.exercises[i] = next;
      if (next.exerciseId !== row.exerciseId) renamed.set(row.exerciseId, next.exerciseId);
    }
  });
  const seen = new Set<string>();
  out.exercises.forEach((row, i) => {
    if (drop.has(i)) return;
    if (seen.has(row.exerciseId)) drop.add(i);
    seen.add(row.exerciseId);
  });
  // Dropped rows get a unique marker, so a duplicate leaves without taking its namesake along.
  const marker = (i: number) => `__dropped_${i}`;
  const original = recipe.exercises.map((e) => e.exerciseId);
  out.complexPairs = (out.complexPairs ?? []).map((pair) => ({
    ...pair,
    exerciseIds: pair.exerciseIds.map((id) => {
      const i = original.indexOf(id);
      return drop.has(i) ? marker(i) : out.exercises[i].exerciseId;
    }),
  }));
  out.exercises = out.exercises.map((e, i) => (drop.has(i) ? { ...e, exerciseId: marker(i) } : e));
  if (out.optionalExercises)
    out.optionalExercises = out.optionalExercises.map((id) => renamed.get(id) ?? id);
  const lost = recipe.exercises.filter((_, i) => drop.has(i)).map((e) => e.role);
  const result = withoutAdvancedRows(out, new Set([...drop].map(marker)));
  result.missing = [
    ...new Set([
      ...result.missing,
      ...lost.filter((role) => !result.exercises.some((e) => e.role === role)),
    ]),
  ];
  return resyncAdvancedGroups(result);
}

/**
 * A short note session: optional groups, then other groups (or single rows) leave from the end
 * until the session fits, keeping the one with the main lower lift and the first with upper work.
 */
export function shortenAdvanced(recipe: EngineSession, budget: number): EngineSession {
  const LOWER = ["knee_strength", "hip_strength", "unilateral_strength"];
  const units: string[][] = [];
  const grouped = new Set((recipe.complexPairs ?? []).flatMap((g) => g.exerciseIds));
  for (const e of recipe.exercises) {
    if (e.role === "warmup" || e.role === "mobility") continue;
    const group = recipe.complexPairs?.find((g) => g.exerciseIds[0] === e.exerciseId);
    if (group) units.push(group.exerciseIds);
    else if (!grouped.has(e.exerciseId)) units.push([e.exerciseId]);
  }
  const role = (id: string) => recipe.exercises.find((e) => e.exerciseId === id)?.role;
  const lower = units.find((u) => u.some((id) => LOWER.includes(role(id) ?? "")));
  const upper = units.find((u) => u.some((id) => ["push", "pull"].includes(role(id) ?? "")));
  const optional = new Set(recipe.optionalExercises ?? []);
  let out = recipe;
  // Optional groups leave first, then the others from the end.
  for (const onlyOptional of [true, false])
    for (const unit of [...units].reverse()) {
      if (out.minutes <= budget) return out;
      if (unit === lower || unit === upper) continue;
      if (onlyOptional && !unit.every((id) => optional.has(id))) continue;
      if (!unit.some((id) => out.exercises.some((e) => e.exerciseId === id))) continue;
      out = withoutAdvancedRows(out, new Set(unit));
    }
  return out;
}

/** After a dose change (progression), every group again shares its rounds and rests. */
/**
 * Rests of one note group whose exercises may have different numbers of sets. In every round the
 * exercises that still have sets follow each other with the short transition; the last of them
 * rests the full round rest. An exercise with more sets than its later partners does its
 * extra sets alone (`pairedSets`) and rests the round rest after them (`soloRestSeconds`).
 */
export function layoutGroup(rows: ExerciseDecision[], roundRestSeconds: number, transition = 30) {
  rows.forEach((row, i) => {
    const later = Math.max(0, ...rows.slice(i + 1).map((r) => r.dose.sets));
    const d = { ...row.dose };
    delete d.pairedSets;
    delete d.soloRestSeconds;
    delete d.postRestSeconds;
    if (i === rows.length - 1) {
      d.restSeconds = roundRestSeconds;
      d.postRestSeconds = roundRestSeconds;
    } else {
      d.restSeconds = transition;
      if (d.sets > later) {
        d.pairedSets = later;
        d.soloRestSeconds = roundRestSeconds;
        d.postRestSeconds = roundRestSeconds;
      }
    }
    row.dose = d;
  });
}

export function resyncAdvancedGroups(recipe: EngineSession): EngineSession {
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  for (const pair of recipe.complexPairs ?? []) {
    const rows = recipe.exercises.filter((e) => pair.exerciseIds.includes(e.exerciseId));
    // Groups may have exercises with different numbers of sets (a gym jump with fewer rounds by
    // its own rules simply stops earlier), so nothing leaves the group here.
    if (rows.length < 2) {
      for (const r of rows) {
        r.dose = { ...r.dose, restSeconds: pair.roundRestSeconds };
        delete r.dose.postRestSeconds;
        delete r.dose.pairedSets;
        delete r.dose.soloRestSeconds;
      }
      continue;
    }
    layoutGroup(rows, pair.roundRestSeconds);
    pairs.push({ ...pair, exerciseIds: rows.map((r) => r.exerciseId) });
  }
  pairs.forEach((pair, i) => (pair.label = "ABCDEFGH"[i]));
  recipe.complexPairs = pairs;
  recipe.plyometricContacts = strengthLandingCount(recipe.exercises);
  recipe.minutes =
    Math.ceil(estimateSessionSeconds(recipe.exercises) / 60) + strengthPreparationOverhead(recipe);
  return recipe;
}

/**
 * A lighter week keeps the note: `hold` (maintenance, deload, re-entry) caps every row at two
 * rounds with at least 3 reps in reserve on the lifts; otherwise (time) one round less.
 */
export function lighterAdvanced(
  recipe: EngineSession,
  dropReactiveDepth: boolean,
  hold = true,
): EngineSession {
  const copy = structuredClone(recipe);
  for (const e of copy.exercises)
    if (e.role !== "warmup" && e.role !== "mobility")
      e.dose = {
        ...e.dose,
        sets: Math.max(1, hold ? Math.min(2, e.dose.sets) : e.dose.sets - 1),
        ...(hold && e.dose.rir !== undefined ? { rir: Math.max(3, e.dose.rir) } : {}),
      };
  let out = copy;
  if (dropReactiveDepth) {
    const deep = copy.exercises
      .filter((e) => (e.dose.contactsPerRep ?? 1) >= 2)
      .map((e) => e.exerciseId);
    out = withoutAdvancedRows(copy, new Set(deep));
  }
  out.plyometricContacts = strengthLandingCount(out.exercises);
  out.minutes =
    Math.ceil(estimateSessionSeconds(out.exercises) / 60) + strengthPreparationOverhead(out);
  return out;
}

/** Drops rows (match proximity, time, lighter week), keeping the rest of each group in rounds. */
export function withoutAdvancedRows(
  recipe: EngineSession,
  ids: ReadonlySet<string>,
): EngineSession {
  if (!ids.size) return recipe;
  const copy = structuredClone(recipe);
  copy.exercises = copy.exercises.filter((e) => !ids.has(e.exerciseId));
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  for (const pair of copy.complexPairs ?? []) {
    const left = pair.exerciseIds.filter((id) => !ids.has(id));
    if (left.length === pair.exerciseIds.length) {
      pairs.push(pair);
      continue;
    }
    const rows = copy.exercises.filter((e) => left.includes(e.exerciseId));
    if (left.length >= 2) {
      // The shorter group keeps the transitions and ends with the full round rest.
      layoutGroup(rows, pair.roundRestSeconds);
      pairs.push({ ...pair, exerciseIds: left });
    } else
      for (const e of rows) {
        // A partner left alone keeps the full rest of its round, not the 30 s transition.
        e.dose.restSeconds = pair.roundRestSeconds;
        delete e.dose.postRestSeconds;
        delete e.dose.pairedSets;
        delete e.dose.soloRestSeconds;
      }
  }
  pairs.forEach((pair, i) => (pair.label = "ABCDEFGH"[i]));
  copy.complexPairs = pairs;
  copy.skipNearMatch = copy.skipNearMatch?.filter((id) => !ids.has(id));
  copy.optionalExercises = copy.optionalExercises?.filter((id) => !ids.has(id));
  copy.plyometricContacts = strengthLandingCount(copy.exercises);
  copy.minutes =
    Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + strengthPreparationOverhead(copy);
  return copy;
}
