import { describe, expect, it } from "vitest";
import { evaluateMeal, preSessionPlan, requiredLeadMinutes } from "./engine";
import { parseMeal } from "./mealParser";
import type { FuelRequest, FuelSessionInput, Portion, TimeBucket } from "./types";

const sprint: FuelSessionInput = {
  kind: "speed",
  intensity: "wysoka",
  durationMin: 65,
  minutesToStart: null,
  title: "Sprint – akceleracja",
  subtitle: "Szybkość",
  date: "2026-08-04",
  startClock: null,
  dayLabel: "Dzisiaj",
};

const recovery: FuelSessionInput = {
  ...sprint,
  kind: "recovery",
  intensity: "niska",
  durationMin: 30,
  title: "Regeneracja",
};

function req(
  text: string,
  bucket: TimeBucket,
  portion: Portion = "normalna",
  session: FuelSessionInput = sprint,
  onlyThis = false,
): FuelRequest {
  return {
    session,
    athlete: { age: 17, position: "napastnik", level: null, goal: null, restrictions: [] },
    meal: parseMeal(text),
    portion,
    timeBucket: bucket,
    onlyThis,
  };
}

describe("parseMeal", () => {
  it("rozpoznaje pieczywo, ser, mięso, owoc i energetyk", () => {
    const m = parseMeal("dwa tosty z serem i szynką, banan i energetyk");
    const keys = m.items.map((i) => i.key);
    expect(keys).toContain("bread");
    expect(keys).toContain("cheese");
    expect(keys).toContain("meat");
    expect(keys).toContain("banana");
    expect(keys).toContain("energy");
    expect(m.hasCarbs).toBe(true);
    expect(m.caffeine.length).toBe(1);
  });

  it("rozpoznaje fast food jako ciężki", () => {
    const m = parseMeal("burger z frytkami i cola");
    expect(m.heaviness).toBeGreaterThanOrEqual(4);
  });

  it("nie zgaduje przy nierozpoznanym tekście", () => {
    const m = parseMeal("cośtam nieznanego");
    expect(m.recognized).toBe(false);
    expect(m.hasCarbs).toBe(false);
  });

  it("jest deterministyczny", () => {
    const a = parseMeal("ryż z kurczakiem i warzywami");
    const b = parseMeal("ryż z kurczakiem i warzywami");
    expect(a).toEqual(b);
  });
});

describe("evaluateMeal — ten sam posiłek, inny moment", () => {
  const text = "makaron z mięsem i serem";

  it("PASUJE ponad 4 h przed sprintem", () => {
    const r = evaluateMeal(req(text, "gt240"));
    expect(r?.verdict).toBe("PASUJE");
  });

  it("wymaga korekty lub przesunięcia 40 min przed sprintem", () => {
    const r = evaluateMeal(req(text, "30_60"));
    expect(r?.verdict === "POPRAW" || r?.verdict === "ZOSTAW_NA_POZNIEJ").toBe(true);
    expect(r?.change).toBeTruthy();
  });

  it("ZOSTAW NA PÓŹNIEJ tuż przed startem przy dużej porcji", () => {
    const r = evaluateMeal(req(text, "lt30", "duza"));
    expect(r?.verdict).toBe("ZOSTAW_NA_POZNIEJ");
  });
});

describe("evaluateMeal — reguły składu", () => {
  it("POPRAW gdy brak węglowodanów przed intensywną jednostką", () => {
    const r = evaluateMeal(req("jajka i jogurt", "120_240"));
    expect(r?.verdict).toBe("POPRAW");
    expect(r?.ruleId).toBe("CARBS_MISSING_V1");
  });

  it("PASUJE dla lekkiego węglowodanu blisko startu", () => {
    const r = evaluateMeal(req("banan i woda", "30_60", "mala"));
    expect(r?.verdict).toBe("PASUJE");
  });

  it("regeneracja nie wymaga węglowodanów", () => {
    const r = evaluateMeal(req("jogurt", "60_120", "mala", recovery));
    expect(r?.verdict).toBe("PASUJE");
  });

  it("brak jednostki → brak werdyktu", () => {
    const r = evaluateMeal(
      req("banan", "60_120", "mala", { ...sprint, kind: "none" }),
    );
    expect(r).toBeNull();
  });

  it("brak czasu → brak werdyktu", () => {
    const base = req("banan", "60_120");
    const r = evaluateMeal({ ...base, timeBucket: null });
    expect(r).toBeNull();
  });
});

describe("tryb „Mam tylko to”", () => {
  it("optymalizuje wpisany zestaw zamiast proponować inny", () => {
    const r = evaluateMeal(req("burger z frytkami i banan", "30_60", "duza", sprint, true));
    expect(r?.onlyThis).not.toBeNull();
    expect(r?.onlyThis?.eatNow).toContain("banan");
    expect(r?.onlyThis?.later.length).toBeGreaterThan(0);
  });
});

describe("determinizm i reguły pomocnicze", () => {
  it("ten sam wejściowy request daje ten sam wynik", () => {
    const a = evaluateMeal(req("ryż z kurczakiem", "120_240"));
    const b = evaluateMeal(req("ryż z kurczakiem", "120_240"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("większa porcja wydłuża wymagany odstęp", () => {
    const meal = parseMeal("makaron z mięsem");
    expect(requiredLeadMinutes(meal, "duza")).toBeGreaterThan(
      requiredLeadMinutes(meal, "mala"),
    );
  });

  it("plan przed treningiem zależy od czasu i typu", () => {
    expect(preSessionPlan(sprint, 20)).not.toBe(preSessionPlan(sprint, 300));
    expect(preSessionPlan({ ...sprint, kind: "none" }, 60)).toBe("");
  });
});
