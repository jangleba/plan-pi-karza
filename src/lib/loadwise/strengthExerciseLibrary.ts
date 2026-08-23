import {
  getAllEquipmentDefinitions,
  getApprovedExerciseDefinitions,
  getExerciseDefinition,
  hydrateTrainingExerciseFromDefinition,
  normalizeExerciseName,
  specialistEquipmentForExercise,
  type ExerciseDefinition,
  type SessionCategory,
} from "./exerciseLibrary";
import type { TrainingExercise } from "./types";

export interface StrengthLibraryFilters {
  query?: string;
  movement?: string;
  muscle?: string;
  equipment?: string;
  level?: string;
  place?: string;
}

export interface StrengthLibraryFilterOption {
  value: string;
  label: string;
}

export interface StrengthLibraryFilterOptions {
  movements: StrengthLibraryFilterOption[];
  muscles: StrengthLibraryFilterOption[];
  equipment: StrengthLibraryFilterOption[];
  levels: StrengthLibraryFilterOption[];
  places: StrengthLibraryFilterOption[];
}

const STRENGTH_LIBRARY_SESSION_CATEGORIES = new Set<SessionCategory>([
  "strength_gym",
  "power_plyo",
  "core_robustness",
  "mobility_prehab",
]);
const EXCLUDED_STRENGTH_LIBRARY_IDS = new Set<string>(["bodyweight_march_hold"]);

const EQUIPMENT_LABELS = new Map(
  getAllEquipmentDefinitions().map((equipment) => [equipment.id, equipment.displayName] as const),
);

const MOVEMENT_OVERRIDES: Record<string, string> = {
  assisted_nordic_hamstring: "Hamstring curl",
  eccentric_nordic_hamstring: "Hamstring curl",
  full_nordic_hamstring: "Hamstring curl",
  razor_curl: "Hamstring curl",
  bilateral_slider_leg_curl: "Hamstring curl",
  single_leg_slider_leg_curl: "Hamstring curl",
  bilateral_swiss_ball_leg_curl: "Hamstring curl",
  single_leg_swiss_ball_leg_curl: "Hamstring curl",
  prone_band_leg_curl: "Hamstring curl",
  bridge_walkout: "Hamstring hip extension",
  long_lever_hamstring_iso: "Hamstring isometric",
  single_leg_long_lever_hamstring_iso: "Hamstring isometric",
  heel_dig_hamstring_iso_30: "Hamstring isometric",
  heel_dig_hamstring_iso_90: "Hamstring isometric",
  oscillatory_long_lever_bridge: "Hamstring isometric",
  hamstring_45_back_extension: "Hamstring hip extension",
  goblet_squat: "Bilateral squat",
  bodyweight_squat: "Bilateral squat",
  heavy_back_squat: "Bilateral squat",
  front_squat: "Bilateral squat",
  leg_press: "Bilateral squat",
  reverse_lunge: "Unilateral lunge",
  lateral_lunge: "Unilateral lunge",
  bodyweight_split_squat: "Unilateral squat",
  bulgarian_split_squat: "Unilateral squat",
  step_up: "Step-up",
  kickstand_romanian_deadlift: "Hip hinge / deadlift",
  romanian_deadlift_db: "Hip hinge / deadlift",
  barbell_deadlift: "Hip hinge / deadlift",
  trap_bar_deadlift: "Hip hinge / deadlift",
  barbell_romanian_deadlift: "Hip hinge / deadlift",
  single_leg_romanian_deadlift: "Hip hinge / deadlift",
  push_up: "Horizontal push",
  dumbbell_bench_press: "Horizontal push",
  dumbbell_overhead_press: "Vertical push",
  pike_push_up: "Vertical push",
  bodyweight_row: "Horizontal pull",
  one_arm_dumbbell_row: "Horizontal pull",
  lat_pulldown: "Vertical pull",
  pull_up: "Vertical pull",
  standing_calf_raise: "Calves / tibialis",
  seated_soleus_raise: "Calves / tibialis",
  tibialis_raise: "Calves / tibialis",
  copenhagen_plank: "Adductors / groin",
  adductor_bridge_squeeze: "Adductors / groin",
  face_pull_band: "Shoulder / scapular support",
  pallof_press: "Anti-rotation core",
  plank: "Anti-extension core",
  dead_bug: "Anti-extension core",
  side_plank: "Anti-lateral-flexion core",
  bodyweight_march_hold: "Anti-lateral-flexion core",
  suitcase_carry: "Loaded carry",
  farmer_carry: "Loaded carry",
  front_rack_carry: "Loaded carry",
  overhead_carry: "Loaded carry",
};

