import type { Profile } from "../types";
import { resolveEquipmentId } from "../exerciseLibrary";
import { hasDeclaredWall } from "./support";
import { hasDeclaredPartner } from "./placeRequirements";
import { accelerationDistance } from "./preparation";
import { trainingTier, type Dose, type EngineSession, type ExerciseDecision } from "./model";
import { sprintDrillInstruction, updateSprintTotals } from "./sprintRecipe";
import {
  DRILL_SETS,
  MAIN_VARIANTS,
  rotate,
  type SprintEnv,
  type SprintHistory,
} from "./sprintCatalog";
import type { SprintGoal, SprintVariantRef } from "./model";

export interface SprintSessionContext {
  history?: SprintHistory;
  force?: SprintVariantRef;
  preMatch?: boolean;
  /**
   * Known landings of the jump work already in this week (gym sessions and earlier sprint
   * blocks). A plyometric block is added only while the weekly budget has room for it.
   */
  weekLandings?: number;
}

/** Weekly landing budget shared with the gym (see gymProgression: 48 for 16–17, 60 for adults). */
const WEEKLY_LANDING_LIMIT = (age: number) => (age < 18 ? 48 : 60);
const BROAD_JUMP_CONTACTS = 2 * 3;

type Block = { code: string; reason: string };
const GOAL_NAMES: Record<SprintGoal, string> = {
  acceleration: "przyspieszenie",
  max_velocity: "lotny sprint (max velocity)",
  curve: "łuki",
  braking: "hamowanie",
  planned_cod: "zmiana kierunku",
  reactive: "reakcja",
};
/** Weights of the automatic rotation per cycle goal; only qualified goals take part. */
const AUTO_WEIGHTS: Partial<Record<Profile["goal"], Partial<Record<SprintGoal, number>>>> = {
  speed: { max_velocity: 2, acceleration: 1 },
  agility: { planned_cod: 3, braking: 1, curve: 1, reactive: 1 },
};

