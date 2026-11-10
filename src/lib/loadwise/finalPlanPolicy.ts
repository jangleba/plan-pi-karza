import type { Profile, SessionDay, WeekMeta } from "./types";
import { addDays, isoDate, isoDayOfWeek, parseIso } from "./labels";
import {
  classifySession,
  isBallTechnicalSession,
  isEnduranceSession,
  isMainGymSession,
  isMatchSession,
  normalizeSessionCategory,
} from "./sessionClassification";
import { assessDaySpeedLoad, assessSpeedLoad } from "./speedLoad";
import {
  isHighLowerGym as heavyGym,
  isFullSpeedSession as fullSpeed,
  gymSpacingIssues,
} from "./strengthScheduling";
import { calculateWeeklyMinimumRequirements } from "./weeklyRequirements";
import { getDevelopmentStage } from "./athleteProfile";
import { requirementGymExperience, seasonPhaseForWeek } from "./offseasonPeriod";
import { computeWeeklyLoadScore, countWeekRoles, MAIN_GOAL_RULES } from "./planRules";
import { FINAL_PLAN_POLICY_VERSION } from "./planPolicyStamp";
import {
  isDedicatedSprintSession,
  ownSprintMeters,
  weeklySprintIssues,
  calendarMonday,
} from "./weeklySprintPolicy";

/** Internal conservative app policy, not a universal physiological recovery threshold. */
export { FINAL_PLAN_POLICY_VERSION } from "./planPolicyStamp";

export function isConservativeReturnContext(profile: Profile): boolean {
  return (
    profile.goal === "return" ||
    profile.secondaryLimiter === "return" ||
    profile.secondaryLimiter === "fatigue"
  );
}

export function finalPolicyRequirementsFor(week: SessionDay[], profile: Profile) {
  const sessions = week.flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[]);
  const matchCount = sessions.filter(isMatchSession).length;
  return calculateWeeklyMinimumRequirements(
    {
      seasonPhase: isConservativeReturnContext(profile)
        ? "transition"
        : week[0]
          ? seasonPhaseForWeek(profile, week[0].date)
          : profile.seasonPhase,
      clubTrainingCount: sessions.filter((session) => session.dayType === "club").length,
      matchCount,
      isFullWeek: matchCount < 2,
    },
    { hasGym: profile.hasGym, clubTrainingDays: profile.clubTrainingDays },
    profile.goal,
    {
      developmentStage: getDevelopmentStage(profile.age),
      gymExperienceLevel: requirementGymExperience(profile),
      hasActivePain: profile.painInjury || (profile.painLocations?.length ?? 0) > 0,
    },
  );
}

export function finalPolicyMissingTargets(week: SessionDay[], profile: Profile): string[] {
  const requirements = finalPolicyRequirementsFor(week, profile);
  const sessions = week.flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[]);
  return [
    sessions.filter(isMainGymSession).length < requirements.requiredGymSessions ? "siła" : null,
    sessions.filter(isEnduranceSession).length < requirements.requiredEnduranceSessions
      ? "wydolność"
      : null,
    sessions.filter((session) => classifySession(session).countsAsSpeed).length <
    requirements.requiredSpeedSessions
      ? "szybkość"
      : null,
    sessions.filter(isBallTechnicalSession).length < requirements.requiredBallSessions
      ? "piłka"
      : null,
  ].filter((target): target is string => target !== null);
}

function hasWork(session: SessionDay | null | undefined): boolean {
  return !!session && session.dayType !== "rest" && session.durationMin > 0;
}

function external(session: SessionDay): boolean {
  return session.dayType === "club" || session.dayType === "match" || !!session.externalCommitment;
}

/** Conservative default for an unsupervised app. A team may use different
 * match-week doses; a weekly category target cannot override this default. */
