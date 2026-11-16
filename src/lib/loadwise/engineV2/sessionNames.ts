import type { EngineSession } from "./model";

const STRENGTH_NAMES: Record<string, string> = {
  foundation: "Strength Foundations",
  strength_build: "Strength Development",
  max_strength: "Maximal Strength",
  power_support: "Strength & Power",
  maintenance: "Strength Maintenance",
  deload: "Strength Deload",
  reentry: "Strength Reintroduction",
};
const METHOD_NAMES = {
  contrast: "Strength–Power Contrast",
  cluster: "Cluster Strength",
  strength: "Full-Body Strength",
  noPower: "Strength for Football",
  postMatchUpper: "Upper Body & Trunk",
};
const SPRINT_NAMES = {
  acceleration: "Acceleration Development",
  max_velocity: "Flying Sprint Development",
  curve: "Curved Sprinting",
  braking: "Deceleration Development",
  planned_cod: "Planned Change of Direction",
  reactive: "Reactive Agility",
};
const RUNNING_NAMES: Record<string, string> = {
  field_mas_test: "Field MAS Test",
  easy_continuous: "Easy Aerobic Run",
  long_continuous: "Aerobic Endurance",
  tempo: "Tempo Intervals",
  short_hiit: "High-Intensity Intervals",
  aerobic_intervals: "Aerobic Intervals",
};
const SUPPORT_NAMES = {
  activation: "Pre-Match Activation",
  recovery: "Active Recovery",
  mobility: "Mobility",
  skills: "Individual Ball Skills",
};
export const EXTERNAL_SESSION_NAMES = { match: "Match", club: "Team Training", rest: "Rest Day" };
const PROFESSIONAL_NAMES = new Set([
  ...Object.values(STRENGTH_NAMES),
  ...Object.values(METHOD_NAMES),
  ...Object.values(SPRINT_NAMES),
  ...Object.values(RUNNING_NAMES),
  ...Object.values(SUPPORT_NAMES),
  ...Object.values(EXTERNAL_SESSION_NAMES),
  "Deceleration & Reacceleration",
]);

/** Legacy display rules must not translate a current, task-specific title back to Polish. */
export const isProfessionalSessionName = (title: string) =>
  PROFESSIONAL_NAMES.has(title.replace(/ · [AB]$/, ""));

/** Professional task names describe the prescribed work; instructions/UI stay Polish. */
export function sessionName(recipe: EngineSession): string {
  if (recipe.roles.includes("strengthA") || recipe.roles.includes("strengthB")) {
    const variant = recipe.roles.includes("strengthA") ? "A" : "B";
    if (recipe.postMatch === "upper") return `${METHOD_NAMES.postMatchUpper} · ${variant}`;
    const method =
      recipe.organization === "contrast"
        ? METHOD_NAMES.contrast
        : recipe.exercises.some((e) => e.dose.cluster)
          ? METHOD_NAMES.cluster
          : recipe.strengthFocus?.mode === "power_support" &&
              !recipe.exercises.some((e) => e.role === "power")
            ? METHOD_NAMES.noPower
            : (STRENGTH_NAMES[recipe.strengthFocus?.mode ?? ""] ??
              (recipe.phase === "deload" ? STRENGTH_NAMES.deload : METHOD_NAMES.strength));
    return `${method} · ${variant}`;
  }
  if (recipe.roles.includes("speed")) {
    if (
      recipe.sprintGoal === "braking" &&
      recipe.exercises.some(
        (e) =>
          e.dose.speedStage === "main" &&
          ["accel_decel_reaccel", "deceleration_lateral_exit"].includes(e.exerciseId),
      )
    )
      return "Deceleration & Reacceleration";
    return SPRINT_NAMES[recipe.sprintGoal ?? "acceleration"];
  }
  if (recipe.roles.includes("endurance"))
    return RUNNING_NAMES[recipe.runningRecipe?.method ?? ""] ?? RUNNING_NAMES.long_continuous;
  if (recipe.roles.includes("activation")) return SUPPORT_NAMES.activation;
  if (recipe.roles.includes("recovery")) return SUPPORT_NAMES.recovery;
  if (recipe.roles.includes("mobility")) return SUPPORT_NAMES.mobility;
  return SUPPORT_NAMES.skills;
}
const EXERCISE_NAMES: Record<string, string> = {
  acceleration_mechanics: "Acceleration Mechanics",
  bulgarian_split_squat: "Rear-Foot-Elevated Split Squat",
  heavy_back_squat: "Barbell Back Squat",
  barbell_deadlift: "Barbell Deadlift",
  depth_jump: "Depth Jump",
  max_velocity_high_volume: "Maximum Velocity Sprinting",
  med_ball_throw: "Medicine Ball Chest Pass",
  static_stretch_cooldown: "Static Stretching",
  sprint_ramp_warmup: "Sprint Warm-Up",
  sprint_cooldown_walk: "Cool-Down Walk",
  a_march: "A-March",
  a_skip: "A-Skip",
  b_skip: "B-Skip",
  c_skip: "C-Skip",
  ankling: "Ankling",
  low_dribble: "Low Dribble Run",
  high_dribble: "High Dribble Run",
  free_acceleration_sprint: "Standing Start Acceleration",
  half_kneeling_start: "Half-Kneeling Start",
  falling_start: "Falling Start",
  split_stance_start: "Split-Stance Start",
  lateral_start_acceleration: "Lateral Start Acceleration",
  dribble_to_sprint_transition: "Dribble Run to Acceleration",
  flying_sprint: "Flying Sprint",
  progressive_build_up_sprint: "Progressive Build-Up",
  resisted_sled_acceleration: "Resisted Sled Acceleration",
  gym_cmj: "Countermovement Jump (CMJ)",
  gym_cmj_assisted: "Band-Assisted Countermovement Jump",
  gym_cmj_resisted: "Band-Resisted Countermovement Jump",
  gym_broad_jump: "Standing Broad Jump",
  gym_lateral_jump: "Lateral Jump and Stick",
  gym_lateral_bound: "Lateral Bound and Stick",
  gym_step_brake: "Step and Stick",
  gym_fast_band_curl: "Fast Band Hamstring Curl",
  gym_bridge_pulses: "Bridge Pulses",
};
export const exerciseName = (id: string, canonicalEnglishName: string) =>
  EXERCISE_NAMES[id] ?? canonicalEnglishName;