/** Conservative coaching templates. Rounds are a product choice, not a proven optimal dose. */
export function buildSprintSession(
  p: Profile,
  phase: EngineSession["phase"],
  eligible: (id: string) => boolean,
  context: SprintSessionContext = {},
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
    context.preMatch === true ||
    phase === "deload" ||
    p.seasonPhase === "transition" ||
    p.goal === "return" ||
    p.secondaryLimiter === "fatigue";
  const coached =
    p.age >= 18 &&
    ["advanced", "elite"].includes(p.level) &&
    p.movementCompetence === "high" &&
    ["some", "full"].includes(p.supervisionLevel ?? "none");
  const focus = p.trainingMethodPreferences?.sprintFocus ?? "auto";
  const partner = hasDeclaredPartner(p);
  const distance = reduced ? 10 : accelerationDistance(p);
  const envFor = (goalSpace: number): SprintEnv => ({
    age: p.age,
    level: p.level,
    prepared,
    coached,
    reduced,
    hasPitch: !!p.hasPitch,
    space: goalSpace,
    distance,
    partner,
    phase,
  });
  /** Why a goal cannot be trained now, in priority order; null when it can. */
  const block = (goal: SprintGoal): Block | null => {
    if (goal === "acceleration") return null;
    if (reduced)
      return {
        code: "REDUCED_WEEK",
        reason:
          "lżejszy tydzień, wariant przedmeczowy lub powrót: bez pracy o najwyższej prędkości i zwrotach",
      };
    if (goal === "max_velocity") {
      if (!coached)
        return {
          code: "NOT_COACHED",
          reason:
            "lotny sprint wymaga dorosłego, zaawansowanego zawodnika z wysoką kontrolą ruchu i nadzorem",
        };
      if (phase !== "development")
        return {
          code: "PHASE",
          reason: `lotny sprint jest planowany w fazie rozwoju, nie w fazie „${phase}”`,
        };
      if (space === undefined)
        return {
          code: "SPACE_UNDECLARED",
          reason:
            "nie zadeklarowano długości prostej; lotny sprint wymaga co najmniej 50 m (20 m nabiegu, 10 m lotnego, 20 m wyhamowania). Podaj długość w ustawieniach sprintu",
        };
      if (space < 50)
        return {
          code: "SPACE_SHORT",
          reason: `zadeklarowana prosta ma ${space} m, a lotny sprint wymaga co najmniej 50 m`,
        };
      if (!eligible("flying_sprint"))
        return {
          code: "NOT_ELIGIBLE",
          reason: "lotny sprint nie jest dopuszczony dla tego profilu",
        };
      return null;
    }
    if (!p.hasPitch)
      return { code: "NO_PITCH", reason: "łuki, hamowanie i zmiany kierunku wymagają boiska" };
    if (p.age < 16 || p.level === "beginner")
      return {
        code: "LEVEL",
        reason:
          "łuki, hamowanie i zmiany kierunku wymagają co najmniej 16 lat i poziomu powyżej początkującego",
      };
    if (p.movementCompetence !== "high")
      return {
        code: "COMPETENCE",
        reason: "to zadanie wymaga zadeklarowanej wysokiej kontroli ruchu",
      };
    if (space === undefined)
      return {
        code: "SPACE_UNDECLARED",
        reason:
          "nie zadeklarowano długości prostej; to zadanie wymaga co najmniej 40 m. Podaj długość w ustawieniach sprintu",
      };
    if (space < 40)
      return {
        code: "SPACE_SHORT",
        reason: `zadeklarowana prosta ma ${space} m, a to zadanie wymaga co najmniej 40 m`,
      };
    if (goal === "reactive" && !partner)
      return {
        code: "NO_PARTNER",
        reason: "trening reakcji wymaga partnera dającego sygnał w trakcie biegu",
      };
    return null;
  };
  const poolFor = (goal: SprintGoal) =>
    MAIN_VARIANTS.filter(
      (v) =>
        v.goal === goal &&
        v.qualifies(envFor(space ?? 0)) &&
        eligible(v.exerciseId) &&
        (!reduced || v.simple || goal !== "acceleration"),
    );
  // What was asked for: the player's explicit choice, else the cycle goal (auto rotation).
  const explicit: SprintGoal | null = focus === "auto" ? null : focus;
  const weights = AUTO_WEIGHTS[p.goal];
  let requestedGoal: SprintGoal = explicit ?? "acceleration";
  let rotationReason: string | null = null;
  if (!explicit && weights) {
    // Automatic rotation across the cycle goal's sprint tasks: the qualified goal that is most
    // behind its share in the recent history is next; ties follow the weights.
    const recent = history.slice(-6);
    const feasible = (Object.keys(weights) as SprintGoal[]).filter(
      (g) => !block(g) && poolFor(g).length > 0,
    );
    const total = feasible.reduce((n, g) => n + (weights[g] ?? 0), 0);
    const share = (g: SprintGoal) => (weights[g] ?? 0) / (total || 1);
    const used = (g: SprintGoal) =>
      recent.length ? recent.filter((h) => h.goal === g).length / recent.length : 0;
    const ranked = [...feasible].sort(
      (a, b) => share(b) - used(b) - (share(a) - used(a)) || (weights[b] ?? 0) - (weights[a] ?? 0),
    );
    // The goal of the cycle leads while it is qualified; when it is not, say so below.
    const lead = (Object.keys(weights) as SprintGoal[]).sort(
      (a, b) => (weights[b] ?? 0) - (weights[a] ?? 0),
    )[0];
    requestedGoal = lead;
    // A cycle goal that cannot be trained now is not rotated away silently: it stays the
    // requested goal and the block below records why an alternative was used.
    if (ranked.length && !block(lead) && poolFor(lead).length > 0) {
      if (ranked[0] !== lead || feasible.length > 1)
        rotationReason = `rotacja celu ${p.goal === "speed" ? "szybkości" : "zwinności"}: ostatnie sesje ${
          recent.length ? recent.map((h) => GOAL_NAMES[h.goal]).join(", ") : "brak"
        } → teraz ${GOAL_NAMES[ranked[0]]}`;
      requestedGoal = ranked[0];
    }
  }
  // The requested goal, or the first alternative that is qualified; the reason is always kept.
  let goal: SprintGoal = requestedGoal;
  let goalChange: Block | null = null;
  const blocked = block(requestedGoal);
  if (blocked || poolFor(requestedGoal).length === 0) {
    goalChange = blocked ?? {
      code: "NO_QUALIFIED_VARIANT",
      reason: `brak dopuszczonego wariantu zadania „${GOAL_NAMES[requestedGoal]}” dla tego profilu i sprzętu`,
    };
    goal = "acceleration";
  }
  const env = envFor(space ?? 0);
  // Qualified variants of this goal, then a deterministic rotation against the saved history.
  const pool = poolFor(goal);
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
    (d) =>
      d.groups.includes(group) &&
      (!d.wall || hasWall) &&
      (!d.spaceM || env.space >= d.spaceM) &&
      (!d.qualifies || d.qualifies(env)) &&
      d.drills.every(eligible),
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
  const rounds = reduced || p.level === "beginner" ? 2 : 3;
  for (const exerciseId of drills)
    add(
      exerciseId,
      "warmup",
      {
        sets: rounds,
        seconds: 12,
        ...(exerciseId === "dribble_to_sprint_transition"
          ? {
              seconds: undefined,
              reps: 1,
              distanceM: 20,
              fastMetres: 10,
              runOutM: 10,
            }
          : {}),
        restSeconds: 30,
        intent: "controlled",
        speedStage: "technical",
        circuit: { id: "sprint-technique-v1", roundRestSeconds: 60 },
      },
      exerciseId === "dribble_to_sprint_transition"
        ? "10 m niskiego drobienia, płynnie 10 m przyspieszenia i wolna strefa 10 m do wyhamowania. Jedna próba w każdej rundzie; 30 s na zmianę ćwiczenia i 60 s po rundzie."
        : sprintDrillInstruction(rounds),
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
  const sled = coached && !reduced && goal === "acceleration" && equipment.includes("sled");
  if (sled)
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
  // Library-only resisted march: acceleration posture against a light, steady band held by a
  // partner. Needs the declared band, a partner and supervision (checked by the library gate);
  // never together with the sled and never in a lighter week.
  const resistedMarch =
    !sled &&
    !reduced &&
    goal === "acceleration" &&
    prepared &&
    partner &&
    eligible("resisted_a_march");
  if (resistedMarch)
    add(
      "resisted_a_march",
      "speed",
      {
        sets: 2,
        seconds: 10,
        restSeconds: 90,
        intent: "controlled",
        speedStage: "resisted",
      },
      "Marsz A z lekkim, stałym oporem gumy trzymanej przez partnera; krótko i technicznie, bez szarpania.",
    );
  // A plyometric block follows the session's task and the week's total landings (gym included),
  // not only the player's goal: horizontal jumps support an acceleration session of an explosive
  // goal, are skipped when the week has no landing room, and are not repeated back to back.
  const weekLandings = context.weekLandings ?? 0;
  const landingRoom = WEEKLY_LANDING_LIMIT(p.age) - weekLandings;
  const explosiveGoal = ["power", "speed"].includes(p.goal);
  const lastPlyo = history.at(-1)?.plyometric ?? null;
  let plyometric: string | null = null;
  let plyoNote: string | null = null;
  if (prepared && !reduced && explosiveGoal && goal === "acceleration" && eligible("broad_jump")) {
    if (landingRoom < BROAD_JUMP_CONTACTS)
      plyoNote = `skoki w dal pominięte: w tym tygodniu jest już ${weekLandings} znanych lądowań (limit ${WEEKLY_LANDING_LIMIT(p.age)})`;
    else if (lastPlyo === "broad_jump" && p.goal !== "power")
      plyoNote = "skoki w dal pominięte: były w poprzedniej sesji sprintu";
    else plyometric = "broad_jump";
  }
  if (plyometric)
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
    !plyometric &&
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
      plyometric,
      ...(requestedGoal !== goal ? { requestedGoal } : {}),
      ...(goalChange
        ? {
            goalChange: {
              code: goalChange.code,
              reason: `Zamiast „${GOAL_NAMES[requestedGoal]}” wybrano „${GOAL_NAMES[goal]}”: ${goalChange.reason}.`,
            },
          }
        : {}),
      why: [
        ...(goalChange
          ? [
              `zamiast „${GOAL_NAMES[requestedGoal]}” wybrano „${GOAL_NAMES[goal]}”: ${goalChange.reason}`,
            ]
          : []),
        ...(rotationReason ? [rotationReason] : []),
        ...(resistedMarch ? ["marsz A z oporem: zadeklarowana guma, partner i nadzór"] : []),
        ...(plyometric
          ? ["skoki w dal: cel sesji, cel cyklu i miejsce w tygodniowym limicie lądowań"]
          : []),
        ...(plyoNote ? [plyoNote] : []),
        ...(context.preMatch ? ["MD-2: skrócony wariant przyspieszenia przed meczem"] : []),
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
