import type { Dose, SprintGoal, SprintVariantRef } from "./model";

/**
 * Qualified sprint templates. A variant changes the actual exercise or its meaningful parameters
 * (start position, distance, run-in, direction handling); renaming never creates a variant.
 * Selection is deterministic at generation time and stored with the session, so opening,
 * refreshing or syncing never changes a saved prescription.
 */
export interface SprintEnv {
  age: number;
  level: string;
  prepared: boolean;
  coached: boolean;
  reduced: boolean;
  hasPitch: boolean;
  space: number;
  distance: number;
  partner: boolean;
  phase: string;
}

interface MainVariant {
  id: string;
  goal: SprintGoal;
  exerciseId: string;
  /** Simplest variants stay available in a lighter week or a reduced route. */
  simple?: boolean;
  qualifies: (env: SprintEnv) => boolean;
  dose: (env: SprintEnv) => Dose;
  /** Short instruction: set-up, what to do, when to stop. */
  instruction: (env: SprintEnv) => string;
}

const sets = (env: SprintEnv, full: number, light = 2) =>
  env.reduced ? (env.prepared ? 3 : light) : full;
const adult = (env: SprintEnv) => env.age >= 16 && env.level !== "beginner";
const stop = "Zakończ serię przy utracie techniki lub tempa; nie skracaj przerwy.";

const startVariant = (
  id: string,
  exerciseId: string,
  distanceM: (env: SprintEnv) => number,
  instruction: string,
  qualifies: MainVariant["qualifies"] = () => true,
  simple = false,
): MainVariant => ({
  id,
  goal: "acceleration",
  exerciseId,
  simple,
  qualifies,
  dose: (env) => ({
    sets: sets(env, env.prepared ? 6 : 4),
    reps: 1,
    distanceM: distanceM(env),
    runOutM: distanceM(env),
    restSeconds: distanceM(env) >= 20 ? 150 : 90,
    intent: "explosive",
    speedStage: "main",
    ...(exerciseId === "dribble_to_sprint_transition"
      ? { distanceM: 10, runInM: 10, runOutM: 10 }
      : {}),
  }),
  instruction: (env) =>
    exerciseId === "dribble_to_sprint_transition"
      ? `10 m niskiego drobienia, płynnie 10 m przyspieszenia, następnie wolna strefa 10 m do wyhamowania. ${stop}`
      : `${instruction} Odcinek ${distanceM(env)} m z wolną strefą ${distanceM(env)} m do wyhamowania. ${stop}`,
});

