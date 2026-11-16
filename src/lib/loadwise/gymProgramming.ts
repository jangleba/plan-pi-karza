/** Optional choices pin an exercise for the training block. Eligibility and the
 * weekly calendar still decide whether it can be prescribed. No random rotation. */
export const GYM_EXERCISE_OPTIONS = {
  squat: {
    label: "Przysiad · A",
    ids: [
      "heavy_back_squat",
      "front_squat",
      "tempo_back_squat",
      "box_squat",
      "dead_stop_pin_squat",
      "goblet_squat",
    ],
  },
  hinge: {
    label: "Martwy ciąg / RDL · B",
    ids: [
      "trap_bar_deadlift",
      "barbell_deadlift",
      "barbell_romanian_deadlift",
      "romanian_deadlift_db",
      "kickstand_romanian_deadlift",
      "single_leg_romanian_deadlift",
    ],
  },
  unilateral: {
    label: "Siła jednonóż · B",
    ids: ["bulgarian_split_squat", "loaded_step_up", "reverse_lunge"],
  },
  kneeFlexion: {
    label: "Zgięcie kolana · A",
    ids: [
      "assisted_nordic_hamstring",
      "eccentric_nordic_hamstring",
      "full_nordic_hamstring",
      "seated_leg_curl",
      "bilateral_slider_leg_curl",
    ],
  },
  powerA: {
    label: "Moc · A",
    ids: [
      "gym_cmj",
      "gym_cmj_assisted",
      "gym_cmj_resisted",
      "bilateral_pogo",
      "depth_jump",
      "drop_jump",
      "jump_shrug",
      "hang_power_snatch",
    ],
  },
  powerB: {
    label: "Moc · B",
    ids: [
      "gym_broad_jump",
      "gym_lateral_bound",
      "gym_lateral_jump",
      "gym_cmj",
      "bilateral_pogo",
      "drop_jump",
    ],
  },
  upperPower: {
    label: "Rzut piłką lekarską · B / para w A",
    ids: ["med_ball_throw", "medicine_ball_rotational_scoop_toss", "medicine_ball_slam"],
  },
  pushA: {
    label: "Wyciskanie · A",
    ids: ["barbell_bench_press", "dumbbell_bench_press", "push_up"],
  },
  trunk: {
    label: "Tułów · A/B",
    ids: ["pallof_press", "half_kneeling_cable_chop", "side_plank", "plank", "suitcase_carry"],
  },
  pullB: {
    label: "Przyciąganie · B",
    ids: ["pull_up", "lat_pulldown", "one_arm_dumbbell_row", "fast_band_row"],
  },
  landing: {
    label: "Lądowanie / przyjęcie obciążenia · B",
    ids: ["drop_landing", "single_leg_drop_landing", "band_step_and_stick", "gym_step_brake"],
  },
  calfA: {
    label: "Łydka z prostym kolanem · A",
    ids: ["standing_calf_raise", "standing_calf_iso_hold"],
  },
} as const;

export type GymExerciseSlot = keyof typeof GYM_EXERCISE_OPTIONS;
export type GymExerciseChoices = Partial<Record<GymExerciseSlot, string>>;

/** Do not substitute a different movement's animation for an unreviewed new technique. */
export const INSTRUCTION_ONLY_GYM_IDS = [
  "barbell_bench_press",
  "tempo_back_squat",
  "box_squat",
  "dead_stop_pin_squat",
  "loaded_step_up",
  "half_kneeling_cable_chop",
  "fast_band_row",
  "drop_jump",
  "single_leg_drop_landing",
  "band_step_and_stick",
  "standing_calf_iso_hold",
  "jump_shrug",
  "hang_power_snatch",
  "wall_push_up",
  "prone_ytw_raise",
] as const;

export function normalizeGymExerciseChoices(value: unknown): GymExerciseChoices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: GymExerciseChoices = {};
  for (const [slot, options] of Object.entries(GYM_EXERCISE_OPTIONS)) {
    const id = (value as Record<string, unknown>)[slot];
    if (typeof id === "string" && (options.ids as readonly string[]).includes(id))
      result[slot as GymExerciseSlot] = id;
  }
  return result;
}

export const GYM_DECLARED_EQUIPMENT = [
  "barbell",
  "rack",
  "dumbbell",
  "bench",
  "cable",
  "machine",
  "trap_bar",
  "nordic_setup",
  "sliders",
  "box",
  "platform",
  "med_ball",
  "band",
  "gym_jump_lane",
  "gym_throw_zone",
  "overhead_band_station",
  "low_band_station",
  "waist_band_station",
  "fixed_pins",
] as const;
