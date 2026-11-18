import {
  automaticWeeklyTargets,
  isAutomaticSprintTarget,
  shouldTryExtraSprint,
} from "../weeklyPlanningPreferences";
import {
  resolveSessionDurationMode,
  serializedSessionMinutes,
  sessionTimeBudget,
  type SessionDurationMode,
} from "./sessionDurationPolicy";
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
import { MAIN_STRENGTH_ROLES } from "../mainStrengthExclusions";
import { ENGINE_VERSION, trainingTier, plusDays, weekday, dayDistance, ROLE_NAMES } from "./model";
import type { EngineResult, EngineOptions, EngineSession, Issue, LimitationCause } from "./model";
import { limitationText, roleLimitation } from "./limitations";
import { placementCause, strengthCompleteness } from "./strengthCompleteness";
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
import { adjustedForReadiness, hasReadinessStop } from "./planStatus";
import { readinessScore } from "../readinessModel";
import { APP_MINIMUM_AGE, preparationProfile, hasVerifiedAdvancedStrength } from "./preparation";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import { applyGymProgression } from "./gymProgression";
import { renderStrengthPairs } from "./strengthPairs";
import {
  type AdvancedTemplateId,
  attemptAdvancedStrength,
  lighterAdvanced,
  progressAdvanced,
  shortenAdvanced,
  withoutAdvancedRows,
  coachNameOf,
} from "./advancedSessions";
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
    recipe.postMatch === "upper"
      ? ["push", "pull"]
      : ["knee_strength", "hip_strength", "unilateral_strength"];
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

/** Structural cause of a sprint goal replaced by an alternative; neutral reasons have none. */
const SPRINT_CHANGE_CAUSE: Record<string, LimitationCause | undefined> = {
  SPACE_UNDECLARED: "equipment",
  SPACE_SHORT: "equipment",
  NO_PITCH: "equipment",
  NO_PARTNER: "equipment",
  NOT_COACHED: "preparation",
  LEVEL: "preparation",
  COMPETENCE: "preparation",
  NOT_ELIGIBLE: "recipe",
  NO_QUALIFIED_VARIANT: "recipe",
};

/** Known landings of all jump work already placed in a week (gym and sprint blocks). */
function weekLandingsOf(days: readonly SessionDay[]): number {
  return days.flatMap(slots).reduce((n, s) => n + (s.engineV2?.plyometricContacts ?? 0), 0);
}

