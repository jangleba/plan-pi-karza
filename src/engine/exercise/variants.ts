import { EXERCISES } from "../library";
import { INFO } from "../../exercises/info";
import type { Contraction, ExerciseVariant, Laterality, LoadConvention, Role, RxType } from "./types";

/**
 * Pula produkcyjna = obecne 55 ruchów biblioteki, rozszerzone o metadane kwalifikacji (wymagania, sprzęt, nadzór, funkcje slotu).
 * ID zostają bez zmian. Kody wymagań zgadzają się ze słownikiem katalogu badawczego tam, gdzie ruch ma odpowiednik.
 * Wymagania i nadzór to robocze decyzje produktu do przeglądu trenera – nie ocena techniki zawodnika.
 */
type M = {
  fn: string[]; goal: string; roles: Role[]; rx: RxType; fam: string; pat: string[]; joints?: string[];
  c?: Contraction; lat?: Laterality; setup?: string[][]; env?: string[]; people?: string[]; pre?: string[]; sup?: boolean;
  conv?: LoadConvention; grants?: string[]; research?: string; sec?: string[];
};
const LAND = ["clear_landing_zone", "suitable_floor"];
const RUN = ["suitable_runway"];
const OPEN = ["suitable_open_area"];

const META: Record<string, M> = {
  "knee-iso-push": { fn: ["iso_knee"], goal: "isometric_strength", roles: ["preparation"], rx: "isometric", fam: "knee_extension", pat: ["iso"], c: "yielding_isometric", lat: "unilateral" },
  "sl-hip-thrust-iso": { fn: ["iso_hip"], goal: "isometric_strength", roles: ["preparation"], rx: "isometric", fam: "hip_extension", pat: ["iso", "hinge"], c: "yielding_isometric", lat: "unilateral", pre: ["controlled_pelvis_in_bridge"] },
  "sl-box-jump": { fn: ["jump_prep"], goal: "jump_power", roles: ["preparation"], rx: "plyometric", fam: "vertical_jump", pat: ["jump"], c: "ballistic", lat: "unilateral", setup: [["box"]], env: LAND, pre: ["controlled_jump_and_landing", "stable_box_setup", "controlled_single_leg_landing", "step_down_exit_no_rebound_drop"] },
  "box-jump": { fn: ["jump_prep", "jump_after_strength"], goal: "jump_power", roles: ["preparation", "main_stimulus"], rx: "plyometric", fam: "vertical_jump", pat: ["jump"], c: "ballistic", lat: "bilateral", setup: [["box"]], env: LAND, pre: ["controlled_jump_and_landing", "stable_box_setup", "step_down_exit_no_rebound_drop"], grants: ["familiar_box_jump"], research: "research-box-jump" },
  "pogo-jumps": { fn: ["jump_prep", "jump_after_strength", "plyo_ankle"], goal: "reactive_power", roles: ["preparation", "main_stimulus"], rx: "plyometric", fam: "ankle_dominant_plyometric", pat: ["jump"], c: "ballistic", lat: "bilateral", env: LAND, pre: ["controlled_repeated_landing"], grants: ["familiar_bilateral_pogo"], research: "research-bilateral-pogo-jump" },
  "hang-power-clean": { fn: ["power_block"], goal: "power", roles: ["main_stimulus"], rx: "strength", fam: "weightlifting_derivative", pat: ["power", "hinge"], c: "ballistic", lat: "bilateral", setup: [["barbell"]], env: ["clear_lifting_zone"], pre: ["qualified_instruction_in_clean", "controlled_front_rack", "learned_bar_release_rules"], sup: true, conv: "total_kg", research: "research-hang-power-clean" },
  "kb-swing": { fn: ["power_block"], goal: "power", roles: ["main_stimulus"], rx: "strength", fam: "ballistic_hip_extension", pat: ["power", "hinge"], c: "ballistic", lat: "bilateral", setup: [["kettlebell"]], env: ["clear_swing_zone"], pre: ["familiar_loaded_hip_hinge", "learned_ballistic_hinge"], conv: "total_kg", research: "research-kettlebell-swing" },
  "back-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus"], rx: "strength", fam: "squat", pat: ["squat"], lat: "bilateral", setup: [["barbell", "rack", "safeties"]], pre: ["learned_squat_pattern", "learned_barbell_setup"], conv: "total_kg", grants: ["familiar_loaded_squat"], research: "research-barbell-back-squat" },
  "goblet-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "squat", pat: ["squat"], lat: "bilateral", setup: [["dumbbell"], ["kettlebell"]], pre: ["learned_squat_pattern"], conv: "total_kg", grants: ["familiar_goblet_squat"], research: "research-goblet-squat" },
  "step-up": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "split", pat: ["squat"], lat: "unilateral", setup: [["box"], ["stable_platform"]], pre: ["controlled_step_up_and_down"], conv: "total_kg", research: "research-step-up" },
  "depth-jump-hurdle": { fn: ["jump_after_strength"], goal: "reactive_power", roles: ["main_stimulus"], rx: "plyometric", fam: "depth_jump", pat: ["jump"], c: "ballistic", lat: "bilateral", setup: [["box", "hurdle"]], env: LAND, pre: ["qualified_instruction_in_depth_jump", "controlled_jump_and_landing", "familiar_box_jump", "step_down_exit_no_rebound_drop"], sup: true },
  "depth-box-jump": { fn: ["jump_after_strength"], goal: "reactive_power", roles: ["main_stimulus"], rx: "plyometric", fam: "depth_jump", pat: ["jump"], c: "ballistic", lat: "bilateral", setup: [["box"]], env: LAND, pre: ["qualified_instruction_in_depth_jump", "controlled_jump_and_landing", "familiar_box_jump", "step_down_exit_no_rebound_drop"], sup: true },
  "bench-press": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus"], rx: "strength", fam: "push", pat: ["push"], lat: "bilateral", setup: [["barbell", "bench", "rack", "safeties"]], pre: ["learned_bench_setup_and_unrack"], conv: "total_kg", research: "research-barbell-bench-press" },
  "db-bench-press": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "push", pat: ["push"], lat: "bilateral", setup: [["bench", "dumbbells"]], pre: ["learned_dumbbell_bench_setup"], conv: "per_dumbbell_kg", research: "research-dumbbell-bench-press" },
  "push-up": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "push", pat: ["push"], lat: "bilateral", pre: ["controlled_trunk_in_push_up"], grants: ["familiar_push_up"], research: "research-push-up" },
  facepull: { fn: ["scapular"], goal: "scapular_strength", roles: ["accessory"], rx: "strength", fam: "pull", pat: ["pull"], lat: "bilateral", setup: [["cable_station", "rope_attachment"]], pre: ["learned_cable_setup", "controlled_shoulder_motion"], conv: "machine_setting", research: "research-cable-face-pull" },
  "bb-row": { fn: ["pull_row"], goal: "strength_pull", roles: ["main_stimulus"], rx: "strength", fam: "pull", pat: ["pull"], lat: "bilateral", setup: [["barbell"]], pre: ["learned_hip_hinge", "learned_barbell_setup"], conv: "total_kg" },
  "db-row": { fn: ["pull_row"], goal: "strength_pull", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "pull", pat: ["pull"], lat: "unilateral", setup: [["bench", "dumbbell"]], pre: ["controlled_trunk"], conv: "total_kg", research: "research-one-arm-dumbbell-row" },
  "inverted-row": { fn: ["pull_row"], goal: "strength_pull", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "pull", pat: ["pull"], lat: "bilateral", setup: [["rated_low_bar"], ["sturdy_table"]], pre: ["controlled_trunk", "secure_anchor_setup"], research: "research-inverted-row" },
  "sl-straight-leg-ht": { fn: ["hip_ext"], goal: "strength_hinge", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "hip_extension", pat: ["hinge"], lat: "unilateral", setup: [["bench"]], pre: ["controlled_pelvis_in_bridge"], conv: "total_kg", research: "research-single-leg-hip-thrust" },
  "glute-bridge": { fn: ["hip_ext"], goal: "strength_hinge", roles: ["accessory"], rx: "strength", fam: "hip_extension", pat: ["hinge"], lat: "bilateral", grants: ["familiar_glute_bridge"], research: "research-glute-bridge" },
  "slider-leg-curl": { fn: ["knee_flex"], goal: "knee_flexor_strength", roles: ["accessory"], rx: "strength", fam: "knee_flexion", pat: ["hinge"], c: "eccentric_emphasis", lat: "bilateral", setup: [["sliders"], ["towel"]], env: ["compatible_floor"], pre: ["controlled_pelvis_in_bridge"], grants: ["familiar_slider_leg_curl"], research: "research-slider-leg-curl" },
  "seated-sl-calf": { fn: ["calf"], goal: "ankle_plantarflexor_strength", roles: ["accessory"], rx: "strength", fam: "calf_ankle", pat: ["calf"], lat: "unilateral", setup: [["bench", "dumbbell"]], pre: ["learned_load_setup"], conv: "total_kg" },
  "banded-hip-flexion": { fn: ["hip_flexion"], goal: "hip_flexor_strength", roles: ["accessory"], rx: "strength", fam: "hip_flexion", pat: ["hipflexor"], lat: "unilateral", setup: [["band", "hand_support", "rated_anchor"]], pre: ["learned_band_setup", "controlled_pelvis", "controlled_single_leg_stance"], research: "research-standing-banded-hip-flexion" },
  "skip-przejscia": { fn: ["sprint_prep"], goal: "sprint_skill", roles: ["preparation", "skill"], rx: "sprint", fam: "drill", pat: ["drill"], c: "locomotion", lat: "alternating", env: RUN, pre: ["learned_upright_drill_posture", "controlled_alternating_contacts"] },
  "skip-a-b-d": { fn: ["sprint_prep"], goal: "sprint_skill", roles: ["preparation", "skill"], rx: "sprint", fam: "drill", pat: ["drill"], c: "locomotion", lat: "alternating", env: RUN, pre: ["learned_upright_drill_posture", "controlled_alternating_contacts", "learned_leg_cycle_timing"] },
  ankling: { fn: ["sprint_prep"], goal: "sprint_skill", roles: ["preparation", "skill"], rx: "sprint", fam: "drill", pat: ["drill"], c: "locomotion", lat: "alternating", env: RUN, pre: ["controlled_repeated_contacts"], research: "research-ankling-drill" },
  "resisted-first-step": { fn: ["acceleration_skill"], goal: "acceleration_skill", roles: ["skill", "main_stimulus"], rx: "sprint", fam: "resisted_acceleration", pat: ["sprint"], c: "locomotion", lat: "alternating", setup: [["rated_resistance_band", "secure_anchor"]], env: RUN, pre: ["learned_sled_and_harness_setup", "familiar_unresisted_acceleration", "clear_run_out"] },
  "resisted-sprint": { fn: ["acceleration"], goal: "acceleration", roles: ["main_stimulus"], rx: "sprint", fam: "resisted_acceleration", pat: ["sprint"], c: "locomotion", lat: "alternating", setup: [["rated_resistance_band", "secure_anchor"]], env: RUN, pre: ["learned_sled_and_harness_setup", "familiar_unresisted_acceleration", "clear_run_out"] },
  "sprint-30": { fn: ["acceleration"], goal: "acceleration", roles: ["main_stimulus"], rx: "sprint", fam: "acceleration", pat: ["sprint"], c: "locomotion", lat: "alternating", env: RUN, pre: ["familiar_running", "clear_run_out"] },
  "cod-turnover": { fn: ["cod"], goal: "change_of_direction_skill", roles: ["skill", "main_stimulus"], rx: "cod", fam: "planned_cod", pat: ["cod"], c: "locomotion", lat: "alternating", setup: [["markers"]], env: OPEN, pre: ["controlled_linear_braking", "learned_shuttle_turn", "clear_exit_lane"], research: "research-shuttle-turn" },
  deceleration: { fn: ["decel"], goal: "deceleration_skill", roles: ["skill", "main_stimulus"], rx: "cod", fam: "deceleration", pat: ["cod"], c: "locomotion", lat: "bilateral", setup: [["markers"]], env: OPEN, pre: ["learned_braking_steps", "clear_stop_zone"], research: "research-linear-run-to-stop" },
  "sl-jumps-llrr": { fn: ["plyo_ankle"], goal: "reactive_power", roles: ["skill", "main_stimulus"], rx: "plyometric", fam: "ankle_dominant_plyometric", pat: ["jump"], c: "ballistic", lat: "unilateral", env: LAND, pre: ["controlled_repeated_single_leg_landing"] },
  "heiden-jumps": { fn: ["plyo_ankle"], goal: "reactive_power", roles: ["skill", "main_stimulus"], rx: "plyometric", fam: "ankle_dominant_plyometric", pat: ["jump"], c: "ballistic", lat: "alternating", env: LAND, pre: ["controlled_lateral_single_leg_landing"] },
  "curve-run": { fn: ["curve"], goal: "curved_running_skill", roles: ["skill", "main_stimulus"], rx: "sprint", fam: "curved_running", pat: ["sprint"], c: "locomotion", lat: "alternating", setup: [["markers"]], env: ["suitable_open_runway"], pre: ["controlled_upright_running", "clear_curve_and_run_out"], research: "research-curve-run" },
  "bw-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "squat", pat: ["squat"], lat: "bilateral", research: "research-bodyweight-squat" },
  "split-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "split", pat: ["squat"], lat: "unilateral", pre: ["controlled_split_stance"], research: "research-split-squat" },
  "bulgarian-split-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus"], rx: "strength", fam: "split", pat: ["squat"], lat: "unilateral", setup: [["stable_platform"]], pre: ["familiar_split_squat", "controlled_single_leg_stance"], research: "research-rear-foot-elevated-split-squat" },
  "assisted-pistol": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus"], rx: "strength", fam: "squat", pat: ["squat"], lat: "unilateral", setup: [["hand_support"]], pre: ["controlled_single_leg_stance", "comfortable_active_range"] },
  "pistol-squat": { fn: ["squat_main"], goal: "strength_squat", roles: ["main_stimulus"], rx: "strength", fam: "squat", pat: ["squat"], lat: "unilateral", pre: ["controlled_single_leg_stance", "comfortable_active_range", "familiar_assisted_pistol"] },
  "sl-glute-bridge": { fn: ["hip_ext"], goal: "strength_hinge", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "hip_extension", pat: ["hinge"], lat: "unilateral", pre: ["controlled_pelvis_in_bridge"], research: "research-single-leg-glute-bridge" },
  "sl-rdl-bw": { fn: ["hip_hinge_unilateral"], goal: "strength_hinge", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "hinge", pat: ["hinge"], lat: "unilateral", pre: ["learned_hip_hinge", "controlled_single_leg_stance"], research: "research-single-leg-romanian-deadlift" },
  "nordic-assisted": { fn: ["knee_flex"], goal: "eccentric_strength", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "knee_flexion", pat: ["hinge"], c: "eccentric_emphasis", lat: "bilateral", setup: [["knee_pad", "landing_pad", "rated_ankle_anchor"], ["knee_pad", "landing_pad"]], people: [], pre: ["learned_assisted_nordic_setup", "controlled_trunk_and_pelvis", "learned_safe_hand_landing"], sup: true, research: "research-band-assisted-nordic-hamstring-curl", sec: ["NORDIC_RCT"] },
  "nordic-curl": { fn: ["knee_flex"], goal: "eccentric_strength", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "knee_flexion", pat: ["hinge"], c: "eccentric_emphasis", lat: "bilateral", setup: [["knee_pad", "landing_pad", "rated_ankle_anchor"]], pre: ["learned_nordic_setup", "controlled_trunk_and_pelvis", "learned_safe_hand_landing"], sup: true, research: "research-nordic-hamstring-curl", sec: ["NORDIC_RCT"] },
  "incline-push-up": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus", "accessory"], rx: "strength", fam: "push", pat: ["push"], lat: "bilateral", setup: [["stable_support"]], pre: ["controlled_trunk_in_push_up"], research: "research-incline-push-up" },
  "feet-elevated-push-up": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus"], rx: "strength", fam: "push", pat: ["push"], lat: "bilateral", setup: [["stable_support"]], pre: ["controlled_trunk_in_push_up", "familiar_push_up"] },
  "archer-push-up": { fn: ["push_main"], goal: "strength_push", roles: ["main_stimulus"], rx: "strength", fam: "push", pat: ["push"], lat: "alternating", pre: ["controlled_trunk_in_push_up", "familiar_push_up"] },
  "feet-elevated-row": { fn: ["pull_row"], goal: "strength_pull", roles: ["main_stimulus"], rx: "strength", fam: "pull", pat: ["pull"], lat: "bilateral", setup: [["rated_low_bar", "stable_support"], ["sturdy_table", "stable_support"]], pre: ["controlled_trunk", "secure_anchor_setup"] },
  "archer-row": { fn: ["pull_row"], goal: "strength_pull", roles: ["main_stimulus"], rx: "strength", fam: "pull", pat: ["pull"], lat: "alternating", setup: [["rated_low_bar"], ["sturdy_table"]], pre: ["controlled_trunk", "secure_anchor_setup"] },
  "squat-jump": { fn: ["jump_prep"], goal: "jump_power", roles: ["preparation", "main_stimulus"], rx: "plyometric", fam: "vertical_jump", pat: ["jump"], c: "ballistic", lat: "bilateral", env: LAND, pre: ["controlled_squat", "learned_landing_position"] },
  bounding: { fn: ["plyo_horizontal", "jump_prep"], goal: "reactive_power", roles: ["preparation", "main_stimulus"], rx: "plyometric", fam: "horizontal_plyometric", pat: ["jump"], c: "ballistic", lat: "alternating", env: LAND, pre: ["controlled_alternating_contacts", "controlled_forward_landing"], research: "research-alternating-bounds" },
  "sl-hop": { fn: ["plyo_horizontal", "jump_prep"], goal: "reactive_power", roles: ["preparation", "main_stimulus"], rx: "plyometric", fam: "horizontal_plyometric", pat: ["jump"], c: "ballistic", lat: "unilateral", env: LAND, pre: ["controlled_single_leg_landing"], research: "research-single-leg-hop-to-stick" },
  "sl-calf-raise": { fn: ["calf"], goal: "ankle_plantarflexor_strength", roles: ["accessory"], rx: "strength", fam: "calf_ankle", pat: ["calf"], lat: "unilateral", setup: [["hand_support"]], pre: ["controlled_single_leg_stance"], research: "research-single-leg-standing-calf-raise" },
  "side-plank": { fn: ["trunk_lateral"], goal: "trunk_isometric_strength", roles: ["accessory"], rx: "isometric", fam: "core", pat: ["core"], c: "yielding_isometric", lat: "unilateral", research: "research-side-plank" },
  copenhagen: { fn: ["adductor_core"], goal: "isometric_adductor_strength", roles: ["accessory"], rx: "isometric", fam: "adduction", pat: ["core"], c: "yielding_isometric", lat: "unilateral", setup: [["stable_platform"]], pre: ["controlled_side_plank", "learned_copenhagen_setup"], sec: ["COPENHAGEN_RCT"] },
};

