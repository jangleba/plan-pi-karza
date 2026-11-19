import { describe, expect, it } from "vitest";
import { ANIMS } from "../exercises/anims";
import { BENCH_DEFAULTS, BENCH_DEFAULT_WORD, BENCH_ETAS, BENCH_QUESTIONS, benchPlan, benchRoutine } from "./bench";
import type { Position } from "./profile";

const POS = Object.keys(BENCH_QUESTIONS) as Position[];

describe("tryb ławki – pytania", () => {
  it("każda pozycja ma 3 pytania po 2–3 odpowiedzi, a identyfikatory są unikalne", () => {
    expect(POS.sort()).toEqual(["bramkarz", "napastnik", "obronca", "pomocnik", "skrzydlowy"]);
    const ids: string[] = [];
    for (const p of POS) {
      expect(BENCH_QUESTIONS[p]).toHaveLength(3);
      for (const q of BENCH_QUESTIONS[p]) {
        ids.push(q.id);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.options.length).toBeLessThanOrEqual(3);
        expect(new Set(q.options.map((x) => x.id)).size).toBe(q.options.length);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("treść jest krótka (mało tekstu na ławce): pytanie ≤ 40, odpowiedź ≤ 22, hasło ≤ 16, wskazówka ≤ 110 znaków", () => {
    for (const p of POS) for (const q of BENCH_QUESTIONS[p]) {
      expect(q.ask.length, q.ask).toBeLessThanOrEqual(40);
      for (const x of q.options) {
        expect(x.label.length, x.label).toBeLessThanOrEqual(22);
        expect(x.word.length, x.word).toBeLessThanOrEqual(16);
        expect(x.tip.length, x.tip).toBeLessThanOrEqual(110);
        expect(x.tip.endsWith(".")).toBe(true);
      }
    }
    for (const d of BENCH_DEFAULTS) expect(d.length).toBeLessThanOrEqual(110);
  });
});

describe("tryb ławki – plan na pierwsze minuty", () => {
  it("bez odpowiedzi: trzy zdania domyślne i domyślne hasło", () => {
    const p = benchPlan("pomocnik", {});
    expect(p.lines).toEqual(BENCH_DEFAULTS);
    expect(p.word).toBe(BENCH_DEFAULT_WORD);
    expect([p.answered, p.total]).toEqual([0, 3]);
  });

  it("odpowiedzi idą w kolejności pytań, hasło z pierwszej, resztę dopełniają zdania domyślne", () => {
    const p = benchPlan("pomocnik", { "pom-space": "behind", "pom-press": "high" });
    expect(p.answered).toBe(2);
    expect(p.word).toBe("Szybko"); // pierwsze pytanie (pressing), nie kolejność dotknięć
    expect(p.lines).toHaveLength(3);
    expect(p.lines[0]).toContain("Pierwszy kontakt");
    expect(p.lines[1]).toContain("za linię obrony");
    expect(p.lines[2]).toBe(BENCH_DEFAULTS[0]);
  });

  it("komplet odpowiedzi daje trzy zdania z wyborów i żadnego domyślnego", () => {
    const answers = { "nap-cb": "low", "nap-gk": "far", "nap-build": "long" };
    const p = benchPlan("napastnik", answers);
    expect(p.answered).toBe(3);
    expect(p.lines.some((l) => BENCH_DEFAULTS.includes(l))).toBe(false);
    expect(p.word).toBe("Schodź");
  });

  it("nieznane odpowiedzi i odpowiedzi z innej pozycji są ignorowane", () => {
    expect(benchPlan("obronca", { "pom-press": "high", "obr-threat": "nie-ma" }).answered).toBe(0);
    expect(benchPlan("obronca", { "pom-press": "high", "obr-threat": "fast" }).answered).toBe(1);
  });
});

describe("tryb ławki – aktywacja", () => {
  it("im mniej czasu, tym krótsza aktywacja; każda ma kroki z poprawnymi animacjami", () => {
    const r = BENCH_ETAS.map(([eta]) => benchRoutine(eta));
    for (let i = 1; i < r.length; i++) expect(r[i]!.seconds).toBeLessThan(r[i - 1]!.seconds);
    for (const x of r) {
      expect(x.steps.length).toBeGreaterThan(1);
      const ids = x.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(x.seconds).toBe(x.steps.reduce((a, s) => a + s.seconds, 0));
      for (const s of x.steps) {
        expect(s.seconds).toBeGreaterThan(0);
        if (s.anim) expect(s.anim in ANIMS, s.anim).toBe(true);
      }
    }
    expect(r[0]!.minutes).toBeLessThanOrEqual(6);
    expect(r[3]!.seconds).toBeLessThanOrEqual(45);
  });

  it("lekka: bez ćwiczeń w leżeniu i bez przyspieszeń powyżej 75%", () => {
    for (const [eta] of BENCH_ETAS) {
      const steps = benchRoutine(eta).steps;
      expect(steps.some((s) => ["bridge", "bridge-sl", "sideplank", "bench", "pushup"].includes(s.anim ?? ""))).toBe(false);
      expect(steps.some((s) => /(8\d|9\d|100)%/.test(s.title))).toBe(false);
    }
  });

  it("ćwiczenia jednostronne występują parami: lewa, potem prawa", () => {
    const steps = benchRoutine(15).steps;
    steps.forEach((s, i) => { if (s.side === "L") expect(steps[i + 1]).toMatchObject({ side: "P", title: s.title }); });
    expect(steps.some((s) => s.side)).toBe(true);
  });
});
