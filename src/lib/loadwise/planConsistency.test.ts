import { describe, expect, it } from "vitest";
import type { Profile, Readiness, SessionDay } from "./types";
import {
  applyCheckInToPlanDay,
  resolveAdjustedDay,
  nextMatchDate,
  normalizeLegacyPersistedPlan,
} from "./dailyCheckin";

const PROFILE: Profile = {
  id: "p1",
  name: "Player",
  age: 20,
  goal: "speed",
  sessionsPerWeek: 3,
  painInjury: false,
  gender: "male",
  position: "midfielder",
  level: "amateur",
  matchDate: "2026-08-09",
} as unknown as Profile;

function baseSession(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "training",
    title: "Szybkość",
    goalLabel: "",
    intensity: "wysoka",
    durationMin: 90,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Szybkość / sprint",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: "Rano + Wieczór",
    sections: {
      warmup: [],
      main: [{ name: "Sprint 30 m", prescription: "6 × 30 m" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: {
      ...baseSecond(),
    },
    ...overrides,
  } as SessionDay;
}

function baseSecond(): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "training",
    title: "Prehab",
    goalLabel: "",
    intensity: "niska",
    durationMin: 20,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Prehab",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  } as SessionDay;
}

function clubSession(): SessionDay {
  return baseSession({
    dayType: "club",
    title: "Trening klubowy",
    sessionType: "Trening klubowy",
    intensity: "umiarkowana",
  });
}

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    date: "2026-08-17",
    sleep: 7,
    energy: 7,
    fatigue: 3,
    soreness: 2,
    jointPain: 2,
    stress: 3,
    motivation: 7,
    overall: 7,
    ...overrides,
  };
}

