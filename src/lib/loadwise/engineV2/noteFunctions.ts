/**
 * Selection: which library exercises can fulfil a slot's FUNCTION. The skeleton fixes the
 * function (“skok reaktywny w głąb”, “ciężki przysiad”), this table lists the exercises of the
 * existing library that keep that function, strongest first, with the coach's own exercise
 * leading. A substitute must preserve the function and the sense of the pairing; when no
 * exercise of the function is allowed for the athlete the slot stays empty and is reported,
 * it is never filled with an exercise of another function.
 *
 * Eligibility (equipment, age, the athlete's declared strength preparation) is decided by the
 * caller; this module only orders and filters candidates.
 */
import type { Role } from "./model";
import type { SlotFunction } from "./coachSkeletons";
import { FUNCTIONAL_CATALOGUE, type FunctionMetadata, type JointAction } from "./taxonomy";

interface NoteFunction {
  id: SlotFunction;
  role: Role;
  label: string;
  /** Ordered: the coach's exercise first, then equivalents of the same function. */
  candidates: readonly string[];
  /** A main task (lift, ballistic lift, heavy push/pull): never replaced by another function. */
  main?: boolean;
  /** When no candidate fits, the same place in another role (e.g. a squat for a single-leg lift). */
  alt?: { role: Role; candidates: readonly string[] };
  /** Accessory work whose equivalent may change from block to block when the cycle asks to vary. */
  rotatable?: boolean;
}

