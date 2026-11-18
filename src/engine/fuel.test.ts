import { describe, expect, it } from "vitest";
import { adviceAround, dailyTargets, hoursUntil } from "./fuel";

describe("Fuel", () => {
  it("mecz za 4 h: posiłek 1–3 g/kg węglowodanów (UEFA), przy 70 kg 70–210 g", () => {
    const t = adviceAround(4, "match", 70);
    expect(t[0]!.amount).toBe("70–210 g węglowodanów");
    expect(t[0]!.uefa).toBe(true);
    expect(t[1]!.amount).toContain("350–490");
  });
  it("sesja za 4 h: te same ilości, ale bez oznaczenia UEFA", () => {
    expect(adviceAround(4, "session", 70)[0]!.uefa).toBe(false);
  });
  it("za 2 h: lekka przekąska; za 30 min: tylko płyny", () => {
    expect(adviceAround(2, "match", 70)[0]!.title).toBe("Lekka przekąska");
    expect(adviceAround(0.5, "match", 70)[0]!.title).toBe("Teraz tylko płyny");
  });
  it("po meczu (2 h temu): ok. 1 g/kg/h węglowodanów", () => {
    const t = adviceAround(-2, "match", 70);
    expect(t[0]!.amount).toBe("70 g węglowodanów na godzinę");
    expect(t[0]!.uefa).toBe(true);
  });
  it("cele dzienne: dzień meczu 6–8 g/kg, białko 1,6–2,2 g/kg", () => {
    const d = dailyTargets(70, "match", "maintain");
    expect(d.carbG).toEqual([420, 560]);
    expect(d.proteinG).toEqual([112, 140]);
    expect(dailyTargets(70, "match", "gain").proteinG[1]).toBe(154);
  });
  it("godziny do aktywności", () => {
    const now = new Date(2026, 10, 18, 14, 0, 0);
    expect(hoursUntil("18:00", now)).toBeCloseTo(4, 5);
    expect(hoursUntil("12:30", now)).toBeCloseTo(-1.5, 5);
  });
});
