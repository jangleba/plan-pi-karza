import { scheduledMatchDates } from "../matchSchedule";
import { trainingProfileRevision } from "../planIdentity";
import { hydrateTrainingExerciseFromDefinition, getExerciseDefinition } from "../exerciseLibrary";
import { structuredToFlat } from "../sessionStructure";
import type { Profile, SessionDay, TrainingSection } from "../types";
import { buildStrength, buildRunning, estimateSessionSeconds, eligibleExercise } from "./exercises";
import { ENGINE_VERSION, trainingTier, plusDays, weekday, dayDistance, ROLE_NAMES } from "./model";
import type { EngineResult, EngineOptions, EngineSession, Issue } from "./model";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { easyRunningRecipe } from "./running";
import { coachedPrimerEligible } from "./strengthProtocols";
import { solveWeeklySchedule, assessPlacement, type PlacementAttempt } from "./scheduling";
import { validateEngineSession } from "./validation";
import { buildActivation, buildRecovery, buildMobility, buildSkills } from "./support";
import { buildEnduranceForDate, hasCurrentVerifiedMas } from "./endurance";
import { resolveGoalPolicy, routedProfile } from "./goalPolicy";
import { preparationProfile, hasVerifiedAdvancedStrength } from "./preparation";
import { recipeTotalSeconds } from "@/lib/running/recipe";

const names = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const own = (d: SessionDay) => slots(d).filter((s) => !!s.engineV2);
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
    date,
    dayOfWeek: weekday(date),
    dayName: names[weekday(date) % 7],
    dayType: match ? "match" : club ? "club" : "rest",
    type: match ? "match" : club ? "club_training" : "rest",
    title: match ? "Mecz" : club ? "Trening klubowy" : "Wolne",
    intensity: match ? "wysoka" : club ? "umiarkowana" : "niska",
    durationMin: 0, // External duration is unknown; never fabricate minutes played.
    reason:
      match || club
        ? "Termin zadeklarowany w profilu; obciążenie zewnętrzne."
        : "Brak przydzielonego treningu własnego.",
    whyToday: "Kalendarz zawodnika",
    goalLabel: "",
    sessionType: match ? "Mecz" : club ? "Klub" : "Wolne",
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

