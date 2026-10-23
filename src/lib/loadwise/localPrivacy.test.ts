import { describe, expect, it } from "vitest";
import type { Profile } from "./types";
import {
  clearLocalUserData,
  clearLocalSessionData,
  profileWithoutFuelPrecision,
  profileWithoutHealthData,
} from "./localPrivacy";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const profile = {
  healthPersonalizationEnabled: true,
  painInjury: true,
  painLocations: ["knee"],
  injuryHistory: ["hamstring"],
  fuelAllergyStatus: "has_allergies",
  foodAllergies: ["orzechy"],
  foodIntolerances: ["laktoza"],
  fuelPrecisionEnabled: true,
  weightKg: 72,
} as Profile;

describe("local privacy", () => {
  it("clears all user caches and legacy unscoped progress", () => {
    const storage = new MemoryStorage();
    storage.setItem("loadwise:v3:u1", "private");
    storage.setItem("loadwise:boot:v2:u1", "private");
    storage.setItem("loadwise:training-queue:v1:u1", "private");
    storage.setItem("ballwise:reactive:v1:u1", "private");
    storage.setItem("ballwise:fuel:v3:u1", "private");
    storage.setItem("ballwise:fuel-reminders:v1:u1", "private");
    storage.setItem("ballwise:fuel:v3:u2", "keep");
    storage.setItem("ballwise:fuel-protocol:u1:session", "private");
    storage.setItem("loadwise:sprint-progress:u1:session", "private");
    storage.setItem("ballwise:fuel-protocol:legacy-session", "legacy");
    storage.setItem("loadwise:sprint-progress:legacy-session", "legacy");
    storage.setItem("loadwise:v3:u2", "keep");
    storage.setItem("ballwise:fuel-protocol:123e4567-e89b-42d3-a456-426614174000:session", "keep");

    clearLocalUserData("u1", storage);

    expect(storage.getItem("loadwise:v3:u1")).toBeNull();
    expect(storage.getItem("loadwise:boot:v2:u1")).toBeNull();
    expect(storage.getItem("loadwise:training-queue:v1:u1")).toBeNull();
    expect(storage.getItem("ballwise:reactive:v1:u1")).toBeNull();
    expect(storage.getItem("ballwise:fuel:v3:u1")).toBeNull();
    expect(storage.getItem("ballwise:fuel-reminders:v1:u1")).toBeNull();
    expect(storage.getItem("ballwise:fuel:v3:u2")).toBe("keep");
    expect(storage.getItem("ballwise:fuel-protocol:u1:session")).toBeNull();
    expect(storage.getItem("loadwise:sprint-progress:u1:session")).toBeNull();
    expect(storage.getItem("ballwise:fuel-protocol:legacy-session")).toBeNull();
    expect(storage.getItem("loadwise:sprint-progress:legacy-session")).toBeNull();
    expect(storage.getItem("loadwise:v3:u2")).toBe("keep");
    expect(
      storage.getItem("ballwise:fuel-protocol:123e4567-e89b-42d3-a456-426614174000:session"),
    ).toBe("keep");
  });

  it("retains unsent writes and local-only history at logout, then wipes them for deletion", () => {
    const storage = new MemoryStorage();
    storage.setItem("loadwise:boot:v2:u1", "cache");
    storage.setItem("loadwise:training-queue:v1:u1", "unsent");
    storage.setItem("ballwise.browser-lab.v1:u1", "measurements");
    clearLocalSessionData("u1", storage);
    expect(storage.getItem("loadwise:boot:v2:u1")).toBeNull();
    expect(storage.getItem("loadwise:training-queue:v1:u1")).toBe("unsent");
    expect(storage.getItem("ballwise.browser-lab.v1:u1")).toBe("measurements");
    clearLocalUserData("u1", storage);
    expect(storage.length).toBe(0);
  });

  it("removes health fields and body mass without changing unrelated profile data", () => {
    const noHealth = profileWithoutHealthData(profile);
    const noFuelPrecision = profileWithoutFuelPrecision(profile);

    expect(noHealth.healthPersonalizationEnabled).toBe(false);
    expect(noHealth.painInjury).toBe(false);
    expect(noHealth.painLocations).toEqual([]);
    expect(noHealth.injuryHistory).toEqual([]);
    expect(noHealth.fuelAllergyStatus).toBe("unconfirmed");
    expect(noHealth.foodAllergies).toEqual([]);
    expect(noHealth.foodIntolerances).toEqual([]);
    expect(noHealth.fuelPrecisionEnabled).toBe(true);
    expect(noFuelPrecision.fuelPrecisionEnabled).toBe(false);
    expect(noFuelPrecision.weightKg).toBeNull();
    expect(noFuelPrecision.healthPersonalizationEnabled).toBe(true);
  });
  it("clears only the deleted account's offline identity and active pointer", () => {
    const storage = new MemoryStorage();
    storage.setItem("ballwise:offline-owner:v1:u1", "owner-one");
    storage.setItem("ballwise:offline-owner:active", "u2");
    clearLocalUserData("u1", storage);
    expect(storage.getItem("ballwise:offline-owner:v1:u1")).toBeNull();
    expect(storage.getItem("ballwise:offline-owner:active")).toBe("u2");
    clearLocalUserData("u2", storage);
    expect(storage.getItem("ballwise:offline-owner:active")).toBeNull();
  });
});
