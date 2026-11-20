import type { Position, Season, SeasonGoal } from "../engine";
import type { FeelNow } from "../engine";

/** Kolor przewodni każdego kroku (c – mocny, s – jasne tło, i – ciemny tekst na jasnym tle). Krok 0 to ekran powitalny. */
export interface Tone { c: string; s: string; i: string }
export const STEP_TONES: Tone[] = [
  { c: "#2f6fb3", s: "#e3eefb", i: "#1f4d80" },
  { c: "#2f6fb3", s: "#e3eefb", i: "#1f4d80" }, // 1 O Tobie – niebieski
  { c: "#2e9e62", s: "#e3f4ea", i: "#1d6b42" }, // 2 Na boisku – zielony
  { c: "#e07a2f", s: "#fdeede", i: "#a2501a" }, // 3 Twój cel – pomarańczowy
  { c: "#7b4fc0", s: "#efe8fa", i: "#563390" }, // 4 Sezon – fioletowy
  { c: "#1f9fae", s: "#dff3f5", i: "#136b75" }, // 5 Trening – morski
  { c: "#d9558a", s: "#fbe6ef", i: "#9c3463" }, // 6 Twój tydzień – różowy
];

export const GOAL_ICON: Record<SeasonGoal, string> = { speed: "⚡", strength: "💪", endurance: "🔋", return: "🔄" };
export const SEASON_ICON: Record<Season, string> = { preseason: "🌱", inseason: "⚽", offseason: "🌴" };
export const FEEL_ICON: Record<FeelNow, string> = { slow: "⚡", duels: "💪", stamina: "🔋", other: "➕" };
/** Kolor kropki przy pozycji (te same na boisku i na przyciskach). */
export const POSITION_COLOR: Record<Position, string> = { bramkarz: "#e0b23a", obronca: "#2f6fb3", pomocnik: "#2e9e62", skrzydlowy: "#e07a2f", napastnik: "#d9553f" };