export const NOTE_FUNCTIONS: Readonly<Record<SlotFunction, NoteFunction>> = {
  quad_iso: {
    id: "quad_iso",
    role: "quad_iso",
    label: "izometria czworogłowego",
    candidates: ["knee_iso_push", "split_squat_iso_hold"],
  },
  reactive_jump_light: {
    id: "reactive_jump_light",
    role: "power",
    label: "skok z krótkim kontaktem, niski",
    candidates: ["single_leg_box_jump", "box_jump", "countermovement_jump", "gym_cmj"],
  },
  reactive_jump_depth: {
    id: "reactive_jump_depth",
    role: "power",
    label: "skok reaktywny po zeskoku (depth / drop)",
    // Reactive (stretch-shortening) jumps first, hardest first; then plain jumps as a regression.
    candidates: [
      "depth_jump_over_hurdle",
      "depth_jump",
      "drop_jump",
      "hurdle_hops",
      "bilateral_pogo",
      // Last regressions of a prepared jump: still a jump after the heavy lift, never a throw.
      "box_jump",
      "countermovement_jump",
      "gym_cmj",
    ],
  },
  ballistic_triple_extension: {
    id: "ballistic_triple_extension",
    role: "power",
    label: "balistyczny wyprost bioder, kolan i kostek (hang power clean)",
    main: true,
    candidates: [
      "power_clean",
      "trap_bar_jump",
      "dumbbell_jump_squat",
      "countermovement_jump",
      "gym_cmj",
    ],
  },
  pogo_reactive: {
    id: "pogo_reactive",
    role: "power",
    label: "skoki reaktywne (pogo)",
    candidates: ["hurdle_hops", "bilateral_pogo", "gym_cmj"],
  },
  squat_heavy: {
    id: "squat_heavy",
    role: "knee_strength",
    label: "ciężki przysiad",
    main: true,
    candidates: [
      "heavy_back_squat",
      "quarter_box_squat",
      "front_squat",
      "box_squat",
      "goblet_squat",
      "leg_press",
    ],
  },
  horizontal_push_heavy: {
    id: "horizontal_push_heavy",
    role: "push",
    label: "ciężkie pchanie w poziomie",
    main: true,
    candidates: ["barbell_bench_press", "dumbbell_bench_press", "push_up", "incline_push_up"],
  },
  rear_delt_band_pull: {
    id: "rear_delt_band_pull",
    role: "pull",
    label: "przyciąganie do tyłu barków z gumą",
    candidates: ["face_pull_band", "prone_ytw_raise"],
  },
  horizontal_pull_heavy: {
    id: "horizontal_pull_heavy",
    role: "pull",
    label: "ciężkie przyciąganie w poziomie",
    main: true,
    candidates: ["barbell_row", "one_arm_dumbbell_row", "bodyweight_row"],
  },
  hip_extension_single_leg: {
    id: "hip_extension_single_leg",
    role: "hip_strength",
    label: "wyprost biodra jednonóż",
    candidates: [
      "single_leg_straight_leg_hip_thrust",
      "single_leg_banded_hip_thrust",
      "single_leg_glute_bridge",
      "hip_thrust",
    ],
  },
  knee_flexion_slider: {
    id: "knee_flexion_slider",
    role: "knee_flexion",
    label: "uginanie nóg (tył uda, dynamicznie)",
    rotatable: true,
    candidates: [
      "single_leg_slider_leg_curl",
      "bilateral_slider_leg_curl",
      "bilateral_swiss_ball_leg_curl",
      "lying_leg_curl",
      "seated_leg_curl",
      "prone_band_leg_curl",
    ],
  },
  calf_seated: {
    id: "calf_seated",
    role: "calf_bent",
    label: "łydka ze zgiętym kolanem",
    candidates: ["seated_soleus_raise", "soleus_iso_hold"],
  },
  calf_seated_light: {
    id: "calf_seated_light",
    role: "calf_bent",
    label: "łydka ze zgiętym kolanem (akcesorium)",
    candidates: ["seated_soleus_raise", "soleus_iso_hold"],
  },
  hip_flexion_band: {
    id: "hip_flexion_band",
    role: "trunk",
    label: "zginanie biodra z gumą",
    candidates: ["standing_banded_hip_flexion", "supine_banded_hip_flexion"],
  },
  hamstring_iso_hold: {
    id: "hamstring_iso_hold",
    role: "hamstring_iso",
    label: "izometria tyłu uda (trzymanie)",
    candidates: ["single_leg_straight_leg_ht_iso", "long_lever_hamstring_iso"],
  },
  hamstring_iso_switch: {
    id: "hamstring_iso_switch",
    role: "hamstring_iso",
    label: "izometria tyłu uda z przełączaniem",
    candidates: [
      "single_leg_straight_leg_iso_switch",
      "single_leg_straight_leg_ht_iso",
      "long_lever_hamstring_iso",
    ],
  },
  upper_throw_power: {
    id: "upper_throw_power",
    role: "upper_power",
    label: "rzut piłką lekarską (moc górnej części ciała)",
    candidates: ["medicine_ball_shot_put", "medicine_ball_rotational_scoop_toss", "med_ball_throw"],
  },
  pull_power_single_arm: {
    id: "pull_power_single_arm",
    role: "pull",
    label: "dynamiczne wiosłowanie jednorącz",
    candidates: ["single_arm_plyo_row", "one_arm_dumbbell_row"],
  },
  posterior_chain_rebound: {
    id: "posterior_chain_rebound",
    role: "hip_strength",
    label: "wyprost grzbietu i bioder z odbiciem",
    candidates: ["rebound_back_extension", "hamstring_45_back_extension", "romanian_deadlift_db"],
  },
  side_plank_abduction: {
    id: "side_plank_abduction",
    role: "trunk",
    label: "podpór bokiem z odwodzeniem nogi",
    candidates: ["high_side_plank_abduction", "side_plank"],
  },
  adductor_long_lever: {
    id: "adductor_long_lever",
    role: "adductor",
    label: "przywodziciele, długa dźwignia",
    candidates: ["copenhagen_plank", "adductor_bridge_squeeze"],
  },
  knee_single_leg_strength: {
    id: "knee_single_leg_strength",
    role: "unilateral_strength",
    label: "siła jednonóż (wejście)",
    main: true,
    // Always loaded: a bodyweight step-up is not the coach's exercise.
    candidates: ["loaded_step_up", "bulgarian_split_squat", "reverse_lunge"],
    alt: { role: "knee_strength", candidates: ["goblet_squat", "heavy_back_squat"] },
  },
  weighted_step_jump: {
    id: "weighted_step_jump",
    role: "power",
    label: "wyskok z wejścia jednonóż",
    candidates: ["weighted_step_up_jump", "single_leg_box_jump", "box_jump"],
  },
  assisted_single_leg_cmj: {
    id: "assisted_single_leg_cmj",
    role: "power",
    label: "skok z asystą gumy",
    candidates: ["single_leg_assisted_cmj", "gym_cmj_assisted", "gym_cmj"],
  },
  push_plyo: {
    id: "push_plyo",
    role: "push",
    label: "dynamiczne pchanie (pompka z gumą)",
    candidates: ["banded_plyo_push_up", "push_up", "incline_push_up"],
  },
  pull_speed: {
    id: "pull_speed",
    role: "pull",
    label: "szybkie wiosłowanie",
    candidates: ["speed_barbell_row", "barbell_row", "one_arm_dumbbell_row"],
  },
  hamstring_nordic: {
    id: "hamstring_nordic",
    role: "knee_flexion",
    label: "Nordic (ekscentryka tyłu uda)",
    candidates: [
      "full_nordic_hamstring",
      "eccentric_nordic_hamstring",
      "assisted_nordic_hamstring",
      "bilateral_slider_leg_curl",
      "lying_leg_curl",
      "bilateral_swiss_ball_leg_curl",
    ],
  },
  swiss_ball_pike: {
    id: "swiss_ball_pike",
    role: "trunk",
    label: "scyzoryk na piłce",
    candidates: ["single_leg_swiss_ball_pike", "dead_bug"],
  },
  swiss_ball_hip_twist: {
    id: "swiss_ball_hip_twist",
    role: "trunk",
    label: "skręt bioder na piłce",
    candidates: ["single_leg_swiss_ball_hip_twist", "dead_bug"],
  },
  hip_hinge_heavy: {
    id: "hip_hinge_heavy",
    role: "hip_strength",
    label: "ciężki wyprost biodra (martwy ciąg)",
    main: true,
    candidates: [
      "trap_bar_deadlift",
      "barbell_romanian_deadlift",
      "romanian_deadlift_db",
      "hip_thrust",
    ],
  },
  push_to_five: {
    id: "push_to_five",
    role: "push",
    label: "pchanie do 5 powtórzeń",
    main: true,
    candidates: ["barbell_bench_press", "dumbbell_bench_press", "push_up", "incline_push_up"],
  },
  pull_to_five: {
    id: "pull_to_five",
    role: "pull",
    label: "przyciąganie do 5 powtórzeń",
    main: true,
    candidates: [
      "pull_up",
      "barbell_row",
      "one_arm_dumbbell_row",
      "lat_pulldown",
      "bodyweight_row",
    ],
  },
  trunk_anti_rotation: {
    id: "trunk_anti_rotation",
    role: "trunk",
    label: "antyrotacja tułowia",
    rotatable: true,
    candidates: ["pallof_press", "dead_bug"],
  },
};

