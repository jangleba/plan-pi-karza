import { describe, expect, it } from "vitest";
import { INTERVALS, addDays, applyAnswer, isDue, isMastered, type PhraseProgress } from "./srs";

const D0 = "2026-11-19";
let now = 1_000;
const ans = (p: PhraseProgress | undefined, ok: boolean, day: string) => applyAnswer(p, ok, day, ++now);

describe("harmonogram powtórek: 1, 3, 7, 14 i 30 dni", () => {
  it("kolejne poprawne odpowiedzi w terminie dają odstępy 1, 3, 7, 14, 30 dni; potem 30 dni bez końca", () => {
    let p = ans(undefined, true, D0);
    expect([p.stage, p.due]).toEqual([1, addDays(D0, 1)]);
    let day = D0;
    for (const [i, gap] of INTERVALS.slice(1).entries()) {
      day = p.due; // odpowiadamy dokładnie w terminie
      p = ans(p, true, day);
      expect([p.stage, p.due], `etap ${i + 2}`).toEqual([i + 2, addDays(day, gap)]);
    }
    day = p.due;
    p = ans(p, true, day);
    expect([p.stage, p.due]).toEqual([5, addDays(day, 30)]); // etap 5 nie rośnie, odstęp zostaje 30 dni
  });
  it("błąd cofa zwrot do etapu 0 i ustawia powtórkę na następny dzień", () => {
    let p = ans(undefined, true, D0);
    p = ans(p, true, p.due);
    expect(p.stage).toBe(2);
    const day = p.due;
    p = ans(p, false, day);
    expect([p.stage, p.due, p.dayOk]).toEqual([0, addDays(day, 1), false]);
    expect(p.wrong).toBe(1);
    expect(isDue(p, day)).toBe(false);
    expect(isDue(p, addDays(day, 1))).toBe(true);
  });
  it("po błędzie kolejna poprawna odpowiedź następnego dnia zaczyna ścieżkę od nowa (1 dzień)", () => {
    let p = ans(undefined, false, D0);
    expect([p.stage, p.due]).toEqual([0, addDays(D0, 1)]);
    p = ans(p, true, addDays(D0, 1));
    expect([p.stage, p.due]).toEqual([1, addDays(D0, 2)]);
  });
  it("wielokrotne odpowiedzi tego samego dnia nie przesuwają zwrotu przez kolejne etapy", () => {
    let p: PhraseProgress | undefined;
    for (let i = 0; i < 10; i++) p = ans(p, true, D0);
    expect([p!.stage, p!.due]).toEqual([1, addDays(D0, 1)]);
    expect(p!.seen).toBe(10);
    expect(p!.correct).toBe(10);
  });
  it("błąd po poprawnej odpowiedzi tego samego dnia unieważnia postęp; kolejna poprawna tego dnia go nie przywraca", () => {
    let p = ans(undefined, true, D0);
    expect(p.stage).toBe(1);
    p = ans(p, false, D0);
    expect([p.stage, p.due]).toEqual([0, addDays(D0, 1)]);
    p = ans(p, true, D0);
    p = ans(p, true, D0);
    expect([p.stage, p.due]).toEqual([0, addDays(D0, 1)]);
  });
  it("najpierw błąd, potem poprawna odpowiedź tego samego dnia: bez postępu (powtórka jutro)", () => {
    let p = ans(undefined, false, D0);
    p = ans(p, true, D0);
    expect([p.stage, p.due]).toEqual([0, addDays(D0, 1)]);
  });
  it("odpowiedź przed terminem tylko zlicza próbę i nie przyspiesza harmonogramu; błąd przed terminem cofa zwrot", () => {
    let p = ans(undefined, true, D0); // etap 1, termin D0+1
    p = ans(p, true, D0); p = ans(p, true, D0);
    const early = ans({ ...p, due: addDays(D0, 10), lastDay: D0 }, true, addDays(D0, 2));
    expect([early.stage, early.due]).toEqual([p.stage, addDays(D0, 10)]);
    const lapse = ans({ ...p, due: addDays(D0, 10), lastDay: D0 }, false, addDays(D0, 2));
    expect([lapse.stage, lapse.due]).toEqual([0, addDays(D0, 3)]);
  });
  it("zmiana dnia: ten sam zwrot odpowiedziany następnego dnia po terminie przesuwa się o jeden etap, a odstęp liczony jest od dnia odpowiedzi", () => {
    let p = ans(undefined, true, D0); // etap 1, termin D0+1
    p = ans(p, true, addDays(D0, 5)); // spóźniona powtórka
    expect([p.stage, p.due]).toEqual([2, addDays(D0, 8)]); // 5 + 3
  });
  it("utrwalony = etap ≥ 3", () => {
    let p = ans(undefined, true, D0);
    expect(isMastered(p)).toBe(false);
    p = ans(p, true, p.due); expect(isMastered(p)).toBe(false);
    p = ans(p, true, p.due); expect(isMastered(p)).toBe(true);
  });
  it("addDays: przełom miesiąca i roku, bez wpływu stref czasowych", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-28", 3)).toBe("2026-03-31");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // zmiana czasu w Polsce
  });
});