export function matchWeekPolicyViolation(session: SessionDay, mdLabel = session.mdLabel): boolean {
  if (mdLabel !== "MD-1" && mdLabel !== "MD-2") return false;
  if (!hasWork(session) || external(session) || session.executionProtected) return false;
  const fullSprint = assessSpeedLoad({ ...session, secondSession: null }).exposure === "full";
  if (mdLabel === "MD-1")
    return (
      isEnduranceSession(session) ||
      isMainGymSession(session) ||
      fullSprint ||
      session.intensity === "wysoka"
    );
  return (
    mdLabel === "MD-2" &&
    (fullSprint ||
      heavyGym(session) ||
      (isEnduranceSession(session) && session.intensity === "wysoka"))
  );
}

/** Shared by generation and saved-plan validation; do not "fix" intensity labels alone. */
export function secondSessionPolicyViolation(
  day: SessionDay,
  profile: Profile,
): "double-sessions-disabled" | "invalid-beginner-double" | "duplicate-dominant-stimulus" | null {
  const second = day.secondSession;
  if (!second || !hasWork(second) || !hasWork(day)) return null;
  if (profile.doubleSessionsAllowed === "no") return "double-sessions-disabled";
  if (
    (profile.level === "beginner" ||
      profile.age < 16 ||
      profile.doubleSessionsAllowed === "light_only" ||
      isConservativeReturnContext(profile)) &&
    second.intensity !== "niska"
  )
    return "invalid-beginner-double";
  const firstCategory = classifySession(day).category;
  const secondCategory = classifySession(second).category;
  const duplicateTrainingCategory =
    firstCategory === secondCategory &&
    ["gym_strength", "endurance_conditioning", "speed_sprint"].includes(firstCategory);
  if (duplicateTrainingCategory || (isBallTechnicalSession(day) && isBallTechnicalSession(second)))
    return "duplicate-dominant-stimulus";
  return null;
}

function monday(date: string): string {
  const value = parseIso(date);
  return isoDate(addDays(value, 1 - isoDayOfWeek(value)));
}

function restInsteadOf(day: SessionDay, note: string): SessionDay {
  return normalizeSessionCategory({
    ...day,
    dayType: "rest",
    type: "rest",
    title: "Odpoczynek",
    sessionType: "Odpoczynek",
    goalLabel: "Regeneracja",
    intensity: "niska",
    durationMin: 0,
    reason: note,
    whyToday: note,
    goalOfSession: "Odpoczynek w granicach dostępności i obciążenia.",
    riskManaged: "Ograniczenia zawodnika mają pierwszeństwo przed liczbą sesji.",
    avoidToday: "Nie nadrabiaj pominiętego treningu dodatkową jednostką.",
    safetyNote: null,
    loadLabelOverride: "Plan dopasowany do ograniczeń",
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    structuredSections: undefined,
    exercises: undefined,
    classification: undefined,
    speedGeneratorVersion: undefined,
    speedFamily: undefined,
    speedProgressionWeek: undefined,
    speedRecentPostSkipExerciseIds: undefined,
    secondSession: null,
    slotLabel: null,
  });
}

/**
 * Last mutating pass, AFTER every content rebuild. It never fills quotas by undoing
 * hard constraints. External commitments and protected execution remain immutable.
 */
