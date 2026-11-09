import type { Profile, SessionDay } from "./types";
import { addDays, isoDate, isoDayOfWeek, parseIso } from "./labels";
import { assessDaySpeedLoad } from "./speedLoad";
import { validatePlanExerciseContract } from "./planExerciseContract";
import {
  classifySession,
  isBallTechnicalSession,
  isEnduranceSession,
  isMainGymSession,
  isMatchSession,
  isSpeedSession,
} from "./sessionClassification";
import { calculateWeeklyMinimumRequirements } from "./weeklyRequirements";
import { getDevelopmentStage } from "./athleteProfile";
import { requirementGymExperience, seasonPhaseForWeek } from "./offseasonPeriod";
import { profileMatchDates } from "./matchSchedule";
import { hasHighGymToSpeedConflict, gymSpacingIssues } from "./strengthScheduling";
import {
  finalPolicyMissingTargets,
  secondSessionPolicyViolation,
  isConservativeReturnContext,
  matchWeekPolicyViolation,
} from "./finalPlanPolicy";
import { hasAcknowledgedReducedTargets } from "./planPolicyStamp";

export type PersistedPlanIssueCode =
  | "missing-plan"
  | "stale-generator"
  | "club-day-mismatch"
  | "duplicate-speed-same-day"
  | "adjacent-speed-days"
  | "duplicate-gym-same-day"
  | "adjacent-gym-days"
  | "high-gym-before-speed"
  | "duplicate-dominant-stimulus"
  | "invalid-beginner-double"
  | "double-sessions-disabled"
  | "sprint-space-unavailable"
  | "own-training-unavailable"
  | "conservative-return-violation"
  | "match-week-load"
  | "missing-weekly-minimum"
  | "match-date-mismatch"
  | "invalid-exercise-contract";

export interface PersistedPlanIssue {
  code: PersistedPlanIssueCode;
  date?: string;
  message: string;
}

export interface PersistedPlanValidation {
  valid: boolean;
  issues: PersistedPlanIssue[];
}

