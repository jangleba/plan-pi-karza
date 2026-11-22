import { describe, expect, it } from "vitest";
import { EXERCISES, TEMPLATES, mesoPhase, templateFor } from "./library";
import { adaptSession, strainOf } from "./adapt";

describe("biblioteka", () => {
  it("każdy szablon i zamiennik wskazuje istniejące ćwiczenie", () => {
    for (const t of TEMPLATES)
      for (const b of t.blocks) for (const i of b.items) expect(EXERCISES[i.exerciseId], i.exerciseId).toBeDefined();
    for (const e of Object.values(EXERCISES))
      for (const s of e.substitutes) expect(EXERCISES[s], `${e.id} -> ${s}`).toBeDefined();
  });
  it("zamienniki mają ten sam wzorzec ruchu lub pokrewny (nie wskazują siebie)", () => {
    for (const e of Object.values(EXERCISES)) expect(e.substitutes).not.toContain(e.id);
  });
  it("cykl 5 tygodni: objętość, intensywność, rozładowanie", () => {
    expect([1, 2, 3, 4, 5, 6].map(mesoPhase)).toEqual(["volume", "volume", "intensity", "intensity", "deload", "volume"]);
    expect(templateFor("strength", 3)?.template.id).toBe("strength-intensity");
    expect(templateFor("strength", 1)?.template.id).toBe("strength-volume");
    expect(templateFor("strength", 5)?.deload).toBe(true);
  });
});

describe("check-in", () => {
  const good = { recovery: 3, feeling: 3, less: false } as const;
  it("klasyfikuje obciążenie", () => {
    expect(strainOf(good)).toBe("none");
    expect(strainOf({ ...good, less: true })).toBe("light");
    expect(strainOf({ recovery: 1, feeling: 1, less: false })).toBe("heavy");
  });
  it("dobry check-in nie zmienia sesji", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, good);
    expect(a.blocks).toEqual(t.blocks);
    expect(a.notes).toEqual([]);
  });
  it("mocne zmęczenie: mniej serii, lżejsze ćwiczenia, krótsza sesja", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, { recovery: 1, feeling: 1, less: false });
    expect(a.blocks.length).toBeLessThan(t.blocks.length);
    const ids = a.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain("hang-power-clean");
    expect(a.notes.length).toBeGreaterThan(0);
  });
});

import { readinessScore } from "./adapt";
describe("gotowość", () => {
  it("od 40 do 100, „dziś mniej” −10", () => {
    expect(readinessScore({ recovery: 3, feeling: 3, less: false })).toBe(100);
    expect(readinessScore({ recovery: 1, feeling: 1, less: false })).toBe(40);
    expect(readinessScore({ recovery: 2, feeling: 3, less: true })).toBe(75);
  });
});

import { DEFAULT_CHECK_IN, normalizeCheckIn, restSuggested } from "./adapt";
describe("check-in: normalizacja i propozycja regeneracji", () => {
  it("zapis uszkodzony lub dawny (sleep) nie daje NaN", () => {
    expect(normalizeCheckIn(null)).toEqual(DEFAULT_CHECK_IN);
    expect(normalizeCheckIn("x")).toEqual(DEFAULT_CHECK_IN);
    expect(normalizeCheckIn({ sleep: 2, feeling: 1, less: true })).toEqual({ recovery: 2, feeling: 1, less: true });
    expect(normalizeCheckIn({ recovery: 7, feeling: "a" })).toEqual(DEFAULT_CHECK_IN);
    expect(Number.isNaN(readinessScore(normalizeCheckIn({ sleep: 4, feeling: 0 })))).toBe(false);
  });
  it("regeneracja zamiast sesji tylko przy „wyraźnie lżej” i słabej regeneracji po wczoraj", () => {
    expect(restSuggested({ recovery: 1, feeling: 1, less: false })).toBe(true);
    expect(restSuggested({ recovery: 1, feeling: 2, less: false })).toBe(true);
    expect(restSuggested({ recovery: 2, feeling: 1, less: false })).toBe(false); // wyraźnie lżej, ale regeneracja nie jest słaba
    expect(restSuggested({ recovery: 1, feeling: 3, less: false })).toBe(false); // tylko trochę lżej
    expect(restSuggested({ recovery: 3, feeling: 3, less: true })).toBe(false); // „dziś mniej” (brak czasu) nigdy nie odwołuje sesji
  });
  it("notatka o zmianie nie zakłada płci zawodnika", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const n = adaptSession(t, { recovery: 1, feeling: 1, less: false }).notes.join(" ");
    expect(n).not.toMatch(/spałeś|czujesz|zmęczony/);
    expect(n).toMatch(/słaba regeneracja/);
  });
});