const MUSCLE_OVERRIDES: Record<string, string[]> = {
  bodyweight_squat: ["pośladki", "czworogłowe uda"],
  goblet_squat: ["czworogłowe uda", "pośladki", "core"],
  heavy_back_squat: ["czworogłowe uda", "pośladki", "dwugłowe uda"],
  front_squat: ["czworogłowe uda", "core", "pośladki"],
  leg_press: ["czworogłowe uda", "pośladki"],
  reverse_lunge: ["pośladki", "czworogłowe uda"],
  lateral_lunge: ["pośladki", "przywodziciele"],
  bodyweight_split_squat: ["czworogłowe uda", "pośladki"],
  bulgarian_split_squat: ["pośladki", "czworogłowe uda"],
  step_up: ["pośladki", "czworogłowe uda"],
  romanian_deadlift_db: ["dwugłowe uda", "pośladki"],
  barbell_deadlift: ["pośladki", "dwugłowe uda", "grzbiet"],
  trap_bar_deadlift: ["pośladki", "czworogłowe uda", "grzbiet"],
  barbell_romanian_deadlift: ["dwugłowe uda", "pośladki"],
  kickstand_romanian_deadlift: ["dwugłowe uda", "pośladki"],
  single_leg_romanian_deadlift: ["dwugłowe uda", "pośladki", "stopa"],
  hip_thrust: ["pośladki", "dwugłowe uda"],
  glute_bridge: ["pośladki", "dwugłowe uda"],
  glute_bridge_march: ["pośladki", "dwugłowe uda", "core"],
  single_leg_glute_bridge: ["pośladki", "dwugłowe uda"],
  assisted_nordic_hamstring: ["dwugłowe uda"],
  eccentric_nordic_hamstring: ["dwugłowe uda"],
  full_nordic_hamstring: ["dwugłowe uda"],
  razor_curl: ["dwugłowe uda"],
  bilateral_slider_leg_curl: ["dwugłowe uda", "pośladki"],
  single_leg_slider_leg_curl: ["dwugłowe uda", "pośladki"],
  bilateral_swiss_ball_leg_curl: ["dwugłowe uda", "pośladki"],
  single_leg_swiss_ball_leg_curl: ["dwugłowe uda", "pośladki"],
  prone_band_leg_curl: ["dwugłowe uda"],
  bridge_walkout: ["dwugłowe uda", "pośladki"],
  long_lever_hamstring_iso: ["dwugłowe uda", "pośladki"],
  single_leg_long_lever_hamstring_iso: ["dwugłowe uda", "pośladki"],
  heel_dig_hamstring_iso_30: ["dwugłowe uda"],
  heel_dig_hamstring_iso_90: ["dwugłowe uda"],
  oscillatory_long_lever_bridge: ["dwugłowe uda", "pośladki"],
  hamstring_45_back_extension: ["dwugłowe uda", "pośladki", "grzbiet"],
  standing_calf_raise: ["łydki"],
  seated_soleus_raise: ["płaszczkowaty", "łydki"],
  tibialis_raise: ["piszczelowy przedni"],
  push_up: ["klatka piersiowa", "triceps", "core"],
  dumbbell_bench_press: ["klatka piersiowa", "triceps", "przedni bark"],
  dumbbell_overhead_press: ["barki", "triceps", "core"],
  pike_push_up: ["barki", "triceps", "core"],
  bodyweight_row: ["grzbiet", "tylny bark", "biceps"],
  one_arm_dumbbell_row: ["grzbiet", "biceps", "tylny bark"],
  lat_pulldown: ["najszerszy grzbietu", "biceps"],
  pull_up: ["najszerszy grzbietu", "biceps"],
  face_pull_band: ["tylny bark", "łopatka", "rotatory"],
  pallof_press: ["core", "skośne brzucha"],
  plank: ["core", "prosty brzucha"],
  dead_bug: ["core", "zginacze biodra"],
  side_plank: ["skośne brzucha", "pośladek średni"],
  copenhagen_plank: ["przywodziciele", "skośne brzucha"],
  adductor_bridge_squeeze: ["przywodziciele", "pośladki", "core"],
  bodyweight_march_hold: ["skośne brzucha", "zginacze biodra"],
  suitcase_carry: ["skośne brzucha", "chwyt", "pośladek średni"],
  farmer_carry: ["chwyt", "core", "górny grzbiet"],
  front_rack_carry: ["core", "górny grzbiet", "chwyt"],
  overhead_carry: ["barki", "core", "łopatka"],
};