/**
 * The candidates of one slot, in the order they are tried. A function lists its exercises from
 * the most demanding to the simplest; a slot starts at the coach's own exercise and only goes
 * down from there, so a substitute is never harder than what the coach wrote. `extraFirst` is the
 * coach's other exercise for the heavier week (e.g. the supine hip flexor).
 */
export function orderedCandidates(
  fn: NoteFunction,
  prefer: readonly string[] = [],
  extraFirst?: string,
): string[] {
  const anchor = prefer[0] ?? fn.candidates[0];
  const at = fn.candidates.indexOf(anchor);
  const options = at >= 0 ? fn.candidates.slice(at) : fn.candidates;
  return [...new Set([...(extraFirst ? [extraFirst] : []), ...prefer, ...options])];
}

/**
 * What a function demands of any exercise standing for it, read from the library's functional
 * metadata (taxonomy.ts): a candidate must have one of `contractions` and at least one of
 * `actions`. A candidate that is not catalogued is a violation, so every candidate is curated.
 */
const FUNCTION_RULES: Readonly<
  Record<SlotFunction, { contractions: FunctionMetadata["contraction"][]; actions: JointAction[] }>
> = {
  quad_iso: { contractions: ["isometric"], actions: ["knee_extension"] },
  reactive_jump_light: { contractions: ["ballistic"], actions: ["jump"] },
  reactive_jump_depth: { contractions: ["reactive", "ballistic"], actions: ["jump"] },
  ballistic_triple_extension: { contractions: ["ballistic"], actions: ["hip_extension", "jump"] },
  pogo_reactive: { contractions: ["reactive", "ballistic"], actions: ["jump"] },
  squat_heavy: { contractions: ["dynamic"], actions: ["knee_extension"] },
  horizontal_push_heavy: { contractions: ["dynamic"], actions: ["push"] },
  rear_delt_band_pull: { contractions: ["dynamic"], actions: ["pull"] },
  horizontal_pull_heavy: { contractions: ["dynamic"], actions: ["pull"] },
  hip_extension_single_leg: { contractions: ["dynamic"], actions: ["hip_extension"] },
  knee_flexion_slider: { contractions: ["dynamic"], actions: ["knee_flexion"] },
  calf_seated: { contractions: ["dynamic", "isometric"], actions: ["plantar_flexion"] },
  calf_seated_light: { contractions: ["dynamic", "isometric"], actions: ["plantar_flexion"] },
  hip_flexion_band: { contractions: ["dynamic"], actions: ["hip_flexion"] },
  hamstring_iso_hold: { contractions: ["isometric"], actions: ["hip_extension", "knee_flexion"] },
  hamstring_iso_switch: { contractions: ["isometric"], actions: ["hip_extension", "knee_flexion"] },
  upper_throw_power: { contractions: ["ballistic"], actions: ["push", "brace"] },
  pull_power_single_arm: { contractions: ["dynamic"], actions: ["pull"] },
  posterior_chain_rebound: { contractions: ["dynamic"], actions: ["hip_extension"] },
  side_plank_abduction: { contractions: ["isometric"], actions: ["brace"] },
  adductor_long_lever: { contractions: ["isometric"], actions: ["hip_adduction"] },
  knee_single_leg_strength: { contractions: ["dynamic"], actions: ["knee_extension"] },
  weighted_step_jump: { contractions: ["ballistic"], actions: ["jump"] },
  assisted_single_leg_cmj: { contractions: ["ballistic"], actions: ["jump"] },
  push_plyo: { contractions: ["ballistic", "dynamic"], actions: ["push"] },
  pull_speed: { contractions: ["dynamic"], actions: ["pull"] },
  hamstring_nordic: { contractions: ["dynamic", "eccentric"], actions: ["knee_flexion"] },
  swiss_ball_pike: { contractions: ["isometric", "mixed"], actions: ["brace"] },
  swiss_ball_hip_twist: { contractions: ["isometric", "mixed"], actions: ["brace"] },
  hip_hinge_heavy: { contractions: ["dynamic"], actions: ["hip_extension"] },
  push_to_five: { contractions: ["dynamic"], actions: ["push"] },
  pull_to_five: { contractions: ["dynamic"], actions: ["pull"] },
  trunk_anti_rotation: { contractions: ["mixed", "isometric"], actions: ["brace"] },
};

/** Candidates of a function that do not fit its rules (empty when the registry is sound). */
export function functionViolations(fn: NoteFunction): string[] {
  const rule = FUNCTION_RULES[fn.id];
  const all = [...fn.candidates, ...(fn.alt?.candidates ?? [])];
  return all.flatMap((id) => {
    const meta = FUNCTIONAL_CATALOGUE[id];
    if (!meta) return [`${fn.id}: ${id} nie ma metadanych funkcji`];
    if (fn.alt?.candidates.includes(id)) return [];
    if (!rule.contractions.includes(meta.contraction))
      return [`${fn.id}: ${id} ma skurcz ${meta.contraction}`];
    if (!meta.actions.some((action) => rule.actions.includes(action)))
      return [`${fn.id}: ${id} nie wykonuje ${rule.actions.join("/")}`];
    return [];
  });
}