function render(
  date: string,
  recipe: EngineSession,
  p: Profile,
  mode?: SessionDurationMode,
): SessionDay {
  if (mode) recipe = { ...recipe, sessionDurationMode: mode };
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
    const holds = d.holdReps !== undefined;
    const text = holds
      ? `${d.holdReps}${d.seconds ? ` × ${d.seconds} s` : ""}${d.perSide ? " / stronę" : ""}`
      : d.seconds
        ? `${d.seconds} s${d.perSide ? " / stronę" : ""}`
        : d.distanceM
          ? `${d.runInM ? `${d.runInM} m nabiegu + ` : ""}${d.distanceM} m${d.perSide ? " / stronę" : ""}`
          : `${d.reps}${d.perSide ? " / stronę" : ""}`;
    const exercise = hydrateTrainingExerciseFromDefinition({
      id: `${date}:${e.role}:${index}`,
      exerciseId: e.exerciseId,
      name: getExerciseDefinition(e.exerciseId)!.displayNamePl,
      sets: String(d.sets),
      reps: d.seconds && !holds ? undefined : text,
      duration: d.seconds && !holds ? text : undefined,
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
      ...coachNaming(e),
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
  const budget = sessionTimeBudget(options);
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
  capRunningTime(
    recipe,
    "Zmniejszono czas ze względu na zadeklarowany powrót lub ograniczenie zmęczeniem; bez rozpoznawania przyczyny zdrowotnej.",
  );
  return recipe;
}

/**
 * A placed calm run shortened by the existing reduced-route rule (no block over 15 minutes),
 * rendered again so its sections, dose and tools carry the shorter run. Null when already shorter.
 */
export function capEnduranceSession(session: SessionDay, p: Profile): SessionDay | null {
  const recipe = session.engineV2;
  if (!recipe?.runningRecipe || !recipe.roles.includes("endurance")) return null;
  const capped = capRunningTime(
    structuredClone(recipe),
    "Skrócono bieg po dzisiejszym check-inie (obniżona gotowość): spokojnie, bez mocnych odcinków.",
  );
  if (!(capped.minutes < recipe.minutes)) return null;
  const fresh = render(session.date, capped, p, recipe.sessionDurationMode ?? "limited");
  return {
    ...session,
    ...fresh,
    dbId: session.dbId,
    dayDbId: session.dayDbId,
    planDbId: session.planDbId,
    cycleId: session.cycleId,
    mdLabel: session.mdLabel,
    slotLabel: session.slotLabel,
    secondSession: session.secondSession,
  };
}

/** The existing reduced-route rule: no running block longer than 15 minutes, as easy work. */
const REDUCED_RUN_BLOCK_SECONDS = 15 * 60;
function capRunningTime(recipe: EngineSession, reason: string): EngineSession {
  const running = recipe.runningRecipe;
  if (!running) return recipe;
  for (const block of running.blocks) {
    block.work.seconds = Math.min(block.work.seconds, REDUCED_RUN_BLOCK_SECONDS);
    block.work.label = `${block.work.seconds / 60} min spokojnie`;
  }
  for (const exercise of recipe.exercises) exercise.dose.seconds = running.blocks[0].work.seconds;
  running.reasons.push(reason);
  recipe.minutes = recipeTotalSeconds(running) / 60;
  return recipe;
}

/**
 * One rule for every strength recipe (new plan, week finalisation, proposals and corrections):
 * settle the final dose first (focus, then verified progression), only then fit the time budget.
 * When the full session does not fit, the existing compact variant is tried; otherwise null.
 */
/** A note row done with the coach's own exercise shows the coach's own name. */
function coachNaming(e: { noteSlot?: { text: string }; substituteFor?: string }) {
  const name = e.noteSlot && !e.substituteFor ? coachNameOf(e.noteSlot.text) : null;
  return name ? { coachName: name, name } : {};
}

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
    // The shortened note still exceeds the time budget (the only way finalizeAdvanced gives up):
    // the usual A/B session takes over, and the session says why.
    const requested = base.advancedTemplate;
    base = buildStrength(
      routedProfile(p, resolveGoalPolicy(p).strengthGoal),
      base.roles.includes("strengthA") ? "A" : "B",
      base.phase,
      base.exerciseRotation ?? 0,
    );
    base.strengthPath = {
      path: "standard",
      code: "NOTE_TIME_BUDGET",
      cause: "time",
      ...(requested ? { requestedTemplate: requested } : {}),
      message: `Notatka nie mieści się w dostępnym czasie (${budget} min), nawet skrócona. Zastosowano zwykłą siłę A/B.`,
    };
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
  weekDate?: string,
  keep?: AdvancedTemplateId,
): EngineSession {
  // The athlete's notes alternate by calendar week (Monday-based), stable across rebuilds.
  const week = weekDate ? Math.floor(dayDistance(weekDate, "1970-01-05") / 7) : 0;
  const attempt = attemptAdvancedStrength(p, variant, phase, rotation + week, keep);
  const notes = attempt.session;
  if (notes) {
    // "vary" starts the cycle with the other note; the usual A/B fallback keeps the same rotation.
    if (rotation > 0) notes.exerciseRotation = rotation;
    if (attempt.path) notes.strengthPath = attempt.path;
    return notes;
  }
  const usual = buildStrength(
    routedProfile(p, resolveGoalPolicy(p).strengthGoal),
    variant,
    phase,
    rotation,
  );
  // The usual A/B session says why the notes were not used (only for players with a gym).
  if (p.hasGym && attempt.path) usual.strengthPath = attempt.path;
  return usual;
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
  let r = base;
  // A lighter, maintenance or re-entry week keeps the note's structure with a round less;
  // deload and re-entry also leave out drop/depth jumps.
  if (["maintenance", "deload", "reentry"].includes(focus.mode) || base.phase === "deload") {
    r = lighterAdvanced(r, focus.mode !== "maintenance" || base.phase === "deload");
    // The lighter week is recorded like any other (the note's own weeks carry no focus label).
    if (["maintenance", "deload", "reentry"].includes(focus.mode)) r.strengthFocus = focus;
  }
  // "Jeśli nie ma meczu": within three days of a match (closer, the week is already maintenance).
  const nearMatch = scheduledMatchDates(p, plusDays(date, -3), 7).some(
    (m) => Math.abs(dayDistance(date, m)) <= 3,
  );
  if (nearMatch && r.skipNearMatch?.length) r = withoutAdvancedRows(r, new Set(r.skipNearMatch));
  r = progressAdvanced(r, (x) => applyGymProgression(x, p, date, options, days));
  // Too long: a short note (main lift and upper body stay), then a round less.
  if (r.minutes > budget) {
    const full = r;
    r = shortenAdvanced(r, budget);
    const fewerRounds = r.minutes > budget;
    if (fewerRounds) r = lighterAdvanced(r, false, false);
    // Leaving out only the note's optional accessories ("wedle uznania") is still the whole
    // note; anything more is the compact variant, with the rows left out recorded and shown.
    const kept = new Set(r.exercises.map((e) => e.exerciseId));
    const optional = new Set(full.optionalExercises ?? []);
    const omitted = full.exercises
      .filter((e) => !kept.has(e.exerciseId))
      .map((e) => ({ exerciseId: e.exerciseId, role: e.role }));
    if (fewerRounds || omitted.some((e) => !optional.has(e.exerciseId))) {
      r.variant = "compact";
      if (omitted.length) r.strengthTimeOmissions = omitted;
    }
  }
  r.highLower = deriveEngineSessionLoad(r, p).highLower;
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
          weekLandings: weekLandingsOf(days),
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
    const budget = sessionTimeBudget(options);
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
      sessionTimeBudget(options),
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
  const session = render(current.date, recipe, p, resolveSessionDurationMode(options));
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
    session = render(current.date, recipe, p, resolveSessionDurationMode(options));
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
    recipe.minutes > sessionTimeBudget(options) ||
    own(d).some((s) => s.engineV2!.roles.some((r) => recipe.roles.includes(r)))
  )
    return null;
  if (hasReadinessStop(options.readiness?.[d.date])) return null;
  if (d.secondSession) return null;
  const occupied = d.dayType === "club" || own(d).length > 0;
  if (occupied && p.doubleSessionsAllowed === "no") return null;
  const session = render(d.date, recipe, p, resolveSessionDurationMode(options));
  session.mdLabel = d.mdLabel;
  return days.map((day, i) =>
    i !== index ? day : occupied ? { ...day, secondSession: session } : session,
  );
}