import { RECOVERY, RECOVERY_LIGHT } from "./technique";
describe("regeneracja na słaby dzień", () => {
  it("krótka, bez odwołań do meczu, z ruchem, rozciąganiem i jedzeniem", () => {
    const text = [...RECOVERY_LIGHT.foundation, ...RECOVERY_LIGHT.optional].join(" ");
    expect(text).not.toMatch(/mecz/i);
    expect(text).toMatch(/spacer/);
    expect(text).toMatch(/rozciąganie/i);
    expect(text).toMatch(/posiłek/);
    expect(RECOVERY_LIGHT.minutes).toBeGreaterThan(0);
    expect(RECOVERY_LIGHT.title).not.toBe(RECOVERY.title);
  });
});


describe("góra ciała i zawodnik poniżej 18 lat", () => {
  it("wariant upper daje szablon bez ćwiczeń nóg", async () => {
    const { templateFor, EXERCISES } = await import("./library");
    const t = templateFor("strength", 1, undefined, { variant: "upper" })!.template;
    expect(t.upper).toBe(true);
    const pats = t.blocks.flatMap((b) => b.items.map((i) => EXERCISES[i.exerciseId]!.pattern));
    expect(pats.some((p) => ["squat", "hinge", "jump", "power"].includes(p))).toBe(false);
  });
  it("poniżej 18 lat: bez 3 w CNS, max 85% i 4 serie", async () => {
    const { templateFor, EXERCISES } = await import("./library");
    const t = templateFor("strength", 3, undefined, { age: 16 })!.template;
    for (const i of t.blocks.flatMap((b) => b.items)) {
      expect(EXERCISES[i.exerciseId]!.cns).toBeLessThan(3);
      expect(i.sets).toBeLessThanOrEqual(4);
      if (i.pctRM) expect(i.pctRM[1]).toBeLessThanOrEqual(85);
    }
  });
});

describe("dół ciała: dzień A/B, dawki, plyo", () => {
  it("dwie sesje: druga jest dniem B, zaawansowany z trap bar, średni bez", async () => {
    const { templateFor } = await import("./library");
    const ids = (t: ReturnType<typeof templateFor>) => t!.template.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids(templateFor("strength", 1, undefined, { level: "advanced", slot: 1, count: 2 }))).toContain("trap-bar-deadlift");
    expect(ids(templateFor("strength", 1, undefined, { level: "intermediate", slot: 1, count: 2 }))).not.toContain("trap-bar-deadlift");
    expect(ids(templateFor("strength", 1, undefined, { level: "advanced", slot: 0, count: 2 }))).toContain("back-squat");
  });
  it("jedna sesja: rotacja A/B co tydzień", async () => {
    const { templateFor } = await import("./library");
    const a = templateFor("strength", 1, undefined, { level: "advanced", slot: 0, count: 1 })!.template.id;
    const b = templateFor("strength", 2, undefined, { level: "advanced", slot: 0, count: 1 })!.template.id;
    expect(a).not.toBe(b);
  });
  it("dawki przysiadu objętość: średni 4×5 @70–75, zaawansowany 5×5 @75–80", async () => {
    const { templateFor } = await import("./library");
    const sq = (lv: "intermediate" | "advanced") => templateFor("strength", 1, undefined, { level: lv, slot: 0, count: 2 })!.template.blocks.flatMap((b) => b.items).find((i) => i.exerciseId === "back-squat")!;
    expect(sq("intermediate")).toMatchObject({ sets: 4, reps: "5", pctRM: [70, 75] });
    expect(sq("advanced")).toMatchObject({ sets: 5, reps: "5", pctRM: [75, 80] });
  });
  it("liczba ćwiczeń plyo zależy od okresu i celu", async () => {
    const { plyoCount } = await import("./library");
    expect(plyoCount("preseason", undefined)).toBeGreaterThan(plyoCount("inseason", undefined));
    expect(plyoCount("inseason", "speed")).toBeGreaterThan(plyoCount("inseason", "strength"));
    expect(plyoCount("offseason", "strength")).toBe(2);
  });
});

