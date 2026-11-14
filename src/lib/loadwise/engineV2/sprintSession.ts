import type { Profile } from "../types";
import { resolveEquipmentId } from "../exerciseLibrary";
import { hasDeclaredWall } from "./support";
import { accelerationDistance } from "./preparation";
import { trainingTier, type Dose, type EngineSession, type ExerciseDecision } from "./model";
import { updateSprintTotals } from "./sprintRecipe";

/** Conservative coaching templates. Rounds are a product choice, not a proven optimal dose. */
export function buildSprintSession(
  p: Profile,
  phase: EngineSession["phase"],
  eligible: (id: string) => boolean,
): EngineSession | null {
  const space = p.trainingMethodPreferences?.spaceLengthM;
  if (
    !p.hasSprintSpace ||
    !Number.isFinite(p.age) ||
    p.age < 13 ||
    p.painInjury ||
    p.seasonPhase === "return_injury" ||
    (space !== undefined && (!Number.isFinite(space) || space < 20))
  )
    return null;
  const prepared = p.age >= 18 && ["intermediate", "advanced", "elite"].includes(p.level);
  const reduced =
    phase === "deload" ||
    p.seasonPhase === "transition" ||
    p.goal === "return" ||
    p.secondaryLimiter === "fatigue";
  const coached =
    p.age >= 18 &&
    ["advanced", "elite"].includes(p.level) &&
    p.movementCompetence === "high" &&
    ["some", "full"].includes(p.supervisionLevel ?? "none");
  const requested = p.trainingMethodPreferences?.sprintFocus ?? "auto";
  const flying =
    coached &&
    !reduced &&
    phase === "development" &&
    (space ?? 0) >= 50 &&
    (requested === "max_velocity" || (requested === "auto" && p.goal === "speed")) &&
    eligible("flying_sprint");
  let goal: NonNullable<EngineSession["sprintGoal"]> = flying ? "max_velocity" : "acceleration";
  let mainId = flying ? "flying_sprint" : "free_acceleration_sprint";
  // Curves and changes of direction require a pitch and competent control, not just a straight lane.
  if (
    !reduced &&
    p.hasPitch &&
    p.age >= 16 &&
    p.level !== "beginner" &&
    p.movementCompetence === "high" &&
    (space ?? 0) >= 40
  ) {
    if (requested === "curve") {
      goal = "curve";
      mainId = "football_curved_sprint";
    } else if (requested === "braking") {
      goal = "braking";
      mainId = "accel_decel_reaccel";
    } else if (requested === "planned_cod" || (requested === "auto" && p.goal === "agility")) {
      goal = "planned_cod";
      mainId = "planned_cut";
    }
  }
  if (!eligible(mainId)) return null;
  const exercises: ExerciseDecision[] = [];
  const add = (exerciseId: string, role: ExerciseDecision["role"], dose: Dose, reason: string) => {
    if (eligible(exerciseId)) exercises.push({ exerciseId, role, dose, reason });
  };
  add(
    "sprint_ramp_warmup",
    "warmup",
    {
      sets: 1,
      seconds: 360,
      restSeconds: 30,
      intent: "easy",
      speedStage: "preparation",
    },
    "2 min lekkiego truchtu, następnie ruchy bioder i kostek oraz krótkie skipy. Przebieżki są osobnym krokiem po drillach.",
  );
  const candidates = flying
    ? ["ankling", "low_dribble", "high_dribble", "a_march", "a_skip"]
    : hasDeclaredWall(p)
      ? ["a_march", "wall_single_switch", "a_skip", "ankling", "low_dribble"]
      : ["a_march", "a_skip", "low_dribble", "ankling", "c_skip"];
  const drills = candidates.filter(eligible).slice(0, 3);
  if (drills.length !== 3 || !exercises.length) return null;
  const rounds = reduced || p.age < 16 || p.level === "beginner" ? 2 : 3;
  for (const exerciseId of drills)
    add(
      exerciseId,
      "warmup",
      {
        sets: rounds,
        seconds: 12,
        restSeconds: 30,
        intent: "controlled",
        speedStage: "technical",
        circuit: { id: "sprint-technique-v1", roundRestSeconds: 60 },
      },
      `${rounds} rundy tych samych trzech ćwiczeń w kolejności 1 → 2 → 3. Każde 12 s, 30 s na zmianę ćwiczenia i 60 s po rundzie. Kontrola przed tempem.`,
    );
  const distance = reduced ? 10 : accelerationDistance(p);
  add(
    "progressive_build_up_sprint",
    "warmup",
    {
      sets: 2,
      reps: 1,
      distanceM: distance,
      runOutM: distance,
      fastMetres: distance,
      restSeconds: 60,
      postRestSeconds: 90,
      intent: "controlled",
      speedStage: "buildup",
    },
    "Dwie przebieżki: pierwsza swobodna, druga szybsza, nadal poniżej maksimum. Pozostaw wolną strefę wyhamowania.",
  );
  const equipment = [...p.equipment, ...(p.trainingMethodPreferences?.declaredEquipment ?? [])]
    .filter((value) => !(p.unavailableEquipmentIds ?? []).includes(value))
    .map((value) => resolveEquipmentId(value) ?? value);
  if (coached && !reduced && goal === "acceleration" && equipment.includes("sled"))
    add(
      "resisted_sled_acceleration",
      "speed",
      {
        sets: 2,
        reps: 1,
        distanceM: 10,
        runOutM: 10,
        fastMetres: 10,
        restSeconds: 120,
        intent: "explosive",
        speedStage: "resisted",
      },
      "Tylko zadeklarowane sanie i nadzorowana technika. Dobierz opór do dynamicznych kroków; nie zgaduj procentu masy ciała.",
    );
  // Small quality jump block precedes the main runs, while coordination is still fresh.
  if (p.goal === "power" && prepared && !reduced)
    add(
      "broad_jump",
      "power",
      {
        sets: 2,
        reps: 3,
        contactsPerRep: 1,
        restSeconds: 90,
        intent: "explosive",
        speedStage: "addition",
      },
      "Trzy osobne skoki z zatrzymanym lądowaniem. Odpocznij i ustaw się przed każdym skokiem; przerwij przy utracie kontroli.",
    );
  const directional = goal === "curve" || goal === "planned_cod";
  add(
    mainId,
    "speed",
    {
      sets: reduced ? (prepared ? 3 : 2) : directional ? 2 : flying ? 4 : prepared ? 6 : 4,
      reps: 1,
      distanceM: flying ? 10 : directional || goal === "braking" ? 10 : distance,
      ...(flying ? { runInM: 20 } : {}),
      ...(directional ? { perSide: true } : {}),
      runOutM: flying ? 20 : distance,
      // The full travelled path is counted: 5 + 5 m for a planned cut/reacceleration.
      restSeconds: flying ? 150 : directional || goal === "braking" ? 120 : 90,
      intent: "explosive",
      speedStage: "main",
    },
    flying
      ? "20 m płynnego nabiegu + 10 m lotnego biegu + 20 m stopniowego wyhamowania. Pełny odpoczynek, bez wymuszania kroku."
      : goal === "planned_cod"
        ? "5 m do znacznika, zaplanowany łagodny zwrot i 5 m wyjścia. Najpierw lewa, potem prawa; kierunek znany z góry. To nie test reakcji."
        : goal === "braking"
          ? "5 m kontrolowanego przyspieszenia, spokojne obniżenie pozycji i 5 m ponownego przyspieszenia. Nie wymuszaj zatrzymania na jednym kroku."
          : goal === "curve"
            ? "10 m po szerokim, równym łuku, osobno w lewo i w prawo. Zacznij kontrolowanie; nie zacieśniaj łuku kosztem równowagi."
            : `Każdy odcinek ${distance} m jakościowo, z wolną strefą ${distance} m do wyhamowania. Nie skracaj przerwy; zakończ przy utracie techniki.`,
  );
  if (prepared && !reduced && p.goal !== "power" && goal !== "planned_cod" && goal !== "braking")
    add(
      "progressive_run_three_step_stop",
      "landing",
      {
        sets: 2,
        reps: 1,
        distanceM: 10,
        runOutM: 10,
        fastMetres: 10,
        restSeconds: 90,
        intent: "controlled",
        speedStage: "addition",
      },
      "Dwa kontrolowane nabiegi po 10 m. Rozłóż hamowanie na kolejne kroki; trzy kroki są wskazówką, nie obowiązkowym testem zatrzymania.",
    );
  add(
    "sprint_cooldown_walk",
    "warmup",
    {
      sets: 1,
      seconds: 120,
      restSeconds: 0,
      intent: "easy",
      speedStage: "cooldown",
    },
    "Dwie minuty swobodnego marszu i uspokojenia oddechu.",
  );
  return updateSprintTotals({
    sprintRecipeVersion: 1,
    sprintGoal: goal,
    roles: ["speed"],
    tier: trainingTier(p),
    phase,
    exercises,
    missing: [],
    highLower: true,
    minutes: 0,
    sprintMetres: 0,
  });
}
