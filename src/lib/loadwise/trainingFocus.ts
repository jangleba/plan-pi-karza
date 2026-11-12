import {
  classifySession,
  isBallTechnicalSession,
  isEnduranceSession,
} from "./sessionClassification";
import { GOAL_LABELS, SECONDARY_LIMITER_LABELS } from "./labels";
import { offseasonStageOf } from "./offseasonPeriod";
import { limitationSupportCategory } from "./planRules";
import { directionQualities, type DirectionQuality } from "./playerDirection";
import type { Profile, SecondaryLimiter, SessionDay } from "./types";

/**
 * What the athlete asked the plan to develop: the main goal and the limiter
 * ("co najbardziej Cię ogranicza"). Each becomes a weekly minimum of OWN
 * sessions of one quality. Club and match never count, and neither does the
 * day-before-match primer. A goal or limiter that is not picked is not a ban:
 * other qualities stay in the week as support.
 */
export type FocusQuality = "ball" | "speed" | "strength" | "endurance" | "mobility";

export interface FocusTarget {
  quality: FocusQuality;
  min: number;
  source: "goal" | "limiter";
  /** Polish name of the athlete's choice, as shown in the onboarding. */
  choice: string;
}

const GOAL_FOCUS: Partial<Record<Profile["goal"], { quality: FocusQuality; min: number }>> = {
  // „Gra z piłką” promises own ball work next to strength, sprint and running.
  general: { quality: "ball", min: 1 },
  speed: { quality: "speed", min: 1 },
  agility: { quality: "speed", min: 1 },
  matchready: { quality: "speed", min: 1 },
  strength: { quality: "strength", min: 2 },
  power: { quality: "strength", min: 2 },
  endurance: { quality: "endurance", min: 2 },
  mobility: { quality: "mobility", min: 1 },
};

const LIMITER_FOCUS: Partial<Record<NonNullable<Profile["secondaryLimiter"]>, FocusQuality>> = {
  ball: "ball",
  speed: "speed",
  cod: "speed",
  strength: "strength",
  power: "strength",
  endurance: "endurance",
};

export const FOCUS_LABEL: Record<FocusQuality, string> = {
  ball: "piłka",
  speed: "szybkość",
  strength: "siła",
  endurance: "wydolność",
  mobility: "mobilność",
};

/**
 * Safety first: with pain, a return, fatigue, in transition or the return
 * phase the plan is deliberately reduced and the choices give no minimum.
 */
export function focusTargets(profile: Profile): FocusTarget[] {
  if (
    profile.painInjury ||
    profile.goal === "return" ||
    profile.secondaryLimiter === "fatigue" ||
    profile.secondaryLimiter === "return" ||
    profile.seasonPhase === "transition" ||
    profile.seasonPhase === "return_injury"
  )
    return [];
  const targets: FocusTarget[] = [];
  const goal = GOAL_FOCUS[profile.goal];
  if (goal) targets.push({ ...goal, source: "goal", choice: GOAL_CHOICE[profile.goal] });
  const limiter = profile.secondaryLimiter ? LIMITER_FOCUS[profile.secondaryLimiter] : undefined;
  if (limiter && limiter !== goal?.quality)
    targets.push({
      quality: limiter,
      min: 1,
      source: "limiter",
      choice: SECONDARY_LIMITER_LABELS[profile.secondaryLimiter!],
    });
  return targets;
}

/**
 * „Jak chcesz się czuć / jak czujesz się teraz na boisku” → the week gets the
 * quality these answers point to: one more full session of it (unless the
 * week already has two), placed like a limiter session by the week repair —
 * on a recovery or low-priority support day, never on MD-1, MD+1 or MD-2 and
 * never instead of the goal minimum. Skipped with pain,
 * a return or fatigue limit, in transition, return phase and deload weeks.
 * Returns the stand-in limiter, or "mobility" for a mobility session.
 */
export function directionAccentFor(profile: Profile): SecondaryLimiter | "mobility" | null {
  if (
    profile.painInjury ||
    profile.goal === "return" ||
    profile.secondaryLimiter === "fatigue" ||
    profile.secondaryLimiter === "return" ||
    profile.seasonPhase === "return_injury" ||
    profile.seasonPhase === "transition" ||
    offseasonStageOf(profile) === "transition"
  )
    return null;
  const asLimiter: Record<DirectionQuality, SecondaryLimiter | "mobility"> = {
    strength: "strength",
    speed: "speed",
    agility: "cod",
    endurance: "endurance",
    ball: "ball",
    mobility: "mobility",
  };
  for (const quality of directionQualities(profile)) {
    const accent = asLimiter[quality];
    if (accent === "mobility") return accent;
    if (accent === profile.secondaryLimiter) continue; // the limiter already asks for it
    if (limitationSupportCategory(accent)) return accent;
  }
  return null;
}

/** Goal names exactly as the onboarding shows them. */
const GOAL_CHOICE: Record<Profile["goal"], string> = {
  speed: "Szybkość",
  strength: "Siła",
  power: "Moc",
  endurance: "Wytrzymałość",
  agility: "Zwrotność",
  general: "Gra z piłką",
  matchready: "Forma na mecz",
  mobility: "Mobilność",
  return: GOAL_LABELS.return,
};

/** An own session that does work (not club, match, MD-1 primer or rest). */
export function isOwnWork(session: SessionDay | null | undefined): session is SessionDay {
  return (
    !!session &&
    session.dayType === "training" &&
    session.durationMin > 0 &&
    !session.externalCommitment
  );
}

