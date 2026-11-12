import { addIsoDays } from "@/lib/isoDate";
import { ownTrainingAllowed } from "./availability";
import type { PlanChangeEvent, Profile, Readiness, SessionCompletion, SessionDay } from "./types";
import { resolveMdPlusOne, type AutomationSessionCategory } from "./automationPolicy";
import { normalizeSessionCategory } from "./sessionClassification";
import { gymChangeBlockReason } from "./strengthScheduling";
import { isoDayOfWeek, parseIso } from "./labels";
import { isConservativeReturnContext } from "./finalPlanPolicy";
import { recoverySessionContent } from "./recoveryContent";

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

function recoverySections(): SessionDay["sections"] {
  const content = recoverySessionContent({ circulationMin: 10 });
  return { ...content, footballTransfer: [] };
}

/**
 * Derived-only adjustment. It never writes medical conclusions and can be
 * rebuilt after every reload from the saved match completion.
 */
export function adaptMdPlusOneFromMatchMinutes(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  readiness: Record<string, Readiness>,
  profile?: Profile | null,
): { plan: SessionDay[]; events: PlanChangeEvent[] } {
  const events: PlanChangeEvent[] = [];
  const next = plan.map((day, index): SessionDay => {
    if (day.mdLabel !== "MD+1") return day;
    // A derived adjustment cannot undo availability, health policy, an external
    // obligation or a prescription already being executed in either slot.
    const slotProtected = (session: SessionDay | null | undefined) => {
      const log = session?.dbId ? completions[session.dbId] : undefined;
      return session?.executionProtected || log?.completed || log?.status === "started";
    };
    if (day.isUnavailable || day.dayType === "club" || day.dayType === "match" ||
      day.externalCommitment || slotProtected(day) || slotProtected(day.secondSession)) return day;
    if (profile) {
      const weekday = isoDayOfWeek(parseIso(day.date));
      if (!ownTrainingAllowed(profile, weekday) ||
        profile.painInjury || profile.seasonPhase === "return_injury" ||
        isConservativeReturnContext(profile)) return day;
    }
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
      return normalizeSessionCategory({
        ...day,
        dayType: "training",
        type: "endurance_running",
        title: decision.title,
        sessionType: "Wytrzymałość — lekka kompensacja",
        intensity: "niska",
        durationMin: decision.durationMin,
        reason: decision.reason,
        whyToday: decision.reason,
        sections: {
          warmup: [{ name: "Spokojne przygotowanie", prescription: "5 min marszu i mobilności" }],
          main: [
            {
              name: "Lekki bieg tlenowy",
              prescription: "15 min w tempie konwersacyjnym",
              cue: "Bez sprintów i mocnych interwałów.",
            },
            { name: "Spokojna technika z piłką", prescription: "10 min bez presji czasu" },
          ],
          accessory: [],
          footballTransfer: [],
          cooldown: [{ name: "Marsz i oddech", prescription: "5 min" }],
        },
        structuredSections: undefined,
        exercises: undefined,
        classification: undefined,
        secondSession: null,
        slotLabel: null,
      });
    }
    if (decision.mode === "mixed") {
      return normalizeSessionCategory({
        ...day,
        title: decision.title,
        intensity: "niska",
        durationMin: decision.durationMin,
        reason: decision.reason,
        whyToday: decision.reason,
        dayType: "recovery",
        type: "recovery",
        sessionType: "Regeneracja — wariant mieszany",
        sections: {
          warmup: [],
          main: [
            { name: "Mobilność bez wymuszania zakresu", prescription: "8 min" },
            { name: "Spokojna technika z piłką", prescription: "10 min" },
            { name: "Marsz i oddech", prescription: "7 min" },
          ],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
        structuredSections: undefined,
        exercises: undefined,
        classification: undefined,
        secondSession: null,
        slotLabel: null,
      });
    }
    return normalizeSessionCategory({
      ...day,
      dayType: "recovery",
      type: "recovery",
      title: decision.title,
      sessionType: "Regeneracja",
      goalLabel: "Regeneracja",
      intensity: "niska",
      durationMin: decision.durationMin,
      reason: decision.reason,
      whyToday: decision.reason,
      goalOfSession: "Spokojne rozruszanie po dużym udziale w meczu.",
      avoidToday: "Bez sprintów maksymalnych, ciężkich nóg i twardych interwałów.",
      sections: recoverySections(),
      structuredSections: undefined,
      exercises: undefined,
      secondSession: null,
      slotLabel: null,
      classification: undefined,
    });
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
  const weekEnd = (() => {
    const date = new Date(`${todayIso}T12:00:00Z`);
    return addIsoDays(todayIso, 7 - (date.getUTCDay() || 7));
  })();
  const futureCategories = new Set(
    plan
      .filter((day) => day.date >= todayIso && day.date <= weekEnd)
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
        day.date <= weekEnd &&
        !protectedDay(day) &&
        day.secondSession == null &&
        (category !== "speed" ||
          !plan.some(
            (neighbor) =>
              [addIsoDays(day.date, -1), addIsoDays(day.date, 1)].includes(neighbor.date) &&
              [neighbor, neighbor.secondSession].some(
                (slot) => slot && automationCategory(slot) === "speed",
              ),
          )) &&
        (category !== "gym" ||
          !gymChangeBlockReason(plan, day.date, {
            ...source,
            date: day.date,
            secondSession: null,
          })) &&
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
      blockWeekNumber: target.blockWeekNumber,
      blockPhaseLabel: target.blockPhaseLabel,
      weekMeta: target.weekMeta,
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