const DETAIL_OVERRIDES: Record<
  string,
  {
    setup: string;
    prescription: string;
    rest: string;
    tempo: string;
    intensity: string;
  }
> = {
  goblet_squat: {
    setup: "Stań na szerokość bioder, trzymaj jeden hantel pionowo przed klatką i oprzyj łokcie blisko tułowia.",
    prescription: "3–4 × 6–10",
    rest: "75–120 s",
    tempo: "3-1-1-0",
    intensity: "RPE 7–8",
  },
  romanian_deadlift_db: {
    setup: "Stań wysoko z hantlami przy udach, lekko ugnij kolana i ustaw żebra nad miednicą.",
    prescription: "3–4 × 6–8",
    rest: "90–150 s",
    tempo: "3-1-1-0",
    intensity: "RPE 7–8",
  },
  hip_thrust: {
    setup: "Oprzyj łopatki o ławkę, stopy ustaw pod kolanami i ułóż sztangę w zgięciu bioder.",
    prescription: "3–5 × 5–8",
    rest: "90–150 s",
    tempo: "2-1-1-1",
    intensity: "RPE 7–8",
  },
  long_lever_hamstring_iso: {
    setup: "Połóż się na plecach, ustaw pięty dalej od bioder niż w zwykłym moście i palce skieruj do góry.",
    prescription: "2–4 × 20–30 s",
    rest: "45–75 s",
    tempo: "Izometria",
    intensity: "RPE 6–7",
  },
  seated_leg_curl: {
    setup: "Ustaw oparcie tak, żeby kolano zginało się w osi maszyny, a uda były stabilnie dociśnięte.",
    prescription: "3–4 × 8–12",
    rest: "60–90 s",
    tempo: "2-1-2-0",
    intensity: "RPE 7–8",
  },
  lying_leg_curl: {
    setup: "Połóż się na brzuchu, ustaw wałek nad piętami i dociśnij biodra do ławki maszyny.",
    prescription: "3–4 × 8–12",
    rest: "60–90 s",
    tempo: "2-1-2-0",
    intensity: "RPE 7–8",
  },
};

function levelLabel(exercise: ExerciseDefinition): string {
  if (!exercise.allowedForBeginner) return "Zaawansowany";
  if (exercise.requiredGymExperienceLevel === "intermediate") return "Średniozaawansowany";
  if (exercise.requiredGymExperienceLevel === "advanced") return "Zaawansowany";
  return "Początkujący";
}

function placeLabel(exercise: ExerciseDefinition): string {
  switch (exercise.spaceRequirement) {
    case "home_small":
      return "Dom";
    case "indoor_gym":
      return "Siłownia";
    case "open_field":
      return "Boisko / otwarta przestrzeń";
    case "pitch":
      return "Boisko";
    case "sprint_lane":
      return "Tor / pas sprintowy";
    default:
      return "Dowolne miejsce";
  }
}

function equipmentLabels(exercise: ExerciseDefinition): string[] {
  const specialist = specialistEquipmentForExercise(exercise);
  if (!specialist.length) return ["Masa ciała"];
  return specialist.map((id) => EQUIPMENT_LABELS.get(id) ?? id);
}

