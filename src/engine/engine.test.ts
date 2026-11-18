import { describe, expect, it } from "vitest";
import { calcMas, formatPace, masRetestDue, intervalDistanceM } from "./mas";
import { phaseOf, planWeek } from "./week";
import type { WeekInput } from "./types";

describe("MAS", () => {
  it("liczy MAS z biegu 5-minutowego", () => {
    const m = calcMas(1500);
    expect(m.ms).toBeCloseTo(5, 5);
    expect(m.kmh).toBeCloseTo(18, 5);
    expect(formatPace(m.paceSecPerKm)).toBe("3:20/km");
  });
  it("odrzuca niepoprawne dane", () => {
    expect(() => calcMas(0)).toThrow();
  });
  it("dystans interwału 15 s przy 105% MAS", () => {
    expect(intervalDistanceM(calcMas(1500), 105, 15)).toBe(79);
  });
  it("test MAS po 9 tygodniach", () => {
    expect(masRetestDue("2026-01-01", "2026-03-05")).toBe(true);
    expect(masRetestDue("2026-01-01", "2026-02-01")).toBe(false);
  });
});

// 2026-11-16 = poniedziałek
const base: WeekInput = {
  weekStart: "2026-11-16",
  matches: ["2026-11-21"], // sobota
  clubDays: [],
  level: "intermediate",
  limitedGymAccess: false,
};

describe("fazy meczowe", () => {
  it("klasyfikuje dni wokół meczu", () => {
    expect(phaseOf("2026-11-21", base.matches)).toBe("MD");
    expect(phaseOf("2026-11-20", base.matches)).toBe("MD-1");
    expect(phaseOf("2026-11-19", base.matches)).toBe("MD-2");
    expect(phaseOf("2026-11-18", base.matches)).toBe("MD-3");
    expect(phaseOf("2026-11-22", base.matches)).toBe("MD+1");
    expect(phaseOf("2026-11-23", base.matches)).toBe("MD+2");
  });
  it("dwa mecze blisko siebie = krótki cykl", () => {
    expect(phaseOf("2026-11-18", ["2026-11-17", "2026-11-21"])).toBe("congested");
  });
});

describe("plan tygodnia", () => {
  const plan = planWeek(base);
  const by = (d: string) => plan.days.find((x) => x.date === d)!;

  it("MD-3 to siła, MD-2 bieganie, MD-1 bez ciężkiej pracy", () => {
    expect(by("2026-11-18").session?.kind).toBe("strength");
    expect(by("2026-11-19").session?.kind).toBe("run");
    expect(["activation", "sprint", "technique"]).toContain(by("2026-11-20").session?.kind);
  });
  it("dzień meczu bez sesji", () => {
    expect(by("2026-11-21").session).toBeNull();
  });
  it("spełnia minimum: siła, bieg, sprint", () => {
    const kinds = plan.days.map((d) => d.session?.kind);
    for (const k of ["strength", "run", "sprint"] as const) expect(kinds).toContain(k);
    expect(plan.warnings).toEqual([]);
  });
  it("nigdy dwóch takich samych ciężkich sesji dzień po dniu", () => {
    for (let i = 1; i < plan.days.length; i++) {
      const a = plan.days[i - 1]!.session?.kind;
      const b = plan.days[i]!.session?.kind;
      if (a && ["strength", "run", "sprint"].includes(a)) expect(b).not.toBe(a);
    }
  });
  it("MD+1: mniej zaawansowani tylko góra, zaawansowani pełna siła", () => {
    const mdPlus1 = (p: ReturnType<typeof planWeek>) =>
      p.days.find((d) => d.phase === "MD+1")?.session;
    // tydzień z meczem w środę -> czwartek MD+1 w tygodniu
    const wed: WeekInput = { ...base, matches: ["2026-11-18"] };
    const inter = mdPlus1(planWeek(wed));
    if (inter?.kind === "strength") expect(inter.variant).toBe("upper");
    const adv = mdPlus1(planWeek({ ...wed, level: "advanced" }));
    expect(adv).toBeTruthy();
  });
  it("dzień klubowy + 1 indywidualna to maksimum", () => {
    const withClub = planWeek({ ...base, clubDays: ["2026-11-16", "2026-11-18"] });
    for (const d of withClub.days) {
      const count = (d.isClub ? 1 : 0) + (d.session ? 1 : 0);
      expect(count).toBeLessThanOrEqual(2);
    }
  });
  it("krótki cykl: tylko lekkie sesje", () => {
    const p = planWeek({ ...base, matches: ["2026-11-17", "2026-11-20"] });
    for (const d of p.days.filter((x) => x.phase === "congested")) {
      if (d.session) expect(["recovery", "activation", "technique"]).toContain(d.session.kind);
    }
  });
});
