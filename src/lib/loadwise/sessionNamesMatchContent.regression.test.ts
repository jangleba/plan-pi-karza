import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { canonicalizeGeneratedExercise, getExerciseDefinition } from "./exerciseLibrary";
import { classifySession } from "./sessionClassification";
import { planSessionType } from "./sessionRuntime";
import { enforceSprintOnlyContent } from "./sprintContentPolicy";
import type { ExerciseItem, Profile, SessionDay } from "./types";

/**
 * Player report: sessions that are empty, or whose name does not match what
 * is inside. A seeded scan over many profiles checks every generated day
 * against the rules below; the unit cases pin the root causes found by it.
 */

let seed = 20261108;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const subset = <T>(items: readonly T[], p: number) => items.filter(() => random() < p);

function randomProfile(): Profile {
  const age = pick([13, 14, 15, 16, 17, 18, 22, 25, 30]);
  const matchDay = pick([6, 7, 7, 3, "no_fixed_day"] as const);
  const pain = random() < 0.1;
  const individual = subset([1, 2, 3, 4, 5, 6, 7], 0.65);
  return {
    name: "Skan nazw",
    age,
    position: pick(["goalkeeper", "defender", "midfielder", "forward"]),
    level: pick(["beginner", "intermediate", "advanced", "elite"]),
    goal: pick([
      "speed",
      "strength",
      "endurance",
      "power",
      "agility",
      "general",
      "mobility",
      "return",
      "matchready",
    ]),
    secondaryLimiter: pick([
      null,
      null,
      "speed",
      "strength",
      "endurance",
      "cod",
      "power",
      "ball",
      "fatigue",
    ]),
    clubTrainingDays: subset([1, 2, 3, 4, 5], 0.5),
    individualTrainingDays: individual.length ? individual : [2, 4],
    unavailableDays: random() < 0.2 ? [pick([1, 2, 3, 4, 5, 6, 7])] : [],
    usualMatchDay: matchDay,
    matchDate: matchDay === "no_fixed_day" && random() < 0.5 ? "2026-11-14" : null,
    equipment: subset(
      ["barbell", "rack", "band", "dumbbell", "bench", "box", "med_ball", "sled", "sliders"],
      0.4,
    ),
    homeEquipment: subset(["band", "dumbbell", "med_ball", "box"], 0.3),
    painInjury: pain,
    painLocations: pain ? [pick(["knee", "ankle", "hamstring", "groin"] as const)] : [],
    doubleSessionsAllowed: pick(["no", "light_only", "yes_if_safe"]),
    guardianConsent: age < 18,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    seasonPhase: pick(["offseason", "preseason", "inseason", "inseason", "transition"]),
    seasonPhaseOverride: random() < 0.5,
    seasonStage: "match_week",
    competitionLevel: age < 18 ? "academy" : pick(["okregowka", "iv_liga", "iii_liga"]),
    weeklyMatches: random() < 0.8,
    hasGym: random() < 0.7,
    hasPitch: random() < 0.8,
    hasSprintSpace: random() < 0.75,
    gymExperienceLevel: pick([undefined, "none", "beginner", "intermediate", "advanced"]),
    movementCompetence: pick([undefined, "low", "medium", "high"]),
    healthPersonalizationEnabled: random() < 0.5,
  } as Profile;
}

const WORK_SECTIONS = new Set(["main", "accessory", "footballTransfer"]);
function rows(
  session: SessionDay,
): Array<{ section: string; exercise: { name: string; exerciseId?: string } }> {
  if (session.structuredSections?.length)
    return session.structuredSections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.exercises.map((exercise) => ({ section: section.type as string, exercise })),
      ),
    );
  return Object.entries(session.sections ?? {}).flatMap(([section, list]) =>
    (list as ExerciseItem[]).map((exercise) => ({ section, exercise })),
  );
}

const restLike = (s: SessionDay) =>
  s.dayType === "rest" || /^(odpoczynek|dzień wolny)/i.test(s.title);

