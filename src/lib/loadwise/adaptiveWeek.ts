import type { PlanChangeEvent, Profile, Readiness, SessionCompletion, SessionDay } from "./types";
import { resolveMdPlusOne, type AutomationSessionCategory } from "./automationPolicy";

export type MissedSessionReason =
  "schedule_conflict" | "fatigue" | "pain" | "travel" | "weather" | "other" | "automatic_expiry";

function addIsoDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function automationCategory(session: SessionDay): AutomationSessionCategory {
  const cls = session.classification;
  if (session.dayType === "match" || cls?.countsAsMatch) return "match";
  if (session.dayType === "club" || cls?.countsAsClub) return "club";
  if (session.dayType === "recovery") return "recovery";
  if (cls?.category === "gym_strength") return "gym";
  if (cls?.category === "speed_sprint") return "speed";
  if (cls?.category === "endurance_conditioning") return "endurance";
  if (cls?.subcategory === "ball_technical") return "ball";
  const text = `${session.sessionType} ${session.title}`.toLowerCase();
  if (/sił|strength|power|moc/.test(text)) return "gym";
  if (/sprint|szybko|przyspiesz|hamowan|zwrot/.test(text)) return "speed";
  if (/wydol|kondyc|interwał|tempo|endurance|aerob/.test(text)) return "endurance";
  if (/pił|technik|podan|drybling/.test(text)) return "ball";
  if (/regenera|mobil|prehab|oddech/.test(text)) return "recovery";
  return "other";
}

function recoverySections(session: SessionDay): SessionDay["sections"] {
  return {
    warmup: [],
    main: [
      {
        name: "Spokojne rozruszanie",
        prescription: "10 min marszu, roweru lub bardzo lekkiego truchtu",
        cue: "Tempo swobodne; przerwij, jeśli pojawia się ból.",
      },
      {
        name: "Mobilność całego ciała",
        prescription: "8–10 min bez wymuszania zakresu",
        cue: "Płynny ruch i spokojny oddech.",
      },
    ],
    accessory: [],
    footballTransfer: [],
    cooldown: [],
  };
}

/**
 * Derived-only adjustment. It never writes medical conclusions and can be
 * rebuilt after every reload from the saved match completion.
 */
export function adaptMdPlusOneFromMatchMinutes(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  readiness: Record<string, Readiness>,
): { plan: SessionDay[]; events: PlanChangeEvent[] } {
  const events: PlanChangeEvent[] = [];
  const next = plan.map((day, index): SessionDay => {
    if (day.mdLabel !== "MD+1") return day;
    const matchDate = addIsoDays(day.date, -1);
    const match = [...plan.slice(0, index)]
      .reverse()
      .find(
        (candidate) => candidate.date === matchDate && automationCategory(candidate) === "match",
      );
    const completion = match?.dbId ? completions[match.dbId] : undefined;
    if (!completion?.completed) return day;
    const decision = resolveMdPlusOne(
      completion.durationMin ?? null,
      readiness[day.date]?.overall ?? null,
    );
    events.push({
      id: `match-minutes:${day.date}`,
      date: day.date,
      source: "match_minutes",
      title: "MD+1 dopasowany automatycznie",
      detail: `${completion.durationMin ?? "brak"} min meczu → ${decision.title.toLowerCase()}.`,
    });
    if (decision.mode === "compensation") {
      return {
        ...day,
        title: decision.title,
        durationMin: decision.durationMin,
        reason: decision.reason,
        whyToday: decision.reason,
      };
    }
    if (decision.mode === "mixed") {
      return {
        ...day,
        title: decision.title,
        intensity: "niska",
        durationMin: decision.durationMin,
        reason: decision.reason,
        whyToday: decision.reason,
      };
    }
    return {
      ...day,
      dayType: "recovery",
      title: decision.title,
      sessionType: "Regeneracja",
      goalLabel: "Regeneracja",
      intensity: "niska",
      durationMin: decision.durationMin,
      reason: decision.reason,
      whyToday: decision.reason,
      goalOfSession: "Spokojne rozruszanie po dużym udziale w meczu.",
      avoidToday: "Bez sprintów maksymalnych, ciężkich nóg i twardych interwałów.",
      sections: recoverySections(day),
      structuredSections: undefined,
      exercises: undefined,
      secondSession: null,
      slotLabel: null,
    };
  });
  return { plan: next, events };
}