const TARGET_NAMES = {
  strengthA: "siłę A",
  strengthB: "siłę B",
  speed: "sprint",
  endurance: "wydolność",
  mobility: "mobilność",
} as const;

/**
 * A weekly target left without a session, with its structural cause. "Nie znaleziono terminu"
 * is reserved for a real calendar problem; a missing recipe, equipment, preparation or time
 * budget say what they are.
 */
function unmetTargetIssue(input: {
  role: "strengthA" | "strengthB" | "speed" | "endurance" | "mobility";
  recipe: EngineSession | null;
  usable: boolean;
  rejections: Array<{ code: string; message: string }>;
  profile: Profile;
  week: number;
  date: string;
}): Issue {
  const { role, recipe, usable, rejections, profile: p, week, date } = input;
  const name = TARGET_NAMES[role];
  const prefix = `Tydzień ${week + 1}: `;
  if (!usable) {
    const strength = role.startsWith("strength");
    const why = strength
      ? roleLimitation(p, role === "strengthA" ? "knee_strength" : "hip_strength")
      : null;
    const cause: LimitationCause = why?.cause ?? (recipe ? "recipe" : sessionLimitation(p, role));
    return {
      code: "UNMET_WEEKLY_TARGET",
      target: role,
      date,
      cause,
      message: `${prefix}brak sesji: ${name}. ${
        strength
          ? limitationText(cause, role === "strengthA" ? "knee_strength" : "hip_strength")
          : cause === "equipment"
            ? "Brakuje sprzętu lub miejsca wymaganego przez receptury tego celu."
            : cause === "preparation"
              ? "Receptury tego celu wymagają przygotowania, którego profil jeszcze nie potwierdza; deklaracji nie podnosimy po to, by je odblokować."
              : "Brak dopuszczonej receptury tego celu."
      }`,
    };
  }
  const causes = new Set(rejections.map((r) => placementCause(r.code)));
  const reasons = [...new Set(rejections.map((r) => r.message))];
  if (causes.size > 0 && !causes.has("calendar"))
    return {
      code: "UNMET_WEEKLY_TARGET",
      target: role,
      date,
      cause: "time",
      message:
        `${prefix}${name} nie mieści się w dostępnym czasie sesji, nawet w krótszym wariancie. ${reasons.join(" ")}`.trim(),
    };
  return {
    code: "UNMET_WEEKLY_TARGET",
    target: role,
    date,
    cause: "calendar",
    message: `${prefix}nie znaleziono terminu na ${name}. ${reasons.join(" ")}`.trim(),
  };
}