function problems(session: SessionDay): string[] {
  const found: string[] = [];
  const all = rows(session);
  const work = all.filter((row) => WORK_SECTIONS.has(row.section));
  const defs = work.map((row) => getExerciseDefinition(row.exercise.exerciseId ?? ""));
  const where = `${session.date} „${session.title}”`;
  if (restLike(session)) {
    if (all.length) found.push(`${where}: dzień wolny zawiera ${all.length} ćwiczeń`);
    if (session.durationMin > 0)
      found.push(`${where}: dzień wolny trwa ${session.durationMin} min`);
    return found;
  }
  if (["club", "match"].includes(session.dayType) || session.durationMin === 0) return found;
  if (!work.length) found.push(`${where}: tylko rozgrzewka/wyciszenie`);
  if (session.type && session.type !== planSessionType(session))
    found.push(`${where}: typ ${session.type} ≠ ${planSessionType(session)}`);
  const title = session.title.toLowerCase();
  if (
    /góra ciała/.test(title) &&
    defs.some(
      (d) => d?.category === "strength" && ["squat", "hinge", "lunge"].includes(d.movementPattern),
    )
  )
    found.push(`${where}: „góra ciała” z ćwiczeniem nóg`);
  if (
    /masa ciała|bez sprzętu/.test(title) &&
    defs.some((d) => d?.equipmentRequired.some((e) => e !== "none" && e !== "band"))
  )
    found.push(`${where}: „bez sprzętu” ze sprzętem`);
  if (
    /zmian\w* kierunku|\bcod\b|zwinno/.test(title) &&
    !defs.some((d) => d && /cut|505|deceler|stop|reaccel|turn|cod/.test(d.id))
  )
    found.push(`${where}: zmiana kierunku bez ćwiczenia zmiany kierunku`);
  if (
    /\bmoc\b|power/.test(title) &&
    work.length &&
    !defs.some((d) => d && ["power", "plyometric"].includes(d.category))
  )
    found.push(`${where}: „moc” bez ćwiczenia mocy`);
  const ids = work.map((row) => `${row.exercise.exerciseId}/${row.exercise.name}`);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) found.push(`${where}: powtórzone ćwiczenie ${duplicate}`);
  for (const { exercise } of all) {
    if (
      /hamowani|zmian\w* kierunku/i.test(exercise.name) &&
      exercise.exerciseId === "acceleration_mechanics"
    )
      found.push(`${where}: „${exercise.name}” pokazane jako mechanika przyspieszenia`);
    const def = getExerciseDefinition(exercise.exerciseId ?? "");
    if (
      def?.family === "football_ball_work" &&
      /\bskip|sprint|marsz|hamowani|start|ankling|zmian\w* kierunku/i.test(exercise.name) &&
      !/piłk|prowadzeni/i.test(exercise.name)
    )
      found.push(`${where}: „${exercise.name}” pokazane jako praca z piłką`);
  }
  return found;
}

describe("sessions are never empty and their names match their content", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());
  const starts = [new Date(2026, 10, 2), new Date(2027, 0, 4), new Date(2026, 6, 6)];
  const chunks = Array.from({ length: 8 }, (_, chunk) =>
    Array.from({ length: 20 }, () => ({
      profile: randomProfile(),
      start: pick(starts),
      weekOffset: pick([0, 0, 1, 3]),
      chunk,
    })),
  );
  it.each(chunks.map((cases, index) => ({ cases, index })))(
    "seeded profiles, part $index",
    ({ cases }) => {
      const found: string[] = [];
      for (const { profile, start, weekOffset } of cases)
        for (const day of generatePlan(profile, start, 14, weekOffset))
          for (const session of [day, day.secondSession].filter(Boolean) as SessionDay[])
            found.push(...problems(session));
      expect(found).toEqual([]);
    },
    30_000,
  );
});