function equipmentFilterLabels(exercise: ExerciseDefinition): string[] {
  const labels = equipmentLabels(exercise);
  const set = new Set(labels);
  if (!labels.includes("Maszyna") && !labels.includes("Wyciąg")) set.add("Bez maszyny");
  return [...set];
}

export function isStrengthLibraryExercise(exercise: ExerciseDefinition): boolean {
  if (EXCLUDED_STRENGTH_LIBRARY_IDS.has(exercise.id)) return false;
  if (exercise.requiresBall) return false;
  if (exercise.family === "recovery" || exercise.category === "mobility" || exercise.category === "speed")
    return false;
  return exercise.allowedSessionCategories.some((category) =>
    STRENGTH_LIBRARY_SESSION_CATEGORIES.has(category),
  );
}

export function movementLabelForStrengthExercise(exercise: ExerciseDefinition): string {
  return MOVEMENT_OVERRIDES[exercise.id] ?? exercise.movementPattern;
}

export function musclesForStrengthExercise(exercise: ExerciseDefinition): string[] {
  return MUSCLE_OVERRIDES[exercise.id] ?? [movementLabelForStrengthExercise(exercise)];
}

function defaultPrescriptionFor(exercise: ExerciseDefinition): string {
  const movement = movementLabelForStrengthExercise(exercise);
  if (movement === "Hamstring isometric") return "2–4 × 15–30 s";
  if (movement === "Hamstring curl") return "2–4 × 4–8";
  if (movement === "Loaded carry") return "3–4 × 20–40 m lub 20–30 s";
  if (movement === "Power / plyometric") return "3–5 × 3–5";
  if (movement === "Calves / tibialis") return "2–4 × 10–20";
  if (movement.includes("core")) return "2–4 × 20–40 s lub 6–10 / stronę";
  if (movement.includes("pull") || movement.includes("push")) return "3–4 × 6–10";
  return "3–4 × 6–10";
}

function defaultRestFor(exercise: ExerciseDefinition): string {
  const movement = movementLabelForStrengthExercise(exercise);
  if (movement === "Loaded carry") return "60–90 s";
  if (movement === "Power / plyometric") return "75–120 s";
  if (movement === "Hamstring isometric") return "45–75 s";
  return "60–120 s";
}

function defaultTempoFor(exercise: ExerciseDefinition): string {
  const movement = movementLabelForStrengthExercise(exercise);
  if (movement === "Loaded carry") return "Równy marsz";
  if (movement === "Power / plyometric") return "Eksplozywnie";
  if (movement === "Hamstring isometric") return "Izometria";
  return "2-1-2-0";
}

function defaultIntensityFor(exercise: ExerciseDefinition): string {
  if (exercise.primaryAdaptation === "max_strength") return "RPE 7,5–8,5";
  if (exercise.category === "plyometric" || exercise.category === "power") return "Maksymalna jakość, pełna kontrola";
  if (exercise.category === "core" || exercise.category === "prehab") return "RPE 6–7";
  return "RPE 7–8";
}

function defaultSetupFor(exercise: ExerciseDefinition): string {
  const movement = movementLabelForStrengthExercise(exercise);
  if (movement === "Bilateral squat") return "Ustaw stopy pod biodrami lub minimalnie szerzej i przygotuj stabilny, napięty tułów.";
  if (movement === "Hip hinge / deadlift") return "Stań wysoko, lekko ugnij kolana i ustaw ciężar blisko środka stopy.";
  if (movement === "Loaded carry") return "Stań wysoko z napiętym tułowiem, zanim wykonasz pierwszy krok.";
  if (movement.includes("push")) return "Ustaw dłonie lub hantle tak, żeby bark mógł pracować bez bólu i bez ucieczki żeber.";
  if (movement.includes("pull")) return "Złap uchwyt stabilnie i ustaw łopatki przed pierwszym powtórzeniem.";
  if (movement === "Hamstring curl") return "Ustaw pięty albo poduszki tak, żeby od początku czuć pracę tylnej strony uda.";
  if (movement === "Hamstring isometric") return "Przyjmij pozycję, w której czujesz napięcie dwugłowych uda bez ostrego bólu.";
  return "Ustaw stabilną pozycję wyjściową i sprawdź, czy możesz utrzymać neutralny tułów.";
}

