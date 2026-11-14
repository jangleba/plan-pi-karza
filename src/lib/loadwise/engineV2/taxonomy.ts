/** Functional metadata is independent of the legacy display family. */
export type JointAction =
  | "knee_extension"
  | "knee_flexion"
  | "hip_extension"
  | "hip_adduction"
  | "plantar_flexion"
  | "dorsiflexion"
  | "push"
  | "pull"
  | "brace"
  | "jump"
  | "landing"
  | "locomotion";
export interface FunctionMetadata {
  actions: JointAction[];
  contraction: "dynamic" | "eccentric" | "isometric" | "ballistic" | "reactive" | "mixed";
  unilateral: boolean;
  stopRequired?: boolean;
  jointAngleDegrees?: number;
  hamstringHipDominant?: boolean;
}
export const FUNCTIONAL_CATALOGUE: Record<string, FunctionMetadata> = {};
function group(
  ids: string,
  actions: JointAction[],
  contraction: FunctionMetadata["contraction"] = "dynamic",
  unilateral = false,
) {
  for (const id of ids.split(" ")) FUNCTIONAL_CATALOGUE[id] = { actions, contraction, unilateral };
}
group(
  "bodyweight_squat goblet_squat heavy_back_squat front_squat leg_press flywheel_squat band_resisted_squat",
  ["knee_extension", "hip_extension"],
);
group("leg_extension", ["knee_extension"]);
group(
  "bodyweight_split_squat bulgarian_split_squat reverse_lunge step_up lateral_lunge",
  ["knee_extension", "hip_extension"],
  "dynamic",
  true,
);
group(
  "glute_bridge hip_thrust barbell_deadlift trap_bar_deadlift romanian_deadlift_db barbell_romanian_deadlift hamstring_45_back_extension",
  ["hip_extension"],
);
group(
  "glute_bridge_march single_leg_glute_bridge kickstand_romanian_deadlift single_leg_romanian_deadlift",
  ["hip_extension"],
  "dynamic",
  true,
);
group(
  "full_nordic_hamstring assisted_nordic_hamstring bilateral_slider_leg_curl bilateral_swiss_ball_leg_curl prone_band_leg_curl seated_leg_curl lying_leg_curl",
  ["knee_flexion"],
);
group("eccentric_nordic_hamstring", ["knee_flexion"], "eccentric");
group("razor_curl bridge_walkout", ["knee_flexion", "hip_extension"], "mixed");
group(
  "single_leg_slider_leg_curl single_leg_swiss_ball_leg_curl",
  ["knee_flexion"],
  "dynamic",
  true,
);
group(
  "long_lever_hamstring_iso heel_dig_hamstring_iso_30 heel_dig_hamstring_iso_90",
  ["hip_extension", "knee_flexion"],
  "isometric",
);
group("single_leg_long_lever_hamstring_iso", ["hip_extension", "knee_flexion"], "isometric", true);
group("oscillatory_long_lever_bridge", ["hip_extension", "knee_flexion"], "mixed");
group("overcoming_pin_squat", ["knee_extension", "hip_extension"], "isometric");
group("overcoming_pin_squat_primer", ["knee_extension", "hip_extension"], "isometric");
group("split_squat_iso_hold", ["knee_extension", "hip_extension"], "isometric", true);
group("adductor_bridge_squeeze", ["hip_adduction"], "isometric");
group("copenhagen_plank", ["hip_adduction", "brace"], "isometric", true);
group("soleus_iso_hold", ["plantar_flexion"], "isometric");
group("standing_calf_raise seated_soleus_raise", ["plantar_flexion"]);
group("tibialis_raise", ["dorsiflexion"]);
group("incline_push_up push_up dumbbell_bench_press pike_push_up dumbbell_overhead_press", [
  "push",
]);
group("lat_pulldown face_pull_band bodyweight_row pull_up", ["pull"]);
group("one_arm_dumbbell_row", ["pull"], "dynamic", true);
group("farmer_carry front_rack_carry overhead_carry", ["brace", "locomotion"], "mixed");
group("suitcase_carry", ["brace", "locomotion"], "mixed", true);
group("drop_landing snap_down", ["landing"]);
group(
  "lateral_bound_to_stick single_leg_hop_and_stick diagonal_bound_to_stick",
  ["jump", "landing"],
  "ballistic",
  true,
);
group("countermovement_jump squat_jump broad_jump box_jump", ["jump", "landing"], "ballistic");
group("bilateral_pogo lateral_pogo hurdle_hops depth_jump", ["jump", "landing"], "reactive");
group("single_leg_pogo", ["jump", "landing"], "reactive", true);
group(
  "skip_b_alternate_bounds alternate_leg_bounds power_skip_height power_skip_distance scissor_exchange_jump split_squat_jump scissor_bounds",
  ["jump", "landing"],
  "reactive",
  true,
);
group("repeated_broad_jump", ["jump", "landing"], "reactive");
group("power_clean clean_pull_from_hang kettlebell_swing", ["hip_extension"], "ballistic");
group("push_press", ["knee_extension", "push"], "ballistic");
group(
  "trap_bar_jump dumbbell_jump_squat barbell_jump_squat band_assisted_jump",
  ["jump", "landing"],
  "ballistic",
);
group(
  "med_ball_throw medicine_ball_overhead_backward_throw medicine_ball_slam",
  ["push", "brace"],
  "ballistic",
);
group("medicine_ball_rotational_scoop_toss", ["brace"], "ballistic", true);
group("plank", ["brace"], "isometric");
group("side_plank", ["brace"], "isometric", true);
group("dead_bug bird_dog pallof_press bodyweight_march_hold", ["brace"], "mixed", true);
group(
  "resisted_sled_acceleration flying_sprint football_curved_sprint accel_decel_reaccel planned_cut a_march free_acceleration_sprint flying_sprint easy_aerobic_run method_interval_run progressive_run_three_step_stop progressive_deceleration_5_10_15 half_kneeling_start falling_start split_stance_start dribble_to_sprint_transition lateral_start_acceleration run_two_step_stop deceleration_lateral_exit planned_505 cut_and_reaccelerate reactive_180_turn reactive_curved_sprint",
  ["locomotion"],
);

