/**
 * Focused tests: readiness & pain adaptation
 *
 * Verifies that:
 * - readiness 9  → category unchanged, plan intact
 * - readiness 6  → category unchanged, volume reduced ~15%
 * - readiness 4  → category unchanged, hard exercises replaced with
 *                  category-safe alternatives (NO ball in sprint/endurance/strength)
 * - readiness 2  → recovery only
 * - pain         → hard exercises replaced with category-safe alternatives,
 *                  NO ball in sprint/endurance/strength
 */
import { describe, it, expect } from "vitest";
import type { SessionDay, DayType, Intensity, Readiness, Profile } from "./types";
import { normalizeSessionCategory } from "./sessionClassification";
import { applyReadiness } from "./planEngine";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeReadiness(overall: number, extras: Partial<Readiness> = {}): Readiness {
  return {
    date: "2026-08-17",
    sleep: 7,
    energy: overall,
    fatigue: 10 - overall,
    soreness: 2,
    jointPain: 0,
    stress: 3,
    motivation: overall,
    overall,
    ...extras,
  };
}

const BASE_PROFILE: Profile = {
  id: "test",
  name: "Test Player",
  age: 22,
  goal: "speed",
  sessionsPerWeek: 3,
  painInjury: false,
  gender: "male",
  position: "midfielder",
  level: "amateur",
} as unknown as Profile;

const PAIN_PROFILE: Profile = { ...BASE_PROFILE, painInjury: true };

