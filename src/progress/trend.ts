import type { TrendTone } from "../engine";

/** Kolory trendu (ustalone z użytkownikiem): zielony – postęp, pomarańczowy – lekki spadek, czerwony – regres, szary – bez zmian. */
export const TREND_HEX: Record<TrendTone, string> = {
  green: "#3f9a6b",
  orange: "#d08a3c",
  red: "#c0504d",
  neutral: "#8a99ad",
};