describe("root causes behind the empty and misnamed sessions", () => {
  const map = (name: string, cue = "") =>
    canonicalizeGeneratedExercise({ name, prescription: "3 × 4", cue }).exerciseId;

  it("maps braking, change of direction and sprint drills to the drill that is actually prescribed", () => {
    expect(map("Mechanika hamowania", "Nisko biodra, cichy kontakt stopy.")).toBe(
      "run_two_step_stop",
    );
    expect(map("Zmiana kierunku 45°/90°")).toBe("planned_cut");
    expect(map("Hamowanie i zmiana kierunku")).toBe("deceleration_lateral_exit");
    expect(map("Wejście w zwrot 5-0-5")).toBe("planned_505");
    expect(map("Marsz z uniesieniem kolana", "Napięty tułów.")).toBe("a_march");
    expect(map("Sprint A-Skip")).toBe("a_skip");
    expect(map("Ankling + niskie dribbles")).toBe("ankling");
    expect(map("Sprinty liniowe (akceleracja)")).toBe("free_acceleration_sprint");
    expect(map("Wyrzut piłki lekarskiej")).toBe("med_ball_throw");
    expect(map("Przysiad bułgarski (masa ciała)")).toBe("bodyweight_split_squat");
  });

  it("keeps the prescribed name when the drill is mapped through a hint", () => {
    const item = canonicalizeGeneratedExercise({
      name: "Mechanika hamowania",
      prescription: "4 × 5 m",
    });
    expect(item.name).toBe("Mechanika hamowania");
  });

  it("keeps a ball session with a speed accent a ball session, so its drills are not stripped", () => {
    const ball = {
      date: "2026-07-07",
      dayName: "Wtorek",
      dayType: "training",
      title: "Technika i decyzje z piłką",
      sessionType: "Piłka",
      goalOfSession:
        "Technika i decyzje z akcentem szybkościowym: pierwszy kontakt, akcja po przyspieszeniu.",
      goalLabel: "Piłka",
      intensity: "umiarkowana",
      durationMin: 45,
      reason: "",
      safetyNote: null,
      whyToday: "",
      riskManaged: "",
      avoidToday: "",
      mdLabel: null,
      slotLabel: null,
      secondSession: null,
      sections: {
        warmup: [{ name: "Trucht", prescription: "5 min" }],
        main: [
          {
            name: "Pierwszy kontakt i skanowanie",
            prescription: "8 min",
            exerciseId: "football_technical_self_selected",
          },
        ],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
    } as SessionDay;
    expect(classifySession(ball).category).not.toBe("speed_sprint");
    expect(enforceSprintOnlyContent(ball).sections.main).toHaveLength(1);
  });

  it("turns a sprint session left with only warm-up and cool-down into a clearly empty slot", () => {
    const sprint = {
      date: "2026-07-11",
      dayName: "Sobota",
      dayType: "training",
      title: "Sprint i przyspieszenie",
      sessionType: "Szybkość",
      goalOfSession: "",
      goalLabel: "Szybkość",
      intensity: "wysoka",
      durationMin: 45,
      reason: "",
      safetyNote: null,
      whyToday: "",
      riskManaged: "",
      avoidToday: "",
      mdLabel: null,
      slotLabel: null,
      secondSession: null,
      exercises: [{ name: "Trucht", prescription: "5 min" }],
      sections: {
        warmup: [{ name: "Trucht", prescription: "5 min" }],
        main: [{ name: "Sprint z piłką", prescription: "4 × 20 m" }],
        accessory: [],
        footballTransfer: [],
        cooldown: [{ name: "Marsz", prescription: "3 min" }],
      },
    } as SessionDay;
    expect(enforceSprintOnlyContent(sprint).durationMin).toBe(0);
  });

  it("still gives the screenshot week a complete gym session B", () => {
    const profile = {
      name: "Zrzut",
      age: 24,
      position: "midfielder",
      level: "advanced",
      goal: "strength",
      secondaryLimiter: null,
      clubTrainingDays: [1, 3],
      individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
      usualMatchDay: 7,
      matchDate: "2026-11-08",
      doubleSessionsAllowed: "no",
      guardianConsent: true,
      onboardingComplete: true,
      createdAt: "2026-11-02",
      seasonPhase: "inseason",
      seasonPhaseOverride: true,
      seasonStage: "match_week",
      competitionLevel: "iv_liga",
      weeklyMatches: true,
      hasGym: true,
      hasPitch: true,
      hasSprintSpace: true,
      equipment: [],
      painInjury: false,
    } as Profile;
    const b = generatePlan(profile, new Date(2026, 10, 2), 7).find((s) => s.date === "2026-11-05")!;
    expect(b.title).toMatch(/^Siłownia: całe ciało B/);
    const names = rows(b)
      .filter((r) => WORK_SECTIONS.has(r.section))
      .map((r) => r.exercise.name);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names.join(" ")).not.toMatch(/Bodyweight row|Pallof press/);
  });
});