export interface RescueProposal {
  category: AutomationSessionCategory;
  missedDate: string;
  targetDate: string | null;
  action: "already_covered" | "move" | "drop_safely";
  reason: string;
}

function protectedDay(day: SessionDay): boolean {
  return (
    day.isUnavailable === true ||
    day.dayType === "match" ||
    day.dayType === "club" ||
    day.mdLabel === "MD" ||
    day.mdLabel === "MD-1" ||
    day.mdLabel === "MD+1"
  );
}

/**
 * Minimal Effective Week: rescue only a missing development category, never
 * pile every missed session into the remaining days.
 */
export function buildMinimumEffectiveWeek(
  generatedPlan: SessionDay[],
  missed: SessionDay[],
  todayIso: string,
  profile: Pick<Profile, "doubleSessionsAllowed" | "painInjury">,
): { plan: SessionDay[]; proposals: RescueProposal[] } {
  const plan = generatedPlan.map((day) => ({
    ...day,
    secondSession: day.secondSession ? { ...day.secondSession } : null,
  }));
  const futureCategories = new Set(
    plan
      .filter((day) => day.date >= todayIso)
      .flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[])
      .map(automationCategory),
  );
  const uniqueMissed = new Map<AutomationSessionCategory, SessionDay>();
  for (const session of missed) {
    const category = automationCategory(session);
    if (["gym", "speed", "endurance", "ball"].includes(category)) {
      uniqueMissed.set(category, session);
    }
  }
  const proposals: RescueProposal[] = [];
  for (const [category, source] of uniqueMissed) {
    if (futureCategories.has(category)) {
      proposals.push({
        category,
        missedDate: source.date,
        targetDate: null,
        action: "already_covered",
        reason: "Ten bodziec już występuje w dalszej części tygodnia; nic nie dokładamy.",
      });
      continue;
    }
    const targetIndex = plan.findIndex(
      (day) =>
        day.date > todayIso &&
        !protectedDay(day) &&
        day.secondSession == null &&
        (day.dayType === "rest" || day.intensity === "niska"),
    );
    if (targetIndex < 0 || profile.painInjury) {
      proposals.push({
        category,
        missedDate: source.date,
        targetDate: null,
        action: "drop_safely",
        reason: "Brak bezpiecznego miejsca; pominięta sesja nie jest nadrabiana na siłę.",
      });
      continue;
    }
    const target = plan[targetIndex];
    plan[targetIndex] = {
      ...source,
      date: target.date,
      dayName: target.dayName,
      dayOfWeek: target.dayOfWeek,
      dayDbId: undefined,
      dbId: undefined,
      sessionId: undefined,
      mdLabel: target.mdLabel,
      mdRelation: target.mdRelation,
      reason: `Minimalny skuteczny tydzień: przeniesiono tylko brakujący bodziec ${category}.`,
      whyToday: "To najbliższe wolne i niechronione miejsce w planie.",
      secondSession: null,
      slotLabel: null,
    };
    futureCategories.add(category);
    proposals.push({
      category,
      missedDate: source.date,
      targetDate: target.date,
      action: "move",
      reason:
        "Przeniesiono wyłącznie brakujący bodziec, bez dokładania całej pominiętej objętości.",
    });
  }
  return { plan, proposals };
}

export function buildPlanChangeTimeline(input: {
  date: string;
  readiness?: Readiness;
  matchMinutes?: number | null;
  rescue?: RescueProposal[];
}): PlanChangeEvent[] {
  const events: PlanChangeEvent[] = [];
  if (input.readiness) {
    events.push({
      id: `readiness:${input.date}`,
      date: input.date,
      source: "readiness",
      title: "Check-in gotowości",
      detail: `Wynik ${input.readiness.overall}/10 został użyty do doboru objętości, nie do diagnozy.`,
    });
  }
  if (input.matchMinutes != null) {
    const decision = resolveMdPlusOne(input.matchMinutes, input.readiness?.overall ?? null);
    events.push({
      id: `match:${input.date}`,
      date: input.date,
      source: "match_minutes",
      title: "Minuty meczowe",
      detail: `${input.matchMinutes} min → ${decision.title}.`,
    });
  }
  for (const proposal of input.rescue ?? []) {
    events.push({
      id: `missed:${proposal.missedDate}:${proposal.category}`,
      date: proposal.targetDate ?? input.date,
      source: "missed_session",
      title: proposal.action === "move" ? "Uratowano brakujący bodziec" : "Bez nadrabiania na siłę",
      detail: proposal.reason,
    });
  }
  return events;
}
