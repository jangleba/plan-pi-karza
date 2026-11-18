import { describe, expect, it } from "vitest";
import { estimate1RM, firstNumber, suggestNext } from "./progress";

describe("progresja siły", () => {
  it("1RM wg Epleya", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
  });
  it("pierwsza liczba z tekstu powtórzeń", () => {
    expect(firstNumber("5 / nogę")).toBe(5);
    expect(firstNumber("LL-RR")).toBe(1);
  });
  it("dobra sesja: sugestia dodania, dolne partie +2,5%", () => {
    const s = suggestNext("back-squat", 100, "none", false)!;
    expect(s.to).toBe(102.5);
  });
  it("góra: +1,25 kg", () => {
    expect(suggestNext("bench-press", 80, "none", false)!.to).toBe(81.25);
  });
  it("gorszy check-in lub rozładowanie: bez dodawania", () => {
    expect(suggestNext("back-squat", 100, "light", false)!.to).toBe(100);
    expect(suggestNext("back-squat", 100, "none", true)!.to).toBe(100);
  });
  it("ćwiczenie bez ciężaru: brak sugestii", () => {
    expect(suggestNext("box-jump", 20, "none", false)).toBeNull();
  });
});
