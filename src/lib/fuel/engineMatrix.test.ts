import { describe, expect, it } from "vitest";
import { evaluateMeal } from "./engine";
import { parseMeal } from "./mealParser";
import type {
  FuelRequest,
  Portion,
  SessionIntensity,
  SessionKind,
  TimeBucket,
} from "./types";

const kinds: SessionKind[] = [
  "match",
  "strength",
  "speed",
  "endurance",
  "football",
  "recovery",
  "none",
];
const intensities: SessionIntensity[] = ["niska", "umiarkowana", "wysoka"];
const portions: Portion[] = ["mala", "normalna", "duza"];
const buckets: TimeBucket[] = ["lt30", "30_60", "60_120", "120_240", "gt240"];

describe("FuelWise — pełna macierz wejść silnika", () => {
  it("obsługuje każdy typ jednostki, intensywność, porcję, czas i tryb dostępności", () => {
    for (const kind of kinds) {
      for (const intensity of intensities) {
        for (const portion of portions) {
          for (const timeBucket of buckets) {
            for (const onlyThis of [false, true]) {
              const request: FuelRequest = {
                session: {
                  kind,
                  intensity,
                  durationMin: 75,
                  minutesToStart: null,
                  title: "Test macierzy",
                  subtitle: null,
                  date: "2026-09-14",
                  startClock: null,
                  dayLabel: "Dzisiaj",
                },
                athlete: {
                  age: 17,
                  position: "midfielder",
                  level: "intermediate",
                  goal: "general",
                  restrictions: [],
                },
                meal: parseMeal("ryż z kurczakiem, warzywami i wodą"),
                portion,
                timeBucket,
                onlyThis,
              };

              const first = evaluateMeal(request);
              const second = evaluateMeal(request);
              expect(second).toEqual(first);

              if (kind === "none") {
                expect(first).toBeNull();
              } else {
                expect(first).not.toBeNull();
                expect(["PASUJE", "POPRAW", "ZOSTAW_NA_POZNIEJ"]).toContain(
                  first?.verdict,
                );
                expect(first?.minutesToStart).toBeGreaterThanOrEqual(0);
                expect(first?.requiredLeadMinutes).toBeGreaterThanOrEqual(0);
                expect(
                  first?.why
                    .replace(/ok\./g, "ok")
                    .split(/[.!?](?:\s|$)/)
                    .filter(Boolean).length,
                ).toBeLessThanOrEqual(2);
                expect(onlyThis ? first?.onlyThis : null).toEqual(first?.onlyThis);
              }
            }
          }
        }
      }
    }
  });
});