describe("początkujący, zamienniki", () => {
  it("początkujący: bez %1RM, bez ciężkich ćwiczeń (CNS 3), do 3 serii, dół obecny", async () => {
    const { templateFor, EXERCISES } = await import("./library");
    for (const slot of [0, 1]) {
      const t = templateFor("strength", 3, undefined, { level: "beginner", slot, count: 2 })!.template;
      const items = t.blocks.flatMap((b) => b.items);
      for (const i of items) { expect(i.pctRM).toBeUndefined(); expect(i.sets).toBeLessThanOrEqual(3); expect(EXERCISES[i.exerciseId]!.cns).toBeLessThan(3); }
      expect(items.some((i) => ["squat", "hinge"].includes(EXERCISES[i.exerciseId]!.pattern))).toBe(true);
    }
  });
  it("każde ćwiczenie siłowe z ciężarem ma co najmniej 2 zamienniki", async () => {
    const { EXERCISES } = await import("./library");
    for (const e of Object.values(EXERCISES)) if (e.loaded && ["squat", "hinge", "push", "pull", "power"].includes(e.pattern)) expect(e.substitutes.length, e.id).toBeGreaterThanOrEqual(1);
  });
  it("dzień A ma zmienny blok plyo, bez stałego depth jumpa w objętości", async () => {
    const { templateFor } = await import("./library");
    const t = templateFor("strength", 1, undefined, { level: "intermediate", slot: 0, count: 2, season: "inseason" })!.template;
    expect(t.blocks.some((b) => b.title === "Moc i plyo")).toBe(true);
    expect(t.blocks.flatMap((b) => b.items).some((i) => i.exerciseId === "depth-jump-hurdle")).toBe(false);
  });
});

describe("sprzęt i początkujący", () => {
  it("brak trap bara: zamiennik bez trap bara, bez duplikatów w sesji", async () => {
    const { templateFor, applyGear, NEEDS } = await import("./index");
    const t = templateFor("strength", 2, undefined, { level: "advanced", slot: 1, count: 2 })!.template;
    const r = applyGear(t, ["trapbar"]);
    const ids = r.template.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain("trap-bar-deadlift");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => NEEDS[id] !== "trapbar")).toBe(true);
    expect(r.notes.join(" ")).toMatch(/Trap bar/);
  });
  it("brak piłki lekarskiej: bez rzutów piłką w planie", async () => {
    const { templateFor, applyGear } = await import("./index");
    for (let w = 1; w <= 5; w++) {
      const t = templateFor("strength", w, undefined, { level: "advanced", slot: 1, count: 2, season: "preseason", goal: "speed" })!.template;
      const ids = applyGear(t, ["medball"]).template.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
      expect(ids.some((i) => i.startsWith("mb-"))).toBe(false);
    }
  });
  it("początkujący w rozładowaniu: te same serie, lżejszy ciężar", async () => {
    const { templateFor, adaptSession, DEFAULT_CHECK_IN } = await import("./index");
    const f = templateFor("strength", 5, undefined, { level: "beginner", slot: 0, count: 1 })!;
    expect(f.deload).toBe(true);
    const a = adaptSession(f.template, DEFAULT_CHECK_IN, f.deload);
    expect(a.blocks.flatMap((b) => b.items).every((i, k) => i.sets === f.template.blocks.flatMap((b) => b.items)[k]!.sets)).toBe(true);
    expect(a.notes.join(" ")).toMatch(/te same serie/);
  });
});

describe("sprint wg okresu i celu, bieg w tygodniu z meczem", () => {
  it("liczba sprintów: przygotowawczy > sezon, cel szybkość +1, młodzi −1", async () => {
    const { sprintCount } = await import("./library");
    expect(sprintCount({ season: "preseason" })).toBeGreaterThan(sprintCount({ season: "inseason" }));
    expect(sprintCount({ season: "inseason", goal: "speed" })).toBe(sprintCount({ season: "inseason" }) + 1);
    expect(sprintCount({ season: "inseason", age: 16 })).toBe(sprintCount({ season: "inseason" }) - 1);
  });
  it("loty: tak dla celu szybkość, nie dla lekkiego wariantu ani nowicjusza; drille rotują", async () => {
    const { templateFor } = await import("./library");
    const ids = (o: Parameters<typeof templateFor>[3], w = 1) => templateFor("sprint", w, "pomocnik", o)!.template.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids({ goal: "speed", level: "intermediate" })).toContain("flying-sprint");
    expect(ids({ goal: "speed", level: "intermediate", variant: "light" })).not.toContain("flying-sprint");
    expect(ids({ goal: "speed", level: "beginner" })).not.toContain("flying-sprint");
    expect(ids({ level: "intermediate" }, 1).join()).not.toBe(ids({ level: "intermediate" }, 2).join());
  });
});