export const MAIN_VARIANTS: readonly MainVariant[] = [
  // Acceleration: first steps, short starts from different positions, start from a jog, lateral start.
  startVariant(
    "accel_free",
    "free_acceleration_sprint",
    (e) => e.distance,
    "Start z naturalnej pozycji; pchaj podłoże, długość kroku zwiększaj stopniowo, tułów przechylony.",
    () => true,
    true,
  ),
  startVariant(
    "accel_half_kneeling",
    "half_kneeling_start",
    () => 10,
    "Start z półklęku: pochyl tułów, pchnij podłoże i wyjdź niskim, krótkim krokiem.",
    () => true,
    true,
  ),
  startVariant(
    "accel_falling",
    "falling_start",
    () => 10,
    "Start z upadku: z pozycji stojącej pozwól ciału przechylić się do przodu, dopiero potem wyjdź pierwszym krokiem.",
    () => true,
    true,
  ),
  startVariant(
    "accel_split_stance",
    "split_stance_start",
    () => 10,
    "Start z pozycji wykrocznej: ciężar na nodze z przodu, ręce w kontrze, mocne pchnięcie.",
    (e) => e.age >= 14,
  ),
  startVariant(
    "accel_from_jog",
    "dribble_to_sprint_transition",
    (e) => e.distance,
    "Zacznij od krótkiego drobienia, przejdź płynnie w przyspieszenie; bez szarpnięcia na starcie.",
    (e) => e.age >= 14 && e.level !== "beginner" && !e.reduced && e.space >= 30,
  ),
  {
    id: "accel_lateral",
    goal: "acceleration",
    exerciseId: "lateral_start_acceleration",
    qualifies: (e) => adult(e) && !e.reduced && e.hasPitch,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 10,
      runOutM: 10,
      perSide: true,
      restSeconds: 90,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      `Start z ustawienia bokiem do kierunku biegu, osobno na każdą stronę; 10 m, wolna strefa 10 m. ${stop}`,
  },
  // Maximum velocity: smooth run-in, a clearly marked flying section and a free run-out.
  {
    id: "mv_flying_20_10",
    goal: "max_velocity",
    exerciseId: "flying_sprint",
    qualifies: () => true,
    dose: () => ({
      sets: 4,
      reps: 1,
      distanceM: 10,
      runInM: 20,
      runOutM: 20,
      restSeconds: 240,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "20 m płynnego nabiegu, 10 m lotnego biegu i 20 m stopniowego wyhamowania. Co najmniej 4 min przerwy; wydłuż ją, jeśli nie jesteś gotowy. Nabieg 20 m to ekspozycja na szybki bieg, nie pomiar osiągniętej prędkości maksymalnej.",
  },
  {
    id: "mv_flying_30_10",
    goal: "max_velocity",
    exerciseId: "flying_sprint",
    qualifies: (e) => e.space >= 60,
    dose: () => ({
      sets: 3,
      reps: 1,
      distanceM: 10,
      runInM: 30,
      runOutM: 20,
      restSeconds: 240,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "30 m płynnego nabiegu, 10 m lotnego biegu i 20 m wyhamowania; wymaga co najmniej 60 m wolnej prostej. Co najmniej 4 min przerwy; wydłuż ją, jeśli nie jesteś gotowy. Osiągnięcie Vmax nie jest potwierdzane samą długością nabiegu.",
  },
  // Rhythm run between flat markers (library: wicket_run). Distance and runs stay inside the
  // library's default prescription (10–20 m, 2–4 runs); like every task of the max-velocity goal
  // it keeps the full 4 min recovery (longer than the library's generic range, never shorter).
  {
    id: "mv_wicket_run",
    goal: "max_velocity",
    exerciseId: "wicket_run",
    qualifies: (e) => e.coached && e.space >= 40 && !e.reduced,
    dose: () => ({
      sets: 3,
      reps: 1,
      distanceM: 15,
      runInM: 15,
      runOutM: 15,
      restSeconds: 240,
      intent: "controlled",
      speedStage: "main",
    }),
    instruction: () =>
      "Z trenerem ustaw 4–6 płaskich znaczników w Twoim rozstawie, z 15 m wolnego nabiegu i 15 m wybiegu. Przebiegnij rytmicznie między znacznikami bez sięgania stopą; to praca nad rytmem, nie bieg maksymalny. Zakończ serię przy utracie rytmu; nie skracaj przerwy.",
  },
  // Curve: both directions, wide and controlled.
  {
    id: "curve_wide_10",
    goal: "curve",
    exerciseId: "football_curved_sprint",
    qualifies: () => true,
    dose: (e) => ({
      sets: e.reduced ? 1 : 2,
      reps: 1,
      distanceM: 10,
      runOutM: 10,
      perSide: true,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "10 m po szerokim, równym łuku, osobno w lewo i w prawo. Zacznij kontrolowanie; nie zacieśniaj łuku kosztem równowagi.",
  },
  {
    id: "curve_wide_15",
    goal: "curve",
    exerciseId: "football_curved_sprint",
    qualifies: (e) => e.coached && e.space >= 50,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 15,
      runOutM: 15,
      perSide: true,
      restSeconds: 150,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "15 m po szerokim łuku w obie strony, wejście i wyjście kontrolowane. Przerwij przy utracie równowagi.",
  },
  // Braking: controlled entry speed, predictable stopping zone.
  {
    id: "brake_accel_decel",
    goal: "braking",
    exerciseId: "accel_decel_reaccel",
    qualifies: () => true,
    dose: () => ({
      sets: 6,
      reps: 1,
      distanceM: 10,
      runOutM: 10,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "5 m kontrolowanego przyspieszenia, spokojne obniżenie pozycji i 5 m ponownego przyspieszenia. Nie wymuszaj zatrzymania na jednym kroku.",
  },
  {
    id: "brake_progressive_5_10_15",
    goal: "braking",
    exerciseId: "progressive_deceleration_5_10_15",
    qualifies: (e) => e.age >= 14,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 15,
      fastMetres: 30,
      sequence: [5, 10, 15].map((distanceM) => ({
        distanceM,
        runOutM: 15,
        instruction: `${distanceM} m kontrolowanego nabiegu, następnie stopniowe hamowanie w wolnej strefie 15 m. Zakończ przy utracie kontroli.`,
      })),
      runOutM: 15,
      restSeconds: 120,
      intent: "controlled",
      speedStage: "main",
    }),
    instruction: () =>
      "Trzy nabiegi 5, 10 i 15 m z kontrolowanym hamowaniem do wyznaczonej strefy; prędkość wejścia rośnie stopniowo. Przerwij, gdy tracisz kontrolę.",
  },
  {
    id: "brake_two_step_stop",
    goal: "braking",
    exerciseId: "run_two_step_stop",
    qualifies: (e) => e.age >= 14 && e.level !== "beginner",
    dose: () => ({
      sets: 4,
      reps: 1,
      distanceM: 10,
      fastMetres: 10,
      runOutM: 5,
      restSeconds: 90,
      intent: "controlled",
      speedStage: "main",
    }),
    instruction: () =>
      "10 m kontrolowanego biegu i zatrzymanie w dwóch krokach w oznaczonej strefie; utrzymaj pozycję 2 s. Liczba kroków nie jest celem kosztem kontroli.",
  },
  {
    id: "brake_lateral_exit",
    goal: "braking",
    exerciseId: "deceleration_lateral_exit",
    qualifies: (e) => adult(e) && !e.reduced && e.hasPitch,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 10,
      fastMetres: 10,
      runOutM: 5,
      perSide: true,
      restSeconds: 120,
      intent: "controlled",
      speedStage: "main",
    }),
    instruction: () =>
      "5 m kontrolowanego nabiegu, hamowanie i 5 m wyjścia w bok — łącznie 10 m, osobno na każdą stronę. Pozostaw 5 m wolnego wybiegu; zakończ przy utracie równowagi.",
  },
  // Planned change of direction: known geometry, both sides.
  {
    id: "cod_planned_cut",
    goal: "planned_cod",
    exerciseId: "planned_cut",
    qualifies: () => true,
    dose: (e) => ({
      sets: e.reduced ? (e.prepared ? 3 : 2) : 2,
      reps: 1,
      distanceM: 10,
      runOutM: 5,
      perSide: true,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "5 m do znacznika, zaplanowany łagodny zwrot i 5 m wyjścia. Najpierw lewa, potem prawa; kierunek znany z góry. To nie test reakcji.",
  },
  {
    id: "cod_cut_reaccelerate",
    goal: "planned_cod",
    exerciseId: "cut_and_reaccelerate",
    qualifies: (e) => adult(e) && !e.reduced,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 10,
      runOutM: 5,
      perSide: true,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "5 m, zaplanowane cięcie na znaczniku i ponowne przyspieszenie 5 m, osobno na każdą stronę. Kierunek znany z góry.",
  },
  {
    id: "cod_planned_505",
    goal: "planned_cod",
    exerciseId: "planned_505",
    qualifies: (e) => adult(e) && e.prepared && !e.reduced,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 10,
      runOutM: 5,
      perSide: true,
      restSeconds: 150,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "Zaplanowany układ 5-0-5 z hamowaniem i zwrotem o 180°, osobno na każdą stronę. To zadanie techniczne, nie pomiar reakcji.",
  },
  // Reactive agility: only with a real stimulus (a partner who signals during the run).
  {
    id: "react_turn_180_partner",
    goal: "reactive",
    exerciseId: "reactive_180_turn",
    qualifies: (e) => adult(e) && !e.reduced && e.hasPitch && e.partner,
    dose: () => ({
      sets: 4,
      reps: 1,
      distanceM: 10,
      fastMetres: 10,
      runOutM: 5,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "Partner daje sygnał (dźwięk lub gest) dopiero w trakcie biegu; kierunek zwrotu nie jest znany wcześniej. Znany kierunek nie jest treningiem reakcji.",
  },
  {
    id: "react_curve_partner",
    goal: "reactive",
    exerciseId: "reactive_curved_sprint",
    qualifies: (e) => adult(e) && !e.reduced && e.hasPitch && e.partner && e.space >= 40,
    dose: () => ({
      sets: 2,
      reps: 1,
      distanceM: 10,
      runOutM: 10,
      perSide: true,
      restSeconds: 120,
      intent: "explosive",
      speedStage: "main",
    }),
    instruction: () =>
      "Partner sygnalizuje w trakcie biegu stronę łuku (lewo lub prawo); nie ustalaj jej wcześniej. Bez partnera ten wariant się nie pojawia.",
  },
];

/** Three complementary drills per set; a session repeats exactly this triple in each round. */
interface DrillSet {
  spaceM?: number;
  id: string;
  groups: Array<"start" | "max_velocity" | "directional">;
  drills: [string, string, string];
  wall?: boolean;
  /** Level/age gate for drills that need more control than the basic sets. */
  qualifies?: (env: SprintEnv) => boolean;
  why: string;
}
export const DRILL_SETS: readonly DrillSet[] = [
  {
    id: "ds_start_basic",
    groups: ["start", "directional"],
    drills: ["a_march", "a_skip", "low_dribble"],
    why: "pozycja → rytm → szybkie stopy",
  },
  {
    id: "ds_start_wall",
    groups: ["start"],
    drills: ["a_march", "wall_single_switch", "a_skip"],
    wall: true,
    why: "pozycja → zmiana nogi przy ścianie → rytm",
  },
  {
    id: "ds_start_stiffness",
    groups: ["start", "directional"],
    drills: ["a_march", "ankling", "a_skip"],
    why: "pozycja → sprężystość stopy → rytm",
  },
  {
    id: "ds_start_cycle",
    groups: ["start", "directional"],
    drills: ["a_skip", "c_skip", "ankling"],
    why: "rytm → praca nogi pod ciałem → sprężystość stopy",
  },
  {
    id: "ds_start_transition",
    spaceM: 30,
    groups: ["start"],
    drills: ["a_skip", "low_dribble", "dribble_to_sprint_transition"],
    why: "rytm → szybkie stopy → przejście do biegu",
  },
  {
    id: "ds_start_bskip",
    groups: ["start", "directional"],
    drills: ["a_march", "b_skip", "low_dribble"],
    qualifies: (e) => e.age >= 16 && e.level !== "beginner",
    why: "pozycja → pazurzenie i cykl nogi (B skip) → szybkie stopy",
  },
  {
    id: "ds_mv_bskip",
    groups: ["max_velocity"],
    drills: ["a_skip", "b_skip", "ankling"],
    qualifies: (e) => e.age >= 16 && e.level !== "beginner",
    why: "rytm → pazurzenie i cykl nogi (B skip) → sprężystość",
  },
  {
    id: "ds_mv_basic",
    groups: ["max_velocity"],
    drills: ["ankling", "low_dribble", "high_dribble"],
    why: "sprężystość → szybkie stopy → wysoka częstotliwość",
  },
  {
    id: "ds_mv_cycle",
    groups: ["max_velocity"],
    drills: ["a_skip", "ankling", "c_skip"],
    why: "rytm → sprężystość → cykl nogi",
  },
  {
    id: "ds_mv_dribble",
    groups: ["max_velocity"],
    drills: ["a_march", "high_dribble", "ankling"],
    why: "pozycja → częstotliwość → sprężystość",
  },
];

/** Rotation: avoid the last used, then the least used, then catalogue order. */
export function rotate<T extends { id: string }>(
  pool: readonly T[],
  usedIds: readonly string[],
  simpleFirst: boolean,
): { item: T; reasons: string[] } | null {
  if (!pool.length) return null;
  const last = usedIds.at(-1);
  const count = (id: string) => usedIds.filter((u) => u === id).length;
  const ranked = pool
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(a.item.id === last && pool.length > 1) -
          Number(b.item.id === last && pool.length > 1) ||
        count(a.item.id) - count(b.item.id) ||
        a.index - b.index,
    );
  const top = ranked[0].item;
  const reasons: string[] = [];
  if (pool.length > 1)
    reasons.push(
      top.id !== last
        ? `rotacja: poprzednio ${last ?? "brak"}, teraz ${top.id}`
        : "jedyny kwalifikowany",
    );
  else reasons.push("jedyny kwalifikowany wariant");
  if (simpleFirst) reasons.push("prostszy wariant");
  return { item: top, reasons };
}

export const variantById = (id: string) => MAIN_VARIANTS.find((v) => v.id === id);
export const drillSetById = (id: string) => DRILL_SETS.find((s) => s.id === id);

export type SprintHistory = readonly SprintVariantRef[];
