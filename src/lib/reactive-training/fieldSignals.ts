import type { ReactiveColor, ReactiveDirection } from "./types";

/** Fixed mapping for physical pitch targets; not an interpretation of arbitrary custom commands. */
export const FIELD_TARGETS: ReadonlyArray<{
  direction: ReactiveDirection;
  color: ReactiveColor;
  label: string;
  x: number;
  y: number;
}> = [
  { direction: "left", color: "blue", label: "Lewo", x: 20, y: 50 },
  { direction: "right", color: "green", label: "Prawo", x: 80, y: 50 },
  { direction: "forward", color: "yellow", label: "Przód", x: 50, y: 20 },
  { direction: "back", color: "red", label: "Tył", x: 50, y: 80 },
];
export const FIELD_COLORS: Record<ReactiveColor, string> = {
  blue: "#1877f2",
  green: "#16a34a",
  yellow: "#facc15",
  red: "#ef4444",
};
