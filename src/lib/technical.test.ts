import { beforeEach, describe, expect, it, vi } from "vitest";
import { scoped, setScope } from "./store";
import { loadTechnicalResults, loadTechnicalSettings, recordTechnicalResult, saveTechnicalSettings } from "./technical";
import type { TechnicalResult } from "../engine/technical/types";

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
const result: TechnicalResult = { v: 1, sessionId: "s", familyId: "wing-wall-finish", progressionKey: "wing-wall-finish|rebounder|right|left|0", date: "2026-11-22", stage: 0, attempts: 12, successes: 10, plannedAttempts: 12, difficulty: "right" };
beforeEach(() => { mem.clear(); vi.stubGlobal("localStorage", storage); setScope({ kind: "guest" }); });
describe("lokalny zapis techniki", () => {
  it("wynik jest jawny i poprawiany, nie dublowany; przyszła data nie zostaje zaliczona", () => {
    expect(loadTechnicalResults()).toEqual([]);
    expect(recordTechnicalResult(result, "2026-11-22")).toBe(true);
    expect(recordTechnicalResult({ ...result, successes: 11 }, "2026-11-22")).toBe(true);
    expect(loadTechnicalResults()).toHaveLength(1); expect(loadTechnicalResults()[0]!.successes).toBe(11);
    expect(recordTechnicalResult({ ...result, date: "2026-11-23" }, "2026-11-22")).toBe(false);
  });
  it("zmiana konta nie ujawnia wyników ani ustawień innej osoby", () => {
    setScope({ kind: "user", id: "a" });
    const settings = { ...loadTechnicalSettings(), foot: "left" as const };
    expect(saveTechnicalSettings(settings)).toBe(true); recordTechnicalResult(result, "2026-11-22");
    setScope({ kind: "user", id: "b" });
    expect(loadTechnicalSettings().foot).toBe("unknown"); expect(loadTechnicalResults()).toEqual([]);
    setScope({ kind: "user", id: "a" });
    expect(loadTechnicalResults()).toHaveLength(1); expect(loadTechnicalSettings().foot).toBe("left");
  });
  it("uszkodzony zapis nie zalicza nieprawidłowych wyników", () => {
    scoped.setItem("technicalResults:v2", JSON.stringify([result, { ...result, attempts: NaN }, { ...result, successes: 99 }]));
    expect(loadTechnicalResults()).toEqual([result]);
    scoped.setItem("technicalSettings:v2", "broken"); expect(loadTechnicalSettings().level).toBe("beginner");
  });
  it("odmowa zapisu nie jest pokazywana jako sukces", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    expect(recordTechnicalResult(result, "2026-11-22")).toBe(false);
    expect(saveTechnicalSettings(loadTechnicalSettings())).toBe(false);
  });
});