describe("spójność Start / Plan / szczegóły", () => {
  const MANUAL_CHECKIN = readiness({
    sleep: 3,
    energy: 3,
    fatigue: 8,
    soreness: 6,
    jointPain: 3,
    stress: 5,
    motivation: 5,
    overall: 2,
  });

  it("dzień klubowy przy gotowości 2/10 pozostaje treningiem klubowym", () => {
    const res = applyCheckInToPlanDay([clubSession()], MANUAL_CHECKIN.date, MANUAL_CHECKIN, PROFILE);
    const day = res.plan[0];
    expect(day.dayType).toBe("club");
    expect(day.title).toBe("Trening klubowy");
    expect(day.sessionType).toBe("Klub");
    expect(day.title).not.toMatch(/Regeneracja/i);
    expect(day.loadLabelOverride).toBe("Ogranicz obciążenie");
    expect(day.externalCommitment).toBe(true);
    expect(day.safetyNote).toBe(
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.",
    );
    expect(day.secondSession).toBeNull();
    const flat = [
      ...day.sections.main,
      ...day.sections.accessory,
      ...day.sections.cooldown,
    ]
      .map((e) => `${e.name} ${e.prescription ?? ""}`)
      .join(" ");
    expect(flat).not.toMatch(/spacer|marsz|trucht|bike|rower|mobil|oddech|breathing/i);
  });

  it("aktywny ból na dniu klubowym zaleca przerwanie i konsultację", () => {
    const r = readiness({ overall: 2, jointPain: 7 });
    const res = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const day = res.plan[0];
    expect(day.dayType).toBe("club");
    expect(day.loadLabelOverride).toBe("Wstrzymaj trening");
    expect(day.safetyNote).toMatch(/Wstrzymaj trening/i);
    expect(day.safetyNote).toMatch(/lekarz|fizjoterapeut/i);
    expect(day.secondSession).toBeNull();
  });

  it("painInjury=true na zewnętrznej sesji ustawia safety state i usuwa dodatkowy trening", () => {
    const profilePain = { ...PROFILE, painInjury: true } as Profile;
    const dayWithSecond = clubSession();
    dayWithSecond.secondSession = baseSecond();
    const res = applyCheckInToPlanDay([dayWithSecond], MANUAL_CHECKIN.date, MANUAL_CHECKIN, profilePain);
    const day = res.plan[0];
    expect(day.title).toBe("Trening klubowy");
    expect(day.loadLabelOverride).toBe("Wstrzymaj trening");
    expect(day.secondSession).toBeNull();
    const flat = [
      ...day.sections.main,
      ...day.sections.accessory,
      ...day.sections.cooldown,
    ]
      .map((e) => `${e.name} ${e.prescription ?? ""}`)
      .join(" ");
    expect(flat).not.toMatch(/sprint|bieg|skok|plyo|przysiad|martwy|loaded|sztang/i);
  });

  it("własna sesja przy gotowości 1–3 zamienia się na regenerację", () => {
    const r = readiness({ overall: 2 });
    const res = applyCheckInToPlanDay([baseSession()], r.date, r, PROFILE);
    const day = res.plan[0];
    expect(day.title).toMatch(/Regeneracja/i);
    expect(day.intensity).toBe("niska");
    expect(day.sessionType).toBe("Regeneracja");
    expect(day.secondSession).toBeNull();
  });

  it("Start, Plan i szczegóły widzą ten sam obiekt sesji", () => {
    const r = MANUAL_CHECKIN;
    const res = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const stored = res.plan[0];
    const start = resolveAdjustedDay(stored, r, PROFILE);
    const plan = resolveAdjustedDay(stored, r, PROFILE);
    const details = resolveAdjustedDay(stored, r, PROFILE);
    expect(start).toBe(stored);
    expect(JSON.stringify(plan)).toBe(JSON.stringify(details));
    expect(plan.title).toBe(stored.title);
    expect(plan.loadLabelOverride).toBe("Ogranicz obciążenie");
    expect(start.loadLabelOverride).toBe("Ogranicz obciążenie");
    expect(details.loadLabelOverride).toBe("Ogranicz obciążenie");
  });

  it("ponowne załadowanie danych nie nakłada adaptacji dwa razy", () => {
    const r = MANUAL_CHECKIN;
    const first = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const second = applyCheckInToPlanDay(first.plan, r.date, r, PROFILE);
    expect(second.changed).toBe(false);
    expect(second.plan[0].durationMin).toBe(first.plan[0].durationMin);
    expect(resolveAdjustedDay(second.plan[0], r, PROFILE)).toBe(second.plan[0]);
  });

  it("legacy: mutowany klub z tytułem regeneracja wraca do poprawnej sesji zewnętrznej", () => {
    const corrupted = {
      ...clubSession(),
      title: "Regeneracja (na podstawie gotowości)",
      sessionType: "Regeneracja",
      sections: {
        warmup: [],
        main: [{ name: "Spacer", prescription: "30 min" }],
        accessory: [{ name: "Mobilność", prescription: "10 min" }],
        footballTransfer: [],
        cooldown: [{ name: "Oddychanie", prescription: "5 min" }],
      },
    } as SessionDay;
    const normalized = normalizeLegacyPersistedPlan([corrupted]);
    expect(normalized.changed).toBe(true);
    expect(normalized.plan[0].dayType).toBe("club");
    expect(normalized.plan[0].title).toBe("Trening klubowy");
    expect(normalized.plan[0].sessionType).toBe("Klub");
    const text = [
      ...normalized.plan[0].sections.main,
      ...normalized.plan[0].sections.accessory,
      ...normalized.plan[0].sections.cooldown,
    ]
      .map((e) => `${e.name} ${e.prescription ?? ""}`)
      .join(" ");
    expect(text).not.toMatch(/spacer|mobil|oddychan|breathing/i);
  });

  it("match day też jest zewnętrznym zobowiązaniem i nie przechodzi na regenerację", () => {
    const match = baseSession({
      dayType: "match",
      title: "Mecz",
      sessionType: "Mecz",
      secondSession: baseSecond(),
    });
    const res = applyCheckInToPlanDay([match], MANUAL_CHECKIN.date, MANUAL_CHECKIN, PROFILE);
    const day = res.plan[0];
    expect(day.dayType).toBe("match");
    expect(day.title).toBe("Mecz");
    expect(day.title).not.toMatch(/Regeneracja/i);
    expect(day.loadLabelOverride).toBe("Ogranicz obciążenie");
    expect(day.secondSession).toBeNull();
  });

  it("karta meczu pokazuje najbliższy przyszły mecz z planu", () => {
    const plan: SessionDay[] = [
      baseSession({ date: "2026-08-09", dayType: "match", title: "Mecz" }),
      baseSession({ date: "2026-08-23", dayType: "match", title: "Mecz" }),
      baseSession({ date: "2026-08-30", dayType: "match", title: "Mecz" }),
    ];
    expect(nextMatchDate(plan, "2026-08-17", "2026-08-09")).toBe("2026-08-23");
  });

  it("brak przyszłego meczu w planie i przeszła data profilu daje brak meczu", () => {
    expect(nextMatchDate([], "2026-08-17", "2026-08-09")).toBeNull();
  });

  it("app-controlled day: today resolves to one effective recovery day while future days stay canonical", () => {
    const today = baseSession({
      date: "2026-08-17",
      title: "Sprint — akceleracja",
      sessionType: "Sprint",
      intensity: "umiarkowana",
      durationMin: 60,
      secondSession: baseSession({
        date: "2026-08-17",
        title: "Easy aerobic — łatwy bieg tlenowy",
        sessionType: "Wytrzymałość",
        intensity: "niska",
        durationMin: 35,
        secondSession: null,
      }),
    });
    const tomorrow = baseSession({
      date: "2026-08-18",
      title: "Sprint — akceleracja",
      sessionType: "Sprint",
      intensity: "umiarkowana",
      secondSession: null,
    });
    const lowReady = readiness({ overall: 2, jointPain: 2 });

    const start = resolveAdjustedDay(today, lowReady, PROFILE);
    const planDecisionCard = resolveAdjustedDay(today, lowReady, PROFILE);
    const todayRow = resolveAdjustedDay(today, lowReady, PROFILE);
    const details = resolveAdjustedDay(today, lowReady, PROFILE);

    expect(start.title).toBe("Regeneracja (na podstawie gotowości)");
    expect(planDecisionCard.title).toBe("Regeneracja (na podstawie gotowości)");
    expect(todayRow.title).toBe("Regeneracja (na podstawie gotowości)");
    expect(details.title).toBe("Regeneracja (na podstawie gotowości)");
    expect(todayRow.loadLabelOverride).toBeNull();
    expect(todayRow.intensity).toBe("niska");
    expect(todayRow.durationMin).toBe(30);
    expect(todayRow.secondSession).toBeNull();
    expect(todayRow.title).not.toMatch(/Sprint/i);
    expect(today.secondSession?.title).toMatch(/Easy aerobic/i);
    expect(tomorrow.title).toBe("Sprint — akceleracja");
  });

  it("rehydration + onboarding schedule update remain idempotent and do not compound adaptation", () => {
    const lowReady = readiness({ overall: 2, jointPain: 2 });
    const canonicalToday = baseSession({
      date: "2026-08-17",
      title: "Sprint — akceleracja",
      sessionType: "Sprint",
      intensity: "umiarkowana",
      secondSession: baseSecond(),
    });

    const first = resolveAdjustedDay(canonicalToday, lowReady, PROFILE);
    const second = resolveAdjustedDay(canonicalToday, lowReady, PROFILE);
    expect(second).toEqual(first);
    expect(canonicalToday.title).toBe("Sprint — akceleracja");
    expect(canonicalToday.secondSession).not.toBeNull();

    const persisted = applyCheckInToPlanDay([canonicalToday], lowReady.date, lowReady, PROFILE).plan[0];
    const afterHydration = resolveAdjustedDay(persisted, lowReady, PROFILE);
    expect(afterHydration).toBe(persisted);
    expect(afterHydration.title).toBe("Regeneracja (na podstawie gotowości)");
    expect(afterHydration.durationMin).toBe(30);
    expect(afterHydration.secondSession).toBeNull();
  });
});
