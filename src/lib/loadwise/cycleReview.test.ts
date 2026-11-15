import { describe, expect, it } from "vitest";
import {
  buildCycleReview,
  countDone,
  cycleReviewCopy,
  plannedOwnSessions,
  strengthChanges,
  type CycleReviewInput,
  type PlannedOwnSession,
} from "./cycleReview";
import type { Readiness, SessionDay, SessionHistoryRecord } from "./types";

const START = "2026-10-12";
const END = "2026-11-08";

function dateAt(offset: number): string {
  const date = new Date(`${START}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** 4 tygodnie × 4 własne treningi = 16 zaplanowanych. */
function planned(count = 16): PlannedOwnSession[] {
  const categories = ["gym", "speed", "endurance", "ball"];
  return Array.from({ length: count }, (_, i) => ({
    key: `s${i}`,
    date: dateAt(Math.floor(i / 4) * 7 + (i % 4) * 2),
    category: categories[i % 4],
  }));
}

function done(items: PlannedOwnSession[], rpe: number | ((i: number) => number) = 6) {
  return items.map<SessionHistoryRecord>((item, i) => ({
    key: item.key!,
    date: item.date,
    title: "Trening",
    category: item.category as SessionHistoryRecord["category"],
    durationMin: 45,
    rpe: typeof rpe === "number" ? rpe : rpe(i),
    notes: "",
  }));
}

function checkin(offset: number, overrides: Partial<Readiness> = {}): Readiness {
  return {
    date: dateAt(offset),
    sleep: 8,
    energy: 7,
    fatigue: 3,
    soreness: 3,
    jointPain: 0,
    stress: 4,
    motivation: 7,
    overall: 8,
    redFlags: [],
    ...overrides,
  };
}

function input(overrides: Partial<CycleReviewInput> = {}): CycleReviewInput {
  const items = planned();
  return {
    startDate: START,
    endDate: END,
    planned: items,
    history: done(items),
    readiness: [],
    strengthSets: [],
    tests: { improved: 0, declined: 0, flat: 0 },
    age: 20,
    phaseNext: "offseason",
    ...overrides,
  };
}

describe("cycle review — adherence", () => {
  it("counts own sessions only (no club, match, rest, recovery or unavailable days)", () => {
    const base = { title: "", secondSession: null } as unknown as SessionDay;
    const plan = [
      { ...base, date: START, dayType: "training", type: "strength_power", dbId: "a" },
      { ...base, date: dateAt(1), dayType: "club", type: "club_training", isClubSession: true },
      { ...base, date: dateAt(2), dayType: "match", type: "match" },
      { ...base, date: dateAt(3), dayType: "rest" },
      { ...base, date: dateAt(4), dayType: "recovery", type: "recovery" },
      {
        ...base,
        date: dateAt(5),
        dayType: "training",
        type: "sprint_acceleration",
        isUnavailable: true,
      },
      {
        ...base,
        date: dateAt(6),
        dayType: "club",
        type: "club_training",
        isClubSession: true,
        secondSession: { ...base, date: dateAt(6), dayType: "training", type: "endurance_running" },
      },
    ] as SessionDay[];
    expect(plannedOwnSessions(plan).map((s) => s.category)).toEqual(["gym", "endurance"]);
  });

  it("matches by session id first, then a replacement of the same goal on the same day", () => {
    const items = planned(3);
    const history: SessionHistoryRecord[] = [
      ...done([items[0]]),
      // Ta sama kategoria celu tego samego dnia pod innym id — zamiennik tego celu.
      { ...done([items[1]])[0], key: "swapped" },
      // Poza cyklem — nie liczy się.
      { ...done([items[2]])[0], key: "late", date: "2026-11-20" },
    ];
    expect(countDone(items, history, START, END)).toBe(2);
  });

  it("another activity on the same day does not count a goal that was not done", () => {
    const items = planned(4);
    const gym = items[0];
    const history: SessionHistoryRecord[] = [
      // Planowana siłownia nie została wykonana; tego dnia był tylko trening z piłką.
      { ...done([gym])[0], key: "ball-only", category: "ball" },
    ];
    expect(countDone([gym], history, START, END)).toBe(0);
    // Ten sam trening z piłką zalicza za to zaplanowany trening z piłką.
    const ball = { ...items[3], date: gym.date };
    expect(countDone([ball], history, START, END)).toBe(1);
    // Obciążenie nie znika: trening z piłką liczy się w RPE tygodnia i w Postępie.
    const review = buildCycleReview(input({ planned: [gym], history }))!;
    expect(review.done).toBe(0);
    expect(review.adherencePct).toBe(0);
  });

  it("caps adherence at 100% when extra sessions were added", () => {
    const items = planned(4);
    const extra = done(items).map((row) => ({ ...row, key: `${row.key}-x` }));
    const review = buildCycleReview(input({ planned: items, history: [...done(items), ...extra] }));
    expect(review?.adherencePct).toBe(100);
  });

  it("returns no review when nothing was planned", () => {
    expect(buildCycleReview(input({ planned: [] }))).toBeNull();
  });
});

describe("cycle review — recommendation rules", () => {
  it("good adherence, moderate effort, off-season → progress", () => {
    expect(buildCycleReview(input())?.recommendation).toBe("progress");
  });

  it("youth progress uses small steps and never adds training days", () => {
    const review = buildCycleReview(input({ age: 16 }))!;
    expect(review.youth).toBe(true);
    const copy = cycleReviewCopy(review);
    expect(copy.recommendationTitle).toBe("Dalej według planu");
    // No promised "overload week": time alone never raises the dose in V2.
    expect(copy.recommendationText).toMatch(/bez zmiany dawki/);
    expect(copy.recommendationText).not.toMatch(/przeciążenia/);
  });

  it("in season with good adherence → maintain (not progress)", () => {
    const review = buildCycleReview(input({ phaseNext: "inseason" }))!;
    expect(review.recommendation).toBe("maintain");
    expect(cycleReviewCopy(review).recommendationTitle).toBe("Utrzymanie formy w sezonie");
  });

  it("50–79% done → maintain", () => {
    const items = planned();
    expect(buildCycleReview(input({ history: done(items.slice(0, 10)) }))?.recommendation).toBe(
      "maintain",
    );
  });

  it("below 50% done → consistency first, with a weekly target", () => {
    const items = planned();
    const review = buildCycleReview(input({ history: done(items.slice(0, 5)) }))!;
    expect(review.recommendation).toBe("consistency");
    // 16 sesji / 4 tygodnie × 80% → 4 treningi w tygodniu
    expect(cycleReviewCopy(review).recommendationText).toContain("4 treningi w tygodniu");
  });

  it("very hard average session RPE → deload even with full adherence", () => {
    expect(buildCycleReview(input({ history: done(planned(), 8.5) }))?.recommendation).toBe(
      "deload",
    );
  });

  it("RPE rising through the cycle to ≥ 7 → deload", () => {
    const review = buildCycleReview(input({ history: done(planned(), (i) => (i < 8 ? 5 : 7.5)) }))!;
    expect(review.rpeRise).toBeGreaterThanOrEqual(1.5);
    expect(review.recommendation).toBe("deload");
  });

  it("many poor check-ins → deload", () => {
    const readiness = [0, 2, 4, 6, 8, 10].map((d, i) => checkin(d, { overall: i < 2 ? 3 : 7 }));
    const review = buildCycleReview(input({ readiness }))!;
    expect(review.feeling).toBe("heavy");
    expect(review.recommendation).toBe("deload");
  });

  it("too few check-ins are not interpreted", () => {
    const readiness = [checkin(0, { overall: 2 }), checkin(1, { overall: 2 })];
    expect(buildCycleReview(input({ readiness }))?.feeling).toBe("unknown");
  });

  it("repeated pain or a red flag → health first, before anything else", () => {
    const pain = [0, 3, 6].map((d) => checkin(d, { jointPain: 5 }));
    expect(buildCycleReview(input({ readiness: pain }))?.recommendation).toBe("health");
    const flag = [checkin(2, { redFlags: ["chest_pain"] })];
    expect(
      buildCycleReview(input({ readiness: flag, phaseNext: "transition" }))?.recommendation,
    ).toBe("health");
  });

  it("season over (transition) → active rest, not progress", () => {
    expect(buildCycleReview(input({ phaseNext: "transition" }))?.recommendation).toBe("transition");
  });

  it("full adherence but no measured progress → vary the stimulus", () => {
    const review = buildCycleReview(input({ tests: { improved: 0, declined: 1, flat: 2 } }))!;
    expect(review.progress).toBe("down");
    expect(review.recommendation).toBe("vary");
  });

  it("measured progress keeps the progress recommendation", () => {
    const review = buildCycleReview(input({ tests: { improved: 2, declined: 0, flat: 1 } }))!;
    expect(review.progress).toBe("up");
    expect(review.recommendation).toBe("progress");
  });
});

describe("cycle review — strength progress", () => {
  it("compares the first and last day of each exercise with ±2.5% threshold", () => {
    const result = strengthChanges(
      [
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "squat",
          date: dateAt(0),
          weightKg: 60,
          reps: 5,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "squat",
          date: dateAt(20),
          weightKg: 65,
          reps: 5,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "rdl",
          date: dateAt(0),
          weightKg: 50,
          reps: 8,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "rdl",
          date: dateAt(20),
          weightKg: 50,
          reps: 8,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "press",
          date: dateAt(0),
          weightKg: 40,
          reps: 5,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "press",
          date: dateAt(20),
          weightKg: 35,
          reps: 5,
        },
        // Jeden dzień — nie da się ocenić.
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "row",
          date: dateAt(5),
          weightKg: 40,
          reps: 8,
        },
        // Bez ciężaru i poza cyklem — pomijane.
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "pushup",
          date: dateAt(0),
          weightKg: null,
          reps: 15,
        },
        {
          prescriptionKey: "verified-test-dose",
          exerciseKey: "squat",
          date: "2026-12-01",
          weightKg: 100,
          reps: 5,
        },
      ],
      START,
      END,
    );
    expect(result).toEqual({ improved: 1, declined: 1, flat: 1 });
  });
});

describe("cycle review — copy", () => {
  it("shows facts, one recommendation and one button", () => {
    const readiness = [0, 2, 4, 6, 8].map((d) => checkin(d));
    const copy = cycleReviewCopy(buildCycleReview(input({ readiness, phaseNext: "preseason" }))!);
    expect(copy.title).toBe("Koniec cyklu");
    expect(copy.facts).toEqual([
      "Treningi: 16 z 16 (100%)",
      "Wysiłek: średnio 6/10",
      "Samopoczucie: dobre",
      "Następny cykl: przygotowania do sezonu",
    ]);
    expect(copy.button).toBe("Zaczynam nowy cykl");
  });
});

describe("cycle review — club and matches are load, not goals", () => {
  const items = planned(16);
  const own = () => done(items, 6);
  const club = (n: number, rpe: number | null, patch: Partial<SessionHistoryRecord> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      key: `club-${i}`,
      date: dateAt(i * 4 + 1),
      title: "Klub",
      category: "club" as const,
      durationMin: 90,
      durationEstimated: true,
      durationSource: "club_default" as const,
      rpe,
      notes: "",
      ...patch,
    }));
  const matches = (rows: Array<[number, number | null]>) =>
    rows.map(([minutes, rpe], i) => ({
      key: `match-${i}`,
      date: dateAt(i * 6 + 2),
      title: "Mecz",
      category: "match" as const,
      durationMin: 0,
      matchMinutesPlayed: minutes,
      rpe,
      notes: "",
    }));

  it("six hard club sessions change the recommendation instead of staying 'progress'", () => {
    const base = buildCycleReview(input({ planned: items, history: own() }))!;
    expect(base.recommendation).toBe("progress");
    // Own work was easy (RPE 6); on top of it the athlete did six 90-min club sessions at RPE 9.
    const withClub = buildCycleReview(
      input({ planned: items, history: [...own(), ...club(6, 9)] }),
    )!;
    expect(withClub.recommendation).not.toBe("progress");
    // Own execution is reported separately from the whole week's load.
    expect(withClub.done).toBe(16);
    expect(withClub.adherencePct).toBe(100);
    expect(withClub.external!.clubDone).toBe(6);
    expect(withClub.external!.loadAu).toBe(6 * 90 * 9);
    expect(withClub.external!.loadUsesAssumedMinutes).toBe(true);
    expect(withClub.weekAvgRpe).toBeGreaterThan(base.avgRpe!);
  });

  it("does not diagnose fatigue from a single hard club session", () => {
    const one = buildCycleReview(input({ planned: items, history: [...own(), ...club(1, 10)] }))!;
    expect(one.recommendation).toBe("progress");
  });

  it("done club or match work without RPE or minutes is unknown load: hold, not progress", () => {
    const noRpe = buildCycleReview(
      input({ planned: items, history: [...own(), ...club(2, null)] }),
    )!;
    expect(noRpe.external!.withoutLoad).toBe(2);
    expect(noRpe.recommendation).toBe("maintain");
    const noMinutes = buildCycleReview(
      input({
        planned: items,
        history: [...own(), ...matches([[90, 7]]).map((m) => ({ ...m, matchMinutesPlayed: null }))],
      }),
    )!;
    expect(noMinutes.external!.withoutLoad).toBe(1);
    expect(noMinutes.recommendation).toBe("maintain");
  });

  it("a match uses minutes played; 0 minutes is a known value and a bench RPE is not load", () => {
    const review = buildCycleReview(
      input({
        planned: items,
        plannedExternal: [
          { key: "match-0", date: dateAt(2), kind: "match" },
          { key: "match-1", date: dateAt(8), kind: "match" },
        ],
        history: [
          ...own(),
          ...matches([
            [30, 8],
            [0, 9],
          ]),
        ],
      }),
    )!;
    expect(review.external).toMatchObject({
      matchPlanned: 2,
      matchDone: 2,
      matchMinutesPlayed: 30,
      loadAu: 240,
      withoutLoad: 0,
    });
    // Zero minutes played with RPE 9 does not feed the week's RPE.
    expect(review.weekAvgRpe).toBeCloseTo((16 * 6 + 8) / 17, 1);
    const copy = cycleReviewCopy(review);
    expect(copy.facts.some((f) => /mecze 2 z 2 \(30 min gry\)/.test(f))).toBe(true);
    expect(copy.facts.some((f) => /240 j\./.test(f))).toBe(true);
  });

  it("keeps the 90-minute club assumption marked as an assumption in the facts", () => {
    const review = buildCycleReview(input({ planned: items, history: [...own(), ...club(2, 6)] }))!;
    const copy = cycleReviewCopy(review);
    expect(copy.facts.join(" ")).toMatch(/czas klubu 90 min to założenie/);
  });
});