export function validatePersistedPlan(
  plan: SessionDay[],
  profile: Profile,
  engineVersion: string,
  versionEffectiveFrom?: string,
): PersistedPlanValidation {
  const issues: PersistedPlanIssue[] = [];

  if (plan.length === 0) {
    return {
      valid: false,
      issues: [
        {
          code: "missing-plan",
          message: "Brak aktywnego planu.",
        },
      ],
    };
  }

  if (
    plan.some(
      (day) =>
        (!versionEffectiveFrom || day.date >= versionEffectiveFrom) &&
        !day.executionProtected &&
        day.generatorVersion !== engineVersion,
    )
  ) {
    issues.push({
      code: "stale-generator",
      message: "Plan został utworzony przez starszą wersję generatora.",
    });
  }

  // Only plans stamped by the canonical generator carry this numeric marker.
  if (plan.some((day) => typeof day.canonicalSchemaVersion === "number")) {
    for (const issue of validatePlanExerciseContract(plan)) {
      if (
        versionEffectiveFrom &&
        (issue.date < versionEffectiveFrom ||
          plan.find((day) => day.date === issue.date)?.executionProtected)
      )
        continue;
      issues.push({
        code: "invalid-exercise-contract",
        date: issue.date,
        message: issue.message,
      });
    }
  }

  for (let index = 0; index < plan.length; index += 1) {
    const day = plan[index];
    if (versionEffectiveFrom && (day.date < versionEffectiveFrom || day.executionProtected))
      continue;

    if (
      day.dayType === "club" &&
      (!versionEffectiveFrom || day.date >= versionEffectiveFrom) &&
      !day.executionProtected &&
      !profile.clubTrainingDays.includes(isoDayOfWeek(parseIso(day.date)))
    ) {
      issues.push({
        code: "club-day-mismatch",
        date: day.date,
        message: "Trening klubowy znajduje się w nieprawidłowym dniu.",
      });
    }

    const prior = plan.find((d) => d.date === isoDate(addDays(parseIso(day.date), -1)));
    if (prior && hasHighGymToSpeedConflict(prior, day))
      issues.push({
        code: "high-gym-before-speed",
        date: day.date,
        message:
          "Pełny sprint nie jest domyślnie dodawany dzień po ciężkiej pracy nóg. Zmień dzień lub rodzaj sesji.",
      });
    const speed = assessDaySpeedLoad(day);

    const secondViolation = secondSessionPolicyViolation(day, profile);
    if (secondViolation)
      issues.push({
        code: secondViolation,
        date: day.date,
        message:
          secondViolation === "double-sessions-disabled"
            ? "Profil nie dopuszcza drugiej sesji tego dnia."
            : secondViolation === "invalid-beginner-double"
              ? "Profil dopuszcza wyłącznie lekką drugą sesję."
              : "Dwie sesje tego dnia mają ten sam główny bodziec.",
      });
    const ownSessions = [day, day.secondSession].filter(
      (session): session is SessionDay =>
        !!session &&
        !session.executionProtected &&
        session.dayType !== "rest" &&
        session.dayType !== "club" &&
        session.dayType !== "match" &&
        !session.externalCommitment &&
        session.durationMin > 0,
    );
    const weekday = isoDayOfWeek(parseIso(day.date));
    if (ownSessions.some((session) => matchWeekPolicyViolation(session, day.mdLabel)))
      issues.push({
        code: "match-week-load",
        date: day.date,
        message: "Pełny bodziec narusza domyślne ograniczenie obciążenia przed meczem.",
      });
    if (
      ownSessions.length &&
      ((profile.unavailableDays ?? []).includes(weekday) ||
        (Array.isArray(profile.individualTrainingDays) &&
          !profile.individualTrainingDays.includes(weekday)))
    )
      issues.push({
        code: "own-training-unavailable",
        date: day.date,
        message: "Własny trening wypada w dniu niedostępnym.",
      });
    if (
      profile.hasSprintSpace === false &&
      ownSessions.some(
        (session) => assessDaySpeedLoad({ ...session, secondSession: null }).realExposureCount > 0,
      )
    )
      issues.push({
        code: "sprint-space-unavailable",
        date: day.date,
        message: "Trening szybkościowy wymaga niedostępnego miejsca do sprintu.",
      });
    if (
      isConservativeReturnContext(profile) &&
      ownSessions.some(
        (session) =>
          session.intensity === "wysoka" ||
          classifySession(session).subcategory === "field_mas_test" ||
          assessDaySpeedLoad({ ...session, secondSession: null }).realExposureCount > 0,
      )
    )
      issues.push({
        code: "conservative-return-violation",
        date: day.date,
        message: "Maksymalny lub mocny trening nie pasuje do ostrożnego etapu powrotu.",
      });

    if (speed.hasDuplicateRealSpeedExposures) {
      issues.push({
        code: "duplicate-speed-same-day",
        date: day.date,
        message: "Dzień zawiera więcej niż jedną realną ekspozycję szybkościową.",
      });
    }

    if (index === 0) continue;

    const previous = plan[index - 1];

    const consecutive = isoDate(addDays(parseIso(previous.date), 1)) === day.date;

    if (!consecutive) continue;

    const previousSpeed = assessDaySpeedLoad(previous);

    if (previousSpeed.blocksAdjacentSpeedDay && speed.realExposureCount > 0) {
      issues.push({
        code: "adjacent-speed-days",
        date: day.date,
        message: "Realne ekspozycje szybkościowe występują dzień po dniu.",
      });
    }
  }

  for (const issue of gymSpacingIssues(plan)) {
    if (
      versionEffectiveFrom &&
      (issue.date < versionEffectiveFrom ||
        plan.find((day) => day.date === issue.date)?.executionProtected)
    )
      continue;
    issues.push({
      ...issue,
      message:
        issue.code === "adjacent-gym-days"
          ? "Siłownie występują dzień po dniu — wymagany co najmniej jeden dzień przerwy."
          : "Dzień zawiera dwie sesje siłowni.",
    });
  }

  const planDates = plan.map((day) => day.date).sort();
  for (const matchDate of profileMatchDates(profile)) {
    if (
      matchDate >= planDates[0] &&
      (!versionEffectiveFrom || matchDate >= versionEffectiveFrom) &&
      matchDate <= planDates[planDates.length - 1] &&
      !plan.some((day) => day.date === matchDate && isMatchSession(day))
    ) {
      issues.push({
        code: "match-date-mismatch",
        date: matchDate,
        message: "Termin meczu nie występuje w aktywnym planie.",
      });
    }
  }

  const calendarWeeks = new Map<string, SessionDay[]>();
  for (const day of plan) {
    const date = parseIso(day.date);
    const monday = isoDate(addDays(date, 1 - isoDayOfWeek(date)));
    const week = calendarWeeks.get(monday) ?? [];
    week.push(day);
    calendarWeeks.set(monday, week);
  }
  for (const [monday, week] of calendarWeeks) {
    if (week.length !== 7) continue;
    if (
      versionEffectiveFrom &&
      week.some((day) => day.date < versionEffectiveFrom || day.executionProtected)
    )
      continue;
    const sessions = week.flatMap(
      (day) => [day, day.secondSession].filter(Boolean) as SessionDay[],
    );
    const matchCount = sessions.filter(isMatchSession).length;
    const requirements = calculateWeeklyMinimumRequirements(
      {
        seasonPhase: seasonPhaseForWeek(profile, monday),
        clubTrainingCount: sessions.filter((session) => session.dayType === "club").length,
        matchCount,
        isFullWeek: matchCount < 2,
      },
      { hasGym: profile.hasGym },
      profile.goal,
      {
        developmentStage: getDevelopmentStage(profile.age),
        gymExperienceLevel: requirementGymExperience(profile),
        hasActivePain: profile.painInjury || (profile.painLocations?.length ?? 0) > 0,
      },
    );
    const counts = {
      gym: sessions.filter(isMainGymSession).length,
      endurance: sessions.filter(isEnduranceSession).length,
      speed: sessions.filter(isSpeedSession).length,
      ball: sessions.filter(isBallTechnicalSession).length,
    };
    const missing = [
      counts.gym < requirements.requiredGymSessions ? "siła" : null,
      counts.endurance < requirements.requiredEnduranceSessions ? "wydolność" : null,
      counts.speed < requirements.requiredSpeedSessions ? "sprint" : null,
      counts.ball < requirements.requiredBallSessions ? "piłka" : null,
    ].filter(Boolean);
    const acceptsReducedTargets = hasAcknowledgedReducedTargets(week);
    // A current final-policy pass can explicitly reduce soft goals; hard checks
    // above still reject the plan. This prevents regenerating an infeasible week forever.
    const actualMissing = isConservativeReturnContext(profile)
      ? finalPolicyMissingTargets(week, profile)
      : missing;
    if (actualMissing.length > 0 && !acceptsReducedTargets) {
      issues.push({
        code: "missing-weekly-minimum",
        date: monday,
        message: `Pełny tydzień nie realizuje minimum: ${actualMissing.join(", ")}.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function persistedPlanNeedsRegeneration(
  plan: SessionDay[],
  profile: Profile,
  engineVersion: string,
  versionEffectiveFrom?: string,
): boolean {
  return !validatePersistedPlan(plan, profile, engineVersion, versionEffectiveFrom).valid;
}
