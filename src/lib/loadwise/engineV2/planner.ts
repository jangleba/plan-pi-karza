import { sessionName, EXTERNAL_SESSION_NAMES } from "./sessionNames";
import { sprintChronology, fitSprintToBudget } from "./sprintRecipe";
import { attachCycle, cycleForWeek, cycleStartEffect } from "./cycle";
import { scheduledMatchDates } from "../matchSchedule";
import { trainingProfileRevision, trainingSetupRevision } from "../planIdentity";
import { hydrateTrainingExerciseFromDefinition, getExerciseDefinition } from "../exerciseLibrary";
import { structuredToFlat } from "../sessionStructure";
import type { Profile, SessionDay, TrainingSection } from "../types";
import {
  buildStrength,
  buildRunning,
  fitStrengthToBudget,
  eligibleExercise,
  estimateSessionSeconds,
} from "./exercises";
import { ENGINE_VERSION, trainingTier, plusDays, weekday, dayDistance, ROLE_NAMES } from "./model";
import type { EngineResult, EngineOptions, EngineSession, Issue } from "./model";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { easyRunningRecipe } from "./running";
import { coachedPrimerEligible, clusterEligible } from "./strengthProtocols";
import {
  solveWeeklySchedule,
  assessPlacement,
  hasKnownStrengthLoad,
  type PlacementAttempt,
  type SchedulingBlock,
} from "./scheduling";
import { deriveEngineSessionLoad, validateEngineSession } from "./validation";
import { isPostMatchDate, postMatchMode, upperBodyOnly } from "./postMatch";
import { buildActivation, buildRecovery, buildMobility, buildSkills } from "./support";
import { buildEnduranceForDate, hasCurrentVerifiedMas } from "./endurance";
import { resolveGoalPolicy, routedProfile, mainGoalTasks } from "./goalPolicy";
import { hasReadinessStop } from "./planStatus";
import { APP_MINIMUM_AGE, preparationProfile, hasVerifiedAdvancedStrength } from "./preparation";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import { applyGymProgression } from "./gymProgression";
import { renderStrengthPairs } from "./strengthPairs";
import { buildAdvancedStrength, withoutAdvancedRows } from "./advancedSessions";
import { advancedSectionType, renderComplexPairs } from "./advancedRender";
import { athleticSectionType } from "./athleticRender";
import { chooseStrengthFocus, strengthWeekContext } from "./strengthPolicy";
import { applyStrengthFocus } from "./strengthPolicy";
import { applyUpperContrast, renderUpperContrast, withoutUpperContrast } from "./upperContrast";
import { strengthPreparationOverhead } from "./strengthPreparation";

const names = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const own = (d: SessionDay) => slots(d).filter((s) => !!s.engineV2);
const isFullRestDay = (d: SessionDay) =>
  d.dayType === "rest" && !d.engineV2 && !d.secondSession && !d.externalCommitment;
const fullRestCount = (days: readonly SessionDay[]) => days.filter(isFullRestDay).length;
const consumesReservedRest = (days: SessionDay[], index: number, options: EngineOptions) =>
  isFullRestDay(days[index]) &&
  fullRestCount(days) <= (options.minFullRestDays ?? (options.fillRestDays ? 1 : 0));
const matchLabel = (date: string, matches: Set<string>) => {
  const nearest = [...matches].sort(
    (a, b) => Math.abs(dayDistance(date, a)) - Math.abs(dayDistance(date, b)) || b.localeCompare(a),
  )[0];
  if (!nearest) return null;
  const diff = dayDistance(date, nearest);
  return Math.abs(diff) > 7 ? null : diff === 0 ? "MD" : `MD${diff > 0 ? "+" : ""}${diff}`;
};
const highLowerDay = (d: SessionDay, p: Profile) =>
  own(d).some((s) => s.engineV2!.highLower) ||
  (d.dayType === "club" && (p.clubStrengthDays ?? []).includes(weekday(d.date)));

function day(date: string, p: Profile, matches: Set<string>): SessionDay {
  const match = matches.has(date),
    club = !match && p.clubTrainingDays.includes(weekday(date));
  return {
    generatorVersion: ENGINE_VERSION,
    canonicalRevision: trainingProfileRevision(p),
    trainingSetupRevision: trainingSetupRevision(p),
    date,
    dayOfWeek: weekday(date),
    dayName: names[weekday(date) % 7],
    dayType: match ? "match" : club ? "club" : "rest",
    type: match ? "match" : club ? "club_training" : "rest",
    title: match
      ? EXTERNAL_SESSION_NAMES.match
      : club
        ? EXTERNAL_SESSION_NAMES.club
        : EXTERNAL_SESSION_NAMES.rest,
    intensity: match ? "wysoka" : club ? "umiarkowana" : "niska",
    durationMin: 0, // External duration is unknown; never fabricate minutes played.
    reason:
      match || club
        ? "Termin zadeklarowany w profilu; obciążenie zewnętrzne."
        : "Brak przydzielonego treningu własnego.",
    whyToday: "Kalendarz zawodnika",
    goalLabel: "",
    sessionType: match
      ? EXTERNAL_SESSION_NAMES.match
      : club
        ? EXTERNAL_SESSION_NAMES.club
        : EXTERNAL_SESSION_NAMES.rest,
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    safetyNote: null,
    mdLabel: matchLabel(date, matches),
    slotLabel: null,
    externalCommitment: match || club,
    isUnavailable: p.unavailableDays?.includes(weekday(date)),
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  };
}

/** First external/axial-loaded main lift of a strength session: where a ramp-up is shown. */
function isFirstLoadedMain(recipe: EngineSession, index: number): boolean {
  if (!recipe.roles.some((r) => r.startsWith("strength"))) return false;
  const mainRoles =
    recipe.postMatch === "upper" ? ["push", "pull"] : ["knee_strength", "hip_strength"];
  const first = recipe.exercises.findIndex(
    (e) =>
      mainRoles.includes(e.role) &&
      ["external", "axial"].includes(getExerciseDefinition(e.exerciseId)?.loadingType ?? ""),
  );
  return first === index;
}

