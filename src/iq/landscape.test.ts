import { describe, expect, it } from "vitest";
import { needsRotation, overlayStyle, toLocal, toLocalDelta } from "./landscape";

describe("widok poziomy", () => {
  it("obrót tylko, gdy ekran jest w pionie", () => {
    expect(needsRotation(390, 844)).toBe(true);
    expect(needsRotation(844, 390)).toBe(false);
  });

  it("bez obrotu: punkt względem lewego górnego rogu", () => {
    expect(toLocal(false, { left: 10, top: 20, width: 300, height: 200 }, 110, 70)).toEqual({ x: 100, y: 50 });
    expect(toLocalDelta(false, 3, -4)).toEqual({ x: 3, y: -4 });
  });

  it("z obrotem o 90° w prawo: oś x elementu biegnie w dół ekranu, oś y w lewo", () => {
    // element lokalnie 844 × 390, na ekranie zajmuje prostokąt 390 szerokości × 844 wysokości
    const rect = { left: 0, top: 0, width: 390, height: 844 };
    // lewy górny róg elementu leży w prawym górnym rogu ekranu
    expect(toLocal(true, rect, 390, 0)).toEqual({ x: 0, y: 0 });
    // lewy dolny róg elementu (lokalnie 0, 390) leży w lewym górnym rogu ekranu
    expect(toLocal(true, rect, 0, 0)).toEqual({ x: 0, y: 390 });
    // prawy górny róg elementu (lokalnie 844, 0) leży w prawym dolnym rogu ekranu
    expect(toLocal(true, rect, 390, 844)).toEqual({ x: 844, y: 0 });
    // palec w dół ekranu = w prawo w widoku poziomym; palec w lewo = w dół w widoku poziomym
    expect(toLocalDelta(true, 0, 10)).toEqual({ x: 10, y: -0 });
    expect(toLocalDelta(true, -10, 0)).toEqual({ x: 0, y: 10 });
  });

  it("nakładka: w pionie ma zamienione wymiary i obrót", () => {
    expect(overlayStyle(false, 844, 390)).toMatchObject({ width: 844, height: 390 });
    const s = overlayStyle(true, 390, 844);
    expect(s).toMatchObject({ width: 844, height: 390, transform: "translateX(390px) rotate(90deg)" });
  });
});