for (const id of [
  "snap_down",
  "drop_landing",
  "lateral_bound_to_stick",
  "single_leg_hop_and_stick",
  "diagonal_bound_to_stick",
])
  FUNCTIONAL_CATALOGUE[id].stopRequired = true;
FUNCTIONAL_CATALOGUE.heel_dig_hamstring_iso_30.jointAngleDegrees = 30;
FUNCTIONAL_CATALOGUE.heel_dig_hamstring_iso_90.jointAngleDegrees = 90;
FUNCTIONAL_CATALOGUE.overcoming_pin_squat_primer.jointAngleDegrees = 90;
for (const id of [
  "romanian_deadlift_db",
  "barbell_romanian_deadlift",
  "hamstring_45_back_extension",
  "kickstand_romanian_deadlift",
  "single_leg_romanian_deadlift",
])
  FUNCTIONAL_CATALOGUE[id].hamstringHipDominant = true;

/** Preserve the actual task, not just a legacy muscle/family label. */
export function functionalReplacementCompatible(sourceId: string, targetId: string): boolean {
  const source = FUNCTIONAL_CATALOGUE[sourceId],
    target = FUNCTIONAL_CATALOGUE[targetId];
  if (!source || !target) return true; // Noncurated domains keep their own existing gates.
  if (sourceId.startsWith("overcoming_pin_squat") || targetId.startsWith("overcoming_pin_squat"))
    return sourceId === targetId;
  if ((source.contraction === "isometric") !== (target.contraction === "isometric")) return false;
  if (source.contraction === "ballistic" && !["ballistic", "reactive"].includes(target.contraction))
    return false;
  if (source.contraction === "reactive" && target.contraction !== "reactive") return false;
  if (source.stopRequired && !target.stopRequired) return false;
  if (
    source.actions.length === 1 &&
    source.actions[0] === "hip_extension" &&
    target.actions.includes("knee_extension")
  )
    return false;
  if (source.hamstringHipDominant && !target.hamstringHipDominant) return false;
  if (
    source.jointAngleDegrees !== undefined &&
    target.jointAngleDegrees !== undefined &&
    source.jointAngleDegrees !== target.jointAngleDegrees
  )
    return false;
  return source.actions.every((action) => target.actions.includes(action));
}