export function sessionHasQuality(session: SessionDay, quality: FocusQuality): boolean {
  switch (quality) {
    case "ball":
      return isBallTechnicalSession(session);
    case "speed":
      return classifySession(session).countsAsSpeed;
    case "strength":
      return classifySession(session).category === "gym_strength";
    case "endurance":
      return isEnduranceSession(session);
    case "mobility":
      return session.type === "prehab_mobility" || classifySession(session).isMobility;
  }
}

/** Own sessions of a quality in the days given, both slots of every day (also the „+1”). */
export function countFocusSessions(days: SessionDay[], quality: FocusQuality): number {
  return days
    .flatMap((day) => [day, day.secondSession])
    .filter((session) => isOwnWork(session) && sessionHasQuality(session, quality)).length;
}

/** The session is the last one (or one of the last needed) that realises a choice. */
export function isProtectedFocusSession(
  week: SessionDay[],
  session: SessionDay,
  profile: Profile,
): boolean {
  if (!isOwnWork(session)) return false;
  return focusTargets(profile).some(
    (target) =>
      sessionHasQuality(session, target.quality) &&
      countFocusSessions(week, target.quality) <= target.min,
  );
}

/** Targets the week does not reach. */
export function unmetFocusTargets(week: SessionDay[], profile: Profile): FocusTarget[] {
  return focusTargets(profile).filter(
    (target) => countFocusSessions(week, target.quality) < target.min,
  );
}

/**
 * Priority bonus for a session that realises the athlete's choice: a goal
 * session beats a limiter session, which beats the pitch-feeling accent; all
 * beat plain support. Used when a rule
 * has to remove or move a session, so the choice is the last to go.
 */
export function focusPriority(session: SessionDay, profile: Profile): number {
  let best = 0;
  for (const target of focusTargets(profile)) {
    if (!sessionHasQuality(session, target.quality)) continue;
    best = Math.max(best, target.source === "goal" ? 3 : 2);
  }
  const accent = accentQuality(directionAccentFor(profile));
  if (!best && accent && sessionHasQuality(session, accent)) best = 1;
  return best;
}

const ACCENT_QUALITY: Partial<Record<SecondaryLimiter | "mobility", FocusQuality>> = {
  ball: "ball",
  speed: "speed",
  cod: "speed",
  strength: "strength",
  power: "strength",
  endurance: "endurance",
  mobility: "mobility",
};

function accentQuality(accent: SecondaryLimiter | "mobility" | null): FocusQuality | null {
  return accent ? (ACCENT_QUALITY[accent] ?? null) : null;
}

function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `${count} ${one}`;
  const last = count % 10;
  const tens = count % 100;
  return `${count} ${last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many}`;
}

/**
 * Concrete note for a week that misses a choice (or a weekly minimum): which
 * one, and what took the room for it (calendar, availability, the
 * double-session setting, equipment).
 */
export function unmetFocusNote(
  week: SessionDay[],
  profile: Profile,
  otherMissing: string[] = [],
): string | null {
  const unmet = unmetFocusTargets(week, profile);
  const chosen = unmet.map(
    (target) =>
      `${FOCUS_LABEL[target.quality]} (${target.source === "goal" ? "cel" : "ograniczenie"}: „${target.choice}”)`,
  );
  const labels = new Set(unmet.map((target) => FOCUS_LABEL[target.quality]));
  const minima = otherMissing.filter((label) => !labels.has(label));
  if (!chosen.length && !minima.length) return null;
  const what = [
    ...chosen,
    ...(minima.length ? [`minimum tygodnia: ${minima.join(", ")}`] : []),
  ].join("; ");
  const weekday = (day: SessionDay) => new Date(`${day.date}T12:00:00Z`).getUTCDay() || 7;
  const club = week.filter((day) => day.dayType === "club").length;
  const matches = week.filter((day) => day.dayType === "match").length;
  const unavailable = week.filter(
    (day) => day.isUnavailable || (profile.unavailableDays ?? []).includes(weekday(day)),
  ).length;
  const nearMatch = week.filter(
    (day) => day.dayType !== "match" && (day.mdLabel === "MD-1" || day.mdLabel === "MD+1"),
  ).length;
  const own = week
    .flatMap((day) => [day, day.secondSession])
    .filter((session) => isOwnWork(session)).length;
  const reasons = [
    club ? plural(club, "trening klubowy", "treningi klubowe", "treningów klubowych") : null,
    matches ? plural(matches, "mecz", "mecze", "meczów") : null,
    nearMatch ? `${plural(nearMatch, "dzień", "dni", "dni")} tuż przed lub po meczu` : null,
    unavailable
      ? `${plural(unavailable, "dzień niedostępny", "dni niedostępne", "dni niedostępnych")}`
      : null,
    "co najmniej 1 dzień wolny",
  ].filter(Boolean);
  const limits = [
    profile.doubleSessionsAllowed === "no" ? "najwyżej 1 sesja dziennie" : null,
    (unmet.some((target) => target.quality === "speed") || minima.includes("szybkość")) &&
    profile.hasSprintSpace === false
      ? "brak miejsca do sprintu"
      : null,
    (unmet.some((target) => target.quality === "strength") || minima.includes("siła")) &&
    !profile.hasGym
      ? "trening siły bez siłowni"
      : null,
  ].filter(Boolean);
  return (
    `Nie zmieszczono: ${what}. W tym tygodniu ${reasons.join(", ")}` +
    `${limits.length ? `, ${limits.join(", ")}` : ""} — zostało miejsce na ` +
    `${plural(own, "własną sesję", "własne sesje", "własnych sesji")}, a bezpieczeństwo i dostępność mają pierwszeństwo.`
  );
}