function makeSession(
  overrides: Partial<SessionDay> & { title: string; sessionType: string; intensity?: Intensity },
): SessionDay {
  const base: SessionDay = {
    date: "2026-08-17",
    dayName: "Niedziela",
    dayType: "training" as DayType,
    title: overrides.title,
    goalLabel: "",
    intensity: overrides.intensity ?? "wysoka",
    durationMin: 60,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: overrides.sessionType,
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: overrides.sections?.main ?? [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  };
  return normalizeSessionCategory({ ...base, ...overrides });
}

function allMainText(session: SessionDay): string {
  return (session.sections?.main ?? [])
    .map((e) => `${e.name ?? ""} ${e.prescription ?? ""}`)
    .join(" ")
    .toLowerCase();
}

const BALL_RE = /podani|prowadzen|piłk|ball|technik.{0,12}piłk/i;

// ─── Sprint session ──────────────────────────────────────────────────────────

describe("Sprint session — readiness adaptation", () => {
  const sprintSession = makeSession({
    title: "Sprinting — akceleracja i prędkość maksymalna",
    sessionType: "Szybkość / sprint",
    sections: {
      main: [
        { name: "Sprinty 10 m — maksymalny wysiłek", prescription: "8 × 10 m" },
        { name: "Podskoki plyometryczne", prescription: "3 × 8" },
        { name: "Marsz techniczny", prescription: "4 × 20 m" },
      ],
    },
  } as Parameters<typeof makeSession>[0]);

  it("readiness 9: category speed_sprint, exercises untouched", () => {
    const { session } = applyReadiness(sprintSession, makeReadiness(9), BASE_PROFILE);
    expect(session.classification?.category).toBe("speed_sprint");
    expect(session.sections?.main).toHaveLength(3);
    expect(allMainText(session)).toMatch(/sprint/i);
  });

  it("readiness 6: category speed_sprint preserved, volume reduced ~15%", () => {
    const { session } = applyReadiness(sprintSession, makeReadiness(6), BASE_PROFILE);
    expect(session.classification?.category).toBe("speed_sprint");
    expect(session.durationMin).toBeCloseTo(60 * 0.85, 0);
    expect(BALL_RE.test(allMainText(session))).toBe(false);
  });

  it("readiness 4: category speed_sprint preserved, NO ball work", () => {
    const { session } = applyReadiness(sprintSession, makeReadiness(4), BASE_PROFILE);
    expect(session.classification?.category).toBe("speed_sprint");
    const text = allMainText(session);
    expect(BALL_RE.test(text)).toBe(false);
    // replaced exercises should mention sprint / acceleration
    expect(/akcelerac|sprint|bieg/i.test(text)).toBe(true);
  });

  it("readiness 2: becomes recovery session", () => {
    const { session, decision } = applyReadiness(sprintSession, makeReadiness(2), BASE_PROFILE);
    expect(session.classification?.category).toBe("recovery_prehab");
    expect(decision.headline).toMatch(/regeneracja|tylko/i);
  });

  it("pain: NO ball work in replacement", () => {
    const { session } = applyReadiness(sprintSession, makeReadiness(5), PAIN_PROFILE);
    const text = allMainText(session);
    expect(BALL_RE.test(text)).toBe(false);
  });
});

// ─── Endurance session ───────────────────────────────────────────────────────

describe("Endurance session — readiness adaptation", () => {
  const enduranceSession = makeSession({
    title: "Wytrzymałość aerobowa — bieg ciągły",
    sessionType: "Wydolność / wytrzymałość",
    intensity: "umiarkowana",
    sections: {
      main: [
        { name: "Sprint interwałowy — wysoka intensywność", prescription: "6 × 200 m" },
        { name: "Trucht regeneracyjny", prescription: "10 min" },
      ],
    },
  } as Parameters<typeof makeSession>[0]);

  it("readiness 9: category endurance_conditioning, exercises untouched", () => {
    const { session } = applyReadiness(enduranceSession, makeReadiness(9), BASE_PROFILE);
    expect(session.classification?.category).toBe("endurance_conditioning");
    expect(allMainText(session)).toMatch(/sprint/i);
  });

  it("readiness 6: category endurance_conditioning preserved, NO ball", () => {
    const { session } = applyReadiness(enduranceSession, makeReadiness(6), BASE_PROFILE);
    expect(session.classification?.category).toBe("endurance_conditioning");
    expect(BALL_RE.test(allMainText(session))).toBe(false);
  });

  it("readiness 4: category endurance_conditioning preserved, NO ball, aerobic replacement", () => {
    const { session } = applyReadiness(enduranceSession, makeReadiness(4), BASE_PROFILE);
    expect(session.classification?.category).toBe("endurance_conditioning");
    const text = allMainText(session);
    expect(BALL_RE.test(text)).toBe(false);
    expect(/bieg|run|trucht|aerob/i.test(text)).toBe(true);
  });

  it("readiness 2: becomes recovery", () => {
    const { session } = applyReadiness(enduranceSession, makeReadiness(2), BASE_PROFILE);
    expect(session.classification?.category).toBe("recovery_prehab");
  });

  it("pain: NO ball work in replacement", () => {
    const { session } = applyReadiness(enduranceSession, makeReadiness(5), PAIN_PROFILE);
    expect(BALL_RE.test(allMainText(session))).toBe(false);
  });
});

// ─── Strength session ────────────────────────────────────────────────────────

describe("Strength session — readiness adaptation", () => {
  const strengthSession = makeSession({
    title: "Siła / moc na siłowni — dolna partia ciała",
    sessionType: "Siła / moc",
    sections: {
      main: [
        { name: "Przysiad ze sztangą", prescription: "4 × 5 @ 80%" },
        { name: "Martwy ciąg", prescription: "3 × 5 @ 75%" },
        { name: "Podskoki — max przyspiesz", prescription: "4 × 5" },
      ],
    },
  } as Parameters<typeof makeSession>[0]);

  it("readiness 9: category gym_strength, exercises untouched", () => {
    const { session } = applyReadiness(strengthSession, makeReadiness(9), BASE_PROFILE);
    expect(session.classification?.category).toBe("gym_strength");
    expect(allMainText(session)).toMatch(/przysiad|martwy/i);
  });

  it("readiness 6: category gym_strength preserved, NO ball", () => {
    const { session } = applyReadiness(strengthSession, makeReadiness(6), BASE_PROFILE);
    expect(session.classification?.category).toBe("gym_strength");
    expect(BALL_RE.test(allMainText(session))).toBe(false);
  });

  it("readiness 4: category gym_strength preserved, NO ball, bodyweight replacement", () => {
    const { session } = applyReadiness(strengthSession, makeReadiness(4), BASE_PROFILE);
    expect(session.classification?.category).toBe("gym_strength");
    const text = allMainText(session);
    expect(BALL_RE.test(text)).toBe(false);
    expect(/ciężar ciała|bodyweight|squat|bird-dog|hip bridge/i.test(text)).toBe(true);
  });

  it("readiness 2: becomes recovery", () => {
    const { session } = applyReadiness(strengthSession, makeReadiness(2), BASE_PROFILE);
    expect(session.classification?.category).toBe("recovery_prehab");
  });

  it("pain: NO ball work in replacement", () => {
    const { session } = applyReadiness(strengthSession, makeReadiness(5), PAIN_PROFILE);
    expect(BALL_RE.test(allMainText(session))).toBe(false);
  });
});

// ─── Football session ────────────────────────────────────────────────────────

describe("Football / club session — readiness adaptation", () => {
  const footballSession = makeSession({
    title: "Lekka technika piłkarska",
    sessionType: "Piłka — technika i podania",
    dayType: "training" as DayType,
    sections: {
      main: [
        { name: "Sprinty z piłką — przyspiesz", prescription: "6 × 20 m" },
        { name: "Prowadzenie piłki", prescription: "10 min" },
      ],
    },
  } as Parameters<typeof makeSession>[0]);

  it("readiness 9: category preserved, exercises untouched", () => {
    const { session } = applyReadiness(footballSession, makeReadiness(9), BASE_PROFILE);
    // classified as speed_sprint or other depending on header
    expect(["speed_sprint", "other"]).toContain(session.classification?.category);
  });

  it("readiness 6: category preserved, NO unintended category change", () => {
    const { session } = applyReadiness(footballSession, makeReadiness(6), BASE_PROFILE);
    const cat = session.classification?.category;
    expect(["speed_sprint", "other"]).toContain(cat);
  });

  it("readiness 4: ball work is acceptable (football session)", () => {
    const { session } = applyReadiness(footballSession, makeReadiness(4), BASE_PROFILE);
    // football/other → ball-technique replacement is appropriate
    expect(session.classification?.category).toBe("other");
    const text = allMainText(session);
    // the hard sprint exercise is replaced with ball technique (not stripped entirely)
    expect(BALL_RE.test(text)).toBe(true);
  });

  it("readiness 2: becomes recovery", () => {
    const { session } = applyReadiness(footballSession, makeReadiness(2), BASE_PROFILE);
    expect(session.classification?.category).toBe("recovery_prehab");
  });
});

// ─── Second session removal ──────────────────────────────────────────────────

describe("Second session removal", () => {
  const sessionWithSecond = makeSession({
    title: "Sprinting — akceleracja",
    sessionType: "Szybkość / sprint",
    sections: { main: [{ name: "Sprint 20 m", prescription: "8 × 20 m" }] },
  } as Parameters<typeof makeSession>[0]);

  const withSecond: SessionDay = {
    ...sessionWithSecond,
    secondSession: makeSession({
      title: "Prehab",
      sessionType: "Prehab",
      sections: { main: [] },
    } as Parameters<typeof makeSession>[0]),
    slotLabel: "Rano + Wieczór",
  };

  it("readiness 7: second session kept", () => {
    const { session } = applyReadiness(withSecond, makeReadiness(7), BASE_PROFILE);
    expect(session.secondSession).not.toBeNull();
  });

  it("readiness 6: second session removed", () => {
    const { session } = applyReadiness(withSecond, makeReadiness(6), BASE_PROFILE);
    expect(session.secondSession).toBeNull();
  });

  it("pain: second session removed regardless of readiness", () => {
    const { session } = applyReadiness(withSecond, makeReadiness(8), PAIN_PROFILE);
    expect(session.secondSession).toBeNull();
  });
});
