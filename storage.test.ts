import { describe, expect, it } from "vitest";
import { loadReactiveCustomSets, saveReactiveCustomSets } from "./storage";

describe("reactive custom sets storage", () => {
  it("zapisuje i odtwarza własne zestawy na urządzeniu", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
    const sets = [{
      id: "set-1",
      name: "Mój drybling",
      createdAt: "2026-09-06T10:00:00Z",
      actions: [{ id: "a-1", label: "Zwrot", direction: "left" as const, color: "blue" as const }],
    }];
    saveReactiveCustomSets("test", sets, storage);
    expect(loadReactiveCustomSets("test", storage)).toEqual(sets);
  });
});

