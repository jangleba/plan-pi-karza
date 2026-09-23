/**
 * Dokładne mapowanie grafik techniki ćwiczeń.
 *
 * Zasady:
 * - kluczem jest wyłącznie kanoniczny `exerciseId` z silnika LoadWise;
 * - brak dopasowań po nazwie, kategorii lub podobieństwie;
 * - pliki są serwowane z katalogu `public` i zostały zweryfikowane w teście.
 */

export type ExerciseTechniqueImageCategory = "strength" | "plyometric" | "power";

export interface ExerciseTechniqueImage {
  exerciseId: string;
  category: ExerciseTechniqueImageCategory;
  title: string;
  src: string;
  alt: string;
}

type ExerciseImageDefinition = readonly [exerciseId: string, title: string];

const STRENGTH_IMAGES = [
  ["bodyweight_row", "Wiosłowanie z masą ciała"],
  ["bridge_walkout", "Spacer piętami z mostu biodrowego"],
  ["hamstring_45_back_extension", "Prostowanie tułowia 45° na dwugłowe uda"],
  ["glute_bridge_march", "Marsz w moście biodrowym"],
  ["barbell_deadlift", "Martwy ciąg ze sztangą"],
  ["kickstand_romanian_deadlift", "Martwy ciąg rumuński kickstand"],
  ["single_leg_romanian_deadlift", "Martwy ciąg rumuński na jednej nodze"],
  ["romanian_deadlift_db", "Martwy ciąg rumuński z hantlami"],
  ["barbell_romanian_deadlift", "Martwy ciąg rumuński ze sztangą"],
  ["trap_bar_deadlift", "Martwy ciąg z trap barem"],
  ["glute_bridge", "Most biodrowy"],
  ["single_leg_glute_bridge", "Most biodrowy na jednej nodze"],
  ["push_up", "Pompka"],
  ["pike_push_up", "Pompka w pozycji pike"],
  ["leg_extension", "Prostowanie nóg na maszynie"],
  ["bulgarian_split_squat", "Przysiad bułgarski"],
  ["goblet_squat", "Przysiad goblet"],
  ["front_squat", "Przysiad przedni"],
  ["bodyweight_split_squat", "Przysiad wykroczny z masą ciała"],
  ["bodyweight_squat", "Przysiad z masą ciała"],
  ["heavy_back_squat", "Przysiad tylny ze sztangą"],
  ["pull_up", "Podciąganie nachwytem"],
  ["farmer_carry", "Spacer farmera"],
  ["suitcase_carry", "Spacer walizkowy"],
  ["overhead_carry", "Spacer z ciężarem nad głową"],
  ["front_rack_carry", "Spacer z ciężarem w pozycji front rack"],
  ["single_leg_swiss_ball_leg_curl", "Uginanie jednej nogi na piłce"],
  ["single_leg_slider_leg_curl", "Uginanie jednej nogi na ślizgaczu"],
  ["lying_leg_curl", "Uginanie nóg leżąc na maszynie"],
  ["prone_band_leg_curl", "Uginanie nóg leżąc z gumą"],
  ["bilateral_swiss_ball_leg_curl", "Uginanie obu nóg na piłce"],
  ["bilateral_slider_leg_curl", "Uginanie obu nóg na ślizgaczach"],
  ["seated_leg_curl", "Uginanie nóg siedząc na maszynie"],
  ["step_up", "Wejście na podwyższenie"],
  ["one_arm_dumbbell_row", "Wiosłowanie hantlem jednorącz"],
  ["seated_soleus_raise", "Wspięcie na palce siedząc"],
  ["standing_calf_raise", "Wspięcie na palce stojąc"],
  ["dumbbell_bench_press", "Wyciskanie hantli na ławce"],
  ["dumbbell_overhead_press", "Wyciskanie hantli nad głowę"],
  ["lateral_lunge", "Wykrok boczny"],
  ["reverse_lunge", "Wykrok w tył"],
  ["hip_thrust", "Hip thrust ze sztangą"],
  ["leg_press", "Wypychanie na suwnicy"],
  ["lat_pulldown", "Ściąganie drążka wyciągu górnego"],
] as const satisfies readonly ExerciseImageDefinition[];

const PLYOMETRIC_IMAGES = [
  ["depth_jump", "Drop jump"],
  ["drop_landing", "Lądowanie po zejściu z podestu"],
  ["snap_down", "Lądowanie snap-down"],
  ["lateral_pogo", "Pogo boczne"],
  ["single_leg_pogo", "Pogo jednonóż"],
  ["bilateral_pogo", "Pogo obunóż"],
  ["repeated_broad_jump", "Powtarzane skoki w dal"],
  ["hurdle_hops", "Przeskoki przez płotki"],
  ["lateral_bound_to_stick", "Skok boczny z zatrzymaniem"],
  ["diagonal_bound_to_stick", "Skok diagonalny z zatrzymaniem"],
  ["single_leg_hop_and_stick", "Skok jednonóż z zatrzymaniem"],
  ["broad_jump", "Skok w dal z miejsca"],
  ["countermovement_jump", "Skok z zamachem"],
  ["box_jump", "Wskok na skrzynię"],
  ["squat_jump", "Wyskocz z przysiadu"],
  ["split_squat_jump", "Wyskoki z pozycji wykrocznej"],
] as const satisfies readonly ExerciseImageDefinition[];

const POWER_IMAGES = [
  ["medicine_ball_rotational_scoop_toss", "Rotacyjny wyrzut piłki lekarskiej z dołu"],
  ["band_assisted_jump", "Skok z odciążeniem gumą"],
  ["medicine_ball_slam", "Uderzenie piłką lekarską o podłoże"],
  ["push_press", "Wyciskanie sztangi z wybiciem nóg"],
  ["kettlebell_swing", "Wymach kettlebell"],
  ["medicine_ball_overhead_backward_throw", "Wyrzut piłki lekarskiej nad głową w tył"],
  ["med_ball_throw", "Wyrzut piłki lekarskiej sprzed klatki"],
  ["dumbbell_jump_squat", "Wyskoki z hantlami"],
  ["trap_bar_jump", "Wyskoki z trap barem"],
  ["barbell_jump_squat", "Wyskoki ze sztangą"],
  ["power_clean", "Zarzut siłowy z pozycji zwisu"],
] as const satisfies readonly ExerciseImageDefinition[];

function buildCategory(
  category: ExerciseTechniqueImageCategory,
  definitions: readonly ExerciseImageDefinition[],
): ExerciseTechniqueImage[] {
  return definitions.map(([exerciseId, title]) => ({
    exerciseId,
    category,
    title,
    src: `/${category}/small/${exerciseId}.png`,
    alt: `${title} — trzy fazy prawidłowej techniki ruchu.`,
  }));
}

export const EXERCISE_TECHNIQUE_IMAGES: readonly ExerciseTechniqueImage[] = [
  ...buildCategory("strength", STRENGTH_IMAGES),
  ...buildCategory("plyometric", PLYOMETRIC_IMAGES),
  ...buildCategory("power", POWER_IMAGES),
];

const IMAGE_BY_EXERCISE_ID = new Map(
  EXERCISE_TECHNIQUE_IMAGES.map((image) => [image.exerciseId, image] as const),
);

/** Zwraca grafikę wyłącznie dla dokładnego, kanonicznego exerciseId. */
export function getExerciseTechniqueImage(
  exerciseId: string | null | undefined,
): ExerciseTechniqueImage | null {
  const id = exerciseId?.trim();
  return id ? (IMAGE_BY_EXERCISE_ID.get(id) ?? null) : null;
}