/** Cause of a missing sprint/endurance/mobility recipe from what the profile declares. */
function sessionLimitation(p: Profile, role: string): LimitationCause {
  if (role === "speed" && !p.hasSprintSpace && !p.hasPitch) return "equipment";
  return "recipe";
}

export function generateTrainingPlan(p: Profile, options: EngineOptions): EngineResult {
  const saved = options.previousPlan?.find((d) => d.planInputs)?.planInputs;
  // An omitted setting continues the saved request; an explicit undefined resets it to auto.
  options = {
    ...options,
    ...(!Object.hasOwn(options, "weeklyTargets") && saved?.weeklyTargets !== undefined
      ? { weeklyTargets: automaticWeeklyTargets(saved.weeklyTargets) }
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
    options.sessionDurationMode !== undefined &&
    !["full", "limited"].includes(options.sessionDurationMode)
  )
    throw new Error("Wybierz pełną jednostkę albo jawny limit czasu.");
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
      !["auto", 1, 2].includes(options.weeklyTargets.speed) ||
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
    const weekDate = plusDays(options.startDate, week * 7);
    const strengthB = () => strengthBase(p, "B", phase, rotation, weekDate);
    const strengthTasks = [
      strengthBase(p, "A", phase, rotation, weekDate),
      mobilityRecipe ?? strengthB(),
    ];
    const tasks = [
      ...strengthTasks,
      buildRunning(routedProfile(p, policy.speedGoal), "speed", phase, {
        history: sprintHistory(
          [...(options.precedingDays ?? []), ...(options.lockedDays ?? []), ...plan],
          options.previousPlan,
          base[0].date,
        ),
        // The jump work the week's gym sessions already carry limits a sprint plyometric block.
        weekLandings: strengthTasks.reduce((n, r) => n + (r.plyometricContacts ?? 0), 0),
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
        // Any dynamic leg pattern keeps the session (valuable bodyweight work such as Nordic,
        // jumps and planks stays); a missing loaded main lift is reported, not padded.
        recipe.exercises.some((e) =>
          ["knee_strength", "hip_strength", "unilateral_strength", "knee_flexion"].includes(e.role),
        ))
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
                (s) =>
                  s.engineV2!.roles.includes(id) &&
                  s.engineV2!.postMatch !== "upper" &&
                  // The label alone is not the stimulus: the main leg pattern must be there.
                  strengthCompleteness(s.engineV2!).complete,
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
    const reportedMain = new Set<string>();
    tasks.forEach((recipe, t) => {
      const role = ids[t];
      if (
        !best.some((d) => own(d).some((s) => s.engineV2!.roles.includes(role))) &&
        !(singleStrengthWeek && role.startsWith("strength"))
      ) {
        const missing = unmetTargetIssue({
          role,
          recipe,
          usable: available.some((task) => task.id === role),
          rejections: solved.rejections[role] ?? [],
          profile: p,
          week,
          date: base[0].date,
        });
        if (role === "speed" && isAutomaticSprintTarget(options.weeklyTargets?.speed)) {
          issues.push({
            ...missing,
            code: "AUTO_SPRINT_CONTEXT",
            message: `Tydzień ${week + 1}: nie dodano osobnej jednostki sprintu przy obecnym kalendarzu i warunkach. ${missing.message.replace(/^Tydzień \d+: /, "")}`,
          });
        } else issues.push(missing);
      }
      if (recipe)
        for (const role of recipe.missing) {
          if (MAIN_STRENGTH_ROLES.has(role) || role === "knee_flexion") reportedMain.add(role);
          const why = MAIN_STRENGTH_ROLES.has(role)
            ? roleLimitation(p, role)
            : { cause: "recipe" as const, blocked: [] };
          issues.push({
            code: "UNMET_STIMULUS",
            date: base[0].date,
            cause: why.cause,
            message: MAIN_STRENGTH_ROLES.has(role)
              ? `Brak wariantu z obciążeniem: ${ROLE_NAMES[role]}. ${limitationText(why.cause, role)} Przysiad, most, wykrok z masą ciała ani pompka na podwyższeniu nie zastępują tej pracy.`
              : `Nie znaleziono odpowiedniego ćwiczenia: ${ROLE_NAMES[role]}. Ten cel pozostaje niepokryty.`,
          });
        }
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
      shouldTryExtraSprint(p, options.weeklyTargets?.speed) &&
      best.flatMap(own).filter((s) => s.engineV2!.roles.includes("speed")).length === 1
    ) {
      const recipe = buildRunning(routedProfile(p, policy.speedGoal), "speed", phase, {
        history: sprintHistory(
          [...(options.precedingDays ?? []), ...plan, ...best],
          options.previousPlan,
          plusDays(base[6].date, 1),
        ),
        weekLandings: weekLandingsOf(best),
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
        const dayReadiness = options.readiness?.[best[i].date];
        const allowJump =
          !policy.reduced &&
          (dayReadiness ? (readinessScore(dayReadiness) ?? dayReadiness.overall) : 10) > 4;
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
              budget: sessionTimeBudget(options),
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
        cause: "calendar",
        message: `Tydzień ${week + 1}: pozostało ${fullRestCount(best)} z ${minFullRestDays} pełnych dni odpoczynku. Kalendarz klubowy, mecze lub zachowane wykonania zajmują pozostałe dni.`,
      });
    if (options.weeklyTargets) {
      const sessions = best.flatMap(own);
      const planned = {
        strength: sessions.filter(
          (s) =>
            s.engineV2!.roles.some((r) => r === "strengthA" || r === "strengthB") &&
            strengthCompleteness(s.engineV2!).coverage !== "partial",
        ).length,
        speed: sessions.filter((s) => s.engineV2!.roles.includes("speed")).length,
        endurance: sessions.filter((s) => s.engineV2!.roles.includes("endurance")).length,
      };
      for (const kind of ["strength", "speed", "endurance"] as const) {
        const requested = options.weeklyTargets[kind];
        if (requested === "auto" || planned[kind] >= requested) continue;
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
          cause: targetRejections[kind].length
            ? targetRejections[kind].some((r) => placementCause(r.code) === "calendar")
              ? "calendar"
              : "time"
            : kind === "strength"
              ? roleLimitation(p, "knee_strength").cause
              : "recipe",
          message: `Tydzień ${week + 1}: zaplanowano ${planned[kind]} z ${requested} ${kind === "strength" ? "pełnych sesji siły" : `sesji ${{ speed: "sprintu", endurance: "wydolności" }[kind]}`}. ${reasons.length ? reasons.join(" ") : "Brak dopuszczonego wariantu przy zadanym sprzęcie, czasie i przygotowaniu."}`,
        });
      }
    }
    // Strength is judged on the complete week: sprint, runs, club and matches placed later count too.
    best = finalizeStrengthWeek(best, p, options, [...(options.precedingDays ?? []), ...plan]);
    const sprintNoted = new Set<string>();
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
        const change = session.engineV2!.sprintVariant?.goalChange;
        if (change && !sprintNoted.has(change.code)) {
          sprintNoted.add(change.code);
          const cause = SPRINT_CHANGE_CAUSE[change.code];
          issues.push({
            code: "SPRINT_GOAL_CHANGED",
            date: d.date,
            target: "speed",
            ...(cause ? { cause } : {}),
            message: `Tydzień ${week + 1}: ${change.reason}`,
          });
        }
        const path = session.engineV2!.strengthPath;
        if (path?.cause)
          issues.push({
            code: "STRENGTH_PATH_FALLBACK",
            date: d.date,
            cause: path.cause,
            message: path.message,
          });
        const coverage = isStrengthRecipe(session.engineV2!)
          ? strengthCompleteness(session.engineV2!)
          : null;
        // Already reported for the week (UNMET_STIMULUS) or for this very session: not twice.
        const reported =
          [...reportedMain].some((r) =>
            ["knee_strength", "hip_strength", "unilateral_strength", "knee_flexion"].includes(r),
          ) ||
          session.engineV2!.missing.some((r) =>
            ["knee_strength", "hip_strength", "unilateral_strength", "knee_flexion"].includes(r),
          );
        if (coverage?.coverage === "partial" && !reported) {
          const absent = coverage.absent[0];
          const why = roleLimitation(p, absent);
          issues.push({
            code: "INCOMPLETE_STRENGTH",
            date: d.date,
            cause: why.cause,
            target: session.engineV2!.roles.includes("strengthA") ? "strengthA" : "strengthB",
            message: `Sesja siłowa ${d.date} jest niepełna: ${limitationText(why.cause, absent)} Zachowano pracę wspierającą; nie liczy się ona jako pełna siła tego dnia.`,
          });
        }
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
    plan[0].engineTimeBudgetMin = serializedSessionMinutes(options);
    plan[0].planInputs = {
      matchDates: [...(p.matchDates ?? [])].sort(),
      individualTrainingDays: [...p.individualTrainingDays].sort((a, b) => a - b),
      unavailableDays: [...(p.unavailableDays ?? [])].sort((a, b) => a - b),
      clubTrainingDays: [...p.clubTrainingDays].sort((a, b) => a - b),
      unavailableEquipmentIds: [...(p.unavailableEquipmentIds ?? [])].sort(),
      equipment: [...p.equipment].sort(),
      minutesPerSession: serializedSessionMinutes(options),
      sessionDurationMode: resolveSessionDurationMode(options),
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
    minutesPerSession: serializedSessionMinutes(options),
    sessionDurationMode: resolveSessionDurationMode(options),
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
        (!supportOnly &&
          !!options.readiness?.[d.date] &&
          !adjustedForReadiness(s, options.readiness[d.date]) &&
          (readinessScore(options.readiness[d.date]) ?? options.readiness[d.date].overall) <= 4)
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
      if (r.minutes > sessionTimeBudget(options)) fail("TIME_LIMIT", d.date, "Przekroczony czas.");
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
          (!e.dose.reps && !e.dose.seconds && !e.dose.holdReps) ||
          [e.dose.reps, e.dose.seconds, e.dose.distanceM, e.dose.holdReps].some(
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
  const budget = sessionTimeBudget(options);
  let base = strengthBase(
    p,
    old.roles.includes("strengthA") ? "A" : "B",
    cycle.phase,
    cycleStartEffect(options).rotate ? 1 : 0,
    session.date,
    old.advancedTemplate,
  );
  // A session on the day after a match keeps its post-match shape.
  if (old.postMatch) base = { ...base, postMatch: old.postMatch };
  // An accepted shorter variant (feedback correction) stays short; otherwise the generator's rule.
  if (old.variant === "compact" && session.feedbackAdjustments?.length)
    base = fitStrengthToBudget(base, Math.min(budget, session.durationMin));
  const recipe = finalizeStrengthRecipe(base, p, session.date, options, days, budget);
  if (!recipe) return null;
  recipe.cycle = cycle.cycle;
  const fresh = render(session.date, recipe, p, resolveSessionDurationMode(options));
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
  if (strength && r.organization === "complex" && r.advancedTemplate)
    // A note session stays a note: the lighter variant is the same note with fewer rounds, not
    // the older straight A/B generator.
    reduced =
      [lighterAdvanced(r, true), lighterAdvanced(r, true, false)].find(
        (candidate) => candidate.minutes <= r.minutes && doseWeight(candidate) < doseWeight(r),
      ) ?? null;
  else if (strength)
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
  else if (r.roles.includes("endurance")) {
    reduced = plannedEndurance(p, session.date, r.phase, true);
    // The easy route can equal an already easy run: then the same reduced-route time cap applies.
    if (reduced && !(reduced.minutes < r.minutes))
      reduced = capRunningTime(
        structuredClone(reduced),
        "Skrócono bieg po dzisiejszym check-inie (obniżona gotowość): spokojnie, bez mocnych odcinków.",
      );
  }
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
  /** A calm run is re-resolved for the date; ask for its easy route when the caller lightens it. */
  forceEnduranceLight = false,
): AdjustmentPlacement {
  const index = plan.findIndex((d) => d.date === date);
  if (index < 0) return { blocked: { code: "INVALID_DATE", message: "Brak daty w planie." } };
  const matches = new Set(
    scheduledMatchDates(p, plusDays(options.startDate, -7), plan.length + 14),
  );
  const attempt = place(
    plan,
    index,
    recipe,
    p,
    options,
    matches,
    options.precedingDays ?? [],
    forceEnduranceLight,
  );
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