function detailFor(exercise: ExerciseDefinition) {
  return (
    DETAIL_OVERRIDES[exercise.id] ?? {
      setup: defaultSetupFor(exercise),
      prescription: defaultPrescriptionFor(exercise),
      rest: defaultRestFor(exercise),
      tempo: defaultTempoFor(exercise),
      intensity: defaultIntensityFor(exercise),
    }
  );
}

export function getStrengthLibraryExercises(): ExerciseDefinition[] {
  return getApprovedExerciseDefinitions()
    .filter(isStrengthLibraryExercise)
    .sort((a, b) => a.displayNamePl.localeCompare(b.displayNamePl, "pl"));
}

export function filterStrengthLibraryExercises(
  filters: StrengthLibraryFilters = {},
): ExerciseDefinition[] {
  const query = normalizeExerciseName(filters.query ?? "");
  return getStrengthLibraryExercises().filter((exercise) => {
    if (
      query &&
      ![exercise.displayNamePl, exercise.name, ...exercise.aliases]
        .map(normalizeExerciseName)
        .some((value) => value.includes(query))
    ) {
      return false;
    }
    if (filters.movement && movementLabelForStrengthExercise(exercise) !== filters.movement) return false;
    if (filters.muscle && !musclesForStrengthExercise(exercise).includes(filters.muscle)) return false;
    if (filters.equipment && !equipmentFilterLabels(exercise).includes(filters.equipment)) return false;
    if (filters.level && levelLabel(exercise) !== filters.level) return false;
    if (filters.place && placeLabel(exercise) !== filters.place) return false;
    return true;
  });
}

export function getStrengthLibraryFilterOptions(): StrengthLibraryFilterOptions {
  const exercises = getStrengthLibraryExercises();
  const build = (values: string[]) =>
    [...new Set(values)].sort((a, b) => a.localeCompare(b, "pl")).map((value) => ({ value, label: value }));
  return {
    movements: build(exercises.map(movementLabelForStrengthExercise)),
    muscles: build(exercises.flatMap(musclesForStrengthExercise)),
    equipment: build(exercises.flatMap(equipmentFilterLabels)),
    levels: build(exercises.map(levelLabel)),
    places: build(exercises.map(placeLabel)),
  };
}

export function buildStrengthLibraryTrainingExercise(exercise: ExerciseDefinition): TrainingExercise {
  const details = detailFor(exercise);
  const regression = exercise.regressionIds[0]
    ? getExerciseDefinition(exercise.regressionIds[0])?.displayNamePl
    : undefined;
  const progression = exercise.progressionIds[0]
    ? getExerciseDefinition(exercise.progressionIds[0])?.displayNamePl
    : undefined;
  const preview = hydrateTrainingExerciseFromDefinition({
    id: `library-${exercise.id}`,
    exerciseId: exercise.id,
    name: exercise.displayNamePl,
    purpose: exercise.objective,
    setup: details.setup,
    displayPrescription: details.prescription,
    restAfterExercise: details.rest,
    tempo: details.tempo,
    loadTarget: details.intensity,
    equipment: equipmentLabels(exercise).join(", "),
    cue: exercise.coachingCues.slice(0, 3).join(". "),
    technique: exercise.instructionsPl?.join(" "),
    regression,
    progression,
    commonMistake: exercise.commonErrors.slice(0, 2).join(". "),
    contraindications:
      exercise.injuryCautions[0] ??
      "Przerwij ćwiczenie, jeśli pojawia się ból albo tracisz kontrolę ruchu.",
    visualId: exercise.id,
    instructionSteps:
      exercise.instructionsPl?.map((description, index) => ({
        title: `Krok ${index + 1}`,
        description,
        visualId: exercise.id,
      })) ?? [],
  });
  return preview;
}
