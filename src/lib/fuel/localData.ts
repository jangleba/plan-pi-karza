/** Lokalne dane Fuel Check, których nie ma w onboardingu (masa, płyny, żołądek). */

import { useCallback, useEffect, useState } from "react";
import type { MealSize, Sex } from "./types";

export interface FuelLocalData {
  sex: Sex | null;
  bodyMassKg: number | null;
  heightCm: number | null;
  startClock: string | null;
  mealSize: MealSize | null;
  plannedCarbsG: number | null;
  fatFiberHeavy: boolean | null;
  caffeine: boolean;
  fluidTodayMl: number | null;
  lastMealMinutesAgo: number | null;
  gutIssues: boolean | null;
  restrictions: string[];
}

export const EMPTY_FUEL_DATA: FuelLocalData = {
  sex: null,
  bodyMassKg: null,
  heightCm: null,
  startClock: null,
  mealSize: null,
  plannedCarbsG: null,
  fatFiberHeavy: null,
  caffeine: false,
  fluidTodayMl: null,
  lastMealMinutesAgo: null,
  gutIssues: null,
  restrictions: [],
};

const KEY = "loadwise.fuelcheck.v1";

export function useFuelLocalData() {
  const [data, setData] = useState<FuelLocalData>(EMPTY_FUEL_DATA);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData({ ...EMPTY_FUEL_DATA, ...(JSON.parse(raw) as FuelLocalData) });
    } catch {
      /* brak danych lokalnych */
    }
  }, []);

  const update = useCallback((patch: Partial<FuelLocalData>) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* pamięć niedostępna */
      }
      return next;
    });
  }, []);

  return { data, update };
}