/** Legacy → kandydat badawczy; null = świadomie nie scalone (różne bodźce, zbiorcze nazwy). Użyte w raporcie deduplikacji. */
export const LEGACY_TO_RESEARCH: Record<string, string | null> = Object.fromEntries(
  Object.keys(META).map((id) => [id, META[id]!.research ?? null]),
);

const SETUP_NONE = [{ equipmentAllOf: [], environmentAllOf: [], people: [] }];

function build(id: string): ExerciseVariant | null {
  const e = EXERCISES[id];
  const m = META[id];
  if (!e || !m) return null;
  const info = INFO[id];
  const env = m.env ?? [];
  const setup = (m.setup ?? [[]]).map((eq) => ({ equipmentAllOf: eq, environmentAllOf: env, people: m.people ?? [] }));
  return {
    id, version: 1, canonicalId: id, nameEn: e.name, namePl: e.name,
    family: m.fam, movementPatterns: m.pat, jointActions: [e.joint], primaryGoal: m.goal, secondaryGoals: m.sec ?? [],
    functions: m.fn, roles: m.roles, contraction: m.c ?? "dynamic", laterality: m.lat ?? "bilateral",
    minimumAge: 16, setupOptions: setup.length ? setup : SETUP_NONE,
    prerequisites: m.pre ?? [], supervision: m.sup ? "qualified_required" : "standard", familiarityRequired: false,
    allowedPrescriptionTypes: [m.rx],
    contentStatus: info ? "complete" : "incomplete",
    reviewStatus: info ? "published" : "reviewed",
    instructionsPl: info ? [...info.cues] : [],
    media: info ? { id: info.anim, version: 1, reviewed: true } : undefined,
    evidence: (m.sec ?? []).map((s) => ({ sourceId: s, scope: "family_inference" as const, limitations: ["Wynik dotyczy programu, nie tego wariantu i dawki."] })),
    cns: e.cns, loaded: e.loaded, loadConvention: m.conv ?? "bodyweight", grants: m.grants,
  };
}

export const VARIANTS: Record<string, ExerciseVariant> = Object.fromEntries(
  Object.keys(META).map((id) => [id, build(id)]).filter((x): x is [string, ExerciseVariant] => !!x[1]),
);

export const getVariant = (id: string, pool: Record<string, ExerciseVariant> = VARIANTS): ExerciseVariant | undefined => pool[id];
