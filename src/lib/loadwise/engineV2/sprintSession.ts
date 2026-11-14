import type { Profile } from "../types";
import { resolveEquipmentId } from "../exerciseLibrary";
import { hasDeclaredWall } from "./support";
import { accelerationDistance } from "./preparation";
import { trainingTier, type Dose, type EngineSession, type ExerciseDecision } from "./model";
import { updateSprintTotals } from "./sprintRecipe";
import {
  DRILL_SETS,
  MAIN_VARIANTS,
  rotate,
  type SprintEnv,
  type SprintHistory,
} from "./sprintCatalog";
import type { SprintGoal, SprintVariantRef } from "./model";

/** Conservative coaching templates. Rounds are a product choice, not a proven optimal dose. */
export function buildSprintSession(
  p: Profile,
  phase: EngineSession["phase"],
  eligible: (id: string) => boolean,
  context: { history?: SprintHistory; force?: SprintVariantRef } = {},
): EngineSession | null {
  const history = context.history ?? [];
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
  let goal: SprintGoal = flying ? "max_velocity" : "acceleration";
  const partner = (p.trainingMethodPreferences?.declaredEquipment ?? []).includes("partner");
  // Curves and changes of direction require a pitch and competent control, not just a straight lane.
  if (
    !reduced &&
    p.hasPitch &&
    p.age >= 16 &&
    p.level !== "beginner" &&
    p.movementCompetence === "high" &&
    (space ?? 0) >= 40
  ) {
    if (requested === "curve") goal = "curve";
    else if (requested === "braking") goal = "braking";
    else if (requested === "planned_cod" || (requested === "auto" && p.goal === "agility"))
      goal = "planned_cod";
    else if (requested === "reactive" && partner) goal = "reactive";
  }
  const distance = reduced ? 10 : accelerationDistance(p);
  const env: SprintEnv = {
    age: p.age,
    level: p.level,
    prepared,
    coached,
    reduced,
    hasPitch: !!p.hasPitch,
    space: space ?? (flying ? 50 : 0),
    distance,
    partner,
    phase,
  };
  // Qualified variants of this goal, then a deterministic rotation against the saved history.
  const pool = MAIN_VARIANTS.filter(
    (v) =>
      v.goal === goal &&
      v.qualifies(env) &&
      eligible(v.exerciseId) &&
      (!reduced || v.simple || goal !== "acceleration"),
  );
  const forced = context.force && pool.find((v) => v.id === context.force!.mainVariantId);
  const picked = forced
    ? { item: forced, reasons: ["ten sam wariant co w zapisanej sesji"] }
    : rotate(
        pool,
        history.filter((h) => h.goal === goal).map((h) => h.mainVariantId),
        reduced,
      );
  if (!picked) return null;
  const variant = picked.item;
  const mainId = variant.exerciseId;
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
  const hasWall = hasDeclaredWall(p);
  const group =
    goal === "acceleration" ? "start" : goal === "max_velocity" ? "max_velocity" : "directional";
  const sets = DRILL_SETS.filter(
    (d) => d.groups.includes(group) && (!d.wall || hasWall) && d.drills.every(eligible),
  ).sort((a, b) => Number(!!b.wall && hasWall) - Number(!!a.wall && hasWall));
  const forcedSet = context.force && sets.find((d) => d.id === context.force!.drillSetId);
  const chosenSet = forcedSet
    ? { item: forcedSet, reasons: ["ten sam zestaw co w zapisanej sesji"] }
    : rotate(
        sets,
        history.map((h) => h.drillSetId),
        false,
      );
  if (!chosenSet) return null;
  const drills = [...chosenSet.item.drills];
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
  add(mainId, "speed", variant.dose(env), variant.instruction(env));
  // A small addition is not repeated in consecutive sessions, and never when the main task is a
  // change of direction or braking; the athlete's last session decides.
  const lastAddition = history.at(-1)?.addition ?? null;
  const additionId =
    prepared &&
    !reduced &&
    p.goal !== "power" &&
    goal !== "planned_cod" &&
    goal !== "braking" &&
    goal !== "reactive" &&
    lastAddition !== "progressive_run_three_step_stop" &&
    eligible("progressive_run_three_step_stop")
      ? "progressive_run_three_step_stop"
      : null;
  if (additionId)
    add(
      additionId,
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
    sprintVariant: {
      goal,
      mainVariantId: variant.id,
      drillSetId: chosenSet.item.id,
      addition: additionId,
      why: [
        ...picked.reasons,
        `zestaw drilli ${chosenSet.item.id}: ${chosenSet.item.why}`,
        ...chosenSet.reasons,
      ],
    },
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