function render(date: string, recipe: EngineSession, p: Profile): SessionDay {
  const revision = trainingProfileRevision(p);
  const sections: TrainingSection[] = [];
  for (const [index, e] of recipe.exercises.entries()) {
    const d = e.dose;
    const accessory = [
      "push",
      "pull",
      "adductor",
      "trunk",
      "calf_straight",
      "calf_bent",
      "hamstring_iso",
      "quad_iso",
    ].includes(e.role);
    const type =
      e.role === "warmup"
        ? "warmup"
        : e.role === "iso_primer"
          ? "prep"
          : accessory
            ? "accessory"
            : "main";
    let section = sections.find((s) => s.type === type);
    if (!section) {
      section = {
        id: `${date}:${type}`,
        title:
          type === "warmup"
            ? "Przygotowanie"
            : type === "accessory"
              ? "Uzupełnienie"
              : "Część główna",
        type,
        blocks: [],
      };
      sections.push(section);
    }
    const text = d.seconds
      ? `${d.seconds} s${d.perSide ? " / stronę" : ""}`
      : d.distanceM
        ? `${d.runInM ? `${d.runInM} m nabiegu + ` : ""}${d.distanceM} m`
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
      engineDose: d,
      cue:
        d.intent === "explosive"
          ? "Każda próba jakościowa; pełny odpoczynek. Przerwij przy utracie kontroli."
          : d.intent === "easy"
            ? "Swobodny oddech i tempo konwersacyjne."
            : undefined,
      groundContacts:
        FUNCTIONAL_CATALOGUE[e.exerciseId]?.actions.includes("jump") || e.exerciseId === "snap_down"
          ? (d.reps ?? 0) * (d.perSide ? 2 : 1)
          : undefined,
      speedRole: e.role === "speed" ? "primary" : undefined,
    });
    section.blocks.push({
      id: `${exercise.id}:block`,
      title: exercise.name,
      blockType: "single",
      intent:
        e.role === "power"
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
      power.exercises[0].restAfterPair = `${primary.exercises[0].engineDose!.restSeconds} s`;
      const pair = {
        ...primary,
        title: "Siła i moc",
        blockType: "contrast" as const,
        exercises: [...primary.exercises, ...power.exercises],
        restAfterBlock: primary.exercises[0].restAfterExercise,
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
  const title = support
    ? (
        {
          activation: "Aktywacja przed meczem",
          recovery: "Spokojny ruch i oddech",
          mobility: "Mobilność",
          skills: "Technika z piłką",
        } as Record<string, string>
      )[support]
    : gym
      ? `${speed ? "Sprint + " : ""}Siła ${recipe.roles.includes("strengthA") ? "A" : "B"} · ${recipe.tier === "foundation" ? "podstawy" : recipe.tier === "development" ? "rozwój" : "performance"}`
      : speed
        ? "Przyspieszenie"
        : (recipe.runningRecipe?.title ?? "Bieg tlenowy");
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
    goalLabel: gym ? "Siła i moc" : speed ? "Szybkość" : "Wydolność",
    durationMin: recipe.minutes,
    intensity: recipe.highLower ? "wysoka" : support ? "niska" : "umiarkowana",
    isOwnSession: true,
    externalCommitment: false,
    isClubSession: false,
    generatorVersion: ENGINE_VERSION,
    canonicalRevision: revision,
    engineV2: recipe,
    runningRecipe:
      recipe.runningRecipe ??
      (recipe.roles[0] === "endurance"
        ? easyRunningRecipe(p, date, recipe.exercises[0].dose.seconds!)
        : undefined),
    reason: `${preparationProfile(p).source === "onboarding" ? "Wariant programu na podstawie doświadczenia z onboardingu" : "Wariant programu na podstawie zadeklarowanego przygotowania siłowego"}. Miejsce wybrane po sprawdzeniu meczu, klubu, dostępności i obciążeń.`,
    whyToday: "Wybrany dopuszczony termin w tygodniu",
    goalOfSession: title,
    blockPhaseLabel: recipe.phase,
    safetyNote: support
      ? "Spokojne wykonanie bez wymuszania zakresu; czas sesji jest orientacyjny."
      : recipe.roles[0] === "endurance"
        ? "Rozgrzewkę i schłodzenie prowadzi licznik biegu."
        : "8 minut przygotowania ogólnego i serii wprowadzających uwzględniono w czasie sesji. Nie zaczynaj od ciężaru roboczego.",
    structuredSections: sections,
    sections: structuredToFlat(sections),
  };
}

function merged(a: EngineSession, b: EngineSession): EngineSession {
  const base = a.roles.some((r) => r.startsWith("strength")) ? a : b;
  const exercises = [...a.exercises, ...b.exercises].sort((x, y) =>
    x.role === "warmup"
      ? -1
      : y.role === "warmup"
        ? 1
        : x.role === "iso_primer"
          ? -1
          : y.role === "iso_primer"
            ? 1
            : x.role === "speed"
              ? -1
              : y.role === "speed"
                ? 1
                : 0,
  );
  return {
    ...base,
    roles: [...a.roles, ...b.roles],
    exercises,
    missing: [...a.missing, ...b.missing],
    sprintMetres: a.sprintMetres + b.sprintMetres,
    highLower: a.highLower || b.highLower,
    minutes: Math.ceil(estimateSessionSeconds(exercises) / 60) + 8,
  };
}

function plannedEndurance(
  p: Profile,
  date: string,
  phase: EngineSession["phase"],
  forceLight = false,
): EngineSession | null {
  const policy = resolveGoalPolicy(p);
  const recipe = buildEnduranceForDate(
    routedProfile(p, policy.enduranceGoal),
    date,
    phase,
    forceLight || policy.reduced,
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
  const distance = Math.min(99, ...[...matches].map((m) => Math.abs(dayDistance(current.date, m))));
  // Resolve measured running pace against the actual candidate date, including test expiry.
  if (recipe.roles.length === 1 && recipe.roles[0] === "endurance") {
    const dated = plannedEndurance(
      p,
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
    combinedMinutes: (a, b) => merged(a, b).minutes,
  });
  if (!gate.allowed) {
    // An easy alternative remains an explicit adaptation, and still passes every calendar gate.
    if (recipe.roles[0] === "endurance" && recipe.highLower) {
      const easy = plannedEndurance(p, current.date, recipe.phase, true);
      if (easy) {
        const light = placeResolvedEndurance(days, index, easy, p, options, matches, preceding);
        if (light) return { ...light, penalty: (light.penalty ?? 0) + 10 };
      }
    }
    return { blocked: { code: gate.code, message: gate.message } };
  }
  let replacement: SessionDay;
  if (gate.mode === "merge_strength_speed") {
    const original = gate.slot === 0 ? current : current.secondSession!;
    const session = render(current.date, merged(original.engineV2!, recipe), p);
    session.mdLabel = current.mdLabel;
    replacement =
      gate.slot === 0
        ? { ...session, secondSession: current.secondSession }
        : { ...current, secondSession: session };
  } else {
    const session = render(current.date, recipe, p);
    session.mdLabel = current.mdLabel;
    replacement = gate.mode === "new" ? session : { ...current, secondSession: session };
  }
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
  const gate = assessPlacement({
    days,
    dayIndex: index,
    recipe,
    profile: p,
    options,
    matchDates: matches,
    precedingDays: preceding,
    combinedMinutes: (a, b) => merged(a, b).minutes,
  });
  if (!gate.allowed || gate.mode === "merge_strength_speed") return null;
  const current = days[index],
    session = render(current.date, recipe, p);
  session.mdLabel = current.mdLabel;
  const replacement = gate.mode === "new" ? session : { ...current, secondSession: session };
  return {
    state: days.map((d, i) => (i === index ? replacement : d)),
    penalty: (current.dayType === "club" ? 2 : 0) + index * 0.001,
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
  if (options.readiness?.[d.date]?.jointPain) return null;
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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ||
    !Number.isFinite(Date.parse(`${options.startDate}T12:00:00Z`)) ||
    plusDays(options.startDate, 0) !== options.startDate
  )
    throw new Error("Nieprawidłowa data początku planu.");
  const weeks = options.weeks ?? 4;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4)
    throw new Error("Plan obejmuje od 1 do 4 tygodni.");
  if (!Number.isFinite(p.age) || p.age < 13)
    throw new Error("Ten silnik obsługuje zawodników od 13 lat.");
  if (
    options.minutesPerSession !== undefined &&
    (!Number.isFinite(options.minutesPerSession) ||
      options.minutesPerSession < 10 ||
      options.minutesPerSession > 120)
  )
    throw new Error("Czas sesji musi wynosić 10–120 minut.");
  const matches = new Set(scheduledMatchDates(p, plusDays(options.startDate, -7), weeks * 7 + 14));
  const issues: Issue[] = [],
    plan: SessionDay[] = [],
    tier = trainingTier(p);
  const method = p.trainingMethodPreferences?.strength;
  if (method && !["auto", "M09", "M13", "M14"].includes(method))
    issues.push({
      code: "METHOD_UNSUPPORTED",
      message:
        "Wybrana metoda specjalistyczna nie należy do obsługiwanych protokołów tego planu. Zastosowano standardowe serie; zmień preferencję, jeśli chcesz inny wariant.",
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
    const phase = (["adaptation", "development", "peak", "deload"] as const)[week];
    const base = Array.from({ length: 7 }, (_, i) => {
      const date = plusDays(options.startDate, week * 7 + i),
        locked = options.lockedDays?.find((d) => d.date === date);
      return locked
        ? structuredClone({ ...locked, executionProtected: true })
        : day(date, p, matches);
    });
    const policy = resolveGoalPolicy(p);
    const tasks = [
      buildStrength(routedProfile(p, policy.strengthGoal), "A", phase),
      buildStrength(routedProfile(p, policy.strengthGoal), "B", phase),
      buildRunning(routedProfile(p, policy.speedGoal), "speed", phase),
      plannedEndurance(p, base[0].date, phase),
    ];
    const weights = policy.priorities;
    const ids = ["strengthA", "strengthB", "speed", "endurance"] as const;
    const available = tasks.flatMap((recipe, t) =>
      recipe &&
      (!ids[t].startsWith("strength") ||
        recipe.exercises.some((e) => ["knee_strength", "hip_strength"].includes(e.role)))
        ? [{ id: ids[t], recipe, priority: weights[t] }]
        : [],
    );
    const solved = solveWeeklySchedule({
      initialState: base,
      tasks: available,
      dayCount: 7,
      isCovered: (days, id) =>
        days.some((d) =>
          own(d).some((s) => s.engineV2!.roles.includes(id as (typeof ids)[number])),
        ),
      tryPlace: (days, recipe, i) =>
        place(days, i, recipe, p, options, matches, [...(options.precedingDays ?? []), ...plan]),
    });
    let best = solved.state;
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
              "Interwały zastąpiono spokojnym biegiem ze względu na termin, obciążenie lub dostępny czas.",
          });
      }
    tasks.forEach((recipe, t) => {
      const role = ids[t];
      if (!best.some((d) => own(d).some((s) => s.engineV2!.roles.includes(role)))) {
        const reasons = [...new Set((solved.rejections[role] ?? []).map((r) => r.message))];
        issues.push({
          code: "UNMET_WEEKLY_TARGET",
          date: base[0].date,
          message: `Tydzień ${week + 1}: nie znaleziono terminu na ${{ strengthA: "siłę A", strengthB: "siłę B", speed: "sprint", endurance: "wydolność" }[role]}. ${reasons.length ? reasons.join(" ") : "Brak dopuszczonego wariantu przy zadanym sprzęcie i przygotowaniu."}`,
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
    // The existing endurance goal promises two runs. The fifth target never
    // displaces the baseline four or bypasses a calendar/load gate.
    if (policy.extraEndurance) {
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
            if ("state" in attempt && (!extra || (attempt.penalty ?? 0) < extra.penalty))
              extra = { state: attempt.state, penalty: attempt.penalty ?? 0 };
          }
        if (extra) best = extra.state;
      }
      if (countEndurance(best) < 2)
        issues.push({
          code: "UNMET_GOAL_TARGET",
          date: base[0].date,
          message: `Tydzień ${week + 1}: zaplanowano ${countEndurance(best)} z 2 jednostek wydolności. Po zabezpieczeniu celów bazowych nie znaleziono miejsca na drugi spokojny bieg przy aktualnym kalendarzu, czasie i limitach sesji.`,
        });
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
            message:
              "Nie dodano aktywacji przed meczem: wybrane miejsce, dostępność, czas lub limit sesji nie pozwalają na ten blok.",
          });
      } else if (after)
        best = placeSupport(best, i, buildRecovery(p, phase), p, options, matches) ?? best;
    }
    const supportKind = policy.support;
    if (supportKind) {
      const supportRecipe =
        supportKind === "skills" ? buildSkills(p, phase) : buildMobility(p, phase);
      let fitted = false;
      for (let i = 0; i < 7; i++) {
        if ([...matches].some((m) => Math.abs(dayDistance(best[i].date, m)) <= 1)) continue;
        const attempt = placeSupport(best, i, supportRecipe, p, options, matches);
        if (attempt) {
          best = attempt;
          fitted = true;
          break;
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
    best.forEach((d) => {
      if (!d.executionProtected)
        for (const s of own(d)) {
          s.blockWeekNumber = week + 1;
        }
    });
    plan.push(...best);
  }
  const violations = validateTrainingPlan(plan, p, options);
  if (plan[0]) {
    plan[0].enginePlanIssues = [...issues, ...violations];
    plan[0].engineTimeBudgetMin = options.minutesPerSession ?? 75;
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
    if (d.secondSession?.secondSession) fail("THIRD_SLOT", d.date, "Trzeci slot w dniu.");
    for (const s of own(d)) {
      if (d.executionProtected) continue;
      const r = s.engineV2!;
      errors.push(...validateEngineSession(s, p, options));
      const supportOnly = r.roles.every((role) =>
        ["activation", "recovery", "mobility", "skills"].includes(role),
      );
      if (
        !supportOnly &&
        options.readiness?.[d.date] &&
        (options.readiness[d.date].overall <= 4 || options.readiness[d.date].jointPain > 0)
      )
        fail("READINESS_CONFLICT", d.date, "Bieżący check-in wymaga ponownego ułożenia treningu.");
      if (
        matches.has(d.date) ||
        (!supportOnly && [...matches].some((m) => Math.abs(dayDistance(d.date, m)) <= 1))
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
      const ids = new Set<string>();
      for (const e of r.exercises) {
        if (!eligibleExercise(e.exerciseId, p)) fail("INELIGIBLE_EXERCISE", d.date, e.exerciseId);
        if (ids.has(e.exerciseId)) fail("DUPLICATE_EXERCISE", d.date, e.exerciseId);
        ids.add(e.exerciseId);
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
        JSON.stringify(s.structuredSections) !==
          JSON.stringify(render(s.date, r, p).structuredSections) ||
        JSON.stringify(s.sections) !== JSON.stringify(render(s.date, r, p).sections)
      )
        fail("DOSE_MISMATCH", d.date, "Dawka wykonania różni się od decyzji silnika.");
    }
  }
  return errors;
}