export function enforceFinalPlanPolicy(input: SessionDay[], profile: Profile): SessionDay[] {
  const plan = input.map((day) => {
    if (day.executionProtected) return day;
    const normalized = normalizeSessionCategory({
      ...day,
      secondSession: day.secondSession ? { ...day.secondSession } : null,
    });
    if (day.secondSession?.executionProtected) normalized.secondSession = day.secondSession;
    return normalized;
  });
  const notes = new Map<string, Set<string>>();
  const droppedCounts = new Map<string, number>();
  const displaced = new Map<string, { session: SessionDay; sourceIndex: number }>();
  const prescriptionKey = (session: SessionDay) =>
    JSON.stringify([
      session.date,
      session.title,
      session.sessionType,
      session.sections,
      session.dbId,
      session.sessionId,
    ]);
  const note = (date: string, text: string) => {
    const key = monday(date),
      list = notes.get(key) ?? new Set<string>();
    list.add(text);
    notes.set(key, list);
  };
  // Generation calls this final pass twice (before/after method composition).
  // Retain the actual reason for a previous reduction; recalculate quota notes.
  for (const day of input)
    if (day.weekMeta?.finalPolicyVersion === FINAL_PLAN_POLICY_VERSION)
      for (const text of day.weekMeta.planningNotes ?? [])
        if (!text.startsWith("Nie zmieszczono wszystkich celów tygodnia:")) note(day.date, text);
  const remove = (index: number, second: boolean, reason: string): boolean => {
    const day = plan[index],
      target = second ? day.secondSession : day;
    if (!target || target.executionProtected || day.executionProtected || external(target))
      return false;
    note(day.date, reason);
    if (hasWork(target)) {
      droppedCounts.set(monday(day.date), (droppedCounts.get(monday(day.date)) ?? 0) + 1);
      displaced.set(prescriptionKey(target), {
        session: { ...target, secondSession: null },
        sourceIndex: index,
      });
    }
    if (second) {
      plan[index] = { ...day, secondSession: null, slotLabel: null };
    } else if (day.secondSession && !day.secondSession.executionProtected) {
      const next = day.secondSession;
      plan[index] = normalizeSessionCategory({
        ...next,
        date: day.date,
        dayName: day.dayName,
        dayOfWeek: day.dayOfWeek,
        mdLabel: day.mdLabel,
        dayDbId: day.dayDbId,
        planDbId: day.planDbId,
        cycleId: day.cycleId,
        dbId: next.dbId,
        sessionId: next.sessionId,
        secondSession: null,
        slotLabel: null,
      });
    } else {
      plan[index] = restInsteadOf(day, reason);
      // An in-flight second slot cannot be rewritten or discarded.
      if (day.secondSession?.executionProtected) plan[index].secondSession = day.secondSession;
    }
    return true;
  };
  const relocateToRest = (
    session: SessionDay,
    sourceIndex: number,
    replaceLowerPriority = false,
  ): boolean => {
    if (external(session) || session.executionProtected || !hasWork(session)) return false;
    const source = plan[sourceIndex];
    const options = plan
      .map((_, index) => index)
      .filter((index) => index !== sourceIndex && monday(plan[index].date) === monday(source.date))
      .sort(
        (a, b) =>
          (replaceLowerPriority ? sessionPriority(plan[a], a) - sessionPriority(plan[b], b) : 0) ||
          Math.abs(a - sourceIndex) - Math.abs(b - sourceIndex),
      );
    for (const index of options) {
      const destination = plan[index],
        weekday = isoDayOfWeek(parseIso(destination.date));
      if (
        destination.executionProtected ||
        destination.isUnavailable ||
        external(destination) ||
        (!replaceLowerPriority && hasWork(destination)) ||
        destination.secondSession ||
        (profile.unavailableDays ?? []).includes(weekday) ||
        (Array.isArray(profile.individualTrainingDays) &&
          !profile.individualTrainingDays.includes(weekday))
      )
        continue;
      if (["MD", "MD-1", "MD+1"].includes(destination.mdLabel ?? "")) continue;
      if (destination.mdLabel === "MD-2" && session.intensity !== "niska") continue;
      if (
        hasWork(destination) &&
        sessionPriority(session, index) <= sessionPriority(destination, index)
      )
        continue;
      const candidate = normalizeSessionCategory({
        ...session,
        date: destination.date,
        dayName: destination.dayName,
        dayOfWeek: destination.dayOfWeek,
        mdLabel: destination.mdLabel,
        mdRelation: destination.mdRelation,
        dayDbId: destination.dayDbId,
        planDbId: destination.planDbId,
        cycleId: destination.cycleId,
        weekMeta: destination.weekMeta,
        secondSession: null,
        slotLabel: null,
      });
      const speed = assessSpeedLoad(candidate);
      if (profile.hasSprintSpace === false && speed.countsAsSpeedExposure) continue;
      if (
        isConservativeReturnContext(profile) &&
        (speed.countsAsSpeedExposure ||
          candidate.intensity === "wysoka" ||
          classifySession(candidate).subcategory === "field_mas_test")
      )
        continue;
      const previous = plan.find(
        (day) => day.date === isoDate(addDays(parseIso(candidate.date), -1)),
      );
      const next = plan.find((day) => day.date === isoDate(addDays(parseIso(candidate.date), 1)));
      if (
        speed.countsAsSpeedExposure &&
        previous &&
        assessDaySpeedLoad(previous).blocksAdjacentSpeedDay
      )
        continue;
      if (speed.blocksAdjacentSpeedDay && next && assessDaySpeedLoad(next).realExposureCount > 0)
        continue;
      const trial = plan.map((day, i) => (i === index ? candidate : day));
      if (weeklySprintIssues(trial).length > weeklySprintIssues(plan).length) continue;
      if (
        gymSpacingIssues(trial).some(
          (issue) =>
            issue.date === candidate.date ||
            issue.date === isoDate(addDays(parseIso(candidate.date), 1)),
        )
      )
        continue;
      plan[index] = candidate;
      const key = monday(source.date);
      droppedCounts.set(key, Math.max(0, (droppedCounts.get(key) ?? 0) - 1));
      displaced.delete(prescriptionKey(session));
      if (hasWork(destination)) {
        droppedCounts.set(key, (droppedCounts.get(key) ?? 0) + 1);
        note(
          source.date,
          "Cel główny zastąpił mniej potrzebny bodziec uzupełniający, bez dokładania sesji.",
        );
      }
      note(
        source.date,
        `Przeniesiono własną sesję z ${source.date} na ${candidate.date}, zachowując limit i odstępy.`,
      );
      return true;
    }
    return false;
  };
  const sessionPriority = (session: SessionDay, index: number): number => {
    const category = classifySession(session).category;
    const requirements = finalPolicyRequirementsFor(
      plan.filter((day) => monday(day.date) === monday(session.date)),
      profile,
    );
    const target =
      category === "gym_strength"
        ? requirements.requiredGymSessions
        : category === "endurance_conditioning"
          ? requirements.requiredEnduranceSessions
          : category === "speed_sprint"
            ? requirements.requiredSpeedSessions
            : isBallTechnicalSession(session)
              ? requirements.requiredBallSessions
              : 0;
    const countElsewhere = plan.filter(
      (day, i) =>
        i !== index &&
        monday(day.date) === monday(session.date) &&
        hasWork(day) &&
        classifySession(day).category === category &&
        !(profile.unavailableDays ?? []).includes(isoDayOfWeek(parseIso(day.date))) &&
        (!Array.isArray(profile.individualTrainingDays) ||
          profile.individualTrainingDays.includes(isoDayOfWeek(parseIso(day.date)))),
    ).length;
    const needed = Math.max(0, target - countElsewhere);
    const mainGoal = MAIN_GOAL_RULES[profile.goal]?.mandatoryCategories.includes(category) ?? false;
    return (
      needed * 100 +
      (mainGoal ? 100 : 0) +
      (["gym_strength", "endurance_conditioning", "speed_sprint"].includes(category) ? 10 : 0)
    );
  };
  const removeMatching = (
    index: number,
    matches: (session: SessionDay) => boolean,
    reason: string,
  ) => {
    if (plan[index].secondSession && matches(plan[index].secondSession!))
      remove(index, true, reason);
    if (matches(plan[index])) remove(index, false, reason);
  };
  const conservative = isConservativeReturnContext(profile);
  for (let index = 0; index < plan.length; index++) {
    const day = plan[index];
    if (day.executionProtected) continue;
    removeMatching(
      index,
      (session) => matchWeekPolicyViolation(session, day.mdLabel),
      "Świeżość przed meczem: nie dokładamy pełnego sprintu na MD-2 ani biegu wydolnościowego lub pełnej siły na MD-1, żeby uzupełnić liczbę treningów.",
    );
    const weekday = isoDayOfWeek(parseIso(day.date));
    const unavailable =
      (profile.unavailableDays ?? []).includes(weekday) ||
      (Array.isArray(profile.individualTrainingDays) &&
        !profile.individualTrainingDays.includes(weekday));
    if (unavailable) {
      removeMatching(
        index,
        hasWork,
        "Zmniejszono plan: tego dnia nie zadeklarowano czasu na własny trening.",
      );
    }
    if (profile.hasSprintSpace === false) {
      removeMatching(
        index,
        (session) => assessSpeedLoad(session).countsAsSpeedExposure,
        "Pominięto ekspozycję szybkościową: brak zadeklarowanego miejsca do sprintu.",
      );
    }
    if (conservative) {
      note(
        day.date,
        "Powrót po przerwie lub zmęczenie: etap ostrożny, bez maksymalnych testów i sprintów.",
      );
      removeMatching(
        index,
        (session) =>
          hasWork(session) &&
          (assessSpeedLoad(session).countsAsSpeedExposure ||
            session.intensity === "wysoka" ||
            classifySession(session).subcategory === "field_mas_test"),
        "Pominięto mocną jednostkę: najpierw ostrożny powrót do regularnego treningu.",
      );
    }
    const violation = secondSessionPolicyViolation(plan[index], profile);
    if (violation) {
      const reason =
        violation === "double-sessions-disabled"
          ? "Zastosowano limit: najwyżej jedna sesja dziennie."
          : violation === "invalid-beginner-double"
            ? "Zastosowano ograniczenie: druga sesja może być wyłącznie lekka."
            : "Rozdzielono treningi o tym samym dominującym bodźcu.";
      const first = plan[index],
        second = first.secondSession;
      if (
        second &&
        !external(first) &&
        !first.executionProtected &&
        !second.executionProtected &&
        sessionPriority(second, index) > sessionPriority(first, index)
      ) {
        if (remove(index, false, reason)) relocateToRest({ ...first, secondSession: null }, index);
      } else if (second && remove(index, true, reason)) relocateToRest(second, index);
      else remove(index, false, reason);
    }
    if (assessDaySpeedLoad(plan[index]).hasDuplicateRealSpeedExposures) {
      remove(index, true, "Pominięto drugą ekspozycję szybkościową tego samego dnia.");
    }
  }
  // Resolve remaining true speed conflicts across ALL calendar boundaries.
  const indexByDate = new Map(plan.map((day, index) => [day.date, index]));
  for (let index = 0; index < plan.length; index++) {
    const previousIndex = indexByDate.get(isoDate(addDays(parseIso(plan[index].date), -1)));
    if (previousIndex == null) continue;
    if (
      !assessDaySpeedLoad(plan[previousIndex]).blocksAdjacentSpeedDay ||
      assessDaySpeedLoad(plan[index]).realExposureCount === 0
    )
      continue;
    const reason = "Zachowano odstęp między ekspozycjami szybkościowymi, także na granicy tygodni.";
    const currentHasExternalSpeed = [plan[index], plan[index].secondSession].some(
      (session) => session && external(session) && assessSpeedLoad(session).countsAsSpeedExposure,
    );
    removeMatching(
      currentHasExternalSpeed ? previousIndex : index,
      (session) => assessSpeedLoad(session).countsAsSpeedExposure,
      reason,
    );
  }
  // Product limits per calendar week: one dedicated sprint session and 240 m.
  // Executed/started sessions and club/match stay; only future own work is removed.
  for (let pass = 0; pass < plan.length * 2; pass++) {
    const issue = weeklySprintIssues(plan)[0];
    if (!issue) break;
    const inWeek = plan
      .map((_, index) => index)
      .filter((index) => calendarMonday(plan[index].date) === issue.week);
    const candidates = (
      issue.code === "extra-sprint-session"
        ? (s: SessionDay) => isDedicatedSprintSession(s)
        : (s: SessionDay) => ownSprintMeters(s) > 0 && !isDedicatedSprintSession(s)
    ) as (s: SessionDay) => boolean;
    const reason =
      issue.code === "extra-sprint-session"
        ? "Limit tygodnia: najwyżej jedna dedykowana sesja sprintu. Druga sesja nie jest dokładana."
        : "Limit tygodnia: najwyżej 240 m sprintu. Pominięto dodatkowy akcent sprintu.";
    const removable = (index: number, second: boolean) => {
      const target = second ? plan[index].secondSession : plan[index];
      return (
        !!target &&
        !target.executionProtected &&
        !plan[index].executionProtected &&
        !external(target) &&
        candidates(target)
      );
    };
    // Keep the sprint session that best fits the goal; remove the weakest future one.
    const codGoal = profile.goal === "agility";
    const fit = (session: SessionDay) => {
      const sub = classifySession(session).subcategory ?? "";
      const cod = /change_of_direction|deceleration|braking|agility|reactive/.test(sub);
      return (codGoal ? cod : !cod) ? 2 : 1;
    };
    const options = inWeek
      .flatMap((index) => [false, true].map((second) => ({ index, second })))
      .filter(({ index, second }) => removable(index, second))
      .sort((a, b) => {
        const sa = (a.second ? plan[a.index].secondSession : plan[a.index])!;
        const sb = (b.second ? plan[b.index].secondSession : plan[b.index])!;
        return fit(sa) - fit(sb) || b.index - a.index;
      });
    const keepOne =
      issue.code === "extra-sprint-session" &&
      !inWeek.some((index) =>
        [plan[index], plan[index].secondSession].some(
          (s) =>
            s &&
            isDedicatedSprintSession(s) &&
            (s.executionProtected || plan[index].executionProtected),
        ),
      );
    let removed = false;
    for (const option of keepOne ? options.slice(0, -1) : options) {
      if (remove(option.index, option.second, reason)) {
        removed = true;
        break;
      }
    }
    if (!removed) {
      note(
        issue.date,
        `${issue.message} Nie znaleziono przyszłej sesji, którą można bezpiecznie zmienić.`,
      );
      break;
    }
  }
  // No subsequent filling/rebuilding may reintroduce adjacent or duplicate gym.
  for (const issue of gymSpacingIssues(plan)) {
    // A previous removal can already have restored this later day's spacing.
    if (
      !gymSpacingIssues(plan).some(
        (current) => current.date === issue.date && current.code === issue.code,
      )
    )
      continue;
    const index = indexByDate.get(issue.date);
    if (index == null) continue;
    if (issue.code === "duplicate-gym-same-day")
      remove(index, true, "Pominięto drugą sesję siłową tego samego dnia.");
    else
      removeMatching(
        index,
        isMainGymSession,
        "Zachowano dzień bez siłowni między sesjami siłowymi.",
      );
  }
  // If availability removed the main goal, reuse its original approved
  // prescription before sacrificing it to an excess complementary category.
  // This is replacement/relocation within the week, never an extra daily slot.
  for (const { session, sourceIndex } of [...displaced.values()]) {
    const category = classifySession(session).category;
    const rule = MAIN_GOAL_RULES[profile.goal];
    if (!rule?.mandatoryCategories.includes(category)) continue;
    const week = plan.filter((day) => monday(day.date) === monday(session.date));
    const counts = countWeekRoles(week, profile.goal);
    if (counts.mandatory >= rule.mandatoryCount) continue;
    relocateToRest(session, sourceIndex, true);
  }
  // Conservative scheduling default for two genuinely high lower-body loads,
  // not a universal biological recovery interval. Club/match and execution logs stay fixed.
  for (let index = 1; index < plan.length; index++) {
    if (plan[index - 1].date !== isoDate(addDays(parseIso(plan[index].date), -1))) continue;
    const previous = [plan[index - 1], plan[index - 1].secondSession].filter(
      Boolean,
    ) as SessionDay[];
    const current = [plan[index], plan[index].secondSession].filter(Boolean) as SessionDay[];
    if (!previous.some(heavyGym) || !current.some(fullSpeed)) continue;
    const currentFixed = current.some((s) => fullSpeed(s) && (external(s) || s.executionProtected));
    const speedGoal =
      MAIN_GOAL_RULES[profile.goal]?.mandatoryCategories.includes("speed_sprint") &&
      !MAIN_GOAL_RULES[profile.goal]?.mandatoryCategories.includes("gym_strength");
    removeMatching(
      currentFixed || speedGoal ? index - 1 : index,
      currentFixed || speedGoal ? heavyGym : fullSpeed,
      "Zmniejszono plan: pełny sprint nie jest domyślnie dokładany dzień po ciężkim treningu nóg. Cel i świeżość mają pierwszeństwo przed liczbą sesji.",
    );
  }
  // The old early pass merely renamed the fourth hard day "moderate".
  // Apply the product budget to final prescriptions, never to external commitments.
  for (const key of new Set(plan.map((d) => monday(d.date)))) {
    const indices = plan.map((_, i) => i).filter((i) => monday(plan[i].date) === key);
    const hard = (s: SessionDay | null | undefined) =>
      !!s && s.intensity === "wysoka" && hasWork(s);
    const fixed = indices.filter((i) =>
      [plan[i], plan[i].secondSession].some(
        (s) => hard(s) && s && (external(s) || s.executionProtected),
      ),
    );
    const own = indices.filter(
      (i) => !fixed.includes(i) && [plan[i], plan[i].secondSession].some(hard),
    );
    const budget = Math.max(0, 3 - fixed.length);
    own.sort(
      (a, b) =>
        Math.max(
          ...[plan[b], plan[b].secondSession].filter(Boolean).map((s) => sessionPriority(s!, b)),
        ) -
        Math.max(
          ...[plan[a], plan[a].secondSession].filter(Boolean).map((s) => sessionPriority(s!, a)),
        ),
    );
    for (const i of own.slice(budget))
      removeMatching(
        i,
        (s) => hard(s),
        "Zmniejszono nadmiar ciężkich dni w końcowym tygodniu. Nie zmieniamy samej etykiety intensywności ani treningu klubowego i meczu.",
      );
  }
  const weeks = new Map<string, SessionDay[]>();
  for (const day of plan) {
    const key = monday(day.date),
      week = weeks.get(key) ?? [];
    week.push(day);
    weeks.set(key, week);
  }
  for (const [key, week] of weeks) {
    const missing = week.length === 7 ? finalPolicyMissingTargets(week, profile) : [];
    const healthLimited = profile.painInjury || profile.seasonPhase === "return_injury";
    const weekNotes = [...(notes.get(key) ?? [])];
    if (missing.length)
      weekNotes.push(
        `Nie zmieszczono wszystkich celów tygodnia: ${missing.join(", ")}. Ograniczenia mają pierwszeństwo.`,
      );
    if (healthLimited)
      weekNotes.push("Plan ograniczony ze względu na zgłoszony ból lub powrót po urazie.");
    const roles = countWeekRoles(week, profile.goal);
    const meta: WeekMeta = {
      weekNumber: week[0].weekMeta?.weekNumber ?? [...weeks.keys()].indexOf(key) + 1,
      blockWeek: week[0].weekMeta?.blockWeek ?? 1,
      weekTheme: week[0].weekMeta?.weekTheme ?? "Plan dopasowany do kalendarza",
      mainGoalFocus: MAIN_GOAL_RULES[profile.goal]?.focusLabel ?? "Trening indywidualny",
      mandatorySessions: roles.mandatory,
      supportSessions: roles.support,
      recoverySessions: roles.recovery,
      weeklyLoadScore: computeWeeklyLoadScore(week),
      validationStatus: "valid",
      planningStatus: healthLimited
        ? "health_limited"
        : missing.length ||
            conservative ||
            (droppedCounts.get(key) ?? 0) > 0 ||
            weekNotes.length > 0
          ? "reduced"
          : "complete",
      planningNotes: weekNotes,
      finalPolicyVersion: FINAL_PLAN_POLICY_VERSION,
    };
    for (const day of week) {
      if (day.executionProtected) continue;
      day.weekMeta = meta;
      if (day.secondSession && !day.secondSession.executionProtected)
        day.secondSession.weekMeta = meta;
    }
  }
  return plan;
}