/** Variants used by earlier sprint sessions, oldest first (saved plan, locked days, this build). */
function sprintHistory(
  days: readonly SessionDay[],
  previous: readonly SessionDay[] = [],
  before: string,
) {
  const seen = new Set<string>();
  return [...previous, ...days]
    .flatMap(slots)
    .filter((s) => s.engineV2?.sprintVariant && s.date < before)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => {
      const key = `${s.date}:${s.engineV2!.sprintVariant!.mainVariantId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => s.engineV2!.sprintVariant!);
}

function render(date: string, recipe: EngineSession, p: Profile): SessionDay {
  const revision = trainingProfileRevision(p);
  const sections: TrainingSection[] = [];
  for (const [index, e] of (recipe.sprintRecipeVersion === 1
    ? sprintChronology(recipe.exercises)
    : recipe.exercises
  ).entries()) {
    const d = e.dose;
    const accessory =
      [
        "push",
        "pull",
        "adductor",
        "trunk",
        "calf_straight",
        "calf_bent",
        "hamstring_iso",
        "hamstring_dynamic_support",
        "quad_iso",
      ].includes(e.role) ||
      (e.role === "upper_power" && !!recipe.upperContrast);
    const type =
      athleticSectionType(recipe, e) ??
      advancedSectionType(recipe, e.role) ??
      (d.speedStage === "cooldown"
        ? "cooldown"
        : e.role === "warmup"
          ? "warmup"
          : e.role === "iso_primer" || e.role === "quad_iso"
            ? "prep"
            : accessory
              ? "accessory"
              : "main");
    let section = sections.find((s) => s.type === type);
    if (!section) {
      section = {
        id: `${date}:${type}`,
        title:
          type === "warmup"
            ? "Przygotowanie"
            : type === "prep"
              ? "Przygotowanie ruchowe"
              : type === "accessory"
                ? "Uzupełnienie"
                : type === "cooldown"
                  ? "Zakończenie"
                  : "Część główna",
        type,
        blocks: [],
      };
      sections.push(section);
    }
    const text = d.seconds
      ? `${d.seconds} s${d.perSide ? " / stronę" : ""}`
      : d.distanceM
        ? `${d.runInM ? `${d.runInM} m nabiegu + ` : ""}${d.distanceM} m${d.perSide ? " / stronę" : ""}`
        : `${d.reps}${d.perSide ? " / stronę" : ""}`;
    const exercise = hydrateTrainingExerciseFromDefinition({
      id: `${date}:${e.role}:${index}`,
      exerciseId: e.exerciseId,
      name: getExerciseDefinition(e.exerciseId)!.displayNamePl,
      sets: String(d.sets),
      reps: d.seconds ? undefined : text,
      duration: d.seconds ? text : undefined,
      displayPrescription: `${d.sets} × ${text}`,
      restAfterExercise: `${d.restSeconds} s`,
      rir: d.rir === undefined ? undefined : String(d.rir),
      purpose: e.reason,
      instructionSteps:
        d.speedStage &&
        !["preparation", "cooldown"].includes(d.speedStage) &&
        (!d.circuit || e.exerciseId === "dribble_to_sprint_transition")
          ? [{ title: "Wykonanie wariantu", description: e.reason }]
          : undefined,
      label: d.circuit
        ? `Runda ${d.circuit.round}/${d.circuit.rounds} · ćwiczenie ${d.circuit.task}/3`
        : d.sequenceStep
          ? `Runda ${d.sequenceStep.round}/${d.sequenceStep.rounds} · odcinek ${d.sequenceStep.attempt}/${d.sequenceStep.attempts}`
          : undefined,
      engineDose: d,
      ...(recipe.strengthPreparationVersion === 1 && e.role === "warmup"
        ? { preparationOnly: true as const }
        : {}),
      strengthFocus: ["knee_strength", "hip_strength"].includes(e.role)
        ? recipe.strengthFocus
        : undefined,
      progressionPhase:
        recipe.phase === "deload" ||
        ["deload", "reentry"].includes(recipe.strengthFocus?.mode ?? "")
          ? "reduced"
          : "normal",
      methodExecution: d.cluster
        ? {
            methodId: "M08",
            mode: "cluster",
            rounds: d.sets,
            repetitions: 1,
            repGroups: d.cluster.repGroups,
            workReps: d.reps,
            restSeconds: d.cluster.intraRestSeconds,
            roundRestSeconds: d.restSeconds,
            intensityLabel: `Zapas ${d.rir} powtórzeń`,
            stopRule:
              "Przerwij przy utracie techniki. Nie dodawaj powtórzeń poza zapisanymi grupami.",
            focus: `${d.cluster.repGroups.join(" + ")} powtórzenia; ${d.cluster.intraRestSeconds} s między grupami. Zapisz sumę powtórzeń całej serii.`,
            assessment: "athlete_or_coach",
          }
        : undefined,
      cue:
        d.intent === "explosive"
          ? "Każda próba jakościowa; pełny odpoczynek. Przerwij przy utracie kontroli."
          : d.intent === "easy"
            ? "Swobodny oddech i tempo konwersacyjne."
            : isFirstLoadedMain(recipe, index)
              ? `Przed pierwszą serią roboczą wykonaj ${recipe.tier === "foundation" ? "2 bardzo lekkie serie wprowadzające" : "2–3 serie wprowadzające"} (np. ok. 50% i 70% planowanego ciężaru po 3–5 powtórzeń). To nie są serie robocze: nie zapisuj ich jako wykonanych i nie liczą się do progresji. Pierwszy ciężar roboczy dobierz tak, by zostawał zapas ${d.rir ?? 3} powtórzeń.`
              : undefined,
      groundContacts:
        FUNCTIONAL_CATALOGUE[e.exerciseId]?.actions.includes("jump") ||
        ["snap_down", "drop_landing", "single_leg_drop_landing"].includes(e.exerciseId)
          ? (d.reps ?? 0) *
            (d.perSide ? 2 : 1) *
            (["depth_jump", "drop_jump"].includes(e.exerciseId) ? 2 : (d.contactsPerRep ?? 1))
          : undefined,
      speedRole: e.role === "speed" ? "primary" : undefined,
    });
    if (d.tempo)
      exercise.cue =
        `Tempo ${d.tempo.eccentricSeconds} s opuszczanie · ${d.tempo.pauseSeconds} s pauza · szybka intencja podnoszenia. ${exercise.cue ?? ""}`.trim();
    section.blocks.push({
      id: `${exercise.id}:block`,
      title: exercise.name,
      blockType: "single",
      intent:
        e.role === "power" || e.role === "upper_power"
          ? "power"
          : e.role === "landing"
            ? "braking"
            : type === "warmup"
              ? "mobility"
              : "strength",
      restAfterBlock: d.postRestSeconds ? `${d.postRestSeconds} s` : undefined,
      exercises: [exercise],
    });
  }
  const priority = { warmup: 0, prep: 1, main: 2, accessory: 3, cooldown: 4, log: 5 };
  sections.sort((a, b) => priority[a.type] - priority[b.type]);
  renderStrengthPairs(sections, recipe);
  renderUpperContrast(sections, recipe);
  renderComplexPairs(sections, recipe);
  if (recipe.organization === "contrast") {
    const main = sections.find((s) => s.type === "main");
    const primary = main?.blocks.find((b) =>
      recipe.exercises.some(
        (e) =>
          ["knee_strength", "hip_strength"].includes(e.role) &&
          e.exerciseId === b.exercises[0].exerciseId,
      ),
    );
    const power = main?.blocks.find((b) =>
      recipe.exercises.some(
        (e) => e.role === "power" && e.exerciseId === b.exercises[0].exerciseId,
      ),
    );
    if (main && primary && power) {
      primary.exercises[0].label = "A1";
      power.exercises[0].label = "A2";
      power.exercises[0].restAfterPair = "180 s";
      const pair = {
        ...primary,
        title: "Siła i moc",
        blockType: "contrast" as const,
        executionProtocol: "contrast-rounds-v1" as const,
        exercises: [...primary.exercises, ...power.exercises],
        restAfterBlock: "180 s",
      };
      const remaining = main.blocks.filter((b) => b !== primary && b !== power);
      const speed = remaining.filter((b) =>
        recipe.exercises.some(
          (e) => e.role === "speed" && e.exerciseId === b.exercises[0].exerciseId,
        ),
      );
      main.blocks = [...speed, pair, ...remaining.filter((b) => !speed.includes(b))];
    }
  }
  const gym = recipe.roles.some((r) => r.startsWith("strength")),
    speed = recipe.roles.includes("speed");
  const support = recipe.roles.find((r) =>
    ["activation", "recovery", "mobility", "skills"].includes(r),
  );
  const title = sessionName(recipe);
  return {
    ...day(date, p, new Set()),
    dayType: support === "activation" ? "md-1" : support === "recovery" ? "recovery" : "training",
    type:
      support === "activation"
        ? "activation"
        : support === "recovery"
          ? "recovery"
          : support === "mobility"
            ? "prehab_mobility"
            : support === "skills"
              ? "football_technical"
              : gym
                ? "strength_power"
                : speed
                  ? "sprint_acceleration"
                  : "endurance_running",
    title,
    sessionType: title,
    goalLabel: gym
      ? recipe.exercises.some((e) => e.role === "power")
        ? "Strength & Power"
        : "Strength Development"
      : speed
        ? "Speed Development"
        : support
          ? title
          : "Aerobic Development",
    durationMin: recipe.minutes,
    intensity: recipe.highLower ? "wysoka" : support ? "niska" : "umiarkowana",
    isOwnSession: true,
    externalCommitment: false,
    isClubSession: false,
    generatorVersion: ENGINE_VERSION,
    canonicalRevision: revision,
    trainingSetupRevision: trainingSetupRevision(p),
    engineV2: recipe,
    runningRecipe:
      recipe.runningRecipe ??
      (recipe.roles[0] === "endurance"
        ? easyRunningRecipe(p, date, recipe.exercises[0].dose.seconds!)
        : undefined),
    reason: `${preparationProfile(p).source === "onboarding" ? "Wariant programu na podstawie doświadczenia z onboardingu" : "Wariant programu na podstawie zadeklarowanego przygotowania siłowego"}. Miejsce wybrane po sprawdzeniu meczu, klubu, dostępności i obciążeń.`,
    whyToday: "Wybrany dopuszczony termin w tygodniu",
    goalOfSession: recipe.strengthFocus?.label ?? title,
    blockPhaseLabel: recipe.phase,
    safetyNote: support
      ? "Spokojne wykonanie bez wymuszania zakresu; czas sesji jest orientacyjny."
      : recipe.roles[0] === "endurance"
        ? "Rozgrzewkę i schłodzenie prowadzi licznik biegu."
        : speed
          ? "Wykonaj zapisane przygotowanie i narastające przebieżki przed głównymi sprintami. Zakończ próbę przy utracie jakości."
          : recipe.strengthPreparationVersion === 1
            ? "Wykonaj zapisaną rozgrzewkę i lekkie serie wprowadzające przed pierwszym ćwiczeniem z obciążeniem. Nie zaczynaj od ciężaru roboczego."
            : "8 minut przygotowania ogólnego i serii wprowadzających uwzględniono w czasie sesji. Nie zaczynaj od ciężaru roboczego.",
    structuredSections: sections,
    sections: structuredToFlat(sections),
  };
}

/** Completed build weeks of the 4-week block on this date; 0 in a review, deload or re-entry week. */
function buildWeekOf(p: Profile, options: EngineOptions, date: string): number {
  const { cycle } = cycleForWeek(p, options, date);
  return cycle.state === "build" ? cycle.weekIndex % 4 : 0;
}

/** The dated calm run with the block's progression, stepped back when it would not fit the time. */
function progressedEndurance(
  p: Profile,
  options: EngineOptions,
  date: string,
  phase: EngineSession["phase"],
  forceLight: boolean,
): EngineSession | null {
  const budget = options.minutesPerSession ?? 75;
  for (let step = buildWeekOf(p, options, date); step > 0; step--) {
    const recipe = plannedEndurance(p, date, phase, forceLight, step);
    if (recipe && recipe.minutes <= budget) return recipe;
  }
  return plannedEndurance(p, date, phase, forceLight);
}

function plannedEndurance(
  p: Profile,
  date: string,
  phase: EngineSession["phase"],
  forceLight = false,
  buildWeek = 0,
): EngineSession | null {
  const policy = resolveGoalPolicy(p);
  const recipe = buildEnduranceForDate(
    routedProfile(p, policy.enduranceGoal),
    date,
    phase,
    forceLight || policy.reduced,
    policy.reduced ? 0 : buildWeek,
  );
  if (!recipe || !policy.reduced || !recipe.runningRecipe) return recipe;
  // Keep an explicit return/fatigue route lighter across all three main modules.
  const running = recipe.runningRecipe;
  for (const block of running.blocks) {
    block.work.seconds = Math.min(block.work.seconds, (p.age < 16 ? 10 : 15) * 60);
    block.work.label = `${block.work.seconds / 60} min spokojnie`;
  }
  for (const exercise of recipe.exercises) exercise.dose.seconds = running.blocks[0].work.seconds;
  running.reasons.push(
    "Zmniejszono czas ze względu na zadeklarowany powrót lub ograniczenie zmęczeniem; bez rozpoznawania przyczyny zdrowotnej.",
  );
  recipe.minutes = recipeTotalSeconds(running) / 60;
  return recipe;
}

/**
 * One rule for every strength recipe (new plan, week finalisation, proposals and corrections):
 * settle the final dose first (focus, then verified progression), only then fit the time budget.
 * When the full session does not fit, the existing compact variant is tried; otherwise null.
 */
export function finalizeStrengthRecipe(
  base: EngineSession,
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[],
  budget: number,
): EngineSession | null {
  const postMatch = base.postMatch;
  if (postMatch === "upper") {
    // Upper body + trunk only: the advanced leg pairs never apply; settle the usual A/B session.
    const usual =
      base.organization === "complex"
        ? buildStrength(
            routedProfile(p, resolveGoalPolicy(p).strengthGoal),
            base.roles.includes("strengthA") ? "A" : "B",
            base.phase,
            base.exerciseRotation ?? 0,
          )
        : base;
    const full = finalizeStrengthRecipe(
      { ...usual, postMatch: undefined },
      p,
      date,
      options,
      days,
      Number.MAX_SAFE_INTEGER,
    );
    const upper = full && upperBodyOnly(full);
    if (!upper) return null;
    const load = deriveEngineSessionLoad(upper, p);
    upper.minutes = load.minutes;
    upper.highLower = load.highLower;
    return upper.minutes <= budget ? upper : null;
  }
  if (postMatch === "full") {
    const full = finalizeStrengthRecipe(
      { ...base, postMatch: undefined },
      p,
      date,
      options,
      days,
      budget,
    );
    return full && { ...full, postMatch };
  }
  if (base.organization === "complex") {
    const advanced = finalizeAdvanced(base, p, date, options, days, budget);
    if (advanced) return advanced;
    // The week, the calendar or the time does not allow the advanced pairs: the usual A/B session.
    base = buildStrength(
      routedProfile(p, resolveGoalPolicy(p).strengthGoal),
      base.roles.includes("strengthA") ? "A" : "B",
      base.phase,
      base.exerciseRotation ?? 0,
    );
  }
  const settle = (r: EngineSession) => {
    const focused = applyUpperContrast(
      applyStrengthFocus(withoutUpperContrast(r), p, date, options, days),
      p,
      (id) => eligibleExercise(id, p, "upper_power"),
    );
    focused.minutes =
      Math.ceil(estimateSessionSeconds(focused.exercises) / 60) +
      strengthPreparationOverhead(focused);
    return applyGymProgression(focused, p, date, options, days);
  };
  const full = settle(base);
  if (full.minutes <= budget) return full;
  const compact = fitStrengthToBudget(full, budget);
  return compact.minutes <= budget ? compact : null;
}
/** The strength recipe of a week: the advanced note-based session when it applies, else A/B. */
function strengthBase(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation: number,
): EngineSession {
  return (
    buildAdvancedStrength(p, variant, phase, rotation) ??
    buildStrength(routedProfile(p, resolveGoalPolicy(p).strengthGoal), variant, phase, rotation)
  );
}

/**
 * Advanced pairs keep their prescribed doses. A lighter, maintenance or re-entry week, a match
 * within two days (for rows marked so) and the time budget are applied here; null means "use A/B".
 */
function finalizeAdvanced(
  base: EngineSession,
  p: Profile,
  date: string,
  options: EngineOptions,
  days: SessionDay[],
  budget: number,
): EngineSession | null {
  const focus = chooseStrengthFocus(p, base.phase, strengthWeekContext(p, date, options, days));
  if (["maintenance", "deload", "reentry"].includes(focus.mode)) return null;
  let r = base;
  // "Jeśli nie ma meczu": within three days of a match (closer, the week is already maintenance).
  const nearMatch = scheduledMatchDates(p, plusDays(date, -3), 7).some(
    (m) => Math.abs(dayDistance(date, m)) <= 3,
  );
  if (nearMatch && r.skipNearMatch?.length) r = withoutAdvancedRows(r, new Set(r.skipNearMatch));
  r = applyGymProgression(r, p, date, options, days);
  if (r.minutes > budget && r.optionalExercises?.length)
    r = withoutAdvancedRows(r, new Set(r.optionalExercises));
  return r.minutes <= budget ? r : null;
}

const isStrengthRecipe = (r: EngineSession) =>
  r.roles.some((role) => role === "strengthA" || role === "strengthB");

const strengthSignature = (s: SessionDay) =>
  JSON.stringify([
    s.engineV2?.exercises.map((e) => [e.exerciseId, e.role, e.dose, e.strengthStage]),
    s.engineV2?.strengthStructure,
    s.engineV2?.strengthTimeOmissions,
    s.engineV2?.strengthFocus?.mode,
    s.engineV2?.organization,
    s.durationMin,
  ]);

/**
 * Re-evaluates each strength session once the whole week is known, with the same function the
 * proposals use. A change is kept only if the week stays as valid as it was.
 */
function finalizeStrengthWeek(
  week: SessionDay[],
  p: Profile,
  options: EngineOptions,
  before: SessionDay[],
): SessionDay[] {
  const context = [...before, ...week];
  let changed = false;
  const fix = (s: SessionDay): SessionDay => {
    if (s.executionProtected || !s.engineV2 || !isStrengthRecipe(s.engineV2)) return s;
    const fresh = refreshStrengthSession(s, p, options, context);
    if (!fresh || strengthSignature(fresh) === strengthSignature(s)) return s;
    changed = true;
    return { ...fresh, dbId: s.dbId };
  };
  const next = week.map((d) => {
    if (d.executionProtected) return d;
    const first = fix(d);
    return { ...first, secondSession: d.secondSession ? fix(d.secondSession) : null };
  });
  if (!changed) return week;
  const check = { ...options, startDate: week[0].date, precedingDays: before };
  const key = (i: Issue) => `${i.code}|${i.date ?? ""}|${i.message}`;
  const baseline = new Set(validateTrainingPlan(week, p, check).map(key));
  return validateTrainingPlan(next, p, check).every((i) => baseline.has(key(i))) ? next : week;
}

function place(
  days: SessionDay[],
  index: number,
  recipe: EngineSession,
  p: Profile,
  options: EngineOptions,
  matches: Set<string>,
  preceding: SessionDay[],
  forceEnduranceLight = false,
): PlacementAttempt<SessionDay[]> {
  const current = days[index];
  if (consumesReservedRest(days, index, options))
    return {
      blocked: {
        code: "FULL_REST_RESERVE",
        message: "Ten termin zabrałby zadeklarowany pełny dzień odpoczynku.",
      },
    };
  if (recipe.roles.length === 1 && recipe.roles[0] === "speed") {
    // Resolve the existing reduced sprint template for the actual MD-2 date before fitting it.
    if (matches.has(plusDays(current.date, 2))) {
      const dated = buildRunning(
        routedProfile(p, resolveGoalPolicy(p).speedGoal),
        "speed",
        recipe.phase,
        {
          history: sprintHistory([...preceding, ...days], options.previousPlan, current.date),
          force: recipe.sprintVariant,
          preMatch: true,
        },
      );
      if (!dated)
        return {
          blocked: {
            code: "NO_SPEED_VARIANT",
            message: "Brak dopuszczonego przedmeczowego wariantu sprintu.",
          },
        };
      recipe = { ...recipe, ...dated };
    }
    const budget = options.minutesPerSession ?? 75;
    if (Number.isFinite(budget) && budget > 0) {
      const fitted = fitSprintToBudget(recipe, budget);
      if (!fitted)
        return {
          blocked: {
            code: "TIME_LIMIT",
            message: "Dawka sprintu, także w krótszym wariancie, nie mieści się w czasie.",
          },
        };
      recipe = fitted;
    }
  }
  if (isStrengthRecipe(recipe)) {
    const final = finalizeStrengthRecipe(
      recipe,
      p,
      current.date,
      options,
      [...preceding, ...days],
      options.minutesPerSession ?? 75,
    );
    if (!final)
      return {
        blocked: {
          code: "TIME_LIMIT",
          message: "Ostateczna dawka siły, także w krótszym wariancie, nie mieści się w czasie.",
        },
      };
    recipe = final;
  } else {
    recipe = applyStrengthFocus(recipe, p, current.date, options, [...preceding, ...days]);
    recipe = applyGymProgression(recipe, p, current.date, options, [...preceding, ...days]);
  }
  const distance = Math.min(99, ...[...matches].map((m) => Math.abs(dayDistance(current.date, m))));
  // Resolve measured running pace against the actual candidate date, including test expiry.
  // A prepared MAS test keeps its own recipe; only calm runs are re-resolved for the date.
  if (
    recipe.roles.length === 1 &&
    recipe.roles[0] === "endurance" &&
    recipe.runningRecipe?.method !== "field_mas_test"
  ) {
    const dated = progressedEndurance(
      p,
      options,
      current.date,
      recipe.phase,
      distance <= 2 || forceEnduranceLight,
    );
    if (!dated)
      return {
        blocked: {
          code: "NO_ENDURANCE_VARIANT",
          message: "Brak dopuszczonego wariantu wydolności.",
        },
      };
    recipe = dated;
  }
  const gate = assessPlacement({
    days,
    dayIndex: index,
    recipe,
    profile: p,
    options,
    matchDates: matches,
    precedingDays: preceding,
    combinedMinutes: (a, b) => a.minutes + b.minutes,
  });
  if (!gate.allowed) {
    // An easy alternative remains an explicit adaptation, and still passes every calendar gate.
    // (never for a prepared MAS test: a calm run is not that test)
    if (
      recipe.roles[0] === "endurance" &&
      recipe.highLower &&
      recipe.runningRecipe?.method !== "field_mas_test"
    ) {
      const easy = progressedEndurance(p, options, current.date, recipe.phase, true);
      if (easy) {
        const light = placeResolvedEndurance(days, index, easy, p, options, matches, preceding);
        if (light) return { ...light, penalty: (light.penalty ?? 0) + 10 };
      }
    }
    return { blocked: { code: gate.code, message: gate.message } };
  }
  const session = render(current.date, recipe, p);
  session.mdLabel = current.mdLabel;
  const replacement = gate.mode === "new" ? session : { ...current, secondSession: session };
  return {
    state: days.map((d, i) => (i === index ? replacement : d)),
    penalty:
      (distance === 2 && recipe.highLower ? 3 : 0) +
      (recipe.roles[0] === "endurance" &&
      !recipe.highLower &&
      recipe.phase !== "deload" &&
      resolveGoalPolicy(p).enduranceGoal === "endurance" &&
      !resolveGoalPolicy(p).reduced &&
      p.age >= 16 &&
      ["intermediate", "advanced", "elite"].includes(p.level) &&
      hasCurrentVerifiedMas(p, current.date)
        ? 10
        : 0) +
      (current.dayType === "club" ? 2 : 0) +
      // A second own session on a day is used only when no free day fits as well.
      (gate.mode === "append_second" ? 1 : 0) +
      index * 0.001,
  };
}

function placeResolvedEndurance(
  days: SessionDay[],
  index: number,
  recipe: EngineSession,
  p: Profile,
  options: EngineOptions,
  matches: Set<string>,
  preceding: SessionDay[],
): { state: SessionDay[]; penalty: number } | null {
  if (consumesReservedRest(days, index, options)) return null;
  const gate = assessPlacement({
    days,
    dayIndex: index,
    recipe,
    profile: p,
    options,
    matchDates: matches,
    precedingDays: preceding,
    combinedMinutes: (a, b) => a.minutes + b.minutes,
  });
  if (!gate.allowed) return null;
  const current = days[index],
    session = render(current.date, recipe, p);
  session.mdLabel = current.mdLabel;
  const replacement = gate.mode === "new" ? session : { ...current, secondSession: session };
  return {
    state: days.map((d, i) => (i === index ? replacement : d)),
    penalty:
      (current.dayType === "club" ? 2 : 0) +
      (gate.mode === "append_second" ? 1 : 0) +
      index * 0.001,
  };
}

function placeSupport(
  days: SessionDay[],
  index: number,
  recipe: EngineSession | null,
  p: Profile,
  options: EngineOptions,
  matches: Set<string>,
): SessionDay[] | null {
  if (!recipe || p.painInjury || p.seasonPhase === "return_injury") return null;
  if (consumesReservedRest(days, index, options)) return null;
  const d = days[index],
    dayNumber = weekday(d.date);
  if (
    d.executionProtected ||
    d.isUnavailable ||
    !p.individualTrainingDays.includes(dayNumber) ||
    matches.has(d.date) ||
    recipe.minutes > (options.minutesPerSession ?? 75) ||
    own(d).some((s) => s.engineV2!.roles.some((r) => recipe.roles.includes(r)))
  )
    return null;
  if (hasReadinessStop(options.readiness?.[d.date])) return null;
  if (d.secondSession) return null;
  const occupied = d.dayType === "club" || own(d).length > 0;
  if (occupied && p.doubleSessionsAllowed === "no") return null;
  const session = render(d.date, recipe, p);
  session.mdLabel = d.mdLabel;
  return days.map((day, i) =>
    i !== index ? day : occupied ? { ...day, secondSession: session } : session,
  );
}

export function generateTrainingPlan(p: Profile, options: EngineOptions): EngineResult {
  const saved = options.previousPlan?.find((d) => d.planInputs)?.planInputs;
  // An omitted setting continues the saved request; an explicit undefined resets it to auto.
  options = {
    ...options,
    ...(!Object.hasOwn(options, "weeklyTargets") && saved?.weeklyTargets !== undefined
      ? { weeklyTargets: saved.weeklyTargets }
      : {}),
    ...(!Object.hasOwn(options, "fillRestDays") && saved?.fillRestDays !== undefined
      ? { fillRestDays: saved.fillRestDays }
      : {}),
    ...(!Object.hasOwn(options, "minFullRestDays") && saved?.minFullRestDays !== undefined
      ? { minFullRestDays: saved.minFullRestDays }
      : {}),
  };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ||
    !Number.isFinite(Date.parse(`${options.startDate}T12:00:00Z`)) ||
    plusDays(options.startDate, 0) !== options.startDate
  )
    throw new Error("Nieprawidłowa data początku planu.");
  const weeks = options.weeks ?? 4;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4)
    throw new Error("Plan obejmuje od 1 do 4 tygodni.");
  if (!Number.isInteger(p.age) || p.age < APP_MINIMUM_AGE)
    throw new Error(`Nowe plany BallWise są dostępne od ${APP_MINIMUM_AGE} lat.`);
  if (
    options.minutesPerSession !== undefined &&
    (!Number.isFinite(options.minutesPerSession) ||
      options.minutesPerSession < 10 ||
      options.minutesPerSession > 120)
  )
    throw new Error("Czas sesji musi wynosić 10–120 minut.");
  if (
    options.weeklyTargets !== undefined &&
    (!options.weeklyTargets ||
      typeof options.weeklyTargets !== "object" ||
      options.weeklyTargets.strength !== 2 ||
      ![1, 2].includes(options.weeklyTargets.speed) ||
      ![1, 2].includes(options.weeklyTargets.endurance))
  )
    throw new Error("Tygodniowy cel to 2 sesje siły oraz po 1–2 sesje sprintu i wydolności.");
  if (options.fillRestDays !== undefined && typeof options.fillRestDays !== "boolean")
    throw new Error("Ustawienie lekkich zadań musi mieć wartość włączone lub wyłączone.");
  if (options.minFullRestDays !== undefined && ![0, 1, 2].includes(options.minFullRestDays))
    throw new Error("Wybierz od 0 do 2 pełnych dni odpoczynku w tygodniu.");
  const minFullRestDays = options.minFullRestDays ?? (options.fillRestDays ? 1 : 0);
  const matches = new Set(scheduledMatchDates(p, plusDays(options.startDate, -7), weeks * 7 + 14));
  const issues: Issue[] = [],
    plan: SessionDay[] = [],
    tier = trainingTier(p);
  const method = p.trainingMethodPreferences?.strength;
  if (method && !["auto", "M08", "M09", "M13", "M14"].includes(method))
    issues.push({
      code: "METHOD_UNSUPPORTED",
      message:
        "Wybrana metoda specjalistyczna nie należy do obsługiwanych protokołów tego planu. Zastosowano standardowe serie; zmień preferencję, jeśli chcesz inny wariant.",
    });
  if (method === "M08" && !clusterEligible(p, "development"))
    issues.push({
      code: "METHOD_CONDITIONS",
      message:
        "Klastry wymagają zadeklarowanego przygotowania i nadzoru, u niepełnoletnich pełnego. Zachowano zwykłe serie bez automatycznej zmiany ciężaru.",
    });
  if (method === "M14" && !coachedPrimerEligible(p, "development"))
    issues.push({
      code: "METHOD_CONDITIONS",
      message:
        "Nie włączono izometrii przed treningiem: wymaga przygotowania, pełnego nadzoru, potwierdzenia protokołu i stanowiska ze stałymi pinami. Pozostałe ćwiczenia zachowano.",
    });
  if (method === "M09" && !hasVerifiedAdvancedStrength(p))
    issues.push({
      code: "METHOD_CONDITIONS",
      message:
        "Nie włączono kontrastu: wymagane jest zaawansowane przygotowanie siłowe i pełnoletność. Pozostałe ćwiczenia zachowano w osobnych seriach.",
    });
  if (p.painInjury || p.seasonPhase === "return_injury")
    issues.push({
      code: "RETURN_REVIEW",
      message:
        "Automatyczne treningi własne wstrzymano: ten silnik nie układa rehabilitacji ani powrotu po urazie.",
    });
  for (let week = 0; week < weeks; week++) {
    const { phase, cycle } = cycleForWeek(p, options, plusDays(options.startDate, week * 7));
    const base = Array.from({ length: 7 }, (_, i) => {
      const date = plusDays(options.startDate, week * 7 + i),
        locked = options.lockedDays?.find((d) => d.date === date);
      if (!locked) return day(date, p, matches);
      const kept = structuredClone({ ...locked, executionProtected: true });
      // A placeholder around an executed second slot is new calendar metadata,
      // not an executed prescription; do not carry a stale setup into the rebuild.
      const newRestShell = kept.dayType === "rest" && !kept.dbId && !kept.engineV2;
      const pendingExternal =
        locked.executionProtected === false &&
        locked.secondSession?.executionProtected === true &&
        ["club", "match"].includes(kept.dayType) &&
        !kept.engineV2;
      if (newRestShell || pendingExternal) {
        kept.canonicalRevision = trainingProfileRevision(p);
        kept.trainingSetupRevision = trainingSetupRevision(p);
        kept.generatorVersion = ENGINE_VERSION;
      }
      return kept;
    });
    const policy = resolveGoalPolicy(p);
    // "vary" chooses other equivalent strength exercises; the rotation is constant for the whole cycle.
    const rotation = cycleStartEffect(options).rotate ? 1 : 0;
    // The mobility goal makes the mobility session a weekly task of its own (second slot);
    // strength B is then tried afterwards as a supplement, not placed instead of mobility.
    const mobilityRecipe = policy.primary === "mobility" ? buildMobility(p, phase) : null;
    // Full base recipes: the time budget is fitted only after the final dose (place()).
    const strengthB = () => strengthBase(p, "B", phase, rotation);
    const tasks = [
      strengthBase(p, "A", phase, rotation),
      mobilityRecipe ?? strengthB(),
      buildRunning(routedProfile(p, policy.speedGoal), "speed", phase, {
        history: sprintHistory(
          [...(options.precedingDays ?? []), ...(options.lockedDays ?? []), ...plan],
          options.previousPlan,
          base[0].date,
        ),
      }),
      plannedEndurance(p, base[0].date, phase),
    ];
    const weights = policy.priorities;
    const ids = [
      "strengthA",
      mobilityRecipe ? "mobility" : "strengthB",
      "speed",
      "endurance",
    ] as const;
    const available = tasks.flatMap((recipe, t) =>
      recipe &&
      (!ids[t].startsWith("strength") ||
        recipe.exercises.some((e) => ["knee_strength", "hip_strength"].includes(e.role)))
        ? [{ id: ids[t], recipe, priority: weights[t] }]
        : [],
    );
    const strengthIds = ["strengthA", "strengthB"] as const;
    const recentStrength = [...(options.precedingDays ?? []), ...plan].filter(
      (d) => dayDistance(base[0].date, d.date) <= 28 && dayDistance(base[0].date, d.date) > 0,
    );
    const countLegPattern = (id: (typeof strengthIds)[number]) =>
      recentStrength
        .flatMap(slots)
        .filter((s) => s.engineV2?.roles.includes(id) && s.engineV2.postMatch !== "upper").length;
    const preferLegPattern =
      countLegPattern("strengthA") > countLegPattern("strengthB") ? "strengthB" : "strengthA";
    const solve = (candidates: typeof available) =>
      solveWeeklySchedule({
        initialState: base,
        tasks: candidates,
        dayCount: 7,
        mainGoalIds: mainGoalTasks(p),
        // A calm run covers endurance, but not its intended hard stimulus. Likewise,
        // post-match upper work covers a gym slot, not that slot's leg pattern.
        isFull: (days, id) => {
          if (id === "strengthA" || id === "strengthB")
            return days.some((d) =>
              own(d).some(
                (s) => s.engineV2!.roles.includes(id) && s.engineV2!.postMatch !== "upper",
              ),
            );
          const intended = candidates.find((t) => t.id === "endurance")?.recipe.highLower;
          return (
            id !== "endurance" ||
            !intended ||
            days.some((d) =>
              own(d).some((s) => s.engineV2!.roles.includes("endurance") && s.engineV2!.highLower),
            )
          );
        },
        isCovered: (days, id) =>
          days.some((d) =>
            own(d).some((s) => s.engineV2!.roles.includes(id as (typeof ids)[number])),
          ),
        tryPlace: (days, recipe, i) => {
          const preceding = [...(options.precedingDays ?? []), ...plan];
          const regular = place(days, i, recipe, p, options, matches, preceding);
          if (
            "state" in regular ||
            !isStrengthRecipe(recipe) ||
            !isPostMatchDate(days[i].date, matches)
          )
            return regular;
          // MD+1 must participate in the whole-week search: appending only a missing gym
          // session cannot move an already-covered Tue/Thu pair to make room for sprint.
          const postMatch = place(
            days,
            i,
            { ...recipe, postMatch: postMatchMode(p) },
            p,
            options,
            matches,
            preceding,
          );
          // The objective ranks goal/target coverage first. With equal coverage, retain
          // regular gym dates instead of choosing post-match work for a cosmetic cost.
          return "state" in postMatch
            ? {
                ...postMatch,
                penalty:
                  (postMatch.penalty ?? 0) +
                  100 +
                  // Upper work does not train its A/B leg pattern. Keep the actual leg
                  // session alternating when either upper-body label fits equally well.
                  (postMatchMode(p) === "upper" && recipe.roles.includes(preferLegPattern) ? 1 : 0),
              }
            : postMatch;
        },
      });
    let solved = solve(available);
    // One strength slot in a week: alternate A and B across weeks by what the last four weeks
    // actually contained, instead of repeating A forever. Both are never merged into one session.
    const placedStrength = strengthIds.filter((id) => solved.covered.includes(id));
    if (
      placedStrength.length === 1 &&
      available.some((t) => t.id === "strengthA") &&
      available.some((t) => t.id === "strengthB")
    ) {
      const prefer = preferLegPattern;
      if (placedStrength[0] !== prefer) {
        const nudged = available.map((t) =>
          t.id === prefer ? { ...t, priority: t.priority + 1 } : t,
        );
        const retry = solve(nudged);
        if (retry.covered.includes(prefer) && retry.covered.length >= solved.covered.length)
          solved = retry;
      }
    }
    let best = solved.state;
    const targetRejections: Record<"strength" | "speed" | "endurance", SchedulingBlock[]> = {
      strength: [...(solved.rejections.strengthA ?? []), ...(solved.rejections.strengthB ?? [])],
      speed: [...(solved.rejections.speed ?? [])],
      endurance: [...(solved.rejections.endurance ?? [])],
    };
    // Tight match week: a strength target without a regular date may use the day after a match
    // (MD+1): the full session for advanced/elite players, upper body + trunk for everyone else.
    for (const id of strengthIds) {
      const task = available.find((t) => t.id === id);
      if (!task || best.some((d) => own(d).some((s) => s.engineV2!.roles.includes(id)))) continue;
      let extra: { state: SessionDay[]; penalty: number } | undefined;
      for (let i = 0; i < 7; i++) {
        if (!isPostMatchDate(best[i].date, matches)) continue;
        const attempt = place(
          best,
          i,
          { ...task.recipe, postMatch: postMatchMode(p) },
          p,
          options,
          matches,
          [...(options.precedingDays ?? []), ...plan],
        );
        if ("state" in attempt && (!extra || (attempt.penalty ?? 0) < extra.penalty))
          extra = { state: attempt.state, penalty: attempt.penalty ?? 0 };
      }
      if (extra) best = extra.state;
    }
    // A match week with one strength session is a complete in-season week (A and B alternate
    // across weeks), unless strength itself is the main goal.
    const strengthPlaced = strengthIds.filter((id) =>
      best.some((d) => own(d).some((s) => s.engineV2!.roles.includes(id))),
    );
    const singleStrengthWeek =
      strengthPlaced.length === 1 &&
      base.some((d) => matches.has(d.date)) &&
      !mainGoalTasks(p).includes("strengthB");
    if (mobilityRecipe) {
      // Strength B supplements the mobility goal where a day allows it (same gates as any session).
      const supplement = strengthB();
      let extra: { state: SessionDay[]; penalty: number } | undefined;
      for (const postMatch of [false, true]) {
        if (extra) break;
        for (let i = 0; i < 7; i++) {
          if (postMatch && !isPostMatchDate(best[i].date, matches)) continue;
          const attempt = place(
            best,
            i,
            postMatch ? { ...supplement, postMatch: postMatchMode(p) } : supplement,
            p,
            options,
            matches,
            [...(options.precedingDays ?? []), ...plan],
          );
          if ("state" in attempt && (!extra || (attempt.penalty ?? 0) < extra.penalty))
            extra = { state: attempt.state, penalty: attempt.penalty ?? 0 };
        }
      }
      if (extra) best = extra.state;
      else if (!singleStrengthWeek)
        issues.push({
          code: "UNMET_WEEKLY_TARGET",
          target: "strengthB",
          date: base[0].date,
          message: `Tydzień ${week + 1}: przy celu mobilności siła B nie zmieściła się w kalendarzu; zachowano mobilność i siłę A.`,
        });
    }
    for (const d of best)
      for (const s of own(d)) {
        if (
          policy.enduranceGoal === "endurance" &&
          !policy.reduced &&
          phase !== "deload" &&
          hasCurrentVerifiedMas(p, d.date) &&
          s.engineV2!.roles[0] === "endurance" &&
          !s.engineV2!.highLower &&
          p.age >= 16 &&
          ["intermediate", "advanced", "elite"].includes(p.level)
        )
          issues.push({
            code: "ADAPTED_ENDURANCE",
            date: d.date,
            message:
              "Kluczową jednostkę wydolnościową (interwały lub tempo) zastąpiono spokojnym biegiem ze względu na termin, obciążenie lub czas. To jawna adaptacja, nie równoważne zaliczenie tego bodźca.",
          });
      }
    tasks.forEach((recipe, t) => {
      const role = ids[t];
      if (
        !best.some((d) => own(d).some((s) => s.engineV2!.roles.includes(role))) &&
        !(singleStrengthWeek && role.startsWith("strength"))
      ) {
        const reasons = [...new Set((solved.rejections[role] ?? []).map((r) => r.message))];
        issues.push({
          code: "UNMET_WEEKLY_TARGET",
          target: role,
          date: base[0].date,
          message: `Tydzień ${week + 1}: nie znaleziono terminu na ${{ strengthA: "siłę A", strengthB: "siłę B", speed: "sprint", endurance: "wydolność", mobility: "mobilność" }[role]}. ${reasons.length ? reasons.join(" ") : "Brak dopuszczonego wariantu przy zadanym sprzęcie i przygotowaniu."}`,
        });
      }
      if (recipe)
        for (const role of recipe.missing)
          issues.push({
            code: "UNMET_STIMULUS",
            date: base[0].date,
            message: `Nie znaleziono odpowiedniego ćwiczenia: ${ROLE_NAMES[role]}. Ten cel pozostaje niepokryty.`,
          });
    });
    // Explicit requests replace the automatic run count. Optional sessions never
    // displace the baseline four or bypass a calendar/load gate.
    if ((options.weeklyTargets?.endurance ?? (policy.extraEndurance ? 2 : 1)) === 2) {
      const countEndurance = (days: SessionDay[]) =>
        days.flatMap(own).filter((s) => s.engineV2!.roles.includes("endurance")).length;
      if (countEndurance(best) === 1) {
        let extra: { state: SessionDay[]; penalty: number } | undefined;
        const recipe = plannedEndurance(p, base[0].date, phase, true);
        if (recipe)
          for (let i = 0; i < 7; i++) {
            const attempt = place(
              best,
              i,
              recipe,
              p,
              options,
              matches,
              [...(options.precedingDays ?? []), ...plan],
              true,
            );
            if ("blocked" in attempt) targetRejections.endurance.push(attempt.blocked);
            else if (!extra || (attempt.penalty ?? 0) < extra.penalty)
              extra = { state: attempt.state, penalty: attempt.penalty ?? 0 };
          }
        if (extra) best = extra.state;
      }
      if (!options.weeklyTargets && countEndurance(best) < 2)
        issues.push({
          code: "UNMET_GOAL_TARGET",
          target: "endurance",
          date: base[0].date,
          message: `Tydzień ${week + 1}: zaplanowano ${countEndurance(best)} z 2 jednostek wydolności. Po zabezpieczeniu celów bazowych nie znaleziono miejsca na drugi spokojny bieg przy aktualnym kalendarzu, czasie i limitach sesji.`,
        });
    }
    if (
      options.weeklyTargets?.speed === 2 &&
      best.flatMap(own).filter((s) => s.engineV2!.roles.includes("speed")).length === 1
    ) {
      const recipe = buildRunning(routedProfile(p, policy.speedGoal), "speed", phase, {
        history: sprintHistory(
          [...(options.precedingDays ?? []), ...plan, ...best],
          options.previousPlan,
          plusDays(base[6].date, 1),
        ),
      });
      let extra: { state: SessionDay[]; penalty: number } | undefined;
      if (recipe)
        for (let i = 0; i < 7; i++) {
          const attempt = place(best, i, recipe, p, options, matches, [
            ...(options.precedingDays ?? []),
            ...plan,
          ]);
          if ("blocked" in attempt) targetRejections.speed.push(attempt.blocked);
          else if (!extra || (attempt.penalty ?? 0) < extra.penalty)
            extra = { state: attempt.state, penalty: attempt.penalty ?? 0 };
        }
      if (extra) best = extra.state;
    }
    // Support never displaces a required training stimulus or masquerades as it.
    for (let i = 0; i < 7; i++) {
      const before = matches.has(plusDays(best[i].date, 1)),
        after = matches.has(plusDays(best[i].date, -1));
      if (before && !after) {
        const allowJump = !policy.reduced && (options.readiness?.[best[i].date]?.overall ?? 10) > 4;
        const attempt = placeSupport(
          best,
          i,
          buildActivation(p, phase, allowJump),
          p,
          options,
          matches,
        );
        if (attempt) best = attempt;
        else if (!best[i].executionProtected)
          issues.push({
            code: "UNMET_ACTIVATION",
            date: best[i].date,
            message: minFullRestDays
              ? "Nie dodano aktywacji przed meczem: wybrane miejsce, dostępność, czas, limit sesji lub rezerwa pełnego odpoczynku nie pozwalają na ten blok."
              : "Nie dodano aktywacji przed meczem: wybrane miejsce, dostępność, czas lub limit sesji nie pozwalają na ten blok.",
          });
      } else if (after) {
        const attempt = placeSupport(best, i, buildRecovery(p, phase), p, options, matches);
        if (attempt) best = attempt;
      }
    }
    const supportKind = mobilityRecipe ? null : policy.support;
    if (supportKind) {
      const supportRecipe = (secondSession: boolean) =>
        supportKind === "skills"
          ? buildSkills(p, phase, {
              rotation: cycle.weekIndex,
              budget: options.minutesPerSession ?? 75,
              secondSession,
            })
          : buildMobility(p, phase);
      let fitted = false;
      // A day of its own first; only then next to club training or another own session.
      const free = (d: SessionDay) => d.dayType !== "club" && own(d).length === 0;
      for (const pass of [true, false]) {
        if (fitted) break;
        for (let i = 0; i < 7; i++) {
          if ([...matches].some((m) => Math.abs(dayDistance(best[i].date, m)) <= 1)) continue;
          if (free(best[i]) !== pass) continue;
          const attempt = placeSupport(best, i, supportRecipe(!pass), p, options, matches);
          if (attempt) {
            best = attempt;
            fitted = true;
            break;
          }
        }
      }
      if (!fitted)
        issues.push({
          code: "UNMET_GOAL_SUPPORT",
          date: base[0].date,
          message:
            supportKind === "skills"
              ? "Nie dodano techniki: sprawdź piłkę, miejsce i dostępność."
              : "Nie znaleziono miejsca na dodatkową mobilność bez naruszania pozostałych ograniczeń.",
        });
    }
    if (options.fillRestDays) {
      let rotation = cycle.weekIndex;
      for (let i = 0; i < best.length && fullRestCount(best) > minFullRestDays; i++) {
        const d = best[i];
        if (
          d.dayType !== "rest" ||
          d.engineV2 ||
          d.secondSession ||
          d.externalCommitment ||
          d.executionProtected ||
          d.isUnavailable ||
          [...matches].some((m) => Math.abs(dayDistance(d.date, m)) <= 1)
        )
          continue;
        const skills = buildSkills(p, phase, { rotation });
        const mobility = buildMobility(p, phase);
        const recipes = rotation % 2 ? [mobility, skills] : [skills, mobility];
        for (const recipe of [...recipes, buildRecovery(p, phase)]) {
          const attempt = placeSupport(best, i, recipe, p, options, matches);
          if (attempt) {
            best = attempt;
            rotation++;
            break;
          }
        }
      }
    }
    if (fullRestCount(best) < minFullRestDays)
      issues.push({
        code: "UNMET_REST_TARGET",
        date: base[0].date,
        message: `Tydzień ${week + 1}: pozostało ${fullRestCount(best)} z ${minFullRestDays} pełnych dni odpoczynku. Kalendarz klubowy, mecze lub zachowane wykonania zajmują pozostałe dni.`,
      });
    if (options.weeklyTargets) {
      const sessions = best.flatMap(own);
      const planned = {
        strength: sessions.filter((s) =>
          s.engineV2!.roles.some((r) => r === "strengthA" || r === "strengthB"),
        ).length,
        speed: sessions.filter((s) => s.engineV2!.roles.includes("speed")).length,
        endurance: sessions.filter((s) => s.engineV2!.roles.includes("endurance")).length,
      };
      for (const kind of ["strength", "speed", "endurance"] as const) {
        const requested = options.weeklyTargets[kind];
        if (planned[kind] >= requested) continue;
        const reasons = [...new Set(targetRejections[kind].map((r) => r.message))];
        const reasonCodes = [...new Set(targetRejections[kind].map((r) => r.code))];
        issues.push({
          code: "UNMET_GOAL_TARGET",
          target:
            kind !== "strength"
              ? kind
              : sessions.some((s) => s.engineV2!.roles.includes("strengthA"))
                ? "strengthB"
                : "strengthA",
          date: base[0].date,
          reasonCodes: reasonCodes.length ? reasonCodes : ["NO_ELIGIBLE_RECIPE"],
          message: `Tydzień ${week + 1}: zaplanowano ${planned[kind]} z ${requested} sesji ${{ strength: "siły", speed: "sprintu", endurance: "wydolności" }[kind]}. ${reasons.length ? reasons.join(" ") : "Brak dopuszczonego wariantu przy zadanym sprzęcie, czasie i przygotowaniu."}`,
        });
      }
    }
    // Strength is judged on the complete week: sprint, runs, club and matches placed later count too.
    best = finalizeStrengthWeek(best, p, options, [...(options.precedingDays ?? []), ...plan]);
    for (const d of best) {
      if (d.executionProtected) continue;
      for (const session of own(d)) {
        for (const decision of session.engineV2!.gymProgressionDecisions ?? [])
          if (decision.action === "omit")
            issues.push({
              code: "ADAPTED_STRENGTH_STIMULUS",
              date: d.date,
              message: `${getExerciseDefinition(decision.exerciseId)?.displayNamePl ?? "Zadanie siłowni"}: ${decision.reason}`,
            });
        const omitted = session.engineV2!.strengthTimeOmissions;
        if (omitted?.length)
          issues.push({
            code: "REDUCED_STRENGTH_TIME",
            date: d.date,
            message: `Krótszy wariant siłowni: ze względu na dostępny czas pominięto opcjonalne zadania: ${[...new Set(omitted.map((row) => ROLE_NAMES[row.role]))].join(", ")}. Zachowano przygotowanie i główne wzorce sesji.`,
          });
      }
    }
    attachCycle(best, cycle);
    best.forEach((d) => {
      if (!d.executionProtected)
        for (const s of own(d)) {
          s.blockWeekNumber = (cycle.weekIndex % 4) + 1;
        }
    });
    plan.push(...best);
  }
  const violations = validateTrainingPlan(plan, p, options);
  if (plan[0]) {
    plan[0].enginePlanIssues = [...issues, ...violations];
    plan[0].engineTimeBudgetMin = options.minutesPerSession ?? 75;
    plan[0].planInputs = {
      matchDates: [...(p.matchDates ?? [])].sort(),
      individualTrainingDays: [...p.individualTrainingDays].sort((a, b) => a - b),
      unavailableDays: [...(p.unavailableDays ?? [])].sort((a, b) => a - b),
      clubTrainingDays: [...p.clubTrainingDays].sort((a, b) => a - b),
      unavailableEquipmentIds: [...(p.unavailableEquipmentIds ?? [])].sort(),
      equipment: [...p.equipment].sort(),
      minutesPerSession: options.minutesPerSession ?? 75,
      ...(options.weeklyTargets ? { weeklyTargets: { ...options.weeklyTargets } } : {}),
      ...(options.fillRestDays !== undefined ? { fillRestDays: options.fillRestDays } : {}),
      ...(options.minFullRestDays !== undefined
        ? { minFullRestDays: options.minFullRestDays }
        : {}),
    };
  }
  return {
    version: ENGINE_VERSION,
    expectedPlanId: options.expectedPlanId ?? null,
    minutesPerSession: options.minutesPerSession ?? 75,
    plan,
    issues: [...issues, ...violations],
    tier,
  };
}

/** Independent validation of final output, not a second plan mutator. */
export function validateTrainingPlan(
  plan: SessionDay[],
  p: Profile,
  options: EngineOptions,
): Issue[] {
  const errors: Issue[] = [],
    seen = new Set<string>();
  const matches = new Set(
    scheduledMatchDates(p, plusDays(options.startDate, -7), plan.length + 14),
  );
  const fail = (code: string, date: string, message: string) =>
    errors.push({ code, date, message });
  for (const d of plan) {
    if (seen.has(d.date)) fail("DUPLICATE_DATE", d.date, "Powtórzona data.");
    seen.add(d.date);
    if (!d.executionProtected) {
      const mainRoles = own(d).flatMap((s) => s.engineV2!.roles);
      const strengthCount = mainRoles.filter((r) => r.startsWith("strength")).length;
      if (strengthCount > 1) fail("TWO_STRENGTH_SAME_DAY", d.date, "Dwie siłownie w jednym dniu.");
      if (strengthCount && mainRoles.includes("speed"))
        fail(
          "STRENGTH_SPEED_SEPARATE",
          d.date,
          "Siłownia i sprint wymagają osobnych dni w tym programie.",
        );
    }
    if (d.secondSession?.secondSession) fail("THIRD_SLOT", d.date, "Trzeci slot w dniu.");
    for (const s of own(d)) {
      if (d.executionProtected) continue;
      const r = s.engineV2!;
      errors.push(...validateEngineSession(s, p, options));
      const supportOnly = r.roles.every((role) =>
        ["activation", "recovery", "mobility", "skills"].includes(role),
      );
      if (
        hasReadinessStop(options.readiness?.[d.date]) ||
        (!supportOnly && options.readiness?.[d.date] && options.readiness[d.date].overall <= 4)
      )
        fail("READINESS_CONFLICT", d.date, "Bieżący check-in wymaga ponownego ułożenia treningu.");
      if (
        matches.has(d.date) ||
        (!supportOnly &&
          [...matches].some((m) => Math.abs(dayDistance(d.date, m)) <= 1) &&
          !(r.postMatch && isPostMatchDate(d.date, matches)))
      )
        fail("MATCH_BUFFER", d.date, "Trening własny w buforze meczu.");
      if (
        p.unavailableDays?.includes(weekday(d.date)) ||
        !p.individualTrainingDays.includes(weekday(d.date))
      )
        fail("UNAVAILABLE", d.date, "Niedostępny termin.");
      if (r.minutes > (options.minutesPerSession ?? 75))
        fail("TIME_LIMIT", d.date, "Przekroczony czas.");
      if (r.sprintMetres > 240) fail("SPRINT_LIMIT", d.date, "Ponad 240 m sprintu.");
      for (const e of r.exercises) {
        if (!eligibleExercise(e.exerciseId, p, e.role))
          fail("INELIGIBLE_EXERCISE", d.date, e.exerciseId);
        // validateEngineSession already checks duplicate work, including explicit preparation.
        if (
          !Number.isInteger(e.dose.sets) ||
          e.dose.sets <= 0 ||
          !Number.isFinite(e.dose.restSeconds) ||
          e.dose.restSeconds < 0 ||
          (!e.dose.reps && !e.dose.seconds) ||
          [e.dose.reps, e.dose.seconds, e.dose.distanceM].some(
            (v) => v !== undefined && (!Number.isFinite(v) || v <= 0),
          )
        )
          fail("INVALID_DOSE", d.date, e.exerciseId);
      }
      if (
        r.highLower &&
        [...(options.precedingDays ?? []), ...plan].some(
          (prev) => dayDistance(d.date, prev.date) === 1 && highLowerDay(prev, p),
        )
      )
        fail("CONSECUTIVE_HIGH_LOWER", d.date, "Ciężkie obciążenie nóg dzień po dniu.");
      if (
        isStrengthRecipe(r) &&
        r.postMatch !== "upper" &&
        [...(options.precedingDays ?? []), ...plan].some(
          (prev) => Math.abs(dayDistance(d.date, prev.date)) === 1 && hasKnownStrengthLoad(prev, p),
        )
      )
        fail("CONSECUTIVE_STRENGTH", d.date, "Siłownie A/B wymagają co najmniej dnia przerwy.");
      // The ramp-up note is guidance added later; plans saved before it must stay valid.
      const plain = (value: unknown) =>
        JSON.stringify(value, (key, item) =>
          key === "cue" &&
          typeof item === "string" &&
          item.startsWith("Przed pierwszą serią roboczą")
            ? undefined
            : item,
        );
      const fresh = render(s.date, r, p);
      if (
        plain(s.structuredSections) !== plain(fresh.structuredSections) ||
        plain(s.sections) !== plain(fresh.sections)
      )
        fail("DOSE_MISMATCH", d.date, "Dawka wykonania różni się od decyzji silnika.");
    }
  }
  return errors;
}

/* Primitives for adjustments after feedback. They reuse the generator's builders, placement
 * gate and renderer, so an adjusted session passes the same checks as a planned one. */

export interface AdjustmentRecipe {
  kind: "lighter" | "compact";
  recipe: EngineSession;
}
/** Rebuild an existing A/B slot on its saved date through the same builders and renderer.
 * The caller protects executed/manual slots and validates the complete resulting week. */
export function refreshStrengthSession(
  session: SessionDay,
  p: Profile,
  options: EngineOptions,
  days: SessionDay[],
): SessionDay | null {
  const old = session.engineV2;
  if (!old || !old.roles.some((r) => r === "strengthA" || r === "strengthB")) return null;
  const cycle = cycleForWeek(p, options, session.date);
  const budget = options.minutesPerSession ?? 75;
  let base = strengthBase(
    p,
    old.roles.includes("strengthA") ? "A" : "B",
    cycle.phase,
    cycleStartEffect(options).rotate ? 1 : 0,
  );
  // A session on the day after a match keeps its post-match shape.
  if (old.postMatch) base = { ...base, postMatch: old.postMatch };
  // An accepted shorter variant (feedback correction) stays short; otherwise the generator's rule.
  if (old.variant === "compact" && session.feedbackAdjustments?.length)
    base = fitStrengthToBudget(base, Math.min(budget, session.durationMin));
  const recipe = finalizeStrengthRecipe(base, p, session.date, options, days, budget);
  if (!recipe) return null;
  recipe.cycle = cycle.cycle;
  const fresh = render(session.date, recipe, p);
  return {
    ...session,
    ...fresh,
    dbId: undefined,
    dayDbId: session.dayDbId,
    planDbId: session.planDbId,
    cycleId: session.cycleId,
    mdLabel: session.mdLabel,
    slotLabel: session.slotLabel,
    secondSession: session.secondSession,
  };
}
const doseWeight = (r: EngineSession) =>
  r.exercises.reduce(
    (sum, e) => sum + e.dose.sets * (e.dose.reps ?? (e.dose.seconds ? e.dose.seconds / 10 : 1)),
    0,
  );

/** Existing lighter routes only: the reduced route, then the compact strength variant. */
export function lighterRecipes(
  session: SessionDay,
  p: Profile,
  minutesPerSession: number,
): AdjustmentRecipe[] {
  const r = session.engineV2;
  if (!r) return [];
  const out: AdjustmentRecipe[] = [];
  const light = routedProfile({ ...p, secondaryLimiter: "fatigue" }, p.goal);
  const strength = r.roles.includes("strengthA") || r.roles.includes("strengthB");
  let reduced: EngineSession | null = null;
  if (strength)
    reduced = fitStrengthToBudget(
      buildStrength(
        light,
        r.roles.includes("strengthA") ? "A" : "B",
        r.phase,
        r.exerciseRotation ?? 0,
      ),
      minutesPerSession,
    );
  else if (r.roles.includes("speed"))
    reduced = buildRunning(light, "speed", r.phase, { force: r.sprintVariant });
  else if (r.roles.includes("endurance"))
    reduced = plannedEndurance(p, session.date, r.phase, true);
  if (reduced && strength && r.postMatch) reduced = { ...reduced, postMatch: r.postMatch };
  if (reduced && reduced.minutes <= r.minutes && doseWeight(reduced) < doseWeight(r))
    out.push({ kind: "lighter", recipe: reduced });
  if (strength && r.variant !== "compact") {
    const compact = fitStrengthToBudget(r, Math.floor(r.minutes * 0.75));
    if (compact.variant === "compact" && compact.minutes < r.minutes)
      out.push({ kind: "compact", recipe: compact });
  }
  for (const item of out) {
    item.recipe.cycle = r.cycle ? { ...r.cycle } : item.recipe.cycle;
    item.recipe.phase = r.phase;
  }
  return out;
}

export type AdjustmentPlacement =
  { plan: SessionDay[]; session: SessionDay } | { blocked: { code: string; message: string } };

/** Places a recipe on a date of a flat plan through the shared gate and renderer. */
export function placeRecipeOnDate(
  plan: SessionDay[],
  date: string,
  recipe: EngineSession,
  p: Profile,
  options: EngineOptions,
): AdjustmentPlacement {
  const index = plan.findIndex((d) => d.date === date);
  if (index < 0) return { blocked: { code: "INVALID_DATE", message: "Brak daty w planie." } };
  const matches = new Set(
    scheduledMatchDates(p, plusDays(options.startDate, -7), plan.length + 14),
  );
  const attempt = place(plan, index, recipe, p, options, matches, options.precedingDays ?? []);
  if (!("state" in attempt)) return { blocked: attempt.blocked };
  const before = plan[index];
  const after = attempt.state[index];
  const day = {
    ...after,
    dayDbId: before.dayDbId,
    planDbId: before.planDbId,
    cycleId: before.cycleId,
  };
  const secondMode = !!after.secondSession && after.secondSession !== before.secondSession;
  const session = secondMode ? day.secondSession! : day;
  return { plan: attempt.state.map((d, i) => (i === index ? day : d)), session };
}

/** Removes one unstarted own session; a second own session of that day stays as it is. */
export function removeOwnSession(
  plan: SessionDay[],
  sessionId: string,
  p: Profile,
  options: EngineOptions,
): SessionDay[] | null {
  const index = plan.findIndex((d) => slots(d).some((s) => s.dbId === sessionId));
  if (index < 0) return null;
  const current = plan[index];
  if (slots(current).some((s) => s.executionProtected) || current.executionProtected) return null;
  if (current.secondSession?.dbId === sessionId)
    return plan.map((d, i) => (i === index ? { ...d, secondSession: null } : d));
  if (current.dbId !== sessionId || !current.engineV2) return null;
  const second = current.secondSession;
  if (second) {
    // The other own session of the day becomes the day's session; its prescription is untouched.
    if (!second.engineV2 || second.executionProtected) return null;
    const promoted: SessionDay = {
      ...second,
      secondSession: null,
      dayDbId: current.dayDbId,
      planDbId: current.planDbId,
      cycleId: current.cycleId,
      mdLabel: current.mdLabel,
    };
    return plan.map((d, i) => (i === index ? promoted : d));
  }
  const matches = new Set(
    scheduledMatchDates(p, plusDays(options.startDate, -7), plan.length + 14),
  );
  const shell = {
    ...day(current.date, p, matches),
    dayDbId: current.dayDbId,
    planDbId: current.planDbId,
    cycleId: current.cycleId,
    mdLabel: current.mdLabel,
  };
  return plan.map((d, i) => (i === index ? shell : d));
}
