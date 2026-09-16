import { describe, expect, it } from "vitest";
import type { FuelTargetRange, MealRecommendation } from "./recommendations";
import {
  adaptFuelProtocolForMessage,
  buildFuelProtocol,
  completeFuelProtocolItem,
  fuelProtocolProgress,
  parseTrainingLeadMinutes,
} from "./protocol";
import type { FuelSessionInput } from "./types";

const session: FuelSessionInput = {
  kind: "speed",
  intensity: "wysoka",
  durationMin: 70,
  minutesToStart: null,
  title: "Szybkość",
  subtitle: null,
  date: "2026-09-16",
  startClock: null,
  dayLabel: "Dzisiaj",
};

const meal: MealRecommendation = {
  id: "test-meal",
  title: "Ryż jaśminowy, kurczak i mango",
  subtitle: "Lekki bowl",
  text: "ryż, kurczak, mango, woda",
  portion: "normalna",
  prepMinutes: 10,
  moment: "regular",
  minLeadMinutes: 60,
  maxLeadMinutes: 240,
  sessionKinds: ["speed"],
  highlight: "lekko",
  icon: "bowl",
};

const target: FuelTargetRange = {
  carbMinG: 45,
  carbMaxG: 75,
  fluidMinMl: 350,
  fluidMaxMl: 600,
  precise: false,
  label: "Bez danych o masie · zakres ogólny",
};

describe("Adaptive Fuel Protocol", () => {
  it("builds four useful stages from the real session and target", () => {
    const protocol = buildFuelProtocol({ session, minutes: 90, recommendation: meal, target });
    expect(protocol.items.map((item) => item.id)).toEqual(["now", "pre", "session", "recovery"]);
    expect(protocol.items[0].detail).toContain("45–75 g");
    expect(protocol.items[2].timeLabel).toBe("70 min");
  });

  it("adjusts only the missing pre-session step after a partial meal", () => {
    const protocol = buildFuelProtocol({ session, minutes: 90, recommendation: meal, target });
    const adapted = adaptFuelProtocolForMessage(protocol, "Zjadłem tylko połowę", target);
    expect(adapted.items[1].status).toBe("adjusted");
    expect(adapted.items[1].title).toContain("brakującą");
    expect(adapted.items[0]).toEqual({ ...protocol.items[0], status: "done" });
    expect(adapted.items[2]).toEqual(protocol.items[2]);
  });

  it("tracks completion and activates the next checkpoint", () => {
    const protocol = buildFuelProtocol({ session, minutes: 90, recommendation: meal, target });
    const updated = completeFuelProtocolItem(protocol, "now");
    expect(fuelProtocolProgress(updated)).toEqual({ done: 1, total: 4 });
    expect(updated.items[1].status).toBe("active");
  });

  it("understands explicit changes to the start time", () => {
    expect(parseTrainingLeadMinutes("Trening za 2 godziny")).toBe(120);
    expect(parseTrainingLeadMinutes("start za 45 minut")).toBe(45);
    expect(parseTrainingLeadMinutes("jestem głodny")).toBeNull();
  });
});
