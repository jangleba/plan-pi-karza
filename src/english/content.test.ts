import { describe, expect, it } from "vitest";
import { LESSONS, PHRASES, PHRASE_BY_ID } from "./content";
import { LESSONS_META, TOTAL_PHRASES } from "./meta";
import { normalizeText } from "./match";

describe("treści: integralność bazy", () => {
  it("spis lekcji w meta zgadza się z pełnymi treściami (id, kolejność, poziom, liczba zwrotów)", () => {
    expect(LESSONS.map(({ phrases: _p, ...m }) => m)).toEqual(LESSONS_META);
    for (const l of LESSONS) expect(l.phrases.length, l.id).toBe(l.count);
    expect(PHRASES.length).toBe(TOTAL_PHRASES);
  });
  it("co najmniej 12 lekcji i 72 zwroty, wszystkie wymagane tematy", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(12);
    expect(PHRASES.length).toBeGreaterThanOrEqual(72);
    const need = ["partners", "coach", "roles", "pressing", "build-up", "movement", "training", "intro", "trials", "expectations", "my-role", "application"];
    for (const id of need) expect(LESSONS.some((l) => l.id === id), id).toBe(true);
  });
  it("stałe identyfikatory: unikalne, zgodne z formatem akceptowanym w bazie, powiązane z lekcją", () => {
    const ids = PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PHRASES) {
      expect(p.id, p.id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(p.id.startsWith(`${p.lesson}-`), p.id).toBe(true);
      expect(PHRASE_BY_ID[p.id]).toBe(p);
    }
    for (const l of LESSONS) expect(l.id).toMatch(/^[a-z0-9-]{1,40}$/);
  });
  it("każdy zwrot ma poziom, tłumaczenie, kontekst i rolę; poziom zwrotu = poziom lekcji", () => {
    for (const p of PHRASES) {
      expect([1, 2, 3]).toContain(p.level);
      expect(p.level, p.id).toBe(LESSONS.find((l) => l.id === p.lesson)!.level);
      expect(["field", "gk", "both"]).toContain(p.role);
      expect(p.en.trim().length, p.id).toBeGreaterThanOrEqual(4);
      for (const f of [p.pl, p.context]) expect(f.trim().length, p.id).toBeGreaterThan(5);
    }
  });
  it("zawartość dla bramkarzy i zawodników z pola; wszystkie poziomy reprezentowane", () => {
    expect(PHRASES.filter((p) => p.role === "gk").length).toBeGreaterThanOrEqual(6);
    expect(PHRASES.filter((p) => p.role === "field").length).toBeGreaterThanOrEqual(6);
    expect(new Set(PHRASES.map((p) => p.level))).toEqual(new Set([1, 2, 3]));
    expect(new Set(PHRASES.filter((p) => p.role === "gk").map((p) => p.lesson)).size).toBeGreaterThanOrEqual(6); // bramkarze w wielu tematach
  });
  it("zwroty angielskie są unikalne, bez adresów i odnośników", () => {
    const en = PHRASES.map((p) => normalizeText(p.en));
    expect(new Set(en).size).toBe(en.length);
    for (const p of PHRASES) expect(JSON.stringify(p), p.id).not.toMatch(/https?:|@|www\./i);
  });
});

describe("treści: poprawność ćwiczeń", () => {
  it("pytanie sprawdzające: dokładnie trzy różne opcje, poprawna nie powtarza się wśród błędnych, jest wyjaśnienie", () => {
    for (const p of PHRASES) {
      const opts = [p.check.correct, ...p.check.wrong];
      expect(new Set(opts.map(normalizeText)).size, p.id).toBe(3);
      expect(p.check.q.trim().length, p.id).toBeGreaterThan(20);
      expect(p.check.why.trim().length, p.id).toBeGreaterThan(20);
    }
  });
  it("układanka: każde akceptowane ułożenie składa się wyłącznie z dostępnych słów (z krotnością), a słów jest więcej niż w najkrótszej odpowiedzi", () => {
    for (const p of PHRASES) {
      const bank = new Map<string, number>();
      for (const w of p.build.pieces) bank.set(w, (bank.get(w) ?? 0) + 1);
      expect(p.build.answers.length, p.id).toBeGreaterThan(0);
      for (const a of p.build.answers) {
        const need = new Map<string, number>();
        for (const w of a) need.set(w, (need.get(w) ?? 0) + 1);
        for (const [w, n] of need) expect(bank.get(w) ?? 0, `${p.id}: „${w}”`).toBeGreaterThanOrEqual(n);
      }
      const shortest = Math.min(...p.build.answers.map((a) => a.length));
      expect(p.build.pieces.length, p.id).toBeGreaterThan(shortest);
      expect(new Set(p.build.answers.map((a) => normalizeText(a.join(" "))), ).size, p.id).toBe(p.build.answers.length); // bez duplikatów
      expect(p.build.why.trim().length, p.id).toBeGreaterThan(10);
    }
  });
});
