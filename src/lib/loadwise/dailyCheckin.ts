import { applyReadiness } from "./planEngine";
import type { Profile, Readiness, SessionDay, SessionModification } from "./types";
import { classifySession } from "./sessionClassification";

const LEGACY_RECOVERY_RE =
  /regener|recovery|marsz|spacer|trucht|easy run|bike|rower|oddech|oddychan|breathing|mobil|stretch|rozciągan/i;

function externalKind(session: SessionDay): "club" | "match" | null {
  if (session.dayType === "club") return "club";
  if (session.dayType === "match") return "match";
  if (session.externalCommitment) return "club";
  const cls = session.classification ?? classifySession(session);
  if (cls.countsAsMatch) return "match";
  if (cls.countsAsClub) return "club";
  return null;
}

function canonicalExternalTitle(kind: "club" | "match"): string {
  return kind === "match" ? "Mecz" : "Trening klubowy";
}

function canonicalExternalSessionType(kind: "club" | "match"): string {
  return kind === "match" ? "Mecz" : "Klub";
}

function stripLegacyRecoveryBlocks(session: SessionDay): SessionDay {
  const filterItems = (items: typeof session.sections.main) =>
    items.filter((item) => !LEGACY_RECOVERY_RE.test(`${item.name ?? ""} ${item.prescription ?? ""}`));

  const cleanedSections = {
    warmup: session.sections.warmup,
    main: filterItems(session.sections.main),
    accessory: filterItems(session.sections.accessory),
    footballTransfer: session.sections.footballTransfer,
    cooldown: filterItems(session.sections.cooldown),
  };

  return {
    ...session,
    sections: cleanedSections,
    structuredSections: undefined,
  };
}

export function normalizeLegacyExternalCommitmentDay(
  session: SessionDay,
): { session: SessionDay; changed: boolean } {
  const kind = externalKind(session);
  if (!kind) return { session, changed: false };

  const base = stripLegacyRecoveryBlocks(session);
  const title = canonicalExternalTitle(kind);
  const sessionType = canonicalExternalSessionType(kind);

  const normalized: SessionDay = {
    ...base,
    dayType: kind,
    externalCommitment: true,
    title,
    sessionType,
    loadLabelOverride:
      base.loadLabelOverride === "Ogranicz" ? "Ogranicz obciążenie" : base.loadLabelOverride,
    secondSession: null,
    slotLabel: null,
  };

  const changed = JSON.stringify(session) !== JSON.stringify(normalized);
  return { session: changed ? normalized : session, changed };
}

export function normalizeLegacyPersistedPlan(
  plan: SessionDay[],
): { plan: SessionDay[]; changed: boolean } {
  let changed = false;
  const normalized = plan.map((day) => {
    const main = normalizeLegacyExternalCommitmentDay(day);
    const second = main.session.secondSession
      ? normalizeLegacyExternalCommitmentDay(main.session.secondSession)
      : null;
    const withSecond =
      second && second.session !== main.session.secondSession
        ? { ...main.session, secondSession: second.session }
        : main.session;
    if (main.changed || second?.changed) changed = true;
    return withSecond;
  });
  return { plan: changed ? normalized : plan, changed };
}

function stripReadinessMetadata(session: SessionDay): SessionDay {
  const next: SessionDay = {
    ...session,
    readinessAdjustedDate: null,
    readinessOriginalSession: null,
  };
  if (session.secondSession) {
    next.secondSession = stripReadinessMetadata(session.secondSession);
  }
  return next;
}

export function hasPersistedReadinessAdjustment(
  session: SessionDay,
  date: string,
): boolean {
  return session.readinessAdjustedDate === date;
}

export function applyCheckInToPlanDay(
  plan: SessionDay[],
  date: string,
  readiness: Readiness,
  profile: Profile,
): { plan: SessionDay[]; changed: boolean; adjusted: SessionDay | null } {
  const normalizedPlanResult = normalizeLegacyPersistedPlan(plan);
  const normalizedPlan = normalizedPlanResult.plan;
  const index = normalizedPlan.findIndex((day) => day.date === date);
  if (index === -1) {
    return { plan: normalizedPlan, changed: normalizedPlanResult.changed, adjusted: null };
  }

  const current = normalizedPlan[index];
  const baseOriginal = stripReadinessMetadata(current.readinessOriginalSession ?? current);
  const base = normalizeLegacyExternalCommitmentDay(baseOriginal).session;
  const adaptedBase = applyReadiness(base, readiness, profile).session;
  const adapted = normalizeLegacyExternalCommitmentDay(adaptedBase).session;
  const adjusted: SessionDay = {
    ...adapted,
    readinessAdjustedDate: date,
    readinessOriginalSession: base,
  };

  const unchanged = JSON.stringify(current) === JSON.stringify(adjusted);
  if (unchanged && !normalizedPlanResult.changed) {
    return { plan: normalizedPlan, changed: false, adjusted };
  }

  const nextPlan = [...normalizedPlan];
  nextPlan[index] = adjusted;
  return { plan: nextPlan, changed: true, adjusted };
}

/**
 * Jedno źródło prawdy dla Start / Plan / szczegółów sesji.
 * Zwraca zapisany, już dostosowany SessionDay albo dostosowuje go na żywo.
 * Nigdy nie nakłada adaptacji dwa razy.
 */
export function resolveAdjustedDay(
  day: SessionDay,
  readiness: Readiness | undefined,
  profile: Profile | null,
): SessionDay {
  const normalized = normalizeLegacyExternalCommitmentDay(day).session;
  if (!profile) return normalized;
  if (readiness && hasPersistedReadinessAdjustment(normalized, readiness.date)) {
    return normalized;
  }
  const adjusted = applyReadiness(normalized, readiness, profile).session;
  return normalizeLegacyExternalCommitmentDay(adjusted).session;
}

/** Resolves the one session shown by every surface without dropping a user swap. */
export function resolveEffectiveDay(
  day: SessionDay,
  readiness: Readiness | undefined,
  profile: Profile | null,
  modifications: SessionModification[] = [],
): SessionDay {
  const swapped = modifications.find((mod) => mod.type === "swap");
  return swapped
    ? swapped.session
    : resolveAdjustedDay(day, readiness, profile);
}

export function resolveTodayPlanRowSource(
  day: SessionDay,
  todayIso: string,
  effectiveToday: SessionDay | null | undefined,
): SessionDay {
  if (day.date !== todayIso) return day;
  return effectiveToday ?? day;
}

/** Najbliższy przyszły mecz z aktywnego planu (fallback: data z profilu). */
export function nextMatchDate(
  plan: SessionDay[],
  todayIso: string,
  profileMatchDate?: string | null,
): string | null {
  const fromPlan = plan
    .filter((d) => d.dayType === "match" && d.date >= todayIso)
    .map((d) => d.date)
    .sort();
  if (fromPlan.length > 0) return fromPlan[0];
  if (profileMatchDate && profileMatchDate >= todayIso) return profileMatchDate;
  return null;
}
